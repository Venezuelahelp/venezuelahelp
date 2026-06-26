import styles from "./Header.module.css";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="/" className={styles.wordmark}>
          VenezuelaHelp
        </a>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cta}
        >
          Preguntar por Telegram
        </a>
      </div>
    </header>
  );
}
