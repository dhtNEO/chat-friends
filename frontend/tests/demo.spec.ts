import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

let server: ChildProcess;
const origin = "http://127.0.0.1:4175";
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
      "4175",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null)
          throw new Error("Servidor demo não iniciou");
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
test.afterAll(() => {
  server?.kill();
});

test("demo abre a nova interface e indica que MFA exige aplicação conectada", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("demo");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(page.getByRole("heading", { name: /geral/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Conta", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Segurança", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Esta sessão", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Ativar autenticador" }).click();
  const gate = page.locator(".security-page");
  await gate
    .getByLabel("Senha atual", { exact: true })
    .fill("demo-only-password");
  await gate.getByRole("button", { name: "Configurar autenticador" }).click();
  await expect(gate.getByRole("alert")).toContainText(
    "somente na aplicação conectada",
  );
  expect(errors).toEqual([]);
});

test("voz, preferências e atalhos convivem com a transmissão reorganizada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(origin + "/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("demo-voz");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".screen video")
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  const media = await page.evaluateHandle(() => {
    const video = document.querySelector<HTMLVideoElement>(".screen video")!;
    const state = {
      video,
      stream: video.srcObject,
      audio: [...document.querySelectorAll("audio")],
      leaves: 0,
    };
    const fetch = window.fetch;
    window.fetch = (input, init) => {
      if (
        new URL(
          input instanceof Request ? input.url : String(input),
          location.href,
        ).pathname === "/api/media/leave"
      )
        state.leaves++;
      return fetch(input, init);
    };
    return state;
  });
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
  await page.getByRole("tab", { name: "Voz e áudio", exact: true }).click();
  const settings = page.locator(".settings.profile");
  await settings
    .getByRole("slider", { name: /Volume do seu microfone/ })
    .fill("130");
  await settings.getByLabel("Tipo de supressão").selectOption("browser");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("chat-friends:audio:me") || "{}")
            .noiseMode,
      ),
    )
    .toBe("browser");
  await settings.getByLabel("Tipo de supressão").selectOption("strong");
  await settings
    .getByRole("checkbox", {
      name: "Esconder o cursor do mouse ao transmitir",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Opções de transmissão", exact: true })
    .click();
  await page.getByLabel("Qualidade", { exact: true }).selectOption("fullhd");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Atalhos", exact: true }).click();
  const mic = page
    .locator(".shortcut-list li")
    .filter({ hasText: "Ligar/desligar microfone" });
  await mic.getByRole("button", { name: "Gravar", exact: true }).click();
  await page.keyboard.press("Control+Alt+m");
  await page
    .getByRole("button", { name: "Salvar atalhos", exact: true })
    .click();
  await expect(
    page.getByText("Atalhos salvos.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Focar Transmissão", exact: true })
    .click();
  await page.keyboard.press("Control+Alt+m");
  await expect(
    page.getByRole("button", { name: "Ligar mic", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+Alt+m");
  await expect(
    page.getByRole("button", { name: "Desligar mic", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restaurar blocos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arrastar bloco Música", exact: true })
    .press("Home");
  await page
    .getByRole("separator", { name: "Redimensionar Transmissão", exact: true })
    .press("ArrowDown");
  await page.locator(".dv-tab", { hasText: "# geral" }).click();
  await page
    .getByLabel("Mensagem em geral")
    .fill("Somente um teste de digitação, sem enviar.");
  await page.getByLabel("Mensagem em geral").press("Control+Alt+m");
  await expect(
    page.getByRole("button", { name: "Desligar mic", exact: true }),
  ).toBeVisible();
  expect(
    await media.evaluate((state) => {
      const video = document.querySelector<HTMLVideoElement>(".screen video");
      const audio = [...document.querySelectorAll("audio")];
      return (
        video === state.video &&
        video.srcObject === state.stream &&
        state.leaves === 0 &&
        audio.length === state.audio.length &&
        audio.every((el, i) => el === state.audio[i])
      );
    }),
  ).toBeTruthy();
  const time = await page
    .locator(".screen video")
    .evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect
    .poll(() =>
      page
        .locator(".screen video")
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(time + 0.05);
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
});

test("sair da voz e fazer logout encerram os contextos de áudio", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    Object.defineProperty(window, "integrationAudioContexts", {
      value: contexts,
    });
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    };
  });
  await page.goto(origin + "/?shell=advanced");
  await page.getByLabel("Usuário", { exact: true }).fill("demo-cleanup");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  const states = () =>
    page.evaluate(() => {
      const contexts = Reflect.get(
        window,
        "integrationAudioContexts",
      ) as AudioContext[];
      return contexts.map((context) => context.state);
    });
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await states()).some((state) => state === "running"))
    .toBeTruthy();
  await page.getByRole("button", { name: "Sair da voz", exact: true }).click();
  await expect
    .poll(async () => (await states()).every((state) => state === "closed"))
    .toBeTruthy();
  await page
    .getByRole("button", { name: "Entrar na voz", exact: true })
    .click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entre e fique à vontade." }),
  ).toBeVisible();
  await expect
    .poll(async () => (await states()).every((state) => state === "closed"))
    .toBeTruthy();
});
