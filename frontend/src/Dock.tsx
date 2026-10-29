import { createContext, useCallback, useContext } from "react";
import {
  themeAbyssSpaced,
  type AddPanelOptions,
  type DockviewApi,
  type DockviewTheme,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
} from "dockview-react";

// Each dock panel only hosts an element. Workspace owns the state and portals
// content into a stable element per panel id, so moving a tab, hiding it or
// switching layouts never remounts it, and closing a panel never ends a call.
export type PanelKind =
  | "nav"
  | "voice"
  | "stream"
  | "music"
  | "chat"
  | "members"
  | "account"
  | "admin";
export const TITLES: Record<PanelKind, string> = {
  nav: "Canais",
  voice: "Sala de estar",
  stream: "Transmissão",
  music: "Bot de música",
  chat: "# geral",
  members: "Membros",
  account: "Configurações",
  admin: "Gerenciar contas",
};
export const kindOf = (id: string) => id.split("-")[0] as PanelKind;

export const theme: DockviewTheme = {
  ...themeAbyssSpaced,
  name: "amigos",
  gap: 6,
};

type Attach = (id: string) => { el: HTMLElement; detach: () => void };
export const SlotContext = createContext<Attach>(() => ({
  el: document.createElement("div"),
  detach: () => {},
}));

export function Slot({ api }: IDockviewPanelProps) {
  const attach = useContext(SlotContext);
  const ref = useCallback(
    (frame: HTMLDivElement | null) => {
      if (!frame) return;
      const { el, detach } = attach(api.id);
      frame.appendChild(el);
      return detach;
    },
    [api.id, attach],
  );
  return <div className="slot-frame" ref={ref} />;
}

export function Empty({ containerApi }: IWatermarkPanelProps) {
  return (
    <div className="dock-empty">
      <span>✳</span>
      <p>Nenhum painel aberto.</p>
      <button onClick={() => resetLayout(containerApi)}>
        Restaurar layout
      </button>
    </div>
  );
}

export const compactQuery = "(max-width: 900px)";
export const isCompact = () => matchMedia(compactQuery).matches;
const storageKey = () =>
  "chat-friends:layout:v4:" + (isCompact() ? "compact" : "wide");

export function saveLayout(api: DockviewApi) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(api.toJSON()));
  } catch {
    /* layout persistence is a convenience */
  }
}

export function restoreLayout(api: DockviewApi) {
  try {
    const saved = localStorage.getItem(storageKey());
    if (saved) {
      api.fromJSON(JSON.parse(saved));
      if (api.panels.length) return;
    }
  } catch {
    /* corrupt or unavailable storage: fall back to the default layout */
  }
  resetLayout(api);
}

// The room in the middle, conversation and members as tabs on the right.
export function resetLayout(api: DockviewApi) {
  api.clear();
  if (isCompact()) {
    add(api, "chat");
    add(api, "voice", { referencePanel: "chat" }, true);
    add(api, "members", { referencePanel: "chat" }, true);
    return;
  }
  add(api, "voice");
  add(api, "nav", { direction: "left" });
  add(api, "chat", { direction: "right" });
  add(api, "members", { referencePanel: "chat" }, true);
  api.getPanel("voice")?.api.setActive();
  fitSides(api);
}

// Pixel sizes for the dock follow the interface size chosen in theme.ts.
const scale = () =>
  parseFloat(getComputedStyle(document.documentElement).fontSize) / 14 || 1;

// Side columns start narrow so the room keeps most of the space.
const WIDTHS: Partial<Record<PanelKind, number>> = { nav: 250, chat: 400 };
function fitSides(api: DockviewApi) {
  if (isCompact()) return;
  const room = api.getPanel("voice")?.group;
  for (const [id, width] of Object.entries(WIDTHS)) {
    const group = api.getPanel(id)?.group;
    if (group && room && group !== room)
      group.api.setSize({ width: width * scale() });
  }
}

function add(
  api: DockviewApi,
  id: string,
  position?: AddPanelOptions["position"],
  inactive = false,
) {
  return api.addPanel({
    id,
    component: "slot",
    title: TITLES[kindOf(id)],
    position,
    inactive,
    minimumWidth: (kindOf(id) === "nav" ? 190 : 260) * scale(),
    minimumHeight: 200 * scale(),
    // Keep every panel rendered behind its tab: the room plays video, and
    // dockview 8.4 drops an active panel's content when an "always" panel
    // joins its group inactive, so the renderers must not be mixed.
    renderer: "always",
  });
}

// Focuses an open panel or places a new one where it fits best.
export function openPanel(api: DockviewApi, kind: PanelKind) {
  const existing = api.getPanel(kind);
  if (existing) {
    existing.api.setActive();
    return;
  }
  const chat = api.panels.find((p) => kindOf(p.id) === "chat");
  if (!api.panels.length) add(api, kind);
  else if (isCompact()) add(api, kind, { referenceGroup: api.groups[0] });
  else if (kind === "nav") add(api, kind, { direction: "left" });
  else if (kind === "voice")
    add(
      api,
      kind,
      chat
        ? { referencePanel: chat, direction: "left" }
        : { direction: "left" },
    );
  else if (kind === "stream" || kind === "music") {
    const room = api.getPanel("voice");
    add(
      api,
      kind,
      room
        ? { referencePanel: room, direction: "right" }
        : { direction: "right" },
    );
  } else if (kind === "chat") add(api, kind, { direction: "right" });
  else add(api, kind, chat ? { referencePanel: chat } : undefined);
  fitSides(api);
}

// Opens another view of #geral beside the last one, like splitting an editor.
// There is a single channel, so two side-by-side views are the useful maximum.
const MAX_CHATS = 2;
export function openChat(api: DockviewApi) {
  const chats = api.panels.filter((p) => kindOf(p.id) === "chat");
  if (chats.length >= MAX_CHATS) {
    chats[chats.length - 1].api.setActive();
    return;
  }
  let n = 1;
  while (api.getPanel(n === 1 ? "chat" : `chat-${n}`)) n++;
  const id = n === 1 ? "chat" : `chat-${n}`;
  const last = chats[chats.length - 1];
  add(
    api,
    id,
    last
      ? isCompact()
        ? { referencePanel: last }
        : { referencePanel: last, direction: "right" }
      : undefined,
  );
}
