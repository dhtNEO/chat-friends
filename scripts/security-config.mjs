// Operator-only generator. Database/MFA keys stay outside worker mounts.
import fs from "node:fs";
import crypto from "node:crypto";
import { parseEnv } from "./network-config.mjs";
export const generated = "infra/compose/generated";
export function securityConfig(base) {
  fs.mkdirSync(generated, { recursive: true, mode: 0o700 });
  const file = generated + "/runtime.env";
  const values = fs.existsSync(file)
    ? parseEnv(fs.readFileSync(file, "utf8"))
    : {};
  for (const key of [
    "APP_DB_PASSWORD",
    "MIGRATION_DB_PASSWORD",
    "TEST_DB_PASSWORD",
    "APP_PROXY_KEY",
    "MFA_ENCRYPTION_KEY",
  ])
    values[key] ||= crypto.randomBytes(32).toString("hex");
  values.CHAT_UID = String(process.getuid());
  values.CHAT_GID = String(process.getgid());
  values.APP_DB_USER ||= "friends_app";
  values.MIGRATION_DB_USER ||= "friends_migrator";
  if (
    values.APP_DB_USER === values.MIGRATION_DB_USER ||
    [values.APP_DB_USER, values.MIGRATION_DB_USER].some(
      (name) =>
        [base.POSTGRES_USER || "friends", "friends_owner", "postgres"].includes(
          name,
        ) || name.startsWith("pg_"),
    )
  )
    throw new Error(
      "Contas de banco precisam ser distintas e não administrativas",
    );
  for (const key of ["APP_DB_USER", "MIGRATION_DB_USER"])
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(values[key]))
      throw new Error("Nome de role inválido");
  for (const key of [
    "APP_DB_PASSWORD",
    "MIGRATION_DB_PASSWORD",
    "TEST_DB_PASSWORD",
    "APP_PROXY_KEY",
    "MFA_ENCRYPTION_KEY",
  ])
    if (!/^[a-f0-9]{64}$/.test(values[key]))
      throw new Error("Segredo gerado inválido: " + key);
  fs.writeFileSync(
    file,
    Object.entries(values)
      .map(([k, v]) => k + "=" + v)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  fs.chmodSync(file, 0o600);
  const allowed = [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "APP_ORIGIN",
    "LIVEKIT_PUBLIC_URL",
    "LIVEKIT_NODE_IP",
    "COOKIE_SECURE",
    "APP_DOMAIN",
    "MEDIA_DOMAIN",
    "ACME_EMAIL",
    "PUBLIC_HTTPS_PORT",
    "LIVEKIT_INTERNAL_URL",
  ];
  fs.writeFileSync(
    generated + "/helper.env",
    allowed
      .filter((k) => base[k] !== undefined)
      .map((k) => k + "=" + base[k])
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  sanitizeDuckState();
  return values;
}

// Preserve legacy full-env snapshots outside the worker mount. Unknown/staging
// files are quarantined, never deleted. configure.sh holds the Docker lock.
function sanitizeDuckState() {
  const dir = generated + "/duckdns";
  if (!fs.existsSync(dir)) return;
  const archive = generated + "/operator-backups";
  const keep = new Set([
    "token",
    "settings.json",
    "pending.json",
    "applied.json",
    "previous.env",
    "last-good.env",
    "previous-livekit.yaml",
    "last-good-livekit.yaml",
  ]);
  const network = new Set([
    "APP_DOMAIN",
    "MEDIA_DOMAIN",
    "ACME_EMAIL",
    "PUBLIC_HTTPS_PORT",
    "APP_ORIGIN",
    "LIVEKIT_PUBLIC_URL",
    "COOKIE_SECURE",
    "LIVEKIT_NODE_IP",
    "LIVEKIT_INTERNAL_URL",
  ]);
  const preserve = (name, data) => {
    fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
    const target = archive + "/duckdns-" + crypto.randomUUID() + "-" + name;
    if (data === undefined) fs.renameSync(dir + "/" + name, target);
    else fs.writeFileSync(target, data, { mode: 0o600, flag: "wx" });
  };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!keep.has(entry.name)) {
      preserve(entry.name);
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error(
        "Estado DuckDNS exige arquivos regulares; revise os arquivos privados",
      );
    if (entry.name.endsWith(".env")) {
      const file = dir + "/" + entry.name,
        original = fs.readFileSync(file, "utf8");
      const filtered =
        Object.entries(parseEnv(original))
          .filter(([key]) => network.has(key))
          .map(([key, value]) => key + "=" + value)
          .join("\n") + "\n";
      if (original !== filtered) {
        preserve(entry.name, original);
        const temp = file + "." + crypto.randomUUID() + ".tmp";
        fs.writeFileSync(temp, filtered, { mode: 0o600, flag: "wx" });
        fs.renameSync(temp, file);
      }
    }
  }
}
