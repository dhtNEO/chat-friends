import { ApiError, type Message } from "./api";

export type ChatStatus = "connecting" | "syncing" | "updated" | "unavailable";
export const chatStatusLabel: Record<ChatStatus, string> = {
  connecting: "Conectando…",
  syncing: "Sincronizando…",
  updated: "Atualizado",
  unavailable: "Chat indisponível",
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
export function isMessage(value: unknown): value is Message {
  return (
    object(value) &&
    Number.isSafeInteger(value.id) &&
    Number(value.id) > 0 &&
    typeof value.clientId === "string" &&
    value.clientId.length > 0 &&
    typeof value.authorId === "string" &&
    value.authorId.length > 0 &&
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    value.body.length <= 4000 &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}
type ChatEvent =
  | { type: "message"; message: Message }
  | { type: "presence"; users: string[] }
  | { type: "pong" | "profile" };
export function parseChatEvent(data: unknown): ChatEvent | null {
  if (typeof data !== "string") return null;
  try {
    const event: unknown = JSON.parse(data);
    if (!object(event)) return null;
    if (event.type === "message" && isMessage(event.message))
      return { type: "message", message: event.message };
    if (
      event.type === "presence" &&
      Array.isArray(event.users) &&
      event.users.every((user) => typeof user === "string")
    )
      return { type: "presence", users: event.users };
    if (event.type === "pong" || event.type === "profile")
      return { type: event.type };
  } catch {
    /* Invalid envelopes never enter the message list. */
  }
  return null;
}

function page(value: unknown, after?: number): Message[] {
  if (!Array.isArray(value) || value.length > (after === undefined ? 50 : 100))
    throw new Error("Resposta de histórico inválida.");
  let previous = after ?? 0;
  for (const row of value) {
    if (!isMessage(row) || row.id <= previous)
      throw new Error("Resposta de histórico inválida.");
    previous = row.id;
  }
  return value;
}

// Only complete HTTP pages confirm the cursor. WS/POST IDs are observations,
// never proof that lower IDs were read. IDs may have gaps (rolled-back inserts).
export function createChatSync(options: {
  read: (after: number | undefined, signal: AbortSignal) => Promise<unknown>;
  merge: (items: Message[]) => void;
  status: (status: ChatStatus) => void;
  error: (error: Error) => void;
}) {
  let confirmed = 0,
    observed = 0,
    initialized = false;
  let connected = false,
    running = false,
    disposed = false,
    failures = 0;
  let unavailable = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const buffer = new Map<number, Message>();
  const status = () =>
    options.status(
      unavailable
        ? "unavailable"
        : !connected
          ? "connecting"
          : !initialized || running || timer !== undefined
            ? "syncing"
            : "updated",
    );
  const schedule = (delay: number) => {
    timer = setTimeout(
      () => {
        timer = undefined;
        void sync();
      },
      Math.min(delay, 2_147_483_647),
    );
  };
  async function sync() {
    if (disposed || running || timer !== undefined) return;
    running = true;
    unavailable = false;
    status();
    try {
      if (!initialized) {
        const rows = page(await options.read(undefined, controller.signal));
        if (disposed) return;
        options.merge(rows);
        confirmed = rows.at(-1)?.id ?? 0;
        initialized = true;
      }
      let rows: Message[];
      do {
        rows = page(
          await options.read(confirmed, controller.signal),
          confirmed,
        );
        if (disposed) return;
        options.merge(rows);
        confirmed = rows.at(-1)?.id ?? confirmed;
        // A committed WS observation must become visible over HTTP. Don't spin
        // on an inconsistent/empty response; preserve the cursor and retry.
        if (!rows.length && observed > confirmed)
          throw new Error(
            "O histórico ainda não confirmou as mensagens recebidas.",
          );
      } while (rows.length === 100 || observed > confirmed);
      options.merge([...buffer.values()].sort((a, b) => a.id - b.id));
      buffer.clear();
      failures = 0;
    } catch (error) {
      if (disposed) return;
      unavailable = true;
      options.error(
        error instanceof Error
          ? error
          : new Error("Falha ao sincronizar o chat."),
      );
      // Authorization/session changes need explicit recovery, not a retry loop.
      if (!(
        error instanceof ApiError &&
        ["ABORTED", "UNAUTHENTICATED", "FORBIDDEN", "REAUTH_REQUIRED"].includes(
          error.code,
        )
      )) {
        const base = Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5));
        schedule(
          Math.max(
            base + Math.random() * base * 0.2,
            error instanceof ApiError ? (error.retryAfter ?? 0) : 0,
          ),
        );
      }
    } finally {
      running = false;
      if (!disposed) status();
    }
  }
  return {
    signal: controller.signal,
    connection(open: boolean) {
      if (disposed) return;
      connected = open;
      status();
      if (open) void sync();
    },
    observe(message: Message) {
      if (disposed) return;
      observed = Math.max(observed, message.id);
      if (message.id <= confirmed) return;
      // Bound memory during a long outage; HTTP remains authoritative for all
      // omitted buffer entries, and observed retains the highest required ID.
      if (buffer.size < 1000) buffer.set(message.id, message);
      if (!running && timer === undefined) {
        schedule(250);
        status();
      }
    },
    dispose() {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
      buffer.clear();
    },
  };
}
