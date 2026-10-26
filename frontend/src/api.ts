let csrf = "";
export async function refreshCsrf() {
  const r = await fetch("/api/csrf");
  if (!r.ok) throw new Error("Não foi possível iniciar a sessão");
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
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json()).error || "";
    } catch {
      /* no JSON */
    }
    throw new Error(
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
export async function login(username: string, password: string) {
  await refreshCsrf();
  const r = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRF-TOKEN": csrf,
    },
    body: new URLSearchParams({ username, password }),
  });
  if (!r.ok)
    throw new Error(
      r.status === 429
        ? "Muitas tentativas. Aguarde 5 minutos."
        : "Usuário ou senha inválidos.",
    );
  await refreshCsrf();
}
export type User = {
  id: string;
  username: string;
  displayName: string;
  admin: boolean;
  enabled: boolean;
};
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
