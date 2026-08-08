import {
  Circle,
  Group,
  Path,
  RoundedRect,
  Text,
  TextPath,
} from "@shopify/react-native-skia";
import { useMemo } from "react";

import {
  ARC_CORNER_R,
  BAND,
  HANDLE_R,
  MARKER_BY_ID,
  PILL_H,
  PILL_MAX_MIN,
} from "../constants";
import {
  arcLength,
  needsReverse,
  pointOnDial,
  radiusOf,
  segmentSweepDeg,
  segmentsFor,
  arcPath,
  sectorPath,
  type Segment,
} from "../geometry";
import { angleOf, sweepMin } from "../time";
import type { Theme } from "../theme";
import type { RangeItem } from "../store/types";
import type { DialFonts } from "./fonts";

type Built = ReturnType<typeof buildRange>;

type Props = {
  ranges: RangeItem[];
  selectedId: string | null;
  theme: Theme;
  fonts: DialFonts;
  /** Ids to skip — used to hide a range while its own draft is being dragged. */
  hiddenId?: string | null;
};

export function RangeArcs({
  ranges,
  selectedId,
  theme,
  fonts,
  hiddenId,
}: Props) {
  const built = useMemo(
    () =>
      ranges
        .filter((r) => r.id !== hiddenId)
        .map((r) => buildRange(r, fonts)),
    [ranges, hiddenId, fonts]
  );

  return (
    <Group>
      {/* Array order is paint order, so the last range wins where two overlap.
          `topmostAt` in geometry.ts walks backwards to match — change one and
          the visible band stops being the touchable one. */}
      {built.map((b) => (
        <RangeArc
          key={b.range.id}
          built={b}
          selected={b.range.id === selectedId}
          theme={theme}
          fonts={fonts}
        />
      ))}
    </Group>
  );
}

/**
 * One band. Split out of the map above only because the past-dimming opacity
 * needs a hook, and hooks cannot live inside a `.map`. The render order of the
 * parent is unchanged, and it must stay that way — see the note there.
 */
function RangeArc({
  built: b,
  selected,
  theme,
  fonts,
}: {
  built: Built;
  selected: boolean;
  theme: Theme;
  fonts: DialFonts;
}) {
  const marker = MARKER_BY_ID[b.range.markerId];
  // A pill already covers the whole (tiny) span, so drawing the arc under
  // it just adds lumps around the edges.
  const showArcs = b.label?.kind !== "pill";

  // A committed band is always full strength. The translucency lives on the
  // draft instead, so it reads as "this one is in your hand" rather than as a
  // permanent property of the arc.
  return (
    <Group>
      {selected &&
        showArcs &&
        b.segments.map((s, i) => (
          <Path key={`edge-${i}`} path={s.edgePath} color={marker.edge} />
        ))}
      {showArcs &&
        b.segments.map((s, i) => (
          <Path key={`fill-${i}`} path={s.path} color={marker.fill} />
        ))}

      {b.label?.kind === "curved" && (
        <TextPath
          path={b.label.path}
          text={b.range.title}
          font={fonts.label}
          color={marker.labelInk}
          initialOffset={b.label.offset}
        />
      )}

      {b.label?.kind === "pill" && (
        <Group>
          {selected && (
            <RoundedRect
              x={b.label.x - 2}
              y={b.label.y - 2}
              width={b.label.w + 4}
              height={b.label.h + 4}
              r={(b.label.h + 4) / 2}
              color={marker.edge}
            />
          )}
          <RoundedRect
            x={b.label.x}
            y={b.label.y}
            width={b.label.w}
            height={b.label.h}
            r={b.label.h / 2}
            color={marker.fill}
          />
          <Text
            x={b.label.textX}
            y={b.label.textY}
            text={b.range.title}
            font={fonts.mini}
            color={marker.labelInk}
          />
        </Group>
      )}

      {selected && (
        <Group>
          <Circle
            cx={b.startPt.x}
            cy={b.startPt.y}
            r={HANDLE_R}
            color={marker.edge}
          />
          <Circle
            cx={b.endPt.x}
            cy={b.endPt.y}
            r={HANDLE_R}
            color={marker.edge}
          />
          <Circle
            cx={b.startPt.x}
            cy={b.startPt.y}
            r={HANDLE_R - 3.5}
            color={theme.faceBg}
          />
          <Circle
            cx={b.endPt.x}
            cy={b.endPt.y}
            r={HANDLE_R - 3.5}
            color={theme.faceBg}
          />
        </Group>
      )}
    </Group>
  );
}

