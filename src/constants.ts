import { Dimensions } from "react-native";
import type {
  WithSpringConfig,
  WithTimingConfig,
} from "react-native-reanimated";
import { Easing } from "react-native-reanimated";

export const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ---- Clock geometry ----------------------------------------------------
// The Skia canvas is a square of CANVAS side, with the dial at its centre.
// Radii grow outward: face -> AM track -> PM track. Everything is derived from
// the screen width so the outer track never clips off the edge; the constants
// are the *proportions*, not the pixels.
export const BAND = 45; // highlighter thickness == hit tolerance
/**
 * Corner radius on the painted arcs. The ends are cut radially and only the
 * corners are rounded, so this must stay under BAND/2 — at BAND/2 the two
 * fillets meet and the end is a plain semicircle again.
 */
export const ARC_CORNER_R = 20;
export const CANVAS = Math.min(SCREEN_W, 430);

// Three named clearances rather than one shared gap. R_FACE used to be
// `R_AM - TRACK_GAP`, which chained the face size to the track spacing — fine
// while the bands were thin, but it wastes ~28pt once they are 45pt wide and
// the two of them already eat 90pt of the radius budget.
const EDGE_MARGIN = 6; // outermost arc edge -> canvas edge
const TRACK_GUTTER = 6; // AM band -> PM band
const FACE_CLEAR = 16; // face rim -> AM band

/** Outermost drawn radius, including half the highlighter thickness. */
const OUTER = CANVAS / 2 - EDGE_MARGIN;

export const R_PM = OUTER - BAND / 2; // outer dotted track / PM arc centreline
export const R_AM = R_PM - (BAND + TRACK_GUTTER); // inner track / AM centreline
export const R_FACE = R_AM - BAND / 2 - FACE_CLEAR; // clock face radius

export const CX = CANVAS / 2;
export const CY = CANVAS / 2;

export const DOT_R = 1.7; // dotted-track dot radius
export const DOTS_PER_RING = 96; // one dot every 7.5 minutes
export const GRAB_R = 26; // end-handle grab radius
export const HANDLE_R = 13; // end-handle visual radius

// A range whose sweep is under this many minutes renders as a horizontal pill
// instead of curved text — the "Anne" case.
export const PILL_MAX_MIN = 40;
/** Pill height. Deliberately slimmer than BAND, as in the reference. */
export const PILL_H = 30;

// ---- Face detail -------------------------------------------------------
// Also proportional, so the dial stays balanced on any screen size.
export const TICK_LEN_MINOR = 4;
export const TICK_LEN_MAJOR = 8;
export const NUMERAL_SIZE = Math.round(R_FACE * 0.21);
export const NUMERAL_R = R_FACE - NUMERAL_SIZE * 1.25; // radius the numerals sit on
export const LABEL_SIZE = 16;

export const HAND_HOUR_LEN = Math.round(R_FACE * 0.55);
export const HAND_HOUR_W = 7;
export const HAND_MIN_LEN = Math.round(R_FACE * 0.84);
export const HAND_MIN_W = 6;
export const HAND_SEC_LEN = Math.round(R_FACE * 0.94);
export const HAND_SEC_TAIL = Math.round(R_FACE * 0.24);
export const HAND_SEC_W = 1.6;
export const CAP_R = 6.5;

// ---- Markers -----------------------------------------------------------
export type MarkerId = "yellow" | "blue" | "pink" | "rainbow";

export type Marker = {
  id: MarkerId;
  /** Fill of the painted arc. */
  fill: string;
  /** Darker edge drawn when the range is selected. */
  edge: string;
  /** Ink used for the label sitting on the arc. */
  labelInk: string;
  /** Pen body gradient in the tray. */
  body: [string, string];
  /** Second colour pair, only used by the rainbow pen. */
  body2?: [string, string];
};

export const MARKERS: Marker[] = [
  {
    id: "yellow",
    fill: "#F8ED87",
    edge: "#B9A93B",
    labelInk: "#6B6118",
    body: ["#FDF6A8", "#E9D95C"],
  },
  {
    id: "blue",
    fill: "#A9E6F5",
    edge: "#4E9DB2",
    labelInk: "#1C5566",
    body: ["#C8F1FA", "#67C6DD"],
  },
  {
    id: "pink",
    fill: "#EDA9E8",
    edge: "#A85CA2",
    labelInk: "#5E2159",
    body: ["#F8CDF4", "#DE85D6"],
  },
  {
    id: "rainbow",
    fill: "#C9B7F2",
    edge: "#7C63BE",
    labelInk: "#3B2A6B",
    body: ["#FDE68A", "#8AD8F0"],
    body2: ["#F0A6E8", "#B49BF0"],
  },
];

export const MARKER_BY_ID: Record<MarkerId, Marker> = MARKERS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<MarkerId, Marker>
);

// ---- Motion ------------------------------------------------------------
export const SNAPPY: WithSpringConfig = {
  mass: 0.7,
  damping: 17,
  stiffness: 240,
};
export const SOFT: WithSpringConfig = {
  mass: 0.9,
  damping: 20,
  stiffness: 150,
};
export const QUICK: WithTimingConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
};
export const SMOOTH: WithTimingConfig = {
  duration: 300,
  easing: Easing.inOut(Easing.cubic),
};

// How far the clock lifts when the keyboard opens, and how much it shrinks.
export const KB_LIFT_FACTOR = 0.42;
export const KB_LIFT_MAX = 170;
export const KB_SCALE_MIN = 0.86;
