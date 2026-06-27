import { useEffect, useState } from "react";
import { List, X } from "@phosphor-icons/react";
import styles from "./Header.module.css";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

export default function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="#/" className={styles.wordmark} aria-label="VenezuelaHelp">
          <img
            src="/logo.png"
            className={styles.logo}
            width={48}
            height={46}
            alt=""
            aria-hidden="true"
            decoding="async"
          />
        </a>

        {/* Desktop nav — only secondary links; hidden on mobile */}
        <nav className={styles.nav} aria-label="Principal">
          <a href="#/quienes-somos" className={styles.navLink}>
            ¿Quiénes somos?
          </a>
        </nav>

        {/* CTA — always visible at every viewport width */}
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cta}
        >
          <span className={styles.ctaFull}>Preguntar por Telegram</span>
          <span className={styles.ctaShort}>Telegram</span>
        </a>

        {/* Mobile menu trigger */}
        <button
          type="button"
          className={styles.menuBtn}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <X aria-hidden="true" size={22} weight="bold" />
          ) : (
            <List aria-hidden="true" size={22} weight="bold" />
          )}
        </button>
      </div>

      {/* Mobile dropdown — Telegram CTA already visible above, so only nav links here */}
      {open && (
        <div className={styles.menuPanel}>
          <a
            href="#/quienes-somos"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            ¿Quiénes somos?
          </a>
        </div>
      )}
    </header>
  );
}
