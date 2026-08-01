import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { ClockCanvas } from "../clock/clock-canvas";
import { useDialFonts } from "../clock/fonts";
import { useNow } from "../clock/use-now";
import {
  CANVAS,
  GRAB_R,
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
  rangeContains,
  rangeNear,
} from "../geometry";
import { usePlanner } from "../store/planner-context";
import { useTheme } from "../theme";
import {
  MIN_PER_DAY,
  SNAP,
  formatRange,
  normMin,
  snapMin,
  sweepMin,
} from "../time";
import { AppearanceSheet } from "../ui/appearance-sheet";
import { CalendarPanel } from "../ui/calendar-panel";
import { DayHeader } from "../ui/day-header";
import { LabelBar } from "../ui/label-bar";
import { MarkerTray } from "../ui/marker-tray";

// Drag modes, kept as numbers so they live comfortably in a shared value.
const IDLE = 0;
const CREATE = 1;
const RESIZE_START = 2;
const RESIZE_END = 3;
const SELECT = 4;
const DESELECT = 5;
/** Pressed a handle — resize or tap is not decided yet. See onUpdate. */
const MAYBE_RESIZE = 6;

const MIN_SWEEP = SNAP; // a range is never shorter than one snap step

/**
 * Travel that turns a press on a handle into a resize. `.minDistance(0)` means
 * onUpdate fires on a pixel of jitter, so this has to be comfortably above the
 * noise floor; 8 is roughly iOS's own touch slop.
 */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 300;
/** Half a short range's label overhang — see `rangeNear`. */
const TAP_PAD_PX = 14;

/** A range that has been drawn but not yet committed to the store. */
type DraftRange = {
  startMin: number;
  endMin: number;
  markerId: MarkerId;
};

