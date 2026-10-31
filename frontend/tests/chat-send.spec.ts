import {
  test,
  expect,
  type Page,
  type Route,
  type WebSocketRoute,
} from "@playwright/test";
import type { Message } from "../src/api";

type Payload = { clientId: string; body: string };
async function setup(
  page: Page,
  post?: (route: Route, payload: Payload) => Promise<void>,
) {
  const requests: Payload[] = [];
  const messages = new Map<string, Message>();
  const sockets: WebSocketRoute[] = [];
  const errors: string[] = [];
  let user = "send-user";
  const commit = (payload: Payload) => {
    const saved = messages.get(payload.clientId) ?? {
      ...payload,
      id: messages.size + 1,
      authorId: user,
      author: "Pessoa sintética",
      createdAt: "2026-10-30T12:00:00Z",
    };
    messages.set(payload.clientId, saved);
    return saved;
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: user,
            username: user,
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
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as Payload;
        requests.push(payload);
        if (post) return post(route, payload);
        return route.fulfill({ json: commit(payload) });
      }
      return route.fulfill({
        json: [...messages.values()]
          .filter((m) => m.id > Number(url.searchParams.get("after") ?? 0))
          .slice(0, 100),
      });
    }
    if (url.pathname === "/api/members") return route.fulfill({ json: [] });
    if (url.pathname === "/api/media/state")
      return route.fulfill({
        json: { lease: {}, leases: [], participants: [] },
      });
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { token: "synthetic" } });
    if (["/api/logout", "/api/login"].includes(url.pathname))
      return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404 });
  });
  await page.routeWebSocket("**/ws", (socket) => {
    sockets.push(socket);
    socket.onMessage(() => socket.send(JSON.stringify({ type: "pong" })));
  });
  await page.goto("/?shell=advanced");
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  await expect(page.locator(".connection")).toContainText("Atualizado");
  return {
    requests,
    messages,
    sockets,
    errors,
    commit,
    account: (id: string) => {
      user = id;
    },
  };
}

test("POST atrasado não oferece retry durante envio nem duplica por duplo submit", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chat = await setup(page, async (route, payload) => {
    await pending;
    await route.fulfill({ json: chat.commit(payload) });
  });
  try {
    await page.getByLabel("Mensagem em geral").fill("envio atrasado");
    await page.locator("form.composer").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect.poll(() => chat.requests.length).toBe(1);
    await expect(
      page.getByRole("button", { name: "Tentar novamente", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".pending")).toContainText("Enviando");
  } finally {
    release();
  }
  await expect(page.locator(".message")).toHaveCount(1);
  await expect(page.locator(".pending")).toHaveCount(0);
  expect(chat.errors).toEqual([]);
});

