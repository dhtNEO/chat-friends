import { useSyncExternalStore } from "react";

// The call (Voice.tsx) publishes its state and actions here; settings and
// keyboard shortcuts call the very same functions as the call's buttons.
export type VoiceControls = {
  joined: boolean;
  mic: boolean;
  deaf: boolean;
  sharing: boolean;
  audioBusy: boolean;
  devices: MediaDeviceInfo[];
  device: string;
  noiseSupported: boolean;
  toggleMic: () => Promise<void>;
  toggleDeaf: () => Promise<void>;
  // Push-to-talk: open the microphone while held, close it on release.
  pushToTalk: (down: boolean) => Promise<void>;
  leave: () => Promise<void>;
  toggleStreamSound: () => void;
  setDevice: (id: string) => void;
  setNoise: (on: boolean) => Promise<void>;
  setNoiseMode: (mode: "strong" | "browser") => Promise<void>;
  setMicVolume: (value: number) => void;
};

let current: VoiceControls | null = null;
const listeners = new Set<() => void>();
export function publishVoice(controls: VoiceControls | null) {
  current = controls;
  listeners.forEach((listener) => listener());
}
export const getVoice = () => current;
export function useVoice() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
