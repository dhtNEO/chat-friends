import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { usePopout } from "./Popout";

export type MediaPanel = "stream" | "music";

export function DetachedMedia({
  kind,
  home,
  dock,
  onSeparate,
  onReturn,
  onError,
  onDetachedChange,
  children,
}: {
  kind: MediaPanel;
  home: HTMLElement | null;
  dock: HTMLElement | null;
  onSeparate: () => void;
  onReturn: () => void;
  onError: (message: string) => void;
  onDetachedChange: (detached: boolean) => void;
  children: ReactNode;
}) {
  const popup = usePopout(onError, kind);
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.className = "media-content-host";
    element.dataset.mediaHost = kind;
    return element;
  });
  const parking = useRef<HTMLDivElement>(null);
  const label = kind === "stream" ? "transmissão" : "música";
  const title = kind === "stream" ? "Transmissão" : "Bot de música";
  const external = !!popup.host || !!dock;
  useLayoutEffect(() => {
    const target = popup.host ?? dock ?? home ?? parking.current;
    if (target && host.parentElement !== target) {
      target.appendChild(host);
      // Moving a media element between panels/documents can pause it.
      for (const video of host.querySelectorAll("video"))
        void video.play().catch(() => {});
    }
  }, [host, home, dock, popup.host]);
  useLayoutEffect(() => () => host.remove(), [host]);
  useLayoutEffect(() => {
    onDetachedChange(external);
  }, [external, onDetachedChange]);
  const bringHome = () => {
    popup.close();
    onReturn();
  };
  const placeholder = (
    <div className="media-away">
      <Icon
        name={popup.win ? "popout" : kind === "stream" ? "screen" : "music"}
        size={30}
      />
      <p>
        {title} em {popup.win ? "outra janela" : "um painel separado"}.
      </p>
      <button onClick={popup.win ? popup.open : onSeparate}>
        Mostrar {label}
      </button>
      <button onClick={bringHome}>Trazer {label} para a sala</button>
    </div>
  );
  return (
    <>
      <div hidden ref={parking} />
      {dock && popup.host && createPortal(placeholder, dock)}
      {createPortal(
        <section className="detached-media" aria-label={`Área de ${label}`}>
          <header className="media-panel-tools">
            <strong>{title}</strong>
            {!dock && !popup.win && (
              <button onClick={onSeparate}>
                <Icon name="split" size={15} /> Separar {label}
              </button>
            )}
            {!popup.win && (
              <button
                onClick={popup.open}
                aria-label={`Abrir ${label} em outra janela`}
              >
                <Icon name="popout" size={15} /> Outra janela
              </button>
            )}
            {external && (
              <button
                onClick={bringHome}
                aria-label={`Trazer ${label} para a sala`}
              >
                <Icon name="collapse" size={15} /> Trazer de volta
              </button>
            )}
          </header>
          <div className="media-panel-content">{children}</div>
        </section>,
        host,
      )}
    </>
  );
}
