import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test, expect } from "@playwright/test";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/api.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function client(fetch: typeof globalThis.fetch) {
  const exports = {} as typeof import("../src/api");
  const window = new EventTarget();
  runInNewContext(compiled, {
    exports,
    fetch,
    window,
    Event,
    CustomEvent,
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  });
  return { ...exports, window };
}
const csrf = () => new Response(JSON.stringify({ token: "synthetic" }));

test("classifica HTTP, Retry-After e mantém identidade exceto em 401", async () => {
  for (const [status, code] of [
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [428, "REAUTH_REQUIRED"],
    [429, "RATE_LIMITED"],
    [503, "UNAVAILABLE"],
  ] as const) {
    const c = client(
      async () =>
        new Response("<html>proxy</html>", {
          status,
          headers: { "Retry-After": "2" },
        }),
    );
    let ended = 0,
      reauth = 0;
    c.window.addEventListener("session-ended", () => ended++);
    c.window.addEventListener("reauth-required", () => reauth++);
    expect(await rejected(c.api("/me"))).toMatchObject({
      status,
      code,
      retryAfter: 2000,
    });
    expect(ended).toBe(status === 401 ? 1 : 0);
    expect(reauth).toBe(status === 428 ? 1 : 0);
  }
});

test("Retry-After em data bloqueia novo envio sem repetir mutação", async () => {
  let calls = 0;
  const c = client(async (path) => {
    if (path === "/api/csrf") return csrf();
    calls++;
    return new Response("", {
      status: 429,
      headers: { "Retry-After": new Date(Date.now() + 60_000).toUTCString() },
    });
  });
  expect(await rejected(c.api("/admin/accounts", "POST", {}))).toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(await rejected(c.api("/admin/accounts", "POST", {}))).toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(calls).toBe(1);
});

test("rede e timeout de mutação são distintos e não provocam reenvio", async () => {
  for (const timeout of [false, true]) {
    let calls = 0;
    const c = client(async (path, init) => {
      if (path === "/api/csrf") return csrf();
      calls++;
      if (!timeout) throw new TypeError("offline");
      return await new Promise<Response>((_, reject) =>
        init!.signal!.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      );
    });
    expect(
      await rejected(c.api("/messages", "POST", {}, { timeoutMs: 10 })),
    ).toMatchObject({
      status: 0,
      code: timeout ? "TIMEOUT" : "NETWORK",
    });
    expect(calls).toBe(1);
  }
});

test("cancelamento externo e deadline durante leitura do corpo", async () => {
  const controller = new AbortController();
  controller.abort();
  const c = client(async (_, init) => {
    if (init!.signal!.aborted) throw new Error("aborted");
    return {
      text: () =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    } as Response;
  });
  expect(
    await rejected(
      c.api("/me", "GET", undefined, { signal: controller.signal }),
    ),
  ).toMatchObject({ code: "ABORTED" });
  expect(
    await rejected(c.api("/me", "GET", undefined, { timeoutMs: 10 })),
  ).toMatchObject({ code: "TIMEOUT" });
});

test("upload mantém status e não repete falha ambígua", async () => {
  for (const status of [401, 403, 428, 429, 503, 0]) {
    let calls = 0;
    const c = client(async (path) => {
      if (path === "/api/csrf") return csrf();
      calls++;
      if (!status) throw new TypeError("offline");
      return new Response("", { status });
    });
    expect(
      await rejected(c.upload("/profile/avatar", new Blob(["synthetic"]))),
    ).toMatchObject({ status });
    expect(calls).toBe(1);
  }
});

test("resposta e 401 tardios não alteram sessão nova", async () => {
  for (const status of [200, 401, 428]) {
    let finish!: (r: Response) => void;
    let previous = true;
    const c = client(async (path) => {
      if (path === "/api/csrf") return csrf();
      if (path === "/api/login") return new Response(null, { status: 204 });
      if (!previous) return new Response(JSON.stringify({ user: "new" }));
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    let ended = 0;
    c.window.addEventListener("session-ended", () => ended++);
    const old = c.api("/me");
    previous = false;
    await c.login("new-account", "synthetic-password");
    expect(await c.api("/me")).toEqual({ user: "new" });
    finish(new Response(JSON.stringify({ user: "old" }), { status }));
    expect(await rejected(old)).toMatchObject({ code: "ABORTED" });
    expect(ended).toBe(0);
  }
});

test("timeouts por operação preservam busca e preparação longa", () => {
  const c = client(async () => csrf());
  expect(c.operationTimeout("/me")).toBe(15_000);
  expect(c.operationTimeout("/music/state")).toBe(15_000);
  expect(c.operationTimeout("/music/search?q=teste")).toBe(60_000);
  expect(c.operationTimeout("/party/music/search?q=teste")).toBe(60_000);
  expect(c.operationTimeout("/party/synthetic/start", "POST")).toBe(120_000);
  expect(c.operationTimeout("/profile/avatar")).toBe(60_000);
});

async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Era esperada uma rejeição");
}

test("Retry-After de 503 mantém classificação durante espera", async () => {
  let calls = 0;
  const c = client(async () => {
    calls++;
    return new Response("", { status: 503, headers: { "Retry-After": "60" } });
  });
  expect(await rejected(c.api("/me"))).toMatchObject({
    status: 503,
    code: "UNAVAILABLE",
  });
  expect(await rejected(c.api("/me"))).toMatchObject({
    status: 503,
    code: "UNAVAILABLE",
  });
  expect(calls).toBe(1);
});

test("nova tentativa de login não contorna Retry-After", async () => {
  let calls = 0;
  const c = client(async (path) => {
    if (path === "/api/csrf") return csrf();
    calls++;
    return new Response("", { status: 429, headers: { "Retry-After": "60" } });
  });
  expect(await rejected(c.login("synthetic", "test-password"))).toMatchObject({
    status: 429,
  });
  expect(await rejected(c.login("synthetic", "test-password"))).toMatchObject({
    status: 429,
  });
  expect(calls).toBe(1);
});
