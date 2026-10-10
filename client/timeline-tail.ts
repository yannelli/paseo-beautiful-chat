import { useCallback, useSyncExternalStore } from "react";

// Which plugin item is newest, per agent: a renderer knows only its own item, so the latest arrival wins.
// One shared value let a newer chat in another pane hide an older chat's footer.
interface Tail {
  key: string;
  at: number;
}

const tails = new Map<string, Tail>();
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

/** Records an item's arrival. A later arrival takes the tail; ties keep the incumbent. */
export function noteTimelineItem(agentId: string, key: string, at: number): void {
  const tail = tails.get(agentId);
  if (tail && (at < tail.at || (at === tail.at && key !== tail.key))) return;
  if (tail && tail.key === key && tail.at === at) return;
  tails.set(agentId, { key, at });
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while this item is the newest one the plugin has drawn for its agent. */
export function useIsTimelineTail(agentId: string, key: string): boolean {
  const getSnapshot = useCallback(() => tails.get(agentId)?.key === key, [agentId, key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
