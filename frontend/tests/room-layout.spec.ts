import { test, expect, type Page, type Locator } from "@playwright/test";

test.skip(
  !process.env.ROOM_LAYOUT_DEMO_TEST,
  "Exige ROOM_LAYOUT_DEMO_TEST=1 e npm run demo.",
);

declare global {
  interface Window {
    roomLayoutSnapshot?: {
      video: HTMLVideoElement;
      stream: MediaProvider | null;
      audio: HTMLAudioElement[];
      leaves: number;
    };
  }
}

const prefix = "chat-friends:room-layout:v1:me:";
const block = (page: Page, id: string) =>
  page.locator(`.room-block[data-reorder-id="${id}"]`);
async function signIn(page: Page, join = true) {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill("amigo-layout");
  await page.getByLabel("Senha", { exact: true }).fill("layout-demo-only");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(page.getByLabel("Mensagem em geral")).toBeAttached();
  if (page.viewportSize()!.width <= 900)
    await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
  await expect(
    page.getByRole("button", { name: /Organizar sala$/ }),
  ).toBeVisible();
  if (join) {
    await page
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .click();
    await expect(
      page.getByText("Voz conectada", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".room-block video")
          .evaluate((el: HTMLVideoElement) => el.currentTime),
      )
      .toBeGreaterThan(0);
  }
}
async function organize(page: Page) {
  const button = page.getByRole("button", {
    name: /Organizar sala$/,
  });
  if (await button.count()) await button.click();
  await expect(
    page.getByRole("button", { name: /Concluir organização$/ }),
  ).toBeVisible();
}
async function saved(page: Page, mode = "wide") {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    prefix + mode,
  );
}
async function visualOrder(page: Page) {
  return page.locator(".room-block").evaluateAll((elements) =>
    elements
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => ({
        id: (el as HTMLElement).dataset.reorderId!,
        order: Number(getComputedStyle(el).order),
      }))
      .sort((a, b) => a.order - b.order)
      .map((el) => el.id),
  );
}
async function cards(page: Page) {
  return page.locator(".person.tile").evaluateAll((elements) =>
    elements
      .map((el) => ({
        id: (el as HTMLElement).dataset.reorderId!,
        order: Number(getComputedStyle(el).order),
      }))
      .sort((a, b) => a.order - b.order)
      .map((el) => el.id),
  );
}
async function drag(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox(),
    to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}
