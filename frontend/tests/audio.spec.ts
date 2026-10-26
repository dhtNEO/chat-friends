import { test, expect, type Page } from "@playwright/test";

// Synthetic sources and a meter at the actual Web Audio output, never a user's mic.
const sources = `(() => {
  window.__outputMeters = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    if (destination === this.context.destination) {
      const meter = this.context.createAnalyser(); meter.fftSize = 2048;
      connect.call(this, meter); connect.call(meter, destination);
      window.__outputMeters.push(meter);
      return destination;
    }
    return connect.call(this, destination, ...args);
  };
  function tone() {
    const context = new AudioContext(); const oscillator = context.createOscillator();
    const gain = context.createGain(); gain.gain.value = 0.08;
    const output = context.createMediaStreamDestination();
    oscillator.connect(gain).connect(output); oscillator.start();
    const track = output.stream.getAudioTracks()[0];
    const stop = track.stop.bind(track);
    let stopped = false;
    track.stop = () => { if (stopped) return; stopped = true; stop(); oscillator.stop(); void context.close(); };
    return track;
  }
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await original(constraints);
    const captured = stream.getAudioTracks();
    captured.forEach(track => stream.removeTrack(track));
    const generated = tone(), stop = generated.stop.bind(generated);
    // Apply capture controls to the real fake-device input, while sending a stable test tone.
    generated.applyConstraints = constraints => captured[0].applyConstraints(constraints);
    generated.getConstraints = () => captured[0].getConstraints();
    generated.getSettings = () => captured[0].getSettings();
    generated.stop = () => { captured.forEach(track => track.stop()); stop(); };
    stream.addTrack(generated); return stream;
  };
  navigator.mediaDevices.getDisplayMedia = async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
    const context = canvas.getContext('2d'); let frame = 0;
    const timer = setInterval(() => { context.fillStyle = frame++ % 2 ? '#8866cc' : '#225588'; context.fillRect(0, 0, canvas.width, canvas.height); }, 100);
    const stream = canvas.captureStream(10); stream.addTrack(tone());
    const video = stream.getVideoTracks()[0], stop = video.stop.bind(video);
    video.stop = () => { clearInterval(timer); stop(); };
    return stream;
  };
})()`;
test.setTimeout(60000);
const suffix = Date.now();
const senderName = "sound-a-" + suffix,
  receiverName = "sound-b-" + suffix;
