import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

const origin = "http://127.0.0.1:4186";
let server: ChildProcess;
const failures = new WeakMap<Page, string[]>();
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
      "4186",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw new Error("Demo T06 não iniciou");
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
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => expect(failures.get(page)).toEqual([]));

async function signIn(page: Page, viewport = { width: 320, height: 568 }) {
  await page.setViewportSize(viewport);
  await page.goto(origin + "/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("drawer-test");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeVisible();
}

test("Escape fecha drawer mobile e devolve foco ao acionador", async ({
  page,
}) => {
  await signIn(page);
  const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
  await trigger.click();
  await expect(page.locator(".drawer-open")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer-open")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("foco inicial, Tab em ciclo e fundo inert", async ({ page }) => {
  await signIn(page);
  const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Menu de navegação",
    exact: true,
  });
  const close = dialog.getByRole("button", { name: "Fechar menu" });
  await expect(close).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
  await trigger.evaluate((node) => node.focus());
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator("button:enabled").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  // Árvore acessível não comprova anúncio auditivo por leitor real.
  const cdp = await page.context().newCDPSession(page);
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const modal = tree.nodes.find(
    (node) =>
      node.role?.value === "dialog" && node.name?.value === "Menu de navegação",
  );
  expect(modal?.ignored).toBe(false);
  expect(modal?.properties?.find((p) => p.name === "modal")?.value.value).toBe(
    true,
  );
  await close.click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});
for (const destination of ["geral", "Clube da Sorte", "Outlook"]) {
  test(`navegar para ${destination} fecha e restaura foco`, async ({
    page,
  }) => {
    await signIn(page);
    const trigger = page.getByRole("button", {
      name: "Abrir menu",
      exact: true,
    });
    await trigger.click();
    await page
      .getByRole("dialog", { name: "Menu de navegação" })
      .getByRole("button", { name: destination })
      .click();
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(
      page.getByRole("button", { name: "Fechar menu" }),
    ).toBeFocused();
  });
}

test("backdrop fecha; desktop remove modalidade", async ({ page }) => {
  await signIn(page);
  const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
  await trigger.click();
  await page.mouse.click(318, 250);
  await expect(trigger).toBeFocused();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await trigger.click();
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mostrar canais", exact: true }),
  ).toBeFocused();
});
for (const [name, width, height, zoom] of [
  ["320 px", 320, 568, 1],
  ["paisagem", 640, 320, 1],
  ["zoom CSS 200%", 320, 568, 2],
] as const) {
  test(`fechamento visível em ${name}`, async ({ page }) => {
    await signIn(page, { width, height });
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale);
    }, zoom);
    const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    const close = dialog.getByRole("button", { name: "Fechar menu" });
    const rect = await dialog.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    await dialog.locator(".drawer-content").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const button = await close.boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(0);
    expect(button!.y + button!.height).toBeLessThanOrEqual(height);
    await close.click();
    await expect(page.locator("dialog:modal")).toHaveCount(0);
  });
}

test("popover de emojis continua não modal e não intercepta Escape do drawer", async ({
  page,
}) => {
  await signIn(page);
  const emojis = page.getByRole("button", { name: "Emojis", exact: true });
  await emojis.click();
  const popup = page.getByRole("dialog", { name: "Emojis", exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveAttribute("aria-modal", "true");
  const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Fechar menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
