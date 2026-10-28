import { useEffect, useRef, useState } from "react";
const SYMBOLS = ["✦", "♥", "☾", "♣"];
export function SlotMachine({
  symbols,
  spinning,
  settling,
  onPull,
  disabled,
  remaining,
}: {
  symbols: string;
  spinning: boolean;
  settling: boolean;
  onPull: () => void;
  disabled: boolean;
  remaining: number;
}) {
  const drag = useRef<{ y: number; pulled: boolean } | null>(null);
  const reelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pulling, setPulling] = useState(false),
    [settled, setSettled] = useState(0);
  useEffect(() => {
    if (!spinning) {
      setSettled(0);
      return;
    }
    if (!settling) return;
    const timers = [3700, 4400, 5100].map((ms, i) =>
      setTimeout(() => setSettled(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [spinning, settling]);
  useEffect(() => {
    if (!spinning) return;
    setPulling(true);
    const t = setTimeout(() => setPulling(false), 550);
    return () => clearTimeout(t);
  }, [spinning]);
  useEffect(() => {
    if (!spinning || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const animations = reelRefs.current.map((el, i) =>
      (i >= settled ? el : undefined)?.animate(
        [{ transform: "translateY(-55%)" }, { transform: "translateY(-5%)" }],
        { duration: 2200 + i * 400, iterations: Infinity, easing: "linear" },
      ),
    );
    return () => animations.forEach((a) => a?.cancel());
  }, [spinning, settled]);
  return (
    <div
      className={
        "slot-cabinet" +
        (pulling ? " lever-pulled" : "") +
        (spinning ? " is-spinning" : "")
      }
    >
      <div className="slot-marquee">
        <span>★ ★ ★</span>
        <strong>LUCKY CLUB</strong>
        <small>GOLDEN EDITION</small>
      </div>
      <div className="slot-machine-body">
        <div className="slot-payline" aria-hidden="true">
          ▶
        </div>
        <div className="slot-windows" aria-label="Rolos do caça-níquel">
          {symbols.split("").map((s, i) => (
            <div className="slot-window" key={i}>
              <div
                className="slot-strip"
                ref={(el) => {
                  reelRefs.current[i] = el;
                }}
              >
                {spinning && i >= settled ? (
                  Array.from({ length: 20 }, (_, n) => (
                    <span key={n}>{SYMBOLS[(n + i) % 4]}</span>
                  ))
                ) : (
                  <>
                    <span>{SYMBOLS[(Number(s) + 1) % 4]}</span>
                    <span>{SYMBOLS[Number(s)]}</span>
                    <span>{SYMBOLS[(Number(s) + 3) % 4]}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="slot-payline" aria-hidden="true">
          ◀
        </div>
      </div>
      <button
        className="slot-lever"
        aria-label="Puxar manivela"
        onPointerDown={(e) => {
          if (disabled) return;
          drag.current = { y: e.clientY, pulled: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (
            drag.current &&
            !drag.current.pulled &&
            !disabled &&
            e.clientY - drag.current.y > 30
          ) {
            drag.current.pulled = true;
            onPull();
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        disabled={disabled}
        onClick={onPull}
      >
        <span className="slot-lever-base" />
        <span className="slot-lever-arm">
          <span className="slot-lever-knob" />
        </span>
        <small>PUXE</small>
      </button>
      <div className="slot-machine-trim">
        <span>
          TRINCA <b>30 C</b>
        </span>
        <span>
          PAR <b>8 C</b>
        </span>
        <span>
          GIRO <b>2 C</b>
        </span>
      </div>
      <div className="slot-tray">
        <span>✦</span>
        <strong>
          {spinning
            ? "A SORTE ESTÁ GIRANDO…"
            : `${remaining} GIROS GRÁTIS DISPONÍVEIS`}
        </strong>
        <span>✦</span>
      </div>
    </div>
  );
}
