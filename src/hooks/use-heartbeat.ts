import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { heartbeat } from "@/lib/activity.functions";

const INTERVAL_MS = 30_000; // 30 seconds
const INTERACTION_WINDOW_MS = 2 * 60 * 1000; // active if interacted in last 2 min

/**
 * Tracks real user activity.
 * - Always pings every 30s when tab is visible → keeps user "Online"
 * - Only counts as "Active" if there was mouse/keyboard/click in last 2 min
 *
 * Background tabs or idle users stop sending heartbeats → removed from Online.
 */
export function useHeartbeat(enabled: boolean) {
  const send = useServerFn(heartbeat);
  const lastInteractionRef = useRef<number>(Date.now());
  const location = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!enabled) return;

    const bump = () => {
      lastInteractionRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const hadInteraction = Date.now() - lastInteractionRef.current <= INTERACTION_WINDOW_MS;
      try {
        await send({ data: { path: location, hadInteraction } });
      } catch {
        // silent — heartbeat failures should never disrupt the user
      }
    };

    // fire one immediately when mounted/navigated so a fresh page shows up fast
    void tick();
    const id = window.setInterval(tick, INTERVAL_MS);

    return () => {
      window.clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [enabled, send, location]);
}
