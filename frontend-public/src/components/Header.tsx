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

  // "Fuentes" lleva al footer. Hacemos scroll suave por id en vez de cambiar el
  // hash (el router de App resetea el scroll al tope en cada hashchange).
  function scrollToFuentes(e: React.MouseEvent) {
    const el = document.getElementById("fuentes");
    if (!el) return; // p.ej. en la página "¿Quiénes somos?" deja el href normal
    e.preventDefault();
    setOpen(false);
    el.scrollIntoView({ behavior: "smooth" });
  }

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
          <a href="#/interpretes" className={styles.navLink}>
            Intérpretes
          </a>
          <a href="#/quienes-somos" className={styles.navLink}>
            ¿Quiénes somos?
          </a>
          <a
            href="#fuentes"
            className={styles.navLink}
            onClick={scrollToFuentes}
          >
            Fuentes
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
            href="#/interpretes"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            Intérpretes
          </a>
          <a
            href="#/quienes-somos"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            ¿Quiénes somos?
          </a>
          <a
            href="#fuentes"
            className={styles.menuLink}
            onClick={scrollToFuentes}
          >
            Fuentes
          </a>
        </div>
      )}
    </header>
  );
}
