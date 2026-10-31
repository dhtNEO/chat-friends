import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";

export const MUSIC_IDENTITY = "music-bot";
type Song = {
  id?: string;
  videoId: string;
  title: string;
  duration: number | null;
  url: string;
  requestedBy: string;
};
type State = {
  status: "idle" | "loading" | "playing" | "paused";
  current: Song | null;
  queue: Song[];
  error: string | null;
  elapsed: number;
  rhythm?: { id: string; phase: string } | null;
};
function duration(seconds: number | null) {
  if (seconds === null) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function Music({
  miniHost,
  identity,
  volume,
  onVolume,
}: {
  miniHost?: HTMLElement | null;
  identity: string | undefined;
  volume: number;
  onVolume: (value: number) => void;
}) {
  const [state, setState] = useState<State>({
    status: "idle",
    current: null,
    queue: [],
    error: null,
    elapsed: 0,
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);
  const generation = useRef(0);
  useEffect(() => {
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      const before = generation.current;
      try {
        const next = await api<State>("/music/state");
        if (alive && before === generation.current) {
          setState(next);
          setAvailable(true);
        }
      } catch {
        if (alive) setAvailable(false);
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const disabled = !identity || busy || !!state.rhythm;
  async function search() {
    if (!identity || !query.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const found = await api<Song[]>(
        `/music/search?identity=${encodeURIComponent(identity)}&q=${encodeURIComponent(query.trim())}`,
      );
      setResults(found);
      if (!found.length)
        setError("Nenhuma música encontrada. Tente outro nome.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível buscar músicas.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(path: string, body: object, method = "POST") {
    if (!identity || busy) return;
    setBusy(true);
    setError("");
    generation.current++;
    try {
      const next = await api<State>(path, method, { identity, ...body });
      generation.current++;
      setState(next);
      setAvailable(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível controlar a música.",
      );
    } finally {
      setBusy(false);
    }
  }
  const panel = (
    <section className="music-panel" aria-label="Bot de música">
      <header className="music-header">
        <strong>♫ Bot de música</strong>
        <span className="music-bot-badge">BOT</span>
        <span className="music-status" role="status">
          {!available
            ? "Indisponível"
            : state.status === "paused"
              ? "Pausado"
              : state.status === "loading"
                ? "Carregando…"
                : state.status === "playing"
                  ? "Tocando para a sala"
                  : "Fila vazia"}
        </span>
      </header>
      {state.rhythm && (
        <p className="music-hint">
          Bot reservado para uma partida do Beat Club. Volume individual
          continua disponível.
        </p>
      )}
      {!identity && (
        <p className="music-hint">
          Entre na voz para buscar músicas e controlar a fila.
        </p>
      )}
      <form
        className="music-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Buscar música ou colar link do YouTube"
          placeholder="Nome da música ou link do YouTube"
          maxLength={200}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button disabled={disabled || !query.trim()} type="submit">
          {busy ? "Aguarde…" : "Buscar"}
        </button>
      </form>
      {(error || state.error) && (
        <p className="music-error" role="alert">
          {error || state.error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="music-results" aria-label="Resultados da busca">
          {results.map((s) => (
            <li key={s.videoId}>
              <div>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                <small>{duration(s.duration)}</small>
              </div>
              <button
                disabled={disabled}
                aria-label={`Adicionar à fila: ${s.title}`}
                onClick={() =>
                  void change("/music/queue", { videoId: s.videoId })
                }
              >
                Adicionar à fila
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.current && (
        <div className="music-current">
          <strong>{state.current.title}</strong>
          <small>
            {duration(state.elapsed)} / {duration(state.current.duration)} ·
            Pedida por {state.current.requestedBy}
          </small>
        </div>
      )}
      <div className="music-controls">
        <button
          disabled={disabled || !state.current || state.status === "loading"}
          aria-label={
            state.status === "paused" ? "Continuar música" : "Pausar música"
          }
          onClick={() =>
            void change("/music/control", {
              action: state.status === "paused" ? "resume" : "pause",
            })
          }
        >
          {state.status === "paused" ? "Continuar" : "Pausar"}
        </button>
        <button
          disabled={disabled || !state.current}
          aria-label="Pular música"
          onClick={() => void change("/music/control", { action: "skip" })}
        >
          Pular
        </button>
        <button
          disabled={disabled || (!state.current && !state.queue.length)}
          aria-label="Parar e limpar fila"
          onClick={() => void change("/music/control", { action: "stop" })}
        >
          Parar e limpar fila
        </button>
        <label className="music-volume">
          Volume só para você{" "}
          <input
            aria-label="Volume da música"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
          />
          <output>{volume}%</output>
        </label>
      </div>
      {state.queue.length > 0 && (
        <ol className="music-queue" aria-label="Fila de músicas">
          {state.queue.map((s) => (
            <li key={s.id}>
              <div>
                <span>{s.title}</span>
                <small>{s.requestedBy}</small>
              </div>
              <button
                aria-label={`Remover da fila: ${s.title}`}
                disabled={disabled}
                onClick={() =>
                  void change(`/music/queue/${s.id}`, {}, "DELETE")
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="music-hint">
        Todos ouvem a mesma música. Vídeos de até 20 minutos; até 30 na fila.
      </p>
    </section>
  );
  return (
    <>
      {panel}
      {miniHost &&
        createPortal(
          <div
            className="simple-mini-controls"
            aria-label="Miniplayer de música"
          >
            <strong>{state.current?.title ?? "Música da Sala"}</strong>
            <button
              disabled={
                disabled || !state.current || state.status === "loading"
              }
              aria-label={
                state.status === "paused"
                  ? "Continuar música no miniplayer"
                  : "Pausar música no miniplayer"
              }
              onClick={() =>
                void change("/music/control", {
                  action: state.status === "paused" ? "resume" : "pause",
                })
              }
            >
              {state.status === "paused" ? "Continuar" : "Pausar"}
            </button>
          </div>,
          miniHost,
        )}
    </>
  );
}
