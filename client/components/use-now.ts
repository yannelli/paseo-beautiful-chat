import { useSyncExternalStore } from "react";

// One shared ticker for every relative timestamp on screen, instead of a timer per row.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function snapshot(): number {
  return now;
}

/** The current time, refreshed every 30 seconds while any caller is mounted. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
