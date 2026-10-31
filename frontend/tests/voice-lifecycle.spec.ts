import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

declare global {
  interface Window {
    voiceLifecycle: {
      tracks: MediaStreamTrack[];
      contexts: AudioContext[];
      peers: RTCPeerConnection[];
      errors: string[];
    };
  }
}

test("logout encerra captura pendente antes de terminar o download do RNNoise", async ({
  page,
  request,
}) => {
  test.setTimeout(45000);
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("Administrador descartável obrigatório");
  const username = "lifecycle-" + Date.now();
  const password = "test-only-" + randomUUID();
  let csrf = (await (await request.get("/api/csrf")).json()).token;
  expect(
    (
      await request.post("/api/login", {
        form: {
          username: process.env.TEST_ADMIN_USERNAME || "admin",
          password: adminPassword,
        },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(204);
  csrf = (await (await request.get("/api/csrf")).json()).token;
  expect(
    (
      await request.post("/api/admin/accounts", {
        data: { username, displayName: "Ciclo de voz", password },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(200);

  await page.addInitScript(() => {
    window.voiceLifecycle = { tracks: [], contexts: [], peers: [], errors: [] };
    const capture = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await capture(constraints);
      window.voiceLifecycle.tracks.push(...stream.getAudioTracks());
      return stream;
    };
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      constructor(options?: AudioContextOptions) {
        super(options);
        window.voiceLifecycle.contexts.push(this);
      }
    };
    const Peer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Peer {
      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        window.voiceLifecycle.peers.push(this);
      }
    };
    window.addEventListener("unhandledrejection", (event) => {
      window.voiceLifecycle.errors.push(event.reason?.name || "rejection");
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route(/\.wasm(?:\?|$)/, async (route) => {
    waiting = true;
    await held;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/?shell=advanced");
    await page.getByLabel("Usuário", { exact: true }).fill(username);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: /Entrar no espaço/ }).click();
    await page
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .click();
    await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect.poll(() => waiting, { timeout: 15000 }).toBeTruthy();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.voiceLifecycle.tracks.some(
            (track) => track.readyState === "live",
          ),
        ),
      )
      .toBeTruthy();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Entre e fique à vontade." }),
    ).toBeVisible();
    // Do not release the asset until the physical/fake capture has already stopped.
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.voiceLifecycle.tracks.every(
            (track) => track.readyState === "ended",
          ),
        ),
      )
      .toBeTruthy();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.voiceLifecycle.contexts.every(
            (context) => context.state === "closed",
          ),
        ),
      )
      .toBeTruthy();
    const resumed = page.waitForResponse((response) =>
      /\.wasm(?:\?|$)/.test(response.url()),
    );
    release();
    const response = await resumed;
    expect(response.ok()).toBeTruthy();
    await response.finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.voiceLifecycle.contexts.every(
            (context) => context.state === "closed",
          ),
        ),
      )
      .toBeTruthy();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.voiceLifecycle.peers.every(
            (peer) => peer.connectionState === "closed",
          ),
        ),
      )
      .toBeTruthy();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.voiceLifecycle.errors)).toEqual([]);
    await expect(
      page.getByRole("region", { name: "Sala de voz", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});
