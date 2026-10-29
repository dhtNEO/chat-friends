import { test, expect } from "@playwright/test";
const password = process.env.TEST_ADMIN_PASSWORD;
let cookies: import("@playwright/test").Cookie[] = [];
async function signIn(page: import("@playwright/test").Page) {
  if (!password)
    throw new Error("TEST_ADMIN_PASSWORD obrigatório; nenhuma senha padrão");
  if (cookies.length) await page.context().addCookies(cookies);
  const response = await page.request.get("/api/me");
  await page.goto("/");
  if (response.status() !== 200) {
    await page
      .getByLabel("Usuário", { exact: true })
      .fill(process.env.TEST_ADMIN_USERNAME || "admin");
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no espaço" }).click();
  }
  await expect(page.getByRole("heading", { name: /geral/ })).toBeVisible();
  cookies = await page.context().cookies();
}

test("login, mensagem persistente como texto e logout", async ({ page }) => {
  await signIn(page);
  const text = "<b>texto seguro</b> " + Date.now();
  await page.getByLabel("Mensagem em geral").fill(text);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.locator(".message b")).toHaveCount(0);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entre e fique à vontade." }),
  ).toBeVisible();
});
test("admin cria conta, recebe mensagem em tempo real e desativa sessão", async ({
  browser,
  page,
}) => {
  await signIn(page);
  const username = "u" + Date.now(),
    friendPassword = "test-friend-" + Date.now();
  await page.getByRole("button", { name: "Gerenciar contas" }).click();
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Nome de exibição").fill("Amigo de teste");
  await page.getByLabel("Senha inicial").fill(friendPassword);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Conta criada.", { exact: false })).toBeVisible();
  const context = await browser.newContext();
  const friend = await context.newPage();
  await friend.goto("/");
  await friend.getByLabel("Usuário", { exact: true }).fill(username);
  await friend.getByLabel("Senha", { exact: true }).fill(friendPassword);
  await friend.getByRole("button", { name: "Entrar no espaço" }).click();
  const msg = "Olá em tempo real " + Date.now();
  await friend.getByLabel("Mensagem em geral").fill(msg);
  await friend.getByRole("button", { name: "Enviar mensagem" }).click();
  await page.getByRole("button", { name: "Voltar à conversa" }).click();
  await expect(page.getByText(msg, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gerenciar contas" }).click();
  await page
    .locator(".account-row")
    .filter({ hasText: "@" + username })
    .getByRole("button", { name: "Desativar" })
    .click();
  await expect(
    friend.getByRole("heading", { name: "Entre e fique à vontade." }),
  ).toBeVisible({ timeout: 15000 });
  await context.close();
});
test("layout móvel mantém conversa e voz acessíveis", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  // On phones the panels become tabs.
  await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar na voz" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("duas conexões de mídia recebem áudio sintético e encerram sem fantasmas", async ({
  browser,
  page,
}) => {
  await signIn(page);
  const context = await browser.newContext();
  const friend = await context.newPage();
  await signIn(friend);
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await friend.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(friend.getByText("Voz conectada", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator("audio")).toHaveCount(1, { timeout: 15000 });
  await expect(friend.locator("audio")).toHaveCount(1, { timeout: 15000 });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      friend
        .locator("audio")
        .evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  await friend
    .getByRole("button", { name: "Sair da voz", exact: true })
    .click();
  await expect(page.locator("audio")).toHaveCount(0, { timeout: 10000 });
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
  await context.close();
});
test("permissão de microfone recusada mantém chat utilizável", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Negada no teste", "NotAllowedError");
    };
  });
  await signIn(page);
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  // The dock keeps its own empty live region for screen readers.
  await expect(
    page.getByRole("alert").filter({ hasText: "Permissão negada" }),
  ).toBeVisible({ timeout: 15000 });
  const msg = "Chat sem microfone " + Date.now();
  await page.getByLabel("Mensagem em geral").fill(msg);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByText(msg, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
});
test("tela sintética chega ao outro participante e a parada remove vídeo", async ({
  browser,
  page,
}) => {
  await signIn(page);
  const context = await browser.newContext();
  const friend = await context.newPage();
  await signIn(friend);
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await friend.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(friend.getByText("Voz conectada", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Compartilhar tela", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Parar transmissão", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(friend.locator("video")).toHaveCount(1, { timeout: 15000 });
  await expect
    .poll(() =>
      friend.locator("video").evaluate((el: HTMLVideoElement) => el.videoWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Parar transmissão", exact: true })
    .click();
  await expect(friend.locator("video")).toHaveCount(0, { timeout: 10000 });
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
  await friend
    .getByRole("button", { name: "Sair da voz", exact: true })
    .click();
  await context.close();
});

test("silenciar o áudio também muta o mic; atalho pessoal alterna o microfone", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Desligar mic", exact: true }),
  ).toBeVisible();
  // Like Discord: silencing what you hear closes the microphone too, and
  // hearing again restores it.
  await page
    .getByRole("button", { name: "Silenciar áudio", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ligar mic", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ouvir áudio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Desligar mic", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("tab", { name: "Atalhos" }).click();
  const row = page
    .locator(".shortcut-list li")
    .filter({ hasText: "Ligar/desligar microfone" });
  // A previous interrupted run may have saved this disposable account's binding.
  const remove = row.getByRole("button", { name: /^Remover/ });
  if (await remove.count()) {
    await remove.click();
    await page.getByRole("button", { name: "Salvar atalhos" }).click();
    await expect(row.getByText("Sem atalho")).toBeVisible();
  }
  await row.getByRole("button", { name: /^(Gravar|Trocar)$/ }).click();
  await page.keyboard.press("Control+Alt+KeyM");
  await expect(row.locator("kbd")).toHaveCount(3);
  await page.getByRole("button", { name: "Salvar atalhos" }).click();
  await expect(page.getByText("Atalhos salvos.")).toBeVisible();
  await page.keyboard.press("Control+Alt+KeyM");
  await expect(
    page.getByRole("button", { name: "Ligar mic", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+Alt+KeyM");
  await expect(
    page.getByRole("button", { name: "Desligar mic", exact: true }),
  ).toBeVisible();

  // Leave the shared admin account without shortcuts for other tests.
  await row.getByRole("button", { name: /^Remover/ }).click();
  await page.getByRole("button", { name: "Salvar atalhos" }).click();
  await expect(row.getByText("Sem atalho")).toBeVisible();
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
});

test("links nas mensagens abrem em outra aba, sem virar HTML", async ({
  page,
}) => {
  await signIn(page);
  const text = "olha https://example.org/jogo?id=1 " + Date.now();
  await page.getByLabel("Mensagem em geral").fill(text);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  const link = page
    .getByRole("link", { name: "https://example.org/jogo?id=1" })
    .last();
  await expect(link).toHaveAttribute("href", "https://example.org/jogo?id=1");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});
