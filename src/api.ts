let csrf = "";
const serverUnavailable =
  "O servidor está indisponível no momento. Tente novamente em instantes.";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function authenticationFetch(path: string, options?: RequestInit) {
  try {
    return await fetch(path, options);
  } catch {
    throw new Error(
      "Não foi possível acessar o servidor. Confira sua conexão e tente novamente.",
    );
  }
}

export async function refreshCsrf() {
  const r = await authenticationFetch("/api/csrf");
  if (!r.ok)
    throw new ApiError(
      r.status,
      r.status >= 500
        ? serverUnavailable
        : r.status === 429
          ? "Muitas tentativas. Aguarde 5 minutos."
          : "Não foi possível iniciar a sessão. Recarregue a página e permita os cookies deste site.",
    );
  csrf = (await r.json()).token;
}
export async function api<T = void>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (method !== "GET" && !csrf) await refreshCsrf();
  const r = await fetch("/api" + path, {
    method,
    keepalive: path === "/media/leave",
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    if (r.status === 401) {
      csrf = "";
      window.dispatchEvent(new Event("session-ended"));
    }
    let detail = "";
    try {
      detail = (await r.json()).error || "";
    } catch {
      /* no JSON */
    }
    throw new ApiError(
      r.status,
      r.status === 401
        ? "Sessão encerrada. Entre novamente."
        : r.status === 429
          ? "Muitas tentativas. Aguarde um pouco."
          : detail || "Não foi possível concluir a operação. Tente novamente.",
    );
  }
  return r.status === 204 || r.headers.get("content-length") === "0"
    ? (undefined as T)
    : r.text().then((t) => (t ? JSON.parse(t) : undefined));
}
// Raw upload (avatars): same CSRF and error handling as api().
export async function upload<T>(path: string, blob: Blob): Promise<T> {
  if (!csrf) await refreshCsrf();
  const r = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": blob.type, "X-CSRF-TOKEN": csrf },
    body: blob,
  });
  if (!r.ok) {
    if (r.status === 401) {
      csrf = "";
      window.dispatchEvent(new Event("session-ended"));
    }
    let detail = "";
    try {
      detail = (await r.json()).error || "";
    } catch {
      /* no JSON */
    }
    throw new Error(detail || "Não foi possível enviar a imagem.");
  }
  return r.json();
}
export async function login(username: string, password: string) {
  await refreshCsrf();
  const r = await authenticationFetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRF-TOKEN": csrf,
    },
    body: new URLSearchParams({ username, password }),
  });
  if (!r.ok)
    throw new ApiError(
      r.status,
      r.status === 401
        ? "Usuário ou senha inválidos."
        : r.status === 403
          ? "Sua sessão de acesso não pôde ser validada. Recarregue a página e permita os cookies deste site."
          : r.status === 429
            ? "Muitas tentativas. Aguarde 5 minutos."
            : r.status >= 500
              ? serverUnavailable
              : "Não foi possível entrar no momento. Recarregue a página e tente novamente.",
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
