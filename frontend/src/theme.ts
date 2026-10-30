// Original preferences remain intact; functional tokens derive from contrast.
// Applied through CSSOM, which the CSP allows.
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

export function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) =>
  "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const blend = (a: number[], b: number[], t: number) =>
  a.map((v, i) => v + (b[i] - v) * t);
const mix = (a: string, b: string, t: number) =>
  toHex(blend(rgb(a), rgb(b), t));
function luminanceRgb(values: number[]) {
  const [r, g, b] = values.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const luminance = (hex: string) => luminanceRgb(rgb(hex));
const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
export const contrast = (a: string, b: string) =>
  ratio(luminance(a), luminance(b));
export const textOn = (hex: string) =>
  contrast("#000000", hex) >= contrast("#ffffff", hex) ? "#000000" : "#ffffff";

// Luminance along an sRGB segment is convex: its maximum is at an endpoint,
// its minimum may be inside (e.g. saturated red/green). Search that minimum
// without rounding intermediate pixels. CSS gradients explicitly use sRGB too.
function gradientLuminance(a: string, b: string) {
  const x = rgb(a),
    y = rgb(b);
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 64; i++) {
    const l = lo + (hi - lo) / 3,
      r = hi - (hi - lo) / 3;
    if (luminanceRgb(blend(x, y, l)) < luminanceRgb(blend(x, y, r))) hi = r;
    else lo = l;
  }
  return {
    min: Math.min(
      luminance(a),
      luminance(b),
      luminanceRgb(blend(x, y, (lo + hi) / 2)),
    ),
    max: Math.max(luminance(a), luminance(b)),
  };
}
export function gradientContrast(foreground: string, a: string, b: string) {
  const { min, max } = gradientLuminance(a, b),
    fg = luminance(foreground);
  return fg >= min && fg <= max ? 1 : Math.min(ratio(fg, min), ratio(fg, max));
}

// Quantized hex tokens retain a small margin above the acceptance threshold.
function readable(
  hex: string,
  backgrounds: string[] = ["#12131b"],
  minimum = 4.5,
) {
  for (let i = 0; i <= 100; i++) {
    const color = mix(hex, "#ffffff", i / 100);
    if (backgrounds.every((bg) => contrast(color, bg) >= minimum + 0.1))
      return color;
  }
  return "#ffffff";
}
function fitFill(a: string, b: string, foreground: string) {
  const target = foreground === "#ffffff" ? "#000000" : "#ffffff";
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2;
    if (
      gradientContrast(foreground, mix(a, target, t), mix(b, target, t)) >= 4.6
    )
      hi = t;
    else lo = t;
  }
  return [mix(a, target, hi), mix(b, target, hi)] as const;
}
const gradient = (a: string, b: string) =>
  `linear-gradient(135deg in srgb, ${a}, ${b})`;
// All personalized foregrounds are used on these surfaces (normal/hover/soft).
export const THEME_SURFACES = [
  "#080916",
  "#0c0d13",
  "#12131b",
  "#171821",
  "#1f202c",
  "#282a38",
  "#353846",
];
export function deriveTheme(primary?: unknown, secondary?: unknown) {
  const p = normalizeColor(primary, DEFAULT_PRIMARY),
    s = normalizeColor(secondary, DEFAULT_SECONDARY);
  const soft = mix("#171821", p, 0.18),
    surfaces = [...THEME_SURFACES, soft];
  const foreground = textOn(p);
  const hover = fitFill(
    mix(p, "#ffffff", 0.15),
    mix(p, "#ffffff", 0.15),
    foreground,
  )[0];
  const active = fitFill(
    mix(p, "#000000", 0.12),
    mix(p, "#000000", 0.12),
    foreground,
  )[0];
  const options = ["#000000", "#ffffff"]
    .map((ink) => {
      const [a, b] = fitFill(p, s, ink);
      const cost = [...rgb(a), ...rgb(b)].reduce(
        (sum, value, i) => sum + Math.abs(value - [...rgb(p), ...rgb(s)][i]),
        0,
      );
      return { a, b, ink, cost };
    })
    .sort((a, b) => a.cost - b.cost);
  const fill = options[0];
  const gradientHover = fitFill(
    mix(fill.a, "#ffffff", 0.12),
    mix(fill.b, "#ffffff", 0.12),
    fill.ink,
  );
  const gradientActive = fitFill(
    mix(fill.a, "#000000", 0.12),
    mix(fill.b, "#000000", 0.12),
    fill.ink,
  );
  // Each endpoint is >=4.5 against surfaces; check their interior as well.
  let indicatorA = "#ffffff",
    indicatorB = "#ffffff";
  for (let i = 0; i <= 100; i++) {
    const a = mix(p, "#ffffff", i / 100),
      b = mix(s, "#ffffff", i / 100);
    if (surfaces.every((bg) => gradientContrast(bg, a, b) >= 4.6)) {
      indicatorA = a;
      indicatorB = b;
      break;
    }
  }
  // Upper bound for login decoration: both glows + floor overlap at white.
  // Keep these alpha values aligned with .login-page and its ::after in CSS.
  const loginBackdrop = mix(
    mix(mix("#080916", "#ffffff", 0.12), "#ffffff", 0.08),
    "#ffffff",
    0.7 * 0.1,
  );
  let titleA = "#ffffff",
    titleB = "#ffffff";
  for (let i = 0; i <= 100; i++) {
    const a = mix(p, "#ffffff", i / 100),
      b = mix(s, "#ffffff", i / 100);
    if (gradientContrast(loginBackdrop, a, b) >= 4.6) {
      titleA = a;
      titleB = b;
      break;
    }
  }
  return {
    "--primary": p,
    "--secondary": s,
    "--on-primary": foreground,
    "--accent-strong": p,
    "--accent-hover": hover,
    "--accent-active": active,
    "--accent": readable(p, surfaces),
    "--accent-soft": soft,
    "--secondary-text": readable(s, surfaces),
    "--control-border": readable(p, surfaces, 3),
    "--on-gradient": fill.ink,
    "--gradient": gradient(fill.a, fill.b),
    "--gradient-hover": gradient(...gradientHover),
    "--gradient-active": gradient(...gradientActive),
    "--indicator-gradient": gradient(indicatorA, indicatorB),
    "--text-gradient": gradient(titleA, titleB),
    "--focus-ring": "#ffffff",
    "--focus-gap": "#080916",
    ...logoColors(p, s),
  };
}

// Colors of the VGH logo (Logo.tsx), derived from the person's two colors.
function logoColors(primary: string, secondary: string) {
  const p = readable(primary, undefined, 3),
    s = readable(secondary, undefined, 3),
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
  for (const [name, value] of Object.entries(deriveTheme(primary, secondary)))
    document.documentElement.style.setProperty(name, value);
}
