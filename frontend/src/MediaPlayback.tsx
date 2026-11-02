import { useEffect, useRef, useState } from "react";
import { type RemoteAudioTrack, type Track } from "livekit-client";
import { Icon } from "./Icon";
import { Avatar } from "./ui";

export function AudioTrack({
  track,
  volume,
  source,
  identity,
}: {
  track: RemoteAudioTrack;
  volume: number;
  source: string;
  identity: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current!;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  // webAudioMix owns playback. Muting only the HTML element does NOT mute its graph.
  useEffect(() => {
    track.setVolume(volume);
    // Some browsers ignore volume on media elements (iOS); muting always works.
    // With Web Audio mixing LiveKit keeps the element at volume 0 and muted
    // (sound goes through its gain node), so only unmute a playing element.
    const el = ref.current;
    if (el) el.muted = volume === 0 || el.volume === 0;
  }, [track, volume]);
  return (
    <audio
      ref={ref}
      autoPlay
      data-source={source}
      data-identity={identity}
      data-volume={volume}
    />
  );
}

export function Screen({
  track,
  name,
  local,
  avatar,
  viewers,
  volume,
  expanded,
  onExpand,
  onVolume,
  onError,
}: {
  track: Track;
  name: string;
  local: boolean;
  avatar?: string;
  viewers: number;
  volume: number;
  // Expanding maximizes the dock panel, leaving browser fullscreen separate.
  expanded: boolean;
  onExpand: () => void;
  onVolume: (volume: number) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLDivElement>(null);
  const previousVolume = useRef(volume || 100);
  const [full, setFull] = useState(false);
  const [resolution, setResolution] = useState("");
  useEffect(() => {
    const el = video.current!;
    track.attach(el);
    const update = () =>
      setResolution(
        el.videoWidth ? `${el.videoWidth} × ${el.videoHeight}` : "",
      );
    // Dragging a dock panel re-inserts the video, which pauses it. It is
    // muted (sound plays elsewhere), so resuming needs no user gesture.
    const resume = () => {
      if (el.isConnected) void el.play().catch(() => {});
    };
    el.addEventListener("resize", update);
    el.addEventListener("pause", resume);
    update();
    return () => {
      el.removeEventListener("resize", update);
      el.removeEventListener("pause", resume);
      track.detach(el);
    };
  }, [track]);
  useEffect(() => {
    const element = container.current!;
    const update = () =>
      setFull(element.ownerDocument.fullscreenElement === element);
    element.addEventListener("fullscreenchange", update);
    return () => element.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleFull = () => {
    const element = container.current;
    const doc = element?.ownerDocument;
    const action =
      doc?.fullscreenElement === element
        ? doc?.exitFullscreen()
        : element?.requestFullscreen();
    void action?.catch(() =>
      onError("Não foi possível abrir a tela cheia neste navegador."),
    );
  };
  return (
    <div
      className={"screen " + (expanded ? "screen-expanded" : "")}
      ref={container}
      aria-label="Transmissão"
    >
      <video ref={video} autoPlay playsInline muted />
      <header className="screen-heading">
        <Avatar name={name} src={avatar} size={34} />
        <div className="screen-who">
          <strong>{name}</strong>
          <span>{local ? "Sua prévia · sem som" : "Transmitindo"}</span>
        </div>
        <span className="live-badge">AO VIVO</span>
        {resolution && (
          <span className="screen-chip optional">{resolution}</span>
        )}
        <span className="screen-chip" title="Assistindo">
          <Icon name="people" size={14} /> {viewers}
        </span>
        <span className="screen-actions">
          <button
            className="icon-button"
            aria-label={expanded ? "Compactar" : "Expandir"}
            title={expanded ? "Compactar" : "Expandir"}
            aria-pressed={expanded}
            onClick={onExpand}
          >
            <Icon name={expanded ? "collapse" : "expand"} />
          </button>
          <button
            className="icon-button"
            aria-label={full ? "Sair da tela cheia" : "Tela cheia"}
            title={full ? "Sair da tela cheia" : "Tela cheia"}
            onClick={toggleFull}
          >
            <Icon name="fullscreen" />
          </button>
        </span>
      </header>
      {!local && (
        <div className="screen-toolbar">
          <button
            className="icon-button"
            aria-label={
              volume === 0 ? "Ouvir transmissão" : "Silenciar transmissão"
            }
            title={volume === 0 ? "Ouvir transmissão" : "Silenciar transmissão"}
            aria-pressed={volume === 0}
            onClick={() => {
              if (volume) previousVolume.current = volume;
              onVolume(volume ? 0 : previousVolume.current);
            }}
          >
            <Icon name={volume === 0 ? "volumeOff" : "volume"} />
          </button>
          <label className="stream-volume">
            <span className="sr-only">Volume da transmissão</span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => onVolume(+e.target.value)}
            />
            <span className="volume-value" aria-hidden="true">
              {volume}%
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
