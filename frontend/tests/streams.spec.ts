import { test, expect, type Page } from "@playwright/test";

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
    await expect(selector.getByRole("checkbox")).toHaveCount(2);
    await selector
      .getByRole("checkbox", { name: "Assistir live de penumbra", exact: true })
      .check();
    await selector
      .getByRole("checkbox", {
        name: "Assistir live de galecalol",
        exact: true,
      })
      .uncheck();
    await expect(
      selector.getByRole("checkbox", {
        name: "Assistir live de penumbra",
        exact: true,
      }),
    ).toBeChecked();
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
    await expect(selector.getByRole("checkbox")).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(
      page.getByText("Selecione as lives que quer assistir", { exact: true }),
    ).toBeVisible();
    await selector
      .getByRole("checkbox", {
        name: "Assistir live de galecalol",
        exact: true,
      })
      .check();
    await expect(page.locator(".screen-who strong")).toHaveText("galecalol");
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
  await expect(selector.getByRole("checkbox")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Compartilhar tela", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Parar transmissão", exact: true }),
  ).toBeVisible();
  await expect(selector.getByRole("checkbox")).toHaveCount(3);
  await selector
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .click();
  await selector
    .getByRole("checkbox", { name: "Assistir live de admin", exact: true })
    .check();
  await expect(
    page.getByText("Sua prévia · sem som", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".screen video")).toHaveJSProperty("muted", true);
  await page
    .getByRole("button", { name: "Parar transmissão", exact: true })
    .click();
  await expect(selector.getByRole("checkbox")).toHaveCount(2);
  await expect(
    selector.getByRole("checkbox", {
      name: "Assistir live de galecalol",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    selector.getByRole("checkbox", {
      name: "Assistir live de penumbra",
      exact: true,
    }),
  ).toBeVisible();
  await selector
    .getByRole("checkbox", { name: "Assistir live de galecalol", exact: true })
    .check();
  await expect(page.locator(".screen-who strong")).toHaveText("galecalol");
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 320, height: 844 },
]) {
  test(`assiste três lives em grade com áudio independente (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel("Usuário", { exact: true }).fill("admin");
    await page.getByLabel("Senha", { exact: true }).fill("demo-streams");
    await page.getByRole("button", { name: "Entrar no espaço" }).click();
    if (viewport.width <= 900)
      await page.locator(".dv-tab", { hasText: "Sala de estar" }).click();
    // Exercise the real volume routing with synthetic tracks at the SDK boundary.
    await page.evaluate(`(async () => {
      const { setLease, identityOf } = await import('/src/demo/world.ts');
      const { Room, RoomEvent, Track } = await import('/src/demo/livekit.ts');
      setLease(identityOf('vgeralt'));
      const connect = Room.prototype.connect;
      Room.prototype.connect = async function() {
        await connect.call(this);
        for (const participant of this.remoteParticipants.values()) {
          const sid = 'screen-audio-' + participant.identity;
          participant.audioTrackPublications.set(sid, {
            source: Track.Source.ScreenShareAudio,
            track: {
              sid, element: null,
              attach(element) { this.element = element; return element; },
              detach() { this.element = null; },
              setVolume(volume) { this.element.dataset.appliedVolume = String(volume); }
            }
          });
        }
        this.emit(RoomEvent.TrackSubscribed);
      };
    })()`);
    await page
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .click();
    await expect(
      page.getByText("Voz conectada", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Escolher transmissão" })
        .getByRole("checkbox"),
    ).toHaveCount(3, { timeout: 10000 });
    await page
      .getByRole("button", { name: "Assistir todas", exact: true })
      .click();
    const gallery = page.getByRole("group", {
      name: "Transmissões simultâneas",
      exact: true,
    });
    await expect(gallery.locator("video")).toHaveCount(3);
    if (viewport.width > 900) {
      await gallery
        .getByRole("button", { name: "Expandir", exact: true })
        .first()
        .click();
      await expect
        .poll(() =>
          gallery.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return [...element.querySelectorAll("video")].every((video) => {
              const rect = video.getBoundingClientRect();
              return (
                rect.height >= 100 &&
                rect.top >= bounds.top &&
                rect.bottom <= bounds.bottom + 1
              );
            });
          }),
        )
        .toBe(true);
    }
    for (const name of ["galecalol", "penumbra", "vgeralt"]) {
      const tile = gallery.getByRole("group", {
        name: `Tela de ${name}`,
        exact: true,
      });
      await tile.scrollIntoViewIfNeeded();
      await expect(tile.locator("video")).toBeVisible();
      expect(
        (await tile.locator("video").boundingBox())!.height,
      ).toBeGreaterThan(100);
      await expect
        .poll(() =>
          tile
            .locator("video")
            .evaluate((video: HTMLVideoElement) => video.currentTime),
        )
        .toBeGreaterThan(0);
    }
    const gale = gallery.getByRole("group", {
      name: "Tela de galecalol",
      exact: true,
    });
    const penumbra = gallery.getByRole("group", {
      name: "Tela de penumbra",
      exact: true,
    });
    const audio = (name: string) =>
      page.locator(
        `audio[data-source="screen_share_audio"][data-identity="${name}:demo"]`,
      );
    await gale.getByLabel("Volume da transmissão").fill("35");
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0.35",
    );
    await expect(audio("penumbra")).toHaveAttribute("data-applied-volume", "1");
    await penumbra
      .getByRole("button", { name: "Silenciar transmissão", exact: true })
      .click();
    await expect(audio("penumbra")).toHaveAttribute("data-applied-volume", "0");
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0.35",
    );
    await page
      .getByRole("button", { name: "Silenciar áudio", exact: true })
      .click();
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0.35",
    );
    await expect(audio("vgeralt")).toHaveAttribute("data-applied-volume", "1");
    // The same three players move to the popout without changing volume or pausing the call.
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", {
        name: "Abrir transmissão em outra janela",
        exact: true,
      })
      .click();
    const popup = await popupPromise;
    await expect(popup.locator(".screen video")).toHaveCount(3);
    await expect(popup.getByRole("checkbox", { checked: true })).toHaveCount(3);
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0.35",
    );
    await popup.close();
    await expect(gallery.locator("video")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Limpar seleção", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Assistir live de penumbra", exact: true })
      .check();
    await expect(page.locator(".screen video")).toHaveCount(1);
    await expect(page.locator(".screen-who strong")).toHaveText("penumbra");
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0",
    );
    await expect(audio("penumbra")).toHaveAttribute("data-applied-volume", "0");
    await page
      .getByRole("button", { name: "Assistir todas", exact: true })
      .click();
    await expect(gallery.locator("video")).toHaveCount(3);
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0.35",
    );
    await expect(audio("penumbra")).toHaveAttribute("data-applied-volume", "0");
    await page
      .getByRole("button", { name: "Mais opções", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Encerrar transmissão de penumbra",
        exact: true,
      })
      .click();
    await expect(gallery.locator("video")).toHaveCount(2, { timeout: 10000 });
    await expect(audio("penumbra")).toHaveAttribute("data-applied-volume", "0");
    await expect(
      gallery.getByRole("group", { name: "Tela de galecalol", exact: true }),
    ).toBeAttached();
  });
}

async function spectator(page: Page, username: string) {
  await page.goto("/");
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
  // Give the UI an ordinary account and count attempts to publish a screen.
  await page.evaluate(`(() => {
    const original = window.fetch;
    window.__screenRequests = 0;
    window.fetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
      if (path === '/api/media/screen' && init?.method === 'POST') window.__screenRequests++;
      const response = await original(input, init);
      if (path === '/api/me' && response.ok) {
        const data = await response.json();
        return new Response(JSON.stringify({ ...data, user: { ...data.user, admin: false } }),
          { status: response.status, headers: response.headers });
      }
      return response;
    };
  })()`);
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill("demo-viewer");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gerenciar contas", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(`(async () => {
    const { setLease, identityOf, world } = await import('/src/demo/world.ts');
    const { Room, RoomEvent, Track } = await import('/src/demo/livekit.ts');
    world.me.admin = false;
    setLease(identityOf('vgeralt'));
    window.__desiredScreens = {};
    const connect = Room.prototype.connect;
    Room.prototype.connect = async function() {
      await connect.call(this);
      for (const participant of this.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.source !== Track.Source.ScreenShare) continue;
          const video = pub.track;
          pub.track = undefined;
          pub.isDesired = false;
          pub.setSubscribed = wanted => {
            pub.isDesired = wanted;
            window.__desiredScreens[participant.identity] = wanted;
            pub.track = wanted ? video : undefined;
            this.emit(wanted ? RoomEvent.TrackSubscribed : RoomEvent.TrackUnsubscribed);
          };
        }
      }
    };
  })()`);
  await expect(
    page
      .getByRole("group", { name: "Escolher transmissão" })
      .getByRole("checkbox"),
  ).toHaveCount(3, { timeout: 10000 });
  await expect(
    page.getByRole("button", { name: "Parar transmissão", exact: true }),
  ).toHaveCount(0);
}

test("dois espectadores comuns escolhem 1, 2 ou 3 lives independentemente, antes de receber vídeo", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const otherContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const other = await otherContext.newPage();
    await spectator(page, "espectador-a");
    await spectator(other, "espectador-b");
    const check = (p: Page, name: string) =>
      p.getByRole("checkbox", {
        name: `Assistir live de ${name}`,
        exact: true,
      });
    await page
      .getByRole("button", { name: "Limpar seleção", exact: true })
      .click();
    await check(page, "galecalol").check();
    await check(page, "penumbra").check();
    await other
      .getByRole("button", { name: "Limpar seleção", exact: true })
      .click();
    await check(other, "vgeralt").check();
    await expect(
      page
        .getByText("Entre na voz para assistir. Você não precisa transmitir.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    for (const p of [page, other]) {
      await p
        .getByRole("button", { name: "Entrar na voz", exact: true })
        .click();
      await expect(p.getByText("Voz conectada", { exact: true })).toBeVisible();
    }
    await expect(page.locator(".screen-who strong")).toHaveText([
      "galecalol",
      "penumbra",
    ]);
    await expect(other.locator(".screen-who strong")).toHaveText("vgeralt");
    await expect(page.locator(".screen video")).toHaveCount(2);
    await expect(other.locator(".screen video")).toHaveCount(1);
    await check(page, "vgeralt").check();
    await expect(page.locator(".screen video")).toHaveCount(3);
    await expect(other.locator(".screen video")).toHaveCount(1);
    await check(page, "galecalol").uncheck();
    await check(page, "penumbra").uncheck();
    await expect(page.locator(".screen video")).toHaveCount(1);
    await expect(page.locator(".screen-who strong")).toHaveText("vgeralt");
    await expect
      .poll(() => page.evaluate("window.__desiredScreens"))
      .toEqual({
        "galecalol:demo": false,
        "penumbra:demo": false,
        "vgeralt:demo": true,
      });
    await check(other, "galecalol").check();
    await expect(other.locator(".screen video")).toHaveCount(2);
    await expect(page.locator(".screen video")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Limpar seleção", exact: true })
      .click();
    await expect(page.locator(".screen video")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate("window.__desiredScreens"))
      .toEqual({
        "galecalol:demo": false,
        "penumbra:demo": false,
        "vgeralt:demo": false,
      });
    for (const p of [page, other]) {
      await expect(
        p
          .getByRole("group", { name: "Escolher transmissão" })
          .getByRole("checkbox"),
      ).toHaveCount(3);
      expect(await p.evaluate("window.__screenRequests")).toBe(0);
      await expect(
        p.getByRole("button", { name: "Parar transmissão", exact: true }),
      ).toHaveCount(0);
    }
  } finally {
    await otherContext.close();
  }
});
