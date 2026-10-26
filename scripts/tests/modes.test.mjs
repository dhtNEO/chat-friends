import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../..");
function fixture(fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "friends-modes-"));
  fs.mkdirSync(path.join(cwd, "scripts"));
  fs.mkdirSync(path.join(cwd, "infra/compose/generated"), { recursive: true });
  for (const name of [
    "render-config.mjs",
    "network-config.mjs",
    "modes.sh",
    "configure.sh",
    "check.sh",
  ])
    fs.copyFileSync(
      path.join(root, "scripts", name),
      path.join(cwd, "scripts", name),
    );
  fs.copyFileSync(
    path.join(root, ".env.example"),
    path.join(cwd, ".env.example"),
  );
  const result = spawnSync(
    process.execPath,
    ["scripts/render-config.mjs"],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  const docker = path.join(cwd, "docker");
  fs.writeFileSync(
    docker,
    '#!/usr/bin/env bash\nprintf called > docker-called\nexec "$TEST_NODE_EXEC" scripts/render-config.mjs "${@: -1}"\n',
    { mode: 0o700 },
  );
  const env = {
    ...process.env,
    CHAT_MODE: "dev",
    CHAT_TURN: "false",
    CHAT_ALLOW_MODE_CHANGE: "false",
    TEST_NODE_EXEC: process.execPath,
    PATH: cwd + ":" + process.env.PATH,
  };
  try {
    fn(cwd, env);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
test("dev padrão gera credenciais privadas e anuncia loopback", () =>
  fixture((cwd) => {
    assert.equal(fs.statSync(path.join(cwd, ".env")).mode & 0o777, 0o600);
    assert.match(
      fs.readFileSync(
        path.join(cwd, "infra/compose/generated/livekit.yaml"),
        "utf8",
      ),
      /node_ip: "127.0.0.1"/,
    );
    assert.equal(
      fs
        .readFileSync(path.join(cwd, "infra/compose/generated/mode"), "utf8")
        .trim(),
      "dev",
    );
  }));
test("gerador recusa entradas além de dev/prd antes de alterar configuração", () =>
  fixture((cwd) => {
    const env = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    for (const invalid of ["local", "internet", "invalid", ""]) {
      assert.notEqual(
        spawnSync(process.execPath, ["scripts/render-config.mjs", invalid], {
          cwd,
          stdio: "ignore",
        }).status,
        0,
      );
      assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), env);
    }
  }));
for (const [previous, requested] of [
  ["local", "dev"],
  ["internet", "prd"],
])
  test("migra marcador " + previous + " sem alterar credenciais", () =>
    fixture((cwd, env) => {
      if (requested === "prd") {
        let values = fs.readFileSync(path.join(cwd, ".env"), "utf8");
        const changes = {
          APP_DOMAIN: "app.test.org",
          MEDIA_DOMAIN: "media.test.org",
          ACME_EMAIL: "test@example.org",
          APP_ORIGIN: "https://app.test.org",
          LIVEKIT_PUBLIC_URL: "wss://media.test.org",
          COOKIE_SECURE: "true",
          LIVEKIT_NODE_IP: "177.12.34.56",
        };
        for (const [key, value] of Object.entries(changes))
          values = values.replace(
            new RegExp("^" + key + "=.*$", "m"),
            key + "=" + value,
          );
        fs.writeFileSync(path.join(cwd, ".env"), values);
      }
      const before = fs.readFileSync(path.join(cwd, ".env"), "utf8");
      fs.writeFileSync(
        path.join(cwd, "infra/compose/generated/mode"),
        previous + "\n",
      );
      assert.equal(
        spawnSync("bash", ["scripts/configure.sh", requested], {
          cwd,
          env,
          stdio: "ignore",
        }).status,
        0,
      );
      assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), before);
      assert.equal(
        fs
          .readFileSync(path.join(cwd, "infra/compose/generated/mode"), "utf8")
          .trim(),
        requested,
      );
    }),
  );
test("configure e check recusam mudar prd para dev sem tocar Docker", () =>
  fixture((cwd, env) => {
    fs.writeFileSync(path.join(cwd, "infra/compose/generated/mode"), "prd\n");
    for (const script of ["configure.sh", "check.sh"]) {
      assert.notEqual(
        spawnSync("bash", ["scripts/" + script], { cwd, env, stdio: "ignore" })
          .status,
        0,
      );
      assert.equal(fs.existsSync(path.join(cwd, "docker-called")), false);
    }
  }));
test("TURN em dev é recusado antes de gerar configuração", () =>
  fixture((cwd, env) => {
    assert.notEqual(
      spawnSync(process.execPath, ["scripts/render-config.mjs", "dev"], {
        cwd,
        env: { ...env, CHAT_TURN: "true" },
        stdio: "ignore",
      }).status,
      0,
    );
  }));
