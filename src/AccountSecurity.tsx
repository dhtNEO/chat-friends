import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
export type SecurityState = {
  mfaEnabled: boolean;
  mfaPending: boolean;
  enrollmentRequired: boolean;
};
type Session = {
  id: string;
  current: boolean;
  lastAccessAt: number;
  expiresAt: number;
};
export function MfaGate({
  state,
  onDone,
}: {
  state: SecurityState;
  onDone: () => Promise<void>;
}) {
  const [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (state.mfaPending) {
        await api("/security/mfa/verify", "POST", data);
        await onDone();
      } else if (!secret) {
        const result = await api<{ secret: string }>(
          "/security/mfa/setup",
          "POST",
          data,
        );
        setSecret(result.secret);
      } else {
        const result = await api<{ recoveryCodes: string[] }>(
          "/security/mfa/confirm",
          "POST",
          data,
        );
        setCodes(result.recoveryCodes);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="security-page">
      <section className="settings">
        <h1>{state.mfaPending ? "Verificar acesso" : "Proteger sua conta"}</h1>
        {codes.length ? (
          <>
            <p>
              Guarde estes códigos em um lugar privado fora deste aparelho. Cada
              código funciona uma única vez.
            </p>
            <ul>
              {codes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={() => void onDone()}>
              Guardei os códigos. Continuar
            </button>
          </>
        ) : (
          <>
            <p>
              {state.mfaPending
                ? "Digite o código do autenticador ou um código de recuperação."
                : "Use um autenticador TOTP, como o app Senhas da Apple, para adicionar uma segunda etapa ao login."}
            </p>
            {secret && (
              <>
                <p>
                  Adicione esta chave manualmente no autenticador (TOTP, 6
                  dígitos, 30 segundos):
                </p>
                <p className="mfa-secret">
                  <code>{secret}</code>
                </p>
              </>
            )}
            <form onSubmit={(e) => void submit(e)}>
              {!state.mfaPending && !secret ? (
                <label>
                  Senha atual
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    maxLength={128}
                  />
                </label>
              ) : (
                <label>
                  Código do autenticador ou de recuperação
                  <input
                    name="code"
                    required
                    autoComplete="one-time-code"
                    maxLength={32}
                  />
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Verificando…"
                  : !secret && !state.mfaPending
                    ? "Configurar autenticador"
                    : "Confirmar código"}
              </button>
            </form>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          onClick={() =>
            void api("/logout", "POST").then(() => location.reload())
          }
        >
          Sair
        </button>
      </section>
    </main>
  );
}
export function AccountSecurity() {
  const [state, setState] = useState<SecurityState>(),
    [sessions, setSessions] = useState<Session[]>([]),
    [setup, setSetup] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const me = await api<{ security: SecurityState }>("/me");
    setState(me.security);
    setSessions(await api("/security/sessions"));
  }, []);
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, [load]);
  if (setup && state)
    return (
      <MfaGate
        state={{ ...state, enrollmentRequired: true }}
        onDone={async () => {
          setSetup(false);
          await load();
        }}
      />
    );
  return (
    <section className="settings">
      <h2>Segurança</h2>
      <p>
        O login expira após 8 horas, mesmo em uso. Operações administrativas
        exigem confirmação recente da identidade.
      </p>
      <p>Autenticador: {state?.mfaEnabled ? "ativado" : "não configurado"}</p>
      {state && !state.mfaEnabled && (
        <button onClick={() => setSetup(true)}>Ativar autenticador</button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const proof = Object.fromEntries(new FormData(f));
          void api("/security/reauth", "POST", proof)
            .then(() => {
              f.reset();
              setNotice(
                "Identidade confirmada por 15 minutos. Repita a operação desejada.",
              );
            })
            .catch((e) => setNotice(e.message));
        }}
      >
        <label>
          Senha para confirmar identidade
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {state?.mfaEnabled && (
          <label>
            Código do autenticador
            <input
              name="code"
              autoComplete="one-time-code"
              required
              maxLength={32}
            />
          </label>
        )}
        <button>Confirmar identidade</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      <h3>Sessões abertas</h3>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            {s.current ? "Esta sessão" : "Outra sessão"} · último uso{" "}
            {new Date(s.lastAccessAt).toLocaleString("pt-BR")}{" "}
            <button
              onClick={() =>
                void api("/security/sessions/" + s.id, "DELETE")
                  .then(async () => {
                    if (s.current) location.reload();
                    else await load();
                  })
                  .catch((e) => setNotice(e.message))
              }
            >
              Encerrar sessão
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
