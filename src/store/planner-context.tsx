import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import type { MarkerId } from "../constants";
import { dayKeyOf, parseDayKey } from "../time";
import { seedMonth, seedShowcaseDay } from "./seed";
import { EMPTY_DAY, type DayPlan, type RangeItem } from "./types";

type State = {
  byDay: Record<string, DayPlan>;
  /** Months already generated, as "YYYY-MM". */
  seeded: Record<string, true>;
  selectedDay: string;
  selectedRangeId: string | null;
  markerId: MarkerId;
};

type Action =
  | { type: "selectDay"; key: string }
  | { type: "ensureMonth"; year: number; month: number }
  | { type: "selectRange"; id: string | null }
  | { type: "setMarker"; markerId: MarkerId }
  | { type: "addRange"; range: RangeItem }
  | { type: "updateRange"; id: string; patch: Partial<RangeItem> }
  | { type: "deleteRange"; id: string };

function monthKey(year: number, month: number) {
  return `${year}-${month}`;
}

function init(): State {
  const today = dayKeyOf(new Date());
  const { year, month } = parseDayKey(today);
  const byDay = seedMonth(year, month);
  byDay[today] = seedShowcaseDay(today);

  return {
    byDay,
    seeded: { [monthKey(year, month)]: true },
    selectedDay: today,
    selectedRangeId: null,
    markerId: "yellow",
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
      return { ...state, selectedDay: action.key, selectedRangeId: null };

    case "ensureMonth": {
      const mk = monthKey(action.year, action.month);
      if (state.seeded[mk]) return state;
      return {
        ...state,
        // Existing days win — a month is only ever seeded into the gaps.
        byDay: { ...seedMonth(action.year, action.month), ...state.byDay },
        seeded: { ...state.seeded, [mk]: true },
      };
    }

    case "selectRange":
      return { ...state, selectedRangeId: action.id };

    case "setMarker": {
      const next = { ...state, markerId: action.markerId };
      if (!state.selectedRangeId) return next;
      // Recolour whatever is selected, matching the reference behaviour.
      return withDay(next, state.selectedDay, (d) => ({
        ...d,
        ranges: d.ranges.map((r) =>
          r.id === state.selectedRangeId ? { ...r, markerId: action.markerId } : r
        ),
      }));
    }

    case "addRange":
      return {
        ...withDay(state, state.selectedDay, (d) => ({
          ...d,
          ranges: [...d.ranges, action.range],
        })),
        selectedRangeId: action.range.id,
      };

    case "updateRange":
      return withDay(state, state.selectedDay, (d) => ({
        ...d,
        ranges: d.ranges.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r
        ),
      }));

    case "deleteRange": {
      const next = withDay(state, state.selectedDay, (d) => ({
        ...d,
        ranges: d.ranges.filter((r) => r.id !== action.id),
      }));
      return {
        ...next,
        selectedRangeId:
          state.selectedRangeId === action.id ? null : state.selectedRangeId,
      };
    }

    default:
      return state;
  }
}

type Ctx = State & {
  day: DayPlan;
  planFor: (key: string) => DayPlan;
  selectDay: (key: string) => void;
  ensureMonth: (year: number, month: number) => void;
  selectRange: (id: string | null) => void;
  setMarker: (markerId: MarkerId) => void;
  addRange: (range: RangeItem) => void;
  updateRange: (id: string, patch: Partial<RangeItem>) => void;
  deleteRange: (id: string) => void;
};

const PlannerContext = createContext<Ctx | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  const planFor = useCallback(
    (key: string) => state.byDay[key] ?? EMPTY_DAY,
    [state.byDay]
  );

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      day: state.byDay[state.selectedDay] ?? EMPTY_DAY,
      planFor,
      selectDay: (key) => dispatch({ type: "selectDay", key }),
      ensureMonth: (year, month) =>
        dispatch({ type: "ensureMonth", year, month }),
      selectRange: (id) => dispatch({ type: "selectRange", id }),
      setMarker: (markerId) => dispatch({ type: "setMarker", markerId }),
      addRange: (range) => dispatch({ type: "addRange", range }),
      updateRange: (id, patch) => dispatch({ type: "updateRange", id, patch }),
      deleteRange: (id) => dispatch({ type: "deleteRange", id }),
    }),
    [state, planFor]
  );

  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner(): Ctx {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>");
  return ctx;
}
