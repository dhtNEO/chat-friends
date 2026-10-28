import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const script = path.resolve(import.meta.dirname, "../security-config.mjs");
test("upgrade retira snapshots completos e temporários do mount do helper sem perder backup", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "friends-state-upgrade-"));
  const dir = path.join(cwd, "infra/compose/generated/duckdns");
  fs.mkdirSync(dir, { recursive: true });
  const secret = "test-only-private-operator-value";
  const original =
    "POSTGRES_PASSWORD=" + secret + "\nAPP_DOMAIN=test.duckdns.org\n";
  fs.writeFileSync(path.join(dir, "last-good.env"), original, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "previous.env"), original, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "token"), "test-only-token", { mode: 0o600 });
  fs.writeFileSync(
    path.join(dir, "pending.json"),
    '{"ip":"177.12.34.56","fingerprint":"test-only"}',
  );
  fs.mkdirSync(path.join(dir, "render-orphan"));
  fs.writeFileSync(path.join(dir, "render-orphan/.env"), original);
  fs.writeFileSync(path.join(dir, "launchagent.log"), secret);
  try {
    const run = () =>
      spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {securityConfig} from ${JSON.stringify("file://" + script)};securityConfig({POSTGRES_USER:'friends',LIVEKIT_API_KEY:'media-only'});`,
        ],
        { cwd, stdio: "ignore" },
      ).status;
    assert.equal(run(), 0);
    assert.equal(
      fs.readFileSync(path.join(dir, "last-good.env"), "utf8"),
      "APP_DOMAIN=test.duckdns.org\n",
    );
    assert.equal(
      fs.readFileSync(path.join(dir, "previous.env"), "utf8"),
      "APP_DOMAIN=test.duckdns.org\n",
    );
    assert.equal(fs.existsSync(path.join(dir, "render-orphan")), false);
    assert.equal(fs.existsSync(path.join(dir, "launchagent.log")), false);
    assert.ok(
      !fs
        .readFileSync(
          path.join(cwd, "infra/compose/generated/helper.env"),
          "utf8",
        )
        .includes(secret),
    );
    const backups = path.join(cwd, "infra/compose/generated/operator-backups");
    assert.ok(fs.readdirSync(backups).length >= 4);
    const before = fs.readFileSync(
      path.join(cwd, "infra/compose/generated/runtime.env"),
      "utf8",
    );
    assert.equal(run(), 0);
    assert.equal(
      fs.readFileSync(
        path.join(cwd, "infra/compose/generated/runtime.env"),
        "utf8",
      ),
      before,
    );
    assert.equal(
      fs.readFileSync(path.join(dir, "token"), "utf8"),
      "test-only-token",
    );
    assert.ok(
      fs
        .readdirSync(backups)
        .some(
          (name) =>
            name.endsWith("last-good.env") &&
            fs.readFileSync(path.join(backups, name), "utf8") === original,
        ),
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
