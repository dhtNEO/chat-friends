import fs from "node:fs";
import { spawnSync } from "node:child_process";
const status = JSON.parse(fs.readFileSync(0, "utf8"));
const ip = status.TailscaleIPs?.find((x) => /^100\./.test(x));
const domain = status.Self?.DNSName?.replace(/\.$/, "");
if (
  status.BackendState !== "Running" ||
  !ip ||
  !domain ||
  status.Self?.Tags?.length ||
  !status.CertDomains?.includes(domain)
)
  throw new Error(
    "Nó precisa estar autenticado, sem tags e com MagicDNS/HTTPS habilitados",
  );
const file = ".env";
const original = fs.readFileSync(file, "utf8");
const updates = {
  APP_ORIGIN: `https://${domain}`,
  LIVEKIT_PUBLIC_URL: `wss://${domain}`,
  COOKIE_SECURE: "true",
  LIVEKIT_NODE_IP: ip,
  LIVEKIT_INTERNAL_URL: "http://livekit:7880",
};
let next = original;
for (const [key, value] of Object.entries(updates)) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  next = pattern.test(next)
    ? next.replace(pattern, `${key}=${value}`)
    : next + `\n${key}=${value}\n`;
}
const nodePath = "infra/compose/generated/tailscale-node.json";
fs.writeFileSync(
  nodePath,
  JSON.stringify({
    state: status.BackendState,
    ip,
    domain,
    dockerIP: process.argv[2],
    https: true,
  }),
  { mode: 0o600 },
);
fs.writeFileSync(file, next, { mode: 0o600 });
const result = spawnSync(
  process.execPath,
  ["scripts/render-config.mjs", "tailscale"],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  fs.writeFileSync(file, original, { mode: 0o600 });
  fs.rmSync(nodePath, { force: true });
  process.exit(1);
}
console.log(
  "Nó validado; configuração HTTPS e mídia atualizada sem exibir credenciais.",
);
