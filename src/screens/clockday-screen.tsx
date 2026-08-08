import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { ClockCanvas } from "../clock/clock-canvas";
import { useDialFonts } from "../clock/fonts";
import { useNow } from "../clock/use-now";
import {
  hClamp,
  hDelete,
  hDrawn,
  hGrab,
  hRoll,
  hUndo,
  useDragHaptics,
} from "../haptics";
import {
  CANVAS,
  GRAB_R,
  SCREEN_W,
  KB_LIFT_FACTOR,
  KB_LIFT_MAX,
  KB_SCALE_MIN,
  MARKER_BY_ID,
  QUICK,
  type MarkerId,
} from "../constants";
import {
  angleAtPoint,
  degToMin,
  deltaDeg,
  distToMinute,
  hitTrack,
  minutesPerPx,
  rangeNear,
  topmostAt,
} from "../geometry";
import {
  usePlannerActions,
  usePlannerState,
} from "../store/planner-context";
import { useTheme } from "../theme";
import {
  MIN_PER_DAY,
  SNAP,
  formatDuration,
  formatRangeDetail,
  normMin,
  plannedMinutes,
  ringOf,
  snapMin,
  sweepMin,
} from "../time";
import { SettingsSheet } from "../ui/settings-sheet";
import { CalendarPanel } from "../ui/calendar-panel";
import { DayHeader } from "../ui/day-header";
import { LabelBar } from "../ui/label-bar";
import { MarkerTray } from "../ui/marker-tray";
import { UndoToast } from "../ui/undo-toast";

// Drag modes, kept as numbers so they live comfortably in a shared value.
const IDLE = 0;
const CREATE = 1;
const RESIZE_START = 2;
const RESIZE_END = 3;
const SELECT = 4;
const DESELECT = 5;
/** Pressed a handle — resize or tap is not decided yet. See onUpdate. */
const MAYBE_RESIZE = 6;
/** Dragging the whole selected range; the sweep is fixed, the start follows. */
const MOVE = 7;
/** Pressed the body of the selected range — move or tap is not decided yet. */
const MAYBE_MOVE = 8;

const MIN_SWEEP = SNAP; // a range is never shorter than one snap step

/**
 * Travel that turns a press on a handle into a resize. `.minDistance(0)` means
 * onUpdate fires on a pixel of jitter, so this has to be comfortably above the
 * noise floor; 8 is roughly iOS's own touch slop.
 */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 300;
/** Minimum spacing between AM/PM roll haptics — see the note at the call site. */
const ROLL_GAP_MS = 250;

// Continuous drag haptics. All first drafts — these want tuning on a real
// device, which is the only place they can be judged at all.
/** Finger speed (px/s) treated as full intensity. */
const DRAG_V_MAX = 1200;
/** Below this fraction of DRAG_V_MAX the bed is silent, not merely faint. */
const V_DEAD = 0.02;
const AMP_FLOOR = 0.06;
/** Kept well under TICK_AMP so a snap reads as an event above the bed, not a
 *  peak within it. */
const AMP_TOP = 0.3;
const FREQ_MIN = 0.25;
const FREQ_MAX = 0.75;
const TICK_AMP = 0.55;
const TICK_FREQ = 0.5;

/**
 * Fire `hClamp` once when a resize starts pushing past a limit, and arm it
 * again only once the finger comes properly back inside.
 *
 * Declared above its caller for the worklets transform. The hysteresis is
 * load-bearing: a finger held at the limit makes `rounded` oscillate across it
 * every few pixels, so a bare "outside now, inside last frame" test chatters.
 * Releasing only a full SNAP step back inside costs nothing and makes the bump
 * feel like a wall rather than a rattle.
 */
function clampEdge(
  rounded: number,
  floor: number,
  state: SharedValue<number>
): void {
  "worklet";
  const ceil = MIN_PER_DAY - SNAP;
  const hit =
    rounded < floor || rounded > ceil
      ? 1
      : rounded >= floor + SNAP && rounded <= ceil - SNAP
        ? 0
        : state.value;
  if (hit === 1 && state.value === 0) hClamp();
  state.value = hit;
}
/** Half a short range's label overhang — see `rangeNear`. */
const TAP_PAD_PX = 14;

/**
 * A range that has been drawn but not yet committed to the store. It carries
 * the day it was drawn on, because the calendar can move the selection while
 * the name is still open.
 */
type DraftRange = {
  dayKey: string;
  startMin: number;
  endMin: number;
  markerId: MarkerId;
};

