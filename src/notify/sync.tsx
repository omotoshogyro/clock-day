import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { usePlannerState } from "../store/planner-context";
import { planKey, planNotifications } from "./plan";

/**
 * Without this, iOS hands a notification that arrives while the app is open
 * straight to the handler and shows nothing. It is the single most common way
 * to conclude that local notifications "don't work in the simulator" when they
 * are firing perfectly.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DEBOUNCE_MS = 400;

/**
 * Keeps the OS's scheduled reminders in step with the plan.
 *
 * Renders nothing and lives as a *sibling* of the screen rather than inside it.
 * That is deliberate: it puts none of this state in the screen's render scope,
 * so it is structurally incapable of destabilising the single Pan's dependency
 * array — which is the one invariant this codebase cannot afford to lose.
 */
export function NotificationSync() {
  const { byDay, leadMin } = usePlannerState();

  const [granted, setGranted] = useState<boolean | null>(null);
  const askedRef = useRef(false);
  /** Guards against two reschedules interleaving — see the note below. */
  const runRef = useRef(0);
  const appliedRef = useRef<string>("");

  useEffect(() => {
    let alive = true;
    Notifications.getPermissionsAsync().then((p) => {
      if (alive) setGranted(p.granted ? true : p.canAskAgain ? null : false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const run = () => {
      void reconcile();
    };
    const t = setTimeout(run, DEBOUNCE_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });

    // Fires at the next local midnight and re-arms, so the horizon moves with
    // the day. It cannot fire while backgrounded — JS is suspended — but the
    // AppState handler above covers the return, and together they are complete.
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 1, 0);
    const midnightTimer = setTimeout(run, nextMidnight.getTime() - Date.now());

    return () => {
      clearTimeout(t);
      clearTimeout(midnightTimer);
      sub.remove();
    };

    async function reconcile() {
      const wanted = planNotifications(byDay, leadMin, new Date());

      // Ask only when a reminder is actually about to matter — in practice the
      // moment the first range is committed. Asking at launch is what earns a
      // permanent one-tap denial.
      if (granted === null && wanted.length > 0 && !askedRef.current) {
        askedRef.current = true;
        const res = await Notifications.requestPermissionsAsync();
        setGranted(res.granted);
        if (!res.granted) return;
      }
      if (granted === false) return;
      if (granted === null && wanted.length === 0) return;

      const key = planKey(wanted);
      // Cancel-all is only safe because of this: without it, every foreground
      // would tear down and rebuild the set, opening a window in which
      // something due in two seconds is cancelled and never re-fires.
      if (key === appliedRef.current) return;

      const myRun = (runRef.current += 1);
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (runRef.current !== myRun) return;

      for (const c of wanted) {
        await Notifications.scheduleNotificationAsync({
          identifier: c.id,
          content: {
            title: c.title,
            body: c.body,
            data: { dayKey: c.dayKey, rangeId: c.rangeId, kind: c.kind },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: c.at,
          },
        });
        // A newer run started mid-flight; its cancel-all already wiped what we
        // wrote, so stop rather than interleave into a set matching neither.
        if (runRef.current !== myRun) return;
      }

      appliedRef.current = key;

      if (__DEV__) {
        console.log(
          `[notify] ${wanted.length} scheduled`,
          wanted.map((c) => `${c.at.toString()} ${c.kind} ${c.title}`)
        );
      }
    }
  }, [byDay, leadMin, granted]);

  return null;
}
