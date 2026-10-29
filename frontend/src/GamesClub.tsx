import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, type User } from "./api";
import { pocketColor } from "./rouletteRules";
const RouletteWheel = lazy(() => import("./RouletteWheel"));
import { PartyClub } from "./PartyClub";
import { SlotMachine } from "./SlotMachine";
import "./games.css";
import "./casino.css";
export type GamePlayer = {
  id: string;
  name: string;
  departed: boolean;
  choice: string | null;
  amount: number | null;
  payout: number | null;
  refunded: boolean | null;
};
export type GameRoom = {
  id: string;
  hostId: string;
  solo: boolean;
  status: string;
  startsAt: number;
  endsAt: number;
  roundId: string;
  number: number | null;
  players: GamePlayer[];
  recent: { number: number }[];
};
export type ClubState = {
  serverNow: number;
  balance: number;
  earnedToday: number;
  spinsLeft: number;
  history: { id: number; amount: number; reason: string; createdAt: number }[];
  leaderboard: { name: string; coins: number }[];
  rooms: { id: string; host: string; players: number }[];
  room: GameRoom | null;
};
const OUTSIDE = [
  ["red", "Vermelho", "2×"],
  ["black", "Preto", "2×"],
  ["even", "Par", "2×"],
  ["odd", "Ímpar", "2×"],
  ["low", "1–18", "2×"],
  ["high", "19–36", "2×"],
  ["dozen1", "1ª dúzia", "3×"],
  ["dozen2", "2ª dúzia", "3×"],
  ["dozen3", "3ª dúzia", "3×"],
];
export const choiceLabel = (choice: string) =>
  choice.startsWith("n:")
    ? `Número ${choice.slice(2)}`
    : (OUTSIDE.find((c) => c[0] === choice)?.[1] ?? choice);
