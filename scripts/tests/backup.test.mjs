import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
test("backup autenticado: round trip, adulteração e senha errada sem confirmar plaintext", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-backup-"));
  const script = path.resolve(import.meta.dirname, "../backup-crypto.mjs");
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: dir,
      stdio: "ignore",
    }).status;
  try {
    fs.writeFileSync(
      path.join(dir, "password"),
      "test-only-long-backup-password",
      { mode: 0o600 },
    );
    const original = Buffer.alloc(100000, 73);
    fs.writeFileSync(path.join(dir, "dump"), original);
    assert.equal(run("encrypt", "dump", "encrypted", "password"), 0);
    assert.equal(run("decrypt", "encrypted", "opened", "password"), 0);
    assert.deepEqual(fs.readFileSync(path.join(dir, "opened")), original);
    assert.equal(run("encrypt", "dump", "encrypted", "password"), 1);
    fs.writeFileSync(path.join(dir, "wrong"), "different-test-only-password", {
      mode: 0o600,
    });
    assert.equal(run("decrypt", "encrypted", "bad", "wrong"), 1);
    assert.equal(fs.existsSync(path.join(dir, "bad")), false);
    const bytes = fs.readFileSync(path.join(dir, "encrypted"));
    bytes[100] ^= 1;
    fs.writeFileSync(path.join(dir, "tampered"), bytes);
    assert.equal(run("decrypt", "tampered", "bad2", "password"), 1);
    assert.equal(fs.existsSync(path.join(dir, "bad2")), false);
    assert.equal(
      fs.readdirSync(dir).some((n) => n.endsWith(".partial")),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
