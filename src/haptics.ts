import { useMemo } from "react";
import { Presets, useRealtimeComposer } from "react-native-pulsar";

/**
 * The app's haptic vocabulary, in one place so the classes stay distinct.
 *
 * Deliberately *not* gated on `useReducedMotion`. Reduce Motion is a vestibular
 * setting; iOS has a separate System Haptics switch that the OS already honours
 * underneath this. Gating here would take away the one feedback channel still
 * working for someone who has turned animation off. If a user-facing toggle is
 * ever wanted, `Settings.enableHaptics(false)` is the right home for it —
 * global, native-side, and free at every call site.
 *
 * The one-shots are direct aliases rather than wrappers. Every Pulsar preset is
 * already an arrow function carrying its own "worklet" directive, so aliasing
 * keeps them callable straight from the pan's worklet with no scheduleOnRN hop
 * — and from the JS thread unchanged, which is why the UI call sites did not
 * have to move.
 */

/** Each snap step while dragging is handled by `useDragHaptics` below. */

/**
 * A drag crossing noon or midnight, rolling between the AM and PM tracks.
 * `latch` is a multi-stage detent — a track clicking into place — so it lands
 * as a different *class* of sensation from the stream of ticks it interrupts.
 * A single impact gets masked in that stream; this does not.
 */
export const hRoll = Presets.latch;

/**
 * A drag pushing past the shortest or longest a range can be. The band stops
 * but the finger keeps going, so without this the wall is invisible.
 * Deliberately lighter than `hRoll` — it is a limit, not an event.
 */
export const hClamp = Presets.flinch;

/** A press has become a drag: you have hold of the band now. */
export const hGrab = Presets.clasp;

/** A new range finished drawing. */
export const hDrawn = Presets.bloom;

/** The one destructive action gets the heaviest thump. */
export const hDelete = Presets.System.impactHeavy;

/** Undoing a delete — a light acknowledgement, not another heavy one. */
export const hUndo = Presets.System.impactLight;

/** Picking a theme in the appearance sheet. */
export const hPick = Presets.System.impactLight;

/** Preset ids for `Settings.preloadPresets`, to avoid first-fire latency. */
export const PRELOAD = ["Latch", "Flinch", "Clasp", "Bloom"];

export type DragHaptics = {
  /** The continuous bed. Third arg starts the player if it is not running. */
  set: (amplitude: number, frequency: number, startIfNeeded?: boolean) => void;
  /** One transient layered over the bed — a 5-minute snap. */
  tick: (amplitude: number, frequency: number) => void;
  stop: () => void;
};

/**
 * The drag's continuous texture, pinned to its first render's identities.
 *
 * This object ends up in the Pan's dependency array, and the Pan must never be
 * rebuilt mid-session — see the note in clockday-screen.tsx, and the same
 * reasoning behind the pinned frame callback in clock/use-now.ts.
 * `useRealtimeComposer` returns a *fresh object literal* every render even
 * though each method inside it is `useCallback(…, [])`, so the object must
 * never be captured directly; only the methods are safe to hold.
 *
 * Freezing them is safe because each closes over nothing but the module-scope
 * native module. The dev check below turns a future Pulsar version that breaks
 * that assumption into a warning rather than a silent stale call.
 */
export function useDragHaptics(): DragHaptics {
  const rt = useRealtimeComposer();

  const pinned = useMemo(
    () => ({ set: rt.set, tick: rt.playDiscrete, stop: rt.stop }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (__DEV__ && pinned.set !== rt.set) {
    console.warn(
      "[haptics] useRealtimeComposer identities are no longer stable — " +
        "useDragHaptics is holding stale methods."
    );
  }

  return pinned;
}
