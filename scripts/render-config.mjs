import fs from "node:fs";
import crypto from "node:crypto";
const mode = process.argv[2] || "local";
if (!["local", "internet"].includes(mode))
  throw new Error("Modo deve ser local ou internet");
if (!fs.existsSync(".env")) {
  if (mode !== "local")
    throw new Error("Crie .env com os domínios e IP antes de usar internet");
  let env = fs
    .readFileSync(".env.example", "utf8")
    .replace(
      "SUBSTITUA_POR_UM_SEGREDO_ALEATORIO",
      crypto.randomBytes(32).toString("hex"),
    )
    .replace(
      "SUBSTITUA_POR_CHAVE_UNICA",
      "CF" + crypto.randomBytes(12).toString("hex"),
    )
    .replace(
      "SUBSTITUA_POR_SEGREDO_ALEATORIO_32_BYTES",
      crypto.randomBytes(32).toString("hex"),
    );
  fs.writeFileSync(".env", env, { mode: 0o600, flag: "wx" });
}
const values = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      if (i < 1) throw new Error("Linha inválida em .env");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
for (const key of [
  "POSTGRES_PASSWORD",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
])
  if (
    !values[key] ||
    values[key].startsWith("SUBSTITUA") ||
    !values[key].match(/^[a-zA-Z0-9_-]{16,128}$/)
  )
    throw new Error(key + ": use 16–128 caracteres alfanuméricos, _ ou -");
if (values.LIVEKIT_API_SECRET.length < 32)
  throw new Error("LIVEKIT_API_SECRET deve ter >=32 caracteres");
const ip = values.LIVEKIT_NODE_IP || "127.0.0.1";
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split(".").some((x) => +x > 255))
  throw new Error("LIVEKIT_NODE_IP deve ser IPv4");
if (mode === "internet") {
  if (
    values.COOKIE_SECURE !== "true" ||
    !values.APP_ORIGIN?.startsWith("https://") ||
    !values.LIVEKIT_PUBLIC_URL?.startsWith("wss://") ||
    ip === "127.0.0.1"
  )
    throw new Error(
      "Internet requer HTTPS, WSS, COOKIE_SECURE=true e IP anunciado alcançável",
    );
  for (const k of ["APP_DOMAIN", "MEDIA_DOMAIN"])
    if (
      !/^[a-zA-Z0-9.-]+$/.test(values[k] || "") ||
      values[k].endsWith("example.com")
    )
      throw new Error("Preencha " + k);
  if (
    values.APP_ORIGIN !== "https://" + values.APP_DOMAIN ||
    values.LIVEKIT_PUBLIC_URL !== "wss://" + values.MEDIA_DOMAIN
  )
    throw new Error("URLs devem corresponder aos domínios");
}
fs.mkdirSync("infra/compose/generated", { recursive: true, mode: 0o700 });
fs.writeFileSync(
  "infra/compose/generated/livekit.yaml",
  `port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false
  node_ip: ${JSON.stringify(ip)}
  # Docker forwards media to eth0, never to the container loopback socket.
  enable_loopback_candidate: false
room:
  max_participants: 16
  empty_timeout: 60
keys:
  ${JSON.stringify(values.LIVEKIT_API_KEY)}: ${JSON.stringify(values.LIVEKIT_API_SECRET)}
webhook:
  api_key: ${JSON.stringify(values.LIVEKIT_API_KEY)}
  urls: ["http://backend:8080/api/livekit/webhook"]
logging:
  level: warn
`,
  { mode: 0o600 },
);
fs.chmodSync(".env", 0o600);
if (process.env.CHAT_TURN === "true") {
  const domain = values.TURN_DOMAIN;
  if (
    !domain ||
    !domain.match(/^[a-zA-Z0-9.-]+$/) ||
    domain.endsWith("example.com")
  )
    throw new Error("Preencha TURN_DOMAIN");
  for (const file of ["fullchain.pem", "privkey.pem"])
    if (!fs.existsSync("infra/compose/generated/turn-certs/" + file))
      throw new Error("Certificado TURN ausente: " + file);
  fs.appendFileSync(
    "infra/compose/generated/livekit.yaml",
    `turn:
  enabled: true
  domain: ${JSON.stringify(domain)}
  tls_port: 5349
  udp_port: 3478
  cert_file: /etc/turn-certs/fullchain.pem
  key_file: /etc/turn-certs/privkey.pem
  external_tls: false
`,
  );
}
console.log("Configuração validada e gerada; segredos não exibidos.");
