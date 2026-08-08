import { Canvas, Group } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

import { CANVAS } from "../constants";
import type { RangeItem } from "../store/types";
import type { Theme } from "../theme";
import { ClockFace } from "./clock-face";
import { ClockHands } from "./clock-hands";
import { DotRings } from "./dot-rings";
import { DraftArc, type Draft, type DraftLabel } from "./draft-arc";
import { GhostHint } from "./ghost-hint";
import { NowMarker } from "./now-marker";
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
  draftLabel: DraftLabel | null;
  draftInk: string;
  ringActive: SharedValue<number>;
  /** Show the empty-day teaching arc. */
  showHint?: boolean;
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
  draftLabel,
  draftInk,
  ringActive,
  showHint,
}: Props) {
  return (
    <Canvas style={{ width: CANVAS, height: CANVAS }}>
      <Group>
        <DotRings theme={theme} active={ringActive} />
        {/* Under the bands, so the first real range paints straight over it. */}
        {showHint && <GhostHint theme={theme} />}
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
          label={draftLabel}
          ink={draftInk}
          fonts={fonts}
          theme={theme}
        />
        {/* Above the bands so it stays visible over a painted arc, below the
            face and hands so they keep the top of the stack. */}
        <NowMarker now={now} theme={theme} />
        <ClockFace theme={theme} fonts={fonts} />
        <ClockHands theme={theme} now={now} />
      </Group>
    </Canvas>
  );
}
