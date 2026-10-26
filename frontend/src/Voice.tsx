import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalScreenTracks,
  type LocalTrack,
  type RemoteTrack,
  type Participant,
} from "livekit-client";
import { api, type Lease } from "./api";
type Connection = {
  identity: string;
  url: string;
  token: string;
  screen: { bitrate: number; height: number; fps: number };
};
function mediaError(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  return name === "NotAllowedError"
    ? "Permissão negada. Autorize o microfone ou a tela nas configurações do navegador."
    : name === "NotFoundError"
      ? "Nenhum microfone encontrado. Conecte um dispositivo e tente novamente."
      : name === "NotReadableError"
        ? "Dispositivo ocupado ou bloqueado pelo sistema. Confira as permissões do sistema."
        : e instanceof Error &&
            /^(Outra pessoa|Entre na voz|Reserva|Mídia|Sessão|Não foi possível|Muitas|Sala cheia)/.test(
              e.message,
            )
          ? e.message
          : "Falha na conexão de voz. Confira a rede e tente novamente.";
}
export function Voice({
  admin,
  onError,
}: {
  admin: boolean;
  onError: (s: string) => void;
}) {
  const room = useRef<Room | null>(null),
    connection = useRef<Connection | null>(null),
    lease = useRef<Lease | null>(null),
    screenTracks = useRef<LocalTrack[]>([]);
  const [joined, setJoined] = useState(false),
    [busy, setBusy] = useState(false),
    [mic, setMic] = useState(false),
    [deaf, setDeaf] = useState(false),
    [sharing, setSharing] = useState(false),
    [version, setVersion] = useState(0),
    [status, setStatus] = useState("Fora da chamada");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState("default"),
    [quality, setQuality] = useState("normal");
  const [state, setState] = useState<{
    lease: Lease;
    participants: { identity: string; name: string }[];
  }>({
    lease: { identity: null, leaseId: null, expiresAt: null },
    participants: [],
  });
  const bump = () => setVersion((x) => x + 1);
  async function release() {
    const c = connection.current,
      l = lease.current;
    lease.current = null;
    const tracks = screenTracks.current;
    screenTracks.current = [];
    for (const t of tracks) {
      t.stop();
      if (room.current) await room.current.localParticipant.unpublishTrack(t);
    }
    screenTracks.current = [];
    setSharing(false);
    if (c && l)
      await api("/media/screen", "DELETE", {
        identity: c.identity,
        leaseId: l.leaseId,
      });
  }
  async function leave() {
    const c = connection.current;
    try {
      await release();
    } finally {
      connection.current = null;
      await room.current?.disconnect();
      room.current = null;
      setJoined(false);
      setMic(false);
      setStatus("Fora da chamada");
      if (c) await api("/media/leave", "POST", { identity: c.identity });
    }
  }
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const value = await api<typeof state>("/media/state");
        if (alive) setState(value);
      } catch {
        /* chat remains available during media outage */
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    const heartbeat = setInterval(() => {
      const c = connection.current,
        l = lease.current;
      if (c)
        void api("/media/heartbeat", "POST", { identity: c.identity }).catch(
          (e) => {
            onError(mediaError(e));
            void leave().catch(() => {});
          },
        );
      if (c && l)
        void api("/media/screen/heartbeat", "POST", {
          identity: c.identity,
          leaseId: l.leaseId,
        }).catch((e) => {
          onError(mediaError(e));
          void release().catch(() => {});
        });
    }, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(heartbeat);
      void leave().catch(() => {});
    };
    // A single room lifecycle is owned by this component.
  }, []);
  async function join() {
    setBusy(true);
    setStatus("Conectando à voz…");
    try {
      const c = await api<Connection>("/media/join", "POST");
      connection.current = c;
      const r = new Room({ adaptiveStream: true, dynacast: true });
      room.current = r;
      for (const event of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
      ])
        r.on(event, bump);
      r.on(RoomEvent.Reconnecting, () => setStatus("Reconectando à voz…"));
      r.on(RoomEvent.Reconnected, () => {
        setStatus("Voz conectada");
        if (lease.current) void release().catch((e) => onError(mediaError(e)));
      });
      r.on(RoomEvent.Disconnected, () => {
        setJoined(false);
        setMic(false);
        setStatus("Conexão de voz encerrada");
        void release().catch(() => {});
        const old = connection.current;
        connection.current = null;
        if (old)
          void api("/media/leave", "POST", { identity: old.identity }).catch(
            () => {},
          );
      });
      await r.connect(c.url, c.token);
      await r.startAudio();
      setJoined(true);
      setStatus("Voz conectada");
      try {
        await r.localParticipant.setMicrophoneEnabled(true);
        setMic(true);
        setDevices(await Room.getLocalDevices("audioinput"));
      } catch (e) {
        onError(mediaError(e));
      }
    } catch (e) {
      onError(mediaError(e));
      await leave().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function toggleMic() {
    try {
      await room.current?.localParticipant.setMicrophoneEnabled(!mic, {
        deviceId: device,
      });
      setMic(!mic);
      setDevices(await Room.getLocalDevices("audioinput"));
    } catch (e) {
      onError(mediaError(e));
    }
  }
  async function share() {
    if (sharing) {
      await release();
      return;
    }
    const r = room.current,
      c = connection.current;
    if (!r || !c) return;
    // Capture is called from the user gesture, before the network request.
    const tracks = await createLocalScreenTracks({
      audio: true,
      resolution: {
        width: quality === "low" ? 854 : 1280,
        height: quality === "low" ? 480 : c.screen.height,
        frameRate: quality === "low" ? 15 : c.screen.fps,
      },
    });
    screenTracks.current = tracks;
    try {
      lease.current = await api<Lease>("/media/screen", "POST", {
        identity: c.identity,
      });
      for (
        let i = 0;
        i < 30 &&
        !r.localParticipant.permissions?.canPublishSources?.includes(3);
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
      for (const t of tracks) {
        await r.localParticipant.publishTrack(t, {
          source:
            t.kind === Track.Kind.Video
              ? Track.Source.ScreenShare
              : Track.Source.ScreenShareAudio,
          screenShareEncoding: {
            maxBitrate: quality === "low" ? 1000000 : c.screen.bitrate,
            maxFramerate: quality === "low" ? 15 : c.screen.fps,
          },
          simulcast: false,
        });
        t.on("ended", () => {
          void release().catch((e) => onError(mediaError(e)));
        });
      }
      setSharing(true);
      bump();
    } catch (e) {
      await release().catch(() => {});
      throw e;
    }
  }
  const participants: Participant[] = room.current
    ? [
        room.current.localParticipant,
        ...room.current.remoteParticipants.values(),
      ]
    : [];
  const tracks = participants.flatMap((p) =>
    [...p.trackPublications.values()]
      .filter((pub) => pub.track && pub.source === Track.Source.ScreenShare)
      .map((pub) => ({
        track: pub.track!,
        name: p.name || "Amigo",
        identity: p.identity,
      })),
  );
  const audio = participants
    .filter((p) => p !== room.current?.localParticipant)
    .flatMap((p) =>
      [...p.audioTrackPublications.values()]
        .filter((pub) => pub.track)
        .map((pub) => pub.track as RemoteTrack),
    );
  return (
    <section
      className="voice-panel"
      aria-label="Sala de voz"
      data-version={version}
    >
      <div className="section-heading">
        <span className="eyebrow">UM LUGAR PARA FICAR</span>
        <span className="pill">
          {joined ? participants.length : state.participants.length} na voz
        </span>
      </div>
      <h2>
        Sala de estar <span aria-hidden="true">◌</span>
      </h2>
      <p className="muted">Puxe uma cadeira. A conversa acontece aqui.</p>
      <div className="voice-people">
        {(joined
          ? participants.map((p) => ({
              identity: p.identity,
              name: p.name || "Amigo",
              speaking: p.isSpeaking,
            }))
          : state.participants.map((p) => ({ ...p, speaking: false }))
        ).map((p) => (
          <div
            className={"person " + (p.speaking ? "speaking" : "")}
            key={p.identity}
          >
            <span className="avatar">{p.name.slice(0, 2).toUpperCase()}</span>
            <span>{p.name}</span>
            {p.speaking && <small>falando</small>}
          </div>
        ))}
        {!joined && !state.participants.length && (
          <div className="quiet">
            <span>☁</span>
            <p>
              A sala está tranquila.
              <br />
              Seja o primeiro a entrar.
            </p>
          </div>
        )}
      </div>
      <div className="voice-status" role="status">
        <span className={"dot " + (joined ? "green" : "")} />
        {status}
      </div>
      {!joined ? (
        <button
          className="primary wide"
          disabled={busy}
          onClick={() => void join()}
        >
          {busy ? "Conectando…" : "Entrar na voz"}
        </button>
      ) : (
        <>
          <div className="voice-controls">
            <button aria-pressed={!mic} onClick={() => void toggleMic()}>
              {mic ? "Desligar mic" : "Ligar mic"}
            </button>
            <button aria-pressed={deaf} onClick={() => setDeaf(!deaf)}>
              {deaf ? "Ouvir áudio" : "Silenciar áudio"}
            </button>
          </div>
          <label className="compact">
            Microfone
            <select
              value={device}
              onChange={(e) => {
                const id = e.target.value;
                setDevice(id);
                void room.current
                  ?.switchActiveDevice("audioinput", id)
                  .catch((err) => onError(mediaError(err)));
              }}
            >
              <option value="default">Padrão do sistema</option>
              {devices
                .filter((d) => d.deviceId !== "default")
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Microfone"}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="danger wide"
            onClick={() => void leave().catch((e) => onError(mediaError(e)))}
          >
            Sair da voz
          </button>
        </>
      )}
      <div className="screen-controls">
        <h3>Compartilhar um momento</h3>
        <p className="muted">Uma tela por vez, para todo mundo acompanhar.</p>
        <label className="compact">
          Qualidade
          <select
            value={quality}
            disabled={sharing}
            onChange={(e) => setQuality(e.target.value)}
          >
            <option value="normal">720p · até 30 fps · até 4 Mbps</option>
            <option value="low">480p · até 15 fps · até 1 Mbps</option>
          </select>
        </label>
        <button
          className="secondary wide"
          disabled={!joined || busy}
          onClick={() => void share().catch((e) => onError(mediaError(e)))}
        >
          {sharing ? "Parar transmissão" : "Compartilhar tela"}
        </button>
        <small>Áudio da tela depende do navegador e sistema.</small>
      </div>
      {tracks
        .filter(
          (t) =>
            t.identity === state.lease.identity ||
            (t.identity === connection.current?.identity && sharing),
        )
        .map((t) => (
          <Screen key={t.track.sid || "local"} track={t.track} name={t.name} />
        ))}
      {admin && state.lease.identity && (
        <button
          className="text-button"
          onClick={() =>
            void api("/media/screen/force-stop", "POST").catch((e) =>
              onError(mediaError(e)),
            )
          }
        >
          Encerrar transmissão travada
        </button>
      )}
      {audio.map((t) => (
        <AudioTrack key={t.sid} track={t} muted={deaf} />
      ))}
    </section>
  );
}
function AudioTrack({ track, muted }: { track: RemoteTrack; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current!;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <audio ref={ref} autoPlay muted={muted} />;
}
function Screen({ track, name }: { track: Track; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current!;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <div className="screen">
      <video ref={ref} autoPlay playsInline muted />
      <div>
        <span>Tela de {name}</span>
        <button onClick={() => void ref.current?.requestFullscreen()}>
          Ampliar
        </button>
      </div>
    </div>
  );
}
