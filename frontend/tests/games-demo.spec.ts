import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let server: ChildProcess;
const origin = "http://127.0.0.1:4176";
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
      "4176",
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
async function enter(page: import("@playwright/test").Page) {
  await page.goto(origin + "/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("jogador");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await page.getByRole("button", { name: "Jogos", exact: true }).click();
  await expect(page.locator("section.club")).toBeVisible();
}
test("caça-níquel lento com manivela, roleta, aposta e próxima rodada", async ({
  page,
}) => {
  test.setTimeout(70000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  const club = page.locator("section.club");
  const lever = club.getByRole("button", {
    name: "Puxar manivela",
    exact: true,
  });
  await lever.scrollIntoViewIfNeeded();
  const bounds = await lever.boundingBox();
  expect(bounds).not.toBeNull();
  const started = Date.now();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 35);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 85, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(club.locator(".slot-cabinet")).toHaveClass(/is-spinning/);
  await expect(club.getByRole("status")).toContainText("Coins!", {
    timeout: 10000,
  });
  expect(Date.now() - started).toBeGreaterThanOrEqual(5200);
  await expect(
    club.getByText("9 GIROS GRÁTIS DISPONÍVEIS", { exact: true }),
  ).toBeVisible();
  await club
    .getByRole("button", { name: "Abrir mesa de roleta", exact: false })
    .click();
  const room = club.getByRole("region", { name: "Sala de Roleta" });
  await expect(room.getByText("Bia (simulada)", { exact: true })).toBeVisible();
  await expect(room.locator(".roulette-stage")).toHaveAttribute(
    "data-renderer",
    /webgl|fallback/,
  );
  await room.getByRole("button", { name: "Convidar no #geral" }).click();
  await expect(club.getByRole("status")).toHaveText(
    "Convite enviado no #geral!",
  );
  await room.getByRole("spinbutton", { name: "Coins na aposta" }).fill("20");
  await room
    .getByRole("button", { name: "Confirmar aposta", exact: true })
    .click();
  await expect(
    room.getByRole("button", { name: "✓ Aposta confirmada", exact: true }),
  ).toBeDisabled();
  await room
    .getByRole("button", { name: "Girar a roleta", exact: false })
    .click();
  await expect(room.getByText("Nada mais!", { exact: true })).toBeVisible();
  await expect(room.getByText("Resultado", { exact: true })).toBeVisible({
    timeout: 25000,
  });
  await expect(room.locator(".roulette-result-number")).toHaveText(
    /^(?:[0-9]|[12][0-9]|3[0-6])$/,
  );
  await room
    .getByRole("button", { name: "Abrir próxima rodada", exact: false })
    .click();
  await expect(
    room.getByText("Apostas abertas", { exact: true }),
  ).toBeVisible();
  await expect(
    room.getByRole("button", { name: "Confirmar aposta", exact: true }),
  ).toBeEnabled();
  await room
    .getByRole("button", { name: "Sair da mesa", exact: false })
    .click();
  await club.getByRole("button", { name: "Minhas Coins", exact: true }).click();
  await expect(
    club.getByText("Roleta · aposta · demonstração", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("clube cabe no celular e mantém controles acessíveis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const club = page.locator("section.club");
  await expect(
    club.getByRole("heading", { name: "Giro da Sorte", exact: true }),
  ).toBeVisible();
  expect(
    await club.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await club
    .getByRole("button", { name: "Mesa individual", exact: true })
    .click();
  const room = club.getByRole("region", { name: "Sala de Roleta" });
  await expect(
    room.getByRole("spinbutton", { name: "Coins na aposta" }),
  ).toBeVisible();
  expect(
    await club.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await room.getByRole("spinbutton", { name: "Coins na aposta" }).fill("5");
  await room
    .getByRole("button", { name: "Apostar no número 7", exact: true })
    .click();
  await room
    .getByRole("button", { name: "Confirmar aposta", exact: true })
    .click();
  await expect(
    room.getByRole("button", { name: "✓ Aposta confirmada", exact: true }),
  ).toBeDisabled();
  await club.getByRole("button", { name: "Pódio da semana" }).click();
  await expect(
    club.getByRole("heading", { name: "Pódio da semana", exact: true }),
  ).toBeVisible();
});
