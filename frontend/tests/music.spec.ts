import { test, expect, type Page } from "@playwright/test";

// This suite runs against npm run demo, never against a real room or account.
test.skip(
  !process.env.MUSIC_DEMO_TEST,
  "Exige MUSIC_DEMO_TEST=1 e npm run demo.",
);

async function signIn(page: Page) {
  await page.goto("/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("amigo-musica");
  await page.getByLabel("Senha", { exact: true }).fill("demo-musica");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
}

async function joinVoice(page: Page) {
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
}

test("busca música, mantém fila e controla reprodução na chamada", async ({
  page,
}) => {
  await signIn(page);
  const music = page.getByRole("region", { name: "Bot de música" });
  await expect(
    music.getByRole("button", { name: "Buscar", exact: true }),
  ).toBeDisabled();
  await joinVoice(page);
  await music
    .getByLabel("Buscar música ou colar link do YouTube")
    .fill("trilha de jogo");
  await music.getByRole("button", { name: "Buscar", exact: true }).click();
  const add = music.getByRole("button", { name: /^Adicionar à fila:/ });
  await expect(add.first()).toBeVisible();
  await expect
    .poll(() => page.locator(".tiles").evaluate((el) => el.clientHeight))
    .toBeGreaterThanOrEqual(90);
  await add.first().click();
  await expect(
    music.getByRole("button", { name: "Pausar música", exact: true }),
  ).toBeEnabled();
  await add.last().click();
  await music
    .getByRole("button", { name: "Pausar música", exact: true })
    .click();
  await expect(
    music.getByRole("button", { name: "Continuar música", exact: true }),
  ).toBeEnabled();
  await music
    .getByRole("button", { name: "Continuar música", exact: true })
    .click();
  await expect(
    music.getByRole("button", { name: "Pausar música", exact: true }),
  ).toBeEnabled();
  await music
    .getByRole("button", { name: "Pular música", exact: true })
    .click();
  await music
    .getByRole("button", { name: "Parar e limpar fila", exact: true })
    .click();
  await expect(
    music.getByRole("button", { name: "Pausar música", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
  await expect(
    music.getByRole("button", { name: "Buscar", exact: true }),
  ).toBeDisabled();
  // The call controls do not prevent the chat from working.
  await page
    .getByLabel("Mensagem em geral")
    .fill("A música parou, a conversa continua.");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    page.getByText("A música parou, a conversa continua.", { exact: true }),
  ).toBeVisible();
});

test("aceita link e salva somente o volume individual da música", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await joinVoice(page);
  const music = page.getByRole("region", { name: "Bot de música" });
  await music
    .getByLabel("Buscar música ou colar link do YouTube")
    .fill("https://youtu.be/aqz-KE-bpKQ");
  await music.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    music.getByRole("button", { name: /^Adicionar à fila:/ }).first(),
  ).toBeVisible();
  await music.getByLabel("Volume da música").fill("35");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const settings = JSON.parse(
          localStorage.getItem("chat-friends:audio:me") || "{}",
        );
        return { music: settings.music, output: settings.output };
      }),
    )
    .toEqual({ music: 35, output: 100 });
  const otherContext = await browser.newContext();
  try {
    const friend = await otherContext.newPage();
    await signIn(friend);
    await expect(friend.getByLabel("Volume da música")).toHaveValue("70");
  } finally {
    await otherContext.close();
  }
  await page.reload();
  await page.getByLabel("Usuário", { exact: true }).fill("amigo-musica");
  await page.getByLabel("Senha", { exact: true }).fill("demo-musica");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(page.getByLabel("Volume da música")).toHaveValue("35");
});

test("bot e fila ficam acessíveis em tela de celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
  await joinVoice(page);
  const music = page.getByRole("region", { name: "Bot de música" });
  const search = music.getByLabel("Buscar música ou colar link do YouTube");
  await search.fill("jazz");
  await music.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    music.getByRole("button", { name: /^Adicionar à fila:/ }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expect
    .poll(() => page.locator(".tiles").evaluate((el) => el.clientHeight))
    .toBeGreaterThanOrEqual(90);
  const box = await search.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
