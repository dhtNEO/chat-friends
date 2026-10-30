import { test, expect, type Page } from "@playwright/test";
import { historyPage } from "./chat-history-fixture";
import { existsSync, readFileSync } from "node:fs";

const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

async function anchor(page: Page) {
  return page.locator(".messages").evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-message-id]")].find(
      (node) => node.getBoundingClientRect().bottom > top + 1,
    )!;
    return {
      id: row.dataset.messageId!,
      offset: row.getBoundingClientRect().top - top,
    };
  });
}
async function expectAnchor(page: Page, point: { id: string; offset: number }) {
  await expect
    .poll(() =>
      page
        .locator(`[data-message-id="${point.id}"]`)
        .evaluate(
          (row, offset) =>
            Math.abs(
              row.getBoundingClientRect().top -
                row.closest(".messages")!.getBoundingClientRect().top -
                offset,
            ),
          point.offset,
        ),
    )
    .toBeLessThanOrEqual(4);
}

test("novas mensagens não puxam a leitura e oferecem contador/Ir para recentes", async ({
  page,
}) => {
  const chat = await historyPage(page);
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 250;
  });
  await frames(page);
  const before = await page.locator(".messages").evaluate((el) => el.scrollTop);
  chat.arrive(105);
  await expect(page.locator(".connection")).toContainText("Atualizado");
  await expect(
    page.getByRole("button", { name: "Ir para recentes", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chat-new-messages")).toContainText(
    "5 novas mensagens",
  );
  expect(
    Math.abs(
      (await page.locator(".messages").evaluate((el) => el.scrollTop)) - before,
    ),
  ).toBeLessThanOrEqual(4);
  await page
    .getByRole("button", { name: "Ir para recentes", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".messages")
        .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThanOrEqual(4);
  expect(chat.errors).toEqual([]);
});

for (const zoom of [1, 2]) {
  test(`50 anteriores mantêm ID/deslocamento em até 4px, texto longo e zoom ${zoom * 100}%`, async ({
    page,
  }) => {
    const chat = await historyPage(page);
    await page.evaluate((value) => {
      document.documentElement.style.zoom = String(value);
    }, zoom);
    await frames(page);
    await page.locator(".messages").evaluate((el) => {
      el.scrollTop = 0;
    });
    await frames(page);
    const point = await anchor(page);
    const release = chat.hold();
    const load = page.getByRole("button", {
      name: "Carregar mensagens anteriores",
      exact: true,
    });
    await load.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(() => chat.before.length).toBe(1);
    await expect(
      page.getByRole("button", { name: "Carregando anteriores…" }),
    ).toBeDisabled();
    release();
    await expect(page.locator(".message")).toHaveCount(100);
    await expectAnchor(page, point);
    expect(chat.before).toEqual([51]);
    await expect(page.locator('[data-message-id="40"]')).toHaveText(
      /^Texto longo 40/,
    );
    expect(chat.errors).toEqual([]);
  });
}

test("erro de paginação oferece retry, não muda âncora e fim impede novo GET", async ({
  page,
}) => {
  const chat = await historyPage(page);
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 0;
  });
  await frames(page);
  const point = await anchor(page);
  chat.failNext();
  await page
    .getByRole("button", { name: "Carregar mensagens anteriores", exact: true })
    .click();
  await expect(page.locator(".messages").getByRole("alert")).toContainText(
    "indisponível",
  );
  await expectAnchor(page, point);
  await page
    .getByRole("button", { name: "Tentar carregar anteriores", exact: true })
    .click();
  await expect(page.locator(".message")).toHaveCount(100);
  await expectAnchor(page, point);
  await page
    .getByRole("button", { name: "Carregar mensagens anteriores", exact: true })
    .click();
  await expect(page.locator(".chat-page-status")).toHaveText(
    "Início do histórico.",
  );
  await expect(
    page.getByRole("button", {
      name: "Carregar mensagens anteriores",
      exact: true,
    }),
  ).toBeDisabled();
  expect(chat.before).toEqual([51, 51, 1]);
  expect(chat.errors).toEqual([]);
});

test("mudança de posição durante HTTP lento vira a nova âncora, sem puxar leitura", async ({
  page,
}) => {
  const chat = await historyPage(page);
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 0;
  });
  const release = chat.hold();
  await page
    .getByRole("button", { name: "Carregar mensagens anteriores", exact: true })
    .click();
  await expect.poll(() => chat.before.length).toBe(1);
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 1000;
  });
  await frames(page);
  const point = await anchor(page);
  chat.arrive(105);
  await expect(page.locator(".chat-new-messages")).toContainText(
    "5 novas mensagens",
  );
  release();
  await expect(page.locator(".message")).toHaveCount(100);
  await expectAnchor(page, point);
  expect(chat.errors).toEqual([]);
});

test("fontes carregadas tardiamente preservam a mensagem e deslocamento", async ({
  page,
}) => {
  const chat = await historyPage(page);
  const fontPath = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
  ].find(existsSync);
  expect(
    fontPath,
    "Fonte mono do ambiente de testes deve estar instalada",
  ).toBeDefined();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/t05-late-font.ttf", async (route) => {
    await pending;
    await route.fulfill({
      body: readFileSync(fontPath!),
      contentType: "font/ttf",
    });
  });
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 4000;
  });
  await page.route("**/t05-late-font.css", (route) =>
    route.fulfill({
      contentType: "text/css",
      body: '@font-face { font-family: T05Late; src: url("/t05-late-font.ttf"); font-display: swap; } .message p { font-family: T05Late, sans-serif; }',
    }),
  );
  await page.addStyleTag({ url: "/t05-late-font.css" });
  await frames(page);
  const point = await anchor(page);
  release();
  await page.evaluate(() =>
    document.fonts.load("14px T05Late").then(() => undefined),
  );
  await frames(page);
  await expectAnchor(page, point);
  expect(chat.errors).toEqual([]);
});