async function rememberMedia(page: Page) {
  await page.evaluate(() => {
    const video =
      document.querySelector<HTMLVideoElement>(".room-block video")!;
    window.roomLayoutSnapshot = {
      video,
      stream: video.srcObject,
      audio: [...document.querySelectorAll("audio")],
      leaves: 0,
    };
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      );
      if (url.pathname === "/api/media/leave")
        window.roomLayoutSnapshot!.leaves++;
      return original(input, init);
    };
  });
}
async function mediaUnchanged(page: Page, allowParticipantLeave = false) {
  expect(await page.locator(".app-shell").evaluate((el) => el.scrollTop)).toBe(
    0,
  );
  expect((await page.locator(".app-shell").boundingBox())!.y).toBe(0);
  expect(
    await page.evaluate((allowLeave) => {
      const saved = window.roomLayoutSnapshot!;
      const video =
        document.querySelector<HTMLVideoElement>(".room-block video");
      const audio = [...document.querySelectorAll("audio")];
      return (
        video === saved.video &&
        video.srcObject === saved.stream &&
        saved.leaves === 0 &&
        (allowLeave
          ? audio.every((el) => saved.audio.includes(el))
          : audio.length === saved.audio.length &&
            audio.every((el, index) => el === saved.audio[index]))
      );
    }, allowParticipantLeave),
  ).toBeTruthy();
  const time = await page
    .locator(".room-block video")
    .evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect
    .poll(() =>
      page
        .locator(".room-block video")
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(time + 0.05);
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
}
async function inHorizontalBounds(child: Locator, parent: Locator) {
  const outer = await parent.boundingBox(),
    inner = await child.boundingBox();
  expect(outer).not.toBeNull();
  expect(inner).not.toBeNull();
  expect(inner!.x).toBeGreaterThanOrEqual(outer!.x - 1);
  expect(inner!.x + inner!.width).toBeLessThanOrEqual(
    outer!.x + outer!.width + 1,
  );
}

test("arrastar e redimensionar blocos preserva vídeo, áudio e chamada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await signIn(page);
  await rememberMedia(page);
  await organize(page);
  await drag(
    page,
    page.getByRole("button", { name: "Arrastar bloco Música", exact: true }),
    block(page, "screen"),
  );
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["music", "screen", "people"]);
  const separator = page.getByRole("separator", {
    name: "Redimensionar Transmissão",
    exact: true,
  });
  await separator.scrollIntoViewIfNeeded();
  const before = await block(page, "screen").boundingBox(),
    handle = await separator.boundingBox();
  const width = await page
    .locator(".room-workspace")
    .evaluate((el) => el.clientWidth);
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2 - width / 3,
    handle!.y + handle!.height / 2 + 60,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(
    page.getByLabel("Largura de Transmissão", { exact: true }),
  ).toHaveValue("8");
  expect((await block(page, "screen").boundingBox())!.height).toBeGreaterThan(
    before!.height + 40,
  );
  expect((await block(page, "screen").boundingBox())!.width).toBeLessThan(
    before!.width - 100,
  );
  await separator.press("ArrowLeft");
  await separator.press("ArrowDown");
  await expect(
    page.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("420");
  await expect(
    page.getByLabel("Largura de Transmissão", { exact: true }),
  ).toHaveValue("7");
  await page
    .getByRole("button", { name: "Arrastar bloco Transmissão", exact: true })
    .press("Home");
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["screen", "music", "people"]);
  await page.getByRole("button", { name: "Focar Música", exact: true }).click();
  await expect(block(page, "screen")).toBeHidden();
  await expect(
    page.getByLabel("Altura de Música", { exact: true }),
  ).toBeDisabled();
  await mediaUnchanged(page);
  await page
    .getByRole("button", { name: "Restaurar blocos", exact: true })
    .click();
  await page.getByRole("button", { name: "Expandir", exact: true }).click();
  await expect(block(page, "people")).toBeHidden();
  await mediaUnchanged(page);
  await page.getByRole("button", { name: "Compactar", exact: true }).click();
  await mediaUnchanged(page);
  await page
    .locator(".stage")
    .screenshot({ path: "/tmp/chat-friends-room-layout/desktop.png" });
});

