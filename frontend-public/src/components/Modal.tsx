import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import styles from "./Modal.module.css";

interface ModalProps {
  onClose: () => void;
  labelledBy?: string;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])';

export default function Modal({ onClose, labelledBy, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        // Minimal focus trap: keep Tab within the panel.
        const els = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null);
        if (els.length === 0) {
          e.preventDefault();
          return;
        }
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <span className={styles.handle} aria-hidden="true" />
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
