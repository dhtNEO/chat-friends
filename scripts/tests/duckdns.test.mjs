import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  prepare,
  commit,
  healthy,
  settings,
  directory,
  verifyDNS,
} from "../duckdns-lib.mjs";
import { publicIPv4 } from "../network-config.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const config = {
  appDomain: "test-app.duckdns.org",
  mediaDomain: "test-media.duckdns.org",
  email: "test@example.org",
  wanIP: "177.12.34.56",
};
const token = "test-token-only-0123456789";
const original =
  "POSTGRES_PASSWORD=test-only-db-123456789\nLIVEKIT_API_KEY=test-only-key-123456789\nLIVEKIT_API_SECRET=test-only-secret-at-least-32-characters\nAPP_ORIGIN=http://localhost:8080\nLIVEKIT_PUBLIC_URL=ws://localhost:8080\nLIVEKIT_NODE_IP=127.0.0.1\nCOOKIE_SECURE=false\n";
async function fixture(fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "friends-ddns-"));
  fs.mkdirSync(path.join(cwd, directory), { recursive: true });
  fs.mkdirSync(path.join(cwd, "scripts"));
  for (const name of [
    "render-config.mjs",
    "network-config.mjs",
    "duckdns-update.mjs",
    "duckdns-lib.mjs",
    "duckdns-https.mjs",
  ])
    fs.copyFileSync(
      path.join(root, "scripts", name),
      path.join(cwd, "scripts", name),
    );
  fs.writeFileSync(path.join(cwd, ".env"), original);
  fs.writeFileSync(
    path.join(cwd, directory, "settings.json"),
    JSON.stringify(config),
  );
  fs.writeFileSync(path.join(cwd, directory, "token"), token, { mode: 0o600 });
  try {
    await fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
function network(ip = config.wanIP) {
  const calls = [];
  return {
    calls,
    pause: async () => {},
    dns: async (domain, want) => {
      calls.push({ domain, want });
    },
    fetcher: async (value) => {
      const url = new URL(value);
      calls.push(url.hostname);
      if (url.hostname === "api.ipify.org")
        return { ok: true, text: async () => ip };
      assert.equal(url.hostname, "www.duckdns.org");
      assert.equal(url.searchParams.get("domains"), "test-app,test-media");
      assert.equal(url.searchParams.get("ip"), ip);
      assert.equal(url.searchParams.get("token"), token);
      return { ok: true, text: async () => "OK" };
    },
  };
}
test("validação pública rejeita CGNAT, privados e reservas", () => {
  for (const ip of [
    "100.64.0.1",
    "100.127.255.255",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.1.2",
    "0.1.2.3",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "<html>",
    "177.999.1.1",
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4(config.wanIP), true);
});
test("DuckDNS exige dois nomes registrados distintos e email válido", () => {
  assert.equal(settings(config), config);
  for (const change of [
    { appDomain: "evil.com" },
    { mediaDomain: config.appDomain },
    { email: "x\n bad" },
    { wanIP: "100.80.1.1" },
  ])
    assert.throws(() => settings({ ...config, ...change }));
});
test("bootstrap publica os dois nomes, preserva segredos e precisa de aplicação confirmada", () =>
  fixture(async (cwd) => {
    const dep = network();
    assert.equal(await prepare(cwd, { initial: true, ...dep }), "restart");
    const env = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.match(env, /COOKIE_SECURE=true/);
    assert.ok(env.includes(original.split("\n")[0]));
    assert.equal(dep.calls.filter((v) => v.domain).length, 2);
    assert.equal(
      fs.existsSync(path.join(cwd, directory, "applied.json")),
      false,
    );
    assert.equal(await prepare(cwd, dep), "restart"); // configuração escrita != SFU aplicada
    commit(cwd);
    assert.equal(await prepare(cwd, network()), "unchanged");
    assert.doesNotMatch(
      fs.readFileSync(
        path.join(cwd, "infra/compose/generated/livekit.yaml"),
        "utf8",
      ),
      /tailscale0/,
    );
  }));
test("mudança de IP e retry após falha não suprimem recriação", () =>
  fixture(async (cwd) => {
    await prepare(cwd, { initial: true, ...network() });
    commit(cwd);
    assert.equal(await prepare(cwd, network("177.12.34.57")), "restart");
    assert.equal(await prepare(cwd, network("177.12.34.57")), "restart");
    assert.match(
      fs.readFileSync(path.join(cwd, directory, "previous.env"), "utf8"),
      /LIVEKIT_NODE_IP=177.12.34.56/,
    );
    commit(cwd);
    assert.equal(await prepare(cwd, network("177.12.34.57")), "unchanged");
  }));
test("IP inválido, proxy divergente, KO, DNS atrasado ou AAAA não alteram env", () =>
  fixture(async (cwd) => {
    for (const dep of [
      network("10.0.0.1"),
      network("177.12.34.57"),
      {
        ...network(),
        fetcher: async (url) => ({
          ok: true,
          text: async () =>
            new URL(url).hostname === "api.ipify.org" ? config.wanIP : "KO",
        }),
      },
      {
        ...network(),
        dns: async () => {
          throw new Error("AAAA ou atraso");
        },
      },
    ]) {
      await assert.rejects(prepare(cwd, { initial: true, ...dep }));
      assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), original);
    }
  }));