test.beforeAll(async ({ request }) => {
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!password) throw new Error("TEST_ADMIN_PASSWORD obrigatório");
  let csrf = (await (await request.get("/api/csrf")).json()).token;
  expect(
    (
      await request.post("/api/login", {
        form: { username: "admin", password },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(204);
  csrf = (await (await request.get("/api/csrf")).json()).token;
  for (const [username, displayName] of [
    [senderName, "Som A"],
    [receiverName, "Som B"],
  ]) {
    expect(
      (
        await request.post("/api/admin/accounts", {
          data: { username, displayName, password },
          headers: { "X-CSRF-TOKEN": csrf },
        })
      ).ok(),
    ).toBe(true);
  }
});
async function signIn(page: Page, username: string) {
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!password) throw new Error("TEST_ADMIN_PASSWORD obrigatório");
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Desligar mic" }),
  ).toBeVisible();
}
async function slider(page: Page, label: string, value: number) {
  await page
    .getByRole("slider", { name: label, exact: false })
    .fill(String(value));
}
async function level(page: Page) {
  return page.evaluate(`(() => {
    return window.__outputMeters.reduce((total, meter) => {
      const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
      return total + Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    }, 0);
  })()`);
}

test("ganho de mic, volume por ouvinte, supressão e estado de mudo funcionam", async ({
  browser,
}) => {
  const sender = await browser.newContext(),
    receiver = await browser.newContext();
  await sender.addInitScript(sources);
  await receiver.addInitScript(sources);
  const a = await sender.newPage(),
    b = await receiver.newPage();
  try {
    await signIn(a, senderName);
    await signIn(b, receiverName);
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    const initial = await level(b);
    await slider(a, "Volume do microfone", 50);
    await expect.poll(() => level(b)).toBeLessThan(initial * 0.8);
    await slider(a, "Volume do microfone", 0);
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await slider(a, "Volume do microfone", 100);
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    const personVolume = b
      .locator(".person")
      .filter({ hasNotText: "(você)" })
      .getByRole("slider");
    await personVolume.fill("0");
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await expect.poll(() => level(a)).toBeGreaterThan(0.01); // receiver's choice is local
    await personVolume.fill("150");
    await expect.poll(() => level(b)).toBeGreaterThan(initial * 1.1);
    await slider(b, "Volume de saída", 0);
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await slider(b, "Volume de saída", 100);
    await b
      .getByRole("button", { name: "Silenciar áudio", exact: true })
      .click();
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await expect(
      a.locator(".person").filter({ hasNotText: "(você)" }),
    ).toContainText("Áudio silenciado", { timeout: 10000 });
    await b.getByRole("button", { name: "Ouvir áudio", exact: true }).click();
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    await a.getByRole("checkbox", { name: "Supressão de ruído" }).uncheck();
    await expect(
      a.getByRole("checkbox", { name: "Supressão de ruído" }),
    ).toBeEnabled();
    await expect(
      a.getByRole("checkbox", { name: "Supressão de ruído" }),
    ).not.toBeChecked();
    await a.getByRole("button", { name: "Desligar mic" }).click();
    await expect(
      b.locator(".person").filter({ hasNotText: "(você)" }),
    ).toContainText("Mic desligado");
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await a.getByRole("button", { name: "Ligar mic" }).click();
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    await a.getByRole("button", { name: "Sair da voz", exact: true }).click();
    await signInAfterReload(a);
    await expect(
      a.getByRole("checkbox", { name: "Supressão de ruído" }),
    ).not.toBeChecked();
  } finally {
    await Promise.all([sender.close(), receiver.close()]);
  }
});
async function signInAfterReload(page: Page) {
  await page.reload();
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  await expect(
    page.getByRole("button", { name: "Desligar mic" }),
  ).toBeVisible();
}

test("Full HD chega ao player; volume e mudo da transmissão controlam o som real", async ({
  browser,
}) => {
  const sender = await browser.newContext(),
    receiver = await browser.newContext();
  await sender.addInitScript(sources);
  await receiver.addInitScript(sources);
  const a = await sender.newPage(),
    b = await receiver.newPage();
  try {
    await signIn(a, senderName);
    await signIn(b, receiverName);
    await a.getByRole("button", { name: "Desligar mic" }).click();
    await a.getByLabel("Qualidade", { exact: true }).selectOption("fullhd");
    await a
      .getByRole("button", { name: "Compartilhar tela", exact: true })
      .click();
    await expect(b.locator("video")).toHaveCount(1, { timeout: 15000 });
    await expect
      .poll(() => b.locator("video").evaluate((el) => el.videoHeight))
      .toBe(1080);
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    await slider(b, "Volume da transmissão", 0);
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await slider(b, "Volume da transmissão", 50);
    await expect.poll(() => level(b)).toBeGreaterThan(0.005);
    await b
      .getByRole("button", { name: "Silenciar transmissão", exact: true })
      .click();
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await b
      .getByRole("button", { name: "Ouvir transmissão", exact: true })
      .click();
    await expect.poll(() => level(b)).toBeGreaterThan(0.005);
    await b
      .getByRole("button", { name: "Silenciar áudio", exact: true })
      .click();
    await slider(b, "Volume da transmissão", 100);
    await expect.poll(() => level(b)).toBeLessThan(0.001); // changing stream volume cannot undo deafen
    await b.getByRole("button", { name: "Ouvir áudio", exact: true }).click();
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    await b.getByRole("button", { name: "Tela cheia", exact: true }).click();
    await expect
      .poll(() =>
        b.evaluate(
          () =>
            document.fullscreenElement?.classList.contains("screen") ?? false,
        ),
      )
      .toBe(true);
    await b
      .getByRole("button", { name: "Silenciar transmissão", exact: true })
      .click();
    await expect.poll(() => level(b)).toBeLessThan(0.001);
    await b
      .getByRole("button", { name: "Ouvir transmissão", exact: true })
      .click();
    await expect.poll(() => level(b)).toBeGreaterThan(0.01);
    await b
      .getByRole("button", { name: "Sair da tela cheia", exact: true })
      .click();
    await b.getByRole("button", { name: "Expandir", exact: true }).click();
    expect(await b.evaluate(() => document.fullscreenElement === null)).toBe(
      true,
    );
    await expect(b.locator("#screen-stage .screen-expanded")).toBeVisible();
    await expect(b.getByLabel("Mensagem em geral")).toBeInViewport();
    await b.screenshot({ path: "test-results/transmission-desktop.png" });
    // Screen controls wrap differently with viewport, fonts and receive state.
    // Check both overlap and clipping; overflow:hidden must not hide the composer.
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      await b.setViewportSize(viewport);
      for (const silenced of [false, true]) {
        if (silenced)
          await b
            .getByRole("button", { name: "Silenciar áudio", exact: true })
            .click();
        await expect
          .poll(
            () =>
              b.evaluate(() => {
                const composer = document
                  .querySelector(".composer")!
                  .getBoundingClientRect();
                const chat = document
                  .querySelector(".chat")!
                  .getBoundingClientRect();
                const voice = document
                  .querySelector(".right-panel")!
                  .getBoundingClientRect();
                return {
                  horizontalOverflow:
                    document.documentElement.scrollWidth > innerWidth,
                  overlapsVoice: composer.bottom > voice.top,
                  clippedByChat: composer.bottom > chat.bottom,
                  composerCollapsed: composer.height <= 0,
                };
              }),
            {
              message: `Campo de mensagem acessível em ${viewport.width}×${viewport.height}, recepção silenciada=${silenced}`,
            },
          )
          .toEqual({
            horizontalOverflow: false,
            overlapsVoice: false,
            clippedByChat: false,
            composerCollapsed: false,
          });
        if (silenced)
          await b
            .getByRole("button", { name: "Ouvir áudio", exact: true })
            .click();
      }
    }
    await b.setViewportSize({ width: 390, height: 844 });
    await b.screenshot({
      path: "test-results/transmission-mobile.png",
      fullPage: true,
    });
    await a
      .getByRole("button", { name: "Parar transmissão", exact: true })
      .click();
    await expect(b.locator("video")).toHaveCount(0);
    await expect.poll(() => level(b)).toBeLessThan(0.001);
  } finally {
    await Promise.all([sender.close(), receiver.close()]);
  }
});
