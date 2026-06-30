import { ArrowLeft, ChatCircleText } from "@phosphor-icons/react";
import styles from "./AboutPage.module.css";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

export default function AboutPage() {
  return (
    <article className={styles.page}>
      <a href="#/" className={styles.back}>
        <ArrowLeft aria-hidden="true" size={16} weight="bold" />
        Volver al inicio
      </a>

      <h1 className={styles.title}>¿Quiénes somos?</h1>

      <p className={styles.lead}>
        VenezuelaHelp es una iniciativa ciudadana, sin fines de lucro, que reúne
        en un solo lugar la información pública dispersa sobre el terremoto del
        24 de junio de 2026 en Venezuela, para que quien la necesite la
        encuentre rápido y sin ruido.
      </p>

      <section className={styles.section}>
        <h2 className={styles.h2}>Nuestro objetivo</h2>
        <p>
          Facilitar el acceso a información de emergencia a las personas
          afectadas, a sus familiares, y a quienes ayudan: voluntarios y
          donantes. Centralizamos cinco tipos de información que normalmente
          están repartidos entre varias páginas y redes:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Reportes</strong> de la situación en distintas zonas.
          </li>
          <li>
            <strong>Personas desaparecidas</strong> y búsquedas activas.
          </li>
          <li>
            <strong>Centros de acopio</strong> y puntos de ayuda.
          </li>
          <li>
            <strong>Edificios dañados</strong> y alertas estructurales.
          </li>
          <li>
            <strong>Solicitudes</strong> de insumos y necesidades específicas.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Cómo funciona</h2>
        <p>
          Recopilamos información de forma automática y periódica desde páginas
          públicas de terceros, la normalizamos por categoría y la mostramos
          aquí en una lista buscable y en un mapa. No generamos información
          propia: solo la organizamos para que sea más fácil de consultar.
        </p>
        <p>
          También puedes preguntarle a nuestro{" "}
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.inlineLink}
          >
            bot de Telegram
          </a>{" "}
          en lenguaje natural y te responde con la información recopilada.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>¿Cómo puedo ayudar?</h2>
        <p>
          Si quieres <strong>donar o aportar insumos</strong>, te recomendamos{" "}
          <a
            href="https://donarseguro.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.inlineLink}
          >
            donarseguro.com
          </a>
          , un directorio que reúne y verifica los canales oficiales de las
          organizaciones que responden al terremoto (Cáritas, UNICEF, WFP y
          otras). VenezuelaHelp no recibe ni gestiona donaciones: solo te
          orientamos hacia fuentes confiables.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Importante</h2>
        <p>
          VenezuelaHelp <strong>no es una fuente oficial</strong>. La
          información proviene de terceros y puede estar incompleta o
          desactualizada. Ante cualquier emergencia, verifica siempre con las
          autoridades y los organismos de respuesta competentes.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Privacidad</h2>
        <p>
          No usamos cookies de rastreo ni perfilamos a los visitantes. Medimos
          el uso de forma mínima y anónima, solo para mantener el servicio
          funcionando.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Sostenimiento</h2>
        <p>
          Es un proyecto de bajo costo, mantenido de forma voluntaria y
          patrocinado por una persona. Por eso priorizamos que sea simple,
          rápido y gratuito de usar.
        </p>
      </section>

      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cta}
      >
        <ChatCircleText aria-hidden="true" size={18} weight="fill" />
        Preguntar por Telegram
      </a>
    </article>
  );
}
