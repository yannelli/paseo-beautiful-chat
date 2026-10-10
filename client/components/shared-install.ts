interface Installation {
  refs: number;
  dispose: () => void;
}

// Runs `install` once per page and undoes it when the last caller releases.
// The count lives on globalThis, not in module scope: two hosts, or a reload
// that mounts before the old cleanup, each load their own copy of this module.
export function installShared(key: string, install: () => () => void): () => void {
  const slot = Symbol.for(`beautiful-chat/${key}`);
  const scope = globalThis as unknown as Record<symbol, Installation | undefined>;
  let entry = scope[slot];
  if (!entry) {
    entry = { refs: 0, dispose: install() };
    scope[slot] = entry;
  }
  entry.refs += 1;
  const held = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.refs -= 1;
    if (held.refs > 0) return;
    if (scope[slot] === held) delete scope[slot];
    held.dispose();
  };
}
