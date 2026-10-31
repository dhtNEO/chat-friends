import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import {
  ApiError,
  api,
  login,
  resetSession,
  type Member,
  type User,
  type Message,
} from "./api";
import {
  MfaGate,
  Reauthentication,
  type SecurityState,
} from "./AccountSecurity";
import { GamesClub } from "./GamesClub";
import {
  createChatSync,
  parseChatEvent,
  isMessage,
  chatStatusLabel,
  type ChatStatus,
} from "./ChatSync";
import { Outlook } from "./Outlook";
import { ChatComposer, limitMessage } from "./ChatComposer";
import { createChatOutbox, deliveryLabel, type Delivery } from "./ChatOutbox";
import { Voice } from "./Voice";
import { SimpleShell } from "./SimpleShell";
import { DESTINATIONS, useNavigation } from "./navigation";
import { MobileDrawer } from "./MobileDrawer";
import { useChatHistory, type HistoryPageState } from "./useChatHistory";
import { Icon, type IconName } from "./Icon";
import { Avatar, PeopleContext, avatarSrc, usePeople } from "./ui";
import { Profile } from "./Profile";
import { loadShortcuts, setShortcuts, useKeyboardShortcuts } from "./Shortcuts";
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
  } | null>(null);
  const [status, setStatus] = useState<
    "loading" | "anonymous" | "authenticated" | "unavailable"
  >("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [failure, setFailure] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [retrying, setRetrying] = useState(false);
  const [reauth, setReauth] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async (afterLogin = false) => {
    const id = ++sequence.current;
    setRetrying(true);
    try {
      const next = await api<NonNullable<typeof me>>("/me");
      if (id !== sequence.current) return;
      setMe(next);
      setStatus("authenticated");
      setFailure("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (afterLogin)
          throw new Error(
            "O login foi aceito, mas a sessão não foi mantida. Permita os cookies deste site e confira se está usando o endereço correto.",
          );
        return;
      }
      if (
        id !== sequence.current ||
        (e instanceof ApiError && e.code === "ABORTED")
      )
        return;
      setStatus("unavailable");
      setFailure((e as Error).message);
      setRetryAt(
        e instanceof ApiError && e.retryAfter ? Date.now() + e.retryAfter : 0,
      );
      // Keep an already mounted login form and its fields after accepted login.
    } finally {
      if (id === sequence.current) setRetrying(false);
    }
  }, []);
  useEffect(() => {
    const expired = () => {
      ++sequence.current;
      setMe(null);
      setStatus("anonymous");
      setShowLogin(true);
      setRetrying(false);
      setError("");
      setFailure("");
      setReauth("");
    };
    const confirm = (event: Event) =>
      setReauth((event as CustomEvent<{ path: string }>).detail.path);
    window.addEventListener("session-ended", expired);
    window.addEventListener("reauth-required", confirm);
    void load();
    return () => {
      ++sequence.current;
      window.removeEventListener("session-ended", expired);
      window.removeEventListener("reauth-required", confirm);
    };
  }, [load]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [retryAt]);
  useEffect(() => {
    applyTheme(me?.user.primaryColor, me?.user.secondaryColor);
  }, [me]);
  if (status === "loading")
    return <main className="loading">Preparando o seu espaço…</main>;
  return (
    <>
      {status === "unavailable" && (
        <section className="session-notice" role="alert">
          <p>{failure}</p>
          <button
            disabled={retrying || now < retryAt}
            onClick={() => void load()}
          >
            {retrying
              ? "Verificando sessão…"
              : now < retryAt
                ? `Aguarde ${Math.ceil((retryAt - now) / 1000)} segundos`
                : "Tentar novamente"}
          </button>
        </section>
      )}
      {!me ? (
        status === "anonymous" || showLogin ? (
          <Login
            notice={notice}
            onLogin={async () => {
              setNotice("");
              await load(true);
            }}
          />
        ) : null
      ) : me.security.mfaPending || me.security.enrollmentRequired ? (
        <MfaGate state={me.security} onDone={load} />
      ) : (
        <Workspace
          key={me.user.id}
          me={me}
          error={error}
          onError={setError}
          onRefresh={load}
          onLogout={(message = "") => {
            resetSession();
            ++sequence.current;
            setMe(null);
            setStatus("anonymous");
            setShowLogin(true);
            setError("");
            setFailure("");
            setReauth("");
            setNotice(message);
          }}
        />
      )}
      {reauth && me && (
        <Reauthentication
          path={reauth}
          mfaEnabled={me.security.mfaEnabled}
          onClose={() => setReauth("")}
        />
      )}
    </>
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
  useKeyboardShortcuts();
  const navigation = useNavigation(me.user.id);
  const advancedRef = useRef(navigation.advanced);
  advancedRef.current = navigation.advanced;
  const [simpleExtra, setSimpleExtra] = useState<PanelKind | null>(null);
  useEffect(() => setSimpleExtra(null), [navigation.destination]);
  const [miniHost, setMiniHost] = useState<HTMLDivElement | null>(null);
  const [stageHost] = useState(() => {
    const el = document.createElement("div");
    el.className = "slot";
    return el;
  });
  const stageParking = useRef<HTMLDivElement>(null);
  // A person's shortcuts load with their session and never outlive it.
  useEffect(() => {
    void loadShortcuts().catch(() => {});
    return () => setShortcuts(null);
  }, [me.user.id]);
  const [voiceIdentity, setVoiceIdentity] = useState<string>();
  const [members, setMembers] = useState<Member[]>([]);
  const loadMembers = useCallback(
    (signal?: AbortSignal) =>
      api<Member[]>("/members", "GET", undefined, { signal })
        .then((rows) => {
          if (!signal?.aborted) setMembers(rows);
        })
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void loadMembers(controller.signal);
    return () => controller.abort();
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
    [chatStatus, setChatStatus] = useState<ChatStatus>("connecting"),
    [historyPage, setHistoryPage] = useState<HistoryPageState>({
      phase: "idle",
      error: "",
    }),
    [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [chatError, setChatError] = useState("");
  const [slots, setSlots] = useState<Record<string, HTMLElement>>({}),
    [dock, setDock] = useState<DockviewApi | null>(null),
    [stageMaximized, setStageMaximized] = useState(false),
    [streamMaximized, setStreamMaximized] = useState(false);
  const chat = useRef<ReturnType<typeof createChatSync> | null>(null);
  const historyPending = useRef(false);
  const outbox = useRef<ReturnType<typeof createChatOutbox> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftMemory = useRef<Record<string, string>>({});
  const draftKey = `${me.user.id}:geral`;
  function changeDraft(value: string) {
    draftMemory.current = {
      ...draftMemory.current,
      [draftKey]: limitMessage(value),
    };
    setDrafts(draftMemory.current);
  }
  const hosts = useRef(new Map<string, { el: HTMLElement; frames: number }>());
  const attach = useCallback(
    (id: string) => {
      let host = hosts.current.get(id);
      if (!host) {
        const el = id === "voice" ? stageHost : document.createElement("div");
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
    },
    [stageHost],
  );
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
    if (!dock || !navigation.advanced) return;
    const saving = dock.onDidLayoutChange(() => {
      if (advancedRef.current) saveLayout(dock);
    });
    const maximized = dock.onDidMaximizedGroupChange(() => {
      setStageMaximized(!!dock.getPanel("voice")?.api.isMaximized());
      setStreamMaximized(!!dock.getPanel("stream")?.api.isMaximized());
    });
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
  }, [dock, navigation.advanced]);
  const merge = useCallback(
    (items: Message[]) => {
      setMessages((old) =>
        [...new Map([...old, ...items].map((m) => [m.id, m])).values()].sort(
          (a, b) => a.id - b.id,
        ),
      );
      outbox.current?.confirm(items);
    },
    [me.user.id],
  );
  useEffect(() => {
    let alive = true;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const sync = createChatSync({
      read: (after, signal) =>
        api<unknown>(
          after === undefined ? "/messages" : "/messages?after=" + after,
          "GET",
          undefined,
          { signal },
        ),
      merge,
      status: (status) => {
        setChatStatus(status);
        if (status === "updated") setChatError("");
      },
      error: (error) => setChatError(error.message),
    });
    const sender = createChatOutbox({
      authorId: me.user.id,
      post: (message, signal) =>
        api<unknown>("/messages", "POST", message, { signal }),
      saved: (message) => {
        merge([message]);
        sync.observe(message);
      },
      changed: setDeliveries,
    });
    outbox.current = sender;
    chat.current = sync;
    const connect = () => {
      if (!alive) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      socket = ws;
      let lastPong = Date.now();
      const active = () => alive && socket === ws;
      ws.onopen = () => {
        if (!active()) return;
        sync.connection(true);
        lastPong = Date.now();
        sender.connection(true);
        ping = setInterval(() => {
          if (!active()) return;
          if (Date.now() - lastPong > 35000) ws.close();
          else if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 10000);
      };
      ws.onmessage = (e) => {
        if (!active()) return;
        const event = parseChatEvent(e.data);
        if (!event) return;
        if (event.type === "message") sync.observe(event.message);
        if (event.type === "presence") setOnline(event.users);
        if (event.type === "pong") lastPong = Date.now();
        if (event.type === "profile") {
          void loadMembers(sync.signal);
          void onRefresh();
        }
      };
      ws.onclose = () => {
        if (!active()) return;
        clearInterval(ping);
        sync.connection(false);
        sender.connection(false);
        setOnline([]);
        retry = setTimeout(connect, 2000 + Math.random() * 1000);
      };
    };
    connect();
    return () => {
      alive = false;
      chat.current = null;
      outbox.current = null;
      sender.dispose();
      sync.dispose();
      clearTimeout(retry);
      clearInterval(ping);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = null;
        socket.close();
      }
    };
  }, [merge, loadMembers, onRefresh, onError, me.user.id]);
  async function older(): Promise<number | undefined> {
    const current = chat.current;
    const cursor = messages[0]?.id;
    if (
      !current ||
      cursor === undefined ||
      historyPending.current ||
      historyPage.phase === "end"
    )
      return;
    historyPending.current = true;
    setHistoryPage({ phase: "loading", error: "" });
    try {
      const rows = await api<Message[]>(
        "/messages?before=" + cursor,
        "GET",
        undefined,
        { signal: current.signal },
      );
      if (current !== chat.current || current.signal.aborted) return;
      if (
        !Array.isArray(rows) ||
        rows.length > 50 ||
        !rows.every(
          (row, i) =>
            isMessage(row) &&
            row.id < cursor &&
            (i === 0 || row.id > rows[i - 1].id),
        )
      )
        throw new Error("Resposta de histórico inválida.");
      merge(rows);
      setHistoryPage({ phase: rows.length < 50 ? "end" : "idle", error: "" });
      return rows.length;
    } catch (e) {
      if (current === chat.current && !current.signal.aborted)
        setHistoryPage({ phase: "error", error: (e as Error).message });
    } finally {
      historyPending.current = false;
    }
  }
  function post() {
    // Clear the shared memory synchronously: two submit events before React's
    // next render must consume the draft only once and allocate only one UUID.
    if (outbox.current?.enqueue(draftMemory.current[draftKey] ?? ""))
      changeDraft("");
  }
  const [drawer, setDrawer] = useState(false),
    [compact, setCompact] = useState(isCompact),
    [roster, setRoster] = useState<HTMLElement | null>(null),
    [quick, setQuick] = useState<HTMLElement | null>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const dismissDrawer = useCallback(() => setDrawer(false), []);
  useEffect(() => {
    const media = matchMedia(compactQuery),
      update = () => {
        setCompact(media.matches);
        setDrawer(false);
      };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (navigation.advanced && !slots.voice && stageParking.current)
      stageParking.current.appendChild(stageHost);
  }, [navigation.advanced, slots.voice, stageHost]);
  useEffect(() => {
    if (navigation.advanced && dock) {
      const kind = DESTINATIONS.find(
        ([id]) => id === navigation.destination,
      )![2];
      openPanel(dock, kind);
    }
  }, [navigation.destination, navigation.advanced, dock]);
  const switchMode = (advanced: boolean) => {
    if (!advanced) {
      if (dock) saveLayout(dock);
      setDock(null);
      setStageMaximized(false);
      setStreamMaximized(false);
    }
    setDrawer(false);
    setSimpleExtra(null);
    navigation.setAdvanced(advanced);
  };
  const open = (kind: PanelKind) => {
    const destination = DESTINATIONS.find(([, , panel]) => panel === kind)?.[0];
    if (destination) {
      setSimpleExtra(null);
      navigation.navigate(destination);
    }
    if (!navigation.advanced) {
      if (
        !destination &&
        (kind === "stream" || kind === "music" || kind === "voice")
      )
        navigation.navigate("sala");
      else if (!destination) setSimpleExtra(kind);
      return;
    }
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
          chatStatus={chatStatus}
          chatError={chatError}
          messages={messages}
          deliveries={deliveries}
          body={drafts[draftKey] ?? ""}
          onDraft={changeDraft}
          historyPage={historyPage}
          onOlder={older}
          onSend={post}
          onRetry={(clientId) => outbox.current?.retry(clientId)}
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
    if (kind === "admin" && me.user.admin)
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
      <SimpleShell
        advanced={navigation.advanced}
        destination={navigation.destination}
        navigate={(d) => {
          setSimpleExtra(null);
          navigation.navigate(d);
        }}
        stageHost={stageHost}
        render={content}
        extra={simpleExtra}
        onExtra={setSimpleExtra}
        admin={me.user.admin}
        onAdvanced={() => switchMode(true)}
        onMiniHost={setMiniHost}
        error={error}
        onError={onError}
        onLogout={() =>
          void api("/logout", "POST")
            .then(() => onLogout())
            .catch((e) => onError(e.message))
        }
      />
      <div
        hidden={!navigation.advanced}
        className={
          "app-shell" +
          (drawer ? " drawer-open" : "") +
          (compact ? " compact" : "")
        }
      >
        {compact && (
          <MobileDrawer
            id="mobile-navigation"
            open={drawer}
            onDismiss={dismissDrawer}
            trigger={menuTrigger}
          >
            {sidebar}
          </MobileDrawer>
        )}
        <nav className="activity-bar" aria-label="Painéis">
          {!compact && <Logo size={34} />}
          <ActivityButton
            icon="menu"
            label="Navegação simples"
            title="Voltar à navegação simples"
            onClick={() => switchMode(false)}
          />
          <ActivityButton
            buttonRef={menuTrigger}
            expanded={compact ? drawer : undefined}
            controls={compact ? "mobile-navigation" : undefined}
            popup={compact ? "dialog" : undefined}
            icon="menu"
            label={compact ? "Abrir menu" : "Mostrar canais"}
            title="Canais"
            active={compact ? drawer : !!slots.nav}
            onClick={() => {
              if (compact) setDrawer((current) => !current);
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
            icon="screen"
            label="Painel da transmissão"
            title="Separar transmissão"
            active={!!slots.stream}
            onClick={() => open("stream")}
          />
          <ActivityButton
            icon="music"
            label="Painel do bot de música"
            title="Separar música"
            active={!!slots.music}
            onClick={() => open("music")}
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
            {navigation.advanced && (
              <DockviewReact
                className="dock"
                theme={theme}
                components={{ slot: Slot }}
                watermarkComponent={Empty}
                onReady={ready}
              />
            )}
          </SlotContext>
        </div>
        {Object.entries(slots).map(([id, el]) =>
          createPortal(content(id), el, id),
        )}
        <div hidden ref={stageParking} />
        <Voice
          allowDock={navigation.advanced}
          key={me.user.id}
          userId={me.user.id}
          onIdentityChange={setVoiceIdentity}
          admin={me.user.admin}
          hosts={{
            stage: stageHost,
            miniPlayer: navigation.advanced ? null : miniHost,
            stream: slots.stream ?? null,
            music: slots.music ?? null,
            roster,
            quick,
          }}
          maximized={stageMaximized}
          streamMaximized={streamMaximized}
          onSeparate={(kind) => open(kind)}
          onReturn={(kind) => {
            close(kind);
            open("voice");
          }}
          onOpen={() => open("voice")}
          onStreaming={(active) => {
            streaming.current = active;
            if (active) open(dock?.getPanel("stream") ? "stream" : "voice");
          }}
          onMaximizeStream={() => {
            const panel = dock?.getPanel(slots.stream ? "stream" : "voice");
            if (!panel) return;
            if (panel.api.isMaximized()) panel.api.exitMaximized();
            else panel.api.maximize();
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
  buttonRef,
  expanded,
  controls,
  popup,
  icon,
  label,
  title,
  active = false,
  badge,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  expanded?: boolean;
  controls?: string;
  popup?: "dialog";
  icon: IconName;
  label: string;
  title: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      className={"activity" + (active ? " active" : "")}
      aria-label={label}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-haspopup={popup}
      title={title}
      onClick={onClick}
    >
      <Icon name={icon} />
      {!!badge && <small>{badge}</small>}
    </button>
  );
}
// Turns http(s) and www. addresses into links; everything else stays text,
// so messages can never inject markup.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;
function Linkified({ text }: { text: string }) {
  const parts: (string | { href: string; label: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const label = match[0],
      start = match.index ?? 0;
    parts.push(text.slice(last, start));
    parts.push({
      href: /^https?:/i.test(label) ? label : "https://" + label,
      label,
    });
    last = start + label.length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {part.label}
          </a>
        ),
      )}
    </>
  );
}
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
  chatStatus,
  chatError,
  messages,
  deliveries,
  body,
  onDraft,
  historyPage,
  onOlder,
  onSend,
  onRetry,
}: {
  me: User;
  chatStatus: ChatStatus;
  chatError: string;
  messages: Message[];
  deliveries: Delivery[];
  body: string;
  onDraft: (value: string) => void;
  historyPage: HistoryPageState;
  onOlder: () => Promise<number | undefined>;
  onSend: () => void;
  onRetry: (clientId: string) => void;
}) {
  const pending = deliveries.filter((entry) => entry.state !== "confirmed");
  const confirmed = new Set(
    deliveries
      .filter((entry) => entry.state === "confirmed")
      .map((entry) => entry.clientId),
  );
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const until = Math.max(0, ...deliveries.map((entry) => entry.retryAt));
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [deliveries]);
  const directory = usePeople();
  // Show today's name and photo, even on old messages.
  const author = (m: Message) => {
    const who = directory.byId.get(m.authorId);
    return { name: who?.displayName ?? m.author, src: avatarSrc(who) };
  };
  const timeline = useChatHistory(
    messages,
    pending.length,
    historyPage,
    chatStatus === "updated",
    onOlder,
  );
  const visible = timeline.visible;
  return (
    <section className="chat">
      <header className="chat-header">
        <div>
          <h1>
            <Icon name="hash" size={18} /> geral
          </h1>
          <p>O ponto de encontro de todo dia.</p>
        </div>
        <span
          className="connection"
          role="status"
          aria-live="polite"
          title={chatError || undefined}
        >
          <span
            className={"dot " + (chatStatus === "updated" ? "green" : "")}
          />
          {chatStatusLabel[chatStatus]}
        </span>
      </header>
      <div
        className="messages"
        aria-label="Mensagens"
        role="region"
        tabIndex={0}
        ref={timeline.viewport}
        onScroll={timeline.onScroll}
        onFocus={(event) => {
          if (event.target === event.currentTarget) timeline.pauseReading();
        }}
      >
        <div ref={timeline.content}>
          {timeline.start === 0 &&
            (messages.length < 50 || historyPage.phase === "end") && (
              <div className="welcome">
                <div className="welcome-symbol">
                  <Icon name="hash" size={28} />
                </div>
                <h2>Esse é o nosso lugar.</h2>
                <p>
                  Um oi, uma partida, uma história pra contar. Fique à vontade.
                </p>
              </div>
            )}
          <p className="chat-window-label">
            Exibindo {messages.length ? timeline.start + 1 : 0}–{timeline.end}{" "}
            de {messages.length} mensagens carregadas
          </p>
          <button
            className="load-more"
            disabled={
              !timeline.canPrevious ||
              timeline.selectionActive ||
              historyPage.phase === "loading"
            }
            onClick={() => void timeline.previous()}
          >
            {historyPage.phase === "loading"
              ? "Carregando anteriores…"
              : historyPage.phase === "error" && timeline.start === 0
                ? "Tentar carregar anteriores"
                : "Carregar mensagens anteriores"}
          </button>
          <p
            className="chat-page-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {historyPage.phase === "loading"
              ? "Carregando mensagens anteriores…"
              : timeline.notice ||
                (!timeline.canPrevious ? "Início do histórico." : "")}
          </p>
          {historyPage.phase === "error" && (
            <p className="error" role="alert">
              {historyPage.error}
            </p>
          )}
          <div role="list" aria-label="Histórico de mensagens" aria-live="off">
            {visible.map((m, i) => {
              const at = new Date(m.createdAt),
                prev = visible[i - 1],
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
                <div key={m.id} role="listitem">
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
                      <p data-message-id={m.id}>
                        <Linkified text={m.body} />
                      </p>
                      {m.authorId === me.id && confirmed.has(m.clientId) && (
                        <small className="delivery-confirmed">Enviado</small>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
          {timeline.canNext && (
            <button
              className="load-more"
              disabled={timeline.selectionActive}
              onClick={timeline.next}
            >
              Mensagens mais recentes
            </button>
          )}
          {pending.map((p) => (
            <div className="pending" key={p.clientId} data-state={p.state}>
              <p>{p.body}</p>
              <span role="status">{deliveryLabel[p.state]}</span>
              {p.error && <p role="alert">{p.error}</p>}
              {p.state === "retryable-failure" && (
                <button
                  disabled={now < p.retryAt}
                  onClick={() => onRetry(p.clientId)}
                >
                  {now < p.retryAt
                    ? `Aguarde ${Math.ceil((p.retryAt - now) / 1000)} segundos`
                    : "Tentar novamente"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chat-new-messages">
        {!timeline.paused && (
          <button onClick={timeline.pauseReading}>Pausar acompanhamento</button>
        )}
        {timeline.unread > 0 && (
          <span>
            {timeline.unread}{" "}
            {timeline.unread === 1 ? "nova mensagem" : "novas mensagens"}
          </span>
        )}
        {timeline.paused && (
          <button disabled={timeline.selectionActive} onClick={timeline.recent}>
            Ir para recentes
          </button>
        )}
        {timeline.selectionActive && (
          <span>Seleção preservada. Termine a seleção para navegar.</span>
        )}
      </div>
      <div
        className="sr-only chat-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {timeline.announcement}
      </div>
      <ChatComposer body={body} onDraft={onDraft} onSend={onSend} />
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