export function ClockdayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const fonts = useDialFonts();
  const now = useNow(reduceMotion);
  const planner = usePlanner();

  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Set only while a freshly drawn range is waiting for a name. */
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null);
  /** Set only while an existing range has its name open for editing. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kbVisible, setKbVisible] = useState(false);
  /** True only while an end handle is under the finger. */
  const [resizing, setResizing] = useState(false);

  // Gesture callbacks are dependencies of the Pan, and the Pan must not be
  // rebuilt mid-session — a re-attached handler is what makes pans
  // phantom-fire. So anything the callbacks need to *read* but that changes
  // often (a keystroke, an open editor) is mirrored into a ref instead.
  const titleRef = useRef("");
  const editingIdRef = useRef<string | null>(null);
  const draftRangeRef = useRef<DraftRange | null>(null);
  const lastTapRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });

  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);
  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

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
  const ringActive = useSharedValue(0);
  const readout = useSharedValue("");
  const readoutOn = useSharedValue(0);
  const kbHeight = useSharedValue(0);

  const lastAngle = useSharedValue(0);
  const accumDeg = useSharedValue(0);
  const baseStart = useSharedValue(0);
  const baseSweep = useSharedValue(0);
  const lastTickMin = useSharedValue(-1);
  const dragId = useSharedValue<string | null>(null);
  const beginX = useSharedValue(0);
  const beginY = useSharedValue(0);
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

  const { ranges } = planner.day;

  const selectedRange = useMemo(
    () => ranges.find((r) => r.id === planner.selectedRangeId) ?? null,
    [ranges, planner.selectedRangeId]
  );

  useEffect(() => {
    rangesSV.value = ranges.map((r) => ({
      id: r.id,
      startMin: r.startMin,
      endMin: r.endMin,
    }));
    const sel = ranges.find((r) => r.id === planner.selectedRangeId);
    selectedSV.value = sel
      ? { id: sel.id, startMin: sel.startMin, endMin: sel.endMin }
      : null;
  }, [ranges, planner.selectedRangeId, rangesSV, selectedSV]);

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

  // ---- Commit / discard ----

  const closeEditor = useCallback(() => {
    Keyboard.dismiss();
    setEditingId(null);
    setDraftRange(null);
    setTitle("");
    draftActive.value = 0;
    planner.selectRange(null);
  }, [draftActive, planner]);

  /**
   * Commit whatever the label bar currently holds, because the touch has moved
   * on to another range. Reads through refs — see the note on `titleRef`. The
   * keyboard is left alone: whether it should go depends on what the caller
   * opens next.
   */
  const commitOpen = useCallback(() => {
    const openId = editingIdRef.current;
    const draft = draftRangeRef.current;
    if (!openId && !draft) return;

    const name = titleRef.current.trim();
    if (openId) {
      planner.updateRange(openId, { title: name });
    } else if (draft) {
      planner.addRange({
        id: `${planner.selectedDay}-${Date.now()}`,
        startMin: draft.startMin,
        endMin: draft.endMin,
        title: name,
        markerId: draft.markerId,
      });
    }
    setEditingId(null);
    setDraftRange(null);
    setTitle("");
    draftActive.value = 0;
  }, [planner, draftActive]);

  // ---- JS-thread callbacks invoked from the gesture ----

  const tick = useCallback(() => {
    if (!reduceMotion) Haptics.selectionAsync();
  }, [reduceMotion]);

  /**
   * A tap on a band. One tap selects — handles out, pens live, no keyboard.
   * Two taps on the same band inside DOUBLE_TAP_MS open the name.
   *
   * Invariants:
   *  - `at` is a UI-thread `performance.now()`, so the window measures
   *    finger-lift to finger-lift and a stalled JS thread cannot fake a pair.
   *  - a match consumes the pair, so a triple tap reads select / edit / select.
   *  - every touch that ends *without* a tap resets the pair (see `onCreated`,
   *    `onResized`, `onDeselect`) — otherwise "tap, drag a handle, tap" reads
   *    as a double tap.
   */
  const onPickRange = useCallback(
    (id: string, at: number) => {
      // Tapping away from an open name commits it rather than dropping it.
      const closed =
        editingIdRef.current !== id &&
        (editingIdRef.current !== null || draftRangeRef.current !== null);
      if (closed) commitOpen();

      const prev = lastTapRef.current;
      const isDouble = prev.id === id && at - prev.at < DOUBLE_TAP_MS;
      lastTapRef.current = isDouble ? { id: "", at: 0 } : { id, at };

      planner.selectRange(id);

      if (isDouble) {
        const r = planner.day.ranges.find((x) => x.id === id);
        if (r) {
          setTitle(r.title);
          setEditingId(id);
        }
      } else if (closed) {
        // Selection alone never shows a keyboard.
        Keyboard.dismiss();
      }
    },
    [planner, commitOpen]
  );

  const onCreated = useCallback(
    (startMin: number, endMin: number) => {
      lastTapRef.current = { id: "", at: 0 };
      commitOpen();
      setTitle("");
      setDraftRange({ startMin, endMin, markerId: planner.markerId });
    },
    [planner.markerId, commitOpen]
  );

  const onResized = useCallback(
    (id: string, startMin: number, endMin: number) => {
      lastTapRef.current = { id: "", at: 0 };
      planner.updateRange(id, { startMin, endMin });
      setResizing(false);
    },
    [planner]
  );

  // Picking a colour retints whatever is selected — the reducer does that for a
  // committed range — and becomes the default for the next range drawn.
  const pickMarker = useCallback(
    (markerId: MarkerId) => {
      planner.setMarker(markerId);
      setDraftRange((d) => (d ? { ...d, markerId } : d));
    },
    [planner]
  );

  const onDeselect = useCallback(() => {
    lastTapRef.current = { id: "", at: 0 };
    // A tap on the face while a freshly drawn range is being named must not
    // throw it away — that is still the only protection an uncommitted range
    // has.
    if (draftRangeRef.current) return;
    if (editingIdRef.current) {
      closeEditor();
      return;
    }
    if (planner.selectedRangeId) planner.selectRange(null);
  }, [planner, closeEditor]);

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
          beginX.value = e.x;
          beginY.value = e.y;

          const hit = hitTrack(e.x, e.y);
          if (!hit) {
            mode.value = DESELECT;
            return;
          }

          // Which arc is under the finger. Resolved before the handle test,
          // because a press on a handle needs to know what a *tap* would pick.
          const list = rangesSV.value;
          let arcId: string | null = null;
          for (let i = 0; i < list.length; i += 1) {
            if (rangeContains(list[i].startMin, list[i].endMin, hit.min)) {
              arcId = list[i].id;
              break;
            }
          }

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

          // 1. An end handle of the selected range — provisionally. Whether
          //    this is a resize or a tap is decided by movement in onUpdate,
          //    never here: on a short range every point of the arc is inside a
          //    handle's grab radius, so committing to a resize now would make
          //    a second tap impossible to observe.
          if (sel) {
            const dStart = distToMinute(e.x, e.y, sel.startMin);
            const dEnd = distToMinute(e.x, e.y, sel.endMin);
            if (dStart < GRAB_R || dEnd < GRAB_R) {
              mode.value = MAYBE_RESIZE;
              resizeSide.value = dStart <= dEnd ? RESIZE_START : RESIZE_END;
              dragId.value = sel.id;
              tapId.value = arcId === null ? sel.id : arcId;
              baseStart.value = sel.startMin;
              baseSweep.value = sweepMin(sel.startMin, sel.endMin);
              accumDeg.value = 0;
              lastAngle.value = angleAtPoint(e.x, e.y);
              return;
            }
          }

          // 2. An existing arc -> select it (acted on in onFinalize).
          if (arcId !== null) {
            mode.value = SELECT;
            dragId.value = arcId;
            return;
          }

          // 3. Empty track -> start drawing.
          mode.value = CREATE;
          dragId.value = null;
          const anchor = snapMin(hit.min);
          baseStart.value = anchor;
          baseSweep.value = 0;
          draftStartMin.value = anchor;
          draftSweepMin.value = 0;
          draftActive.value = 1;
          accumDeg.value = 0;
          lastAngle.value = angleAtPoint(e.x, e.y);
          readout.value = formatRange(anchor, anchor);
          readoutOn.value = withTiming(1, QUICK);
          ringActive.value = withTiming(1, QUICK);
        })
        .onUpdate((e) => {
          "worklet";
          if (mode.value === IDLE) return;

          if (mode.value === MAYBE_RESIZE) {
            const dx = e.x - beginX.value;
            const dy = e.y - beginY.value;
            if (dx * dx + dy * dy < TAP_SLOP * TAP_SLOP) return; // still a tap
            // Promote, and arm everything onBegin deliberately left alone.
            mode.value = resizeSide.value;
            draftStartMin.value = baseStart.value;
            draftSweepMin.value = baseSweep.value;
            draftActive.value = 1;
            accumDeg.value = 0;
            // Re-baseline where the slop broke rather than where the finger
            // landed, so the handle trails by 8px instead of jumping 8 minutes.
            lastAngle.value = angleAtPoint(e.x, e.y);
            ringActive.value = withTiming(1, QUICK);
            readoutOn.value = withTiming(1, QUICK);
            scheduleOnRN(setResizing, true);
            // ...and fall through into the angle math on this same frame.
          }

          // Unwrap the angle rather than re-reading the radius, so continuing
          // clockwise past 12 rolls onto the next track instead of snapping.
          const a = angleAtPoint(e.x, e.y);
          accumDeg.value += deltaDeg(a, lastAngle.value);
          lastAngle.value = a;
          const deltaMin = degToMin(accumDeg.value);

          if (mode.value === RESIZE_START) {
            const rawSweep = baseSweep.value - deltaMin;
            const sweep = Math.min(
              MIN_PER_DAY - SNAP,
              Math.max(MIN_SWEEP, Math.round(rawSweep / SNAP) * SNAP)
            );
            const end = normMin(baseStart.value + baseSweep.value);
            draftStartMin.value = normMin(end - sweep);
            draftSweepMin.value = sweep;
          } else {
            const rawSweep =
              (mode.value === CREATE ? 0 : baseSweep.value) + deltaMin;
            const floor = mode.value === CREATE ? 0 : MIN_SWEEP;
            draftSweepMin.value = Math.min(
              MIN_PER_DAY - SNAP,
              Math.max(floor, Math.round(rawSweep / SNAP) * SNAP)
            );
            draftStartMin.value = baseStart.value;
          }

          const end = normMin(draftStartMin.value + draftSweepMin.value);
          readout.value = formatRange(draftStartMin.value, end);
          if (end !== lastTickMin.value) {
            lastTickMin.value = end;
            scheduleOnRN(tick);
          }
        })
        // Every side effect lands here rather than in onBegin: onFinalize needs
        // a complete touch cycle, so a handler that spuriously begins (which
        // layered/remounted pans do) cannot select or create anything.
        .onFinalize(() => {
          "worklet";
          const m = mode.value;
          mode.value = IDLE;
          if (m === IDLE) return;
          ringActive.value = withTiming(0, QUICK);

          // Never promoted, so the finger never travelled: it was a tap.
          if (m === MAYBE_RESIZE) {
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
            if (id) scheduleOnRN(onResized, id, start, end);
          }
        }),
    [
      accumDeg,
      baseStart,
      baseSweep,
      beginX,
      beginY,
      dragId,
      draftActive,
      draftStartMin,
      draftSweepMin,
      lastAngle,
      lastTickMin,
      mode,
      onCreated,
      onDeselect,
      onPickRange,
      onResized,
      rangesSV,
      readout,
      readoutOn,
      resizeSide,
      ringActive,
      selectedSV,
      tapId,
      tick,
    ]
  );

  const confirm = useCallback(() => {
    const name = title.trim();
    if (editingId) {
      // Geometry was already committed by onResized; writing it back from a
      // snapshot taken when the name opened is the only way left to lose it.
      planner.updateRange(editingId, { title: name });
    } else if (draftRange) {
      planner.addRange({
        id: `${planner.selectedDay}-${Date.now()}`,
        startMin: draftRange.startMin,
        endMin: draftRange.endMin,
        title: name,
        markerId: draftRange.markerId,
      });
    } else {
      return;
    }
    closeEditor();
  }, [editingId, draftRange, title, planner, closeEditor]);

  const remove = useCallback(() => {
    if (editingId) planner.deleteRange(editingId);
    closeEditor();
  }, [editingId, planner, closeEditor]);

  // The readout stands in for the date whenever there is a range in hand —
  // drawn, selected, or being resized — and steps aside when there isn't.
  useEffect(() => {
    const src = draftRange ?? selectedRange;
    if (!src) {
      readoutOn.value = withTiming(0, QUICK);
      return;
    }
    readout.value = formatRange(src.startMin, src.endMin);
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

  const clockStyle = useAnimatedStyle(() => {
    const lift = Math.min(kbHeight.value * KB_LIFT_FACTOR, KB_LIFT_MAX);
    const t = lift / KB_LIFT_MAX;
    return {
      transform: [
        { translateY: -lift },
        { scale: 1 - (1 - KB_SCALE_MIN) * t },
      ],
    };
  });

  const naming = draftRange !== null || editingId !== null;
  const activeMarkerId =
    draftRange?.markerId ?? selectedRange?.markerId ?? planner.markerId;
  const activeMarker = MARKER_BY_ID[activeMarkerId];
  // Sourced from the selection, not from the editor: a resize can only ever
  // target the selected range, and single-tap-select leaves no editor open to
  // read an id from. Without this the committed arc renders under the live
  // draft for the whole drag.
  const hiddenId = resizing ? planner.selectedRangeId : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />

      <View style={{ paddingTop: insets.top + 6 }}>
        <DayHeader
          dayKey={planner.selectedDay}
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
        <Animated.View style={clockStyle}>
          <GestureDetector gesture={pan}>
            <View style={styles.canvasWrap} collapsable={false}>
              <ClockCanvas
                theme={theme}
                fonts={fonts}
                now={now}
                ranges={ranges}
                selectedId={planner.selectedRangeId}
                hiddenId={hiddenId}
                draft={{
                  active: draftActive,
                  startMin: draftStartMin,
                  sweepMin: draftSweepMin,
                }}
                draftFill={activeMarker.fill}
                draftEdge={activeMarker.edge}
                ringActive={ringActive}
              />
            </View>
          </GestureDetector>
        </Animated.View>
      </View>

      {/* The tray stays available while a range is selected — that is the only
          way to recolour it — but folds away once the keyboard takes the room. */}
      {!kbVisible && (
        <View style={{ paddingBottom: naming ? 0 : insets.bottom + 4 }}>
          <MarkerTray selected={activeMarkerId} onSelect={pickMarker} />
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

      {calendarOpen && (
        <CalendarPanel
          onClose={() => setCalendarOpen(false)}
          theme={theme}
          fonts={fonts}
          now={now}
        />
      )}

      <AppearanceSheet sheetRef={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  canvasWrap: { width: CANVAS, height: CANVAS },
});
