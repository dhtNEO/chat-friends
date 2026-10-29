import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Room,
  RoomEvent,
  Track,
  createLocalScreenTracks,
  type LocalTrack,
  type RemoteAudioTrack,
  type LocalAudioTrack,
  type Participant,
} from "livekit-client";
import { api, type Lease } from "./api";
import { MicrophoneGain } from "./MicrophoneGain";
import { AudioTrack, Screen } from "./MediaPlayback";
import { useAudioSettings } from "./useAudioSettings";
import { Icon } from "./Icon";
import { Avatar, Popover, avatarSrc, usePeople } from "./ui";
import { PopoutStage, usePopout } from "./Popout";
import { loadSounds, playEffect, type Effect } from "./sounds";
import { Music, MUSIC_IDENTITY } from "./Music";
type Connection = {
  identity: string;
  url: string;
  token: string;
  screen: { bitrate: number; height: number; fps: number };
};
const PRESETS: Record<
  string,
  { height: number; fps: number; bitrate: number }
> = {
  fullhd60: { height: 1080, fps: 60, bitrate: 8000000 },
  fullhd: { height: 1080, fps: 30, bitrate: 8000000 },
  normal: { height: 720, fps: 30, bitrate: 4000000 },
  low: { height: 480, fps: 15, bitrate: 1000000 },
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
  userId,
  hosts,
  maximized,
  onOpen,
  onStreaming,
  onIdentityChange,
  onMaximize,
  onError,
}: {
  admin: boolean;
  userId: string;
  // Panels may be closed or moved; the call lives here and keeps playing.
  hosts: {
    stage: HTMLElement | null;
    roster: HTMLElement | null;
    quick: HTMLElement | null;
  };
  maximized: boolean;
  onOpen: () => void;
  onStreaming: (active: boolean) => void;
  onIdentityChange?: (identity: string | undefined) => void;
  onMaximize: () => void;
  onError: (s: string) => void;
}) {
  const [settings, setSettings] = useAudioSettings(userId);
  const directory = usePeople();
  const popout = usePopout(onError);
  useEffect(() => {
    loadSounds(userId);
  }, [userId]);
  // Room callbacks outlive renders; read the current volume and state here.
  const sound = useRef({ volume: 1, deaf: false, inCall: false });
  sound.current.volume = (settings.effects / 100) * (settings.output / 100);
  const effect = (name: Effect, remote = false) => {
    if (!(remote && sound.current.deaf)) playEffect(name, sound.current.volume);
  };
  const micProcessor = useRef<MicrophoneGain | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
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
    [quality, setQuality] = useState("normal"),
    [focus, setFocus] = useState<string | null>(null),
    [adjusting, setAdjusting] = useState<string | null>(null);
  const [state, setState] = useState<{
    lease: Lease;
    participants: {
      identity: string;
      name: string;
      micMuted: boolean;
      deaf: boolean;
    }[];
  }>({
    lease: { identity: null, leaseId: null, expiresAt: null },
    participants: [],
  });
  useEffect(() => {
    onIdentityChange?.(joined ? connection.current?.identity : undefined);
  }, [joined, onIdentityChange]);
  const noiseSupported =
    navigator.mediaDevices?.getSupportedConstraints().noiseSuppression === true;
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
    if (sound.current.inCall) effect("leave");
    sound.current.inCall = false;
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
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        webAudioMix: true,
        audioCaptureDefaults: {
          deviceId: device,
          noiseSuppression: settings.noise,
          echoCancellation: true,
          autoGainControl: false,
        },
      });
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
      r.on(RoomEvent.ParticipantConnected, (p) => {
        if (p.identity !== MUSIC_IDENTITY) effect("join", true);
      });
      r.on(RoomEvent.ParticipantDisconnected, (p) => {
        if (p.identity !== MUSIC_IDENTITY) effect("leave", true);
      });
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
        // Only an unexpected drop gets here with a connection still set.
        if (old && sound.current.inCall) effect("leave");
        sound.current.inCall = false;
        if (old)
          void api("/media/leave", "POST", { identity: old.identity }).catch(
            () => {},
          );
      });
      await r.connect(c.url, c.token);
      await r.startAudio();
      await api("/media/audio", "PUT", { identity: c.identity, deaf });
      setJoined(true);
      setStatus("Voz conectada");
      sound.current.inCall = true;
      effect("join");
      try {
        await enableMicrophone(r);
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
  async function enableMicrophone(r: Room) {
    if (r.localParticipant.getTrackPublication(Track.Source.Microphone)) {
      await r.localParticipant.setMicrophoneEnabled(true);
      return;
    }
    // createTracks sets the room AudioContext before we install the processor.
    // Never publish the raw microphone before applying the user's gain.
    const tracks = await r.localParticipant.createTracks({
      audio: {
        deviceId: device,
        noiseSuppression: settings.noise,
        echoCancellation: true,
        autoGainControl: false,
      },
    });
    const track = tracks[0] as LocalAudioTrack;
    try {
      micProcessor.current = new MicrophoneGain(settings.microphone);
      await track.setProcessor(micProcessor.current);
      await r.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
      });
    } catch (error) {
      tracks.forEach((item) => item.stop());
      throw error;
    }
  }
  async function toggleMic() {
    const r = room.current;
    if (!r) return;
    setAudioBusy(true);
    try {
      if (mic) await r.localParticipant.setMicrophoneEnabled(false);
      else await enableMicrophone(r);
      setMic(r.localParticipant.isMicrophoneEnabled);
      effect(r.localParticipant.isMicrophoneEnabled ? "unmute" : "mute");
      setDevices(await Room.getLocalDevices("audioinput"));
    } catch (e) {
      onError(mediaError(e));
    } finally {
      setAudioBusy(false);
    }
  }
  async function toggleDeaf() {
    const c = connection.current;
    if (!c) return;
    setAudioBusy(true);
    const next = !deaf;
    // Apply locally at once; publish the display state independently of playback.
    setDeaf(next);
    sound.current.deaf = next;
    effect(next ? "mute" : "unmute");
    try {
      await api("/media/audio", "PUT", { identity: c.identity, deaf: next });
    } catch (e) {
      onError(mediaError(e));
    } finally {
      setAudioBusy(false);
    }
  }
  async function changeNoise(next: boolean) {
    const previous = settings.noise;
    setSettings((old) => ({ ...old, noise: next }));
    setAudioBusy(true);
    try {
      const track = room.current?.localParticipant.getTrackPublication(
        Track.Source.Microphone,
      )?.track as LocalAudioTrack | undefined;
      await track?.applyConstraints({
        noiseSuppression: next,
        echoCancellation: true,
        autoGainControl: false,
      });
      if (room.current)
        room.current.options.audioCaptureDefaults = {
          ...room.current.options.audioCaptureDefaults,
          noiseSuppression: next,
        };
    } catch (e) {
      setSettings((old) => ({ ...old, noise: previous }));
      onError(mediaError(e));
    } finally {
      setAudioBusy(false);
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
    const preset = PRESETS[quality] ?? PRESETS.normal;
    const height = Math.min(c.screen.height, preset.height);
    const fps = Math.min(c.screen.fps, preset.fps);
    const bitrate = Math.min(c.screen.bitrate, preset.bitrate);
    const tracks = await createLocalScreenTracks({
      audio: true,
      resolution: {
        width: Math.round((height * 16) / 9),
        height,
        frameRate: fps,
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
            maxBitrate: bitrate,
            maxFramerate: fps,
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
        .map((pub) => ({
          track: pub.track as RemoteAudioTrack,
          identity: p.identity,
          source: pub.source,
        })),
    );
  const self = connection.current?.identity;
  const live = tracks.filter(
    (t) =>
      t.identity === state.lease.identity || (t.identity === self && sharing),
  );
  const streaming = live.length > 0;
  const notifyStreaming = useRef(onStreaming);
  notifyStreaming.current = onStreaming;
  useEffect(() => {
    notifyStreaming.current(streaming);
  }, [streaming]);
  const featured = live.find((t) => t.identity === focus) ?? live[0];
  // Identities are "accountId:connection"; names and photos follow profiles.
  const account = (identity: string) =>
    directory.byId.get(identity.split(":")[0]);
  const people = (
    joined
      ? participants
          .filter((p) => p.identity !== MUSIC_IDENTITY)
          .map((p) => ({
            identity: p.identity,
            name: p.name || "Amigo",
            speaking: p.isSpeaking,
            micMuted: !p.isMicrophoneEnabled,
            deaf:
              p === room.current?.localParticipant
                ? deaf
                : (state.participants.find(
                    (person) => person.identity === p.identity,
                  )?.deaf ?? false),
          }))
      : state.participants.map((p) => ({ ...p, speaking: false }))
  ).map((p) => ({
    ...p,
    name: account(p.identity)?.displayName ?? p.name,
    src: avatarSrc(account(p.identity)),
  }));
  // Our own state is exact; others' comes from tracks or the polled lease.
  const isLive = (identity: string) =>
    identity === self
      ? sharing
      : live.some((t) => t.identity === identity) ||
        state.lease.identity === identity;
  const personVolume = (identity: string) =>
    settings.people[identity.split(":")[0]] ?? 100;
  const fullHd = (connection.current?.screen.height ?? 1080) >= 1080,
    sixty = (connection.current?.screen.fps ?? 60) >= 60;
  const featuredName = featured
    ? (account(featured.identity)?.displayName ?? featured.name)
    : "";
  const stage = (
    <section className="stage" aria-label="Sala de voz" data-version={version}>
      <header className="stage-header">
        <Icon name="speaker" size={22} />
        <div>
          <h2>Sala de estar</h2>
          <p>Converse, jogue e assista junto</p>
        </div>
        <div className="voice-status" role="status">
          <span className={"dot " + (joined ? "green" : "")} />
          {status}
        </div>
      </header>
      <div className="stage-main">
        {popout.win ? (
          <div className="stage-empty">
            <span className="stage-empty-icon">
              <Icon name="popout" size={34} />
            </span>
            <h3>Transmissão em outra janela</h3>
            <p>Arraste a janela para outro monitor. O som continua aqui.</p>
            <button className="primary" onClick={popout.close}>
              Trazer de volta
            </button>
          </div>
        ) : featured ? (
          <Screen
            key={featured.track.sid || "local"}
            track={featured.track}
            name={account(featured.identity)?.displayName ?? featured.name}
            avatar={avatarSrc(account(featured.identity))}
            local={featured.identity === self}
            viewers={Math.max(people.length - 1, 0)}
            volume={settings.stream}
            deaf={deaf}
            expanded={maximized}
            onExpand={onMaximize}
            onPopout={popout.open}
            onVolume={(stream) => setSettings((old) => ({ ...old, stream }))}
            onError={onError}
          />
        ) : (
          <div className="stage-empty">
            <span className="stage-empty-icon">
              <Icon name="screen" size={34} />
            </span>
            <h3>Ninguém está transmitindo</h3>
            <p>
              {joined
                ? "Compartilhe sua tela para todo mundo assistir junto."
                : people.length
                  ? "Tem gente na sala. Entre e puxe uma cadeira."
                  : "A sala está tranquila. Seja o primeiro a entrar."}
            </p>
          </div>
        )}
      </div>
      {people.length > 0 && (
        <div className="tiles">
          {people.map((p) => (
            <div
              key={p.identity}
              className={
                "person tile" +
                (p.speaking && !p.micMuted ? " speaking" : "") +
                (isLive(p.identity) ? " live" : "") +
                (featured?.identity === p.identity ? " featured" : "") +
                (adjusting === p.identity ? " adjusting" : "")
              }
              onClick={() => {
                if (isLive(p.identity)) setFocus(p.identity);
                // Touch screens have no hover: a tap reveals the volume.
                setAdjusting(adjusting === p.identity ? null : p.identity);
              }}
            >
              <Avatar
                name={p.name}
                src={p.src}
                size={52}
                speaking={p.speaking}
              />
              {isLive(p.identity) && (
                <span className="live-badge">AO VIVO</span>
              )}
              <div className="tile-footer">
                <strong>
                  {p.name}
                  {p.identity === self ? " (você)" : ""}
                </strong>
                <span className="tile-icons">
                  {p.micMuted && <Icon name="micOff" size={15} />}
                  {p.deaf && <Icon name="headphonesOff" size={15} />}
                </span>
                <span className="sr-only">
                  {p.micMuted ? "Mic desligado" : "Mic ligado"} ·{" "}
                  {p.deaf ? "Áudio silenciado" : "Ouvindo"}
                  {p.speaking && !p.micMuted ? " · falando" : ""}
                </span>
              </div>
              {joined && p.identity !== self && (
                <label className="tile-volume" title={`Volume de ${p.name}`}>
                  <span className="sr-only">Volume de {p.name}</span>
                  <Icon name="volume" size={14} />
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={personVolume(p.identity)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const value = +e.target.value;
                      setSettings((old) => ({
                        ...old,
                        people: {
                          ...old.people,
                          [p.identity.split(":")[0]]: value,
                        },
                      }));
                    }}
                  />
                  <span className="volume-value" aria-hidden="true">
                    {personVolume(p.identity)}%
                  </span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
      <Music
        identity={joined ? self : undefined}
        volume={settings.music}
        onVolume={(music) => setSettings((old) => ({ ...old, music }))}
      />
      <div className="control-bar">
        {!joined ? (
          <button
            className="control join"
            disabled={busy}
            onClick={() => void join()}
          >
            <Icon name="phone" />
            <span>{busy ? "Conectando…" : "Entrar na voz"}</span>
          </button>
        ) : (
          <>
            <div className="control-group">
              <button
                className={"control" + (mic ? "" : " off")}
                aria-label={mic ? "Desligar mic" : "Ligar mic"}
                aria-pressed={!mic}
                disabled={audioBusy}
                onClick={() => void toggleMic()}
              >
                <Icon name={mic ? "mic" : "micOff"} />
                <span>Microfone</span>
              </button>
              <Popover label="Configurações de voz">
                <label>
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
                <label className="volume-control">
                  Volume do microfone{" "}
                  <span className="volume-value" aria-hidden="true">
                    {settings.microphone}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={settings.microphone}
                    onChange={(e) => {
                      const value = +e.target.value;
                      micProcessor.current?.setVolume(value);
                      setSettings((old) => ({ ...old, microphone: value }));
                    }}
                  />
                </label>
                <label className="volume-control">
                  Volume de saída{" "}
                  <span className="volume-value" aria-hidden="true">
                    {settings.output}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.output}
                    onChange={(e) => {
                      const value = +e.target.value;
                      setSettings((old) => ({ ...old, output: value }));
                    }}
                  />
                </label>
                <label className="volume-control">
                  Efeitos sonoros{" "}
                  <span className="volume-value" aria-hidden="true">
                    {settings.effects}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.effects}
                    onChange={(e) => {
                      const value = +e.target.value;
                      setSettings((old) => ({ ...old, effects: value }));
                    }}
                  />
                </label>
                <label className="noise-toggle">
                  <input
                    type="checkbox"
                    checked={settings.noise}
                    disabled={audioBusy || !noiseSupported}
                    onChange={(e) => void changeNoise(e.target.checked)}
                  />{" "}
                  Supressão de ruído
                </label>
                {!noiseSupported && (
                  <small>Supressão nativa indisponível neste navegador.</small>
                )}
                <small>
                  Volumes salvos só neste navegador. Acima de 100% pode
                  distorcer.
                </small>
              </Popover>
            </div>
            <button
              className={"control" + (deaf ? " off" : "")}
              aria-label={deaf ? "Ouvir áudio" : "Silenciar áudio"}
              aria-pressed={deaf}
              disabled={audioBusy}
              onClick={() => void toggleDeaf()}
            >
              <Icon name={deaf ? "headphonesOff" : "headphones"} />
              <span>Áudio</span>
            </button>
            <div className="control-group">
              <button
                className={"control" + (sharing ? " active" : "")}
                aria-label={sharing ? "Parar transmissão" : "Compartilhar tela"}
                disabled={busy}
                onClick={() =>
                  void share().catch((e) => onError(mediaError(e)))
                }
              >
                <Icon name="share" />
                <span>{sharing ? "Parar" : "Compartilhar"}</span>
              </button>
              <Popover label="Opções de transmissão">
                <label>
                  Qualidade
                  <select
                    aria-label="Qualidade"
                    value={quality}
                    disabled={sharing}
                    onChange={(e) => setQuality(e.target.value)}
                  >
                    <option value="fullhd60" disabled={!fullHd || !sixty}>
                      1080p · 60 fps · até 8 Mbps
                    </option>
                    <option value="fullhd" disabled={!fullHd}>
                      1080p · 30 fps · até 8 Mbps
                    </option>
                    <option value="normal">720p · 30 fps · até 4 Mbps</option>
                    <option value="low">480p · 15 fps · até 1 Mbps</option>
                  </select>
                </label>
                {(!fullHd || !sixty) && (
                  <small>
                    Opções desativadas dependem de SCREEN_HEIGHT=1080 e
                    SCREEN_FPS=60 no servidor.
                  </small>
                )}
                <small>Áudio da tela depende do navegador e sistema.</small>
              </Popover>
            </div>
            {admin && state.lease.identity && (
              <Popover label="Mais opções" icon="more" className="solo">
                <button
                  onClick={() =>
                    void api("/media/screen/force-stop", "POST").catch((e) =>
                      onError(mediaError(e)),
                    )
                  }
                >
                  Encerrar transmissão travada
                </button>
              </Popover>
            )}
            <button
              className="control danger"
              aria-label="Sair da voz"
              onClick={() => void leave().catch((e) => onError(mediaError(e)))}
            >
              <Icon name="phone" />
              <span>Sair</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
  const roster = (
    <div className="voice-channel">
      <button
        className={"channel" + (joined ? " selected" : "")}
        onClick={() => {
          onOpen();
          if (!joined && !busy) void join();
        }}
      >
        <Icon name="speaker" size={18} />
        Sala de estar
      </button>
      <ul className="roster">
        {people.map((p) => (
          <li
            key={p.identity}
            className={p.speaking && !p.micMuted ? "speaking" : ""}
          >
            <Avatar name={p.name} src={p.src} size={22} speaking={p.speaking} />
            <span className="roster-name">{p.name}</span>
            {isLive(p.identity) && (
              <span className="live-badge small">AO VIVO</span>
            )}
            {p.micMuted && <Icon name="micOff" size={14} />}
            {p.deaf && <Icon name="headphonesOff" size={14} />}
          </li>
        ))}
      </ul>
    </div>
  );
  const quick = (
    <>
      <button
        className={"icon-button" + (joined && !mic ? " off" : "")}
        aria-label="Alternar microfone"
        title={joined ? (mic ? "Desligar mic" : "Ligar mic") : "Entre na voz"}
        aria-pressed={joined && !mic}
        disabled={!joined || audioBusy}
        onClick={() => void toggleMic()}
      >
        <Icon name={joined && !mic ? "micOff" : "mic"} size={18} />
      </button>
      <button
        className={"icon-button" + (deaf ? " off" : "")}
        aria-label="Alternar áudio"
        title={deaf ? "Ouvir áudio" : "Silenciar áudio"}
        aria-pressed={deaf}
        disabled={!joined || audioBusy}
        onClick={() => void toggleDeaf()}
      >
        <Icon name={deaf ? "headphonesOff" : "headphones"} size={18} />
      </button>
    </>
  );
  return (
    <>
      {hosts.stage && createPortal(stage, hosts.stage)}
      {popout.win && (
        <PopoutStage
          win={popout.win}
          track={featured?.track ?? null}
          name={featuredName}
          onClose={popout.close}
        />
      )}
      {hosts.roster && createPortal(roster, hosts.roster)}
      {hosts.quick && createPortal(quick, hosts.quick)}
      {audio.map(({ track, identity, source }) => (
        <AudioTrack
          key={track.sid}
          track={track}
          identity={identity}
          source={source}
          volume={
            deaf
              ? 0
              : ((settings.output / 100) *
                  (source === Track.Source.ScreenShareAudio
                    ? settings.stream
                    : identity === MUSIC_IDENTITY
                      ? settings.music
                      : personVolume(identity))) /
                100
          }
        />
      ))}
    </>
  );
}
