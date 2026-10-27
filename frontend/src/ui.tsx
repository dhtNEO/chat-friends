import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!(e.target instanceof Node && root.current?.contains(e.target)))
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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
        title={label}
        onClick={() => setOpen(!open)}
      >
        <Icon name={icon} size={icon === "chevron" ? 14 : 20} />
      </button>
      {open && (
        <div className="popover-menu" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
