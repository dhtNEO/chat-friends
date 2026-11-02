// Each person picks their own colors; everything else derives from them in
// style.css with color-mix(). Applied through CSSOM, which the CSP allows.
// The VGH brand kit purple is the default for anyone who has not chosen.
export const DEFAULT_PRIMARY = "#7d3cff",
  DEFAULT_SECONDARY = "#b980fa";
export const PRESETS: [string, string, string][] = [
  ["VGH Roxo", DEFAULT_PRIMARY, DEFAULT_SECONDARY],
  ["Violeta", "#8b5cf6", "#ec4899"],
  ["Oceano", "#0ea5e9", "#22d3ee"],
  ["Floresta", "#16a34a", "#a3e635"],
  ["Pôr do sol", "#f97316", "#facc15"],
  ["Cereja", "#e11d48", "#f472b6"],
  ["Grafite", "#64748b", "#94a3b8"],
];

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) =>
  "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a),
    y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
// WCAG relative luminance and contrast.
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Dark text on light colors, white otherwise.
const textOn = (hex: string) => (luminance(hex) > 0.4 ? "#111118" : "#ffffff");
// Lighten a color only as much as needed to read on the dark interface.
function readable(hex: string, background = "#12131b") {
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(hex, "#ffffff", t);
    if (contrast(c, background) >= 3) return c;
  }
  return "#ffffff";
}

// Colors of the VGH logo (Logo.tsx), derived from the person's two colors.
function logoColors(primary: string, secondary: string) {
  const p = readable(primary),
    s = readable(secondary),
    deep = mix(p, "#000000", 0.4);
  return {
    "--logo-roof-a": mix(p, "#ffffff", 0.5),
    "--logo-roof-b": p,
    "--logo-roof-c": s,
    "--logo-pad-b": mix(p, "#ffffff", 0.88),
    "--logo-pad-c": mix(p, "#ffffff", 0.45),
    "--logo-letter": mix(p, "#ffffff", 0.82),
    "--logo-accent": mix(s, "#ffffff", 0.2),
    // Controller buttons must stay dark against the light controller.
    "--logo-ink":
      contrast(deep, "#f4eeff") < 4 ? mix(deep, "#000000", 0.35) : deep,
  };
}

// Interface size is per browser (it depends on the monitor), not per account.
export const SCALES: [string, string][] = [
  ["", "Automático (pelo tamanho da tela)"],
  ["0.9", "Compacto (90%)"],
  ["1", "Normal (100%)"],
  ["1.15", "Grande (115%)"],
  ["1.3", "Maior (130%)"],
  ["1.5", "Enorme (150%)"],
  ["1.75", "Telão (175%)"],
];
const SCALE_KEY = "chat-friends:ui-scale";
export function loadScale() {
  try {
    return localStorage.getItem(SCALE_KEY) ?? "";
  } catch {
    return "";
  }
}
export function applyScale(value: string, save = false) {
  const root = document.documentElement.style;
  if (value) root.setProperty("--ui-scale", value);
  else root.removeProperty("--ui-scale");
  if (save)
    try {
      if (value) localStorage.setItem(SCALE_KEY, value);
      else localStorage.removeItem(SCALE_KEY);
    } catch {
      /* the choice still applies to this visit */
    }
}

export function applyTheme(primary?: string | null, secondary?: string | null) {
  const root = document.documentElement.style,
    p = primary || DEFAULT_PRIMARY,
    s = secondary || DEFAULT_SECONDARY;
  root.setProperty("--primary", p);
  root.setProperty("--secondary", s);
  root.setProperty("--on-primary", textOn(p));
  for (const [name, value] of Object.entries(logoColors(p, s)))
    root.setProperty(name, value);
}