test("timeout limita retries e mensagem de erro não inclui token/URL", () =>
  fixture(async (cwd) => {
    let count = 0;
    await assert.rejects(
      prepare(cwd, {
        initial: true,
        ...network(),
        fetcher: async () => {
          count++;
          throw new Error("https://duckdns.invalid?token=" + token);
        },
      }),
      (error) => {
        assert.ok(!String(error).includes(token));
        assert.ok(!String(error).includes("https://"));
        return true;
      },
    );
    assert.equal(count, 3);
  }));
test("render inválido preserva configuração anterior; commit recusa mutação concorrente", () =>
  fixture(async (cwd) => {
    fs.appendFileSync(path.join(cwd, ".env"), "LIVEKIT_API_SECRET=short\n");
    const before = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    await assert.rejects(prepare(cwd, { initial: true, ...network() }));
    assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), before);
    fs.writeFileSync(path.join(cwd, ".env"), original);
    await prepare(cwd, { initial: true, ...network() });
    fs.appendFileSync(path.join(cwd, ".env"), "# changed\n");
    assert.throws(() => commit(cwd));
  }));
test("saúde administrativa usa JWT restrito e só confirma resposta da SFU", () =>
  fixture(async (cwd) => {
    await prepare(cwd, { initial: true, ...network() });
    await healthy(cwd, {
      pause: async () => {},
      fetcher: async (url, options) => {
        assert.equal(
          url,
          "http://livekit:7880/twirp/livekit.RoomService/ListRooms",
        );
        const claims = JSON.parse(
          Buffer.from(
            options.headers.Authorization.split(".")[1],
            "base64url",
          ).toString(),
        );
        assert.deepEqual(claims.video, { roomList: true });
        return { ok: true, json: async () => ({}) };
      },
    });
    let count = 0;
    await assert.rejects(
      healthy(cwd, {
        pause: async () => {},
        fetcher: async () => {
          count++;
          throw new Error(token);
        },
      }),
      /SFU não respondeu/,
    );
    assert.equal(count, 10);
  }));