const format = (value: number) => value.toLocaleString("pt-BR");
export function GamesClub({
  me,
  voiceIdentity,
  onOpenVoice,
}: {
  me: User;
  voiceIdentity?: string;
  onOpenVoice?: () => void;
}) {
  const [state, setState] = useState<ClubState | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reels, setReels] = useState("012"),
    [spinning, setSpinning] = useState(false),
    [spinReady, setSpinReady] = useState(false),
    [code, setCode] = useState(""),
    [tab, setTab] = useState("jogar"),
    [choice, setChoice] = useState("red"),
    [amount, setAmount] = useState("10"),
    [clock, setClock] = useState(Date.now());
  const [partyActive, setPartyActive] = useState(false);
  const mounted = useRef(true),
    polling = useRef(false),
    pending = useRef(false),
    offset = useRef(0);
  const spinRequest = useRef<string | null>(null),
    createRequest = useRef<{ clientId: string; solo: boolean } | null>(null),
    betRequest = useRef<{
      clientId: string;
      roundId: string;
      choice: string;
      amount: number;
    } | null>(null),
    nextRequest = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const sent = Date.now();
    try {
      const next = await api<ClubState>("/games");
      if (mounted.current) {
        offset.current = next.serverNow - (sent + Date.now()) / 2;
        setState(next);
      }
    } finally {
      polling.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (!document.hidden)
        void load().catch((e) => {
          if (mounted.current) setError(e.message);
        });
    };
    refresh();
    const id = setInterval(refresh, 1500);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);
  const room = state?.room,
    own = room?.players.find((p) => p.id === me.id),
    active =
      partyActive || (!!room && ["waiting", "running"].includes(room.status));
  useEffect(() => {
    if (!room) return;
    const beat = () => {
      void api(`/games/rooms/${room.id}/presence`, "POST").catch(() => {});
    };
    beat();
    const id = setInterval(beat, 7000);
    return () => clearInterval(id);
  }, [room?.id]);
  useEffect(() => {
    if (room?.status !== "running") return;
    const id = setInterval(() => setClock(Date.now() + offset.current), 100);
    return () => clearInterval(id);
  }, [room?.status]);
  async function run(action: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function create(solo: boolean) {
    void run(async () => {
      if (!createRequest.current || createRequest.current.solo !== solo)
        createRequest.current = { clientId: crypto.randomUUID(), solo };
      await api("/games/rooms", "POST", createRequest.current);
      createRequest.current = null;
    });
  }
  function act(action: string) {
    if (room) void run(() => api(`/games/rooms/${room.id}/${action}`, "POST"));
  }
  function spin() {
    void run(async () => {
      spinRequest.current ??= crypto.randomUUID();
      setSpinning(true);
      setSpinReady(false);
      try {
        const result = await api<{ symbols: string; reward: number }>(
          "/games/spin",
          "POST",
          { clientId: spinRequest.current },
        );
        if (mounted.current) {
          setReels(result.symbols);
          setSpinReady(true);
        }
        await new Promise((resolve) => setTimeout(resolve, 5500));
        if (mounted.current)
          setNotice(
            `+${result.reward} Coins! ${new Set(result.symbols).size === 1 ? "TRINCA! O salão é seu." : "As fichas já estão na sua carteira."}`,
          );
        spinRequest.current = null;
      } finally {
        if (mounted.current) {
          setSpinning(false);
          setSpinReady(false);
        }
      }
    });
  }
  function bet() {
    if (!room) return;
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) {
      setError("Informe uma quantidade inteira de Coins maior que zero.");
      return;
    }
    void run(async () => {
      if (
        !betRequest.current ||
        betRequest.current.roundId !== room.roundId ||
        betRequest.current.choice !== choice ||
        betRequest.current.amount !== value
      )
        betRequest.current = {
          clientId: crypto.randomUUID(),
          roundId: room.roundId,
          choice,
          amount: value,
        };
      await api(`/games/rooms/${room.id}/bet`, "POST", betRequest.current);
      betRequest.current = null;
      setNotice("Aposta confirmada. Suas Coins estão na mesa!");
    });
  }
  function next() {
    if (room)
      void run(async () => {
        nextRequest.current ??= crypto.randomUUID();
        await api(`/games/rooms/${room.id}/next`, "POST", {
          clientId: nextRequest.current,
        });
        nextRequest.current = null;
      });
  }
  async function invite() {
    if (!room) return;
    await api("/messages", "POST", {
      clientId: crypto.randomUUID(),
      body: `♛ A mesa está aberta! Bora jogar roleta no Clube da Sorte? Código da sala: ${room.id}`,
    });
    setNotice("Convite enviado no #geral!");
  }
  const joined = room?.players.filter((p) => !p.departed) ?? [],
    confirmed = joined.filter((p) => p.amount !== null && !p.refunded),
    canBet = room?.status === "waiting" && !own?.amount;
  return (
    <section className="club" aria-label="Clube da Sorte">
      <header className="club-top">
        <a
          className="club-wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("jogar");
          }}
        >
          <span>✦</span> CLUBE
          <span className="club-wordmark-small">DA SORTE</span>
        </a>
        <div className="club-wallet">
          <span className="club-coin">C</span>
          <div>
            <small>SUA CARTEIRA</small>
            <strong>
              {state ? format(state.balance) : "—"} <em>Coins</em>
            </strong>
          </div>
        </div>
      </header>
      <nav className="club-tabs" aria-label="Seções do clube">
        {[
          ["jogar", "O salão"],
          ["ranking", "Pódio da semana"],
          ["extrato", "Minhas Coins"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span>♛ FAITES VOS JEUX</span>
      </nav>
      {import.meta.env.MODE === "demo" && (
        <div className="club-notice">
          Modo demo · Coins e participantes simulados.
        </div>
      )}
      {error && (
        <div className="club-alert" role="alert">
          {error}
          <button
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Atualizar
          </button>
        </div>
      )}
      {notice && (
        <div className="club-notice" role="status">
          {notice}
        </div>
      )}
      {!state ? (
        <p className="club-loading">Preparando as mesas…</p>
      ) : (
        <>
          {tab === "jogar" && (
            <>
              <div className="club-hero casino-hero">
                <div>
                  <span className="club-eyebrow">BEM-VINDO AO SALÃO</span>
                  <h1>
                    Puxe a sorte.
                    <br />
                    Faça sua aposta.
                    <br />
                    <i>A noite é de vocês.</i>
                  </h1>
                  <p>
                    O brilho das fichas. O suspense da última volta.
                    <br />
                    Seu cassino, na companhia de sempre.
                  </p>
                  <button
                    className="club-primary"
                    disabled={busy || active}
                    onClick={() => create(false)}
                  >
                    ♛ Abrir mesa de roleta <span>→</span>
                  </button>
                  <small>
                    Até 8 amigos · Coins virtuais · uma mesa só de vocês
                  </small>
                </div>
                <div className="club-hero-art" aria-hidden="true">
                  <div className="club-orbit" />
                  <span className="club-art-star">✦</span>
                  <div className="club-art-token">
                    C<span>ENTRE AMIGOS</span>
                  </div>
                  <span className="club-art-card">♣</span>
                  <span className="club-art-dot">✦</span>
                  <span className="club-art-label">
                    O PRÓXIMO GIRO
                    <br />
                    PODE SER O SEU.
                  </span>
                </div>
              </div>
              {room && (
                <section
                  className="club-room roulette-room"
                  aria-label="Sala de Roleta"
                >
                  <div className="club-section-heading">
                    <div>
                      <span className="club-eyebrow">
                        MESA PRIVADA · EUROPEIA · ZERO ÚNICO
                      </span>
                      <h2>
                        Roleta Royale{" "}
                        <span className="club-status">
                          {
                            (
                              {
                                waiting: "Apostas abertas",
                                running: "Nada mais!",
                                finished: "Resultado",
                              } as Record<string, string>
                            )[room.status]
                          }
                        </span>
                      </h2>
                    </div>
                    <button
                      className="club-quiet"
                      disabled={busy}
                      onClick={() => act("leave")}
                    >
                      Sair da mesa →
                    </button>
                  </div>
                  <div className="roulette-theatre">
                    <Suspense
                      fallback={
                        <div className="roulette-stage">
                          Preparando a roleta 3D…
                        </div>
                      }
                    >
                      <RouletteWheel
                        number={room.number}
                        startsAt={room.startsAt}
                        endsAt={room.endsAt}
                        serverNow={state.serverNow}
                        running={room.status === "running"}
                      />
                    </Suspense>
                    <div className="roulette-announcer" aria-live="polite">
                      {room.status === "finished" ? (
                        <>
                          <span
                            className={`roulette-result-number ${pocketColor(room.number!)}`}
                          >
                            {room.number}
                          </span>
                          <strong>
                            {room.number === 0
                              ? "Zero! A casa é verde."
                              : `${room.number} · ${pocketColor(room.number!) === "red" ? "Vermelho" : "Preto"}`}
                          </strong>
                          <small>
                            {own?.amount
                              ? own.payout
                                ? `Retorno de ${format(own.payout)} Coins (inclui sua aposta).`
                                : "Não foi desta vez. A próxima rodada está logo ali."
                              : "Uma nova história a cada giro."}
                          </small>
                        </>
                      ) : room.status === "running" ? (
                        <>
                          <span className="roulette-live-dot" />
                          <strong>
                            {clock < room.startsAt
                              ? "A bola vai entrar…"
                              : "A sorte está na roda."}
                          </strong>
                          <small>
                            Apostas encerradas ·{" "}
                            {Math.max(
                              0,
                              Math.ceil((room.endsAt - clock) / 1000),
                            )}
                            s
                          </small>
                        </>
                      ) : (
                        <>
                          <span className="roulette-live-dot open" />
                          <strong>Escolha sua sorte.</strong>
                          <small>
                            Confirme a aposta. O anfitrião gira quando todos
                            estiverem prontos.
                          </small>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="roulette-players">
                    {joined.map((p) => (
                      <div key={p.id} className={p.id === me.id ? "is-me" : ""}>
                        <span>{p.name.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>
                            {p.name}
                            {p.id === room.hostId ? " ♛" : ""}
                            {p.id === me.id ? " (você)" : ""}
                          </strong>
                          <small>
                            {p.amount && !p.refunded
                              ? `${choiceLabel(p.choice!)} · ${format(p.amount)} C`
                              : "Escolhendo a aposta…"}
                          </small>
                        </div>
                        {room.status === "finished" &&
                        p.amount &&
                        !p.refunded ? (
                          <b className={p.payout ? "won" : "lost"}>
                            {p.payout
                              ? `+${format(p.payout)} C`
                              : "Sem retorno"}
                          </b>
                        ) : p.amount && !p.refunded ? (
                          <b>✓</b>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {room.status === "waiting" && (
                    <>
                      <div className="roulette-betting">
                        <div className="roulette-ticket">
                          <span className="club-eyebrow">
                            SUA FICHA, SUA ESCOLHA
                          </span>
                          <h3>
                            {own?.amount ? "Aposta na mesa." : "Onde vai cair?"}
                          </h3>
                          <p>
                            Um bilhete por rodada. Aposte qualquer quantidade
                            inteira até o seu saldo.
                          </p>
                          <label>
                            Coins na aposta
                            <input
                              aria-label="Coins na aposta"
                              inputMode="numeric"
                              type="number"
                              min="1"
                              step="1"
                              value={amount}
                              disabled={busy || !canBet}
                              onChange={(e) => setAmount(e.target.value)}
                            />
                          </label>
                          <div className="roulette-chip-row">
                            {[1, 10, 50, 100].map((n) => (
                              <button
                                key={n}
                                disabled={busy || !canBet}
                                onClick={() => setAmount(String(n))}
                              >
                                +{n}
                              </button>
                            ))}
                            <button
                              disabled={busy || !canBet || !state.balance}
                              onClick={() => setAmount(String(state.balance))}
                            >
                              Tudo
                            </button>
                          </div>
                          <div className="roulette-ticket-choice">
                            <small>
                              {own?.amount
                                ? "APOSTA CONFIRMADA"
                                : "SELEÇÃO ATUAL"}
                            </small>
                            <strong>
                              {choiceLabel(own?.choice ?? choice)}
                            </strong>
                            <span>
                              {own?.amount
                                ? `${format(own.amount)} Coins reservadas`
                                : `Retorno: ${choice.startsWith("n:") ? 36 : choice.startsWith("dozen") ? 3 : 2}× a aposta`}
                            </span>
                          </div>
                          <button
                            className="club-gold"
                            disabled={busy || !canBet || state.balance === 0}
                            onClick={bet}
                          >
                            {own?.amount
                              ? "✓ Aposta confirmada"
                              : "Confirmar aposta"}
                          </button>
                          <small>
                            O retorno inclui a ficha apostada. O zero perde
                            todas as apostas externas.
                          </small>
                        </div>
                        <div
                          className="roulette-felt"
                          aria-label="Tapete de apostas"
                        >
                          <div className="roulette-number-grid">
                            <button
                              className={`green zero ${choice === "n:0" ? "selected" : ""}`}
                              disabled={!canBet || busy}
                              onClick={() => setChoice("n:0")}
                            >
                              0
                            </button>
                            {Array.from({ length: 36 }, (_, i) => {
                              const n =
                                Math.floor(i / 12) === 0
                                  ? (i % 12) * 3 + 3
                                  : Math.floor(i / 12) === 1
                                    ? (i % 12) * 3 + 2
                                    : (i % 12) * 3 + 1;
                              return (
                                <button
                                  key={n}
                                  aria-label={`Apostar no número ${n}`}
                                  className={`${pocketColor(n)} ${choice === `n:${n}` ? "selected" : ""}`}
                                  disabled={!canBet || busy}
                                  onClick={() => setChoice(`n:${n}`)}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                          <div className="roulette-outside">
                            {OUTSIDE.map(([id, label, pay]) => (
                              <button
                                key={id}
                                aria-pressed={choice === id}
                                className={`${id} ${choice === id ? "selected" : ""}`}
                                disabled={!canBet || busy}
                                onClick={() => setChoice(id)}
                              >
                                {id === "red"
                                  ? "◆ "
                                  : id === "black"
                                    ? "◆ "
                                    : ""}
                                {label}
                                <small>{pay}</small>
                              </button>
                            ))}
                          </div>
                          <p>
                            37 casas · número: 36× · dúzia: 3× · chances
                            simples: 2×
                            <br />
                            Probabilidades: 1/37, 12/37 e 18/37. Sem limite fixo
                            de aposta além do saldo.
                          </p>
                        </div>
                      </div>
                      <div className="roulette-table-actions">
                        <div>
                          <strong>
                            {confirmed.length}/{joined.length} apostas
                            confirmadas
                          </strong>
                          <small>
                            O giro bloqueia novas apostas para todos.
                          </small>
                        </div>
                        {room.hostId === me.id ? (
                          <button
                            className="club-gold"
                            disabled={
                              busy ||
                              confirmed.length === 0 ||
                              confirmed.length !== joined.length
                            }
                            onClick={() => act("start")}
                          >
                            Girar a roleta ♛
                          </button>
                        ) : (
                          <span className="club-tag">
                            AGUARDANDO O ANFITRIÃO
                          </span>
                        )}
                      </div>
                      <div className="club-room-code">
                        <code>{room.id}</code>
                        <button
                          disabled={busy}
                          onClick={() => void run(invite)}
                        >
                          Convidar no #geral
                        </button>
                      </div>
                      <p className="roulette-exit-note">
                        Sair antes do giro devolve sua aposta. Depois que a bola
                        entra, a aposta continua valendo e o prêmio vai para sua
                        carteira mesmo se você sair.
                      </p>
                    </>
                  )}
                  {room.status === "finished" && (
                    <div className="roulette-table-actions">
                      <p>Apostas e retornos registrados no extrato.</p>
                      {room.hostId === me.id ? (
                        <button
                          className="club-gold"
                          disabled={busy}
                          onClick={next}
                        >
                          Abrir próxima rodada ↻
                        </button>
                      ) : (
                        <span className="club-tag">
                          O ANFITRIÃO ABRE A PRÓXIMA
                        </span>
                      )}
                    </div>
                  )}
                  {!!room.recent.length && (
                    <div className="roulette-recent">
                      <small>ÚLTIMOS RESULTADOS</small>
                      {room.recent.map((r, i) => (
                        <span className={pocketColor(r.number)} key={i}>
                          {r.number}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              )}
              <div className="club-section-heading">
                <div>
                  <span className="club-eyebrow">
                    ESCOLHA SUA PRÓXIMA JOGADA
                  </span>
                  <h2>As máquinas estão prontas.</h2>
                </div>
                <span className="club-tag">UMA NOITE NO CASSINO</span>
              </div>
              <div className="club-games-grid">
                <article className="club-machine slot-card">
                  <div className="club-machine-top">
                    <span>O CLÁSSICO DE MANIVELA</span>
                    <span>01</span>
                  </div>
                  <h3>Giro da Sorte</h3>
                  <p>Três rolos. Uma puxada. Deixe o suspense girar.</p>
                  <SlotMachine
                    symbols={reels}
                    spinning={spinning}
                    settling={spinReady}
                    onPull={spin}
                    disabled={busy || state.spinsLeft === 0}
                    remaining={state.spinsLeft}
                  />
                  <button
                    className="club-gold"
                    disabled={busy || state.spinsLeft === 0}
                    onClick={spin}
                  >
                    {spinning
                      ? "A sorte está girando…"
                      : spinRequest.current
                        ? "Recuperar meu giro"
                        : "Girar grátis ↻"}
                  </button>
                  <details>
                    <summary>Probabilidades e giros grátis</summary>
                    <p>
                      4 símbolos independentes. Trinca: 30 Coins (6,25%); um
                      par: 8 (56,25%); diferentes: 2 (37,5%). Dez giros
                      gratuitos por dia UTC, com limite de 500 Coins emitidas.
                      Prêmios da roleta não usam esse limite.
                    </p>
                  </details>
                </article>
                <article className="club-skill-card roulette-card">
                  <div className="club-machine-top">
                    <span>A MESA MAIS DISPUTADA DO SALÃO</span>
                    <span>02</span>
                  </div>
                  <h3>Roleta Royale</h3>
                  <p>
                    Madeira polida, aro dourado e aquela última volta que faz
                    todo mundo prender a respiração.
                  </p>
                  <div className="roulette-card-art" aria-hidden="true">
                    <div className="roulette-card-dial">♛</div>
                    <span className="roulette-card-chip">100</span>
                    <span className="roulette-card-ball" />
                  </div>
                  <div className="club-machine-caption">
                    <span>1–8 jogadores</span>
                    <span>Roleta europeia · 3D</span>
                  </div>
                  <div className="club-actions">
                    <button
                      className="club-primary"
                      disabled={busy || active}
                      onClick={() => create(false)}
                    >
                      Criar mesa →
                    </button>
                    <button
                      disabled={busy || active}
                      onClick={() => create(true)}
                    >
                      Mesa individual
                    </button>
                  </div>
                  <small>
                    Aposte suas Coins em número, cor, dúzia, paridade ou faixa.
                  </small>
                </article>
              </div>
              <PartyClub
                me={me}
                voiceIdentity={voiceIdentity}
                onOpenVoice={onOpenVoice}
                onActiveChange={setPartyActive}
                blocked={!!room && ["waiting", "running"].includes(room.status)}
              />
              <section className="club-lobbies">
                <div className="club-section-heading">
                  <div>
                    <span className="club-eyebrow">AS MESAS ESTÃO ABERTAS</span>
                    <h2>Salas da galera</h2>
                  </div>
                  <span>{state.rooms.length} abertas</span>
                </div>
                <form
                  className="club-join"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(
                        code.trim(),
                      )
                    )
                      void run(() =>
                        api(`/games/rooms/${code.trim()}/join`, "POST"),
                      );
                    else setError("Cole o código completo da sala.");
                  }}
                >
                  <input
                    aria-label="Código da sala"
                    placeholder="Cole o código da mesa"
                    value={code}
                    maxLength={36}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button disabled={busy}>Entrar →</button>
                </form>
                {state.rooms.length ? (
                  state.rooms.map((r) => (
                    <div className="club-lobby-row" key={r.id}>
                      <span className="club-lobby-icon">♛</span>
                      <div>
                        <strong>Mesa de {r.host}</strong>
                        <small>Roleta Royale · {r.players}/8 jogadores</small>
                      </div>
                      <button
                        disabled={busy || r.players >= 8}
                        onClick={() =>
                          void run(() =>
                            api(`/games/rooms/${r.id}/join`, "POST"),
                          )
                        }
                      >
                        Entrar na mesa →
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="club-empty">
                    ♛<strong>Uma boa mesa começa com um convite.</strong>
                    <span>Crie a sua e chame os amigos no #geral.</span>
                  </div>
                )}
              </section>
              <div className="club-jukebox">
                <span className="club-record" aria-hidden="true">
                  ◉
                </span>
                <div>
                  <span className="club-eyebrow">
                    SUAS COINS VÃO VIRAR MÚSICA
                  </span>
                  <h2>A próxima é por sua conta.</h2>
                  <p>
                    Guarde suas fichas para escolher a trilha sonora da galera.
                  </p>
                </div>
                <span className="club-tag">COINS NA JUKEBOX · EM BREVE</span>
              </div>
            </>
          )}
          {tab === "ranking" && (
            <section className="club-ledger">
              <span className="club-eyebrow">AS FICHAS CONTAM HISTÓRIAS</span>
              <h1>Pódio da semana</h1>
              <p>
                Resultado líquido desde segunda-feira, 00h UTC. Apostas
                devolvidas não contam como ganhos.
              </p>
              {state.leaderboard.length ? (
                state.leaderboard.map((p, i) => (
                  <div className="club-ranking-row" key={i}>
                    <b>{["♛", "②", "③"][i] ?? `#${i + 1}`}</b>
                    <strong>{p.name}</strong>
                    <span>{format(p.coins)} Coins</span>
                  </div>
                ))
              ) : (
                <div className="club-empty">
                  A primeira ficha ainda vai cair.
                </div>
              )}
            </section>
          )}
          {tab === "extrato" && (
            <section className="club-ledger">
              <span className="club-eyebrow">CADA FICHA, UMA HISTÓRIA</span>
              <h1>Minhas Coins</h1>
              <div className="club-balance-big">
                <span className="club-coin">C</span>
                {format(state.balance)}
              </div>
              <p>
                {state.earnedToday}/500 Coins grátis emitidas hoje. Ganhos da
                roleta não têm limite diário. Coins não expiram.
              </p>
              <p>
                Moeda virtual, sem compra, transferência ou saque. A integração
                da fila de música com Coins está em desenvolvimento.
              </p>
              <h2>Últimas 20 movimentações</h2>
              {state.history.length ? (
                state.history.map((h) => (
                  <div className="club-ledger-row" key={h.id}>
                    <span>✦</span>
                    <div>
                      <strong>{h.reason}</strong>
                      <small>
                        {new Date(h.createdAt).toLocaleString("pt-BR")}
                      </small>
                    </div>
                    <b className={h.amount < 0 ? "debit" : ""}>
                      {h.amount >= 0 ? "+" : ""}
                      {format(h.amount)} C
                    </b>
                  </div>
                ))
              ) : (
                <div className="club-empty">
                  Puxe a manivela para ganhar suas primeiras Coins.
                </div>
              )}
            </section>
          )}
          <footer className="club-footer">
            <span>♛ ENTRE AMIGOS · CLUBE DA SORTE</span>
            <span>O cassino é virtual. A companhia é de verdade.</span>
          </footer>
        </>
      )}
    </section>
  );
}
