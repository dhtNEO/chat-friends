import { expect, type Page, type WebSocketRoute } from "@playwright/test";
import type { Message } from "../src/api";

export const historyMessage = (id: number): Message => ({
  id,
  clientId: `history-${id}`,
  authorId: `person-${Math.floor(id / 3) % 3}`,
  author: `Pessoa ${Math.floor(id / 3) % 3}`,
  createdAt: new Date(Date.UTC(2026, 9, 20) + id * 60_000).toISOString(),
  body:
    id % 20 === 0
      ? (`Texto longo ${id}: ` + "palavra variável 😀\n".repeat(260)).slice(
          0,
          4000,
        )
      : `Mensagem ${id}\n${"linha variável ".repeat((id % 4) + 1)}`,
});
export async function historyPage(page: Page, initial = 100) {
  let maximum = initial;
  let fail = false;
  let gate: Promise<void> | undefined;
  const before: number[] = [];
  const sockets: WebSocketRoute[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: "history-user",
            username: "history-user",
            displayName: "Pessoa sintética",
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
    if (url.pathname === "/api/messages") {
      const older = url.searchParams.get("before"),
        after = url.searchParams.get("after");
      if (older !== null) {
        before.push(Number(older));
        if (gate) await gate;
        if (fail) {
          fail = false;
          return route.fulfill({ status: 503 });
        }
      }
      const from =
        older !== null
          ? Math.max(1, Number(older) - 50)
          : after !== null
            ? Number(after) + 1
            : Math.max(1, maximum - 49);
      const to =
        older !== null
          ? Number(older) - 1
          : after !== null
            ? Math.min(maximum, from + 99)
            : maximum;
      return route.fulfill({
        json: Array.from({ length: Math.max(0, to - from + 1) }, (_, i) =>
          historyMessage(from + i),
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
  await page.goto("/");
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  await expect(page.locator(".connection")).toContainText("Atualizado");
  return {
    before,
    errors,
    arrive(to: number) {
      maximum = to;
      sockets
        .at(-1)!
        .send(JSON.stringify({ type: "message", message: historyMessage(to) }));
    },
    failNext() {
      fail = true;
    },
    hold() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}