test("CLI não vaza token em stdout/stderr nem permite modo desconhecido", () =>
  fixture(async (cwd) => {
    const result = spawnSync(
      process.execPath,
      ["scripts/duckdns-update.mjs", "invalid"],
      { cwd, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes(token));
  }));
test("internet recusa IP privado, nomes iguais, email inválido e origem insegura", () =>
  fixture(async (cwd) => {
    await prepare(cwd, { initial: true, ...network() });
    const good = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    for (const bad of [
      good.replace(
        "LIVEKIT_NODE_IP=177.12.34.56",
        "LIVEKIT_NODE_IP=100.80.1.1",
      ),
      good.replace("test-media.duckdns.org", "test-app.duckdns.org"),
      good.replace("ACME_EMAIL=test@example.org", "ACME_EMAIL=invalid"),
      good.replace("COOKIE_SECURE=true", "COOKIE_SECURE=false"),
    ]) {
      fs.writeFileSync(path.join(cwd, ".env"), bad);
      assert.notEqual(
        spawnSync(process.execPath, ["scripts/render-config.mjs", "internet"], {
          cwd,
          stdio: "ignore",
        }).status,
        0,
      );
    }
  }));

test("DNS distingue autoridade, cache atrasado e AAAA", async () => {
  const resolver = (ipv4, ipv6 = []) => ({
    resolveNs: async () => ["ns.duckdns.org"],
    resolve4: async (domain) =>
      domain === "ns.duckdns.org" ? ["8.8.8.8"] : ipv4,
    resolve6: async () => ipv6,
    setServers: () => {},
  });
  await verifyDNS(config.appDomain, config.wanIP, {
    recursive: resolver([config.wanIP]),
    authority: resolver([config.wanIP]),
  });
  await assert.rejects(
    verifyDNS(config.appDomain, config.wanIP, {
      recursive: resolver(["177.12.34.57"]),
      authority: resolver([config.wanIP]),
    }),
  );
  await assert.rejects(
    verifyDNS(config.appDomain, config.wanIP, {
      recursive: resolver([config.wanIP]),
      authority: resolver([config.wanIP], ["2001:db8::1"]),
    }),
  );
});
test("token precisa de permissão privada", () =>
  fixture(async (cwd) => {
    fs.chmodSync(path.join(cwd, directory, "token"), 0o644);
    await assert.rejects(prepare(cwd, { initial: true, ...network() }), /0600/);
  }));
test("LaunchAgent escapa caminhos, usa binário absoluto e não contém token", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/duckdns-launchagent.mjs",
      "/Users/test/Chat & <Friends>",
      "/Applications/Test & App/docker",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Chat &amp; &lt;Friends&gt;/);
  assert.match(result.stdout, /Test &amp; App/);
  assert.ok(!result.stdout.includes(token));
  assert.ok(!result.stdout.includes("__REPO__"));
});

test("DuckDNS gera HTTPS/WSS na porta 18443, sem mudar portas internas da SFU", () =>
  fixture(async (cwd) => {
    await prepare(cwd, { initial: true, ...network() });
    const env = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.match(env, /APP_ORIGIN=https:\/\/test-app.duckdns.org:18443/);
    assert.match(
      env,
      /LIVEKIT_PUBLIC_URL=wss:\/\/test-media.duckdns.org:18443/,
    );
    assert.match(env, /PUBLIC_HTTPS_PORT=18443/);
    const yaml = fs.readFileSync(
      path.join(cwd, "infra/compose/generated/livekit.yaml"),
      "utf8",
    );
    assert.match(yaml, /tcp_port: 7881/);
    assert.match(yaml, /udp_port: 7882/);
  }));
test("migração de 443 exige startup completo; job não muda origem sozinho", () =>
  fixture(async (cwd) => {
    fs.writeFileSync(
      path.join(cwd, directory, "settings.json"),
      JSON.stringify({ ...config, httpsPort: 443 }),
    );
    await prepare(cwd, { initial: true, ...network() });
    commit(cwd);
    const before = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    fs.writeFileSync(
      path.join(cwd, directory, "settings.json"),
      JSON.stringify(config),
    );
    await assert.rejects(prepare(cwd, network()), /Porta\/origem mudou/);
    assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), before);
    assert.equal(
      await prepare(cwd, { allowOriginChange: true, ...network() }),
      "restart",
    );
    assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /:18443/);
  }));
test("porta personalizada é validada; 443 permanece compatível", () => {
  for (const httpsPort of [0, 80, 65536, -1, "18443/path", "018443", "https"])
    assert.throws(() => settings({ ...config, httpsPort }));
  assert.doesNotThrow(() => settings({ ...config, httpsPort: 18443 }));
  assert.doesNotThrow(() => settings({ ...config, httpsPort: 443 }));
});
