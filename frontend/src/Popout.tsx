import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Track } from "livekit-client";
import { Icon } from "./Icon";

// The transmission in its own browser window, e.g. on a second monitor. It
// reuses the call's video track: no second media connection, and the sound
// keeps playing in the main window with the usual volume controls.
export function usePopout(onError: (message: string) => void) {
  const [win, setWin] = useState<Window | null>(null);
  const open = useCallback(() => {
    const w = window.open(
      "",
      "entre-amigos-transmissao",
      "popup,width=1280,height=760",
    );
    if (!w) {
      onError("O navegador bloqueou a janela. Permita pop-ups para este site.");
      return;
    }
    w.document.title = "Transmissão · Entre amigos";
    // Same-origin stylesheets only, so the page CSP still applies.
    w.document.head.replaceChildren(
      ...[...document.querySelectorAll('link[rel="stylesheet"], style')].map(
        (node) => w.document.importNode(node, true),
      ),
    );
    w.document.body.replaceChildren();
    w.document.body.className = "popout-body";
    setWin(w);
    w.focus();
  }, [onError]);
  useEffect(() => {
    if (!win) return;
    const closed = setInterval(() => win.closed && setWin(null), 500);
    const leave = () => win.close();
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(closed);
      window.removeEventListener("pagehide", leave);
    };
  }, [win]);
  // Logging out unmounts the call; take the window with it.
  const current = useRef(win);
  current.current = win;
  useEffect(() => () => current.current?.close(), []);
  const close = useCallback(() => {
    win?.close();
    setWin(null);
  }, [win]);
  return { win, open, close };
}

// React events do not cross documents, so the window gets its own root.
export function PopoutStage({
  win,
  track,
  name,
  onClose,
}: {
  win: Window;
  track: Track | null;
  name: string;
  onClose: () => void;
}) {
  const root = useRef<Root | null>(null);
  useEffect(() => {
    const container = win.document.createElement("div");
    container.className = "popout";
    win.document.body.append(container);
    root.current = createRoot(container);
    return () => {
      const r = root.current;
      root.current = null;
      // Unmount after the current render completes.
      setTimeout(() => r?.unmount());
      container.remove();
    };
  }, [win]);
  useEffect(() => {
    win.document.title = track
      ? `Tela de ${name} · Entre amigos`
      : "Transmissão · Entre amigos";
    root.current?.render(
      <PopoutView win={win} track={track} name={name} onClose={onClose} />,
    );
  });
  return null;
}

function PopoutView({
  win,
  track,
  name,
  onClose,
}: {
  win: Window;
  track: Track | null;
  name: string;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el || !track) return;
    track.attach(el);
    const resume = () => void el.play().catch(() => {});
    el.addEventListener("pause", resume);
    return () => {
      el.removeEventListener("pause", resume);
      track.detach(el);
    };
  }, [track]);
  const full = () => {
    const d = win.document;
    void (
      d.fullscreenElement
        ? d.exitFullscreen()
        : d.documentElement.requestFullscreen()
    ).catch(() => {});
  };
  return (
    <>
      {track ? (
        <video ref={video} autoPlay playsInline muted onDoubleClick={full} />
      ) : (
        <div className="popout-empty">
          <Icon name="screen" size={40} />
          <p>Ninguém está transmitindo agora.</p>
        </div>
      )}
      <header className="popout-bar">
        {track && <span className="live-badge">AO VIVO</span>}
        <strong>{track ? `Tela de ${name}` : "Transmissão"}</strong>
        <button
          className="icon-button"
          aria-label="Tela cheia"
          title="Tela cheia (ou duplo clique)"
          onClick={full}
        >
          <Icon name="fullscreen" />
        </button>
        <button
          className="icon-button"
          aria-label="Trazer de volta"
          title="Trazer de volta"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
    </>
  );
}
