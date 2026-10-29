import { useCallback, useEffect, useRef, useState } from "react";
import { api, type User } from "./api";
import "./party.css";
export type PartyPlayer = {
  id: string;
  name: string;
  ready: boolean;
  departed: boolean;
  standing: boolean;
  hand: number[];
  total: number;
  score: number;
  hits: number;
  combo: number;
  bestCombo: number;
  reward: number;
};
export type PartyRoom = {
  id: string;
  hostId: string;
  kind: "blackjack" | "rhythm";
  status: string;
  startsAt: number;
  endsAt: number;
  players: PartyPlayer[];
  dealer: number[];
  dealerHidden: boolean;
  dealerTotal: number;
  title: string;
  videoId: string;
  notes: { at: number; lane: number }[];
  judged?: { note: number; points: number }[];
};
export type PartyState = {
  serverNow: number;
  room: PartyRoom | null;
  rooms: { id: string; kind: string; host: string; players: number }[];
};
type Song = { videoId: string; title: string; duration: number | null };
const KEYS = ["D", "F", "J", "K"],
  SUITS = ["♠", "♥", "♦", "♣"],
  RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function Card({ card, hidden = false }: { card?: number; hidden?: boolean }) {
  const rank = card === undefined ? "" : RANKS[card % 13],
    suit = card === undefined ? "" : SUITS[Math.floor(card / 13) % 4];
  return (
    <span
      className={`blackjack-card ${hidden ? "face-down" : suit === "♥" || suit === "♦" ? "red-suit" : ""}`}
      aria-label={hidden ? "Carta oculta" : `${rank} de ${suit}`}
    >
      <small>
        {hidden ? "✦" : rank}
        <i>{suit}</i>
      </small>
      <b>{hidden ? "♛" : suit}</b>
      <small>
        {rank}
        <i>{suit}</i>
      </small>
    </span>
  );
}
export function PartyClub({
  me,
  voiceIdentity,
  onOpenVoice,
  onActiveChange,
  blocked,
}: {
  me: User;
  voiceIdentity?: string;
  onOpenVoice?: () => void;
  onActiveChange: (active: boolean) => void;
  blocked: boolean;
}) {
  const [data, setData] = useState<PartyState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [songs, setSongs] = useState<Song[]>([]),
    [song, setSong] = useState<Song | null>(null),
    [code, setCode] = useState(""),
    [clock, setClock] = useState(Date.now()),
    [feedback, setFeedback] = useState("D · F · J · K"),
    [adjust, setAdjust] = useState(0),
    [flash, setFlash] = useState(-1);
  const alive = useRef(true),
    pending = useRef(false),
    polling = useRef(false),
    offset = useRef(0),
    inFlight = useRef(new Set<number>()),
    locallyJudged = useRef(new Set<number>()),
    createRequest = useRef<{
      clientId: string;
      kind: string;
      videoId?: string;
    } | null>(null),
    actionRequest = useRef<{
      room: string;
      action: string;
      clientId: string;
    } | null>(null);
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const sent = Date.now();
    try {
      const next = await api<PartyState>("/party");
      if (alive.current) {
        offset.current = next.serverNow - (sent + Date.now()) / 2;
        setData(next);
      }
    } finally {
      polling.current = false;
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const update = () => {
      if (!document.hidden)
        void refresh().catch((e) => {
          if (alive.current) setError(e.message);
        });
    };
    update();
    const id = setInterval(update, 1200);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [refresh]);
  const room = data?.room,
    playing =
      !!room && ["waiting", "preparing", "running"].includes(room.status),
    players = room?.players.filter((p) => !p.departed) ?? [],
    own = players.find((p) => p.id === me.id),
    host = room?.hostId === me.id;
  useEffect(() => {
    onActiveChange(playing);
    return () => onActiveChange(false);
  }, [playing, onActiveChange]);
  useEffect(() => {
    if (!room) return;
    const beat = () => {
      void api(`/party/${room.id}/presence`, "POST", {
        clientId: crypto.randomUUID(),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 7000);
    return () => clearInterval(id);
  }, [room?.id]);
  useEffect(() => {
    inFlight.current.clear();
    locallyJudged.current.clear();
    setFeedback("D · F · J · K");
  }, [room?.id]);
  useEffect(() => {
    if (!room || room.status !== "running") return;
    let frame: number;
    const tick = () => {
      setClock(Date.now() + offset.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [room?.id, room?.status]);
  async function run(task: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
      await refresh();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function create(kind: "blackjack" | "rhythm") {
    if (kind === "rhythm" && !song) {
      setError("Busque e selecione uma música primeiro.");
      return;
    }
    void run(async () => {
      if (
        !createRequest.current ||
        createRequest.current.kind !== kind ||
        createRequest.current.videoId !== song?.videoId
      )
        createRequest.current = {
          clientId: crypto.randomUUID(),
          kind,
          ...(kind === "rhythm" ? { videoId: song!.videoId } : {}),
        };
      await api("/party", "POST", createRequest.current);
      createRequest.current = null;
    });
  }
  function action(action: string) {
    if (!room) return;
    void run(async () => {
      if (
        !actionRequest.current ||
        actionRequest.current.room !== room.id ||
        actionRequest.current.action !== action
      )
        actionRequest.current = {
          room: room.id,
          action,
          clientId: crypto.randomUUID(),
        };
      await api(`/party/${room.id}/${action}`, "POST", {
        clientId: actionRequest.current.clientId,
        identity: voiceIdentity,
      });
      actionRequest.current = null;
    });
  }
  function hit(lane: number) {
    if (
      !room ||
      room.kind !== "rhythm" ||
      room.status !== "running" ||
      Date.now() + offset.current < room.startsAt ||
      Date.now() + offset.current >= room.endsAt
    )
      return;
    setFlash(lane);
    setTimeout(() => setFlash(-1), 130);
    const judged = new Set([
      ...(room.judged ?? []).map((n) => n.note),
      ...locallyJudged.current,
    ]);
    const time = Date.now() + offset.current;
    const candidates = room.notes
      .map((n, i) => ({
        ...n,
        i,
        delta: Math.abs(room.startsAt + n.at + 150 + adjust - time),
      }))
      .filter(
        (n) => !judged.has(n.i) && !inFlight.current.has(n.i) && n.delta <= 320,
      )
      .sort((a, b) => a.delta - b.delta);
    const note = candidates[0];
    if (!note) {
      setFeedback("Fora do tempo");
      return;
    }
    inFlight.current.add(note.i);
    void api<{ points: number }>(`/party/${room.id}/note`, "POST", {
      note: note.i,
      lane,
    })
      .then((result) => {
        locallyJudged.current.add(note.i);
        if (alive.current) {
          setFeedback(
            result.points === 100
              ? "PERFEITO +100"
              : result.points === 70
                ? "MANDOU BEM +70"
                : result.points === 40
                  ? "ACERTOU +40"
                  : "ERROU",
          );
          void refresh();
        }
      })
      .catch(() => {
        if (alive.current) setFeedback("Fora do tempo");
      })
      .finally(() => inFlight.current.delete(note.i));
  }
  const latestHit = useRef(hit);
  latestHit.current = hit;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      const lane = KEYS.indexOf(e.key.toUpperCase());
      if (lane >= 0 && room?.kind === "rhythm" && room.status === "running") {
        e.preventDefault();
        latestHit.current(lane);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [room?.kind, room?.status]);
  function search(e: React.FormEvent) {
    e.preventDefault();
    if (!voiceIdentity) return;
    void run(async () => {
      setSongs(
        await api<Song[]>(
          `/party/music/search?identity=${encodeURIComponent(voiceIdentity)}&q=${encodeURIComponent(query.trim())}`,
        ),
      );
    });
  }
  return (
    <section className="party-club" aria-label="Jogos com a galera">
      <div className="club-section-heading">
        <div>
          <span className="club-eyebrow">O MELHOR PRÊMIO É JOGAR JUNTO</span>
          <h2>Uma mesa. Um palco. A galera toda.</h2>
        </div>
        <span className="club-tag">MULTIPLAYER · COINS GRÁTIS</span>
      </div>
      {error && (
        <div className="club-alert" role="alert">
          {error}
          <button onClick={() => setError("")}>Fechar</button>
        </div>
      )}
      {room && (
        <section
          className={`party-room ${room.kind}`}
          aria-label={
            room.kind === "blackjack" ? "Sala de Blackjack" : "Sala de Ritmo"
          }
        >
          <header className="club-section-heading">
            <div>
              <span className="club-eyebrow">
                {room.kind === "blackjack"
                  ? "A BANCA ESTÁ NA MESA"
                  : "A GALERA ESTÁ NO PALCO"}
              </span>
              <h2>
                {room.kind === "blackjack" ? "Blackjack Social" : "Beat Club"}{" "}
                <span className="club-status">
                  {
                    (
                      {
                        waiting: "No lobby",
                        preparing: "Preparando música",
                        running: "Valendo",
                        finished: "Resultado",
                        cancelled: "Cancelada",
                      } as Record<string, string>
                    )[room.status]
                  }
                </span>
              </h2>
            </div>
            <button
              className="club-quiet"
              disabled={busy}
              onClick={() => action("leave")}
            >
              Sair da sala →
            </button>
          </header>
          {room.status === "waiting" && (
            <>
              <p>
                {room.kind === "rhythm"
                  ? "Escolha feita! Entre na voz, confirme presença e deixe o anfitrião preparar o trecho. O bot precisa estar sem música ou fila antes de começar."
                  : "Chegue perto de 21 sem estourar. A banca para no 17. Entre 2 e 8 amigos, todos contra a banca."}
              </p>
              <div className="club-room-code">
                <code>{room.id}</code>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api("/messages", "POST", {
                        clientId: crypto.randomUUID(),
                        body: `${room.kind === "blackjack" ? "♠ Blackjack" : "♫ Beat Club"}: bora jogar? Abra Jogos e entre com o código ${room.id}`,
                      }),
                    )
                  }
                >
                  Convidar no #geral
                </button>
              </div>
            </>
          )}
          {room.status === "cancelled" && (
            <div className="club-alert" role="status">
              Partida cancelada: o bot não concluiu o trecho ou a preparação
              perdeu participantes. Não houve premiação. Você pode sair e criar
              outra sala.
            </div>
          )}
          {room.status === "preparing" && (
            <div className="party-preparing">
              <span>♫</span>
              <h3>O bot está ouvindo a música.</h3>
              <p>
                Preparando até 45 segundos e identificando batidas no áudio.
                Aguarde: isso pode levar até dois minutos.
              </p>
            </div>
          )}
          {room.kind === "blackjack" && room.status !== "waiting" && (
            <div className="blackjack-felt">
              <span className="club-eyebrow">
                BANCA · PARA NO 17, INCLUSIVE COM ÁS SUAVE
              </span>
              <div className="blackjack-dealer">
                <div className="blackjack-hand">
                  {room.dealer.map((card, i) => (
                    <Card key={i} card={card} />
                  ))}
                  {room.dealerHidden && <Card hidden />}
                </div>
                <strong>
                  {room.dealerHidden
                    ? "Uma carta permanece oculta"
                    : `Banca: ${room.dealerTotal}${room.dealerTotal > 21 ? " · estourou!" : ""}`}
                </strong>
              </div>
              <div className="blackjack-tables">
                {players.map((p) => (
                  <article
                    key={p.id}
                    className={p.id === me.id ? "own-hand" : ""}
                  >
                    <header>
                      <strong>
                        {p.name}
                        {p.id === me.id ? " (você)" : ""}
                      </strong>
                      <b>
                        {p.total > 21
                          ? "ESTOUROU"
                          : p.total === 21
                            ? "21!"
                            : p.total}
                      </b>
                    </header>
                    <div className="blackjack-hand">
                      {p.hand.map((c, i) => (
                        <Card key={i} card={c} />
                      ))}
                    </div>
                    <small>
                      {room.status === "finished"
                        ? `+${p.reward} Coins`
                        : p.standing
                          ? "✓ Parou"
                          : "Escolhendo a próxima jogada…"}
                    </small>
                  </article>
                ))}
              </div>
              {room.status === "running" && (
                <div className="party-play-controls">
                  <button
                    className="club-gold"
                    disabled={busy || own?.standing}
                    onClick={() => action("hit")}
                  >
                    Pedir carta ＋
                  </button>
                  <button
                    disabled={busy || own?.standing}
                    onClick={() => action("stand")}
                  >
                    Parar ✋
                  </button>
                  <span>
                    {Math.max(0, Math.ceil((room.endsAt - clock) / 1000))}s ·{" "}
                    {own?.standing
                      ? "Espere a banca revelar."
                      : "A decisão é sua."}
                  </span>
                </div>
              )}
            </div>
          )}
          {room.kind === "rhythm" && (
            <>
              <div className="beat-track-title">
                <span>♫</span>
                <div>
                  <strong>{room.title}</strong>
                  <small>
                    {room.status === "waiting"
                      ? "A faixa será analisada antes de começar"
                      : "Trecho do áudio escolhido · mesmos tempos para todos"}
                  </small>
                </div>
              </div>
              {room.status === "running" && (
                <div className="beat-game">
                  <div className="beat-hud">
                    <strong>
                      {own?.score ?? 0} <small>PTS</small>
                    </strong>
                    <b>
                      {clock < room.startsAt
                        ? `COMEÇA EM ${Math.ceil((room.startsAt - clock) / 1000)}`
                        : feedback}
                    </b>
                    <span>
                      {Math.max(0, Math.ceil((room.endsAt - clock) / 1000))}s
                    </span>
                  </div>
                  <div
                    className="beat-highway"
                    role="img"
                    aria-label="Notas da música em quatro pistas"
                  >
                    {KEYS.map((key, lane) => (
                      <div
                        className={`beat-lane lane-${lane} ${flash === lane ? "pressed" : ""}`}
                        key={key}
                      >
                        {room.notes.map((n, i) => {
                          const delta =
                            room.startsAt + n.at + 150 + adjust - clock;
                          return n.lane === lane &&
                            delta > -150 &&
                            delta < 1900 &&
                            !(room.judged ?? []).some((h) => h.note === i) &&
                            !locallyJudged.current.has(i) ? (
                            <span
                              className="beat-note"
                              key={i}
                              style={{ top: `${(1 - delta / 1800) * 81}%` }}
                            />
                          ) : null;
                        })}
                        <span className="beat-hit-line" />
                        <b>{key}</b>
                      </div>
                    ))}
                  </div>
                  <div className="beat-keys">
                    {KEYS.map((key, lane) => (
                      <button
                        className={`lane-${lane} ${flash === lane ? "pressed" : ""}`}
                        key={key}
                        aria-label={`Tocar pista ${key}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          latestHit.current(lane);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            latestHit.current(lane);
                          }
                        }}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <label className="beat-calibration">
                    Sincronia visual: {adjust} ms
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      step="20"
                      value={adjust}
                      onChange={(e) => setAdjust(Number(e.target.value))}
                    />
                  </label>
                  <p>
                    Use D, F, J, K ou toque nas pistas. Ajuste a sincronia ao
                    que você ouve. Pelo menos 3 acertos para ganhar Coins.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="party-roster">
            {players.map((p) => (
              <div key={p.id}>
                <span>{p.name.slice(0, 1).toUpperCase()}</span>
                <strong>
                  {p.name}
                  {p.id === room.hostId ? " ♛" : ""}
                </strong>
                <small>
                  {room.status === "waiting"
                    ? p.ready
                      ? "✓ Pronto"
                      : "Aguardando"
                    : room.status === "finished"
                      ? `${p.score} ${room.kind === "rhythm" ? "pts" : "na mão"} · +${p.reward} Coins`
                      : room.kind === "rhythm"
                        ? `${p.score} pts · ${p.hits} acertos · combo ${p.combo}`
                        : p.standing
                          ? "Parou"
                          : "Jogando"}
                </small>
              </div>
            ))}
          </div>
          {room.status === "waiting" && (
            <div className="club-actions">
              <button
                className="club-primary"
                disabled={busy || (room.kind === "rhythm" && !voiceIdentity)}
                onClick={() => action("ready")}
              >
                {own?.ready ? "Ainda não estou pronto" : "Estou pronto!"}
              </button>
              {host && (
                <button
                  className="club-gold"
                  disabled={
                    busy ||
                    players.length < 2 ||
                    players.some((p) => !p.ready) ||
                    (room.kind === "rhythm" && !voiceIdentity)
                  }
                  onClick={() => action("start")}
                >
                  {room.kind === "rhythm"
                    ? "Preparar música e começar ♫"
                    : "Distribuir cartas ♠"}
                </button>
              )}
            </div>
          )}
          {room.status === "finished" && (
            <div className="party-finished">
              <strong>
                {room.kind === "blackjack"
                  ? "A banca revelou. As fichas são suas!"
                  : "Fim do show! As Coins já estão no extrato."}
              </strong>
              <p>
                {room.kind === "blackjack"
                  ? "Vitória: 20 C · blackjack natural: 30 C · empate: 8 C. Rodada gratuita, sem aposta."
                  : "Pontuação e precisão premiadas pelo servidor. Empates compartilham o bônus de primeiro lugar."}
              </p>
              <button
                disabled={busy || blocked}
                onClick={() => {
                  void run(async () => {
                    await api(`/party/${room.id}/leave`, "POST", {
                      clientId: crypto.randomUUID(),
                    });
                    await api("/party", "POST", {
                      clientId: crypto.randomUUID(),
                      kind: room.kind,
                      videoId: room.videoId || undefined,
                    });
                  });
                }}
              >
                Criar revanche ↻
              </button>
            </div>
          )}
        </section>
      )}
      <div className="club-games-grid party-catalog">
        <article className="party-blackjack-card">
          <span className="club-eyebrow">03 · TODOS CONTRA A BANCA</span>
          <h3>Blackjack Social</h3>
          <p>
            Mais uma carta ou parar? O 21 está perto.
            <br />A galera toda decide junto, na mesma mesa.
          </p>
          <div className="party-card-art" aria-hidden="true">
            <Card card={0} />
            <Card card={22} />
            <span>21</span>
          </div>
          <small>2–8 pessoas · entrada grátis · até 30 Coins por mão</small>
          <button
            className="club-gold"
            disabled={busy || playing || blocked}
            onClick={() => create("blackjack")}
          >
            Criar mesa de blackjack ♠
          </button>
        </article>
        <article className="party-rhythm-card">
          <span className="club-eyebrow">04 · SUA MÚSICA, SEU MOMENTO</span>
          <h3>Beat Club</h3>
          <p>
            Escolha uma música do bot, siga as batidas e dispute a melhor
            apresentação.
          </p>
          <div className="beat-card-art" aria-hidden="true">
            {KEYS.map((k, i) => (
              <span key={k} className={`lane-${i}`}>
                {k}
                <i />
              </span>
            ))}
          </div>
          {!voiceIdentity ? (
            <div className="party-voice-hint">
              <p>Entre na sala de voz para escolher e ouvir a música.</p>
              <button onClick={onOpenVoice}>Abrir sala de voz →</button>
            </div>
          ) : (
            <form className="party-song-search" onSubmit={search}>
              <label>
                Escolher música no bot
                <input
                  aria-label="Música para o jogo de ritmo"
                  placeholder="Nome ou link do YouTube"
                  value={query}
                  maxLength={200}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={busy || playing || blocked}
                />
              </label>
              <button disabled={busy || !query.trim() || playing || blocked}>
                Buscar música
              </button>
            </form>
          )}
          {!!songs.length && (
            <div
              className="party-song-results"
              aria-label="Músicas para jogar"
              role="region"
            >
              {songs.map((s) => (
                <button
                  key={s.videoId}
                  aria-pressed={song?.videoId === s.videoId}
                  disabled={busy || playing || blocked}
                  onClick={() => setSong(s)}
                >
                  {s.title}
                  <small>
                    {s.duration
                      ? `${Math.floor(s.duration / 60)}:${String(s.duration % 60).padStart(2, "0")}`
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          )}
          {song && <p className="party-selected-song">✓ {song.title}</p>}
          <button
            className="club-primary"
            disabled={busy || playing || blocked || !song || !voiceIdentity}
            onClick={() => create("rhythm")}
          >
            Criar sala de ritmo ♫
          </button>
          <small>
            2–8 pessoas · trecho de até 45 segundos · teclado ou toque
          </small>
        </article>
      </div>
      <div className="party-open-rooms">
        <h3>Blackjack & ritmo · salas abertas</h3>
        <form
          className="club-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(code.trim()))
              void run(() =>
                api(`/party/${code.trim()}/join`, "POST", {
                  clientId: crypto.randomUUID(),
                }),
              );
            else setError("Cole o código completo da sala.");
          }}
        >
          <input
            aria-label="Código da sala de blackjack ou ritmo"
            placeholder="Código da sala de blackjack ou ritmo"
            value={code}
            maxLength={36}
            onChange={(e) => setCode(e.target.value)}
          />
          <button disabled={busy || playing || blocked}>Entrar →</button>
        </form>
        {data?.rooms.length ? (
          data.rooms.map((r) => (
            <div className="club-lobby-row" key={r.id}>
              <span className="club-lobby-icon">
                {r.kind === "blackjack" ? "♠" : "♫"}
              </span>
              <div>
                <strong>{r.host}</strong>
                <small>
                  {r.kind === "blackjack" ? "Blackjack" : "Beat Club"} ·{" "}
                  {r.players}/8 pessoas
                </small>
              </div>
              <button
                disabled={busy || playing || blocked || r.players >= 8}
                onClick={() =>
                  void run(() =>
                    api(`/party/${r.id}/join`, "POST", {
                      clientId: crypto.randomUUID(),
                    }),
                  )
                }
              >
                Entrar na sala →
              </button>
            </div>
          ))
        ) : (
          <p>Nenhuma sala aberta. Chame a galera para a próxima partida.</p>
        )}
      </div>
    </section>
  );
}
