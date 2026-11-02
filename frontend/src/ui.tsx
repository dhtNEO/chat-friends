import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { Member } from "./api";

// Current names and photos by account id and username. Messages and voice
// carry the name from when they were made; this keeps everyone up to date.
export type People = {
  byId: Map<string, Member>;
  byUsername: Map<string, Member>;
};
export const PeopleContext = createContext<People>({
  byId: new Map(),
  byUsername: new Map(),
});
export const usePeople = () => useContext(PeopleContext);
let resolveAvatar = (m: Member) => `/api/avatars/${m.id}?v=${m.avatarVersion}`;
// The demo keeps photos in memory and serves them as data: URLs.
export function setAvatarResolver(resolver: (m: Member) => string) {
  resolveAvatar = resolver;
}
export const avatarSrc = (m?: Member | null) =>
  m?.avatarVersion ? resolveAvatar(m) : undefined;

// A stable hue per person, so the same friend keeps the same color everywhere.
function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export function Avatar({
  name,
  src,
  size = 36,
  speaking = false,
}: {
  name: string;
  src?: string;
  size?: number;
  speaking?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Set through CSSOM: the CSP forbids inline style attributes.
  useEffect(() => {
    const el = ref.current!;
    el.style.setProperty("--avatar-hue", String(hue(name)));
    el.style.setProperty("--avatar-size", size / 14 + "rem");
  }, [name, size]);
  return (
    <span
      ref={ref}
      className={"avatar" + (speaking ? " speaking" : "")}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}

// A button with an attached menu that closes on Escape or an outside click.
export function Popover({
  label,
  icon = "chevron",
  className = "",
  children,
}: {
  label: string;
  icon?: "chevron" | "more" | "smile" | "settings";
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
    maxWidth: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useLayoutEffect(() => {
    if (!open || !menu.current || !root.current) return;
    const popup = menu.current;
    const anchor = root.current;
    const place = () => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const anchorTop = Math.max(
        top + margin,
        Math.min(rect.top, top + height - margin),
      );
      const anchorBottom = Math.max(
        top + margin,
        Math.min(rect.bottom, top + height - margin),
      );
      const above = anchorTop - top - margin;
      const below = top + height - anchorBottom - margin;
      const useAbove =
        above >= Math.min(popup.scrollHeight, height * 0.7) || above >= below;
      const next = {
        left: Math.max(
          left + margin,
          Math.min(
            rect.left + rect.width / 2 - popup.offsetWidth / 2,
            left + width - popup.offsetWidth - margin,
          ),
        ),
        top: useAbove ? undefined : anchorBottom + margin,
        bottom: useAbove ? window.innerHeight - anchorTop + margin : undefined,
        maxHeight: Math.max(
          1,
          Math.min(height - margin * 2, useAbove ? above : below),
        ),
        maxWidth: Math.max(1, width - margin * 2),
      };
      setPlacement((old) =>
        old &&
        old.left === next.left &&
        old.top === next.top &&
        old.bottom === next.bottom &&
        old.maxHeight === next.maxHeight &&
        old.maxWidth === next.maxWidth
          ? old
          : next,
      );
    };
    place();
    const focusFrame = requestAnimationFrame(() => {
      (
        popup.querySelector<HTMLElement>(
          "input, select, button, [tabindex='0']",
        ) || popup
      ).focus({ preventScroll: true });
    });
    const observer = new ResizeObserver(place);
    observer.observe(popup);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (
        !(
          e.target instanceof Node &&
          (root.current?.contains(e.target) || menu.current?.contains(e.target))
        )
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      root.current?.querySelector("button")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className={"popover " + className} ref={root}>
      <button
        type="button"
        className="popover-toggle"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? menuId : undefined}
        title={label}
        onClick={(e) => {
          setHost(
            e.currentTarget.closest<HTMLElement>(".app-shell") || document.body,
          );
          setPlacement(null);
          setOpen(!open);
        }}
      >
        <Icon name={icon} size={icon === "chevron" ? 14 : 20} />
      </button>
      {open &&
        host &&
        createPortal(
          <div
            className="popover-menu"
            role="dialog"
            aria-label={label}
            id={menuId}
            ref={menu}
            tabIndex={-1}
            style={{
              position: "fixed",
              transform: "none",
              zIndex: 100,
              width: "min(20.7143rem, calc(100vw - 16px))",
              visibility: placement ? "visible" : "hidden",
              top: placement?.top ?? "auto",
              bottom: placement?.bottom ?? "auto",
              left: placement?.left ?? 8,
              maxHeight: placement?.maxHeight ?? "70dvh",
              maxWidth: placement?.maxWidth ?? "calc(100vw - 16px)",
            }}
          >
            {children}
          </div>,
          host,
        )}
    </div>
  );
}
