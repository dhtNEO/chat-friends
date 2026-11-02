import joinUrl from "./sounds/entrar.mp3";
import leaveUrl from "./sounds/sair.mp3";

export type Effect = "join" | "leave" | "mute" | "unmute";
export const EFFECTS: [Effect, string][] = [
  ["join", "Entrar na call"],
  ["leave", "Sair da call"],
  ["mute", "Mutar"],
  ["unmute", "Desmutar"],
];
export const CHOICES = {
  rizz: "Rizz",
  fortnite: "Fortnite",
  down: "Bipe descendo",
  up: "Bipe subindo",
  none: "Nenhum",
  custom: "Meu arquivo",
} as const;
export type Choice = keyof typeof CHOICES;
export type SoundSettings = {
  choice: Record<Effect, Choice>;
  // Custom files as data: URLs, kept only in this browser.
  custom: Partial<Record<Effect, string>>;
};
const defaults: SoundSettings = {
  choice: { join: "rizz", leave: "fortnite", mute: "down", unmute: "up" },
  custom: {},
};
export const MAX_SOUND_BYTES = 300_000,
  MAX_SOUND_SECONDS = 5;

// Short two-note blips, rendered once as WAV so no extra files are needed.
// Plain <audio> playback keeps effects out of the call's Web Audio graph.
function blip(notes: number[]) {
  const rate = 22050,
    noteLength = 0.07,
    samples = Math.round(rate * noteLength * notes.length);
  const data = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate,
      note = notes[Math.min(notes.length - 1, Math.floor(t / noteLength))],
      local = t % noteLength,
      // Quick attack and decay per note avoids clicks.
      envelope = Math.min(1, local / 0.005) * Math.exp(-local * 30);
    const value = Math.sin(2 * Math.PI * note * t) * envelope * 0.5;
    data.setInt16(44 + i * 2, value * 0x7fff, true);
  }
  return URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
}

// The CSP allows blob: media but not data:, so custom files become blobs.
const blobs = new Map<string, string>();
function blobUrl(dataUrl: string) {
  let url = blobs.get(dataUrl);
  if (!url) {
    const [head, base64] = dataUrl.split(","),
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    url = URL.createObjectURL(
      new Blob([bytes], { type: head.slice(5).split(";")[0] }),
    );
    blobs.set(dataUrl, url);
  }
  return url;
}

let blips: { up: string; down: string } | undefined;
function url(effect: Effect, settings: SoundSettings) {
  const choice = settings.choice[effect];
  if (choice === "rizz") return joinUrl;
  if (choice === "fortnite") return leaveUrl;
  if (choice === "custom") {
    const data = settings.custom[effect];
    return data ? blobUrl(data) : undefined;
  }
  if (choice === "none") return undefined;
  blips ??= { up: blip([587, 880]), down: blip([880, 587]) };
  return blips[choice];
}

let current = defaults;
const key = (userId: string) => "chat-friends:sounds:" + userId;
export function loadSounds(userId: string): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) || "null");
    current = {
      choice: { ...defaults.choice, ...saved?.choice },
      custom: { ...saved?.custom },
    };
  } catch {
    current = defaults;
  }
  return current;
}
export function saveSounds(userId: string, settings: SoundSettings) {
  current = settings;
  try {
    localStorage.setItem(key(userId), JSON.stringify(settings));
  } catch {
    throw new Error("Sem espaço no navegador para esse arquivo.");
  }
}

// Checks size and length, and returns the file as a data: URL to store.
export async function readSound(file: File) {
  if (file.size > MAX_SOUND_BYTES)
    throw new Error("Arquivo de som maior que 300 KB.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
  const audio = new Audio(blobUrl(dataUrl));
  const seconds = await new Promise<number>((resolve, reject) => {
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => reject(new Error("Formato de áudio não suportado."));
  });
  if (seconds > MAX_SOUND_SECONDS)
    throw new Error("O som precisa ter até 5 segundos.");
  return dataUrl;
}

// volume is 0..1; effects never stop the call if the browser refuses playback.
export function playEffect(
  effect: Effect,
  volume: number,
  settings: SoundSettings = current,
) {
  const src = url(effect, settings);
  if (volume <= 0 || !src) return;
  const audio = new Audio(src);
  audio.volume = Math.min(1, volume);
  void audio.play().catch(() => {});
}
