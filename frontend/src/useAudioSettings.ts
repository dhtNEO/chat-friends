import { useEffect, useState } from "react";
export type AudioSettings = {
  microphone: number;
  output: number;
  stream: number;
  noise: boolean;
  people: Record<string, number>;
};
const defaults: AudioSettings = {
  microphone: 100,
  output: 100,
  stream: 100,
  noise: true,
  people: {},
};
function volume(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, value))
    : 100;
}
export function useAudioSettings(userId: string) {
  const key = "chat-friends:audio:" + userId;
  const [settings, setSettings] = useState<AudioSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (!saved || typeof saved !== "object") return defaults;
      return {
        microphone: volume(saved.microphone, 200),
        output: volume(saved.output, 100),
        stream: volume(saved.stream, 100),
        noise: saved.noise !== false,
        people: Object.fromEntries(
          Object.entries(saved.people || {})
            .slice(0, 100)
            .map(([id, v]) => [id, volume(v, 200)]),
        ),
      };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      /* private browsing/storage quota */
    }
  }, [key, settings]);
  return [settings, setSettings] as const;
}
