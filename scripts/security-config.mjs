// Operator-only configuration. Helpers never mount this file or its output.
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
  return values;
}
