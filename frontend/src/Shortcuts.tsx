import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { getVoice, type VoiceControls } from "./voiceStore";

// Personal keyboard shortcuts (docs/SHORTCUTS_PLAN.md). Saved per account and
// platform on the server; they only work while this page has focus.
export type Action =
  | "toggleMic"
  | "toggleDeaf"
  | "pushToTalk"
  | "leaveVoice"
  | "toggleStreamSound";
export const ACTIONS: [Action, string][] = [
  ["toggleMic", "Ligar/desligar microfone"],
  ["toggleDeaf", "Silenciar/ouvir vozes da call (sem transmissão ou música)"],
  ["pushToTalk", "Apertar para falar (segure)"],
  ["toggleStreamSound", "Silenciar o som da transmissão"],
  ["leaveVoice", "Sair da voz"],
];
export type Binding = {
  action: Action;
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};
type Config = {
  platform: "mac" | "other";
  revision: number;
  enabled: boolean;
  allowWhileTyping: boolean;
  bindings: Binding[];
};

export const platform: "mac" | "other" = /Mac|iPhone|iPad/.test(
  navigator.userAgent,
)
  ? "mac"
  : "other";

let config: Config | null = null,
  recording = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export function setShortcuts(next: Config | null) {
  config = next;
  emit();
}
export const setRecording = (on: boolean) => {
  recording = on;
};
export function useShortcuts() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => config,
  );
}
export async function loadShortcuts() {
  setShortcuts(await api<Config>(`/me/shortcuts?platform=${platform}`));
}

const MODIFIER =
  /^(Control|Shift|Alt|Meta|OS)(Left|Right)$|^(AltGraph|CapsLock|Fn|FnLock)$/;
const FUNCTION_ONLY = /^F(1[3-9]|2[0-4])$/;
// Common browser/system combinations that the page should not take over.
const RESERVED = [
  "ctrl+KeyW",
  "ctrl+KeyT",
  "ctrl+KeyN",
  "ctrl+KeyQ",
  "ctrl+KeyR",
  "ctrl+KeyL",
  "ctrl+Tab",
  "ctrl+shift+KeyT",
  "ctrl+shift+KeyN",
  "ctrl+shift+KeyI",
  "alt+F4",
  "alt+Tab",
  "meta+KeyW",
  "meta+KeyT",
  "meta+KeyN",
  "meta+KeyQ",
  "meta+KeyR",
  "meta+KeyL",
  "meta+Tab",
  "meta+Space",
];
const id = (b: Omit<Binding, "action">) =>
  [
    b.ctrl && "ctrl",
    b.alt && "alt",
    b.shift && "shift",
    b.meta && "meta",
    b.code,
  ]
    .filter(Boolean)
    .join("+");

export function fromEvent(e: KeyboardEvent): Omit<Binding, "action"> {
  return {
    code: e.code,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  };
}
// Same rules as the server, plus the reserved list it cannot know about.
export function problem(b: Omit<Binding, "action">) {
  if (!b.code || MODIFIER.test(b.code))
    return "Segure Ctrl, Alt ou ⌘ e aperte outra tecla.";
  if (!(b.ctrl || b.alt || b.meta) && !FUNCTION_ONLY.test(b.code))
    return "Use Ctrl, Alt ou ⌘ junto (Shift sozinho não basta).";
  if (RESERVED.includes(id(b)))
    return "Essa combinação é do navegador ou do sistema.";
  return "";
}
const KEY_NAMES: Record<string, string> = {
  Space: "Espaço",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};
export function describe(b: Omit<Binding, "action">) {
  const mac = platform === "mac";
  const key = b.code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "Num ");
  return [
    b.ctrl && (mac ? "⌃" : "Ctrl"),
    b.alt && (mac ? "⌥" : "Alt"),
    b.shift && (mac ? "⇧" : "Shift"),
    b.meta && (mac ? "⌘" : "Win"),
    KEY_NAMES[b.code] ?? key,
  ].filter(Boolean) as string[];
}

const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function run(voice: VoiceControls, action: Action) {
  if (!voice.joined) return;
  if (action === "toggleMic") void voice.toggleMic();
  else if (action === "toggleDeaf") void voice.toggleDeaf();
  else if (action === "leaveVoice") void voice.leave();
  else if (action === "toggleStreamSound") voice.toggleStreamSound();
}

