import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readDestination } from "../src/navigation";
const origin = "http://127.0.0.1:4189";
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
      "4189",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw Error("Demo T08 não iniciou");
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
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({ path: info.outputPath("navigation-failure.png") });
  expect(failures.get(page)).toEqual([]);
});
async function login(page: Page, path = "/#/v1/conversa") {
  await page.goto(origin + path);
  await page.getByLabel("Usuário", { exact: true }).fill("navigation-test");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
}
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Navegação principal" });
async function advanced(page: Page) {
  await nav(page).getByRole("button", { name: "Mais", exact: true }).click();
  await page
    .getByRole("button", { name: "Usar painéis avançados", exact: true })
    .click();
  await expect(page.locator(".dock")).toBeVisible();
}

test("parser de URL não interpreta destino ou versão arbitrários", () => {
  expect(readDestination("#/v1/agenda")).toBe("agenda");
  for (const hash of [
    "",
    "#/v2/sala",
    "#/v1/admin",
    "#/v1/sala/leave",
    "#javascript:alert(1)",
  ])
    expect(readDestination(hash)).toBe("conversa");
});
for (const width of [320, 390, 768, 1024, 1440])
  test(`destinos rotulados e adaptação ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page);
    for (const label of ["Conversa", "Sala", "Jogos", "Agenda"]) {
      await nav(page).getByRole("link", { name: label, exact: true }).click();
      await expect(
        nav(page).getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        await nav(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await nav(page)
      .getByRole("link", { name: "Conversa", exact: true })
      .click();
    if (width < 600)
      await expect(page.locator(".simple-panel:visible")).toHaveCount(1);
    else if (width < 1024) {
      await expect(page.locator(".simple-panel:visible")).toHaveCount(1);
      await page.getByRole("button", { name: "Mostrar Sala ao lado" }).click();
      await expect(page.locator(".simple-panel:visible")).toHaveCount(2);
    } else await expect(page.locator(".simple-panel:visible")).toHaveCount(2);
    await nav(page).getByRole("link", { name: "Sala", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Entrar na voz", exact: true }),
    ).toBeVisible();
    await nav(page)
      .getByRole("link", { name: "Conversa", exact: true })
      .click();
    await page.getByLabel("Mensagem em geral").fill("Rascunho sintético");
    await nav(page).getByRole("link", { name: "Agenda", exact: true }).click();
    await nav(page)
      .getByRole("link", { name: "Conversa", exact: true })
      .click();
    await expect(page.getByLabel("Mensagem em geral")).toHaveValue(
      "Rascunho sintético",
    );
  });
test("URL direta, Voltar/Avançar e hash inválido não entram na voz", async ({
  page,
}) => {
  await login(page, "/#/v1/agenda");
  await expect(
    nav(page).getByRole("link", { name: "Agenda", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav(page).getByRole("link", { name: "Sala", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar na voz", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    nav(page).getByRole("link", { name: "Agenda", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(
    nav(page).getByRole("link", { name: "Sala", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => {
    location.hash = "#/v9/unknown";
  });
  await expect(page).toHaveURL(/#\/v1\/conversa$/);
});

test("v4 intacto no simples, opt-in reversível e identidade de mídia", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "chat-friends:layout:v4:wide",
      "invalid-preserved-snapshot",
    );
    localStorage.setItem(
      "chat-friends:layout:v4:compact",
      "compact-preserved-snapshot",
    );
  });
  await login(page);
  await page.evaluate(`(async()=>{
    const {setLease,identityOf}=await import('/src/demo/world.ts');setLease(identityOf('vgeralt'));
    const {Room}=await import('/src/demo/livekit.ts');
    window.t08Sdk={connections:0,disconnects:0,room:null};
    const connect=Room.prototype.connect,disconnect=Room.prototype.disconnect;
    Room.prototype.connect=async function(...args){window.t08Sdk.room=this;window.t08Sdk.connections++;return connect.apply(this,args);};
    Room.prototype.disconnect=function(...args){window.t08Sdk.disconnects++;return disconnect.apply(this,args);};
  })()`);
  await nav(page).getByRole("link", { name: "Sala", exact: true }).click();
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".room-block video")
        .first()
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  await expect(
    page
      .getByRole("group", { name: "Escolher transmissão" })
      .getByRole("checkbox"),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Assistir todas", exact: true })
    .click();
  await expect(page.locator(".screen video")).toHaveCount(3);
  await page.evaluate(() => {
    const video =
      document.querySelector<HTMLVideoElement>(".room-block video")!;
    (window as unknown as { t08: unknown }).t08 = {
      video,
      stream: video.srcObject,
      videos: [
        ...document.querySelectorAll<HTMLVideoElement>(".screen video"),
      ].map((el) => ({
        el,
        stream: el.srcObject,
        tracks:
          el.srcObject instanceof MediaStream ? el.srcObject.getTracks() : [],
      })),
      audio: [...document.querySelectorAll("audio")],
      music: document.querySelector(".music-panel"),
      hosts: [...document.querySelectorAll("[data-media-host]")],
      joins: 0,
      leaves: 0,
    };
    const original = window.fetch;
    window.fetch = (input, init) => {
      const path = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      ).pathname;
      const saved = (
        window as unknown as { t08: { joins: number; leaves: number } }
      ).t08;
      if (path === "/api/media/join") saved.joins++;
      if (path === "/api/media/leave") saved.leaves++;
      return original(input, init);
    };
  });
  const same = () =>
    page.evaluate(() => {
      const s = (
        window as unknown as {
          t08: {
            video: HTMLVideoElement;
            stream: MediaProvider | null;
            videos: {
              el: HTMLVideoElement;
              stream: MediaProvider | null;
              tracks: MediaStreamTrack[];
            }[];
            audio: HTMLAudioElement[];
            music: Element;
            hosts: Element[];
            joins: number;
            leaves: number;
          };
        }
      ).t08;
      return (
        document.querySelector(".room-block video") === s.video &&
        s.video.srcObject === s.stream &&
        s.videos.every(
          ({ el, stream, tracks }) =>
            el.isConnected &&
            el.srcObject === stream &&
            tracks.every((track) => track.readyState === "live"),
        ) &&
        s.audio.every((el) => el.isConnected) &&
        document.querySelector(".music-panel") === s.music &&
        s.hosts.every((el) => el.isConnected) &&
        s.joins === 0 &&
        s.leaves === 0
      );
    });
  for (const label of ["Conversa", "Jogos", "Agenda", "Sala"]) {
    await nav(page).getByRole("link", { name: label, exact: true }).click();
    expect(await same()).toBe(true);
  }
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await same()).toBe(true);
  }
  expect(
    await page.evaluate(() =>
      localStorage.getItem("chat-friends:layout:v4:wide"),
    ),
  ).toBe("invalid-preserved-snapshot");
  await advanced(page);
  expect(await same()).toBe(true);
  await page
    .getByRole("button", { name: "Navegação simples", exact: true })
    .click();
  await expect(nav(page)).toBeVisible();
  await expect.poll(same).toBe(true);
  const resumedTime = await page
    .locator(".screen video")
    .first()
    .evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect
    .poll(() =>
      page
        .locator(".screen video")
        .first()
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(resumedTime);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("chat-friends:layout:v4:compact"),
    ),
  ).toBe("compact-preserved-snapshot");
  await expect(
    page.getByRole("button", { name: "Sair da voz", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      `({connections:window.t08Sdk.connections,disconnects:window.t08Sdk.disconnects,state:window.t08Sdk.room.options.webAudioMix.audioContext.state})`,
    ),
  ).toEqual({ connections: 1, disconnects: 0, state: "running" });
});

test("preferência isolada por conta, storage bloqueado, zoom e miniplayer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("chat-friends:shell:v1:other-account", "advanced");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(nav(page)).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  expect(
    await nav(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await nav(page).getByRole("button", { name: "Mais", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fechar menu", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    nav(page).getByRole("button", { name: "Mais", exact: true }),
  ).toBeFocused();
  await nav(page).getByRole("link", { name: "Sala", exact: true }).click();
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  const search = page.getByLabel("Buscar música");
  await search.fill("Música sintética");
  await search.press("Enter");
  await page
    .getByRole("button", { name: /Adicionar à fila:/ })
    .first()
    .click();
  await nav(page).getByRole("link", { name: "Conversa", exact: true }).click();
  const mini = page.getByRole("button", {
    name: "Pausar música no miniplayer",
  });
  await expect(mini).toBeEnabled();
  await mini.click();
  await expect(
    page.getByRole("button", { name: "Continuar música no miniplayer" }),
  ).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      value() {
        throw Error("storage indisponível");
      },
    });
  });
  await advanced(page);
  await page
    .getByRole("button", { name: "Navegação simples", exact: true })
    .click();
  await expect(nav(page)).toBeVisible();
  await nav(page).getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
});

test("snapshot v4 válido é preservado durante navegação simples e resize", async ({
  page,
}) => {
  await login(page);
  await advanced(page);
  await page.getByRole("button", { name: "Jogos", exact: true }).click();
  await expect(
    page.locator(".dv-tab", { hasText: "Clube da Sorte" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Navegação simples", exact: true })
    .click();
  const snapshot = await page.evaluate(() =>
    localStorage.getItem("chat-friends:layout:v4:wide"),
  );
  expect(snapshot).toBeTruthy();
  expect(() => JSON.parse(snapshot!)).not.toThrow();
  await nav(page).getByRole("link", { name: "Agenda", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 650 });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.evaluate(() =>
      localStorage.getItem("chat-friends:layout:v4:wide"),
    ),
  ).toBe(snapshot);
  await advanced(page);
  await expect(
    page.locator(".dv-tab", { hasText: "Clube da Sorte" }),
  ).toBeVisible();
});

test("reflow estreito, viewport reduzido e retorno por teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await login(page);
  await page.setViewportSize({ width: 160, height: 360 });
  const navigation = nav(page);
  expect(
    await navigation.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  for (const label of ["Conversa", "Sala", "Jogos", "Agenda"]) {
    const link = navigation.getByRole("link", { name: label, exact: true });
    await expect(link).toBeInViewport();
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  await page.setViewportSize({ width: 390, height: 350 });
  await navigation.getByRole("link", { name: "Conversa", exact: true }).click();
  const composer = page.getByLabel("Mensagem em geral");
  await composer.fill("Linha 1\nLinha 2 😀");
  await expect(composer).toBeInViewport();
  await expect(
    navigation.getByRole("link", { name: "Sala", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "test-results/t08-simple-390.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "test-results/t08-simple-1440.png" });
});
