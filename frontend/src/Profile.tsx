import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, upload, type User } from "./api";
import { AccountSecurity } from "./AccountSecurity";
import { Icon, type IconName } from "./Icon";
import { VoiceSettings } from "./VoiceSettings";
import { ShortcutsSettings } from "./Shortcuts";
import { Avatar, avatarSrc } from "./ui";
import {
  CHOICES,
  EFFECTS,
  loadSounds,
  playEffect,
  readSound,
  saveSounds,
  type Choice,
  type SoundSettings,
} from "./sounds";
import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  PRESETS,
  SCALES,
  applyScale,
  applyTheme,
  loadScale,
  normalizeColor,
} from "./theme";

type Saved = { user: User; signedOut?: boolean };

// Photos are cropped to a square and shrunk in the browser: the server keeps
// at most 16 KB per person, so they load instantly everywhere.
async function shrink(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode().catch(() => {
    throw new Error("Formato de imagem não suportado.");
  });
  const side = Math.min(image.naturalWidth, image.naturalHeight),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  canvas
    .getContext("2d")!
    .drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      160,
      160,
    );
  for (const type of ["image/webp", "image/jpeg"])
    for (const quality of [0.85, 0.7, 0.5, 0.35]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, quality),
      );
      // Browsers without WebP encoding fall back to PNG; try JPEG then.
      if (blob?.type === type && blob.size <= 16000) return blob;
    }
  throw new Error("Imagem muito detalhada. Tente outra.");
}

// Account and security share the first tab: it opens by default, so the
// authenticator and open sessions are one click away.
type Tab = "perfil" | "voz" | "atalhos" | "aparencia" | "sons";
const TABS: [Tab, string, IconName][] = [
  ["perfil", "Conta", "people"],
  ["voz", "Voz e áudio", "mic"],
  ["atalhos", "Atalhos", "keyboard"],
  ["aparencia", "Aparência", "palette"],
  ["sons", "Sons", "volume"],
];
const TAB_KEY = "chat-friends:settings-tab";

