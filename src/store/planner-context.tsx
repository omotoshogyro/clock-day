import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import type { MarkerId } from "../constants";
import { dayKeyOf } from "../time";
import { DEFAULT_LEAD, load, save } from "./persist";
import { EMPTY_DAY, type DayPlan, type RangeItem } from "./types";

/** Long enough to absorb a sweep through the marker tray, short enough to be
 *  invisible. The AppState flush covers anything still pending. */
const SAVE_DEBOUNCE_MS = 400;

type State = {
  /** Only days that have something in them. An absent day is an empty day. */
  byDay: Record<string, DayPlan>;
  selectedDay: string;
  selectedRangeId: string | null;
  markerId: MarkerId;
  /** Minutes of warning before a range starts. Global, not per range. */
  leadMin: number;
  /**
   * The one range you can get back. A single tombstone rather than a stack:
   * the only thing that can reach undo is a transient toast, which shows
   * exactly one item, so any extra depth would be state nothing can retrieve.
   * `index` is load-bearing — array order is paint order *and* hit priority, so
   * restoring at the end would quietly move a band on top of its neighbour.
   */
  lastDeleted: { dayKey: string; index: number; range: RangeItem } | null;
};

// Writes carry the day they belong to rather than reading `selectedDay`. The
// editor can outlive a day change — you can draw a range, open the calendar,
// switch day and only then confirm — and a write that resolves the day at
// dispatch time lands on whichever day happens to be showing.
type Action =
  | { type: "selectDay"; key: string }
  | { type: "selectRange"; id: string | null }
  | { type: "setMarker"; markerId: MarkerId }
  | { type: "addRange"; dayKey: string; range: RangeItem }
  | { type: "updateRange"; dayKey: string; id: string; patch: Partial<RangeItem> }
  | { type: "deleteRange"; dayKey: string; id: string }
  | { type: "undoDelete" }
  | { type: "clearTombstone" }
  | { type: "setNotify"; dayKey: string; on: boolean }
  | { type: "setLeadMin"; min: number };

function init(): State {
  // Synchronous read, so there is no hydrate phase and no empty flash.
  const saved = load();
  return {
    byDay: saved?.byDay ?? {},
    // Always today, never restored: reopening the app should show now, not
    // wherever you happened to be browsing last week.
    selectedDay: dayKeyOf(new Date()),
    selectedRangeId: null,
    markerId: "yellow",
    leadMin: saved?.leadMin ?? DEFAULT_LEAD,
    lastDeleted: null,
  };
}

function withDay(
  state: State,
  key: string,
  fn: (day: DayPlan) => DayPlan
): State {
  const current = state.byDay[key] ?? EMPTY_DAY;
  return { ...state, byDay: { ...state.byDay, [key]: fn(current) } };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "selectDay":
      // The tombstone goes too: "Deleted 'Lunch'" is nonsense once you are
      // looking at another day.
      return {
        ...state,
        selectedDay: action.key,
        selectedRangeId: null,
        lastDeleted: null,
      };

    case "selectRange":
      // Bailing out on a no-op lets callers dispatch unconditionally instead of
      // reading the current selection, which keeps them off the state context.
      return state.selectedRangeId === action.id
        ? state
        : { ...state, selectedRangeId: action.id };

    case "setMarker": {
      const next = { ...state, markerId: action.markerId };
      if (!state.selectedRangeId) return next;
      // Recolour whatever is selected, matching the reference behaviour. No
      // dayKey needed: a selection only ever exists on the selected day.
      return withDay(next, state.selectedDay, (d) => ({
        ...d,
        ranges: d.ranges.map((r) =>
          r.id === state.selectedRangeId ? { ...r, markerId: action.markerId } : r
        ),
      }));
    }

    case "addRange":
      return {
        ...withDay(state, action.dayKey, (d) => ({
          ...d,
          ranges: [...d.ranges, action.range],
        })),
        // Selecting a range on a day you cannot see would leave the selection
        // pointing at nothing.
        selectedRangeId:
          action.dayKey === state.selectedDay
            ? action.range.id
            : state.selectedRangeId,
      };

    case "updateRange":
      return withDay(state, action.dayKey, (d) => ({
        ...d,
        ranges: d.ranges.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r
        ),
      }));

    case "deleteRange": {
      const from = state.byDay[action.dayKey] ?? EMPTY_DAY;
      const index = from.ranges.findIndex((r) => r.id === action.id);
      if (index === -1) return state;

      const next = withDay(state, action.dayKey, (d) => ({
        ...d,
        ranges: d.ranges.filter((r) => r.id !== action.id),
      }));
      return {
        ...next,
        selectedRangeId:
          action.dayKey === state.selectedDay &&
          state.selectedRangeId === action.id
            ? null
            : state.selectedRangeId,
        lastDeleted: {
          dayKey: action.dayKey,
          index,
          range: from.ranges[index],
        },
      };
    }

    case "undoDelete": {
      const t = state.lastDeleted;
      if (!t) return state;
      const next = withDay(state, t.dayKey, (d) => {
        const ranges = [...d.ranges];
        // Back where it was, so its z-order — and with it which touches reach
        // it — is the same as before the delete.
        ranges.splice(Math.min(t.index, ranges.length), 0, t.range);
        return { ...d, ranges };
      });
      return {
        ...next,
        lastDeleted: null,
        selectedRangeId:
          t.dayKey === state.selectedDay ? t.range.id : state.selectedRangeId,
      };
    }

    case "clearTombstone":
      return state.lastDeleted === null ? state : { ...state, lastDeleted: null };

    case "setNotify":
      return withDay(state, action.dayKey, (d) => {
        // Back to the default deletes the key rather than storing `true`, so an
        // untouched day never materialises a record just by being looked at.
        if (action.on) {
          const { notify: _drop, ...rest } = d;
          return rest;
        }
        return { ...d, notify: false };
      });

    case "setLeadMin":
      return state.leadMin === action.min
        ? state
        : { ...state, leadMin: action.min };

    default:
      return state;
  }
}

