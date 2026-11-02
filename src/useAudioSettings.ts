import { useCallback, useSyncExternalStore } from "react";
export type AudioSettings = {
  microphone: number;
  output: number;
  stream: number;
  music: number;
  effects: number;
  noise: boolean;
  // "strong" runs RNNoise in the browser; "browser" uses the native filter.
  noiseMode: "strong" | "browser";
  hideCursor: boolean;
  people: Record<string, number>;
};
const defaults: AudioSettings = {
  microphone: 100,
  output: 100,
  stream: 100,
  music: 70,
  effects: 60,
  noise: true,
  noiseMode: "strong",
  hideCursor: true,
  people: {},
};
function volume(value: unknown, maximum: number, fallback = 100) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, value))
    : fallback;
}
function load(key: string): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return defaults;
    return {
      microphone: volume(saved.microphone, 200),
      output: volume(saved.output, 100),
      stream: volume(saved.stream, 100),
      music: volume(saved.music, 100, defaults.music),
      effects: volume(saved.effects, 100, defaults.effects),
      noise: saved.noise !== false,
      noiseMode: saved.noiseMode === "browser" ? "browser" : "strong",
      hideCursor: saved.hideCursor !== false,
      people: Object.fromEntries(
        Object.entries(saved.people || {})
          .slice(0, 100)
          .map(([id, v]) => [id, volume(v, 200)]),
      ),
    };
  } catch {
    return defaults;
  }
}

// One store per account, shared by the call, the settings panel and the
// shortcuts, so a change made in one place shows everywhere at once.
type Store = {
  value: AudioSettings;
  listeners: Set<() => void>;
};
const stores = new Map<string, Store>();
function store(key: string) {
  let s = stores.get(key);
  if (!s) {
    s = { value: load(key), listeners: new Set() };
    stores.set(key, s);
  }
  return s;
}

export function useAudioSettings(userId: string) {
  const key = "chat-friends:audio:" + userId,
    s = store(key);
  const value = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        s.listeners.add(listener);
        return () => s.listeners.delete(listener);
      },
      [s],
    ),
    () => s.value,
  );
  const set = useCallback(
    (update: AudioSettings | ((old: AudioSettings) => AudioSettings)) => {
      s.value = typeof update === "function" ? update(s.value) : update;
      try {
        localStorage.setItem(key, JSON.stringify(s.value));
      } catch {
        /* private browsing/storage quota */
      }
      s.listeners.forEach((listener) => listener());
    },
    [key, s],
  );
  return [value, set] as const;
}
