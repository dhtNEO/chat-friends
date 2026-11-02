import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, type User } from "./api";
import { Icon } from "./Icon";
import "./outlook.css";

export type EventDetails = {
  title: string;
  game: string;
  location: string;
  description: string;
  startsAt: string;
  endsAt: string;
};
export type CalendarEvent = EventDetails & {
  id: string;
  creatorId: string;
  creator: string;
  cancelled: boolean;
  version: number;
  attendees: { id: string; name: string; response: string }[];
};
type Editor = EventDetails & { id?: string; version?: number };
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const localInput = (d: Date) =>
  `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const dateLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
const when = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const RESPONSES = [
  { id: "going", label: "Vou", symbol: "✓" },
  { id: "maybe", label: "Talvez", symbol: "?" },
  { id: "declined", label: "Não vou", symbol: "−" },
];
const overlaps = (event: CalendarEvent, day: Date) =>
  new Date(event.startsAt) <
    new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) &&
  new Date(event.endsAt) > day;

export function Outlook({ me }: { me: User }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [all, setAll] = useState(false),
    [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const requestVersion = useRef(0),
    creating = useRef(crypto.randomUUID()),
    pending = useRef(false),
    editorRef = useRef<HTMLFormElement>(null);
  const gridStart = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - ((month.getDay() + 6) % 7),
  );
  const gridEnd = new Date(
    gridStart.getFullYear(),
    gridStart.getMonth(),
    gridStart.getDate() + 42,
  );
  const from = gridStart.toISOString(),
    to = gridEnd.toISOString();
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const data = await api<CalendarEvent[]>(
      `/outlook?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    if (version === requestVersion.current) {
      setEvents(data);
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    setLoading(true);
    const load = () => {
      if (!document.hidden)
        void refresh().catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    };
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      ++requestVersion.current;
      clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh]);
  const editing = editor !== null;
  useEffect(() => {
    if (editing)
      editorRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [editing]);
  const days = Array.from(
    { length: 42 },
    (_, i) =>
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
      ),
  );
  const selectedDate = new Date(`${selected}T00:00:00`);
  const visible = events.filter((e) =>
    all
      ? new Date(e.startsAt).getMonth() === month.getMonth() &&
        new Date(e.startsAt).getFullYear() === month.getFullYear()
      : overlaps(e, selectedDate),
  );
  const upcoming = events.filter(
    (e) => !e.cancelled && new Date(e.endsAt) > new Date(),
  ).length;
  function moveMonth(change: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + change, 1);
    setMonth(next);
    setSelected(dayKey(next));
    setConfirmCancel(null);
  }
  function openNew() {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const start =
      selectedDate > now
        ? new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            20,
          )
        : now;
    creating.current = crypto.randomUUID();
    setError("");
    setNotice("");
    setEditor({
      title: "",
      game: "",
      location: "Sala de estar",
      description: "",
      startsAt: localInput(start),
      endsAt: localInput(new Date(start.getTime() + 7200000)),
    });
  }
  function edit(e: CalendarEvent) {
    setError("");
    setNotice("");
    setEditor({
      ...e,
      startsAt: localInput(new Date(e.startsAt)),
      endsAt: localInput(new Date(e.endsAt)),
    });
  }
  async function mutate(task: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(success);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      void refresh().catch(() => {});
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const start = new Date(editor.startsAt),
      end = new Date(editor.endsAt);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      localInput(start) !== editor.startsAt ||
      localInput(end) !== editor.endsAt
    ) {
      setError(
        "Confira os horários; este horário pode não existir no seu fuso.",
      );
      return;
    }
    if (end <= start || end.getTime() - start.getTime() > 48 * 3600000) {
      setError(
        "O fim deve ser depois do início, com duração máxima de 48 horas.",
      );
      return;
    }
    const details: EventDetails = {
      title: editor.title,
      game: editor.game,
      location: editor.location,
      description: editor.description,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    };
    void mutate(
      async () => {
        if (editor.id)
          await api(`/outlook/${editor.id}`, "PUT", {
            version: editor.version,
            details,
          });
        else
          await api("/outlook", "POST", {
            clientId: creating.current,
            details,
          });
        setSelected(dayKey(start));
        setMonth(new Date(start.getFullYear(), start.getMonth(), 1));
        setAll(false);
        setEditor(null);
      },
      editor.id
        ? "Evento atualizado. A galera já pode conferir."
        : "Jogatina marcada! Você já está na lista de presença.",
    );
  }
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <section className="outlook" aria-label="Outlook, calendário da galera">
      <header className="outlook-hero">
        <span className="outlook-logo" aria-hidden="true">
          <Icon name="calendar" size={30} />
        </span>
        <div>
          <span className="eyebrow">RESERVE UM TEMPO PRA JOGAR</span>
          <h2>Outlook</h2>
          <p>A próxima jogatina começa aqui.</p>
        </div>
        <button className="outlook-primary" onClick={openNew}>
          ＋ Criar evento
        </button>
      </header>
      <div className="outlook-summary">
        <span>
          <i /> Agenda compartilhada
        </span>
        <span>
          {upcoming}{" "}
          {upcoming === 1 ? "jogatina chegando" : "jogatinas chegando"}
        </span>
      </div>
      {error && (
        <div className="outlook-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="outlook-notice" role="status">
          {notice}
        </p>
      )}
      <div className="outlook-toolbar">
        <h3 aria-live="polite">
          {month.toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <div>
          <button aria-label="Mês anterior" onClick={() => moveMonth(-1)}>
            ‹
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(dayKey(now));
              setAll(false);
            }}
          >
            Hoje
          </button>
          <button aria-label="Próximo mês" onClick={() => moveMonth(1)}>
            ›
          </button>
        </div>
      </div>
      <div className="outlook-weekdays" aria-hidden="true">
        {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        className="outlook-grid"
        aria-label="Dias do calendário"
        aria-busy={loading}
      >
        {days.map((day) => {
          const key = dayKey(day),
            daily = events.filter((e) => !e.cancelled && overlaps(e, day));
          return (
            <button
              key={key}
              className={`${day.getMonth() !== month.getMonth() ? "outside" : ""} ${key === dayKey(new Date()) ? "today" : ""}`}
              aria-label={`${dateLabel(day)} de ${day.getFullYear()}${daily.length ? `, ${daily.length} evento${daily.length > 1 ? "s" : ""}` : ""}`}
              aria-pressed={key === selected}
              onClick={() => {
                setSelected(key);
                setAll(false);
                setConfirmCancel(null);
              }}
            >
              <b>{day.getDate()}</b>
              {daily.slice(0, 2).map((e) => (
                <span className="outlook-dot" key={e.id} title={e.title} />
              ))}
              {daily.length > 2 && <small>+{daily.length - 2}</small>}
            </button>
          );
        })}
      </div>
      <p className="outlook-timezone">
        Horários no seu fuso: <strong>{timezone}</strong>
      </p>
      {editor && (
        <form
          ref={editorRef}
          className="outlook-editor"
          aria-label={editor.id ? "Editar evento" : "Criar evento"}
          onSubmit={save}
        >
          <div className="outlook-section-title">
            <h3>{editor.id ? "Ajustar a jogatina" : "Bora marcar?"}</h3>
            <button
              type="button"
              aria-label="Fechar formulário"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              ×
            </button>
          </div>
          <label>
            Nome do evento
            <input
              autoFocus
              required
              maxLength={120}
              value={editor.title}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              placeholder="Sextou no co-op"
            />
          </label>
          <div className="outlook-form-row">
            <label>
              Jogo
              <input
                maxLength={80}
                value={editor.game}
                onChange={(e) => setEditor({ ...editor, game: e.target.value })}
                placeholder="Qual vai ser o jogo?"
              />
            </label>
            <label>
              Onde vamos jogar?
              <input
                maxLength={160}
                value={editor.location}
                onChange={(e) =>
                  setEditor({ ...editor, location: e.target.value })
                }
                placeholder="Sala de voz, servidor ou local"
              />
            </label>
          </div>
          <div className="outlook-form-row">
            <label>
              Início
              <input
                required
                type="datetime-local"
                value={editor.startsAt}
                onChange={(e) =>
                  setEditor({ ...editor, startsAt: e.target.value })
                }
              />
            </label>
            <label>
              Fim
              <input
                required
                type="datetime-local"
                value={editor.endsAt}
                onChange={(e) =>
                  setEditor({ ...editor, endsAt: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Recado pra galera
            <textarea
              maxLength={2000}
              rows={3}
              value={editor.description}
              onChange={(e) =>
                setEditor({ ...editor, description: e.target.value })
              }
              placeholder="Modo de jogo, o que levar, como entrar…"
            />
          </label>
          <div className="outlook-actions">
            <button type="submit" className="outlook-primary" disabled={busy}>
              {busy
                ? "Salvando…"
                : editor.id
                  ? "Salvar alterações"
                  : "Marcar jogatina"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              Descartar alterações
            </button>
          </div>
        </form>
      )}
      <div className="outlook-section-title">
        <h3>
          {all ? "Agenda do mês" : `Jogatinas · ${dateLabel(selectedDate)}`}
        </h3>
        <button aria-pressed={all} onClick={() => setAll(!all)}>
          {all ? "Ver dia selecionado" : "Ver agenda do mês"}
        </button>
      </div>
      {loading ? (
        <p className="outlook-empty">Buscando a agenda…</p>
      ) : visible.length === 0 ? (
        <div className="outlook-empty">
          <Icon name="calendar" size={32} />
          <strong>Tem espaço pra mais uma partida.</strong>
          <p>
            {all ? "Nenhum evento neste mês." : "Nenhum evento neste dia."} Que
            tal reunir a galera?
          </p>
          <button onClick={openNew}>Criar evento</button>
        </div>
      ) : (
        <div className="outlook-events">
          {visible.map((event) => {
            const mine = event.attendees.find((p) => p.id === me.id)?.response,
              canEdit = me.admin || event.creatorId === me.id,
              ended = new Date(event.endsAt) <= new Date();
            return (
              <article
                key={event.id}
                className={`outlook-event ${event.cancelled ? "cancelled" : ""}`}
                aria-label={`Evento ${event.title}`}
              >
                <div className="outlook-event-heading">
                  <span className="outlook-event-icon" aria-hidden="true">
                    <Icon name="games" size={22} />
                  </span>
                  <div>
                    <span className="outlook-game">
                      {event.game || "ENCONTRO DA GALERA"}
                    </span>
                    <h4>{event.title}</h4>
                  </div>
                  <span className="outlook-status">
                    {event.cancelled
                      ? "Cancelado"
                      : ended
                        ? "Encerrado"
                        : "Tá marcado"}
                  </span>
                </div>
                <p className="outlook-event-time">
                  <time dateTime={event.startsAt}>{when(event.startsAt)}</time>{" "}
                  → <time dateTime={event.endsAt}>{when(event.endsAt)}</time>
                </p>
                {event.location && (
                  <p className="outlook-location">⌖ {event.location}</p>
                )}
                {event.description && (
                  <p className="outlook-description">{event.description}</p>
                )}
                <small className="outlook-organizer">
                  Marcado por {event.creator}
                </small>
                <div
                  className="outlook-attendees"
                  aria-label="Lista de presença"
                >
                  {RESPONSES.map((r) => {
                    const list = event.attendees.filter(
                      (p) => p.response === r.id,
                    );
                    return (
                      <div key={r.id}>
                        <strong>
                          {r.symbol} {r.label} · {list.length}
                        </strong>
                        <span>
                          {list.length
                            ? list.map((p) => p.name).join(", ")
                            : "Ainda ninguém"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {!event.cancelled && !ended && (
                  <div className="outlook-responses" aria-label="Sua presença">
                    {RESPONSES.map((r) => (
                      <button
                        key={r.id}
                        aria-pressed={mine === r.id}
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            () =>
                              api(`/outlook/${event.id}/response`, "POST", {
                                response: r.id,
                              }),
                            "Sua presença foi atualizada.",
                          )
                        }
                      >
                        {r.symbol} {r.label}
                      </button>
                    ))}
                  </div>
                )}
                {canEdit && !event.cancelled && !ended && (
                  <div className="outlook-event-admin">
                    <button disabled={busy} onClick={() => edit(event)}>
                      Editar evento
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setConfirmCancel(event.id)}
                    >
                      Cancelar evento
                    </button>
                  </div>
                )}
                {confirmCancel === event.id && (
                  <div
                    className="outlook-cancel"
                    role="group"
                    aria-label="Confirmar cancelamento"
                  >
                    <p>
                      Cancelar esta jogatina? O evento continuará visível como
                      cancelado.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate(async () => {
                          await api(`/outlook/${event.id}/cancel`, "POST", {
                            version: event.version,
                          });
                          setConfirmCancel(null);
                        }, "Evento cancelado. A galera pode conferir na agenda.")
                      }
                    >
                      Sim, cancelar evento
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setConfirmCancel(null)}
                    >
                      Manter evento
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
