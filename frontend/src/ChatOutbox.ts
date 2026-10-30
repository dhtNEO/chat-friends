import { ApiError, type Message } from "./api";
import { isMessage } from "./ChatSync";

export type DeliveryState =
  "queued" | "sending" | "confirmed" | "retryable-failure" | "rejected";
export type Delivery = {
  clientId: string;
  body: string;
  state: DeliveryState;
  error: string;
  retryAt: number;
};
export const deliveryLabel: Record<DeliveryState, string> = {
  queued: "Na fila · aguardando conexão",
  sending: "Enviando…",
  confirmed: "Enviado",
  "retryable-failure": "Envio não confirmado",
  rejected: "Não enviado · rejeitado",
};

// Owned by the mounted account workspace, not a panel or disk storage.
export function createChatOutbox(options: {
  authorId: string;
  post: (
    message: { clientId: string; body: string },
    signal: AbortSignal,
  ) => Promise<unknown>;
  saved: (message: Message) => void;
  changed: (items: Delivery[]) => void;
}) {
  const entries = new Map<string, Delivery>();
  const controller = new AbortController();
  let connected = false,
    disposed = false;
  const emit = () => options.changed([...entries.values()]);
  const update = (id: string, next: Partial<Delivery>) => {
    const current = entries.get(id);
    if (!current || disposed) return;
    entries.set(id, { ...current, ...next });
    emit();
  };
  async function send(clientId: string) {
    const entry = entries.get(clientId);
    if (disposed || !connected || entry?.state !== "queued") return;
    // Synchronous transition prevents clicks/reconnections from racing a POST.
    update(clientId, { state: "sending", error: "", retryAt: 0 });
    try {
      const saved = await options.post(
        { clientId, body: entry.body },
        controller.signal,
      );
      if (disposed) return;
      if (
        !isMessage(saved) ||
        saved.clientId !== clientId ||
        saved.authorId !== options.authorId ||
        saved.body !== entry.body
      )
        throw new Error(
          "Confirmação inválida. Confira o histórico antes de tentar novamente.",
        );
      update(clientId, { state: "confirmed", error: "", retryAt: 0 });
      options.saved(saved);
    } catch (error) {
      if (disposed || entries.get(clientId)?.state === "confirmed") return;
      const retryable =
        !(error instanceof ApiError) ||
        error.status === 0 ||
        error.status >= 500 ||
        [408, 425, 429].includes(error.status);
      update(clientId, {
        state: retryable ? "retryable-failure" : "rejected",
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar a mensagem.",
        retryAt:
          error instanceof ApiError && error.status === 429
            ? Date.now() + (error.retryAfter ?? 300_000)
            : error instanceof ApiError && error.retryAfter
              ? Date.now() + error.retryAfter
              : 0,
      });
    }
  }
  return {
    enqueue(body: string) {
      if (disposed || !body.trim() || body.length > 4000) return false;
      const clientId = crypto.randomUUID();
      entries.set(clientId, {
        clientId,
        body,
        state: "queued",
        error: "",
        retryAt: 0,
      });
      emit();
      void send(clientId);
      return true;
    },
    retry(clientId: string) {
      const entry = entries.get(clientId);
      if (
        disposed ||
        entry?.state !== "retryable-failure" ||
        entry.retryAt > Date.now()
      )
        return;
      update(clientId, { state: "queued", error: "", retryAt: 0 });
      void send(clientId);
    },
    confirm(items: Message[]) {
      if (disposed) return;
      for (const item of items) {
        const entry = entries.get(item.clientId);
        if (
          item.authorId === options.authorId &&
          entry &&
          entry.body === item.body &&
          entry.state !== "confirmed"
        )
          update(item.clientId, { state: "confirmed", error: "", retryAt: 0 });
      }
    },
    connection(open: boolean) {
      if (disposed) return;
      connected = open;
      if (open)
        for (const entry of entries.values())
          if (entry.state === "queued") void send(entry.clientId);
    },
    dispose() {
      disposed = true;
      controller.abort();
      entries.clear();
    },
  };
}
