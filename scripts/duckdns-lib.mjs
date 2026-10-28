import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { Resolver } from "node:dns/promises";
import {
  publicIPv4,
  email,
  parseEnv,
  httpsPort,
  portSuffix,
} from "./network-config.mjs";
export class DuckDNSError extends Error {}
export const directory = "infra/compose/generated/duckdns";
export function atomic(file, data) {
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, data, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
export function settings(value) {
  httpsPort(value.httpsPort ?? 18443);
  for (const key of ["appDomain", "mediaDomain"])
    if (
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org$/.test(
        value[key] || "",
      )
    )
      throw new DuckDNSError("Use dois nomes DuckDNS registrados e válidos");
  if (
    value.appDomain === value.mediaDomain ||
    !email(value.email) ||
    !publicIPv4(value.wanIP)
  )
    throw new DuckDNSError(
      "Nomes precisam ser distintos, email válido e WAN IPv4 público",
    );
  return value;
}
export async function text(
  url,
  fetcher = fetch,
  pause = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (!response.ok) throw new DuckDNSError();
      const body = (await response.text()).trim();
      if (body.length > 1024) throw new DuckDNSError();
      return body;
    } catch {
      if (attempt === 2)
        throw new DuckDNSError(
          "Serviço HTTPS indisponível; credenciais omitidas",
        );
      await pause(500 * (attempt + 1));
    }
  }
}
async function records(resolver, domain, ip) {
  const addresses = await resolver.resolve4(domain);
  if (addresses.length !== 1 || addresses[0] !== ip)
    throw new DuckDNSError("Registro A ainda não corresponde ao IPv4 esperado");
  try {
    if ((await resolver.resolve6(domain)).length)
      throw new DuckDNSError("Remova o registro AAAA antes do piloto IPv4");
  } catch (error) {
    if (!["ENODATA", "ENOTFOUND"].includes(error.code)) throw error;
  }
}
export async function verifyDNS(
  domain,
  ip,
  {
    recursive = new Resolver({ timeout: 2000, tries: 1 }),
    authority = new Resolver({ timeout: 2000, tries: 1 }),
  } = {},
) {
  const names = await recursive.resolveNs("duckdns.org");
  if (!names.length) throw new DuckDNSError("DNS autoritativo indisponível");
  const servers = await recursive.resolve4(names[0]);
  authority.setServers(servers);
  await records(authority, domain, ip);
  await records(recursive, domain, ip);
}
export function fingerprint(root) {
  return crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(
        path.join(root, "infra/compose/generated/network/network.env"),
      ),
    )
    .update(
      fs.readFileSync(
        path.join(root, "infra/compose/generated/network/livekit.yaml"),
      ),
    )
    .digest("hex");
}
export async function prepare(
  root,
  {
    initial = false,
    allowOriginChange = false,
    fetcher = fetch,
    dns = verifyDNS,
    pause,
  } = {},
) {
  const dir = path.join(root, directory);
  const config = settings(
    JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8")),
  );
  const tokenFile = path.join(dir, "token");
  if (fs.statSync(tokenFile).mode & 0o077)
    throw new DuckDNSError("Token exige permissão 0600");
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  if (!/^[a-z0-9-]{16,128}$/i.test(token))
    throw new DuckDNSError("Token DuckDNS ausente ou inválido");
  const ip = await text("https://api.ipify.org", fetcher, pause);
  if (!publicIPv4(ip) || (initial && ip !== config.wanIP))
    throw new DuckDNSError(
      "IPv4 externo inválido ou diferente da WAN confirmada; confira VPN/proxy",
    );
  const url = new URL("https://www.duckdns.org/update");
  url.search = new URLSearchParams({
    domains: [config.appDomain, config.mediaDomain]
      .map((d) => d.slice(0, -12))
      .join(","),
    token,
    ip,
  }).toString();
  if ((await text(url, fetcher, pause)) !== "OK")
    throw new DuckDNSError(
      "DuckDNS recusou atualização; confira nomes/token na conta",
    );
  try {
    for (const domain of [config.appDomain, config.mediaDomain])
      await dns(domain, ip);
  } catch {
    throw new DuckDNSError(
      "API aceita, mas DNS A/AAAA ainda não está consistente; nenhuma configuração aplicada",
    );
  }
  const envFile = path.join(
    root,
    "infra/compose/generated/network/network.env",
  );
  const base = fs.readFileSync(path.join(root, ".env"), "utf8");
  const original = fs.existsSync(envFile)
    ? fs.readFileSync(envFile, "utf8")
    : "";
  const values = { ...parseEnv(base), ...parseEnv(original) };
  if (
    !initial &&
    (values.APP_DOMAIN !== config.appDomain ||
      values.MEDIA_DOMAIN !== config.mediaDomain ||
      values.COOKIE_SECURE !== "true")
  )
    throw new DuckDNSError(
      "Configuração mudou; execute bootstrap em manutenção",
    );
  if (
    !initial &&
    !allowOriginChange &&
    (values.APP_ORIGIN !==
      "https://" + config.appDomain + portSuffix(config.httpsPort ?? 18443) ||
      values.LIVEKIT_PUBLIC_URL !==
        "wss://" + config.mediaDomain + portSuffix(config.httpsPort ?? 18443))
  )
    throw new DuckDNSError(
      "Porta/origem mudou; inicie CHAT_MODE=prd ./scripts/up.sh em manutenção",
    );
  const updates = {
    APP_DOMAIN: config.appDomain,
    MEDIA_DOMAIN: config.mediaDomain,
    ACME_EMAIL: config.email,
    PUBLIC_HTTPS_PORT: String(httpsPort(config.httpsPort ?? 18443)),
    APP_ORIGIN:
      "https://" + config.appDomain + portSuffix(config.httpsPort ?? 18443),
    LIVEKIT_PUBLIC_URL:
      "wss://" + config.mediaDomain + portSuffix(config.httpsPort ?? 18443),
    COOKIE_SECURE: "true",
    LIVEKIT_NODE_IP: ip,
    LIVEKIT_INTERNAL_URL: "http://livekit:7880",
  };
  let next = original;
  for (const [key, value] of Object.entries(updates)) {
    const expression = new RegExp("^" + key + "=.*$", "m");
    next = expression.test(next)
      ? next.replace(expression, key + "=" + value)
      : next + "\n" + key + "=" + value + "\n";
  }
  // Valida em diretório isolado antes de modificar configuração real.
  const staging = fs.mkdtempSync(path.join(dir, "render-"));
  let yaml;
  try {
    fs.writeFileSync(path.join(staging, ".env"), base + "\n" + next, {
      mode: 0o600,
    });
    const rendered = spawnSync(
      process.execPath,
      [path.join(root, "scripts/render-config.mjs"), "prd"],
      {
        cwd: staging,
        env: { ...process.env, CHAT_TURN: "false", CHAT_HELPER: "true" },
        stdio: "ignore",
      },
    );
    if (rendered.status !== 0)
      throw new DuckDNSError(
        "Configuração prd recusada; arquivos anteriores preservados",
      );
    yaml = fs.readFileSync(
      path.join(staging, "infra/compose/generated/network/livekit.yaml"),
    );
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(envFile), { recursive: true, mode: 0o700 });
  const yamlFile = path.join(
    root,
    "infra/compose/generated/network/livekit.yaml",
  );
  if (next !== original) {
    const goodEnv = path.join(dir, "last-good.env"),
      goodYaml = path.join(dir, "last-good-livekit.yaml");
    if (fs.existsSync(goodEnv))
      atomic(path.join(dir, "previous.env"), fs.readFileSync(goodEnv));
    else if (!fs.existsSync(path.join(dir, "previous.env")))
      atomic(path.join(dir, "previous.env"), original);
    if (fs.existsSync(goodYaml))
      atomic(
        path.join(dir, "previous-livekit.yaml"),
        fs.readFileSync(goodYaml),
      );
    else if (
      fs.existsSync(yamlFile) &&
      !fs.existsSync(path.join(dir, "previous-livekit.yaml"))
    )
      atomic(
        path.join(dir, "previous-livekit.yaml"),
        fs.readFileSync(yamlFile),
      );
  }
  if (!fs.existsSync(yamlFile) || !fs.readFileSync(yamlFile).equals(yaml))
    atomic(yamlFile, yaml);
  if (next !== original) atomic(envFile, next);
  const desired = { ip, fingerprint: fingerprint(root) };
  atomic(path.join(dir, "pending.json"), JSON.stringify(desired));
  let applied;
  try {
    applied = JSON.parse(
      fs.readFileSync(path.join(dir, "applied.json"), "utf8"),
    );
  } catch {}
  return applied?.fingerprint === desired.fingerprint && applied?.ip === ip
    ? "unchanged"
    : "restart";
}
export function commit(root) {
  const dir = path.join(root, directory),
    pending = JSON.parse(
      fs.readFileSync(path.join(dir, "pending.json"), "utf8"),
    );
  if (pending.fingerprint !== fingerprint(root))
    throw new DuckDNSError(
      "Configuração mudou durante a aplicação; repetir atualização",
    );
  atomic(
    path.join(dir, "last-good.env"),
    fs.readFileSync(
      path.join(root, "infra/compose/generated/network/network.env"),
    ),
  );
  atomic(
    path.join(dir, "last-good-livekit.yaml"),
    fs.readFileSync(
      path.join(root, "infra/compose/generated/network/livekit.yaml"),
    ),
  );
  atomic(path.join(dir, "applied.json"), JSON.stringify(pending));
}
export async function healthy(
  root,
  {
    fetcher = fetch,
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const env = parseEnv(fs.readFileSync(path.join(root, ".env"), "utf8"));
  const payload = {
    iss: env.LIVEKIT_API_KEY,
    exp: Math.floor(Date.now() / 1000) + 120,
    video: { roomList: true },
  };
  const unsigned =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token =
    unsigned +
    "." +
    crypto
      .createHmac("sha256", env.LIVEKIT_API_SECRET)
      .update(unsigned)
      .digest("base64url");
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetcher(
        "http://livekit:7880/twirp/livekit.RoomService/ListRooms",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: "{}",
          signal: AbortSignal.timeout(2000),
        },
      );
      if (!response.ok) throw new DuckDNSError();
      await response.json();
      return;
    } catch {
      if (attempt === 9)
        throw new DuckDNSError(
          "SFU não respondeu à verificação administrativa interna",
        );
      await pause(1000);
    }
  }
}
