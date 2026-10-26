import { isIP } from "node:net";
export function publicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const n = ip.split(".").reduce((v, x) => v * 256 + Number(x), 0) >>> 0;
  const ranges = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !ranges.some(([base, bits]) => {
    const first =
      base.split(".").reduce((v, x) => v * 256 + Number(x), 0) >>> 0;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (first & mask);
  });
}
export function hostname(value) {
  return (
    typeof value === "string" &&
    value.length <= 253 &&
    isIP(value) === 0 &&
    value.includes(".") &&
    value
      .split(".")
      .every((p) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(p))
  );
}
export function email(value) {
  return (
    typeof value === "string" && /^[^\s@{}]+@[^\s@{}]+\.[^\s@{}]+$/.test(value)
  );
}
export function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        if (i < 1) throw new Error("Arquivo env inválido");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
