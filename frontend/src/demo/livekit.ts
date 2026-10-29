// Stand-in for livekit-client in `npm run demo` (see vite.config.ts). It only
// covers what Voice.tsx, MediaPlayback.tsx and MicrophoneGain.ts use.
import {
  gameFeed,
  identityOf,
  myIdentity,
  onWorldChange,
  world,
  type Friend,
} from "./world";

export const RoomEvent = {
  ParticipantConnected: "participantConnected",
  ParticipantDisconnected: "participantDisconnected",
  TrackSubscribed: "trackSubscribed",
  TrackUnsubscribed: "trackUnsubscribed",
  ActiveSpeakersChanged: "activeSpeakersChanged",
  LocalTrackPublished: "localTrackPublished",
  LocalTrackUnpublished: "localTrackUnpublished",
  TrackMuted: "trackMuted",
  TrackUnmuted: "trackUnmuted",
  Reconnecting: "reconnecting",
  Reconnected: "reconnected",
  Disconnected: "disconnected",
} as const;

export const Track = {
  Kind: { Audio: "audio", Video: "video" },
  Source: {
    Microphone: "microphone",
    ScreenShare: "screen_share",
    ScreenShareAudio: "screen_share_audio",
  },
} as const;

let sids = 0;
class DemoTrack {
  sid = "TR_demo" + ++sids;
  private ended: (() => void)[] = [];
  constructor(
    readonly kind: string,
    readonly mediaStreamTrack?: MediaStreamTrack,
  ) {
    mediaStreamTrack?.addEventListener("ended", () =>
      this.ended.forEach((f) => f()),
    );
  }
  attach(el: HTMLMediaElement) {
    if (this.mediaStreamTrack)
      el.srcObject = new MediaStream([this.mediaStreamTrack]);
    return el;
  }
  detach(el?: HTMLMediaElement) {
    if (el) el.srcObject = null;
    return el ? [el] : [];
  }
  setVolume() {}
  async setProcessor() {}
  async applyConstraints() {}
  stop() {
    this.mediaStreamTrack?.stop();
  }
  on(event: string, listener: () => void) {
    if (event === "ended") this.ended.push(listener);
    return this;
  }
}

type Publication = { source: string; track?: DemoTrack };
class DemoParticipant {
  isSpeaking = false;
  isMicrophoneEnabled = true;
  trackPublications = new Map<string, Publication>();
  audioTrackPublications = new Map<string, Publication>();
  constructor(
    readonly identity: string,
    readonly name: string,
  ) {}
  getTrackPublication(source: string) {
    return [...this.trackPublications.values()].find(
      (p) => p.source === source,
    );
  }
}

class LocalParticipant extends DemoParticipant {
  permissions = { canPublishSources: [1, 2, 3, 4] };
  constructor(
    name: string,
    private room: Room,
  ) {
    super(myIdentity, name);
    this.isMicrophoneEnabled = false;
  }
  async createTracks() {
    return [new DemoTrack("audio")];
  }
  async publishTrack(track: DemoTrack, options: { source: string }) {
    this.trackPublications.set(track.sid, { source: options.source, track });
    if (options.source === Track.Source.Microphone)
      this.isMicrophoneEnabled = true;
    this.room.emit(RoomEvent.LocalTrackPublished);
  }
  async unpublishTrack(track: DemoTrack) {
    this.trackPublications.delete(track.sid);
    this.room.emit(RoomEvent.LocalTrackUnpublished);
  }
  async setMicrophoneEnabled(enabled: boolean) {
    this.isMicrophoneEnabled = enabled;
    this.room.emit(enabled ? RoomEvent.TrackUnmuted : RoomEvent.TrackMuted);
  }
}

export class Room {
  static async getLocalDevices() {
    return [
      {
        deviceId: "default",
        kind: "audioinput",
        label: "Microfone de demonstração",
      },
    ] as MediaDeviceInfo[];
  }
  localParticipant: LocalParticipant;
  remoteParticipants = new Map<string, DemoParticipant>();
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private stops: (() => void)[] = [];
  constructor(readonly options: { audioCaptureDefaults?: object }) {
    this.localParticipant = new LocalParticipant(
      world.me?.displayName ?? "você",
      this,
    );
  }
  on(event: string, listener: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
  async connect() {
    await new Promise((resolve) => setTimeout(resolve, 400));
    world.inCall = true;
    this.sync(false);
    this.stops.push(onWorldChange(() => this.sync(true)));
    // Unmuted friends take turns talking.
    const talk = setInterval(() => {
      for (const p of this.remoteParticipants.values())
        p.isSpeaking = p.isMicrophoneEnabled && Math.random() < 0.35;
      this.localParticipant.isSpeaking =
        this.localParticipant.isMicrophoneEnabled && Math.random() < 0.2;
      this.emit(RoomEvent.ActiveSpeakersChanged);
    }, 900);
    this.stops.push(() => clearInterval(talk));
  }
  async startAudio() {}
  async switchActiveDevice() {
    return true;
  }
  async disconnect() {
    this.stops.forEach((stop) => stop());
    this.stops = [];
    world.inCall = false;
    this.emit(RoomEvent.Disconnected);
  }
  // Mirrors the simulated world: who is in the call and who transmits.
  private sync(announce: boolean) {
    const present = new Set<string>();
    for (const friend of world.friends.filter((f) => f.inCall)) {
      const identity = identityOf(friend.id);
      present.add(identity);
      let p = this.remoteParticipants.get(identity);
      if (!p) {
        p = this.participant(friend);
        this.remoteParticipants.set(identity, p);
        if (announce) this.emit(RoomEvent.ParticipantConnected, p);
      }
      const screen = p.getTrackPublication(Track.Source.ScreenShare);
      if (world.leases.includes(identity) && !screen) {
        const video = new DemoTrack("video", gameFeed().getVideoTracks()[0]);
        p.trackPublications.set(video.sid, {
          source: Track.Source.ScreenShare,
          track: video,
        });
        this.emit(RoomEvent.TrackSubscribed);
      } else if (!world.leases.includes(identity) && screen?.track) {
        p.trackPublications.delete(screen.track.sid);
        this.emit(RoomEvent.TrackUnsubscribed);
      }
    }
    for (const [identity, p] of this.remoteParticipants)
      if (!present.has(identity)) {
        this.remoteParticipants.delete(identity);
        this.emit(RoomEvent.ParticipantDisconnected, p);
      }
  }
  private participant(friend: Friend) {
    const p = new DemoParticipant(identityOf(friend.id), friend.name);
    p.isMicrophoneEnabled = !friend.micMuted;
    const voice = new DemoTrack("audio");
    const publication = { source: Track.Source.Microphone, track: voice };
    p.trackPublications.set(voice.sid, publication);
    p.audioTrackPublications.set(voice.sid, publication);
    return p;
  }
}

// Your real screen still works: capture stays local to this tab.
export async function createLocalScreenTracks() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  return stream.getTracks().map((t) => new DemoTrack(t.kind, t));
}
