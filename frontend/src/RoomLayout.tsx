import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import "./RoomLayout.css";
import { Icon } from "./Icon";

const sections = ["screen", "people", "music"] as const;
type Section = (typeof sections)[number];
const titles: Record<Section, string> = {
  screen: "Transmissão",
  people: "Pessoas",
  music: "Música",
};
type Size = { height: number; columns: number };
type Layout = {
  order: Section[];
  sizes: Record<Section, Size>;
  cardSize: number;
  cards: string[];
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
function number(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(clamp(value, min, max))
    : fallback;
}
function defaults(compact: boolean): Layout {
  return {
    order: [...sections],
    sizes: {
      screen: { height: compact ? 260 : 340, columns: 12 },
      people: { height: compact ? 240 : 220, columns: 12 },
      music: { height: 340, columns: 12 },
    },
    cardSize: 150,
    cards: [],
  };
}
function read(key: string, compact: boolean): Layout {
  const fallback = defaults(compact);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return fallback;
    const order: Section[] = Array.isArray(saved.order)
      ? saved.order.filter((id: unknown): id is Section =>
          sections.includes(id as Section),
        )
      : [];
    return {
      order: [...new Set([...order, ...sections])],
      sizes: Object.fromEntries(
        sections.map((id) => [
          id,
          {
            height: number(
              saved.sizes?.[id]?.height,
              fallback.sizes[id].height,
              160,
              1200,
            ),
            columns: number(saved.sizes?.[id]?.columns, 12, 4, 12),
          },
        ]),
      ) as Record<Section, Size>,
      cardSize: number(saved.cardSize, 150, 100, 280),
      cards: Array.isArray(saved.cards)
        ? [
            ...new Set<string>(
              saved.cards.filter(
                (id: unknown): id is string =>
                  typeof id === "string" && /^[\w:-]{1,100}$/.test(id),
              ),
            ),
          ].slice(0, 100)
        : [],
    };
  } catch {
    return fallback;
  }
}

export function orderedItems(ids: string[], saved: string[]) {
  return [...new Set([...saved.filter((id) => ids.includes(id)), ...ids])];
}
function move<T extends string>(order: T[], from: T, to: T) {
  if (from === to || !order.includes(from) || !order.includes(to)) return order;
  const next = order.filter((id) => id !== from);
  next.splice(order.indexOf(to), 0, from);
  return next;
}

export function useRoomLayout(userId: string) {
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const prefix = `chat-friends:room-layout:v1:${userId}:`;
  const [layouts, setLayouts] = useState(() => ({
    wide: read(prefix + "wide", false),
    compact: read(prefix + "compact", true),
  }));
  const mode = compact ? "compact" : "wide";
  const layout = layouts[mode];
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const changed = () => setCompact(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(prefix + mode, JSON.stringify(layout));
    } catch {
      /* private browsing or full storage: the layout still works */
    }
  }, [layout, mode, prefix]);
  const update = (fn: (old: Layout) => Layout) =>
    setLayouts((old) => ({ ...old, [mode]: fn(old[mode]) }));
  return {
    layout,
    compact,
    reset: () => update(() => defaults(compact)),
    resize: (id: Section, size: Partial<Size>) =>
      update((old) => ({
        ...old,
        sizes: {
          ...old.sizes,
          [id]: {
            height: number(size.height, old.sizes[id].height, 160, 1200),
            columns: number(size.columns, old.sizes[id].columns, 4, 12),
          },
        },
      })),
    reorder: (from: Section, to: Section) =>
      update((old) => ({ ...old, order: move(old.order, from, to) })),
    cardSize: (size: number) =>
      update((old) => ({
        ...old,
        cardSize: number(size, old.cardSize, 100, 280),
      })),
    reorderCards: (ids: string[], from: string, to: string) =>
      update((old) => ({
        ...old,
        cards: [
          ...move(orderedItems(ids, old.cards), from, to),
          ...old.cards.filter((id) => !ids.includes(id)),
        ].slice(0, 100),
      })),
  };
}
export type RoomLayoutController = ReturnType<typeof useRoomLayout>;

