import { test, expect } from "@playwright/test";
import {
  PRESETS,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  deriveTheme,
  textOn,
  contrast,
  gradientContrast,
} from "../src/theme";

import {
  channels,
  measuredContrast,
  sampledContrast,
} from "./theme-contrast-oracle";

test("oráculo WCAG e regressão Oceano não usam limiar de luminância", () => {
  expect(contrast("#000000", "#ffffff")).toBe(21);
  expect(contrast("#ffffff", "#0ea5e9")).toBeCloseTo(2.7714, 4);
  expect(textOn("#0ea5e9")).toBe("#000000");
  // Extremes alone do not describe a red/green sRGB gradient.
  expect(gradientContrast("#000000", "#ff0000", "#00ff00")).toBeLessThan(
    contrast("#000000", "#ff0000"),
  );
});

test("presets, extremos, cores médias e amostra determinística passam pares funcionais", () => {
  test.setTimeout(60000);
  const pairs = PRESETS.map(([, p, s]) => [p, s]);
  for (const p of [
    "#ffffff",
    "#000000",
    "#777777",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#0000ff",
  ])
    for (const s of ["#ffffff", "#000000", "#777777"]) pairs.push([p, s]);
  let seed = 1707;
  for (let i = 0; i < 128; i++) {
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return `#${(seed & 0xffffff).toString(16).padStart(6, "0")}`;
    };
    pairs.push([next(), next()]);
  }
  const surfaces = [
    "#080916",
    "#0c0d13",
    "#12131b",
    "#171821",
    "#1f202c",
    "#282a38",
    "#353846",
  ];
  for (const [p, s] of pairs) {
    const t = deriveTheme(p, s);
    expect(t["--primary"]).toBe(p);
    expect(t["--secondary"]).toBe(s);
    for (const bg of ["--accent-strong", "--accent-hover", "--accent-active"])
      expect(
        measuredContrast(channels(t["--on-primary"]), channels(t[bg])),
        `${p}/${s} ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    for (const bg of ["--gradient", "--gradient-hover", "--gradient-active"])
      expect(
        sampledContrast(channels(t["--on-gradient"]), t[bg]),
        `${p}/${s} ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    for (const bg of [...surfaces, t["--accent-soft"]]) {
      for (const ink of ["--accent", "--secondary-text"])
        expect(
          measuredContrast(channels(t[ink]), channels(bg)),
        ).toBeGreaterThanOrEqual(4.5);
      expect(
        measuredContrast(channels(t["--control-border"]), channels(bg)),
      ).toBeGreaterThanOrEqual(3);
      expect(
        sampledContrast(channels(bg), t["--indicator-gradient"]),
      ).toBeGreaterThanOrEqual(3);
    }
    expect(
      measuredContrast(channels(t["--focus-ring"]), channels(t["--focus-gap"])),
    ).toBeGreaterThanOrEqual(3);
    expect(
      sampledContrast([70, 71, 80], t["--text-gradient"]),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test("restauração inválida usa fallback por campo sem mutar preferência", () => {
  for (const invalid of [
    null,
    undefined,
    "",
    "red",
    "#abc",
    "#zzzzzz",
    "#12345678",
    "url(https://invalid.test)",
    123,
    {},
  ]) {
    const t = deriveTheme(invalid, "#AABBCC");
    expect(t["--primary"]).toBe(DEFAULT_PRIMARY);
    expect(t["--secondary"]).toBe("#aabbcc");
  }
  expect(deriveTheme("#000000", "bad")["--secondary"]).toBe(DEFAULT_SECONDARY);
});
