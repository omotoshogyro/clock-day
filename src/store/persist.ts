import Storage from "expo-sqlite/kv-store";

import { isDayEmpty, type DayPlan } from "./types";

/**
 * The one place that knows how the plan is stored.
 *
 * `expo-sqlite/kv-store` rather than MMKV or AsyncStorage: `getItemSync` is a
 * genuine synchronous read, which is what lets `init()` stay a plain function
 * and skips the whole hydrate-phase / loading-gate / flash-of-empty-state
 * problem. It is also first-party and version-pinned by the SDK, where MMKV v4
 * would pull react-native-nitro-modules into a project whose native build
 * already needs its Xcode pinned by hand.
 *
 * MIGRATION POLICY: additive optional fields do NOT bump the version — an old
 * blob missing them reads back correctly because they are optional. Only
 * removals, renames, and changes of meaning bump it, and each one gets a case
 * in `migrate`.
 */

const KEY = "clockday.plan";
const VERSION = 1;

export type Snapshot = {
  byDay: Record<string, DayPlan>;
  leadMin: number;
};

type Blob = { v: number } & Partial<Snapshot>;

function isPlan(x: unknown): x is DayPlan {
  if (typeof x !== "object" || x === null) return false;
  const p = x as DayPlan;
  return Array.isArray(p.ranges);
}

/**
 * Never throws, and never leaves a blob behind that would make it throw again.
 *
 * A throw inside `init()` is an unrecoverable white screen — and a recurring
 * one, because the bad row is still on disk next launch. Anything unexpected
 * degrades to "no saved plan" and clears the row, so a corrupt write costs one
 * session's data rather than every future launch.
 */
export function load(): Snapshot | null {
  let raw: string | null = null;
  try {
    raw = Storage.getItemSync(KEY);
    if (!raw) return null;

    const blob = JSON.parse(raw) as Blob;
    if (typeof blob !== "object" || blob === null) return null;
    if (blob.v !== VERSION) return migrate(blob);

    // Shape, not just JSON: a half-written or hand-edited row should land here
    // rather than as `undefined.map` somewhere deep in a render.
    const byDay: Record<string, DayPlan> = {};
    const src = blob.byDay;
    if (typeof src !== "object" || src === null) return null;
    for (const key of Object.keys(src)) {
      const plan = src[key];
      if (isPlan(plan)) byDay[key] = plan;
    }

    return {
      byDay,
      leadMin: typeof blob.leadMin === "number" ? blob.leadMin : DEFAULT_LEAD,
    };
  } catch {
    try {
      Storage.removeItem(KEY);
    } catch {
      // Nothing useful left to do; the next load returns null anyway.
    }
    return null;
  }
}

/** No older versions exist yet. Add a case here when one does. */
function migrate(_blob: Blob): Snapshot | null {
  return null;
}

/**
 * Fire-and-forget. `setItem` is the async variant on purpose — writing is not
 * on any render path, and keeping it off the JS thread's critical section
 * matters more than knowing exactly when it lands.
 */
export function save(snap: Snapshot): void {
  // Days accumulate: deleting a day's last range leaves `{ ranges: [] }`
  // behind, and without this the blob grows for as long as the app is used.
  const byDay: Record<string, DayPlan> = {};
  for (const key of Object.keys(snap.byDay)) {
    const plan = snap.byDay[key];
    if (!isDayEmpty(plan)) byDay[key] = plan;
  }

  const blob: Blob = { v: VERSION, byDay, leadMin: snap.leadMin };
  try {
    Storage.setItem(KEY, JSON.stringify(blob));
  } catch {
    // A failed save must never take the app down mid-gesture.
  }
}

/** Minutes of warning before a range starts. */
export const DEFAULT_LEAD = 10;
