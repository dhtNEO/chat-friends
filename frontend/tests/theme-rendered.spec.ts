import { test, expect, type Locator, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { PRESETS } from "../src/theme";
import {
  channels,
  measuredContrast,
  sampledContrast,
} from "./theme-contrast-oracle";

const origin = "http://127.0.0.1:4188";
let server: ChildProcess;
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
      "4188",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw Error("Demo T07 não iniciou");
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
test.beforeEach(async ({ page }) => {
  await page.goto(origin);
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
  await page.addStyleTag({
    content:
      "*,*::before,*::after { transition: none !important; animation: none !important; }",
  });
});
const rgb = (css: string) => {
  const values = css.match(/[\d.]+/g)?.map(Number);
  if (!values || values.length < 3 || (values.length > 3 && values[3] !== 1))
    throw Error(`Cor não opaca: ${css}`);
  return values.slice(0, 3);
};
async function apply(page: Page, p: string, s: string) {
  await page.evaluate(
    async ({ p, s }) => {
      const path = "/src/theme.ts";
      const theme = await import(/* @vite-ignore */ path);
      theme.applyTheme(p, s);
    },
    { p, s },
  );
}
async function tokens(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.documentElement.style]
        .filter((k) => k.startsWith("--"))
        .map((k) => [k, document.documentElement.style.getPropertyValue(k)]),
    ),
  );
}
async function assertControl(control: Locator, gradient: boolean) {
  const style = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      bg: s.backgroundColor,
      image: s.backgroundImage,
      border: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      filter: s.filter,
    };
  });
  expect(style.filter).toBe("none");
  const ink = rgb(style.color);
  if (gradient) {
    // Chromium omits the default sRGB space when serializing computed gradients.
    expect(style.image).toContain("linear-gradient");
    // getComputedStyle serializes hex stops to rgb(); reuse independent oracle.
    const value = style.image.replace(
      /rgb\(([^)]+)\)/g,
      (_, v: string) =>
        "#" +
        v
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
          .join(""),
    );
    expect(sampledContrast(ink, value)).toBeGreaterThanOrEqual(4.5);
  } else
    expect(measuredContrast(ink, rgb(style.bg))).toBeGreaterThanOrEqual(4.5);
  expect(parseFloat(style.borderWidth)).toBeGreaterThan(0);
  // Upper bound on the dark surfaces surrounding functional filled controls.
  expect(
    measuredContrast(rgb(style.border), channels("#353846")),
  ).toBeGreaterThanOrEqual(3);
}
async function assertFocus(page: Page, control: Locator) {
  await page.keyboard.press("Tab");
  await control.focus();
  const style = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      visible: el.matches(":focus-visible"),
      ring: s.outlineColor,
      width: s.outlineWidth,
      shadow: s.boxShadow,
    };
  });
  expect(style.visible).toBe(true);
  expect(parseFloat(style.width)).toBeGreaterThanOrEqual(2);
  const gap = style.shadow.match(/rgb\([^)]+\)/)?.[0];
  expect(gap).toBeTruthy();
  expect(measuredContrast(rgb(style.ring), rgb(gap!))).toBeGreaterThanOrEqual(
    3,
  );
}
async function signIn(page: Page) {
  await page.getByLabel("Usuário", { exact: true }).fill("contrast-test");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
}

