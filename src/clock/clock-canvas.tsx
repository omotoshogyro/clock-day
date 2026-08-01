import { Canvas, Group } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

import { CANVAS } from "../constants";
import type { RangeItem } from "../store/types";
import type { Theme } from "../theme";
import { ClockFace } from "./clock-face";
import { ClockHands } from "./clock-hands";
import { DotRings } from "./dot-rings";
import { DraftArc, type Draft } from "./draft-arc";
import { RangeArcs } from "./range-arcs";
import type { DialFonts } from "./fonts";
import type { Now } from "./use-now";

type Props = {
  theme: Theme;
  fonts: DialFonts;
  now: Now;
  ranges: RangeItem[];
  selectedId: string | null;
  hiddenId: string | null;
  draft: Draft;
  draftFill: string;
  draftEdge: string;
  ringActive: SharedValue<number>;
};

/**
 * One canvas for the whole dial. Painting order is back-to-front: tracks,
 * committed arcs, the live draft, then the face and hands on top so the hands
 * always sweep over the highlighter.
 */
export function ClockCanvas({
  theme,
  fonts,
  now,
  ranges,
  selectedId,
  hiddenId,
  draft,
  draftFill,
  draftEdge,
  ringActive,
}: Props) {
  return (
    <Canvas style={{ width: CANVAS, height: CANVAS }}>
      <Group>
        <DotRings theme={theme} active={ringActive} />
        <RangeArcs
          ranges={ranges}
          selectedId={selectedId}
          theme={theme}
          fonts={fonts}
          hiddenId={hiddenId}
        />
        <DraftArc
          draft={draft}
          fill={draftFill}
          edge={draftEdge}
          theme={theme}
        />
        <ClockFace theme={theme} fonts={fonts} />
        <ClockHands theme={theme} now={now} />
      </Group>
    </Canvas>
  );
}
