// Each person picks their own colors; everything else derives from them in
// style.css with color-mix(). Applied through CSSOM, which the CSP allows.
export const DEFAULT_PRIMARY = "#8b5cf6",
  DEFAULT_SECONDARY = "#ec4899";
export const PRESETS: [string, string, string][] = [
  ["Violeta", DEFAULT_PRIMARY, DEFAULT_SECONDARY],
  ["Oceano", "#0ea5e9", "#22d3ee"],
  ["Floresta", "#16a34a", "#a3e635"],
  ["Pôr do sol", "#f97316", "#facc15"],
  ["Cereja", "#e11d48", "#f472b6"],
  ["Grafite", "#64748b", "#94a3b8"],
];

// Dark text on light colors, white otherwise (WCAG relative luminance).
function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111118" : "#ffffff";
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
}
