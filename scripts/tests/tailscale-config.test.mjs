import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
const base = {
  https: true,
  state: "Running",
  ip: "100.80.20.10",
  domain: "chat-amigos.example.ts.net",
  dockerIP: "172.20.0.2",
};
const env =
  "POSTGRES_PASSWORD=test-password-only-123456\nLIVEKIT_API_KEY=test-api-key-only-123456\nLIVEKIT_API_SECRET=test-secret-only-at-least-32-characters\nAPP_ORIGIN=https://chat-amigos.example.ts.net\nLIVEKIT_PUBLIC_URL=wss://chat-amigos.example.ts.net\nCOOKIE_SECURE=true\nLIVEKIT_NODE_IP=100.80.20.10\nLIVEKIT_INTERNAL_URL=http://livekit:7880\n";
function fixture(fn) {
  const cwd = mkdtempSync(join(tmpdir(), "friends-config-"));
  mkdirSync(join(cwd, "infra/compose/generated"), { recursive: true });
  mkdirSync(join(cwd, "scripts"));
  for (const name of [
    "render-config.mjs",
    "tailscale-config.mjs",
    "network-config.mjs",
  ])
    copyFileSync(join(root, "scripts", name), join(cwd, "scripts", name));
  writeFileSync(join(cwd, ".env"), env);
  writeFileSync(
    join(cwd, "infra/compose/generated/tailscale-node.json"),
    JSON.stringify(base),
  );
  try {
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
function render(cwd, mode = "tailscale", extra = {}) {
  return spawnSync(process.execPath, ["scripts/render-config.mjs", mode], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CHAT_TURN: "false", ...extra },
  });
}
test("Tailscale anuncia interface privada e mantém API somente no IP Docker", () =>
  fixture((cwd) => {
    assert.equal(render(cwd).status, 0);
    const config = readFileSync(
      join(cwd, "infra/compose/generated/livekit.yaml"),
      "utf8",
    );
    assert.match(config, /bind_addresses: \["172.20.0.2"\]/);
    assert.match(config, /includes: \[tailscale0\]/);
    assert.match(config, /enable_loopback_candidate: false/);
  }));
for (const [label, change] of [
  ["HTTP", (s) => s.replace("APP_ORIGIN=https:", "APP_ORIGIN=http:")],
  [
    "cookie inseguro",
    (s) => s.replace("COOKIE_SECURE=true", "COOKIE_SECURE=false"),
  ],
  ["origens diferentes", (s) => s.replace("wss://chat-amigos", "wss://outro")],
  [
    "API externa",
    (s) => s.replace("http://livekit:7880", "http://localhost:7880"),
  ],
  [
    "IP divergente",
    (s) =>
      s.replace("LIVEKIT_NODE_IP=100.80.20.10", "LIVEKIT_NODE_IP=100.80.20.11"),
  ],
])
  test("recusa " + label, () =>
    fixture((cwd) => {
      writeFileSync(join(cwd, ".env"), change(env));
      assert.notEqual(render(cwd).status, 0);
    }),
  );
for (const change of [
  { https: false },
  { state: "NeedsLogin" },
  { dockerIP: "0.0.0.0" },
  { domain: "untrusted.example.com" },
])
  test("recusa nó inválido " + Object.keys(change)[0], () =>
    fixture((cwd) => {
      writeFileSync(
        join(cwd, "infra/compose/generated/tailscale-node.json"),
        JSON.stringify({ ...base, ...change }),
      );
      assert.notEqual(render(cwd).status, 0);
    }),
  );
test("recusa TURN e nó ausente", () =>
  fixture((cwd) => {
    assert.notEqual(render(cwd, "tailscale", { CHAT_TURN: "true" }).status, 0);
    rmSync(join(cwd, "infra/compose/generated/tailscale-node.json"));
    assert.notEqual(render(cwd).status, 0);
  }));
test("bootstrap preserva segredos e rollback restaura env quando nó é inválido", () =>
  fixture((cwd) => {
    const status = {
      CertDomains: [base.domain],
      BackendState: "Running",
      TailscaleIPs: [base.ip],
      Self: { DNSName: base.domain + "." },
    };
    const command = (v, ip = base.dockerIP) =>
      spawnSync(process.execPath, ["scripts/tailscale-config.mjs", ip], {
        cwd,
        input: JSON.stringify(v),
        encoding: "utf8",
      });
    assert.equal(command(status).status, 0);
    assert.equal(readFileSync(join(cwd, ".env"), "utf8"), env);
    assert.notEqual(
      command({ ...status, Self: { DNSName: "bad.invalid" } }).status,
      0,
    );
    assert.equal(readFileSync(join(cwd, ".env"), "utf8"), env);
    assert.notEqual(
      command({
        ...status,
        Self: { DNSName: base.domain, Tags: ["tag:server"] },
      }).status,
      0,
    );
    assert.notEqual(command({ ...status, CertDomains: [] }).status, 0);
  }));
test("local não recebe filtro Tailscale", () =>
  fixture((cwd) => {
    assert.equal(render(cwd, "local").status, 0);
    assert.doesNotMatch(
      readFileSync(join(cwd, "infra/compose/generated/livekit.yaml"), "utf8"),
      /tailscale0/,
    );
  }));
