import { test, expect, type Page } from "@playwright/test";

test.skip(!process.env.ROOM_LAYOUT_DEMO_TEST, "Exige npm run demo e ROOM_LAYOUT_DEMO_TEST=1.");

async function enter(page: Page) {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill("demo-paineis");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  if (page.viewportSize()!.width <= 900)
    await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
  await page.getByRole("button", { name: "Entrar na voz", exact: true }).click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
}

async function prepareMusic(page: Page) {
  const music = page.getByRole("region", { name: "Bot de música" });
  await music.getByLabel("Buscar música ou colar link do YouTube").fill("trilha dos painéis");
  await music.getByRole("button", { name: "Buscar", exact: true }).click();
  await music.getByRole("button", { name: /^Adicionar à fila:/ }).first().click();
  await music.getByLabel("Volume da música").fill("35");
  return music;
}

async function snapshot(page: Page) {
  return page.evaluateHandle(() => {
    const video = document.querySelector<HTMLVideoElement>("video")!;
    const state = { video, stream: video.srcObject, time: video.currentTime,
      audio: [...document.querySelectorAll("audio")], leaves: 0 };
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === "/api/media/leave") state.leaves++;
      return original(input, init);
    };
    return state;
  });
}

const roomBlock = (page: Page, id: string) => page.locator(`.room-block[data-reorder-id="${id}"]`);
async function absentFromRoom(page: Page, ids: string[], peopleFirst = true) {
  for (const id of ids) {
    const block = roomBlock(page, id);
    await expect(block).toBeHidden();
    expect(await block.evaluate(el => el.getClientRects().length)).toBe(0);
  }
  await expect(page.locator(".room-workspace .media-away")).toHaveCount(0);
  const people = roomBlock(page, "people");
  await expect(people).toBeVisible();
  if (peopleFirst) {
    const workspace = page.locator(".room-workspace");
    await workspace.evaluate(el => { el.scrollTop = 0; });
    const outer = (await workspace.boundingBox())!;
    const inner = (await people.boundingBox())!;
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.y - outer.y).toBeLessThan(10);
  }
}
async function layoutStyles(page: Page) {
  return page.locator(".room-block").evaluateAll(elements => elements.map(el => ({
    id: (el as HTMLElement).dataset.reorderId,
    order: (el as HTMLElement).style.order,
    height: (el as HTMLElement).style.height,
    columns: (el as HTMLElement).style.gridColumn,
  })));
}

