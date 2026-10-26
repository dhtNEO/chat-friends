import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type RemoteAudioTrack, type Track } from "livekit-client";

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
  volume,
  deaf,
  onVolume,
  onError,
}: {
  track: Track;
  name: string;
  local: boolean;
  volume: number;
  deaf: boolean;
  onVolume: (volume: number) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLDivElement>(null);
  const previousVolume = useRef(volume || 100);
  const [expanded, setExpanded] = useState(false),
    [full, setFull] = useState(false);
  const [resolution, setResolution] = useState("");
  useEffect(() => {
    const el = video.current!;
    track.attach(el);
    const update = () =>
      setResolution(
        el.videoWidth ? `${el.videoWidth} × ${el.videoHeight}` : "",
      );
    el.addEventListener("resize", update);
    update();
    return () => {
      el.removeEventListener("resize", update);
      track.detach(el);
    };
  }, [track]);
  useEffect(() => {
    const update = () =>
      setFull(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const host = document.getElementById("screen-stage");
  const content = (
    <div
      className={"screen " + (expanded ? "screen-expanded" : "")}
      ref={container}
      aria-label="Transmissão"
    >
      <header className="screen-heading">
        <strong>
          Tela de {name}
          {local ? " · sua prévia" : ""}
        </strong>
        <span>{resolution}</span>
      </header>
      <video ref={video} autoPlay playsInline muted />
      <div className="screen-toolbar">
        {!local && (
          <>
            <button
              aria-pressed={volume === 0}
              onClick={() => {
                if (volume) previousVolume.current = volume;
                onVolume(volume ? 0 : previousVolume.current);
              }}
            >
              {volume === 0 ? "Ouvir transmissão" : "Silenciar transmissão"}
            </button>
            <label className="stream-volume">
              Volume da transmissão{" "}
              <span className="volume-value" aria-hidden="true">
                {volume}%
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => onVolume(+e.target.value)}
              />
            </label>
            {deaf && <span className="audio-badge">Recepção silenciada</span>}
          </>
        )}
        <button aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Compactar" : "Expandir"}
        </button>
        <button
          onClick={() => {
            const action = full
              ? document.exitFullscreen()
              : container.current?.requestFullscreen();
            void action?.catch(() =>
              onError("Não foi possível abrir a tela cheia neste navegador."),
            );
          }}
        >
          {full ? "Sair da tela cheia" : "Tela cheia"}
        </button>
      </div>
    </div>
  );
  return host ? createPortal(content, host) : content;
}
