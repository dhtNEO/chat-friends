import { test, expect } from "@playwright/test";

test.skip(
  !process.env.STREAMS_DEMO_TEST,
  "Exige STREAMS_DEMO_TEST=1 e npm run demo.",
);

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`seleciona streams e encerra apenas a reserva escolhida (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel("Usuário", { exact: true }).fill("admin");
    await page.getByLabel("Senha", { exact: true }).fill("demo-streams");
    await page.getByRole("button", { name: "Entrar no espaço" }).click();
    if (viewport.width <= 900)
      await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
    await page
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .click();
    await expect(
      page.getByText("Voz conectada", { exact: true }),
    ).toBeVisible();
    const selector = page.getByRole("group", { name: "Escolher transmissão" });
    await expect(selector.getByRole("button")).toHaveCount(2);
    await selector
      .getByRole("button", { name: "Tela de penumbra", exact: true })
      .click();
    await expect(
      selector.getByRole("button", { name: "Tela de penumbra", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".screen-who strong")).toHaveText("penumbra");
    await page
      .getByRole("button", { name: "Mais opções", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Encerrar transmissão de penumbra",
        exact: true,
      })
      .click();
    await expect(page.locator(".screen-who strong")).toHaveText("galecalol", {
      timeout: 10000,
    });
    await expect(selector).toHaveCount(0);
    await expect(page.locator(".screen video")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Compartilhar tela", exact: true }),
    ).toBeEnabled();
  });
}

test("publica terceira tela e para sem interromper as duas remotas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      canvas.getContext("2d")!.fillRect(0, 0, 640, 360);
      return canvas.captureStream(10);
    };
  });
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill("admin");
  await page.getByLabel("Senha", { exact: true }).fill("demo-streams");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
  const selector = page.getByRole("group", { name: "Escolher transmissão" });
  await expect(selector.getByRole("button")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Compartilhar tela", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Parar transmissão", exact: true }),
  ).toBeVisible();
  await expect(selector.getByRole("button")).toHaveCount(3);
  await selector
    .getByRole("button", { name: "Tela de admin", exact: true })
    .click();
  await expect(
    page.getByText("Sua prévia · sem som", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".screen video")).toHaveJSProperty("muted", true);
  await page
    .getByRole("button", { name: "Parar transmissão", exact: true })
    .click();
  await expect(selector.getByRole("button")).toHaveCount(2);
  await expect(
    selector.getByRole("button", { name: "Tela de galecalol", exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole("button", { name: "Tela de penumbra", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".screen-who strong")).toHaveText("galecalol");
});