// ---- Layout ------------------------------------------------------------

type Label =
  | { kind: "curved"; path: ReturnType<typeof arcPath>; offset: number }
  | {
      kind: "pill";
      x: number;
      y: number;
      w: number;
      h: number;
      textX: number;
      textY: number;
    };

function buildRange(range: RangeItem, fonts: DialFonts) {
  const segs = segmentsFor(range.startMin, range.endMin);
  const segments = segs.map((seg) => {
    const r = radiusOf(seg.ring);
    const from = angleOf(seg.fromMin);
    const sweep = segmentSweepDeg(seg);
    return {
      seg,
      path: sectorPath(r, from, sweep, BAND / 2, ARC_CORNER_R),
      // The selected outline is the same sector grown by 1.5 on every side,
      // drawn underneath — a stroke would round the corners differently.
      edgePath: sectorPath(r, from, sweep, BAND / 2 + 1.5, ARC_CORNER_R + 1.5),
    };
  });

  const total = sweepMin(range.startMin, range.endMin);
  const label = range.title ? layoutLabel(range, segs, total, fonts) : null;

  return {
    range,
    segments,
    label,
    startPt: pointOnDial(
      range.startMin,
      radiusOf(segs[0]?.ring ?? 0)
    ),
    endPt: pointOnDial(
      range.endMin,
      radiusOf(segs[segs.length - 1]?.ring ?? 0)
    ),
  };
}

/** The compact form: a horizontal pill on the track — the "Anne" case. */
function pillLabel(
  range: RangeItem,
  segs: Segment[],
  totalMin: number,
  fonts: DialFonts
): Label {
  const mid = range.startMin + totalMin / 2;
  const r = radiusOf(segs[0].ring);
  const c = pointOnDial(mid, r);
  const box = fonts.mini.measureText(range.title);
  const w = box.width + 16;
  const h = PILL_H;
  return {
    kind: "pill",
    x: c.x - w / 2,
    y: c.y - h / 2,
    w,
    h,
    textX: c.x - box.width / 2 - box.x,
    textY: c.y - (box.y + box.height / 2),
  };
}

/**
 * Long ranges get text bent along the arc; anything too tight to read curved
 * becomes a horizontal pill instead.
 */
function layoutLabel(
  range: RangeItem,
  segs: Segment[],
  totalMin: number,
  fonts: DialFonts
): Label | null {
  if (segs.length === 0) return null;
  if (totalMin < PILL_MAX_MIN) return pillLabel(range, segs, totalMin, fonts);

  // Bend the label along whichever piece of the range has the most room.
  const widest = segs.reduce((a, b) =>
    b.toMin - b.fromMin > a.toMin - a.fromMin ? b : a
  );
  const reversed = needsReverse(widest);
  const box = fonts.label.measureText(range.title);
  const r = radiusOf(widest.ring);

  // Glyphs stand off the baseline on the outside of the direction of travel,
  // which flips with `reversed` — nudge the baseline so the text sits centred
  // in the band either way.
  const labelR = r + (reversed ? 1 : -1) * (box.height / 2);
  const sweep = segmentSweepDeg(widest);
  const len = arcLength(labelR, sweep);

  // A duration threshold alone can't know whether the *word* fits: at 16pt
  // "School run" wants ~82pt, which a 60-minute arc doesn't have. Without this
  // the text simply runs off the end of its arc, so fall back to the pill.
  const usable = len - ARC_CORNER_R;
  if (box.width > usable) return pillLabel(range, segs, totalMin, fonts);

  const path = arcPath(labelR, angleOf(widest.fromMin), sweep, reversed);
  return {
    kind: "curved",
    path,
    offset: Math.max(0, (len - box.width) / 2),
  };
}
