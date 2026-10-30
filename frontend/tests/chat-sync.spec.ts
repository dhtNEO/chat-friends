import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import { ApiError, type Message } from "../src/api";
import type * as Sync from "../src/ChatSync";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/ChatSync.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const message = (id: number): Message => ({
  id,
  clientId: `client-${id}`,
  authorId: "person",
  author: "Pessoa",
  body: `mensagem ${id}`,
  createdAt: "2026-10-30T12:00:00Z",
});
const rows = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) =>
    message(from + i),
  );
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(
  read: (after?: number, signal?: AbortSignal) => Promise<unknown>,
) {
  let timerId = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const exports = {} as typeof Sync;
  runInNewContext(compiled, {
    exports,
    require: () => ({ ApiError }),
    Error,
    AbortController,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    setTimeout: (callback: () => void, delay: number) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const messages = new Map<number, Message>();
  const statuses: Sync.ChatStatus[] = [];
  const errors: Error[] = [];
  const requests: (number | undefined)[] = [];
  const sync = exports.createChatSync({
    read: (after, signal) => {
      requests.push(after);
      return read(after, signal);
    },
    merge: (items) => items.forEach((item) => messages.set(item.id, item)),
    status: (s) => statuses.push(s),
    error: (error) => errors.push(error),
  });
  return {
    ...exports,
    sync,
    messages,
    statuses,
    errors,
    requests,
    timers,
    async next() {
      const entry = timers.entries().next().value;
      expect(entry).toBeDefined();
      const [id, job] = entry!;
      timers.delete(id);
      job.callback();
      await flush();
      return job.delay;
    },
  };
}

test("falha no meio de 250 mensagens retoma da página confirmada mesmo com WS aberto", async () => {
  let failed = false;
  const h = harness(async (after) => {
    if (after === undefined) return [message(100)];
    if (after === 200 && !failed) {
      failed = true;
      throw new ApiError(503, "offline", "UNAVAILABLE");
    }
    return rows(after + 1, Math.min(after + 100, 351));
  });
  h.sync.connection(true);
  await flush();
  expect(h.requests).toEqual([undefined, 100, 200]);
  expect(h.statuses.at(-1)).toBe("unavailable");
  h.sync.observe(message(351));
  h.sync.observe(message(351));
  expect(await h.next()).toBe(1100);
  expect(h.requests).toEqual([undefined, 100, 200, 200, 300]);
  expect([...h.messages.keys()]).toEqual(rows(100, 351).map((m) => m.id));
  expect(h.statuses.at(-1)).toBe("updated");
  expect(h.timers.size).toBe(0);
});

test("WS 201 e duplicatas durante GET não adiantam o cursor nem iniciam GET concorrente", async () => {
  const pending = deferred<Message[]>();
  const h = harness(async (after) =>
    after === undefined
      ? [message(100)]
      : after === 100
        ? pending.promise
        : [message(201)],
  );
  h.sync.connection(true);
  await flush();
  h.sync.observe(message(201));
  h.sync.observe(message(201));
  h.sync.connection(true);
  h.sync.observe(message(150));
  expect(h.requests).toEqual([undefined, 100]);
  expect([...h.messages.keys()]).toEqual([100]);
  pending.resolve(rows(101, 200));
  await flush();
  expect(h.requests).toEqual([undefined, 100, 200]);
  expect([...h.messages.keys()]).toEqual(rows(100, 201).map((m) => m.id));
  expect(h.statuses.at(-1)).toBe("updated");
});

test("backoff com jitter respeita Retry-After, não é furado por reconexão e tem teto", async () => {
  const h = harness(async () => {
    throw new ApiError(503, "offline", "UNAVAILABLE", 5000);
  });
  h.sync.connection(true);
  await flush();
  h.sync.connection(false);
  h.sync.connection(true);
  expect(h.requests).toHaveLength(1);
  const delays = [];
  for (let i = 0; i < 8; i++) delays.push(await h.next());
  expect(delays).toEqual([5000, 5000, 5000, 8800, 17600, 33000, 33000, 33000]);
  h.sync.dispose();
  expect(h.timers.size).toBe(0);
});

test("página inválida não confirma cursor; IDs não consecutivos são permitidos", async () => {
  let invalid = true;
  const h = harness(async (after) => {
    if (after === undefined) return [message(100)];
    if (invalid) return [message(200), { ...message(201), body: null }];
    return [message(105), message(201)];
  });
  h.sync.connection(true);
  await flush();
  expect([...h.messages.keys()]).toEqual([100]);
  invalid = false;
  await h.next();
  expect(h.requests).toEqual([undefined, 100, 100]);
  expect([...h.messages.keys()]).toEqual([100, 105, 201]);
});

for (const incremental of [false, true]) {
  for (const rejection of [false, true]) {
    test(`logout descarta ${incremental ? "página" : "bootstrap"} tardio com ${rejection ? "erro" : "sucesso"}`, async () => {
      const pending = deferred<Message[]>();
      let signal!: AbortSignal;
      const h = harness(async (after, current) => {
        signal = current!;
        return incremental && after === undefined
          ? [message(100)]
          : pending.promise;
      });
      h.sync.connection(true);
      await flush();
      const before = [...h.messages.keys()];
      const states = h.statuses.length;
      h.sync.dispose();
      expect(signal.aborted).toBe(true);
      if (rejection) pending.reject(new Error("tardio"));
      else pending.resolve([message(201)]);
      await flush();
      h.sync.observe(message(202));
      h.sync.connection(true);
      expect([...h.messages.keys()]).toEqual(before);
      expect(h.errors).toEqual([]);
      expect(h.statuses).toHaveLength(states);
      expect(h.timers.size).toBe(0);
    });
  }
}

test("buffer limitado mantém recuperação HTTP de todos os IDs observados", async () => {
  const pending = deferred<Message[]>();
  const h = harness(async (after) =>
    after === undefined
      ? pending.promise
      : rows(after + 1, Math.min(after + 100, 1200)),
  );
  h.sync.connection(true);
  for (const m of rows(101, 1200)) h.sync.observe(m);
  pending.resolve([message(100)]);
  await flush();
  // flush includes the terminal empty page after a full page of 100.
  await flush();
  expect(h.messages.size).toBe(1101);
  expect(h.statuses.at(-1)).toBe("updated");
});

test("envelopes inválidos são ignorados sem exceção e 401/403/428 não fazem loop", async () => {
  const h = harness(async () => []);
  for (const data of [
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ type: "message", message: { id: 201 } }),
    JSON.stringify({ type: "presence", users: [1] }),
  ])
    expect(h.parseChatEvent(data)).toBeNull();
  expect(
    h.parseChatEvent(
      JSON.stringify({ type: "message", message: message(201) }),
    ),
  ).toEqual({ type: "message", message: message(201) });
  for (const code of [
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "REAUTH_REQUIRED",
    "ABORTED",
  ]) {
    const denied = harness(async () => {
      throw new ApiError(403, "bloqueado", code);
    });
    denied.sync.connection(true);
    await flush();
    expect(denied.statuses.at(-1)).toBe("unavailable");
    expect(denied.timers.size).toBe(0);
  }
});
