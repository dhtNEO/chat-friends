import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Icon } from "./Icon";

export function MobileDrawer({
  id,
  open,
  onDismiss,
  trigger,
  children,
}: {
  id: string;
  open: boolean;
  onDismiss: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const backdropPress = useRef(false);
  const title = useId();
  useLayoutEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current;
    const opener =
      trigger.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!node.open) node.showModal();
    close.current?.focus({ preventScroll: true });
    return () => {
      if (node.open) node.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, trigger]);

  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    const node = event.currentTarget;
    if (
      event.key !== "Tab" ||
      document.activeElement?.closest("dialog:modal") !== node
    )
      return;
    const controls = [
      ...node.querySelectorAll<HTMLElement>(
        "a[href],button,input,select,textarea,[tabindex]",
      ),
    ].filter(
      (el) =>
        el.tabIndex >= 0 &&
        !el.matches(":disabled") &&
        el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== "hidden" &&
        !el.closest("[inert]"),
    );
    const active = document.activeElement;
    if (!controls.length) return;
    if (
      event.shiftKey &&
      (active === controls[0] || !controls.includes(active as HTMLElement))
    ) {
      event.preventDefault();
      controls.at(-1)!.focus();
    } else if (
      !event.shiftKey &&
      (active === controls.at(-1) || !controls.includes(active as HTMLElement))
    ) {
      event.preventDefault();
      controls[0].focus();
    }
  }
  function outside(
    event: PointerEvent<HTMLDialogElement> | MouseEvent<HTMLDialogElement>,
  ) {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    return (
      event.target === node &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  }
  return (
    <dialog
      id={id}
      ref={dialog}
      className="drawer"
      aria-labelledby={title}
      aria-modal="true"
      onCancel={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onDismiss();
        }
      }}
      onKeyDown={trapTab}
      onPointerDown={(event) => {
        backdropPress.current = outside(event);
      }}
      onClick={(event) => {
        if (backdropPress.current && outside(event)) onDismiss();
        backdropPress.current = false;
      }}
    >
      <header className="drawer-header">
        <h2 id={title}>Menu de navegação</h2>
        <button
          type="button"
          ref={close}
          autoFocus
          aria-label="Fechar menu"
          onClick={onDismiss}
        >
          <Icon name="close" size={20} />
        </button>
      </header>
      <div className="drawer-content">{children}</div>
    </dialog>
  );
}