// Only dedicated handles capture pointers. Sliders, video and ordinary touch scrolling
// keep their native behavior. CSS order changes never detach a media element.
export function usePointerOrder(
  selector: string,
  scopeSelector: string,
  order: string[],
  onMove: (from: string, to: string) => void,
) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    target: string;
    pointer: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    scope: HTMLElement;
    handle: HTMLButtonElement;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetAt = () => {
    const current = drag.current;
    if (!current) return;
    let best = Infinity;
    let target = current.id;
    for (const node of current.scope.querySelectorAll<HTMLElement>(selector)) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const distance = Math.hypot(
        current.lastX - rect.x - rect.width / 2,
        current.lastY - rect.y - rect.height / 2,
      );
      if (distance < best) {
        best = distance;
        target = node.dataset.reorderId || current.id;
      }
    }
    current.target = target;
    setOver(target);
  };
  const clear = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    drag.current = null;
    setDragging(null);
    setOver(null);
  }, []);
  useEffect(() => {
    const current = drag.current;
    if (current && (!current.handle.isConnected || !order.includes(current.id)))
      clear();
  }, [order, clear]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
    },
    [],
  );
  const bind = (id: string) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !event.isPrimary || drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      const scope = event.currentTarget.closest<HTMLElement>(scopeSelector);
      if (!scope) return;
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        id,
        target: id,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        scope,
        handle: event.currentTarget,
      };
      timer.current = setInterval(() => {
        const current = drag.current;
        if (!current?.moved) return;
        let element: HTMLElement | null = current.scope;
        while (element) {
          if (
            element.scrollHeight > element.clientHeight + 1 &&
            /auto|scroll/.test(getComputedStyle(element).overflowY)
          ) {
            const rect = element.getBoundingClientRect();
            const delta =
              current.lastY < rect.top + 35
                ? -16
                : current.lastY > rect.bottom - 35
                  ? 16
                  : 0;
            if (
              delta &&
              ((delta < 0 && element.scrollTop > 0) ||
                (delta > 0 &&
                  element.scrollTop + element.clientHeight <
                    element.scrollHeight))
            ) {
              element.scrollTop += delta;
              targetAt();
              break;
            }
          }
          element = element.parentElement;
        }
      }, 30);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      current.lastX = event.clientX;
      current.lastY = event.clientY;
      if (
        Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5
      ) {
        current.moved = true;
        setDragging(current.id);
        targetAt();
      }
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      if (
        current.moved &&
        order.includes(current.id) &&
        order.includes(current.target)
      )
        onMove(current.id, current.target);
      clear();
    },
    onPointerCancel: clear,
    onLostPointerCapture: clear,
    onClick: (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      const index = order.indexOf(id);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? order.length - 1
            : ["ArrowUp", "ArrowLeft"].includes(event.key)
              ? index - 1
              : ["ArrowDown", "ArrowRight"].includes(event.key)
                ? index + 1
                : -1;
      if (next >= 0 && next < order.length) {
        event.preventDefault();
        event.stopPropagation();
        onMove(id, order[next]);
      }
    },
  });
  return { bind, dragging, over };
}

