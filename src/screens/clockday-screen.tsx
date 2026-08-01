import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { StickerLayer } from "../clock/sticker-layer";
import { useNow } from "../clock/use-now";
import {
  CANVAS,
  CX,
  CY,
  GRAB_R,
  KB_LIFT_FACTOR,
  KB_LIFT_MAX,
  KB_SCALE_MIN,
  MARKER_BY_ID,
  QUICK,
  R_AM,
  R_PM,
  type MarkerId,
} from "../constants";
import {
  angleAtPoint,
  degToMin,
  deltaDeg,
  distToMinute,
  hitTrack,
  rangeContains,
} from "../geometry";
import { usePlanner } from "../store/planner-context";
import type { RangeItem } from "../store/types";
import { useTheme } from "../theme";
import {
  MIN_PER_DAY,
  SNAP,
  formatRange,
  normMin,
  snapMin,
  sweepMin,
} from "../time";
import { CalendarPanel } from "../ui/calendar-panel";
import { DayHeader } from "../ui/day-header";
import { LabelBar } from "../ui/label-bar";
import { MarkerTray } from "../ui/marker-tray";

// Drag modes, kept as numbers so they live comfortably in a shared value.
const IDLE = 0;
const CREATE = 1;
const RESIZE_START = 2;
const RESIZE_END = 3;
const MOVE_STICKER = 4;
const SELECT = 5;
const DESELECT = 6;

const MIN_SWEEP = SNAP; // a range is never shorter than one snap step

