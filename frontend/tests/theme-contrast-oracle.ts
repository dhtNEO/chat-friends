// Independent WCAG oracle; includes fractional interpolated sRGB channels.
export const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function measuredContrast(a: number[], b: number[]) {
  const luminance = (rgb: number[]) =>
    rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function stops(value: string) {
  const colors = value.match(/#[0-9a-f]{6}/gi);
  if (colors?.length !== 2) throw new Error(`Gradiente inesperado: ${value}`);
  return colors.map(channels);
}
export function sampledContrast(ink: number[], value: string) {
  const [a, b] = stops(value);
  return Math.min(
    ...Array.from({ length: 513 }, (_, i) =>
      measuredContrast(
        ink,
        a.map((v, c) => v + ((b[c] - v) * i) / 512),
      ),
    ),
  );
}