for (const [name, p, s] of [
  ...PRESETS,
  ["Branco/preto", "#ffffff", "#000000"],
  ["Preto/branco", "#000000", "#ffffff"],
  ["Médio", "#777777", "#808080"],
  ["RGB", "#ff0000", "#00ff00"],
]) {
  test(`login renderizado: normal, hover, active e foco — ${name}`, async ({
    page,
  }) => {
    await apply(page, p, s);
    const button = page.getByRole("button", { name: /Entrar no espaço/ });
    const capture = async (state: string) => {
      if (name === "Oceano" || name === "Preto/branco")
        await page.screenshot({
          path: `test-results/theme-${name.replaceAll("/", "-")}-${state}.png`,
        });
    };
    await page.mouse.move(0, 0);
    await assertControl(button, true);
    await capture("normal");
    await button.hover();
    await assertControl(button, true);
    await capture("hover");
    await page.mouse.down();
    try {
      await assertControl(button, true);
    } finally {
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
    await assertFocus(page, button);
    await capture("focus");
    await assertFocus(page, page.getByLabel("Usuário", { exact: true }));
    if (name === "Oceano" || name === "Preto/branco")
      await page.screenshot({
        path: `test-results/theme-${name.replaceAll("/", "-")}.png`,
      });
  });
}

test("preview, salvar original e cancelar por fechamento usam tokens iguais", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("tab", { name: "Aparência", exact: true }).click();
  await page.getByRole("button", { name: "Tema Oceano", exact: true }).click();
  const preview = await tokens(page);
  expect(preview["--primary"]).toBe("#0ea5e9");
  const save = page.getByRole("button", {
    name: "Salvar aparência",
    exact: true,
  });
  await assertControl(save, false);
  await save.hover();
  await assertControl(save, false);
  await assertFocus(page, save);
  await save.click();
  await expect(
    page.getByText("Aparência salva.", { exact: true }),
  ).toBeVisible();
  expect(await tokens(page)).toEqual(preview);
  const saved = await page.evaluate(
    async () => (await (await fetch("/api/me")).json()).user,
  );
  expect(saved.primaryColor).toBe("#0ea5e9");
  expect(saved.secondaryColor).toBe("#22d3ee");
  await page
    .getByRole("button", { name: "Tema Pôr do sol", exact: true })
    .click();
  expect((await tokens(page))["--primary"]).toBe("#f97316");
  await page
    .locator(".dv-tab", { hasText: "Configurações" })
    .locator(".dv-default-tab-action")
    .click();
  await expect(page.locator(".settings.profile")).toHaveCount(0);
  await expect.poll(() => tokens(page)).toEqual(preview);
});

test("controles, textarea e jogos mantêm contraste em tema arbitrário", async ({
  page,
}) => {
  await signIn(page);
  await apply(page, "#ffffff", "#000000");
  const send = page.getByRole("button", {
    name: "Enviar mensagem",
    exact: true,
  });
  await page.getByLabel("Mensagem em geral").fill("Texto sintético");
  await assertControl(send, true);
  await send.hover();
  await assertControl(send, true);
  await assertFocus(page, send);
  await assertFocus(page, page.getByLabel("Mensagem em geral"));
  const join = page.getByRole("button", { name: "Entrar na voz", exact: true });
  await assertControl(join, true);
  await join.hover();
  await assertControl(join, true);
  await assertFocus(page, join);
  await page.getByRole("button", { name: /Clube da Sorte/ }).click();
  const play = page.locator(".club-primary").first();
  await expect(play).toBeVisible();
  const assertFixed = async () => {
    const colors = await play.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.backgroundColor];
    });
    expect(
      measuredContrast(rgb(colors[0]), rgb(colors[1])),
    ).toBeGreaterThanOrEqual(4.5);
  };
  await assertFixed();
  await play.hover();
  await assertFixed();
  await assertFocus(page, play);
});

test("controles sólidos renderizados em todos os presets e cores arbitrárias", async ({
  page,
}) => {
  test.setTimeout(60000);
  await signIn(page);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("tab", { name: "Aparência", exact: true }).click();
  const save = page.getByRole("button", {
    name: "Salvar aparência",
    exact: true,
  });
  for (const [name, p, s] of [
    ...PRESETS,
    ["arbitrário", "#ffffff", "#000000"],
    ["arbitrário", "#000000", "#777777"],
    ["arbitrário", "#777777", "#808080"],
  ]) {
    if (name !== "arbitrário")
      await page
        .getByRole("button", { name: "Tema " + name, exact: true })
        .click();
    else {
      await page.getByLabel("Cor primária", { exact: true }).fill(p);
      await page.getByLabel("Cor secundária", { exact: true }).fill(s);
    }
    await expect.poll(async () => (await tokens(page))["--primary"]).toBe(p);
    await page.mouse.move(0, 0);
    await assertControl(save, false);
    await save.hover();
    await assertControl(save, false);
    await page.mouse.down();
    try {
      await assertControl(save, false);
    } finally {
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
    await assertFocus(page, save);
  }
});

test("controles nativos usam accent derivado, sem aplicar preto ilegível", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("tab", { name: "Voz e áudio", exact: true }).click();
  await apply(page, "#000000", "#000000");
  const range = page.locator('.settings input[type="range"]').first();
  await expect(range).toBeVisible();
  const accent = await range.evaluate((el) => getComputedStyle(el).accentColor);
  expect(
    measuredContrast(rgb(accent), channels("#353846")),
  ).toBeGreaterThanOrEqual(3);
  await assertFocus(page, range);
});
