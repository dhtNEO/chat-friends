import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import type { Message } from "../src/api";

const message = (id: number): Message => ({
  id,
  clientId: `client-${id}`,
  authorId: "chat-user",
  author: "Pessoa sintética",
  body: `mensagem sintética ${id}`,
  createdAt: "2026-10-30T12:00:00Z",
});
async function chatPage(page: Page) {
  let outage = false;
  let failed = false;
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  const after: number[] = [];
  const sockets: WebSocketRoute[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const instant = new Date("2026-10-30T12:00:00Z");
  await page.clock.install({ time: instant });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: "chat-user",
            username: "chat-test",
            displayName: "Pessoa sintética",
            admin: false,
            enabled: true,
            primaryColor: null,
            secondaryColor: null,
            avatarVersion: null,
          },
          spaceName: "Espaço sintético",
          security: {
            mfaPending: false,
            enrollmentRequired: false,
            mfaEnabled: false,
          },
        },
      });
    if (url.pathname === "/api/messages") {
      const cursor = url.searchParams.get("after");
      if (cursor === null) return route.fulfill({ json: [message(100)] });
      after.push(Number(cursor));
      if (outage && !failed) {
        failed = true;
        await failureGate;
        return route.fulfill({ status: 503 });
      }
      const end = outage ? 201 : 100;
      return route.fulfill({
        json: Array.from(
          { length: Math.min(100, end - Number(cursor)) },
          (_, i) => message(Number(cursor) + i + 1),
        ),
      });
    }
    if (url.pathname === "/api/members") return route.fulfill({ json: [] });
    if (url.pathname === "/api/media/state")
      return route.fulfill({
        json: { lease: {}, leases: [], participants: [] },
      });
    return route.fulfill({ status: 404 });
  });
  await page.routeWebSocket("**/ws", (socket) => {
    sockets.push(socket);
    socket.onMessage(() => socket.send(JSON.stringify({ type: "pong" })));
  });
  await page.goto("/?shell=advanced");
  await expect.poll(() => errors).toEqual([]);
  await expect(
    page.getByText(message(100).body, { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".connection")).toContainText("Atualizado");
  // Let Dockview finish its initial animation-frame layout before pausing time.
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 1000),
  );
  return {
    after,
    sockets,
    errors,
    fail: () => {
      outage = true;
      return releaseFailure;
    },
  };
}

test("cursor 100, GET falha e WS 201 recuperam 101–201 sem fechar o socket", async ({
  page,
}) => {
  const chat = await chatPage(page);
  const releaseFailure = chat.fail();
  chat.sockets[0].close();
  await page.clock.runFor(3100);
  await expect.poll(() => chat.sockets.length).toBe(2);
  releaseFailure();
  await expect(page.locator(".connection")).toContainText("Chat indisponível");
  chat.sockets[1].send(
    JSON.stringify({ type: "message", message: message(201) }),
  );
  await page.clock.runFor(10000);
  await expect(page.getByText(message(101).body, { exact: true })).toHaveCount(
    1,
  );
  await expect(page.locator(".message")).toHaveCount(102);
  await expect(page.locator(".message p")).toHaveText(
    Array.from({ length: 102 }, (_, i) => message(100 + i).body),
  );
  await expect(page.locator(".connection")).toContainText("Atualizado");
  expect(chat.sockets).toHaveLength(2);
  expect(chat.errors).toEqual([]);
});

test("UI conecta/sincroniza e logout cancela HTTP, timers e handlers antigos", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(`
    window.chatSockets = [];
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      onopen = null; onclose = null; onmessage = null;
      constructor() { window.chatSockets.push(this); }
      send() {} close() { this.readyState = 3; }
    };
  `);
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: "chat-user",
            username: "chat-test",
            displayName: "Pessoa",
            admin: false,
            enabled: true,
            primaryColor: null,
            secondaryColor: null,
            avatarVersion: null,
          },
          spaceName: "Sintético",
          security: {
            mfaPending: false,
            enrollmentRequired: false,
            mfaEnabled: false,
          },
        },
      });
    if (path === "/api/messages") {
      await pending;
      return route.fulfill({ json: [message(201)] }).catch(() => {});
    }
    if (path === "/api/csrf")
      return route.fulfill({ json: { token: "synthetic" } });
    if (path === "/api/logout") return route.fulfill({ status: 204 });
    if (path === "/api/media/state")
      return route.fulfill({
        json: { lease: {}, leases: [], participants: [] },
      });
    if (path === "/api/members") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/?shell=advanced");
  await expect(page.locator(".connection")).toContainText("Conectando…");
  await page.evaluate(`(() => {
    const ws = window.chatSockets.at(-1);
    window.oldChatHandlers = { open: ws.onopen, close: ws.onclose, message: ws.onmessage };
    ws.onopen();
  })()`);
  await expect(page.locator(".connection")).toContainText("Sincronizando…");
  await expect
    .poll(() => requests.filter((p) => p === "/api/messages").length)
    .toBe(1);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
  const count = requests.length;
  const socketCount = await page.evaluate("window.chatSockets.length");
  release();
  await page.evaluate(`(() => {
    const old = window.oldChatHandlers;
    old.open(); old.close();
    old.message({ data: JSON.stringify({ type: 'profile' }) });
    old.message({ data: JSON.stringify({ type: 'message', message: ${JSON.stringify(message(202))} }) });
  })()`);
  await page.clock.runFor(60000);
  expect(await page.evaluate("window.chatSockets.length")).toBe(socketCount);
  expect(await page.evaluate("window.chatSockets.at(-1).onmessage")).toBeNull();
  expect(requests).toHaveLength(count);
  await expect(page.locator(".message")).toHaveCount(0);
  await expect(page.locator(".error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