export function Profile({
  me,
  onSaved,
  onSignedOut,
  onLogout,
  onError,
}: {
  me: User;
  onSaved: () => void;
  onSignedOut: () => void;
  onLogout: () => void;
  onError: (s: string) => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName),
    [username, setUsername] = useState(me.username),
    [primary, setPrimary] = useState(
      normalizeColor(me.primaryColor, DEFAULT_PRIMARY),
    ),
    [secondary, setSecondary] = useState(
      normalizeColor(me.secondaryColor, DEFAULT_SECONDARY),
    ),
    [busy, setBusy] = useState(""),
    [scale, setScale] = useState(loadScale),
    [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      return TABS.some(([key]) => key === saved) ? saved! : "perfil";
    } catch {
      return "perfil";
    }
  });
  function chooseTab(next: Tab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* the choice still applies to this visit */
    }
  }
  // Preview colors while choosing; leaving without saving restores yours.
  const saved = useRef(me);
  saved.current = me;
  useEffect(() => {
    applyTheme(primary, secondary);
  }, [primary, secondary]);
  useEffect(
    () => () =>
      applyTheme(saved.current.primaryColor, saved.current.secondaryColor),
    [],
  );
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice("");
    try {
      await action();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function patch(body: object, done: string) {
    const result = await api<Saved>("/profile", "PATCH", body);
    if (result.signedOut) onSignedOut();
    else {
      onSaved();
      setNotice(done);
    }
  }
  function saveProfile(e: FormEvent) {
    e.preventDefault();
    void run("perfil", () =>
      patch(
        {
          displayName: displayName.trim(),
          username: username.trim().toLowerCase(),
        },
        "Perfil atualizado.",
      ),
    );
  }
  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await run("senha", async () => {
      await api("/password", "POST", data);
      onLogout();
    });
  }
  const renaming = username.trim().toLowerCase() !== me.username;
  const password = (
    <form className="settings-card" onSubmit={(e) => void changePassword(e)}>
      <h3>Alterar minha senha</h3>
      <p className="muted">
        Pelo menos 12 caracteres (máximo de 72 bytes). Você sai de todas as
        sessões.
      </p>
      <label>
        Senha atual
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        Nova senha
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>
      <button className="primary" disabled={!!busy}>
        Alterar senha e sair
      </button>
    </form>
  );
  return (
    <section className="settings profile">
      <h2>Configurações</h2>
      <nav className="settings-tabs" role="tablist" aria-label="Seções">
        {TABS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => chooseTab(key)}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}

      {tab === "voz" && <VoiceSettings userId={me.id} />}
      {tab === "atalhos" && <ShortcutsSettings onError={onError} />}
      {tab === "sons" && <SoundsCard userId={me.id} onError={onError} />}

      {tab === "perfil" && (
        <>
          <AccountSecurity />
          <div className="settings-card">
            <h3>Foto de perfil</h3>
            <div className="avatar-editor">
              <Avatar name={me.displayName} src={avatarSrc(me)} size={84} />
              <div>
                <input
                  ref={file}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  aria-label="Escolher foto de perfil"
                  onChange={(e) => {
                    const chosen = e.target.files?.[0];
                    e.target.value = "";
                    if (chosen)
                      void run("foto", async () => {
                        await upload("/profile/avatar", await shrink(chosen));
                        onSaved();
                        setNotice("Foto atualizada.");
                      });
                  }}
                />
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => file.current?.click()}
                >
                  {busy === "foto" ? "Enviando…" : "Trocar foto"}
                </button>
                {me.avatarVersion && (
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void run("foto", async () => {
                        await api("/profile/avatar", "DELETE");
                        onSaved();
                        setNotice("Foto removida.");
                      })
                    }
                  >
                    Remover
                  </button>
                )}
                <small>A imagem é recortada em quadrado e reduzida.</small>
              </div>
            </div>
          </div>

          <form className="settings-card" onSubmit={saveProfile}>
            <h3>Perfil</h3>
            <label>
              Nome de exibição (nick)
              <input
                value={displayName}
                maxLength={64}
                required
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label>
              Usuário (para entrar)
              <input
                value={username}
                maxLength={32}
                required
                pattern="[a-z0-9][a-z0-9_.\-]{2,31}"
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            {renaming && (
              <small className="warning">
                Ao trocar o usuário você sai de todas as sessões e entra de novo
                com <strong>{username.trim().toLowerCase()}</strong>.
              </small>
            )}
            <button className="primary" disabled={!!busy}>
              {busy === "perfil" ? "Salvando…" : "Salvar perfil"}
            </button>
          </form>
          {password}
        </>
      )}

      {tab === "aparencia" && (
        <div className="settings-card">
          <h3>Aparência</h3>
          <p className="muted">
            Só você vê as suas cores. Sua escolha é preservada; texto, controles
            e indicadores usam variações com contraste legível.
          </p>
          <div className="swatches">
            {PRESETS.map(([name, p, s]) => (
              <button
                key={name}
                type="button"
                className={
                  "swatch" + (p === primary && s === secondary ? " chosen" : "")
                }
                title={name}
                aria-label={"Tema " + name}
                onClick={() => {
                  setPrimary(p);
                  setSecondary(s);
                }}
              >
                <SwatchDot primary={p} secondary={s} />
                <span>{name}</span>
              </button>
            ))}
          </div>
          <label>
            Tamanho da interface
            <select
              value={scale}
              onChange={(e) => {
                setScale(e.target.value);
                applyScale(e.target.value, true);
              }}
            >
              {SCALES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="color-pickers">
            <label>
              Cor primária
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              />
            </label>
            <label>
              Cor secundária
              <input
                type="color"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="primary"
              disabled={!!busy}
              onClick={() =>
                void run("cores", () =>
                  patch(
                    { primaryColor: primary, secondaryColor: secondary },
                    "Aparência salva.",
                  ),
                )
              }
            >
              {busy === "cores" ? "Salvando…" : "Salvar aparência"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => {
                setPrimary(DEFAULT_PRIMARY);
                setSecondary(DEFAULT_SECONDARY);
                void run("cores", () =>
                  patch(
                    { primaryColor: "", secondaryColor: "" },
                    "Cores padrão restauradas.",
                  ),
                );
              }}
            >
              <Icon name="reset" size={16} /> Padrão
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SoundsCard({
  userId,
  onError,
}: {
  userId: string;
  onError: (s: string) => void;
}) {
  const [sounds, setSounds] = useState(() => loadSounds(userId));
  function change(next: SoundSettings) {
    try {
      saveSounds(userId, next);
      setSounds(next);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <div className="settings-card">
      <h3>Sons</h3>
      <p className="muted">
        Escolha o som de cada momento ou envie o seu (até 300 KB e 5 s). Fica
        salvo só neste navegador. O volume é o de “Efeitos sonoros”, no menu do
        microfone.
      </p>
      <div className="sound-rows">
        {EFFECTS.map(([effect, label]) => (
          <div className="sound-row" key={effect}>
            <span>{label}</span>
            <select
              aria-label={"Som de " + label}
              value={sounds.choice[effect]}
              onChange={(e) =>
                change({
                  ...sounds,
                  choice: {
                    ...sounds.choice,
                    [effect]: e.target.value as Choice,
                  },
                })
              }
            >
              {(Object.entries(CHOICES) as [Choice, string][])
                .filter(([c]) => c !== "custom" || sounds.custom[effect])
                .map(([c, name]) => (
                  <option key={c} value={c}>
                    {name}
                  </option>
                ))}
            </select>
            <label className="file-button" title="Enviar um som">
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                aria-label={"Enviar som para " + label}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    readSound(file)
                      .then((data) =>
                        change({
                          choice: { ...sounds.choice, [effect]: "custom" },
                          custom: { ...sounds.custom, [effect]: data },
                        }),
                      )
                      .catch((err) => onError((err as Error).message));
                }}
              />
              Enviar
            </label>
            <button
              type="button"
              aria-label={"Testar som de " + label}
              title="Testar"
              onClick={() => playEffect(effect, 0.6, sounds)}
            >
              ▶
            </button>
          </div>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          onClick={() =>
            change({
              choice: {
                join: "rizz",
                leave: "fortnite",
                mute: "down",
                unmute: "up",
              },
              custom: {},
            })
          }
        >
          <Icon name="reset" size={16} /> Sons padrão
        </button>
      </div>
    </div>
  );
}

function SwatchDot({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current!.style.setProperty("--a", primary);
    ref.current!.style.setProperty("--b", secondary);
  }, [primary, secondary]);
  return <span ref={ref} className="swatch-dot" />;
}