test("queda após commit preserva UUID e corpo no retry manual", async ({
  page,
}) => {
  const chat = await setup(page, async (route, payload) => {
    const saved = chat.commit(payload);
    if (chat.requests.length === 1) return route.abort("failed");
    return route.fulfill({ json: saved });
  });
  await page
    .getByLabel("Mensagem em geral")
    .fill("resposta perdida após commit");
  await page.getByLabel("Mensagem em geral").press("Enter");
  await expect(
    page.locator('.pending[data-state="retryable-failure"]'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(page.locator(".message")).toHaveCount(1);
  await expect(page.locator(".pending")).toHaveCount(0);
  expect(chat.requests).toHaveLength(2);
  expect(chat.requests[1]).toEqual(chat.requests[0]);
  expect(chat.requests[0].clientId).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(chat.messages.size).toBe(1);
});

test("timeout após commit permite retry com UUID estável e ignora resposta original tardia", async ({
  page,
}) => {
  await page.clock.install();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chat = await setup(page, async (route, payload) => {
    const saved = chat.commit(payload);
    if (chat.requests.length === 1) {
      await pending;
      return route.fulfill({ json: saved }).catch(() => {});
    }
    return route.fulfill({ json: saved });
  });
  try {
    await page.getByLabel("Mensagem em geral").fill("commit sem ACK no prazo");
    await page.getByLabel("Mensagem em geral").press("Enter");
    await expect.poll(() => chat.requests.length).toBe(1);
    await page.clock.runFor(15001);
    await expect(
      page.locator('.pending[data-state="retryable-failure"]'),
    ).toContainText("demorou");
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await expect(page.locator(".message")).toHaveCount(1);
    expect(chat.requests).toHaveLength(2);
    expect(chat.requests[1]).toEqual(chat.requests[0]);
  } finally {
    release();
  }
  await expect(page.locator(".pending")).toHaveCount(0);
  expect(chat.messages.size).toBe(1);
  expect(chat.errors).toEqual([]);
});

for (const late of ["ack", "erro"] as const) {
  test(`confirmação WS/HTTP antes de ${late} tardio deixa só uma mensagem confirmada`, async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chat = await setup(page, async (route, payload) => {
      const saved = chat.commit(payload);
      chat.sockets
        .at(-1)!
        .send(JSON.stringify({ type: "message", message: saved }));
      await pending;
      if (late === "erro") await route.abort("failed");
      else await route.fulfill({ json: saved });
    });
    await page
      .getByLabel("Mensagem em geral")
      .fill(`confirmação antes de ${late}`);
    await page.getByLabel("Mensagem em geral").press("Enter");
    try {
      await expect(page.locator(".message")).toHaveCount(1);
      await expect(page.locator(".delivery-confirmed")).toHaveText("Enviado");
      await expect(page.locator(".pending")).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.locator(".connection")).toContainText("Atualizado");
    await expect(page.locator(".message")).toHaveCount(1);
    await expect(page.locator(".pending")).toHaveCount(0);
    expect(chat.requests).toHaveLength(1);
    expect(chat.errors).toEqual([]);
  });
}

for (const status of [400, 409]) {
  test(`${status} rejeita envio e reconexão não o reenvia`, async ({
    page,
  }) => {
    await page.clock.install();
    const chat = await setup(page, (route) => route.fulfill({ status }));
    await page.getByLabel("Mensagem em geral").fill(`rejeição ${status}`);
    await page.getByLabel("Mensagem em geral").press("Enter");
    await expect(page.locator('.pending[data-state="rejected"]')).toContainText(
      "Não enviado · rejeitado",
    );
    await expect(
      page.getByRole("button", { name: "Tentar novamente", exact: true }),
    ).toHaveCount(0);
    chat.sockets.at(-1)!.close();
    await page.clock.runFor(3100);
    await expect.poll(() => chat.sockets.length).toBe(2);
    await expect(page.locator(".connection")).toContainText("Atualizado");
    expect(chat.requests).toHaveLength(1);
  });
}

test("429 respeita Retry-After e duplo retry usa o mesmo UUID", async ({
  page,
}) => {
  await page.clock.install();
  const chat = await setup(page, (route, payload) =>
    chat.requests.length === 1
      ? route.fulfill({ status: 429, headers: { "Retry-After": "2" } })
      : route.fulfill({ json: chat.commit(payload) }),
  );
  await page.getByLabel("Mensagem em geral").fill("limite temporário");
  await page.getByLabel("Mensagem em geral").press("Enter");
  await expect(
    page.getByRole("button", { name: /Aguarde \d+ segundos/ }),
  ).toBeDisabled();
  expect(chat.requests).toHaveLength(1);
  await page.clock.runFor(2250);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator(".message")).toHaveCount(1);
  expect(chat.requests).toHaveLength(2);
  expect(chat.requests[1]).toEqual(chat.requests[0]);
});