test("cards aceitam mouse, teclado e tamanho; saída durante arraste não prende a sala", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signIn(page);
  await rememberMedia(page);
  await page
    .getByRole("button", { name: "Focar Pessoas", exact: true })
    .click();
  const before = await cards(page);
  await drag(
    page,
    page.getByRole("button", { name: "Reordenar galecalol", exact: true }),
    page.locator('.person.tile[data-reorder-id="penumbra"]'),
  );
  await expect.poll(() => cards(page)).not.toEqual(before);
  await page
    .getByRole("button", { name: "Reordenar penumbra", exact: true })
    .press("Home");
  await expect.poll(async () => (await cards(page))[0]).toBe("penumbra");
  await page.getByLabel("Tamanho dos cards", { exact: true }).fill("220");
  await expect
    .poll(() =>
      page
        .locator('.person.tile[data-reorder-id="galecalol"]')
        .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    )
    .toBe(220);
  const order = await cards(page),
    slider = page.getByLabel("Tamanho dos cards", { exact: true });
  const range = await slider.boundingBox();
  await page.mouse.move(
    range!.x + range!.width * 0.65,
    range!.y + range!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    range!.x + range!.width * 0.8,
    range!.y + range!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(await cards(page)).toEqual(order);
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  const grip = page.getByRole("button", {
    name: "Reordenar penumbra",
    exact: true,
  });
  const gripBox = await grip.boundingBox();
  await page.mouse.move(
    gripBox!.x + gripBox!.width / 2,
    gripBox!.y + gripBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(gripBox!.x + 50, gripBox!.y + 30, { steps: 6 });
  await page.evaluate(async () => {
    const path = "/src/demo/world.ts";
    const demo = await import(path);
    demo.world.friends.find(
      (friend: { id: string }) => friend.id === "penumbra",
    ).inCall = false;
    demo.changed();
  });
  await expect(
    page.getByRole("button", { name: "Reordenar penumbra", exact: true }),
  ).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reordenar galecalol", exact: true })
    .press("Home");
  await expect.poll(async () => (await cards(page))[0]).toBe("galecalol");
  await mediaUnchanged(page, true);
});

test("preferências sobrevivem ao reload, separam celular e desktop e reset restaura foco", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signIn(page, false);
  await organize(page);
  await page.getByLabel("Altura de Transmissão", { exact: true }).fill("420");
  await page
    .getByLabel("Largura de Transmissão", { exact: true })
    .selectOption("8");
  await page.getByLabel("Tamanho dos cards", { exact: true }).fill("220");
  await page
    .getByRole("button", { name: "Reordenar penumbra", exact: true })
    .press("Home");
  await page
    .getByRole("button", { name: "Arrastar bloco Música", exact: true })
    .press("Home");
  await expect
    .poll(async () => (await saved(page)).sizes.screen.height)
    .toBe(420);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
  await expect(
    page.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("260");
  await expect(
    page.getByLabel("Tamanho dos cards", { exact: true }),
  ).toHaveValue("150");
  await page.getByLabel("Altura de Transmissão", { exact: true }).fill("300");
  await page
    .getByRole("button", { name: "Arrastar bloco Pessoas", exact: true })
    .press("Home");
  await expect
    .poll(async () => (await saved(page, "compact")).sizes.screen.height)
    .toBe(300);
  await signIn(page, false);
  await organize(page);
  await expect(
    page.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("300");
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["people", "screen", "music"]);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(
    page.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("420");
  await expect(
    page.getByLabel("Largura de Transmissão", { exact: true }),
  ).toHaveValue("8");
  await expect(
    page.getByLabel("Tamanho dos cards", { exact: true }),
  ).toHaveValue("220");
  await expect.poll(async () => (await cards(page))[0]).toBe("penumbra");
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["music", "screen", "people"]);
  await page.getByRole("button", { name: "Focar Música", exact: true }).click();
  await page
    .getByRole("button", { name: "Restaurar sala", exact: true })
    .click();
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["screen", "people", "music"]);
  await expect(page.locator(".room-block")).toHaveCount(3);
  await expect(
    page.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("340");
  expect((await saved(page, "compact")).sizes.screen.height).toBe(300);
  await expect(
    page.getByLabel("Largura de Transmissão", { exact: true }),
  ).toHaveValue("12");
  await expect(
    page.getByLabel("Tamanho dos cards", { exact: true }),
  ).toHaveValue("150");
});

test("armazenamento inválido usa padrões e valores fora dos limites são corrigidos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, "{broken"),
    prefix + "wide",
  );
  await signIn(page, false);
  await organize(page);
  await expect(
    page.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("340");
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          order: ["music", "music", "missing"],
          sizes: {
            screen: { height: -20, columns: 1 },
            people: { height: 9999, columns: 99 },
            music: { height: "bad" },
          },
          cardSize: 999,
          cards: ["galecalol", "galecalol", "<bad>"],
        }),
      ),
    prefix + "wide",
  );
  // Remove the initialization script by using a second page in the same context.
  const next = await page.context().newPage();
  await signIn(next, false);
  await organize(next);
  await expect(
    next.getByLabel("Altura de Transmissão", { exact: true }),
  ).toHaveValue("160");
  await expect(
    next.getByLabel("Altura de Pessoas", { exact: true }),
  ).toHaveValue("1200");
  await expect(
    next.getByLabel("Largura de Transmissão", { exact: true }),
  ).toHaveValue("4");
  await expect(
    next.getByLabel("Tamanho dos cards", { exact: true }),
  ).toHaveValue("280");
  await expect
    .poll(() => visualOrder(next))
    .toEqual(["music", "screen", "people"]);
  expect((await saved(next)).cards).toEqual(["galecalol"]);
  await next.close();
});