test("páginas antigas não entram em regiões live, só confirmação de quantidade", async ({
  page,
}) => {
  const chat = await historyPage(page);
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page
    .getByRole("button", { name: "Carregar mensagens anteriores", exact: true })
    .click();
  await expect(page.locator(".chat-page-status")).toHaveText(
    "50 mensagens anteriores carregadas.",
  );
  await expect(
    page.getByRole("list", { name: "Histórico de mensagens" }),
  ).toHaveAttribute("aria-live", "off");
  const liveTexts = await page
    .locator(
      '[role="status"], [role="log"], [aria-live="polite"], [aria-live="assertive"]',
    )
    .allTextContents();
  expect(liveTexts.join("\n")).not.toContain("Mensagem 1\n");
  expect(liveTexts.join("\n")).not.toContain("Texto longo 40:");
  await expect(page.locator(".chat-announcement")).toHaveText("");
  const tree = await page.locator(".messages").ariaSnapshot();
  expect(tree).toContain("Histórico de mensagens");
  expect(tree).toContain("Mensagem 1");
  chat.arrive(101);
  await expect(page.locator(".chat-announcement")).toHaveText(
    "Nova mensagem recebida.",
  );
  expect(chat.errors).toEqual([]);
});

test("janela de 200 preserva seleção com mensagens novas e navega todo histórico carregado", async ({
  page,
}) => {
  const chat = await historyPage(page, 50);
  chat.arrive(1000);
  await expect(page.locator(".chat-window-label")).toContainText(
    "de 1000 mensagens carregadas",
  );
  await expect(page.locator(".message")).toHaveCount(200);
  const selected = await page
    .locator('[data-message-id="999"]')
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });
  await expect(
    page.getByRole("button", { name: "Ir para recentes", exact: true }),
  ).toBeDisabled();
  chat.arrive(1050);
  await expect(page.locator(".chat-new-messages")).toContainText(
    "50 novas mensagens",
  );
  expect(await page.evaluate(() => document.getSelection()!.toString())).toBe(
    selected,
  );
  await expect(page.locator('[data-message-id="999"]')).toBeAttached();
  await expect(page.locator(".message")).toHaveCount(200);
  await page.evaluate(() => document.getSelection()!.removeAllRanges());
  // Walk explicit cached pages; each step keeps real, variable-height rows.
  for (let i = 0; i < 16; i++) {
    await page.locator(".messages").evaluate((el) => {
      el.scrollTop = 0;
    });
    await frames(page);
    await page
      .getByRole("button", {
        name: "Carregar mensagens anteriores",
        exact: true,
      })
      .click();
    await expect(page.locator(".message")).toHaveCount(200);
  }
  await expect(page.locator('[data-message-id="1"]')).toBeAttached();
  expect(chat.before).toHaveLength(0); // Cached history does not refetch HTTP.
  await page
    .getByRole("button", { name: "Ir para recentes", exact: true })
    .click();
  await expect(page.locator('[data-message-id="1050"]')).toBeAttached();
  await expect(page.locator(".message")).toHaveCount(200);
  expect(chat.errors).toEqual([]);
});

test("navegação por teclado pausa acompanhamento e mantém página assistiva disponível", async ({
  page,
}) => {
  const chat = await historyPage(page);
  await page.getByRole("region", { name: "Mensagens", exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "Ir para recentes", exact: true }),
  ).toBeVisible();
  const point = await anchor(page);
  chat.arrive(110);
  await expect(page.locator(".chat-new-messages")).toContainText(
    "10 novas mensagens",
  );
  await expectAnchor(page, point);
  const tree = await page.locator(".messages").ariaSnapshot();
  expect(tree).toContain("Histórico de mensagens");
  expect(tree).toContain("listitem");
  expect(chat.errors).toEqual([]);
});

test("avançar página carregada mantém a âncora com alturas variáveis", async ({
  page,
}) => {
  const chat = await historyPage(page, 50);
  chat.arrive(500);
  await expect(page.locator(".chat-window-label")).toContainText(
    "de 500 mensagens carregadas",
  );
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = 0;
  });
  await frames(page);
  await page
    .getByRole("button", { name: "Carregar mensagens anteriores", exact: true })
    .click();
  await expect(page.locator('[data-message-id="251"]')).toBeAttached();
  await page.locator(".messages").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await frames(page);
  const point = await anchor(page);
  await page
    .getByRole("button", { name: "Mensagens mais recentes", exact: true })
    .click();
  await expect(page.locator('[data-message-id="500"]')).toBeAttached();
  await expectAnchor(page, point);
  expect(chat.before).toHaveLength(0);
  expect(chat.errors).toEqual([]);
});

test("primeira mensagem de chat vazio é anunciada, bootstrap e páginas antigas não", async ({
  page,
}) => {
  const chat = await historyPage(page, 0);
  await expect(page.locator(".chat-announcement")).toHaveText("");
  chat.arrive(1);
  await expect(page.locator(".message")).toHaveCount(1);
  await expect(page.locator(".chat-announcement")).toHaveText(
    "Nova mensagem recebida.",
  );
  expect(chat.errors).toEqual([]);
});
