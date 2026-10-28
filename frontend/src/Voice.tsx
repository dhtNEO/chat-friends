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
  type AudioCaptureOptions,
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
import {
  RoomLayout,
  orderedItems,
  usePointerOrder,
  useRoomLayout,
} from "./RoomLayout";
import { useSpeaking } from "./speaking";
import { publishVoice } from "./voiceStore";
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
// Signaling goes through the page's own host: its proxy also routes /rtc
// through media admission. A separate media host under duckdns.org counts as
// a third-party WebSocket, which EasyPrivacy (uBlock Origin, Brave) blocks.
const signalUrl = () =>
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
function mediaError(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  if (typeof RTCPeerConnection === "undefined")
    return "WebRTC está desativado neste navegador (por exemplo, AdGuard “Bloquear WebRTC”). Libere este site para usar a voz.";
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
  onMaximize: () => void;
  onError: (s: string) => void;
}) {
  const [settings, setSettings] = useAudioSettings(userId);
  const roomLayout = useRoomLayout(userId);
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
  const [cardNotice, setCardNotice] = useState("");
  const room = useRef<Room | null>(null),
    connection = useRef<Connection | null>(null),
    lease = useRef<Lease | null>(null),
    screenTracks = useRef<LocalTrack[]>([]);
  // The SDK does not own an AudioContext supplied through webAudioMix.
  // Keep ownership per room so an old disconnect cannot close a new call.
  const roomAudio = useRef(new WeakMap<Room, AudioContext>());
  // Unpublished tracks are not tracked or stopped by Room.disconnect yet.
  const pendingMicrophones = useRef(
    new WeakMap<
      Room,
      Set<{ tracks: LocalTrack[]; processor: MicrophoneGain }>
    >(),
  );
  const lifecycle = useRef({ mounted: true, generation: 0, joining: false });
  async function closeRoomAudio(r: Room) {
    const context = roomAudio.current.get(r);
    roomAudio.current.delete(r);
    if (context && context.state !== "closed")
      await context.close().catch(() => {});
  }
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
  const noiseSupported =
    navigator.mediaDevices?.getSupportedConstraints().noiseSuppression === true;
  const bump = () => setVersion((x) => x + 1);
  async function release() {
    const r = room.current,
      c = connection.current,
      l = lease.current,
      tracks = screenTracks.current;
    lease.current = null;
    screenTracks.current = [];
    setSharing(false);
    // Stop every capture synchronously; unpublishing may complete later.
    for (const t of tracks) t.stop();
    await Promise.allSettled(
      tracks.map((t) => r?.localParticipant.unpublishTrack(t)),
    );
    if (c && l)
      await api("/media/screen", "DELETE", {
        identity: c.identity,
        leaseId: l.leaseId,
      });
  }
  async function leave(message = "Fora da chamada") {
    lifecycle.current.generation++;
    lifecycle.current.joining = false;
    const r = room.current,
      c = connection.current;
    if (r) {
      const pending = pendingMicrophones.current.get(r);
      pendingMicrophones.current.delete(r);
      for (const job of pending ?? []) {
        for (const track of job.tracks) track.stop();
        // setProcessor assigns its processor only after init resolves, so
        // stopping the raw track alone cannot cancel a pending RNNoise init.
        void job.processor.destroy().catch(() => {});
      }
      r.localParticipant
        .getTrackPublication(Track.Source.Microphone)
        ?.track?.stop();
    }
    if (sound.current.inCall) effect("leave");
    sound.current.inCall = false;
    const released = release();
    // Detach before awaiting anything: callbacks belong to the old call.
    room.current = null;
    connection.current = null;
    micProcessor.current = null;
    setJoined(false);
    setMic(false);
    setBusy(false);
    setStatus(message);
    const disconnected = r?.disconnect();
    // Local capture/processing must not wait for signaling to finish closing.
    const audioClosed = r ? closeRoomAudio(r) : undefined;
    await Promise.allSettled([released, disconnected, audioClosed]);
    if (c) await api("/media/leave", "POST", { identity: c.identity });
  }
  useEffect(() => {
    let alive = true;
    lifecycle.current.mounted = true;
    const poll = async () => {
      try {
        const value = await api<typeof state>("/media/state");
        if (alive) setState(value);
      } catch {
        /* chat remains available during media outage */
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    const heartbeat = setInterval(() => {
      const c = connection.current,
        l = lease.current;
      if (c)
        void api("/media/heartbeat", "POST", { identity: c.identity }).catch(
          (e) => {
            if (connection.current !== c) return;
            onError(mediaError(e));
            void leave().catch(() => {});
          },
        );
      if (c && l)
        void api("/media/screen/heartbeat", "POST", {
          identity: c.identity,
          leaseId: l.leaseId,
        }).catch((e) => {
          if (connection.current !== c || lease.current !== l) return;
          onError(mediaError(e));
          void release().catch(() => {});
        });
    }, 10000);
    return () => {
      alive = false;
      lifecycle.current.mounted = false;
      clearInterval(timer);
      clearInterval(heartbeat);
      void leave().catch(() => {});
    };
    // A single room lifecycle is owned by this component.
  }, []);
  async function join() {
    if (!lifecycle.current.mounted || lifecycle.current.joining || room.current)
      return;
    lifecycle.current.joining = true;
    const generation = ++lifecycle.current.generation;
    const current = () =>
      lifecycle.current.mounted && lifecycle.current.generation === generation;
    let audioContext: AudioContext | undefined;
    let joiningRoom: Room | undefined;
    setBusy(true);
    setStatus("Conectando à voz…");
    try {
      const c = await api<Connection>("/media/join", "POST");
      if (!current()) {
        await api("/media/leave", "POST", { identity: c.identity }).catch(
          () => {},
        );
        return;
      }
      connection.current = c;
      audioContext = new AudioContext({
        sampleRate: 48000,
        latencyHint: "interactive",
      });
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        // RNNoise needs 48 kHz; the whole call mix runs at that rate.
        webAudioMix: { audioContext },
        audioCaptureDefaults: {
          deviceId: device,
          noiseSuppression: settings.noise && settings.noiseMode === "browser",
          echoCancellation: true,
          autoGainControl: false,
        },
      });
      joiningRoom = r;
      roomAudio.current.set(r, audioContext);
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
        r.on(event, () => {
          if (room.current === r) bump();
        });
      r.on(RoomEvent.ParticipantConnected, (p) => {
        if (room.current === r && p.identity !== MUSIC_IDENTITY)
          effect("join", true);
      });
      r.on(RoomEvent.ParticipantDisconnected, (p) => {
        if (room.current === r && p.identity !== MUSIC_IDENTITY)
          effect("leave", true);
      });
      r.on(RoomEvent.Reconnecting, () => {
        if (room.current === r) setStatus("Reconectando à voz…");
      });
      r.on(RoomEvent.Reconnected, () => {
        if (room.current !== r) return;
        setStatus("Voz conectada");
        if (lease.current) void release().catch((e) => onError(mediaError(e)));
      });
      r.on(RoomEvent.Disconnected, () => {
        if (room.current !== r) return;
        void leave("Conexão de voz encerrada").catch(() => {});
      });
      await r.connect(signalUrl(), c.token);
      if (!current()) return;
      await r.startAudio();
      if (!current()) return;
      await api("/media/audio", "PUT", { identity: c.identity, deaf });
      if (!current()) return;
      setJoined(true);
      setStatus("Voz conectada");
      sound.current.inCall = true;
      effect("join");
      try {
        await enableMicrophone(r);
        if (!current()) return;
        setMic(true);
        const inputs = await Room.getLocalDevices("audioinput");
        if (current()) setDevices(inputs);
      } catch (e) {
        if (current()) onError(mediaError(e));
      }
    } catch (e) {
      if (current()) {
        onError(mediaError(e));
        await leave().catch(() => {});
      }
    } finally {
      if (!current()) {
        // connect/startAudio may finish after leave or logout already ran.
        if (joiningRoom) {
          await joiningRoom.disconnect().catch(() => {});
          await closeRoomAudio(joiningRoom);
        } else if (audioContext && audioContext.state !== "closed")
          await audioContext.close().catch(() => {});
      }
      if (lifecycle.current.generation === generation) {
        lifecycle.current.joining = false;
        setBusy(false);
      }
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
        noiseSuppression: settings.noise && settings.noiseMode === "browser",
        echoCancellation: true,
        autoGainControl: false,
      },
    });
    if (room.current !== r) {
      tracks.forEach((item) => item.stop());
      return;
    }
    const track = tracks[0] as LocalAudioTrack;
    const processor = new MicrophoneGain(
      settings.microphone,
      settings.noise && settings.noiseMode === "strong",
    );
    const job = { tracks, processor };
    let pending = pendingMicrophones.current.get(r);
    if (!pending) {
      pending = new Set();
      pendingMicrophones.current.set(r, pending);
    }
    pending.add(job);
    try {
      micProcessor.current = processor;
      await track.setProcessor(processor);
      if (room.current !== r) {
        tracks.forEach((item) => item.stop());
        return;
      }
      await r.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
      });
    } catch (error) {
      tracks.forEach((item) => item.stop());
      void processor.destroy().catch(() => {});
      throw error;
    } finally {
      pending.delete(job);
      if (!pending.size && pendingMicrophones.current.get(r) === pending)
        pendingMicrophones.current.delete(r);
    }
  }
  // Silencing what you hear also closes your microphone, like Discord;
  // hearing again restores the microphone as it was before.
  const micBeforeDeaf = useRef(false);
  async function setMicOpen(r: Room, open: boolean) {
    if (open) await enableMicrophone(r);
    else await r.localParticipant.setMicrophoneEnabled(false);
    if (room.current === r) setMic(r.localParticipant.isMicrophoneEnabled);
  }
  async function setDeafened(next: boolean) {
    const c = connection.current;
    if (!c) return;
    // Apply locally at once; publish the display state independently of playback.
    setDeaf(next);
    sound.current.deaf = next;
    await api("/media/audio", "PUT", { identity: c.identity, deaf: next });
  }
  async function toggleMic() {
    const r = room.current;
    if (!r) return;
    setAudioBusy(true);
    try {
      const open = !r.localParticipant.isMicrophoneEnabled;
      await setMicOpen(r, open);
      // Talking means wanting to hear the answer.
      if (open && sound.current.deaf) await setDeafened(false);
      effect(open ? "unmute" : "mute");
      setDevices(await Room.getLocalDevices("audioinput"));
    } catch (e) {
      onError(mediaError(e));
    } finally {
      setAudioBusy(false);
    }
  }
  async function toggleDeaf() {
    const r = room.current;
    if (!r || !connection.current) return;
    setAudioBusy(true);
    const next = !sound.current.deaf;
    effect(next ? "mute" : "unmute");
    try {
      if (next) {
        micBeforeDeaf.current = r.localParticipant.isMicrophoneEnabled;
        if (micBeforeDeaf.current) await setMicOpen(r, false);
      } else if (micBeforeDeaf.current) await setMicOpen(r, true);
      await setDeafened(next);
    } catch (e) {
      onError(mediaError(e));
    } finally {
      setAudioBusy(false);
    }
  }
  // Held key opens the microphone; release (or losing focus) closes it.
  const pttOpen = useRef(false);
  async function pushToTalk(down: boolean) {
    const r = room.current;
    if (!r || down === pttOpen.current) return;
    pttOpen.current = down;
    if (down && sound.current.deaf) return;
    try {
      await setMicOpen(r, down);
    } catch (e) {
      onError(mediaError(e));
    }
  }
  const streamBeforeMute = useRef(100);
  function changeDevice(id: string) {
    setDevice(id);
    void room.current
      ?.switchActiveDevice("audioinput", id)
      .catch((err) => onError(mediaError(err)));
  }
  // Strong suppression (RNNoise) runs inside our microphone processor; the
  // browser's own filter is then turned off so they do not fight.
  async function changeNoiseMode(mode: "strong" | "browser") {
    setSettings((old) => ({ ...old, noiseMode: mode }));
    await applyNoise(settings.noise, mode);
  }
  async function applyNoise(on: boolean, mode: "strong" | "browser") {
    const track = room.current?.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    )?.track as LocalAudioTrack | undefined;
    await micProcessor.current?.setDenoise(on && mode === "strong");
    await track?.applyConstraints({
      noiseSuppression: on && mode === "browser",
      echoCancellation: true,
      autoGainControl: false,
    });
  }
  async function changeNoise(next: boolean) {
    const previous = settings.noise;
    setSettings((old) => ({ ...old, noise: next }));
    setAudioBusy(true);
    try {
      await applyNoise(next, settings.noiseMode);
      if (room.current)
        room.current.options.audioCaptureDefaults = {
          ...room.current.options.audioCaptureDefaults,
          noiseSuppression: next && settings.noiseMode === "browser",
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
    const { height, fps, bitrate } = limits(quality, c);
    const tracks = await createLocalScreenTracks({
      // Games hide the pointer themselves; the capture would draw it back.
      video: (settings.hideCursor ? { cursor: "never" } : true) as true,
      // System audio would also capture the call playing on this PC, so
      // everyone would hear themselves; exclude this page's own sound.
      audio: {
        restrictOwnAudio: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as AudioCaptureOptions,
      contentHint: fps >= 60 ? "motion" : undefined,
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
          // Keep frame rate for games when the link gets tight.
          degradationPreference: fps >= 60 ? "maintain-framerate" : "balanced",
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
  function limits(q: string, c: Connection) {
    const preset = PRESETS[q] ?? PRESETS.normal;
    return {
      height: Math.min(c.screen.height, preset.height),
      fps: Math.min(c.screen.fps, preset.fps),
      bitrate: Math.min(c.screen.bitrate, preset.bitrate),
    };
  }
  // Changing quality mid-stream adjusts the capture and the encoder in place,
  // without asking for the screen again.
  async function changeQuality(next: string) {
    setQuality(next);
    const c = connection.current,
      video = screenTracks.current.find((t) => t.kind === Track.Kind.Video);
    if (!sharing || !c || !video) return;
    const { height, fps, bitrate } = limits(next, c);
    try {
      await video.mediaStreamTrack.applyConstraints({
        width: { ideal: Math.round((height * 16) / 9) },
        height: { ideal: height },
        frameRate: fps,
      });
      const sender = video.sender;
      if (sender) {
        const params = sender.getParameters();
        for (const encoding of params.encodings ?? []) {
          encoding.maxBitrate = bitrate;
          encoding.maxFramerate = fps;
        }
        await sender.setParameters(params);
      }
    } catch (e) {
      onError(mediaError(e));
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
  const voices = participants.flatMap((p) => {
    const track = p.getTrackPublication(Track.Source.Microphone)?.track
      ?.mediaStreamTrack;
    return track && p.identity !== MUSIC_IDENTITY
      ? [{ identity: p.identity, track }]
      : [];
  });
  const talking = useSpeaking(voices, joined);
  // Identities are "accountId:connection"; names and photos follow profiles.
  const account = (identity: string) =>
    directory.byId.get(identity.split(":")[0]);
  const memberOccurrences = new Map<string, number>();
  const people = (
    joined
      ? participants
          .filter((p) => p.identity !== MUSIC_IDENTITY)
          .map((p) => ({
            identity: p.identity,
            name: p.name || "Amigo",
            speaking: talking.has(p.identity) || p.isSpeaking,
            micMuted: !p.isMicrophoneEnabled,
            deaf:
              p === room.current?.localParticipant
                ? deaf
                : (state.participants.find(
                    (person) => person.identity === p.identity,
                  )?.deaf ?? false),
          }))
      : state.participants.map((p) => ({ ...p, speaking: false }))
  ).map((p) => {
    const member = p.identity.split(":")[0];
    const occurrence = memberOccurrences.get(member) ?? 0;
    memberOccurrences.set(member, occurrence + 1);
    return {
      ...p,
      layoutKey: occurrence ? `${member}:${occurrence}` : member,
      name: account(p.identity)?.displayName ?? p.name,
      src: avatarSrc(account(p.identity)),
    };
  });
  const cardIds = orderedItems(
    people.map((p) => p.layoutKey),
    roomLayout.layout.cards,
  );
  const cardDrag = usePointerOrder(
    ".person.tile",
    ".tiles",
    cardIds,
    (from, to) => {
      roomLayout.reorderCards(
        people.map((p) => p.layoutKey),
        from,
        to,
      );
      if (from !== to)
        setCardNotice(
          `${people.find((p) => p.layoutKey === from)?.name ?? "Participante"} mudou para a posição ${cardIds.indexOf(to) + 1}.`,
        );
    },
  );
  // Our own state is exact; others' comes from tracks or the polled lease.
  const isLive = (identity: string) =>
    identity === self
      ? sharing
      : live.some((t) => t.identity === identity) ||
        state.lease.identity === identity;
  const personVolume = (identity: string) =>
    settings.people[identity.split(":")[0]] ?? 100;
  useEffect(() => {
    publishVoice({
      joined,
      mic,
      deaf,
      sharing,
      audioBusy,
      devices,
      device,
      noiseSupported,
      toggleMic,
      toggleDeaf,
      pushToTalk,
      leave,
      toggleStreamSound: () =>
        setSettings((old) => {
          if (old.stream) streamBeforeMute.current = old.stream;
          return { ...old, stream: old.stream ? 0 : streamBeforeMute.current };
        }),
      setDevice: changeDevice,
      setNoise: changeNoise,
      setNoiseMode: changeNoiseMode,
      setMicVolume: (value) => {
        micProcessor.current?.setVolume(value);
        setSettings((old) => ({ ...old, microphone: value }));
      },
    });
  });
  useEffect(() => () => publishVoice(null), []);
  const fullHd = (connection.current?.screen.height ?? 1080) >= 1080,
    sixty = (connection.current?.screen.fps ?? 60) >= 60;
  const featuredName = featured
    ? (account(featured.identity)?.displayName ?? featured.name)
    : "";
  const screenContent = (
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
  );
  const peopleContent =
    people.length > 0 ? (
      <div className="tiles" role="list" aria-label="Cards dos participantes">
        <span className="sr-only" role="status" aria-live="polite">
          {cardNotice}
        </span>
        {people.map((p) => (
          <div
            key={p.identity}
            className={
              "person tile" +
              (p.speaking && !p.micMuted ? " speaking" : "") +
              (isLive(p.identity) ? " live" : "") +
              (featured?.identity === p.identity ? " featured" : "") +
              (adjusting === p.identity ? " adjusting" : "") +
              (cardDrag.dragging === p.layoutKey ? " is-dragging" : "") +
              (cardDrag.over === p.layoutKey &&
              cardDrag.dragging !== p.layoutKey
                ? " is-drop-target"
                : "")
            }
            data-reorder-id={p.layoutKey}
            role="listitem"
            aria-posinset={cardIds.indexOf(p.layoutKey) + 1}
            aria-setsize={cardIds.length}
            style={{ order: cardIds.indexOf(p.layoutKey) }}
            onClick={() => {
              if (isLive(p.identity)) setFocus(p.identity);
              // Touch screens have no hover: a tap reveals the volume.
              setAdjusting(adjusting === p.identity ? null : p.identity);
            }}
          >
            <button
              className="person-grip"
              aria-label={`Reordenar ${p.name}`}
              title="Arraste ou use as setas para mudar a ordem"
              {...cardDrag.bind(p.layoutKey)}
            >
              ⠿
            </button>
            <span className="tile-avatar">
              <Avatar
                name={p.name}
                src={p.src}
                size={Math.round(
                  Math.min(84, Math.max(36, roomLayout.layout.cardSize * 0.34)),
                )}
                speaking={p.speaking && !p.micMuted}
              />
              <StatusBadges micMuted={p.micMuted} deaf={p.deaf} />
            </span>
            {isLive(p.identity) && <span className="live-badge">AO VIVO</span>}
            {joined && p.identity !== self && (
              <button
                className="tile-volume-toggle"
                aria-label={`Ajustar volume de ${p.name}`}
                aria-expanded={adjusting === p.identity}
                title={`Volume de ${p.name}: ${personVolume(p.identity)}%`}
                onClick={(e) => {
                  e.stopPropagation();
                  setAdjusting(adjusting === p.identity ? null : p.identity);
                }}
              >
                <Icon
                  name={personVolume(p.identity) ? "volume" : "volumeOff"}
                  size={14}
                />
              </button>
            )}
            <div className="tile-footer">
              <strong>
                {p.name}
                {p.identity === self ? " (você)" : ""}
              </strong>
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
    ) : (
      <p className="room-empty-people">
        Os cards aparecem aqui quando seus amigos entram na voz.
      </p>
    );
  const musicContent = (
    <Music
      identity={joined ? self : undefined}
      volume={settings.music}
      onVolume={(music) => setSettings((old) => ({ ...old, music }))}
    />
  );
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
      <RoomLayout
        controller={roomLayout}
        expanded={maximized}
        onRestoreExpanded={onMaximize}
        content={{
          screen: screenContent,
          people: peopleContent,
          music: musicContent,
        }}
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
                    onChange={(e) => changeDevice(e.target.value)}
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
                    disabled={
                      audioBusy ||
                      (settings.noiseMode === "browser" && !noiseSupported)
                    }
                    onChange={(e) => void changeNoise(e.target.checked)}
                  />{" "}
                  Supressão de ruído
                </label>
                <label>
                  Tipo de supressão
                  <select
                    value={settings.noiseMode}
                    disabled={audioBusy}
                    onChange={(e) =>
                      void changeNoiseMode(
                        e.target.value as "strong" | "browser",
                      )
                    }
                  >
                    <option value="strong">
                      Forte (RNNoise, no seu navegador)
                    </option>
                    <option value="browser">Leve (do navegador)</option>
                  </select>
                </label>
                {settings.noiseMode === "browser" && !noiseSupported && (
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
                    onChange={(e) => void changeQuality(e.target.value)}
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
                <label className="noise-toggle">
                  <input
                    type="checkbox"
                    checked={settings.hideCursor}
                    onChange={(e) =>
                      setSettings((old) => ({
                        ...old,
                        hideCursor: e.target.checked,
                      }))
                    }
                  />{" "}
                  Esconder o cursor do mouse
                </label>
                <small>
                  Vale a partir da próxima transmissão. A qualidade muda na
                  hora, sem parar de transmitir.
                </small>
                <small>
                  Áudio da tela depende do navegador e sistema. O som desta
                  página (a chamada) fica de fora quando o navegador permite.
                </small>
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
            <Avatar
              name={p.name}
              src={p.src}
              size={22}
              speaking={p.speaking && !p.micMuted}
            />
            <span className="roster-name">{p.name}</span>
            {isLive(p.identity) && (
              <span className="live-badge small">AO VIVO</span>
            )}
            <StatusBadges micMuted={p.micMuted} deaf={p.deaf} inline />
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

// Red badges, like Discord: crossed microphone and crossed headphones.
function StatusBadges({
  micMuted,
  deaf,
  inline = false,
}: {
  micMuted: boolean;
  deaf: boolean;
  inline?: boolean;
}) {
  if (!micMuted && !deaf) return null;
  return (
    <span className={"status-badges" + (inline ? " inline" : "")}>
      {micMuted && (
        <span className="status-badge" title="Microfone desligado">
          <Icon name="micOff" size={12} />
        </span>
      )}
      {deaf && (
        <span className="status-badge" title="Áudio silenciado">
          <Icon name="headphonesOff" size={12} />
        </span>
      )}
    </span>
  );
}
