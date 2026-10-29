import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let server: ChildProcess;
const origin = "http://127.0.0.1:4179";
test.beforeAll(async ({ request }) => {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--mode",
      "demo",
      "--host",
      "127.0.0.1",
      "--port",
      "4179",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await request.get(origin)).status();
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);
});
test.afterAll(() => server?.kill());
async function enter(page: Page) {
  await page.goto(origin);
  await page.getByLabel("Usuário", { exact: true }).fill("jogador");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await page.getByRole("button", { name: "Jogos", exact: true }).click();
  await expect(page.locator(".party-club")).toBeVisible();
}
test("blackjack multiplayer, carta oculta, pedir, parar e Coins", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page
    .getByRole("button", { name: "Criar mesa de blackjack", exact: false })
    .click();
  const room = page.getByRole("region", { name: "Sala de Blackjack" });
  await expect(room.getByText("Bia (simulada)", { exact: true })).toBeVisible();
  await room
    .getByRole("button", { name: "Confirmar entrada · 10 Coins", exact: true })
    .click();
  await room
    .getByRole("button", { name: "Distribuir cartas", exact: false })
    .click();
  await expect(room.getByLabel("Carta oculta", { exact: true })).toBeVisible();
  await room.getByRole("button", { name: "Pedir carta", exact: false }).click();
  await expect(room.locator(".own-hand header>b")).toHaveText("17");
  await room.getByRole("button", { name: "Parar", exact: false }).click();
  await expect(room.getByText("Resultado", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(room.locator(".own-hand small").last()).toContainText("8 Coins");
  await expect(room.getByLabel("Carta oculta", { exact: true })).toHaveCount(0);
  const first = await page.evaluate(() =>
    fetch("/api/party").then((r) => r.json()),
  );
  const balance = await page.evaluate(() =>
    fetch("/api/games")
      .then((r) => r.json())
      .then((s) => s.balance),
  );
  await expect(
    room.getByRole("button", { name: "Criar revanche", exact: false }),
  ).toHaveCount(0);
  await room
    .getByRole("button", { name: "Abrir próxima rodada", exact: false })
    .click();
  const next = await page.evaluate(() =>
    fetch("/api/party").then((r) => r.json()),
  );
  expect(next.room.id).toBe(first.room.id);
  expect(next.room.roundId).not.toBe(first.room.roundId);
  await room
    .getByRole("button", { name: "Confirmar entrada · 10 Coins", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      fetch("/api/games")
        .then((r) => r.json())
        .then((s) => s.balance),
    ),
  ).toBe(balance - 10);
  await room
    .getByRole("button", { name: "Distribuir cartas", exact: false })
    .click();
  await room.getByRole("button", { name: "Pedir carta", exact: false }).click();
  await room.getByRole("button", { name: "Parar", exact: false }).click();
  await expect(room.getByText("Resultado", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  expect(
    await page.evaluate(() =>
      fetch("/api/games")
        .then((r) => r.json())
        .then((s) => s.balance),
    ),
  ).toBe(balance - 10 + 8);
  expect(errors).toEqual([]);
});
test("ritmo usa seleção do bot e teclas; acertos rendem Coins", async ({
  page,
}) => {
  test.setTimeout(65000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page
    .getByRole("button", { name: "Abrir sala de voz", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await page.getByRole("button", { name: "Jogos", exact: true }).click();
  await page
    .getByLabel("Música para o jogo de ritmo", { exact: true })
    .fill("Festa");
  await page
    .getByRole("button", { name: "Buscar música", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Músicas para jogar" })
    .getByRole("button")
    .first()
    .click();
  await page
    .getByRole("button", { name: "Criar sala de ritmo", exact: false })
    .click();
  const room = page.getByRole("region", { name: "Sala de Ritmo" });
  await room
    .getByRole("button", { name: "Estou pronto!", exact: true })
    .click();
  await room
    .getByRole("button", { name: "Preparar música e começar", exact: false })
    .click();
  await expect(
    room.getByRole("img", { name: "Notas da música em quatro pistas" }),
  ).toBeVisible();
  const state = await page.evaluate(() =>
    fetch("/api/party").then((r) => r.json()),
  );
  for (let i = 0; i < 3; i++) {
    const target = state.room.startsAt + state.room.notes[i].at + 150;
    await page.waitForTimeout(Math.max(0, target - Date.now()));
    await page.keyboard.press(["d", "f", "j", "k"][state.room.notes[i].lane]);
  }
  await expect
    .poll(() =>
      page.evaluate(() =>
        fetch("/api/party")
          .then((r) => r.json())
          .then((s) => s.room.players[0].hits),
      ),
    )
    .toBeGreaterThanOrEqual(3);
  await expect(room.getByText("Resultado", { exact: true })).toBeVisible({
    timeout: 25000,
  });
  await expect(room.locator(".party-roster")).toContainText("Coins");
  expect(errors).toEqual([]);
});
test("mesas e controles dos novos jogos cabem no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(
    page.getByRole("button", { name: "Criar mesa de blackjack", exact: false }),
  ).toBeVisible();
  expect(
    await page
      .locator(".club")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Criar mesa de blackjack", exact: false })
    .click();
  const room = page.getByRole("region", { name: "Sala de Blackjack" });
  await room
    .getByRole("button", { name: "Confirmar entrada · 10 Coins", exact: true })
    .click();
  await room
    .getByRole("button", { name: "Distribuir cartas", exact: false })
    .click();
  await expect(
    room.getByRole("button", { name: "Pedir carta", exact: false }),
  ).toBeVisible();
  expect(
    await page
      .locator(".club")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