export function RoomLayout({
  controller,
  content,
  hiddenSections = [],
  expanded,
  onRestoreExpanded,
}: {
  controller: RoomLayoutController;
  content: Record<Section, ReactNode>;
  hiddenSections?: Section[];
  expanded: boolean;
  onRestoreExpanded: () => void;
}) {
  const { layout } = controller;
  const [editing, setEditing] = useState(false);
  const [narrow, setNarrow] = useState(true);
  const [notice, setNotice] = useState("");
  const [focused, setFocused] = useState<Section | null>(null);
  const [height, setHeight] = useState(400);
  const [resizing, setResizing] = useState<Section | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const resize = useRef<{
    id: Section;
    x: number;
    y: number;
    height: number;
    columns: number;
    width: number;
    pointer: number;
  } | null>(null);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setNarrow(element.clientWidth < 560);
      setHeight(element.clientHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const reorder = (from: string, to: string) => {
    if (from === to) return;
    controller.reorder(from as Section, to as Section);
    setNotice(`${titles[from as Section]} mudou de posição.`);
  };
  const visibleOrder = layout.order.filter((id) => !hiddenSections.includes(id));
  const drag = usePointerOrder(
    ".room-block",
    ".room-workspace",
    visibleOrder,
    reorder,
  );
  const requestedFocus = expanded ? "screen" : focused;
  const only =
    requestedFocus && !hiddenSections.includes(requestedFocus)
      ? requestedFocus
      : null;
  const restoreFocus = () => {
    setFocused(null);
    if (expanded) onRestoreExpanded();
  };
  return (
    <>
      <div className="room-layout-toolbar">
        <button
          className={editing ? "active" : ""}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          ▦ {editing ? "Concluir organização" : "Organizar sala"}
        </button>
        {editing && (
          <button
            onClick={() => {
              controller.reset();
              restoreFocus();
              setNotice("Organização da sala restaurada.");
            }}
          >
            Restaurar sala
          </button>
        )}
        {(focused || expanded) && (
          <button onClick={restoreFocus}>Restaurar blocos</button>
        )}
        <span>
          {editing
            ? "Arraste as alças. Use as setas para mover e redimensionar."
            : "Seu espaço, do seu jeito."}
        </span>
        <span className="sr-only" role="status" aria-live="polite">
          {notice}
        </span>
      </div>
      <div
        className={"room-workspace" + (editing ? " editing" : "")}
        data-narrow={narrow}
        ref={workspace}
        style={{ "--room-card-size": `${layout.cardSize}px` } as CSSProperties}
      >
        {sections.map((id) => {
          const size = layout.sizes[id];
          const index = layout.order.indexOf(id);
          const visibleIndex = visibleOrder.indexOf(id);
          return (
            <section
              key={id}
              className={
                "room-block" +
                (drag.dragging === id ? " is-dragging" : "") +
                (drag.over === id && drag.dragging !== id
                  ? " is-drop-target"
                  : "") +
                (resizing === id ? " is-resizing" : "")
              }
              data-reorder-id={id}
              aria-label={`Bloco ${titles[id]}`}
              style={{
                order: index,
                height: only === id ? Math.max(160, height - 16) : size.height,
                gridColumn: `span ${narrow || only ? 12 : size.columns}`,
                // Retain the home node and saved geometry without reserving
                // grid space while its media lives in another panel/window.
                display:
                  hiddenSections.includes(id) || (only && only !== id)
                    ? "none"
                    : undefined,
              }}
            >
              <header className="room-block-header">
                <button
                  className="room-grip"
                  aria-label={`Arrastar bloco ${titles[id]}`}
                  title="Arraste ou use as setas para reorganizar"
                  {...drag.bind(id)}
                >
                  ⠿
                </button>
                <strong>{titles[id]}</strong>
                <button
                  className="room-focus"
                  aria-label={
                    only === id
                      ? `Restaurar bloco ${titles[id]}`
                      : `Focar ${titles[id]}`
                  }
                  title={
                    only === id
                      ? `Restaurar bloco ${titles[id]}`
                      : `Focar ${titles[id]}`
                  }
                  onClick={() =>
                    only === id ? restoreFocus() : setFocused(id)
                  }
                >
                  <Icon name={only === id ? "collapse" : "expand"} size={16} />
                </button>
                {editing && (
                  <div className="room-block-tools">
                    <button
                      aria-label={`Mover ${titles[id]} para cima`}
                      disabled={visibleIndex <= 0}
                      onClick={() => reorder(id, visibleOrder[visibleIndex - 1])}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Mover ${titles[id]} para baixo`}
                      disabled={visibleIndex === visibleOrder.length - 1}
                      onClick={() => reorder(id, visibleOrder[visibleIndex + 1])}
                    >
                      ↓
                    </button>
                    <label>
                      Altura{" "}
                      <input
                        aria-label={`Altura de ${titles[id]}`}
                        type="range"
                        min="160"
                        max="1200"
                        step="20"
                        value={size.height}
                        disabled={!!only}
                        onChange={(e) =>
                          controller.resize(id, {
                            height: Number(e.target.value),
                          })
                        }
                      />
                      <output>{size.height}px</output>
                    </label>
                    <label>
                      Largura{" "}
                      <select
                        aria-label={`Largura de ${titles[id]}`}
                        value={size.columns}
                        disabled={narrow || !!only}
                        onChange={(e) =>
                          controller.resize(id, {
                            columns: Number(e.target.value),
                          })
                        }
                      >
                        {Array.from({ length: 9 }, (_, n) => n + 4).map((n) => (
                          <option key={n} value={n}>
                            {Math.round((n / 12) * 100)}%
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </header>
              {id === "people" && (
                <label className="room-card-size">
                  Tamanho dos cards{" "}
                  <input
                    aria-label="Tamanho dos cards"
                    type="range"
                    min="100"
                    max="280"
                    step="10"
                    value={layout.cardSize}
                    onChange={(e) =>
                      controller.cardSize(Number(e.target.value))
                    }
                  />
                  <output>{layout.cardSize}px</output>
                </label>
              )}
              <div className="room-block-body">{content[id]}</div>
              {!only && (
                <div
                  className="room-resize"
                  role="separator"
                  tabIndex={0}
                  aria-label={`Redimensionar ${titles[id]}`}
                  aria-orientation="horizontal"
                  aria-valuemin={160}
                  aria-valuemax={1200}
                  aria-valuenow={size.height}
                  title="Arraste para mudar tamanho. Setas ↑↓ ajustam altura; ←→ ajustam largura."
                  onPointerDown={(e) => {
                    if (e.button !== 0 || !e.isPrimary) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.focus();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    resize.current = {
                      id,
                      x: e.clientX,
                      y: e.clientY,
                      height: size.height,
                      columns: size.columns,
                      width: workspace.current?.clientWidth || 1,
                      pointer: e.pointerId,
                    };
                    setResizing(id);
                  }}
                  onPointerMove={(e) => {
                    const start = resize.current;
                    if (!start || start.pointer !== e.pointerId) return;
                    controller.resize(start.id, {
                      height: start.height + e.clientY - start.y,
                      columns: narrow
                        ? start.columns
                        : start.columns +
                          (e.clientX - start.x) / (start.width / 12),
                    });
                  }}
                  onPointerUp={(e) => {
                    if (resize.current?.pointer === e.pointerId) {
                      resize.current = null;
                      setResizing(null);
                    }
                  }}
                  onPointerCancel={() => {
                    resize.current = null;
                    setResizing(null);
                  }}
                  onLostPointerCapture={() => {
                    resize.current = null;
                    setResizing(null);
                  }}
                  onKeyDown={(e) => {
                    const delta = e.shiftKey ? 80 : 20;
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      controller.resize(id, {
                        height:
                          size.height + (e.key === "ArrowUp" ? -delta : delta),
                      });
                    } else if (
                      !narrow &&
                      (e.key === "ArrowLeft" || e.key === "ArrowRight")
                    ) {
                      e.preventDefault();
                      controller.resize(id, {
                        columns:
                          size.columns + (e.key === "ArrowLeft" ? -1 : 1),
                      });
                    }
                  }}
                >
                  <span aria-hidden="true">◢</span>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
