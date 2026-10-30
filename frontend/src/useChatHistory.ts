import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Message } from "./api";

export const HISTORY_WINDOW = 200;
const PAGE_SIZE = 50;
export type HistoryPageState = {
  phase: "idle" | "loading" | "error" | "end";
  error: string;
};
type Anchor = { id: string; offset: number };
const upperBound = (messages: Message[], id: number) => {
  let low = 0,
    high = messages.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (messages[mid].id <= id) low = mid + 1;
    else high = mid;
  }
  return low;
};

// Explicit bounded pages, not a simulated scroll surface with estimated heights.
// Each panel owns its viewport; the account workspace owns confirmed history.
export function useChatHistory(
  messages: Message[],
  pending: number,
  page: HistoryPageState,
  initiallySynchronized: boolean,
  fetchOlder: () => Promise<number | undefined>,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const anchor = useRef<Anchor | null>(null);
  const following = useRef(true);
  const selected = useRef(false);
  const paging = useRef(false);
  const newestObserved = useRef(0);
  const initialized = useRef(false);
  const [endId, setEndId] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [selectionActive, setSelectionActive] = useState(false);
  const [readThrough, setReadThrough] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState("");
  const end = endId === null ? messages.length : upperBound(messages, endId);
  const start = Math.max(0, end - HISTORY_WINDOW);
  const visible = useMemo(
    () => messages.slice(start, end),
    [messages, start, end],
  );
  const current = useRef({ messages, visible, start, end });
  current.current = { messages, visible, start, end };

  const scale = (el: HTMLElement) => {
    // clientHeight is rounded to whole CSS pixels. Dividing a fractional rect
    // by it accumulates several pixels of error on a tall prepended page.
    let zoom = 1;
    for (let node: HTMLElement | null = el; node; node = node.parentElement)
      zoom *= Number.parseFloat(getComputedStyle(node).zoom) || 1;
    return zoom;
  };
  function capture() {
    const el = viewport.current;
    if (!el?.clientHeight) return;
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-message-id]")].find(
      (node) => node.getBoundingClientRect().bottom > top + 1,
    );
    if (row)
      anchor.current = {
        id: row.dataset.messageId!,
        offset: (row.getBoundingClientRect().top - top) / scale(el),
      };
  }
  function restore() {
    const el = viewport.current;
    if (!el?.clientHeight) return;
    if (following.current && !selected.current) {
      el.scrollTop = el.scrollHeight;
    } else if (anchor.current) {
      const row = el.querySelector<HTMLElement>(
        `[data-message-id="${anchor.current.id}"]`,
      );
      if (row)
        el.scrollTop +=
          (row.getBoundingClientRect().top - el.getBoundingClientRect().top) /
            scale(el) -
          anchor.current.offset;
    }
    capture();
  }
  function pause() {
    following.current = false;
    setPaused(true);
    setEndId((id) => id ?? current.current.visible.at(-1)?.id ?? null);
  }
  function onScroll() {
    const el = viewport.current;
    if (!el?.clientHeight) return;
    const atEnd =
      current.current.end === current.current.messages.length &&
      el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
    if (atEnd && !selected.current) {
      following.current = true;
      setPaused(false);
      setEndId(null);
      setReadThrough(current.current.messages.at(-1)?.id ?? 0);
    } else pause();
    capture();
  }
  useLayoutEffect(() => {
    const newest = messages.at(-1)?.id ?? 0;
    if (initialized.current && newest > newestObserved.current) {
      const count =
        messages.length - upperBound(messages, newestObserved.current);
      setAnnouncement(
        count === 1
          ? "Nova mensagem recebida."
          : `${count} novas mensagens recebidas.`,
      );
    }
    newestObserved.current = newest;
    if (initiallySynchronized) initialized.current = true;
    if (following.current && !selected.current) setReadThrough(newest);
    restore();
    const observer = new ResizeObserver(restore);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    for (const row of content.current?.querySelectorAll<HTMLElement>(
      "[data-message-id]",
    ) ?? [])
      observer.observe(row);
    return () => observer.disconnect();
  }, [visible, messages, pending, page.phase, initiallySynchronized]);

  useEffect(() => {
    const selectionChanged = () => {
      const selection = document.getSelection();
      const el = viewport.current;
      const active =
        !!el &&
        !!selection &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        selection.getRangeAt(0).intersectsNode(el);
      selected.current = active;
      setSelectionActive(active);
      if (active) {
        pause();
        capture();
      }
    };
    const fontsChanged = () => restore();
    document.addEventListener("selectionchange", selectionChanged);
    document.fonts.addEventListener("loadingdone", fontsChanged);
    return () => {
      document.removeEventListener("selectionchange", selectionChanged);
      document.fonts.removeEventListener("loadingdone", fontsChanged);
    };
  }, []);

  function moveEnd(nextEnd: number, direction: "older" | "newer") {
    const info = current.current;
    const point = anchor.current
      ? info.messages.findIndex((m) => String(m.id) === anchor.current!.id)
      : -1;
    if (
      point >= 0 &&
      (point >= nextEnd || point < Math.max(0, nextEnd - HISTORY_WINDOW))
    ) {
      setNotice(
        direction === "older"
          ? "Role até o início desta página para carregar anteriores."
          : "Role até o fim desta página para avançar.",
      );
      return;
    }
    setEndId(info.messages[nextEnd - 1]?.id ?? null);
    setNotice(
      direction === "older"
        ? "Mensagens anteriores exibidas."
        : "Mensagens mais recentes exibidas.",
    );
  }
  async function previous() {
    if (selected.current || paging.current || page.phase === "loading") return;
    pause();
    capture();
    const info = current.current;
    if (info.start > 0) {
      moveEnd(Math.max(1, info.end - PAGE_SIZE), "older");
      return;
    }
    paging.current = true;
    setNotice("");
    const old = info.visible;
    const oldEnd = old.at(-1)?.id;
    try {
      const count = await fetchOlder();
      if (count === undefined) return;
      const overflow = old.length + count - HISTORY_WINDOW;
      const boundary =
        overflow > 0 ? old[old.length - 1 - overflow]?.id : undefined;
      // If the reader moved during HTTP, never evict their new anchor.
      if (
        !selected.current &&
        current.current.visible.at(-1)?.id === oldEnd &&
        boundary !== undefined &&
        (!anchor.current || Number(anchor.current.id) <= boundary)
      )
        setEndId(boundary);
      setNotice(
        count
          ? `${count} mensagens anteriores carregadas.`
          : "Início do histórico.",
      );
    } finally {
      paging.current = false;
    }
  }
  function next() {
    if (selected.current) return;
    pause();
    capture();
    moveEnd(
      Math.min(
        current.current.messages.length,
        current.current.end + PAGE_SIZE,
      ),
      "newer",
    );
  }
  function recent() {
    if (selected.current) return;
    anchor.current = null;
    following.current = true;
    setPaused(false);
    setEndId(null);
    setReadThrough(current.current.messages.at(-1)?.id ?? 0);
    // Even if the current page already ends at the latest ID, scroll it.
    if (viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }
  return {
    viewport,
    content,
    visible,
    start,
    end,
    paused,
    selectionActive,
    announcement,
    notice,
    unread: paused ? messages.length - upperBound(messages, readThrough) : 0,
    canPrevious:
      start > 0 || (page.phase !== "end" && messages.length >= PAGE_SIZE),
    canNext: end < messages.length,
    onScroll,
    pauseReading: () => {
      pause();
      capture();
    },
    previous,
    next,
    recent,
  };
}
