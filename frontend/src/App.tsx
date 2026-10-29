import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { api, login, type Member, type User, type Message } from "./api";
import { MfaGate, type SecurityState } from "./AccountSecurity";
import { GamesClub } from "./GamesClub";
import { Outlook } from "./Outlook";
import { Voice } from "./Voice";
import { Icon, type IconName } from "./Icon";
import { Avatar, PeopleContext, Popover, avatarSrc, usePeople } from "./ui";
import { Profile } from "./Profile";
import { Lockup, Logo } from "./Logo";
import { applyTheme } from "./theme";
import {
  Empty,
  Slot,
  SlotContext,
  compactQuery,
  isCompact,
  kindOf,
  openChat,
  openPanel,
  resetLayout,
  restoreLayout,
  saveLayout,
  theme,
  type PanelKind,
} from "./Dock";
export default function App() {
  const [me, setMe] = useState<{
      user: User;
      spaceName: string;
      security: SecurityState;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      setMe(await api("/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const expired = () => {
      setMe(null);
      setError("");
    };
    window.addEventListener("session-ended", expired);
    void load();
    return () => window.removeEventListener("session-ended", expired);
  }, [load]);
  useEffect(() => {
    applyTheme(me?.user.primaryColor, me?.user.secondaryColor);
  }, [me]);
  if (loading) return <main className="loading">Preparando o seu espaço…</main>;
  if (!me)
    return (
      <Login
        notice={notice}
        onLogin={async () => {
          setNotice("");
          await load();
        }}
      />
    );
  if (me.security.mfaPending || me.security.enrollmentRequired)
    return <MfaGate state={me.security} onDone={load} />;
  return (
    <Workspace
      me={me}
      error={error}
      onError={setError}
      onRefresh={load}
      onLogout={(message = "") => {
        setMe(null);
        setError("");
        setNotice(message);
      }}
    />
  );
}
function Login({
  notice,
  onLogin,
}: {
  notice: string;
  onLogin: () => Promise<void>;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-hero">
        <Lockup width={440} />
        <h1>
          Sua galera.
          <br />
          Sua <span>house</span>.
          <br />
          Seu jogo.
        </h1>
        <p>Voz, tela ao vivo, música e chat num espaço só de vocês.</p>
        <ul className="login-features">
          {(
            [
              ["speaker", "Voz"],
              ["screen", "Tela ao vivo"],
              ["music", "Bot de música"],
              ["chat", "Chat"],
            ] as [IconName, string][]
          ).map(([icon, label]) => (
            <li key={label}>
              <Icon name={icon} size={18} />
              {label}
            </li>
          ))}
        </ul>
      </section>
      <section className="login-card">
        <span className="eyebrow">BOM TER VOCÊ POR AQUI</span>
        <h2>Entre e fique à vontade.</h2>
        <p className="muted">
          Use a conta criada pelo administrador do espaço.
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <label>
            Usuário
            <input
              autoComplete="username"
              required
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="seu.usuario"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
            />
          </label>
          {notice && !error && <p role="status">{notice}</p>}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Entrando…" : "Entrar no espaço →"}
          </button>
        </form>
        <p className="login-help">
          Precisa de uma conta ou esqueceu sua senha?
          <br />
          Fale com o administrador.
        </p>
      </section>
    </main>
  );
}
function Workspace({
  me,
  error,
  onError,
  onRefresh,
  onLogout,
}: {
  me: { user: User; spaceName: string };
  error: string;
  onError: (s: string) => void;
  onRefresh: () => Promise<void>;
  onLogout: (notice?: string) => void;
}) {
  const [voiceIdentity, setVoiceIdentity] = useState<string>();
  const [members, setMembers] = useState<Member[]>([]);
  const loadMembers = useCallback(
    () =>
      api<Member[]>("/members")
        .then(setMembers)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);
  const people = useMemo(
    () => ({
      byId: new Map(members.map((m) => [m.id, m])),
      byUsername: new Map(members.map((m) => [m.username, m])),
    }),
    [members],
  );
  const [messages, setMessages] = useState<Message[]>([]),
    [online, setOnline] = useState<string[]>([]),
    [connected, setConnected] = useState(false),
    [more, setMore] = useState(true),
    [pending, setPending] = useState<{ clientId: string; body: string }[]>([]);
  const [slots, setSlots] = useState<Record<string, HTMLElement>>({}),
    [dock, setDock] = useState<DockviewApi | null>(null),
    [stageMaximized, setStageMaximized] = useState(false);
  const initialized = useRef(false);
  const latest = useRef(0),
    queue = useRef(pending);
  queue.current = pending;
  const hosts = useRef(new Map<string, { el: HTMLElement; frames: number }>());
  const attach = useCallback((id: string) => {
    let host = hosts.current.get(id);
    if (!host) {
      const el = document.createElement("div");
      el.className = "slot";
      host = { el, frames: 0 };
      hosts.current.set(id, host);
    }
    const current = host;
    current.frames++;
    setSlots((old) =>
      old[id] === current.el ? old : { ...old, [id]: current.el },
    );
    const detach = () => {
      current.frames--;
      // Dockview may remount a panel right away; only drop truly closed ones.
      setTimeout(() => {
        if (current.frames || hosts.current.get(id) !== current) return;
        hosts.current.delete(id);
        setSlots((old) => {
          const next = { ...old };
          delete next[id];
          return next;
        });
      });
    };
    return { el: current.el, detach };
  }, []);
  const streaming = useRef(false);
  const ready = useCallback(
    (event: DockviewReadyEvent) => {
      restoreLayout(event.api);
      // Layouts are per browser; another account may have left this open.
      const admin = event.api.getPanel("admin");
      if (admin && !me.user.admin) event.api.removePanel(admin);
      setDock(event.api);
    },
    [me.user.admin],
  );
  useEffect(() => {
    if (!dock) return;
    const saving = dock.onDidLayoutChange(() => saveLayout(dock));
    const maximized = dock.onDidMaximizedGroupChange(() =>
      setStageMaximized(!!dock.getPanel("voice")?.api.isMaximized()),
    );
    // Phone and desktop keep separate layouts; switch when crossing over.
    const media = matchMedia(compactQuery),
      switchLayout = () => {
        restoreLayout(dock);
        if (streaming.current) openPanel(dock, "voice");
      };
    media.addEventListener("change", switchLayout);
    return () => {
      saving.dispose();
      maximized.dispose();
      media.removeEventListener("change", switchLayout);
    };
  }, [dock]);
  const merge = useCallback(
    (items: Message[]) => {
      setMessages((old) =>
        [...new Map([...old, ...items].map((m) => [m.id, m])).values()].sort(
          (a, b) => a.id - b.id,
        ),
      );
      for (const m of items) latest.current = Math.max(latest.current, m.id);
      setPending((old) =>
        old.filter(
          (p) =>
            !items.some(
              (m) => m.authorId === me.user.id && m.clientId === p.clientId,
            ),
        ),
      );
    },
    [me.user.id],
  );
  async function send(msg: { clientId: string; body: string }) {
    try {
      const saved = await api<Message>("/messages", "POST", msg);
      merge([saved]);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  useEffect(() => {
    let alive = true,
      ws: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout>,
      ping: ReturnType<typeof setInterval>,
      lastPong = Date.now();
    const catchUp = async () => {
      if (!initialized.current) {
        merge(await api<Message[]>("/messages"));
        initialized.current = true;
        return;
      }
      let rows: Message[];
      let cursor = latest.current;
      do {
        rows = await api<Message[]>("/messages?after=" + cursor);
        if (!alive) return;
        merge(rows);
        if (rows.length) cursor = rows[rows.length - 1].id;
      } while (rows.length === 100);
    };
    const connect = () => {
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      ws.onopen = () => {
        setConnected(true);
        lastPong = Date.now();
        void catchUp().catch((e) => onError(e.message));
        for (const p of queue.current) void send(p);
        ping = setInterval(() => {
          if (Date.now() - lastPong > 35000) ws?.close();
          else if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 10000);
      };
      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "message") merge([event.message]);
        if (event.type === "presence") setOnline(event.users);
        if (event.type === "pong") lastPong = Date.now();
        if (event.type === "profile") {
          void loadMembers();
          void onRefresh();
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        setConnected(false);
        setOnline([]);
        if (alive) retry = setTimeout(connect, 2000 + Math.random() * 1000);
      };
    };
    connect();
    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
    };
  }, [merge, loadMembers, onRefresh]);
  async function older() {
    try {
      const rows = await api<Message[]>("/messages?before=" + messages[0]?.id);
      merge(rows);
      setMore(rows.length === 50);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  function post(body: string) {
    const msg = { clientId: crypto.randomUUID(), body };
    setPending((old) => [...old, msg]);
    void send(msg);
  }
  const [drawer, setDrawer] = useState(false),
    [compact, setCompact] = useState(isCompact),
    [roster, setRoster] = useState<HTMLElement | null>(null),
    [quick, setQuick] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const media = matchMedia(compactQuery),
      update = () => {
        setCompact(media.matches);
        setDrawer(false);
      };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const open = (kind: PanelKind) => {
    setDrawer(compact && kind === "nav");
    if (dock && !(compact && kind === "nav")) openPanel(dock, kind);
  };
  const close = (id: string) => {
    const panel = dock?.getPanel(id);
    if (panel) dock?.removePanel(panel);
  };
  const chats = Object.keys(slots).filter((id) => kindOf(id) === "chat");
  const sidebar = (
    <aside className="sidebar" aria-label="Navegação">
      <div className="brand">
        <Lockup width={190} />
        <small>{me.spaceName}</small>
      </div>
      <div className="channel-section">
        <span className="eyebrow">CANAIS DE TEXTO</span>
        <button
          className={"channel" + (chats.length ? " selected" : "")}
          onClick={() => open("chat")}
        >
          <Icon name="hash" size={18} /> geral
        </button>
      </div>
      <div className="channel-section">
        <span className="eyebrow">CANAIS DE VOZ</span>
        <div ref={setRoster} />
      </div>
      <div className="channel-section">
        <span className="eyebrow">MAIS UMA RODADA?</span>
        <button className="channel" onClick={() => open("games")}>
          <Icon name="games" size={18} /> Clube da Sorte <small>NOVO</small>
        </button>
      </div>
      <div className="channel-section">
        <span className="eyebrow">MARQUE COM A GALERA</span>
        <button className="channel" onClick={() => open("outlook")}>
          <Icon name="calendar" size={18} /> Outlook
        </button>
      </div>
      <footer className="me">
        <Avatar name={me.user.displayName} src={avatarSrc(me.user)} size={34} />
        <div className="me-name">
          <strong>{me.user.displayName}</strong>
          <small>@{me.user.username}</small>
        </div>
        <div className="quick" ref={setQuick} />
      </footer>
    </aside>
  );
  function content(id: string) {
    const kind = kindOf(id);
    // On phones the channel list lives in the drawer instead.
    if (kind === "nav") return compact ? null : sidebar;
    if (kind === "chat")
      return (
        <ChatView
          me={me.user}
          connected={connected}
          messages={messages}
          pending={pending}
          more={more}
          onOlder={() => void older()}
          onSend={post}
          onRetry={(p) => void send(p)}
        />
      );
    if (kind === "outlook") return <Outlook me={me.user} />;
    if (kind === "games")
      return (
        <GamesClub
          me={me.user}
          voiceIdentity={voiceIdentity}
          onOpenVoice={() => open("voice")}
        />
      );
    if (kind === "members")
      return (
        <section className="members" aria-label="Membros">
          <span className="eyebrow">
            MEMBROS — {online.length} ONLINE DE {members.length}
          </span>
          {[...members]
            .sort(
              (a, b) =>
                Number(online.includes(b.username)) -
                  Number(online.includes(a.username)) ||
                a.displayName.localeCompare(b.displayName),
            )
            .map((m) => (
              <div
                className={
                  "member" + (online.includes(m.username) ? "" : " offline")
                }
                key={m.id}
              >
                <Avatar name={m.displayName} src={avatarSrc(m)} size={32} />
                <span className="member-name">
                  {m.displayName}
                  <small>@{m.username}</small>
                </span>
                <span
                  className={
                    "dot" + (online.includes(m.username) ? " green" : "")
                  }
                />
              </div>
            ))}
          <p className="muted">
            Online é quem está com o espaço aberto. Quem está na voz aparece na
            barra lateral, embaixo da sala.
          </p>
        </section>
      );
    if (kind === "account")
      return (
        <Profile
          me={me.user}
          onSaved={() => void onRefresh()}
          onSignedOut={() =>
            onLogout("Usuário alterado. Entre com o novo nome de usuário.")
          }
          onLogout={() => onLogout()}
          onError={onError}
        />
      );
    if (kind === "admin")
      return (
        <Settings
          panel={kind}
          onClose={() => {
            close(id);
            open("chat");
          }}
          onError={onError}
          onLogout={onLogout}
        />
      );
    return null;
  }
  return (
    <PeopleContext value={people}>
      <div
        className={
          "app-shell" +
          (drawer ? " drawer-open" : "") +
          (compact ? " compact" : "")
        }
      >
        {compact && <div className="drawer">{sidebar}</div>}
        <nav className="activity-bar" aria-label="Painéis">
          {!compact && <Logo size={34} />}
          <ActivityButton
            icon="menu"
            label={compact ? "Abrir menu" : "Mostrar canais"}
            title="Canais"
            active={compact ? drawer : !!slots.nav}
            onClick={() => {
              if (compact) setDrawer(!drawer);
              else if (slots.nav) close("nav");
              else open("nav");
            }}
          />
          <ActivityButton
            icon="speaker"
            label="Sala de voz"
            title="Sala de estar"
            active={!!slots.voice}
            onClick={() => open("voice")}
          />
          <ActivityButton
            icon="chat"
            label="Conversa"
            title="Conversa #geral"
            active={Object.keys(slots).some((id) => kindOf(id) === "chat")}
            onClick={() => open("chat")}
          />
          <ActivityButton
            icon="split"
            label="Nova conversa ao lado"
            title="Abrir outra conversa ao lado"
            onClick={() => dock && openChat(dock)}
          />
          <ActivityButton
            icon="people"
            label="Membros"
            title="Membros"
            active={!!slots.members}
            badge={online.length}
            onClick={() => open("members")}
          />
          <ActivityButton
            icon="games"
            label="Jogos"
            title="Clube da Sorte"
            active={!!slots.games}
            onClick={() => open("games")}
          />
          <ActivityButton
            icon="calendar"
            label="Outlook"
            title="Outlook · calendário da galera"
            active={!!slots.outlook}
            onClick={() => open("outlook")}
          />
          <span className="activity-spacer" />
          <ActivityButton
            icon="reset"
            label="Restaurar layout"
            title="Restaurar layout padrão"
            onClick={() => dock && resetLayout(dock)}
          />
          {me.user.admin && (
            <ActivityButton
              icon="shield"
              label="Gerenciar contas"
              title="Gerenciar contas"
              active={!!slots.admin}
              onClick={() => open("admin")}
            />
          )}
          <button
            className={"activity" + (slots.account ? " active" : "")}
            aria-label="Configurações"
            title="Minha conta e aparência"
            onClick={() => open("account")}
          >
            <Avatar
              name={me.user.displayName}
              src={avatarSrc(me.user)}
              size={28}
            />
          </button>
          <ActivityButton
            icon="logout"
            label="Sair"
            title="Sair"
            onClick={() =>
              void api("/logout", "POST")
                .then(() => onLogout())
                .catch((e) => onError(e.message))
            }
          />
        </nav>
        {drawer && (
          <div
            className="scrim"
            aria-hidden="true"
            onClick={() => setDrawer(false)}
          />
        )}
        <div
          className="workbench"
          onDoubleClick={(e) => {
            // Double-clicking a tab maximizes it, as in the editor.
            const panel = dock?.activePanel;
            if (!panel || !(e.target as Element).closest(".dv-tab")) return;
            if (panel.api.isMaximized()) panel.api.exitMaximized();
            else panel.api.maximize();
          }}
        >
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Fechar aviso" onClick={() => onError("")}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          <SlotContext value={attach}>
            <DockviewReact
              className="dock"
              theme={theme}
              components={{ slot: Slot }}
              watermarkComponent={Empty}
              onReady={ready}
            />
          </SlotContext>
        </div>
        {Object.entries(slots).map(([id, el]) =>
          createPortal(content(id), el, id),
        )}
        <Voice
          key={me.user.id}
          userId={me.user.id}
          onIdentityChange={setVoiceIdentity}
          admin={me.user.admin}
          hosts={{ stage: slots.voice ?? null, roster, quick }}
          maximized={stageMaximized}
          onOpen={() => open("voice")}
          onStreaming={(active) => {
            streaming.current = active;
            if (active) open("voice");
          }}
          onMaximize={() => {
            const panel = dock?.getPanel("voice");
            if (!panel) return;
            if (panel.api.isMaximized()) panel.api.exitMaximized();
            else panel.api.maximize();
          }}
          onError={onError}
        />
      </div>
    </PeopleContext>
  );
}
function ActivityButton({
  icon,
  label,
  title,
  active = false,
  badge,
  onClick,
}: {
  icon: IconName;
  label: string;
  title: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={"activity" + (active ? " active" : "")}
      aria-label={label}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      <Icon name={icon} />
      {!!badge && <small>{badge}</small>}
    </button>
  );
}
const EMOJIS = [
  "😀",
  "😂",
  "🤣",
  "😅",
  "😊",
  "😍",
  "😎",
  "🤔",
  "😴",
  "😭",
  "😡",
  "🥲",
  "🤯",
  "🥳",
  "😏",
  "🙃",
  "👍",
  "👎",
  "👏",
  "🙏",
  "💪",
  "🔥",
  "✨",
  "🎉",
  "❤️",
  "💜",
  "💀",
  "👀",
  "🎮",
  "🕹️",
  "🏆",
  "🎯",
  "⚔️",
  "🛡️",
  "🍕",
  "🍺",
  "☕",
  "🌙",
  "✅",
  "❌",
];
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function dayLabel(d: Date) {
  const today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
function ChatView({
  me,
  connected,
  messages,
  pending,
  more,
  onOlder,
  onSend,
  onRetry,
}: {
  me: User;
  connected: boolean;
  messages: Message[];
  pending: { clientId: string; body: string }[];
  more: boolean;
  onOlder: () => void;
  onSend: (body: string) => void;
  onRetry: (p: { clientId: string; body: string }) => void;
}) {
  const [body, setBody] = useState("");
  const inputId = useId();
  const directory = usePeople();
  // Show today's name and photo, even on old messages.
  const author = (m: Message) => {
    const who = directory.byId.get(m.authorId);
    return { name: who?.displayName ?? m.author, src: avatarSrc(who) };
  };
  const list = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    browsingHistory = useRef(false),
    scrolled = useRef(false);
  // Scroll only the list: scrollIntoView would also shift the dock containers.
  useEffect(() => {
    const el = list.current;
    if (!el || browsingHistory.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: scrolled.current ? "smooth" : "instant",
    });
    scrolled.current = true;
  }, [messages.length, pending.length]);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    browsingHistory.current = false;
    onSend(body);
    setBody("");
  }
  function insert(emoji: string) {
    const el = input.current,
      start = el?.selectionStart ?? body.length,
      end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + emoji + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }
  return (
    <section className="chat">
      <header className="chat-header">
        <div>
          <h1>
            <Icon name="hash" size={18} /> geral
          </h1>
          <p>O ponto de encontro de todo dia.</p>
        </div>
        <span className="connection">
          <span className={"dot " + (connected ? "green" : "")} />
          {connected ? "Conectado" : "Reconectando…"}
        </span>
      </header>
      <div
        className="messages"
        aria-label="Mensagens"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          browsingHistory.current =
            el.scrollHeight - el.scrollTop - el.clientHeight > 100;
        }}
      >
        {!(more && messages.length >= 50) && (
          <div className="welcome">
            <div className="welcome-symbol">
              <Icon name="hash" size={28} />
            </div>
            <h2>Esse é o nosso lugar.</h2>
            <p>Um oi, uma partida, uma história pra contar. Fique à vontade.</p>
          </div>
        )}
        {more && messages.length >= 50 && (
          <button
            className="load-more"
            onClick={() => {
              browsingHistory.current = true;
              onOlder();
            }}
          >
            Carregar mensagens anteriores
          </button>
        )}
        <div role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((m, i) => {
            const at = new Date(m.createdAt),
              prev = messages[i - 1],
              prevAt = prev && new Date(prev.createdAt),
              newDay = !prevAt || !sameDay(at, prevAt),
              // Consecutive lines from one person within 5 min read as one.
              continued =
                !newDay &&
                prev.authorId === m.authorId &&
                at.getTime() - prevAt.getTime() < 5 * 60 * 1000;
            const time = (
              <time dateTime={m.createdAt} title={at.toLocaleString("pt-BR")}>
                {at.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            );
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="day-separator" role="separator">
                    <span>{dayLabel(at)}</span>
                  </div>
                )}
                <article
                  className={
                    "message" +
                    (continued ? " continued" : "") +
                    (m.authorId === me.id ? " mine" : "")
                  }
                >
                  {continued ? (
                    <span className="message-gutter">{time}</span>
                  ) : (
                    <Avatar
                      name={author(m).name}
                      src={author(m).src}
                      size={38}
                    />
                  )}
                  <div>
                    {!continued && (
                      <header>
                        <strong>{author(m).name}</strong>
                        {time}
                      </header>
                    )}
                    <p>{m.body}</p>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
        {pending.map((p) => (
          <div className="pending" key={p.clientId}>
            <p>{p.body}</p>
            <span>Aguardando confirmação · </span>
            <button onClick={() => onRetry(p)}>Tentar novamente</button>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <label htmlFor={inputId} className="sr-only">
          Mensagem em geral
        </label>
        <div className="composer-box">
          <input
            id={inputId}
            ref={input}
            placeholder="Conversar em #geral…"
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoComplete="off"
          />
          <Popover label="Emojis" icon="smile" className="emoji-picker">
            <div className="emoji-grid">
              {EMOJIS.map((emoji) => (
                <button type="button" key={emoji} onClick={() => insert(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </Popover>
          <button
            className="send"
            aria-label="Enviar mensagem"
            disabled={!body.trim()}
          >
            <Icon name="send" size={18} />
          </button>
        </div>
        <footer>
          <span>Enter para enviar · texto simples</span>
          <span>{body.length}/4000</span>
        </footer>
      </form>
    </section>
  );
}
function Settings({
  panel,
  onClose,
  onError,
  onLogout,
}: {
  panel: string;
  onClose: () => void;
  onError: (s: string) => void;
  onLogout: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [notice, setNotice] = useState("");
  const load = () =>
    api<User[]>("/admin/accounts")
      .then(setUsers)
      .catch((e) => onError(e.message));
  useEffect(() => {
    if (panel === "admin") void load();
  }, [panel]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    try {
      if (panel === "admin") {
        await api("/admin/accounts", "POST", Object.fromEntries(d));
        setNotice("Conta criada. Entregue a senha por um canal privado.");
        form.reset();
        await load();
      } else {
        await api("/password", "POST", Object.fromEntries(d));
        onLogout();
      }
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <section className="settings">
      <button className="text-button" onClick={onClose}>
        ← Voltar à conversa
      </button>
      <h2>{panel === "admin" ? "Gerenciar contas" : "Alterar minha senha"}</h2>
      <p className="muted">
        Senhas precisam ter pelo menos 12 caracteres (máximo de 72 bytes).
      </p>
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={(e) => void submit(e)}>
        {panel === "admin" ? (
          <>
            <label>
              Usuário
              <input
                name="username"
                required
                pattern="[a-z0-9][a-z0-9_.-]{2,31}"
                maxLength={32}
              />
            </label>
            <label>
              Nome de exibição
              <input name="displayName" required maxLength={64} />
            </label>
          </>
        ) : (
          <label>
            Senha atual
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
        )}
        <label>
          {panel === "admin" ? "Senha inicial" : "Nova senha"}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <button className="primary">
          {panel === "admin" ? "Criar conta" : "Alterar senha e sair"}
        </button>
      </form>
      {users.map((u) => (
        <div className="account-row" key={u.id}>
          <div>
            <strong>{u.displayName}</strong>
            <small>
              @{u.username} · {u.enabled ? "ativa" : "desativada"}
              {u.admin ? " · admin" : ""}
            </small>
          </div>
          {!u.admin && (
            <button
              onClick={() =>
                void api("/admin/accounts/" + u.username, "PATCH", {
                  enabled: !u.enabled,
                })
                  .then(load)
                  .catch((e) => onError(e.message))
              }
            >
              {u.enabled ? "Desativar" : "Reativar"}
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget,
                p = new FormData(f).get("password");
              void api("/admin/accounts/" + u.username, "PATCH", {
                password: p,
              })
                .then(() => {
                  f.reset();
                  setNotice("Senha redefinida; sessões invalidadas.");
                })
                .catch((e) => onError(e.message));
            }}
          >
            <input
              aria-label={"Nova senha de " + u.username}
              name="password"
              type="password"
              minLength={12}
              required
              placeholder="Nova senha"
            />
            <button>Redefinir</button>
          </form>
        </div>
      ))}
    </section>
  );
}