type Pending = {
  /** Present when an existing range is being renamed rather than created. */
  id?: string;
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
  const [stickerArmed, setStickerArmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [title, setTitle] = useState("");
  const [kbVisible, setKbVisible] = useState(false);
  /** True only while an end handle is under the finger. */
  const [resizing, setResizing] = useState(false);

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

  const marker = MARKER_BY_ID[planner.markerId];

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
  const stickerIdx = useSharedValue(-1);

  // Mirrors of React state that the gesture worklet needs to read.
  const rangesSV = useSharedValue<
    { id: string; startMin: number; endMin: number }[]
  >([]);
  const selectedSV = useSharedValue<{
    id: string;
    startMin: number;
    endMin: number;
  } | null>(null);
  const stickersSV = useSharedValue<
    { id: string; x: number; y: number }[]
  >([]);

  const { ranges, stickers } = planner.day;

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

  useEffect(() => {
    stickersSV.value = stickers.map((s) => {
      const rad = (s.angleDeg * Math.PI) / 180;
      return {
        id: s.id,
        x: CX + Math.cos(rad) * s.radius,
        y: CY + Math.sin(rad) * s.radius,
      };
    });
  }, [stickers, stickersSV]);

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

  // ---- JS-thread callbacks invoked from the gesture ----

  const tick = useCallback(() => {
    if (!reduceMotion) Haptics.selectionAsync();
  }, [reduceMotion]);

  const onPickRange = useCallback(
    (id: string) => {
      planner.selectRange(id);
      const r = planner.day.ranges.find((x) => x.id === id);
      if (r) {
        setTitle(r.title);
        setPending({
          id: r.id,
          startMin: r.startMin,
          endMin: r.endMin,
          markerId: r.markerId,
        });
      }
    },
    [planner]
  );

  const onCreated = useCallback(
    (startMin: number, endMin: number) => {
      setTitle("");
      setPending({ startMin, endMin, markerId: planner.markerId });
    },
    [planner.markerId]
  );

  const onResized = useCallback(
    (id: string, startMin: number, endMin: number) => {
      planner.updateRange(id, { startMin, endMin });
      setPending((p) => (p && p.id === id ? { ...p, startMin, endMin } : p));
      setResizing(false);
    },
    [planner]
  );

  const onStickerMoved = useCallback(
    (id: string, angleDeg: number, radius: number) => {
      planner.moveSticker(id, angleDeg, radius);
    },
    [planner]
  );

  // Picking a colour retints whatever is being edited straight away, and
  // becomes the default for the next range drawn.
  const pickMarker = useCallback(
    (markerId: MarkerId) => {
      planner.setMarker(markerId);
      setPending((p) => (p ? { ...p, markerId } : p));
    },
    [planner]
  );

  const onDeselect = useCallback(() => {
    if (pending?.id) {
      planner.selectRange(null);
      setPending(null);
    }
  }, [pending, planner]);

  const placeSticker = useCallback(
    (angleDeg: number, radius: number) => {
      planner.addSticker({
        id: `${planner.selectedDay}-h-${Date.now()}`,
        kind: "heart",
        angleDeg,
        radius,
      });
      setStickerArmed(false);
      if (!reduceMotion) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [planner, reduceMotion]
  );

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

          // 1. A sticker under the finger wins.
          const sticks = stickersSV.value;
          for (let i = 0; i < sticks.length; i += 1) {
            const dx = e.x - sticks[i].x;
            const dy = e.y - sticks[i].y;
            if (Math.sqrt(dx * dx + dy * dy) < 24) {
              mode.value = MOVE_STICKER;
              stickerIdx.value = i;
              dragId.value = sticks[i].id;
              return;
            }
          }

          const hit = hitTrack(e.x, e.y);
          if (!hit) {
            mode.value = DESELECT;
            return;
          }

          // 2. An end handle of the selected range.
          const sel = selectedSV.value;
          if (sel) {
            const dStart = distToMinute(e.x, e.y, sel.startMin);
            const dEnd = distToMinute(e.x, e.y, sel.endMin);
            if (dStart < GRAB_R || dEnd < GRAB_R) {
              mode.value = dStart <= dEnd ? RESIZE_START : RESIZE_END;
              dragId.value = sel.id;
              baseStart.value = sel.startMin;
              baseSweep.value = sweepMin(sel.startMin, sel.endMin);
              draftStartMin.value = sel.startMin;
              draftSweepMin.value = baseSweep.value;
              draftActive.value = 1;
              accumDeg.value = 0;
              lastAngle.value = angleAtPoint(e.x, e.y);
              ringActive.value = withTiming(1, QUICK);
              readoutOn.value = withTiming(1, QUICK);
              scheduleOnRN(setResizing, true);
              return;
            }
          }

          // 3. An existing arc -> select it (acted on in onFinalize).
          const list = rangesSV.value;
          for (let i = 0; i < list.length; i += 1) {
            if (rangeContains(list[i].startMin, list[i].endMin, hit.min)) {
              mode.value = SELECT;
              dragId.value = list[i].id;
              return;
            }
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
          accumDeg.value = 0;
          lastAngle.value = angleAtPoint(e.x, e.y);
          readout.value = formatRange(anchor, anchor);
          readoutOn.value = withTiming(1, QUICK);
          ringActive.value = withTiming(1, QUICK);
        })
        .onUpdate((e) => {
          "worklet";
          if (mode.value === IDLE) return;

          if (mode.value === MOVE_STICKER) {
            const dx = e.x - CX;
            const dy = e.y - CY;
            const r = Math.min(
              R_PM + 34,
              Math.max(R_AM - 34, Math.sqrt(dx * dx + dy * dy))
            );
            const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const i = stickerIdx.value;
            if (i >= 0) {
              const next = stickersSV.value.slice();
              const rad = (deg * Math.PI) / 180;
              next[i] = {
                ...next[i],
                x: CX + Math.cos(rad) * r,
                y: CY + Math.sin(rad) * r,
              };
              stickersSV.value = next;
            }
            baseStart.value = deg;
            baseSweep.value = r;
            return;
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

          if (m === SELECT) {
            const id = dragId.value;
            if (id) scheduleOnRN(onPickRange, id);
            return;
          }
          if (m === DESELECT) {
            scheduleOnRN(onDeselect);
            return;
          }
          if (m === MOVE_STICKER) {
            const id = dragId.value;
            if (id)
              scheduleOnRN(onStickerMoved, id, baseStart.value, baseSweep.value);
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
      onStickerMoved,
      rangesSV,
      readout,
      readoutOn,
      ringActive,
      selectedSV,
      stickerIdx,
      stickersSV,
      tick,
    ]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        "worklet";
        if (!stickerArmed) return;
        const dx = e.x - CX;
        const dy = e.y - CY;
        const r = Math.sqrt(dx * dx + dy * dy);
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        scheduleOnRN(placeSticker, deg, Math.min(R_PM + 34, Math.max(60, r)));
      }),
    [stickerArmed, placeSticker]
  );

  const gesture = useMemo(
    () => (stickerArmed ? Gesture.Exclusive(tap, pan) : pan),
    [stickerArmed, tap, pan]
  );

  // ---- Commit / discard ----

  const closePending = useCallback(() => {
    Keyboard.dismiss();
    setPending(null);
    setTitle("");
    draftActive.value = 0;
    readoutOn.value = withTiming(0, QUICK);
    planner.selectRange(null);
  }, [draftActive, readoutOn, planner]);

  const confirm = useCallback(() => {
    if (!pending) return;
    const name = title.trim();
    if (pending.id) {
      planner.updateRange(pending.id, {
        title: name,
        startMin: pending.startMin,
        endMin: pending.endMin,
      });
    } else {
      const range: RangeItem = {
        id: `${planner.selectedDay}-${Date.now()}`,
        startMin: pending.startMin,
        endMin: pending.endMin,
        title: name,
        markerId: planner.markerId,
      };
      planner.addRange(range);
    }
    closePending();
  }, [pending, title, planner, closePending]);

  const remove = useCallback(() => {
    if (pending?.id) planner.deleteRange(pending.id);
    closePending();
  }, [pending, planner, closePending]);

  useEffect(() => {
    if (!pending) return;
    readout.value = formatRange(pending.startMin, pending.endMin);
    readoutOn.value = withTiming(1, QUICK);
    // A committed range is already drawn (with its label) by RangeArcs, so the
    // draft only stands in for one that does not exist yet.
    if (pending.id) return;
    draftStartMin.value = pending.startMin;
    draftSweepMin.value = sweepMin(pending.startMin, pending.endMin);
    draftActive.value = 1;
  }, [pending, draftStartMin, draftSweepMin, draftActive, readout, readoutOn]);

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

  const naming = pending !== null;
  // Only suppressed mid-resize, where the draft shows the new geometry.
  const hiddenId = resizing ? pending?.id ?? null : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />

      <View style={{ paddingTop: insets.top + 6 }}>
        <DayHeader
          dayKey={planner.selectedDay}
          expanded={calendarOpen}
          onToggleCalendar={() => setCalendarOpen((v) => !v)}
          onMore={() => setCalendarOpen(false)}
          readout={readout}
          readoutOn={readoutOn}
        />
      </View>

      <View style={styles.stage}>
        <Animated.View style={clockStyle}>
          <GestureDetector gesture={gesture}>
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
                draftFill={
                  (pending && MARKER_BY_ID[pending.markerId].fill) ?? marker.fill
                }
                draftEdge={
                  (pending && MARKER_BY_ID[pending.markerId].edge) ?? marker.edge
                }
                ringActive={ringActive}
              />
              <StickerLayer stickers={stickers} />
            </View>
          </GestureDetector>
        </Animated.View>
      </View>

      {/* The tray stays available while a range is selected — that is the only
          way to recolour it — but folds away once the keyboard takes the room. */}
      {!kbVisible && (
        <View style={{ paddingBottom: naming ? 0 : insets.bottom + 4 }}>
          <MarkerTray
            selected={naming ? pending!.markerId : planner.markerId}
            onSelect={pickMarker}
            stickerArmed={stickerArmed}
            onToggleSticker={() => setStickerArmed((v) => !v)}
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

      {calendarOpen && (
        <CalendarPanel
          onClose={() => setCalendarOpen(false)}
          theme={theme}
          fonts={fonts}
          now={now}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  canvasWrap: { width: CANVAS, height: CANVAS },
});
