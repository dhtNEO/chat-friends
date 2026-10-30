let csrf = "";
let generation = 0;
const limits = new Map<string, { until: number; error: ApiError }>();
const serverUnavailable =
  "O servidor está indisponível no momento. Tente novamente em instantes.";
export type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = `HTTP_${status}`,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
// Identity boundaries invalidate responses (including 401) from the previous account.
export function resetSession() {
  generation++;
  csrf = "";
}
function stale() {
  return new ApiError(
    0,
    "Resposta de uma sessão anterior descartada.",
    "ABORTED",
  );
}
export function operationTimeout(path: string, method = "GET") {
  if (/^\/(party\/music|music)\/search(?:\?|$)/.test(path)) return 60_000;
  if (method === "POST" && /^\/party\/[^/]+\/start$/.test(path)) return 120_000;
  if (path === "/profile/avatar") return 60_000;
  return 15_000;
}
function retryDelay(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : null;
}
async function request<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
  authenticated = true,
): Promise<T> {
  const epoch = generation;
  const key = `${init.method || "GET"} ${path.split("?")[0]}`;
  const limit = limits.get(key);
  const remaining = (limit?.until || 0) - Date.now();
  if (remaining > 0)
    throw new ApiError(
      limit!.error.status,
      limit!.error.message,
      limit!.error.code,
      remaining,
    );
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    options.timeoutMs ?? operationTimeout(path, init.method),
  );
  try {
    const r = await fetch("/api" + path, {
      ...init,
      signal: controller.signal,
    });
    // Keep the deadline active while consuming the body too.
    const text = await r.text();
    if (epoch !== generation) throw stale();
    if (!r.ok) {
      let detail = "";
      try {
        detail = JSON.parse(text).error || "";
      } catch {
        /* proxy HTML */
      }
      const retryAfter = retryDelay(r.headers.get("Retry-After"));
      const code =
        r.status === 401
          ? "UNAUTHENTICATED"
          : r.status === 403
            ? "FORBIDDEN"
            : r.status === 428
              ? "REAUTH_REQUIRED"
              : r.status === 429
                ? "RATE_LIMITED"
                : r.status >= 500
                  ? "UNAVAILABLE"
                  : `HTTP_${r.status}`;
      const message =
        r.status === 401
          ? authenticated
            ? "Sessão encerrada. Entre novamente."
            : "Usuário ou senha inválidos."
          : r.status === 403
            ? authenticated
              ? "Você não tem permissão para esta operação."
              : "Sua sessão de acesso não pôde ser validada. Recarregue a página e permita os cookies deste site."
            : r.status === 428
              ? "Confirme sua identidade para continuar. A operação não foi reenviada."
              : r.status === 429
                ? retryAfter !== null
                  ? `Muitas tentativas. Aguarde ${Math.ceil(retryAfter / 1000)} segundos.`
                  : "Muitas tentativas. Aguarde 5 minutos."
                : r.status >= 500
                  ? serverUnavailable
                  : detail ||
                    "Não foi possível concluir a operação. Tente novamente.";
      if (r.status === 401 && authenticated) {
        resetSession();
        window.dispatchEvent(new Event("session-ended"));
      }
      if (r.status === 428 && authenticated)
        window.dispatchEvent(
          new CustomEvent("reauth-required", { detail: { path } }),
        );
      const error = new ApiError(r.status, message, code, retryAfter);
      if (retryAfter !== null && (r.status === 429 || r.status >= 500))
        limits.set(key, { until: Date.now() + retryAfter, error });
      throw error;
    }
    return text ? JSON.parse(text) : (undefined as T);
  } catch (error) {
    if (
      epoch !== generation &&
      !(error instanceof ApiError && error.status === 401)
    )
      throw stale();
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        0,
        timedOut
          ? "O servidor demorou para responder. Confira o resultado antes de repetir a operação."
          : "Operação cancelada.",
        timedOut ? "TIMEOUT" : "ABORTED",
      );
    throw new ApiError(
      0,
      "Não foi possível acessar o servidor. Confira sua conexão e o resultado antes de repetir a operação.",
      "NETWORK",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export async function refreshCsrf(options: RequestOptions = {}) {
  const result = await request<{ token: string }>("/csrf", {}, options, false);
  csrf = result.token;
}
export async function api<T = void>(
  path: string,
  method = "GET",
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const epoch = generation;
  if (method !== "GET" && !csrf) await refreshCsrf(options);
  if (epoch !== generation) throw stale();
  return request<T>(
    path,
    {
      method,
      keepalive: path === "/media/leave",
      headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    options,
  );
}
export async function upload<T>(
  path: string,
  blob: Blob,
  options: RequestOptions = {},
): Promise<T> {
  const epoch = generation;
  if (!csrf) await refreshCsrf(options);
  if (epoch !== generation) throw stale();
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": blob.type, "X-CSRF-TOKEN": csrf },
      body: blob,
    },
    { timeoutMs: 60_000, ...options },
  );
}
export async function login(username: string, password: string) {
  resetSession();
  await refreshCsrf();
  await request(
    "/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-TOKEN": csrf,
      },
      body: new URLSearchParams({ username, password }),
    },
    {},
    false,
  );
  await refreshCsrf();
}
export type User = {
  id: string;
  username: string;
  displayName: string;
  admin: boolean;
  enabled: boolean;
  primaryColor: string | null;
  secondaryColor: string | null;
  avatarVersion: number | null;
};
export type Member = Pick<
  User,
  "id" | "username" | "displayName" | "avatarVersion"
>;
export type Message = {
  id: number;
  clientId: string;
  authorId: string;
  author: string;
  body: string;
  createdAt: string;
};
export type Lease = {
  identity: string | null;
  leaseId: string | null;
  expiresAt: string | null;
};