/** The range whose name is open, and the day it lives on. Same reason. */
type Editing = { id: string; dayKey: string };

export function ClockdayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const fonts = useDialFonts();
  const now = useNow(reduceMotion);
  const drag = useDragHaptics();
  const { day, selectedDay, selectedRangeId, markerId, lastDeleted } =
    usePlannerState();
  const {
    selectRange,
    setMarker,
    addRange,
    updateRange,
    deleteRange,
    undoDelete,
    clearTombstone,
  } = usePlannerActions();

  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Set only while a freshly drawn range is waiting for a name. */
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null);
  /** Set only while an existing range has its name open for editing. */
  const [editing, setEditing] = useState<Editing | null>(null);
  const [title, setTitle] = useState("");
  const [kbVisible, setKbVisible] = useState(false);
  /** Id of the range under the finger, drawn by the draft instead of RangeArcs. */
  const [liveDragId, setLiveDragId] = useState<string | null>(null);

  // Gesture callbacks are dependencies of the Pan, and the Pan must not be
  // rebuilt mid-session — a re-attached handler is what makes pans
  // phantom-fire. So anything the callbacks need to *read* but that changes
  // often (a keystroke, an open editor) is mirrored into a ref instead.
  const titleRef = useRef("");
  const editingRef = useRef<Editing | null>(null);
  const draftRangeRef = useRef<DraftRange | null>(null);
  const lastTapRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });
  // Store reads the callbacks need. Mirrored for the same reason as the above:
  // reading them from the context directly would put the context's identity in
  // the callbacks' deps, and it changes on every dispatch.
  const selectedDayRef = useRef(selectedDay);
  const rangesRef = useRef(day.ranges);
  const markerIdRef = useRef(markerId);

  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);
  useEffect(() => {
    selectedDayRef.current = selectedDay;
  }, [selectedDay]);
  useEffect(() => {
    markerIdRef.current = markerId;
  }, [markerId]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () =>
      setKbVisible(true)
    );
    const hide = Keyboard.addListener("keyboardWillHide", () =>
      setKbVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // ---- UI-thread drivers ----
  const mode = useSharedValue(IDLE);
  const draftActive = useSharedValue(0);
  const draftStartMin = useSharedValue(0);
  const draftSweepMin = useSharedValue(0);
  /** 1 only while a move is in flight — a draft being *drawn* has no name yet. */
  const draftLabelOn = useSharedValue(0);
  /** 1 only while the finger is driving the draft; see the note on Draft.live. */
  const draftLive = useSharedValue(0);
  const ringActive = useSharedValue(0);
  const readout = useSharedValue("");
  const readoutOn = useSharedValue(0);
  const kbHeight = useSharedValue(0);

  const lastAngle = useSharedValue(0);
  const accumDeg = useSharedValue(0);
  const baseStart = useSharedValue(0);
  const baseSweep = useSharedValue(0);
  const lastTickMin = useSharedValue(-1);
  /** Ring under the finger last frame; -1 until the first frame sets a baseline. */
  const lastRing = useSharedValue(-1);
  const lastRollAt = useSharedValue(0);
  /** 1 while the sweep is pinned at a limit — edge-triggered, see onUpdate. */
  const atClamp = useSharedValue(0);
  /** Last bed amplitude sent, quantised, so a 120Hz drag isn't 120 calls/s. */
  const lastAmp = useSharedValue(-1);
  const reduceMotionSV = useSharedValue(reduceMotion);
  const dragId = useSharedValue<string | null>(null);
  const beginX = useSharedValue(0);
  const beginY = useSharedValue(0);
  // Where the canvas sits inside the touch layer. The layer fills the stage so
  // that a tap in the blank space around the dial still reaches the pan, but
  // every hit test below is written in canvas coordinates — these close the gap.
  const offX = useSharedValue(Math.max(0, (SCREEN_W - CANVAS) / 2));
  const offY = useSharedValue(0);
  /** 0 until onLayout has run, so a pre-layout touch cannot be misplaced. */
  const laidOut = useSharedValue(0);
  /** Which end MAYBE_RESIZE promotes to. */
  const resizeSide = useSharedValue(RESIZE_START);
  /** What a MAYBE_RESIZE selects if it turns out to be a tap. */
  const tapId = useSharedValue<string | null>(null);

  // Mirrors of React state that the gesture worklet needs to read.
  const rangesSV = useSharedValue<
    { id: string; startMin: number; endMin: number }[]
  >([]);
  const selectedSV = useSharedValue<{
    id: string;
    startMin: number;
    endMin: number;
  } | null>(null);
  /**
   * True while a freshly drawn range waits for its name. The draft shared values
   * are holding *that* range, so nothing else may grab them until it commits.
   */
  const draftPendingSV = useSharedValue(false);

  const { ranges } = day;

  const selectedRange = useMemo(
    () => ranges.find((r) => r.id === selectedRangeId) ?? null,
    [ranges, selectedRangeId]
  );

  useEffect(() => {
    rangesRef.current = ranges;
    rangesSV.value = ranges.map((r) => ({
      id: r.id,
      startMin: r.startMin,
      endMin: r.endMin,
    }));
    const sel = ranges.find((r) => r.id === selectedRangeId);
    selectedSV.value = sel
      ? { id: sel.id, startMin: sel.startMin, endMin: sel.endMin }
      : null;
  }, [ranges, selectedRangeId, rangesSV, selectedSV]);

  useEffect(() => {
    draftPendingSV.value = draftRange !== null;
  }, [draftRange, draftPendingSV]);

  useKeyboardHandler(
    {
      onMove: (e) => {
        "worklet";
        kbHeight.value = e.height;
      },
      onEnd: (e) => {
        "worklet";
        kbHeight.value = e.height;
      },
    },
    []
  );

  /**
   * The touch layer's untransformed box. `clockStyle`'s lift and scale must not
   * appear here: RNGH reports pre-transform coordinates, so the offset has to be
   * pre-transform too.
   */
  const onStageLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      offX.value = (width - CANVAS) / 2;
      offY.value = (height - CANVAS) / 2;
      laidOut.value = 1;
    },
    [offX, offY, laidOut]
  );

  // ---- Commit / discard ----

  const closeEditor = useCallback(() => {
    Keyboard.dismiss();
    setEditing(null);
    setDraftRange(null);
    setTitle("");
    draftActive.value = 0;
    selectRange(null);
  }, [draftActive, selectRange]);

  /**
   * Commit whatever the label bar currently holds, because the touch has moved
   * on to another range. Reads through refs — see the note on `titleRef`. The
   * keyboard is left alone: whether it should go depends on what the caller
   * opens next.
   */
  const commitOpen = useCallback(() => {
    const open = editingRef.current;
    const draft = draftRangeRef.current;
    if (!open && !draft) return;

    const name = titleRef.current.trim();
    if (open) {
      updateRange(open.dayKey, open.id, { title: name });
    } else if (draft) {
      addRange(draft.dayKey, {
        id: `${draft.dayKey}-${Date.now()}`,
        startMin: draft.startMin,
        endMin: draft.endMin,
        title: name,
        markerId: draft.markerId,
      });
    }
    setEditing(null);
    setDraftRange(null);
    setTitle("");
    draftActive.value = 0;
  }, [updateRange, addRange, draftActive]);

  useEffect(() => {
    reduceMotionSV.value = reduceMotion;
  }, [reduceMotion, reduceMotionSV]);

  // ---- JS-thread callbacks invoked from the gesture ----

  /**
   * A tap on a band. One tap selects — handles out, pens live, no keyboard.
   * Two taps on the same band inside DOUBLE_TAP_MS open the name.
   *
   * Invariants:
   *  - `at` is a UI-thread `performance.now()`, so the window measures
   *    finger-lift to finger-lift and a stalled JS thread cannot fake a pair.
   *  - a match consumes the pair, so a triple tap reads select / edit / select.
   *  - every touch that ends *without* a tap resets the pair (see `onCreated`,
   *    `onDragCommit`, `onDeselect`) — otherwise "tap, drag, tap" would read
   *    as a double tap.
   */
  const onPickRange = useCallback(
    (id: string, at: number) => {
      // Tapping away from an open name commits it rather than dropping it.
      const openId = editingRef.current?.id ?? null;
      const closed =
        openId !== id && (openId !== null || draftRangeRef.current !== null);
      if (closed) commitOpen();

      const prev = lastTapRef.current;
      const isDouble = prev.id === id && at - prev.at < DOUBLE_TAP_MS;
      lastTapRef.current = isDouble ? { id: "", at: 0 } : { id, at };

      selectRange(id);

      if (isDouble) {
        const r = rangesRef.current.find((x) => x.id === id);
        if (r) {
          setTitle(r.title);
          setEditing({ id, dayKey: selectedDayRef.current });
        }
      } else if (closed) {
        // Selection alone never shows a keyboard.
        Keyboard.dismiss();
      }
    },
    [selectRange, commitOpen]
  );

  const onCreated = useCallback(
    (startMin: number, endMin: number) => {
      lastTapRef.current = { id: "", at: 0 };
      hDrawn();
      commitOpen();
      setTitle("");
      setDraftRange({
        dayKey: selectedDayRef.current,
        startMin,
        endMin,
        markerId: markerIdRef.current,
      });
    },
    [commitOpen]
  );

  /** Commit new geometry after a resize or a move — the two differ only in how
   *  the draft got where it is. A drag cannot outlive a day change. */
  const onDragCommit = useCallback(
    (id: string, startMin: number, endMin: number) => {
      lastTapRef.current = { id: "", at: 0 };
      updateRange(selectedDayRef.current, id, { startMin, endMin });
      setLiveDragId(null);
    },
    [updateRange]
  );

  // Picking a colour retints whatever is selected — the reducer does that for a
  // committed range — and becomes the default for the next range drawn.
  const pickMarker = useCallback(
    (next: MarkerId) => {
      setMarker(next);
      setDraftRange((d) => (d ? { ...d, markerId: next } : d));
    },
    [setMarker]
  );

  const onDeselect = useCallback(() => {
    lastTapRef.current = { id: "", at: 0 };
    // A tap on the face while a freshly drawn range is being named must not
    // throw it away — that is still the only protection an uncommitted range
    // has.
    if (draftRangeRef.current) return;
    if (editingRef.current) {
      // Tapping away saves, exactly as tapping another range does. The blank
      // area is most of the screen now; it must not quietly eat what you typed.
      commitOpen();
      closeEditor();
      return;
    }
    // The reducer bails out when nothing is selected, so this needs no read.
    selectRange(null);
  }, [selectRange, closeEditor, commitOpen]);

  // ---- The single pan ----
  // One detector for the whole dial: stacking a Pan per arc is what makes
  // layered handlers phantom-fire, so every mode is resolved in onBegin
  // instead.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => {
          "worklet";
          mode.value = IDLE;
          lastTickMin.value = -1;
          lastRing.value = -1;
          atClamp.value = 0;
          lastAmp.value = -1;
          draftLive.value = 0;
          // Kept in raw layer space, unlike x/y below: these only ever feed the
          // TAP_SLOP delta in onUpdate, and a delta that never leaves layer
          // space cannot be faked by a re-measure between the two handlers.
          beginX.value = e.x;
          beginY.value = e.y;

          // e.x/e.y are local to the touch layer, which spans the whole stage.
          // The dial's geometry is written in canvas coordinates (CX/CY), so one
          // subtraction here keeps every hit test below in the space it expects.
          const x = e.x - offX.value;
          const y = e.y - offY.value;

          // Before the first layout the offsets are unknown, so nothing can be
          // hit — which resolves to DESELECT, the inert outcome.
          const hit = laidOut.value ? hitTrack(x, y) : null;
          if (!hit) {
            mode.value = DESELECT;
            return;
          }

          // Which arc is under the finger. Resolved before the handle test,
          // because a press on a handle needs to know what a *tap* would pick.
          let arcId = topmostAt(rangesSV.value, hit.min);

          const sel = selectedSV.value;

          // A short range's label is wider than its arc, so part of what you
          // can see sits outside the range in minutes. Rescue those taps — but
          // only for the selected range, so this can never steal a tap that
          // would otherwise draw in an empty gap.
          if (
            arcId === null &&
            sel &&
            rangeNear(
              sel.startMin,
              sel.endMin,
              hit.min,
              TAP_PAD_PX * minutesPerPx(hit.ring)
            )
          ) {
            arcId = sel.id;
          }

          // The draft shared values belong to a range that is still being named,
          // so neither a resize nor a move may borrow them. Fall through to a
          // plain selection instead.
          const busy = draftPendingSV.value;

          // 1. An end handle of the selected range — provisionally. Whether
          //    this is a resize or a tap is decided by movement in onUpdate,
          //    never here: on a short range every point of the arc is inside a
          //    handle's grab radius, so committing to a resize now would make
          //    a second tap impossible to observe.
          if (sel && !busy) {
            const sweep = sweepMin(sel.startMin, sel.endMin);
            const dStart = distToMinute(x, y, sel.startMin);
            const dEnd = distToMinute(x, y, sel.endMin);
            const dHandle = Math.min(dStart, dEnd);
            // On a range shorter than two grab radii every point sits inside a
            // handle, which would leave it unmovable. So split on whichever
            // anchor is nearest rather than on the grab radius alone: the ends
            // resize, the middle moves. On a long range the midpoint is far
            // away and this reads exactly as it did before.
            const dMid = distToMinute(x, y, normMin(sel.startMin + sweep / 2));
            if (dHandle < GRAB_R && dHandle <= dMid) {
              mode.value = MAYBE_RESIZE;
              resizeSide.value = dStart <= dEnd ? RESIZE_START : RESIZE_END;
              dragId.value = sel.id;
              tapId.value = arcId === null ? sel.id : arcId;
              baseStart.value = sel.startMin;
              baseSweep.value = sweep;
              accumDeg.value = 0;
              lastAngle.value = angleAtPoint(x, y);
              return;
            }

            // 2. The body of the selected range -> move the whole thing, on the
            //    same provisional terms as a handle. Only the selected range,
            //    because an unselected one draws no handles and no outline —
            //    dragging it would reschedule something you never took hold of.
            if (arcId === sel.id) {
              mode.value = MAYBE_MOVE;
              dragId.value = sel.id;
              tapId.value = sel.id;
              baseStart.value = sel.startMin;
              baseSweep.value = sweep;
              accumDeg.value = 0;
              lastAngle.value = angleAtPoint(x, y);
              return;
            }
          }

          // 3. An existing arc -> select it (acted on in onFinalize).
          if (arcId !== null) {
            mode.value = SELECT;
            dragId.value = arcId;
            return;
          }

          // 4. Empty track -> start drawing.
          mode.value = CREATE;
          dragId.value = null;
          const anchor = snapMin(hit.min);
          baseStart.value = anchor;
          baseSweep.value = 0;
          draftStartMin.value = anchor;
          draftSweepMin.value = 0;
          draftActive.value = 1;
          draftLive.value = 1;
          accumDeg.value = 0;
          lastAngle.value = angleAtPoint(x, y);
          readout.value = formatRangeDetail(anchor, anchor);
          readoutOn.value = withTiming(1, QUICK);
          ringActive.value = withTiming(1, QUICK);
        })
        .onUpdate((e) => {
          "worklet";
          // Same layer -> canvas shift as onBegin; see the note there.
          const x = e.x - offX.value;
          const y = e.y - offY.value;

          const pending = mode.value;
          if (pending === MAYBE_RESIZE || pending === MAYBE_MOVE) {
            // Raw layer space on both sides, matching beginX/beginY.
            const dx = e.x - beginX.value;
            const dy = e.y - beginY.value;
            if (dx * dx + dy * dy < TAP_SLOP * TAP_SLOP) return; // still a tap
            // Promote, and arm everything onBegin deliberately left alone.
            mode.value = pending === MAYBE_MOVE ? MOVE : resizeSide.value;
            draftStartMin.value = baseStart.value;
            draftSweepMin.value = baseSweep.value;
            draftActive.value = 1;
            draftLive.value = 1;
            accumDeg.value = 0;
            // Re-baseline where the slop broke rather than where the finger
            // landed, so the handle trails by 8px instead of jumping 8 minutes.
            lastAngle.value = angleAtPoint(x, y);
            ringActive.value = withTiming(1, QUICK);
            readoutOn.value = withTiming(1, QUICK);
            // A move carries the range's name with it — that name is the only
            // thing telling you which range you have hold of.
            if (pending === MAYBE_MOVE) draftLabelOn.value = 1;
            // The press has become a drag. Nothing else confirms you have hold
            // of the band before it starts moving.
            hGrab();
            scheduleOnRN(setLiveDragId, dragId.value);
            // ...and fall through into the angle math on this same frame.
          }

          // Read the mode *after* the promotion above. Only these four drag the
          // dial; SELECT and DESELECT have to stop here or they scrub the draft
          // (and the header readout) off stale base values.
          const m = mode.value;
          if (m !== CREATE && m !== MOVE && m !== RESIZE_START && m !== RESIZE_END) {
            return;
          }

          // A speed-driven bed under the whole drag: inching a band into place
          // should feel fine-grained where sweeping it across the dial feels
          // coarse. Quantised, because this runs every frame and each call is a
          // synchronous hop into the native composer.
          const speed = Math.sqrt(
            e.velocityX * e.velocityX + e.velocityY * e.velocityY
          );
          const v = Math.min(1, speed / DRAG_V_MAX);
          // A resting finger must be silent rather than humming, so the floor
          // below the deadband is a hard zero.
          const amp = v < V_DEAD ? 0 : AMP_FLOOR + (AMP_TOP - AMP_FLOOR) * v;
          const q = Math.round(amp * 50) / 50;
          if (q !== lastAmp.value) {
            lastAmp.value = q;
            // The third argument starts the player; without it this is silent.
            drag.set(q, FREQ_MIN + (FREQ_MAX - FREQ_MIN) * v, true);
          }

          // Unwrap the angle rather than re-reading the radius, so continuing
          // clockwise past 12 rolls onto the next track instead of snapping.
          const a = angleAtPoint(x, y);
          accumDeg.value += deltaDeg(a, lastAngle.value);
          lastAngle.value = a;
          const deltaMin = degToMin(accumDeg.value);

          if (m === MOVE) {
            // Snap the travel, never the start: that holds the duration exactly
            // and cannot nudge a start that was not on a snap boundary already.
            const step = Math.round(deltaMin / SNAP) * SNAP;
            draftStartMin.value = normMin(baseStart.value + step);
            draftSweepMin.value = baseSweep.value;
          } else if (m === RESIZE_START) {
            const rounded = Math.round((baseSweep.value - deltaMin) / SNAP) * SNAP;
            const sweep = Math.min(
              MIN_PER_DAY - SNAP,
              Math.max(MIN_SWEEP, rounded)
            );
            const end = normMin(baseStart.value + baseSweep.value);
            draftStartMin.value = normMin(end - sweep);
            draftSweepMin.value = sweep;
            clampEdge(rounded, MIN_SWEEP, atClamp);
          } else {
            const rounded =
              Math.round(
                ((m === CREATE ? 0 : baseSweep.value) + deltaMin) / SNAP
              ) * SNAP;
            const floor = m === CREATE ? 0 : MIN_SWEEP;
            draftSweepMin.value = Math.min(
              MIN_PER_DAY - SNAP,
              Math.max(floor, rounded)
            );
            draftStartMin.value = baseStart.value;
            clampEdge(rounded, floor, atClamp);
          }

          const end = normMin(draftStartMin.value + draftSweepMin.value);
          readout.value = formatRangeDetail(draftStartMin.value, end);
          if (end !== lastTickMin.value) {
            lastTickMin.value = end;
            // A transient over the bed rather than instead of it: the dial
            // snaps to 5 minutes, and a purely continuous texture cannot say
            // that. Both are methods on the same native composer.
            drag.tick(TICK_AMP, TICK_FREQ);
          }

          // Rolling between the AM and PM tracks is the app's most surprising
          // moment and the only one with no visual of its own, so it gets a
          // heavier haptic than the snap ticks it lands among.
          const edge = m === RESIZE_START ? draftStartMin.value : end;
          const ring = ringOf(edge);
          if (lastRing.value === -1) {
            lastRing.value = ring;
          } else if (ring !== lastRing.value) {
            lastRing.value = ring;
            // A finger resting on the boundary oscillates across it every few
            // pixels; without this gate that is a buzz-saw rather than a thump.
            const t = performance.now();
            if (t - lastRollAt.value > ROLL_GAP_MS) {
              lastRollAt.value = t;
              hRoll();
            }
          }
        })
        // Every side effect lands here rather than in onBegin: onFinalize needs
        // a complete touch cycle, so a handler that spuriously begins (which
        // layered/remounted pans do) cannot select or create anything.
        .onFinalize(() => {
          "worklet";
          // First line, before any early return: onFinalize also runs on FAILED
          // and CANCELLED, so this is the only place that guarantees an
          // interrupted gesture cannot leave the actuator running.
          drag.stop();
          const m = mode.value;
          mode.value = IDLE;
          draftLabelOn.value = 0;
          // The finger is up: whatever the draft still stands in for is settled.
          draftLive.value = 0;
          if (m === IDLE) return;
          ringActive.value = withTiming(0, QUICK);

          // Never promoted, so the finger never travelled: it was a tap.
          if (m === MAYBE_RESIZE || m === MAYBE_MOVE) {
            const id = tapId.value;
            if (id) scheduleOnRN(onPickRange, id, performance.now());
            return;
          }
          if (m === SELECT) {
            const id = dragId.value;
            if (id) scheduleOnRN(onPickRange, id, performance.now());
            return;
          }
          if (m === DESELECT) {
            scheduleOnRN(onDeselect);
            return;
          }

          const start = draftStartMin.value;
          const end = normMin(start + Math.max(MIN_SWEEP, draftSweepMin.value));
          draftSweepMin.value = Math.max(MIN_SWEEP, draftSweepMin.value);

          if (m === CREATE) {
            scheduleOnRN(onCreated, start, end);
          } else {
            draftActive.value = 0;
            const id = dragId.value;
            if (id) scheduleOnRN(onDragCommit, id, start, end);
          }
        }),
    [
      accumDeg,
      atClamp,
      baseStart,
      baseSweep,
      drag,
      lastAmp,
      beginX,
      beginY,
      dragId,
      draftActive,
      draftLabelOn,
      draftLive,
      draftPendingSV,
      draftStartMin,
      draftSweepMin,
      laidOut,
      lastAngle,
      lastTickMin,
      mode,
      offX,
      offY,
      onCreated,
      onDeselect,
      onDragCommit,
      onPickRange,
      rangesSV,
      readout,
      readoutOn,
      resizeSide,
      ringActive,
      lastRing,
      lastRollAt,
      selectedSV,
      tapId,
    ]
  );


  const confirm = useCallback(() => {
    const name = title.trim();
    if (editing) {
      // Geometry was already committed by onDragCommit; writing it back from a
      // snapshot taken when the name opened is the only way left to lose it.
      updateRange(editing.dayKey, editing.id, { title: name });
    } else if (draftRange) {
      addRange(draftRange.dayKey, {
        id: `${draftRange.dayKey}-${Date.now()}`,
        startMin: draftRange.startMin,
        endMin: draftRange.endMin,
        title: name,
        markerId: draftRange.markerId,
      });
    } else {
      return;
    }
    closeEditor();
  }, [editing, draftRange, title, updateRange, addRange, closeEditor]);

  const remove = useCallback(() => {
    if (editing) {
      hDelete();
      deleteRange(editing.dayKey, editing.id);
    }
    closeEditor();
  }, [editing, deleteRange, closeEditor]);

  /** The tray's trash: delete the selection outright, no editor involved. */
  const removeSelected = useCallback(() => {
    if (!selectedRangeId) return;
    hDelete();
    deleteRange(selectedDay, selectedRangeId);
  }, [selectedRangeId, selectedDay, deleteRange]);

  // Changing the day while a name is open would leave the bar pointing at a
  // range you can no longer see. The write itself is already safe — it carries
  // its own day — so this is only about tidying the UI.
  const prevDayRef = useRef(selectedDay);
  useEffect(() => {
    if (prevDayRef.current === selectedDay) return;
    prevDayRef.current = selectedDay;
    if (draftRangeRef.current || editingRef.current) {
      commitOpen();
      closeEditor();
    }
  }, [selectedDay, commitOpen, closeEditor]);

  // The readout stands in for the date whenever there is a range in hand —
  // drawn, selected, or being resized — and steps aside when there isn't.
  useEffect(() => {
    const src = draftRange ?? selectedRange;
    if (!src) {
      readoutOn.value = withTiming(0, QUICK);
      return;
    }
    readout.value = formatRangeDetail(src.startMin, src.endMin);
    readoutOn.value = withTiming(1, QUICK);
  }, [draftRange, selectedRange, readout, readoutOn]);

  // A committed range is already drawn (with its label) by RangeArcs, so the
  // draft only ever stands in for one that does not exist yet.
  useEffect(() => {
    if (!draftRange) return;
    draftStartMin.value = draftRange.startMin;
    draftSweepMin.value = sweepMin(draftRange.startMin, draftRange.endMin);
    draftActive.value = 1;
  }, [draftRange, draftStartMin, draftSweepMin, draftActive]);

  // ---- Layout ----

  // A continuous mapping of keyboard height, not an animation, so Reanimated's
  // reduce-motion path never sees it and it has to ask. The lift stays either
  // way — it is a layout accommodation, and dropping it would put the dial
  // behind the keyboard. The shrink is the part that reads as motion.
  const clockStyle = useAnimatedStyle(() => {
    const lift = Math.min(kbHeight.value * KB_LIFT_FACTOR, KB_LIFT_MAX);
    const t = lift / KB_LIFT_MAX;
    const scale = reduceMotionSV.value ? 1 : 1 - (1 - KB_SCALE_MIN) * t;
    return {
      transform: [{ translateY: -lift }, { scale }],
    };
  });

  const naming = draftRange !== null || editing !== null;
  const activeMarkerId =
    draftRange?.markerId ?? selectedRange?.markerId ?? markerId;
  const activeMarker = MARKER_BY_ID[activeMarkerId];
  // Without this the committed arc renders under the live draft for the whole
  // drag.
  const hiddenId = liveDragId;

  // Measured once per title rather than per frame: the pill only has to follow
  // the range's midpoint, and that is pure geometry the UI thread can do.
  const draftLabel = useMemo(() => {
    const text = selectedRange?.title;
    if (!text) return null;
    const box = fonts.mini.measureText(text);
    return {
      text,
      w: box.width + 16,
      tx: -box.width / 2 - box.x,
      ty: -(box.y + box.height / 2),
    };
  }, [selectedRange?.title, fonts]);

  // Overlapping bands must not double-count, or the number lies on exactly the
  // days where it would be most misleading.
  const planned = useMemo(() => plannedMinutes(ranges), [ranges]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />

      <View style={{ paddingTop: insets.top + 6 }}>
        <DayHeader
          dayKey={selectedDay}
          expanded={calendarOpen}
          onToggleCalendar={() => setCalendarOpen((v) => !v)}
          onMore={() => {
            setCalendarOpen(false);
            sheetRef.current?.present();
          }}
          readout={readout}
          readoutOn={readoutOn}
        />
      </View>

      <View style={styles.stage}>
        <Animated.View style={[styles.clockLayer, clockStyle]}>
          <GestureDetector gesture={pan}>
            <View
              style={styles.canvasWrap}
              collapsable={false}
              onLayout={onStageLayout}
            >
              <ClockCanvas
                theme={theme}
                fonts={fonts}
                now={now}
                ranges={ranges}
                selectedId={selectedRangeId}
                hiddenId={hiddenId}
                draft={{
                  active: draftActive,
                  live: draftLive,
                  startMin: draftStartMin,
                  sweepMin: draftSweepMin,
                  labelOn: draftLabelOn,
                }}
                draftFill={activeMarker.fill}
                draftEdge={activeMarker.edge}
                draftLabel={draftLabel}
                draftInk={activeMarker.labelInk}
                ringActive={ringActive}
                showHint={ranges.length === 0 && !naming && !calendarOpen}
              />
            </View>
          </GestureDetector>
        </Animated.View>
      </View>

      {/* The tray stays available while a range is selected — that is the only
          way to recolour it — but folds away once the keyboard takes the room. */}
      {!kbVisible && (
        <View style={{ paddingBottom: naming ? 0 : insets.bottom + 4 }}>
          {/* One line of quiet copy: how much of the day is spoken for, or —
              on an empty day — how to start. */}
          <Text
            style={[styles.slot, { color: theme.subtle }]}
            numberOfLines={1}
          >
            {ranges.length === 0
              ? "Drag along a dotted ring to paint time · outer ring is PM"
              : `${formatDuration(planned)} planned`}
          </Text>
          <MarkerTray
            selected={activeMarkerId}
            onSelect={pickMarker}
            onDelete={
              selectedRangeId && !naming ? removeSelected : undefined
            }
          />
        </View>
      )}

      {naming && (
        <LabelBar
          title={title}
          onChangeTitle={setTitle}
          onDelete={remove}
          onConfirm={confirm}
          onCollapse={() => Keyboard.dismiss()}
          kbHeight={kbHeight}
          bottomInset={insets.bottom}
        />
      )}

      {/* After the label bar: both live at the bottom edge, and among absolutely
          positioned siblings tree order is z-order. They cannot coexist today —
          deleting closes the editor — but if that changes the toast should win. */}
      {lastDeleted && (
        <UndoToast
          title={lastDeleted.range.title}
          onUndo={undoDelete}
          onExpire={clearTombstone}
          theme={theme}
        />
      )}

      {calendarOpen && (
        <CalendarPanel
          onClose={() => setCalendarOpen(false)}
          theme={theme}
          fonts={fonts}
          now={now}
        />
      )}

      <SettingsSheet sheetRef={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  slot: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  // The stage centres nothing any more: its whole area is the touch layer, and
  // the layer centres the canvas itself. `alignItems: "center"` here would
  // shrink-wrap the flex:1 layer to zero width.
  stage: { flex: 1 },
  // Both of these must fill the stage, not just the innermost one — hit testing
  // is clipped by every ancestor's bounds, so a wide wrapper inside a
  // canvas-sized parent would render but receive nothing outside the square.
  clockLayer: { flex: 1 },
  canvasWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