/**
 * Writers only. Split from the state below because every one of these closes
 * over nothing but `dispatch`, so this object can be built once and never
 * change identity — which is what keeps the screen's gesture callbacks stable,
 * and with them the single Pan they feed.
 */
type Actions = {
  selectDay: (key: string) => void;
  selectRange: (id: string | null) => void;
  setMarker: (markerId: MarkerId) => void;
  addRange: (dayKey: string, range: RangeItem) => void;
  updateRange: (dayKey: string, id: string, patch: Partial<RangeItem>) => void;
  deleteRange: (dayKey: string, id: string) => void;
  undoDelete: () => void;
  clearTombstone: () => void;
  setNotify: (dayKey: string, on: boolean) => void;
  setLeadMin: (min: number) => void;
};

type PlannerState = State & {
  day: DayPlan;
  planFor: (key: string) => DayPlan;
};

const ActionsContext = createContext<Actions | null>(null);
const StateContext = createContext<PlannerState | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  // Saving lives in an effect, never in the reducer: the reducer has to stay
  // pure (React double-invokes it in dev, which would double every write) and a
  // storage failure must not be able to turn a dispatch into a crash mid-drag.
  const snapRef = useRef({ byDay: state.byDay, leadMin: state.leadMin });
  snapRef.current = { byDay: state.byDay, leadMin: state.leadMin };
  const savedOnce = useRef(false);

  useEffect(() => {
    // The first run is the state we just loaded; rewriting it would be a
    // pointless disk hit on every launch.
    if (!savedOnce.current) {
      savedOnce.current = true;
      return;
    }
    const t = setTimeout(() => save(snapRef.current), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.byDay, state.leadMin]);

  // A debounce plus a home-swipe a fraction of a second after the last edit
  // loses that edit. Flush on the way out instead of hoping.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") save(snapRef.current);
    });
    return () => sub.remove();
  }, []);

  const planFor = useCallback(
    (key: string) => state.byDay[key] ?? EMPTY_DAY,
    [state.byDay]
  );

  // `dispatch` is stable for the life of the provider, so an empty dep list is
  // correct and this object is built exactly once.
  const actions = useMemo<Actions>(
    () => ({
      selectDay: (key) => dispatch({ type: "selectDay", key }),
      selectRange: (id) => dispatch({ type: "selectRange", id }),
      setMarker: (markerId) => dispatch({ type: "setMarker", markerId }),
      addRange: (dayKey, range) =>
        dispatch({ type: "addRange", dayKey, range }),
      updateRange: (dayKey, id, patch) =>
        dispatch({ type: "updateRange", dayKey, id, patch }),
      deleteRange: (dayKey, id) =>
        dispatch({ type: "deleteRange", dayKey, id }),
      undoDelete: () => dispatch({ type: "undoDelete" }),
      clearTombstone: () => dispatch({ type: "clearTombstone" }),
      setNotify: (dayKey, on) => dispatch({ type: "setNotify", dayKey, on }),
      setLeadMin: (min) => dispatch({ type: "setLeadMin", min }),
    }),
    []
  );

  const value = useMemo<PlannerState>(
    () => ({
      ...state,
      day: state.byDay[state.selectedDay] ?? EMPTY_DAY,
      planFor,
    }),
    [state, planFor]
  );

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={value}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

export function usePlannerActions(): Actions {
  const ctx = useContext(ActionsContext);
  if (!ctx)
    throw new Error("usePlannerActions must be used inside <PlannerProvider>");
  return ctx;
}

export function usePlannerState(): PlannerState {
  const ctx = useContext(StateContext);
  if (!ctx)
    throw new Error("usePlannerState must be used inside <PlannerProvider>");
  return ctx;
}
