import { useCallback, useEffect, useState } from "react";
export const DESTINATIONS = [
  ["conversa", "Conversa", "chat", "chat"],
  ["sala", "Sala", "voice", "speaker"],
  ["jogos", "Jogos", "games", "games"],
  ["agenda", "Agenda", "outlook", "calendar"],
] as const;
export type Destination = (typeof DESTINATIONS)[number][0];
export function readDestination(hash: string): Destination {
  return DESTINATIONS.find(([id]) => hash === `#/v1/${id}`)?.[0] ?? "conversa";
}
export const shellKey = (account: string) => `chat-friends:shell:v1:${account}`;
export function useNavigation(account: string) {
  const [destination, setDestination] = useState(() =>
    readDestination(location.hash),
  );
  const [advanced, setMode] = useState(() => {
    const override = new URLSearchParams(location.search).get("shell");
    if (override === "advanced" || override === "simple")
      return override === "advanced";
    try {
      return localStorage.getItem(shellKey(account)) === "advanced";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const sync = () => {
      const next = readDestination(location.hash);
      if (location.hash !== `#/v1/${next}`)
        history.replaceState(null, "", `#/v1/${next}`);
      setDestination(next);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const navigate = useCallback((next: Destination) => {
    if (location.hash !== `#/v1/${next}`)
      history.pushState(null, "", `#/v1/${next}`);
    setDestination(next);
  }, []);
  const setAdvanced = (next: boolean) => {
    setMode(next);
    // Explicit changes replace a URL override too, so reload honors the choice.
    const url = new URL(location.href);
    url.searchParams.delete("shell");
    history.replaceState(null, "", url);
    try {
      localStorage.setItem(shellKey(account), next ? "advanced" : "simple");
    } catch {
      /* applies to this visit */
    }
  };
  return { destination, navigate, advanced, setAdvanced };
}
