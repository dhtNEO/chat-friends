import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let server: ChildProcess;
const origin = "http://127.0.0.1:4182";
test.use({ timezoneId: "America/Sao_Paulo" });
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
      "4182",
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
  await page.goto(origin + "/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("jogador");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await page
    .getByRole("navigation", { name: "Painéis" })
    .getByRole("button", { name: "Outlook", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Outlook, calendário da galera" }),
  ).toBeVisible();
}
test("calendário compartilhado cria, confirma, edita e cancela no fuso local", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  const outlook = page.getByRole("region", {
    name: "Outlook, calendário da galera",
  });
  await outlook.locator(".outlook-hero").getByRole("button").click();
  const form = outlook.getByRole("form", { name: "Criar evento", exact: true });
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await form
    .getByLabel("Nome do evento", { exact: true })
    .fill("Sextou no Minecraft");
  await form.getByLabel("Jogo", { exact: true }).fill("Minecraft");
  await form.getByLabel("Início", { exact: true }).fill(date + "T20:00");
  await form.getByLabel("Fim", { exact: true }).fill(date + "T23:00");
  await form
    .getByLabel("Recado pra galera", { exact: true })
    .fill("Bora construir uma vila!");
  await form
    .getByRole("button", { name: "Marcar jogatina", exact: true })
    .click();
  const event = outlook.getByRole("article", {
    name: "Evento Sextou no Minecraft",
    exact: true,
  });
  await expect(event).toBeVisible();
  await expect(
    event.getByRole("button", { name: "✓ Vou", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    outlook.getByText("America/Sao_Paulo", { exact: true }),
  ).toBeVisible();
  const data = await page.evaluate(async () => {
    const from = new Date();
    from.setDate(from.getDate() - 2);
    const to = new Date();
    to.setDate(to.getDate() + 30);
    return fetch(
      `/api/outlook?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    ).then((r) => r.json());
  });
  expect(
    data.find((e: { title: string }) => e.title === "Sextou no Minecraft")
      .startsAt,
  ).toBe(date + "T23:00:00.000Z");
  await event.getByRole("button", { name: "? Talvez", exact: true }).click();
  await expect(
    event.getByRole("button", { name: "? Talvez", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await event
    .getByRole("button", { name: "Editar evento", exact: true })
    .click();
  const edit = outlook.getByRole("form", {
    name: "Editar evento",
    exact: true,
  });
  await edit
    .getByLabel("Nome do evento", { exact: true })
    .fill("Minecraft com a galera");
  await edit
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  const updated = outlook.getByRole("article", {
    name: "Evento Minecraft com a galera",
    exact: true,
  });
  await expect(updated).toBeVisible();
  await updated
    .getByRole("button", { name: "Cancelar evento", exact: true })
    .click();
  await updated
    .getByRole("button", { name: "Sim, cancelar evento", exact: true })
    .click();
  await expect(updated.getByText("Cancelado", { exact: true })).toBeVisible();
  await expect(
    updated.getByRole("button", { name: "✓ Vou", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("administrador pode editar evento de outra pessoa e confirmar presença", async ({
  page,
}) => {
  await enter(page);
  const outlook = page.locator(".outlook");
  const label = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} de ${d.getFullYear()}`;
  });
  await outlook.getByRole("button", { name: label, exact: false }).click();
  const event = outlook.getByRole("article", {
    name: "Evento Noite do co-op",
    exact: true,
  });
  await expect(event).toBeVisible();
  await expect(
    event.getByRole("button", { name: "Editar evento", exact: true }),
  ).toHaveCount(1);
  await event.getByRole("button", { name: "✓ Vou", exact: true }).click();
  await expect(
    event.getByRole("button", { name: "✓ Vou", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("Outlook e formulário cabem no celular e navegam entre meses", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const outlook = page.locator(".outlook");
  await expect(outlook.locator(".outlook-grid > button")).toHaveCount(42);
  const heading = await outlook.locator(".outlook-toolbar h3").textContent();
  await outlook
    .getByRole("button", { name: "Próximo mês", exact: true })
    .click();
  await expect(outlook.locator(".outlook-toolbar h3")).not.toHaveText(heading!);
  await outlook.getByRole("button", { name: "Hoje", exact: true }).click();
  await outlook.locator(".outlook-hero").getByRole("button").click();
  await expect(outlook.getByLabel("Início", { exact: true })).toBeVisible();
  expect(
    await outlook.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
});
