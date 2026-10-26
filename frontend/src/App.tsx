import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, login, type User, type Message } from "./api";
import { Voice } from "./Voice";
export default function App() {
  const [me, setMe] = useState<{ user: User; spaceName: string } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
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
    void load();
  }, [load]);
  if (loading) return <main className="loading">Preparando o seu espaço…</main>;
  if (!me) return <Login onLogin={load} />;
  return (
    <Workspace
      me={me}
      error={error}
      onError={setError}
      onLogout={() => {
        setMe(null);
        setError("");
      }}
    />
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
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
      <div className="login-art">
        <div className="brand">
          <span className="brand-icon">a</span> entre amigos
        </div>
        <span className="eyebrow">SEU CANTO DA INTERNET</span>
        <h1>
          Boa conversa.
          <br />
          Boa companhia.
        </h1>
        <p>
          Um espaço só de vocês.
          <br />
          Para jogar, compartilhar e ficar mais um pouco.
        </p>
        <div className="orbit">
          <i />
          <i />
          <i />
          <span>✳</span>
        </div>
        <div className="login-foot">Sem distrações. Com seus amigos.</div>
      </div>
      <section className="login-form">
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
  onLogout,
}: {
  me: { user: User; spaceName: string };
  error: string;
  onError: (s: string) => void;
  onLogout: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [online, setOnline] = useState<string[]>([]),
    [connected, setConnected] = useState(false),
    [body, setBody] = useState(""),
    [more, setMore] = useState(true),
    [panel, setPanel] = useState(""),
    [pending, setPending] = useState<{ clientId: string; body: string }[]>([]);
  const initialized = useRef(false);
  const latest = useRef(0),
    queue = useRef(pending),
    bottom = useRef<HTMLDivElement>(null);
  queue.current = pending;
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
  }, [merge]);
  const browsingHistory = useRef(false);
  useEffect(() => {
    if (!browsingHistory.current)
      bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending.length]);
  async function older() {
    browsingHistory.current = true;
    try {
      const rows = await api<Message[]>("/messages?before=" + messages[0]?.id);
      merge(rows);
      setMore(rows.length === 50);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    browsingHistory.current = false;
    const msg = { clientId: crypto.randomUUID(), body };
    setPending((old) => [...old, msg]);
    setBody("");
    void send(msg);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">a</span>
          <span>
            {me.spaceName}
            <small>UM ESPAÇO SÓ NOSSO</small>
          </span>
        </div>
        <div className="sidebar-section">
          <span className="eyebrow">NOSSO ESPAÇO</span>
          <button className="channel selected" onClick={() => setPanel("")}>
            <span>#</span> geral <i />
          </button>
          <a className="channel" href="#voice">
            <span>◌</span> Sala de estar
          </a>
        </div>
        <div className="online">
          <span className="eyebrow">NA PÁGINA · {online.length}</span>
          {online.map((name) => (
            <div className="online-user" key={name}>
              <span className="mini-avatar">
                {name.slice(0, 2).toUpperCase()}
              </span>
              {name}
              <span className="dot green" />
            </div>
          ))}
        </div>
        <div className="sidebar-note">
          <span>✳</span>
          <p>
            O melhor daqui
            <br />é quem está aqui.
          </p>
        </div>
        <div className="account">
          <span className="avatar">
            {me.user.displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{me.user.displayName}</strong>
            <button className="text-button" onClick={() => setPanel("account")}>
              Minha conta
            </button>
          </div>
          <button
            className="icon-button"
            aria-label="Sair"
            onClick={() =>
              void api("/logout", "POST")
                .then(onLogout)
                .catch((e) => onError(e.message))
            }
          >
            ↗
          </button>
        </div>
        {me.user.admin && (
          <button className="admin-link" onClick={() => setPanel("admin")}>
            Gerenciar contas
          </button>
        )}
      </aside>
      <main className="chat">
        <header className="chat-header">
          <div>
            <h1>
              <span>#</span> geral
            </h1>
            <p>O ponto de encontro de todo dia.</p>
          </div>
          <span className="connection">
            <span className={"dot " + (connected ? "green" : "")} />
            {connected ? "Conectado" : "Reconectando…"}
          </span>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Fechar aviso" onClick={() => onError("")}>
              ×
            </button>
          </div>
        )}
        {panel ? (
          <Settings
            panel={panel}
            onClose={() => setPanel("")}
            onError={onError}
            onLogout={onLogout}
          />
        ) : (
          <>
            <div
              className="messages"
              aria-label="Mensagens"
              onScroll={(e) => {
                const el = e.currentTarget;
                browsingHistory.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight > 100;
              }}
            >
              <div className="welcome">
                <div className="welcome-symbol">#</div>
                <span className="eyebrow">A CONVERSA COMEÇA AQUI</span>
                <h2>Esse é o nosso lugar.</h2>
                <p>
                  Um oi, uma partida, uma história pra contar.
                  <br />
                  Fique à vontade.
                </p>
              </div>
              {more && messages.length >= 50 && (
                <button className="load-more" onClick={() => void older()}>
                  Carregar mensagens anteriores
                </button>
              )}
              <div role="log" aria-live="polite" aria-relevant="additions">
                {messages.map((m) => (
                  <article className="message" key={m.id}>
                    <span
                      className={
                        "avatar " + (m.authorId === me.user.id ? "self" : "")
                      }
                    >
                      {m.author.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <header>
                        <strong>{m.author}</strong>
                        <time
                          dateTime={m.createdAt}
                          title={new Date(m.createdAt).toLocaleString("pt-BR")}
                        >
                          {new Date(m.createdAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </header>
                      <p>{m.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              {pending.map((p) => (
                <div className="pending" key={p.clientId}>
                  <p>{p.body}</p>
                  <span>Aguardando confirmação · </span>
                  <button onClick={() => void send(p)}>Tentar novamente</button>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form className="composer" onSubmit={submit}>
              <label htmlFor="message" className="sr-only">
                Mensagem em geral
              </label>
              <div>
                <input
                  id="message"
                  placeholder="Converse com seus amigos…"
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  autoComplete="off"
                />
                <button
                  className="send"
                  aria-label="Enviar mensagem"
                  disabled={!body.trim()}
                >
                  ↑
                </button>
              </div>
              <footer>
                <span>Enter para enviar · texto simples</span>
                <span>{body.length}/4000</span>
              </footer>
            </form>
          </>
        )}
      </main>
      <aside className="right-panel" id="voice">
        <Voice admin={me.user.admin} onError={onError} />
        <div className="privacy-note">
          <span>◇</span> Privado, do nosso jeito.
          <br />
          <small>Só pessoas convidadas têm acesso.</small>
        </div>
      </aside>
    </div>
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
