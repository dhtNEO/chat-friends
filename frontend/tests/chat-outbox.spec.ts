import { test, expect } from "@playwright/test";
import { ApiError, type Message } from "../src/api";
import { createChatOutbox, type Delivery } from "../src/ChatOutbox";

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function harness() {
  const requests: {
    message: { clientId: string; body: string };
    signal: AbortSignal;
    reply: ReturnType<typeof deferred>;
  }[] = [];
  const snapshots: Delivery[][] = [];
  const saved: Message[] = [];
  const outbox = createChatOutbox({
    authorId: "person",
    changed: (rows) => snapshots.push(rows),
    saved: (row) => saved.push(row),
    post: (message, signal) => {
      const reply = deferred();
      requests.push({ message, signal, reply });
      return reply.promise;
    },
  });
  const ack = (index = 0): Message => ({
    ...requests[index].message,
    authorId: "person",
    author: "Pessoa sintética",
    id: 1,
    createdAt: "2026-10-30T12:00:00Z",
  });
  return { outbox, requests, snapshots, saved, ack };
}

test("queued/sending não aceitam retry e reconexão não duplica POST em voo", async () => {
  const h = harness();
  h.outbox.enqueue("sintético");
  const id = h.snapshots.at(-1)![0].clientId;
  expect(h.snapshots.at(-1)![0].state).toBe("queued");
  expect(h.requests).toHaveLength(0);
  h.outbox.connection(true);
  h.outbox.retry(id);
  h.outbox.connection(false);
  h.outbox.connection(true);
  expect(h.requests).toHaveLength(1);
  expect(h.snapshots.at(-1)![0].state).toBe("sending");
  h.requests[0].reply.resolve(h.ack());
  await flush();
  h.outbox.retry(id);
  h.outbox.connection(true);
  expect(h.snapshots.at(-1)![0].state).toBe("confirmed");
  expect(h.requests).toHaveLength(1);
});

test("429 impede retry antecipado; confirmação de outro autor não confirma envio", async () => {
  const h = harness();
  h.outbox.connection(true);
  h.outbox.enqueue("sintético");
  h.requests[0].reply.reject(
    new ApiError(429, "aguarde", "RATE_LIMITED", 60_000),
  );
  await flush();
  const id = h.requests[0].message.clientId;
  h.outbox.retry(id);
  h.outbox.connection(true);
  expect(h.requests).toHaveLength(1);
  expect(h.snapshots.at(-1)![0].retryAt).toBeGreaterThan(Date.now());
  h.outbox.confirm([{ ...h.ack(), authorId: "other" }]);
  expect(h.snapshots.at(-1)![0].state).toBe("retryable-failure");
  h.outbox.confirm([h.ack()]);
  expect(h.snapshots.at(-1)![0].state).toBe("confirmed");
});

test("503 só repete por ação explícita e preserva UUID/corpo", async () => {
  const h = harness();
  h.outbox.connection(true);
  h.outbox.enqueue("sintético");
  h.requests[0].reply.reject(new ApiError(503, "indisponível", "UNAVAILABLE"));
  await flush();
  expect(h.snapshots.at(-1)![0].state).toBe("retryable-failure");
  h.outbox.connection(false);
  h.outbox.connection(true);
  expect(h.requests).toHaveLength(1);
  h.outbox.retry(h.requests[0].message.clientId);
  expect(h.requests).toHaveLength(2);
  expect(h.requests[1].message).toEqual(h.requests[0].message);
  h.requests[1].reply.resolve(h.ack(1));
  await flush();
  expect(h.snapshots.at(-1)![0].state).toBe("confirmed");
});

for (const late of ["sucesso", "erro"]) {
  test(`logout cancela envio e ignora ${late} tardio, sem liberar fila antiga`, async () => {
    const h = harness();
    h.outbox.connection(true);
    h.outbox.enqueue("em voo");
    h.outbox.connection(false);
    h.outbox.enqueue("na fila");
    const count = h.snapshots.length;
    h.outbox.dispose();
    expect(h.requests[0].signal.aborted).toBe(true);
    if (late === "sucesso") h.requests[0].reply.resolve(h.ack());
    else h.requests[0].reply.reject(new Error("tardio"));
    await flush();
    h.outbox.connection(true);
    h.outbox.retry(h.requests[0].message.clientId);
    h.outbox.enqueue("descartado");
    expect(h.snapshots).toHaveLength(count);
    expect(h.saved).toEqual([]);
    expect(h.requests).toHaveLength(1);
  });
}