test("painéis independentes preservam vídeo, busca, fila e volume ao separar e retornar", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await enter(page);
  const music = await prepareMusic(page);
  const state = await snapshot(page);
  await page.getByRole("button", { name: /Organizar sala$/ }).click();
  await page.getByLabel("Altura de Transmissão", { exact: true }).fill("420");
  await page.getByLabel("Altura de Música", { exact: true }).fill("320");
  await page.getByRole("button", { name: "Arrastar bloco Música", exact: true }).press("Home");
  const savedStyles = await layoutStyles(page);
  await page.getByRole("button", { name: "Focar Transmissão", exact: true }).click();
  await page.getByRole("button", { name: "Separar transmissão", exact: true }).click();
  await absentFromRoom(page, ["screen"], false);
  await expect(roomBlock(page, "music")).toBeVisible();
  await page.getByRole("button", { name: "Separar música", exact: true }).click();
  await absentFromRoom(page, ["screen", "music"]);
  await expect(page.getByRole("region", { name: "Área de transmissão", exact: true }).getByRole("button", { name: "Trazer transmissão para a sala", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Área de música", exact: true }).getByRole("button", { name: "Trazer música para a sala", exact: true })).toBeVisible();
  await expect(music.getByLabel("Buscar música ou colar link do YouTube")).toHaveValue("trilha dos painéis");
  await expect(music.getByLabel("Volume da música")).toHaveValue("35");
  await expect(music.getByRole("button", { name: "Pausar música", exact: true })).toBeEnabled();
  await expect(page.locator("video")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("detached-desktop.png") });
  await page.getByRole("region", { name: "Área de transmissão", exact: true }).getByRole("button", { name: "Trazer transmissão para a sala", exact: true }).click();
  await page.getByRole("region", { name: "Área de música", exact: true }).getByRole("button", { name: "Trazer música para a sala", exact: true }).click();
  // Returning the formerly focused screen restores its focus; revealing all
  // blocks again must recover their saved order and dimensions.
  await page.getByRole("button", { name: "Restaurar blocos", exact: true }).click();
  await expect.poll(() => state.evaluate(s => s.video.isConnected && s.video.srcObject === s.stream && s.video.currentTime > s.time)).toBeTruthy();
  expect(await state.evaluate(s => s.leaves)).toBe(0);
  expect(await state.evaluate(s => s.audio.every(el => el.isConnected))).toBe(true);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(music.getByLabel("Volume da música")).toHaveValue("35");
  expect(await layoutStyles(page)).toEqual(savedStyles);
  await expect(roomBlock(page, "screen")).toBeVisible();
  await expect(roomBlock(page, "music")).toBeVisible();
});

test("janelas separadas mantêm mídia e estado e retornam ao fechar; bloqueio permite recuperar", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.name));
  await enter(page);
  await prepareMusic(page);
  const state = await snapshot(page);
  await page.evaluate(() => {
    const saved = window.open;
    Object.assign(window, { restoreOpen: () => { window.open = saved; } });
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Abrir transmissão em outra janela", exact: true }).click();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(roomBlock(page, "screen")).toBeVisible();
  expect(await state.evaluate(s => s.video.isConnected && s.leaves === 0)).toBe(true);
  await page.evaluate(() => (window as unknown as { restoreOpen: () => void }).restoreOpen());
  const screenEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir transmissão em outra janela", exact: true }).click();
  const screen = await screenEvent;
  screen.on("pageerror", e => errors.push(e.name));
  await expect(screen.locator("video")).toHaveCount(1);
  await expect(page.locator("video")).toHaveCount(0);
  await absentFromRoom(page, ["screen"]);
  await expect(roomBlock(page, "music")).toBeVisible();
  await screen.getByRole("button", { name: "Tela cheia", exact: true }).click();
  await expect.poll(() => screen.evaluate(() => document.fullscreenElement?.classList.contains("screen") || false)).toBe(true);
  await screen.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
  const musicEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir música em outra janela", exact: true }).click();
  const music = await musicEvent;
  music.on("pageerror", e => errors.push(e.name));
  await absentFromRoom(page, ["screen", "music"]);
  const bot = music.getByRole("region", { name: "Bot de música" });
  await expect(bot.getByLabel("Buscar música ou colar link do YouTube")).toHaveValue("trilha dos painéis");
  await expect(bot.getByLabel("Volume da música")).toHaveValue("35");
  await bot.getByLabel("Volume da música").fill("48");
  await expect(bot.getByRole("button", { name: "Pausar música", exact: true })).toBeEnabled();
  await expect.poll(() => state.evaluate(s => s.video.isConnected && s.video.srcObject === s.stream && s.video.currentTime > s.time)).toBeTruthy();
  await music.close();
  await expect(roomBlock(page, "music")).toBeVisible();
  await expect(roomBlock(page, "screen")).toBeHidden();
  await screen.close();
  await expect(roomBlock(page, "screen")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByLabel("Volume da música")).toHaveValue("48");
  expect(await state.evaluate(s => s.video === document.querySelector("video") && s.video.srcObject === s.stream && s.leaves === 0)).toBe(true);
  expect(await state.evaluate(s => s.audio.every(el => el.isConnected))).toBe(true);
  const reopenedScreen = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir transmissão em outra janela", exact: true }).click();
  const screenAtLogout = await reopenedScreen;
  const reopenedMusic = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir música em outra janela", exact: true }).click();
  const musicAtLogout = await reopenedMusic;
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect.poll(() => screenAtLogout.isClosed() && musicAtLogout.isClosed()).toBe(true);
  await expect(page.getByRole("heading", { name: "Entre e fique à vontade." })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [320, 390]) {
  test(`painéis móveis retornam à sala sem perder transmissão em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enter(page);
    const state = await snapshot(page);
    for (const detach of ["Separar transmissão", "Separar música"]) {
      await page.getByRole("button", { name: detach, exact: true }).click();
      await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
    }
    await absentFromRoom(page, ["screen", "music"]);
    if (width === 390) await page.screenshot({ path: test.info().outputPath("detached-mobile.png") });
    for (const [title, region, back] of [
      ["Transmissão", "Área de transmissão", "Trazer transmissão para a sala"],
      ["Bot de música", "Área de música", "Trazer música para a sala"],
    ]) {
      await page.locator(".dv-tab", { hasText: title }).click();
      const returnButton = page.getByRole("region", { name: region, exact: true }).getByRole("button", { name: back, exact: true });
      await returnButton.scrollIntoViewIfNeeded();
      const box = await returnButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await returnButton.click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => state.evaluate(s => s.video.isConnected && s.video.srcObject === s.stream && s.video.currentTime > s.time && s.leaves === 0)).toBeTruthy();
  });
}

for (const width of [1024, 1280]) {
  test(`painéis separados cabem sem cortar controles em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enter(page);
    await page.getByRole("button", { name: "Separar transmissão", exact: true }).click();
    await page.getByRole("button", { name: "Separar música", exact: true }).click();
    await absentFromRoom(page, ["screen", "music"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const [title, region, back] of [
      ["Transmissão", "Área de transmissão", "Trazer transmissão para a sala"],
      ["Bot de música", "Área de música", "Trazer música para a sala"],
    ]) {
      await page.locator(".dv-tab", { hasText: title }).click();
      const button = page.getByRole("region", { name: region, exact: true }).getByRole("button", { name: back, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });
}

test("transmissão e música arrastam e redimensionam em painéis flutuantes independentes", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await enter(page);
  const state = await snapshot(page);
  await page.getByRole("button", { name: "Separar transmissão", exact: true }).click();
  await page.getByRole("button", { name: "Separar música", exact: true }).click();
  for (const [index, [title, region]] of [["Transmissão", "Área de transmissão"], ["Bot de música", "Área de música"]].entries()) {
    const tab = page.locator(".dv-tab", { hasText: title });
    const start = await tab.boundingBox();
    expect(start).not.toBeNull();
    await page.keyboard.down("Shift");
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(350 + index * 450, 250 + index * 100, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.screenshot({ path: test.info().outputPath(`floating-${index}.png`) });
    // Dockview places always-rendered content in a sibling overlay; the
    // floating dialog owns its geometry and handles, not the media DOM.
    const floating = page.getByRole("dialog", { name: title, exact: true });
    await expect(floating).toBeVisible();
    await expect(page.getByRole("region", { name: region, exact: true })).toBeVisible();
    const before = (await floating.boundingBox())!;
    const handle = (await floating.locator(".dv-resize-handle-bottomright").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 90, handle.y + 70, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await floating.boundingBox())!.width).toBeGreaterThan(before.width + 40);
    await expect.poll(async () => (await floating.boundingBox())!.height).toBeGreaterThan(before.height + 30);
  }
  await expect(page.locator(".dv-resize-container")).toHaveCount(2);
  for (const title of ["Transmissão", "Bot de música"])
    await page.getByRole("dialog", { name: title, exact: true }).getByRole("button", { name: `Close ${title}`, exact: true }).click();
  await expect(page.locator(".dv-resize-container")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Bloco Transmissão", exact: true }).locator("video")).toHaveCount(1);
  expect(await state.evaluate(s => s.video.isConnected && s.video.srcObject === s.stream && s.leaves === 0)).toBe(true);
});
