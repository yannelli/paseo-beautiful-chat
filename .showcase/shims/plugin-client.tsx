import { presentationSchema } from "../../shared/presentation-settings";

/**
 * Host-injected client hooks, stubbed for the offline screenshot harness.
 * Only the shapes the presentational path touches are provided.
 */
export function usePaseo() {
  return {} as never;
}

export function useAgent<T>(_agentId: string, selector: (agent: never) => T): T | null {
  void selector;
  return null;
}

export function useWorkspace<T>(_workspaceId: string, selector: (workspace: never) => T): T | null {
  void selector;
  return null;
}

export function useRpc() {
  return async () => ({}) as never;
}

export function useSettings() {
  return {
    status: "ready",
    revision: "showcase",
    values: presentationSchema.parse({}),
    saving: false,
    saveError: null,
    save: async () => true,
    reset: async () => true,
    reload: async () => {},
  } as never;
}

export async function openExternalUrl(url: string): Promise<void> {
  globalThis.open?.(url, "_blank", "noopener,noreferrer");
}