test("multiline, Shift+Enter e IME não enviam composição parcial", async ({
  page,
}) => {
  const chat = await setup(page);
  const input = page.getByLabel("Mensagem em geral");
  await input.fill("候補");
  await input.dispatchEvent("compositionstart");
  await input.press("Enter");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  expect(chat.requests).toHaveLength(0);
  await input.dispatchEvent("compositionend");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 229,
  });
  expect(chat.requests).toHaveLength(0);
  await input.fill("linha um");
  await input.press("Shift+Enter");
  await input.pressSequentially("linha dois");
  await expect(input).toHaveValue("linha um\nlinha dois");
  expect(chat.requests).toHaveLength(0);
  await input.press("Enter");
  await expect(page.locator(".message p")).toHaveText("linha um\nlinha dois");
  expect(chat.requests[0].body).toBe("linha um\nlinha dois");
  await expect(input).toHaveValue("");
});

test("contador e emoji respeitam 4000 UTF-16 sem cortar par substituto", async ({
  page,
}) => {
  const chat = await setup(page);
  const input = page.getByLabel("Mensagem em geral");
  await input.fill("a".repeat(3999));
  await page.getByRole("button", { name: "Emojis", exact: true }).click();
  await page.getByRole("button", { name: "😀", exact: true }).click();
  await expect(input).toHaveValue("a".repeat(3999));
  await expect(page.getByLabel("Limite da mensagem")).toHaveText("3999/4000");
  await input.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(3998, 3999),
  );
  await page.getByRole("button", { name: "😀", exact: true }).click();
  await expect(input).toHaveValue("a".repeat(3998) + "😀");
  await expect(page.getByLabel("Limite da mensagem")).toHaveText("4000/4000");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(page.locator(".message")).toHaveCount(1);
  expect(chat.requests[0].body.length).toBe(4000);
  expect(chat.requests[0].body.endsWith("😀")).toBe(true);
});

test("painéis compartilham rascunho em memória, reabrem com ele e logout o elimina", async ({
  page,
}) => {
  const chat = await setup(page);
  const draft = "rascunho privado em memória\nsegunda linha";
  await page.getByLabel("Mensagem em geral").fill(draft);
  await page
    .getByRole("button", { name: "Nova conversa ao lado", exact: true })
    .click();
  await expect(page.getByLabel("Mensagem em geral")).toHaveCount(2);
  for (const input of await page.getByLabel("Mensagem em geral").all())
    await expect(input).toHaveValue(draft);
  for (let i = 0; i < 2; i++)
    await page
      .locator(".dv-tab")
      .filter({ hasText: "# geral" })
      .first()
      .getByRole("button", { name: "Close # geral", exact: true })
      .click();
  await expect(page.getByLabel("Mensagem em geral")).toHaveCount(0);
  await page.getByRole("button", { name: "Conversa", exact: true }).click();
  await expect(page.getByLabel("Mensagem em geral")).toHaveValue(draft);
  const stored = await page.evaluate(() =>
    [...Object.values(localStorage), ...Object.values(sessionStorage)].join(
      "\n",
    ),
  );
  expect(stored).not.toContain(draft);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
  chat.account("other-user");
  await page.getByLabel("Usuário", { exact: true }).fill("other-user");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(page.getByLabel("Mensagem em geral")).toHaveValue("");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  chat.account("send-user");
  await page.getByLabel("Usuário", { exact: true }).fill("send-user");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(page.getByLabel("Mensagem em geral")).toHaveValue("");
  expect(chat.requests).toHaveLength(0);
  expect(chat.errors).toEqual([]);
});

test("envio sem socket aberto fica na fila e conexão envia uma vez", async ({
  page,
}) => {
  await page.clock.install();
  const chat = await setup(page);
  chat.sockets.at(-1)!.close();
  await expect(page.locator(".connection")).toContainText("Conectando…");
  await page.getByLabel("Mensagem em geral").fill("fila antes de conectar");
  await page.getByLabel("Mensagem em geral").press("Enter");
  await expect(page.locator('.pending[data-state="queued"]')).toContainText(
    "Na fila",
  );
  expect(chat.requests).toHaveLength(0);
  await page.clock.runFor(3100);
  await expect(page.locator(".message p")).toHaveText("fila antes de conectar");
  expect(chat.requests).toHaveLength(1);
  expect(chat.errors).toEqual([]);
});