// One window listener for the whole app; removed on logout/unmount.
export function useKeyboardShortcuts() {
  useEffect(() => {
    let held: string | null = null;
    const release = () => {
      if (!held) return;
      held = null;
      void getVoice()?.pushToTalk(false);
    };
    // The outcome of the last key press, readable in tests and devtools.
    const note = (outcome: string) =>
      (document.documentElement.dataset.shortcut = outcome);
    const down = (e: KeyboardEvent) => {
      if (MODIFIER.test(e.code)) return;
      if (!config?.enabled) return note(config ? "disabled" : "not-loaded");
      if (recording || e.isComposing) return note("recording");
      if (editable(e.target) && !config.allowWhileTyping) return note("typing");
      const pressed = id(fromEvent(e));
      const binding = config.bindings.find((b) => id(b) === pressed);
      const voice = getVoice();
      if (!binding)
        return note(
          "no-binding " +
            pressed +
            " in [" +
            config.bindings.map((b) => id(b)).join(",") +
            "]",
        );
      if (!voice?.joined) return note("not-in-voice");
      note(binding.action);
      e.preventDefault();
      if (binding.action === "pushToTalk") {
        if (held) return;
        held = e.code;
        void voice.pushToTalk(true);
      } else if (!e.repeat) run(voice, binding.action);
    };
    const up = (e: KeyboardEvent) => {
      if (held && e.code === held) release();
    };
    const hidden = () => document.visibilityState === "hidden" && release();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      release();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
}

export function ShortcutsSettings({
  onError,
}: {
  onError: (s: string) => void;
}) {
  const saved = useShortcuts();
  const [draft, setDraft] = useState<Config | null>(saved),
    [recordingFor, setRecordingFor] = useState<Action | null>(null),
    [hint, setHint] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!saved) void loadShortcuts().catch((e) => onError(e.message));
  }, [saved, onError]);
  useEffect(() => {
    if (saved && !draft) setDraft(saved);
  }, [saved, draft]);
  // Recording suspends the room's shortcuts and takes the next combination.
  useEffect(() => {
    if (!recordingFor) return;
    setRecording(true);
    const take = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingFor(null);
        setHint("");
        return;
      }
      if (MODIFIER.test(e.code)) return; // wait for the actual key
      const combo = fromEvent(e),
        why = problem(combo);
      if (why) {
        setHint(why);
        return;
      }
      const old = draftRef.current;
      if (!old) return;
      const others = old.bindings.filter((b) => b.action !== recordingFor);
      const clash = others.find((b) => id(b) === id(combo));
      if (clash) {
        setHint(
          "Já usada em: " +
            ACTIONS.find(([a]) => a === clash.action)?.[1] +
            ".",
        );
        return;
      }
      setHint("");
      setRecordingFor(null);
      setDraft({
        ...old,
        bindings: [...others, { action: recordingFor, ...combo }],
      });
    };
    window.addEventListener("keydown", take, true);
    return () => {
      window.removeEventListener("keydown", take, true);
      setRecording(false);
    };
  }, [recordingFor]);
  if (!draft) return <p className="muted">Carregando atalhos…</p>;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  async function save() {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    try {
      const next = await api<Config>("/me/shortcuts", "PUT", draft);
      setShortcuts(next);
      setDraft(next);
      setNotice("Atalhos salvos.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-card shortcuts">
      <h3>Atalhos de teclado</h3>
      <p className="muted">
        Cada pessoa configura os seus (
        {platform === "mac" ? "Mac" : "Windows/Linux"}
        ). Funcionam com esta página em foco, inclusive em tela cheia;{" "}
        <strong>não funcionam dentro do jogo</strong>, porque o navegador não
        recebe as teclas de outro programa.
      </p>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <ul className="shortcut-list">
        {ACTIONS.map(([action, label]) => {
          const binding = draft.bindings.find((b) => b.action === action);
          const active = recordingFor === action;
          return (
            <li key={action}>
              <span>{label}</span>
              <span className="keys">
                {active ? (
                  <em>Aperte a combinação… (Esc cancela)</em>
                ) : binding ? (
                  describe(binding).map((k) => <kbd key={k}>{k}</kbd>)
                ) : (
                  <em>Sem atalho</em>
                )}
              </span>
              <span className="shortcut-actions">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setHint("");
                    setRecordingFor(active ? null : action);
                  }}
                >
                  {active ? "Cancelar" : binding ? "Trocar" : "Gravar"}
                </button>
                {binding && !active && (
                  <button
                    type="button"
                    aria-label={"Remover atalho de " + label}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        bindings: draft.bindings.filter(
                          (b) => b.action !== action,
                        ),
                      })
                    }
                  >
                    Remover
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {hint && (
        <p role="alert" className="warning">
          {hint}
        </p>
      )}
      <label className="noise-toggle">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />{" "}
        Atalhos ativados
      </label>
      <label className="noise-toggle">
        <input
          type="checkbox"
          checked={draft.allowWhileTyping}
          onChange={(e) =>
            setDraft({ ...draft, allowWhileTyping: e.target.checked })
          }
        />{" "}
        Usar os atalhos mesmo enquanto digito no chat
      </label>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || !changed}
          onClick={() => void save()}
        >
          {busy ? "Salvando…" : "Salvar atalhos"}
        </button>
        <button
          type="button"
          disabled={busy || !changed}
          onClick={() => setDraft(saved)}
        >
          Desfazer
        </button>
      </div>
      <small>
        Exige Ctrl, Alt ou ⌘ junto, para não atrapalhar a digitação. As teclas
        F13 a F24 (comuns em mouses e teclados gamer) podem ser usadas sozinhas.
      </small>
    </div>
  );
}
