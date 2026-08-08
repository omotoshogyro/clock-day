import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MARKER_BY_ID } from "../constants";
import { segmentsFor } from "../geometry";
import type { DayPlan } from "../store/types";
import type { Theme } from "../theme";
import { MIN_PER_TURN, WEEKDAYS, dayKeyOf, monthGrid } from "../time";

const COLS = 7;
const ROWS = 6;
export const CELL_H = 50;

// Mini-ring radii echo the big dial: AM inside, PM outside.
const MINI_R = [15, 19];
const MINI_W = 3;
/**
 * The selected-day disc. Strictly inside MINI_R[0] so a day's arcs orbit the
 * badge instead of being swallowed by it — at r >= 15 this would paint over the
 * AM ring, which is the whole thing the calendar is there to show.
 */
const SEL_R = 13;

type Props = {
  year: number;
  month: number;
  selectedKey: string;
  planFor: (key: string) => DayPlan;
  onSelect: (key: string) => void;
  theme: Theme;
  width: number;
};

/**
 * The month grid. All 42 days' arcs go into a *single* canvas — one per cell
 * would be 42 Skia surfaces — with the numerals laid over it as normal text.
 */
export function CalendarGrid({
  year,
  month,
  selectedKey,
  planFor,
  onSelect,
  theme,
  width,
}: Props) {
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const cellW = width / COLS;
  const height = ROWS * CELL_H;

  const arcs = useMemo(() => {
    const out: { path: ReturnType<typeof Skia.Path.Make>; color: string }[] = [];

    cells.forEach((cell, i) => {
      const cx = (i % COLS) * cellW + cellW / 2;
      const cy = Math.floor(i / COLS) * CELL_H + CELL_H / 2;
      const plan = planFor(cell.key);

      plan.ranges.forEach((range) => {
        segmentsFor(range.startMin, range.endMin).forEach((seg) => {
          const r = MINI_R[seg.ring];
          const from = ((seg.fromMin % MIN_PER_TURN) / MIN_PER_TURN) * 360 - 90;
          const sweep = ((seg.toMin - seg.fromMin) / MIN_PER_TURN) * 360;
          const p = Skia.Path.Make();
          p.addArc(
            { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
            from,
            sweep
          );
          out.push({ path: p, color: MARKER_BY_ID[range.markerId].fill });
        });
      });
    });

    return out;
  }, [cells, cellW, planFor]);

  const todayKey = useMemo(() => dayKeyOf(new Date()), []);

  // Kept out of the `arcs` memo so that one stays keyed on plan data alone.
  // The selected day is often in a month you have browsed away from, hence the
  // index guard rather than an unchecked lookup.
  const selDisc = useMemo(() => {
    const i = cells.findIndex((c) => c.key === selectedKey);
    if (i < 0) return null;
    return {
      cx: (i % COLS) * cellW + cellW / 2,
      cy: Math.floor(i / COLS) * CELL_H + CELL_H / 2,
    };
  }, [cells, cellW, selectedKey]);

  return (
    <View style={{ width }}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text
            key={`${d}-${i}`}
            style={[styles.weekday, { width: cellW, color: theme.subtle }]}
          >
            {d}
          </Text>
        ))}
      </View>

      <View style={{ width, height }}>
        <Canvas style={StyleSheet.absoluteFill}>
          {/* In the canvas, not a React View: the cells overlay sits *above*
              this, so a View disc would paint over the day's arcs. */}
          {selDisc && (
            <Circle
              cx={selDisc.cx}
              cy={selDisc.cy}
              r={SEL_R}
              color={theme.chipOn}
            />
          )}
          <Group>
            {arcs.map((a, i) => (
              <Path
                key={i}
                path={a.path}
                color={a.color}
                style="stroke"
                strokeWidth={MINI_W}
                strokeCap="round"
              />
            ))}
          </Group>
        </Canvas>

        <View style={styles.cells}>
          {cells.map((cell) => {
            const selected = cell.key === selectedKey;
            const isToday = cell.key === todayKey;
            // Selected wins: the numeral sits on the disc and has to read
            // against it. Today is only tinted when it is not the selection.
            const ink = selected
              ? theme.chipOnInk
              : isToday
                ? theme.accent
                : cell.inMonth
                  ? theme.ink
                  : theme.subtle;
            return (
              <Pressable
                key={cell.key}
                onPress={() => onSelect(cell.key)}
                style={[styles.cell, { width: cellW, height: CELL_H }]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={cell.key}
              >
                <Text
                  style={[
                    styles.day,
                    {
                      color: ink,
                      opacity: cell.inMonth || selected ? 1 : 0.45,
                      fontWeight: selected || isToday ? "800" : "500",
                    },
                  ]}
                >
                  {cell.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekday: { textAlign: "center", fontSize: 12, fontWeight: "500" },
  cells: { ...StyleSheet.absoluteFill, flexDirection: "row", flexWrap: "wrap" },
  cell: { alignItems: "center", justifyContent: "center" },
  day: { fontSize: 15 },
});
