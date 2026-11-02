import { useCallback, useEffect, useRef, useState } from "react";

// Only the presentation moves documents. The call, audio and React portal
// remain owned by the main window, with one stable element for each medium.
export function usePopout(
  onError: (message: string) => void,
  kind: "stream" | "music" = "stream",
) {
  const [popup, setPopup] = useState<{ win: Window; host: HTMLElement } | null>(
    null,
  );
  const [windowName] = useState(
    () => "chat-friends-" + kind + "-" + crypto.randomUUID(),
  );
  const current = useRef(popup);
  current.current = popup;
  const open = useCallback(() => {
    if (current.current && !current.current.win.closed) {
      current.current.win.focus();
      return;
    }
    const win = window.open(
      "",
      windowName,
      kind === "stream"
        ? "popup,width=1280,height=760"
        : "popup,width=560,height=720",
    );
    if (!win) {
      onError("O navegador bloqueou a janela. Permita pop-ups para este site.");
      return;
    }
    win.document.title =
      (kind === "stream" ? "Transmissão" : "Bot de música") + " · VGH";
    win.document.head.replaceChildren(
      ...[...document.querySelectorAll('link[rel="stylesheet"], style')].map(
        (node) => win.document.importNode(node, true),
      ),
    );
    const syncTheme = () => {
      win.document.documentElement.style.cssText =
        document.documentElement.style.cssText;
    };
    syncTheme();
    win.document.body.className = "media-popout-body";
    const host = win.document.createElement("div");
    host.className = "media-popout-host";
    win.document.body.replaceChildren(host);
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    win.addEventListener("pagehide", () => observer.disconnect(), {
      once: true,
    });
    const next = { win, host };
    current.current = next;
    setPopup(next);
    win.focus();
  }, [kind, onError, windowName]);
  const close = useCallback(() => {
    const old = current.current;
    current.current = null;
    setPopup(null);
    old?.win.close();
  }, []);
  useEffect(() => {
    if (!popup) return;
    const closed = () => {
      if (current.current !== popup) return;
      current.current = null;
      setPopup(null);
    };
    popup.win.addEventListener("pagehide", closed);
    const timer = setInterval(() => popup.win.closed && closed(), 300);
    const leave = () => popup.win.close();
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      popup.win.removeEventListener("pagehide", closed);
      window.removeEventListener("pagehide", leave);
    };
  }, [popup]);
  useEffect(() => () => current.current?.win.close(), []);
  return { win: popup?.win ?? null, host: popup?.host ?? null, open, close };
}
