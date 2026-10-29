import { useCallback, useEffect, useState } from "preact/hooks";
import type { Dim } from "../settings.ts";

export type ZooState = Readonly<Record<Dim | "view" | "repo" | "compare", string>>;

const readHash = (): Partial<ZooState> => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));

export function useHashState(defaults: ZooState): [ZooState, (changes: Partial<ZooState>) => void] {
  const [state, setState] = useState<ZooState>(() => ({ ...defaults, ...readHash() }));
  useEffect(() => {
    const onHashChange = () => setState((current) => ({ ...current, ...readHash() }));
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);
  const update = useCallback((changes: Partial<ZooState>) => {
    setState((current) => {
      const next = { ...current, ...changes };
      history.replaceState(null, "", `#${new URLSearchParams(next).toString()}`);
      return next;
    });
  }, []);
  return [state, update];
}