test("alças respondem a toque sem interromper a transmissão", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await rememberMedia(page);
  const client = await context.newCDPSession(page);
  await page
    .getByRole("button", { name: "Focar Transmissão", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restaurar blocos", exact: true })
    .click();
  const handle = page.getByRole("separator", {
    name: "Redimensionar Transmissão",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const x = box!.x + box!.width / 2,
    y = box!.y + box!.height / 2;
  const before = await block(page, "screen").evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y + 50 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() =>
      block(page, "screen").evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeGreaterThan(before + 30);
  await expect(page.locator(".is-resizing")).toHaveCount(0);
  const grip = page.getByRole("button", {
    name: "Arrastar bloco Transmissão",
    exact: true,
  });
  await grip.scrollIntoViewIfNeeded();
  const from = await grip.boundingBox();
  const to = await block(page, "people").boundingBox();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: from!.x + from!.width / 2, y: from!.y + from!.height / 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: to!.x + to!.width / 2, y: to!.y + to!.height / 2 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["people", "screen", "music"]);
  await page
    .getByRole("button", { name: "Arrastar bloco Transmissão", exact: true })
    .press("End");
  await expect
    .poll(() => visualOrder(page))
    .toEqual(["people", "music", "screen"]);
  await mediaUnchanged(page);
  await client.detach();
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1280, 720],
]) {
  test(`sala ${width}×${height} mantém chamada e controles dentro dos blocos`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signIn(page);
    await rememberMedia(page);
    await expect(page.locator(".room-workspace")).toBeVisible();
    const bar = page.locator(".stage > .control-bar");
    for (const control of await bar.locator("button").all()) {
      await expect(control).toBeVisible();
      await inHorizontalBounds(control, page.locator(".stage"));
      const rect = await control.boundingBox();
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(height + 1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    if (width === 320) {
      await page
        .getByRole("button", { name: "Configurações de voz", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Configurações de voz",
        exact: true,
      });
      await inHorizontalBounds(dialog, page.locator(".stage"));
      for (const input of await dialog.locator("input,select").all()) {
        await input.scrollIntoViewIfNeeded();
        await inHorizontalBounds(input, dialog);
      }
      const microphone = dialog.getByRole("slider", {
        name: /Volume do microfone/,
      });
      await microphone.click();
      await microphone.press("ArrowRight");
      await expect(microphone).toHaveValue("101");
      await expect(dialog).toBeVisible();
      const noise = dialog.getByRole("checkbox", {
        name: "Supressão de ruído",
        exact: true,
      });
      const enabled = await noise.isChecked();
      await noise.click();
      await expect(noise).toBeChecked({ checked: !enabled });
      await expect(dialog).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await inHorizontalBounds(dialog, page.locator(".stage"));
      await page.setViewportSize({ width, height });
      await inHorizontalBounds(dialog, page.locator(".stage"));
      await page.screenshot({
        path: "/tmp/chat-friends-room-layout/voice-settings-320-fixed.png",
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Configurações de voz", exact: true }),
      ).toBeFocused();
    }
    await page
      .getByRole("button", { name: "Focar Transmissão", exact: true })
      .click();
    for (const name of ["Expandir", "Abrir transmissão em outra janela", "Tela cheia"])
      await inHorizontalBounds(
        page.getByRole("button", { name, exact: true }),
        page.locator(".screen"),
      );
    await inHorizontalBounds(
      page.getByRole("slider", { name: /Volume da transmissão/ }),
      page.locator(".screen"),
    );
    await page
      .getByRole("button", { name: "Restaurar blocos", exact: true })
      .click();
    await mediaUnchanged(page);
    await page
      .locator(".stage")
      .screenshot({ path: `/tmp/chat-friends-room-layout/${width}.png` });
    if (width === 390 || width === 1280)
      await page.screenshot({
        path: `/tmp/chat-friends-room-layout/viewport-${width}.png`,
      });
  });
}

test("transmissão em um terço da largura mantém ações e volume acessíveis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await signIn(page);
  await rememberMedia(page);
  await organize(page);
  const workspaceWidth = await page
    .locator(".room-workspace")
    .evaluate((el) => el.clientWidth);
  await page.setViewportSize({
    width: 1400 + 570 - workspaceWidth,
    height: 1000,
  });
  await expect(
    page.getByLabel("Largura de Transmissão", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Largura de Transmissão", { exact: true })
    .selectOption("4");
  await page.getByLabel("Altura de Transmissão", { exact: true }).fill("400");
  const screen = page.locator(".screen");
  await screen.hover();
  expect((await screen.boundingBox())!.width).toBeLessThan(210);
  for (const name of ["Expandir", "Abrir transmissão em outra janela", "Tela cheia"])
    await inHorizontalBounds(
      page.getByRole("button", { name, exact: true }),
      screen,
    );
  await inHorizontalBounds(
    page.getByRole("slider", { name: /Volume da transmissão/ }),
    screen,
  );
  await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBeTruthy();
  await page
    .getByRole("button", { name: "Sair da tela cheia", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBeFalsy();
  await mediaUnchanged(page);
  await block(page, "screen").screenshot({
    path: "/tmp/chat-friends-room-layout/narrow-stream.png",
  });
});
