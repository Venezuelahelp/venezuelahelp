import styles from "./Hero.module.css";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

interface HeroProps {
  generatedAt: string;
}

export default function Hero({ generatedAt }: HeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <h1 className={styles.title}>
          Informacion verificada del terremoto en Venezuela
        </h1>
        <p className={styles.body}>
          Aqui encontraras reportes, acopios, personas desaparecidas y
          solicitudes de ayuda recopilados desde fuentes abiertas. Puedes
          consultar al bot de Telegram para obtener informacion actualizada o
          hacer preguntas.
        </p>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cta}
        >
          Preguntar por Telegram
        </a>
        <p className={styles.updated}>
          Datos actualizados: {formatDate(generatedAt)}
        </p>
      </div>
    </section>
  );
}
