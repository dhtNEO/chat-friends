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
    await expect(
      selector.getByRole("button", { name: /^Tela de / }),
    ).toHaveCount(2);
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
  await expect(selector.getByRole("button", { name: /^Tela de / })).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Compartilhar tela", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Parar transmissão", exact: true }),
  ).toBeVisible();
  await expect(selector.getByRole("button", { name: /^Tela de / })).toHaveCount(
    3,
  );
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
  await expect(selector.getByRole("button", { name: /^Tela de / })).toHaveCount(
    2,
  );
  await expect(
    selector.getByRole("button", { name: "Tela de galecalol", exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole("button", { name: "Tela de penumbra", exact: true }),
  ).toBeVisible();
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
    await expect(
      popup.getByRole("button", { name: "Assistir todas", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0.35",
    );
    await popup.close();
    await expect(gallery.locator("video")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Tela de penumbra", exact: true })
      .click();
    await expect(page.locator(".screen video")).toHaveCount(1);
    await expect(page.locator(".screen-who strong")).toHaveText("penumbra");
    await expect(audio("galecalol")).toHaveAttribute(
      "data-applied-volume",
      "0",
    );
    await expect(audio("penumbra")).toHaveAttribute("data-applied-volume", "1");
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
