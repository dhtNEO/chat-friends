import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DESTINATIONS, type Destination } from "./navigation";
import type { PanelKind } from "./Dock";
import { Icon } from "./Icon";
import { MobileDrawer } from "./MobileDrawer";
import { Logo } from "./Logo";
import "./SimpleShell.css";

export function SimpleShell({
  advanced,
  destination,
  navigate,
  stageHost,
  render,
  extra,
  onExtra,
  admin,
  onAdvanced,
  onLogout,
  onMiniHost,
  error,
  onError,
}: {
  advanced: boolean;
  destination: Destination;
  navigate: (d: Destination) => void;
  stageHost: HTMLElement;
  render: (kind: PanelKind) => ReactNode;
  extra: PanelKind | null;
  onExtra: (kind: PanelKind | null) => void;
  admin: boolean;
  onAdvanced: () => void;
  onLogout: () => void;
  onMiniHost: (node: HTMLDivElement | null) => void;
  error: string;
  onError: (error: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null),
    more = useRef<HTMLButtonElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const [menu, setMenu] = useState(false),
    [wide, setWide] = useState(() => matchMedia("(min-width: 1024px)").matches),
    [tablet, setTablet] = useState(
      () => matchMedia("(min-width: 600px)").matches,
    ),
    [aux, setAux] = useState<boolean | null>(null);
  const [visited, setVisited] = useState<Set<Destination>>(
    () => new Set(["conversa", destination]),
  );
  useEffect(() => {
    const a = matchMedia("(min-width: 1024px)"),
      b = matchMedia("(min-width: 600px)");
    const resize = () => {
      setWide(a.matches);
      setTablet(b.matches);
    };
    a.addEventListener("change", resize);
    b.addEventListener("change", resize);
    return () => {
      a.removeEventListener("change", resize);
      b.removeEventListener("change", resize);
    };
  }, []);
  useEffect(() => {
    setVisited((old) =>
      old.has(destination) ? old : new Set([...old, destination]),
    );
  }, [destination]);
  useLayoutEffect(() => {
    if (!advanced && stage.current) {
      stage.current.appendChild(stageHost);
      for (const video of stageHost.querySelectorAll("video"))
        void video.play().catch(() => {});
    }
  }, [advanced, stageHost]);
  useEffect(() => {
    if (!advanced) heading.current?.focus({ preventScroll: true });
  }, [advanced, destination, extra]);
  useEffect(() => setMenu(false), [destination]);
  const auxiliary: Destination = destination === "sala" ? "conversa" : "sala";
  const showAux = !extra && tablet && (aux ?? wide);
  const choose = (d: Destination) => {
    onExtra(null);
    navigate(d);
    setMenu(false);
  };
  const openExtra = (kind: PanelKind) => {
    onExtra(kind);
    setMenu(false);
  };
  const title =
    extra === "account"
      ? "Configurações"
      : extra === "members"
        ? "Membros"
        : extra === "admin"
          ? "Gerenciar contas"
          : DESTINATIONS.find(([id]) => id === destination)![1];
  return (
    <div className="simple-shell" hidden={advanced}>
      <nav className="destination-nav" aria-label="Navegação principal">
        <Logo size={38} />
        {DESTINATIONS.map(([id, label, , icon]) => (
          <a
            key={id}
            href={`#/v1/${id}`}
            aria-current={!extra && destination === id ? "page" : undefined}
            onClick={(e) => {
              if (
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
              )
                return;
              e.preventDefault();
              choose(id);
            }}
          >
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </a>
        ))}
        <button
          ref={more}
          aria-label="Mais"
          aria-expanded={menu}
          aria-haspopup="dialog"
          aria-controls="simple-more"
          onClick={() => setMenu(true)}
        >
          <Icon name="more" size={20} />
          <span>Mais</span>
        </button>
      </nav>
      <MobileDrawer
        id="simple-more"
        open={menu && !advanced}
        trigger={more}
        onDismiss={() => setMenu(false)}
      >
        <div className="simple-more-actions">
          <button onClick={() => openExtra("account")}>Configurações</button>
          <button onClick={() => openExtra("members")}>Membros</button>
          {admin && (
            <button onClick={() => openExtra("admin")}>Gerenciar contas</button>
          )}
          <button
            onClick={() => {
              setMenu(false);
              onAdvanced();
            }}
          >
            Usar painéis avançados
          </button>
          <button onClick={onLogout}>Sair</button>
        </div>
      </MobileDrawer>
      <div className="simple-body">
        <header className="simple-header">
          <h1 tabIndex={-1} ref={heading}>
            {title}
          </h1>
          {extra ? (
            <button onClick={() => onExtra(null)}>
              Voltar para {DESTINATIONS.find(([id]) => id === destination)![1]}
            </button>
          ) : (
            tablet && (
              <button aria-pressed={showAux} onClick={() => setAux(!showAux)}>
                {showAux
                  ? "Ocultar painel auxiliar"
                  : `Mostrar ${auxiliary === "sala" ? "Sala" : "Conversa"} ao lado`}
              </button>
            )
          )}
        </header>
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <button onClick={() => onError("")} aria-label="Fechar aviso">
              ×
            </button>
          </div>
        )}
        <div className={"simple-panels" + (showAux ? " with-aux" : "")}>
          {DESTINATIONS.map(([id, label, kind]) => (
            <section
              key={id}
              className={
                "simple-panel" +
                (id === auxiliary && showAux ? " auxiliary" : "")
              }
              aria-label={label}
              hidden={
                !!extra ||
                (id !== destination && !(id === auxiliary && showAux))
              }
            >
              {id === "sala" ? (
                <div className="simple-stage-frame" ref={stage} />
              ) : !advanced &&
                (visited.has(id) ||
                  id === destination ||
                  (id === auxiliary && showAux)) ? (
                render(kind)
              ) : null}
            </section>
          ))}
          {extra && !advanced && (
            <section className="simple-panel" aria-label={title}>
              {render(extra)}
            </section>
          )}
        </div>
        <div className="simple-miniplayer" ref={onMiniHost} />
      </div>
    </div>
  );
}
