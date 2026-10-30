import { useId, useRef, type FormEvent } from "react";
import { Icon } from "./Icon";
import { Popover } from "./ui";

export const MESSAGE_LIMIT = 4000;
export function limitMessage(value: string) {
  const result = value.slice(0, MESSAGE_LIMIT);
  // Do not leave half of an astral emoji at the UTF-16 boundary.
  return /[\uD800-\uDBFF]$/.test(result) ? result.slice(0, -1) : result;
}

export function ChatComposer({
  body,
  onDraft,
  onSend,
}: {
  body: string;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (composing.current || !body.trim() || body.length > MESSAGE_LIMIT)
      return;
    onSend();
  }
  function insert(emoji: string) {
    if (composing.current) return;
    const el = input.current;
    let start = el?.selectionStart ?? body.length;
    let end = el?.selectionEnd ?? body.length;
    // Selection offsets count UTF-16 units; replace the whole code point if a
    // programmatic selection happens to cut a surrogate pair.
    const split = (offset: number) =>
      /[\uD800-\uDBFF]/.test(body[offset - 1] ?? "") &&
      /[\uDC00-\uDFFF]/.test(body[offset] ?? "");
    if (split(start)) start--;
    if (split(end)) end++;
    const next = body.slice(0, start) + emoji + body.slice(end);
    if (next.length > MESSAGE_LIMIT) return;
    onDraft(next);
    requestAnimationFrame(() => {
      if (!el?.isConnected) return;
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }
  return (
    <form className="composer" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        Mensagem em geral
      </label>
      <div className="composer-box">
        <textarea
          id={id}
          ref={input}
          rows={2}
          maxLength={MESSAGE_LIMIT}
          placeholder="Conversar em #geral…"
          value={body}
          autoComplete="off"
          onChange={(event) => onDraft(limitMessage(event.target.value))}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            onDraft(limitMessage(event.currentTarget.value));
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            if (
              composing.current ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            )
              return;
            event.preventDefault();
            if (!event.repeat) event.currentTarget.form?.requestSubmit();
          }}
        />
        <Popover label="Emojis" icon="smile" className="emoji-picker">
          <div className="emoji-grid">
            {EMOJIS.map((emoji) => (
              <button type="button" key={emoji} onClick={() => insert(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </Popover>
        <button
          className="send"
          aria-label="Enviar mensagem"
          disabled={!body.trim() || body.length > MESSAGE_LIMIT}
        >
          <Icon name="send" size={18} />
        </button>
      </div>
      <footer>
        <span>Enter para enviar · Shift+Enter para nova linha</span>
        <span aria-live="polite" aria-label="Limite da mensagem">
          {body.length}/{MESSAGE_LIMIT}
        </span>
      </footer>
    </form>
  );
}
const EMOJIS = [
  "😀",
  "😂",
  "🤣",
  "😅",
  "😊",
  "😍",
  "😎",
  "🤔",
  "😴",
  "😭",
  "😡",
  "🥲",
  "🤯",
  "🥳",
  "😏",
  "🙃",
  "👍",
  "👎",
  "👏",
  "🙏",
  "💪",
  "🔥",
  "✨",
  "🎉",
  "❤️",
  "💜",
  "💀",
  "👀",
  "🎮",
  "🕹️",
  "🏆",
  "🎯",
  "⚔️",
  "🛡️",
  "🍕",
  "🍺",
  "☕",
  "🌙",
  "✅",
  "❌",
];
