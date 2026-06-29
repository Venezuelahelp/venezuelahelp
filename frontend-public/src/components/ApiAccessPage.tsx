import { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  submitApiAccessRequest,
  type ApiAccessForm,
} from "@/data/apiAccess";
import styles from "./AboutPage.module.css";

interface Props {
  // Inyectable para tests; por defecto llama al intake real.
  submit?: (form: ApiAccessForm) => Promise<void>;
}

export default function ApiAccessPage({
  submit = submitApiAccessRequest,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [organizacion, setOrganizacion] = useState("");
  const [motivo, setMotivo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle",
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await submit({
        nombre,
        email,
        organizacion: organizacion || undefined,
        motivo,
        descripcion: descripcion || undefined,
        aceptaTerminos: true,
      });
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <article className={styles.page}>
        <a href="#/" className={styles.back}>
          <ArrowLeft aria-hidden="true" size={16} weight="bold" />
          Volver al inicio
        </a>
        <h1 className={styles.title}>API para terceros</h1>
        <p className={styles.lead}>
          Recibimos tu solicitud. La revisaremos y te contactaremos al correo
          que indicaste. Gracias por ayudar a difundir la información.
        </p>
      </article>
    );
  }

  return (
    <article className={styles.page}>
      <a href="#/" className={styles.back}>
        <ArrowLeft aria-hidden="true" size={16} weight="bold" />
        Volver al inicio
      </a>

      <h1 className={styles.title}>API para terceros</h1>

      <p className={styles.lead}>
        ¿Tu organización quiere mostrar esta información en su propio sitio?
        Ofrecemos un API de solo lectura con la misma data pública del sitio.
        Solicita una clave de acceso completando el formulario; una vez
        verificada tu solicitud, te enviaremos una API key.
      </p>

      <section className={styles.section}>
        <h2 className={styles.h2}>Cómo funciona el API</h2>
        <ul className={styles.list}>
          <li>
            Consulta los datos en <code>/v1/items</code> (filtros:{" "}
            <code>category</code>, <code>q</code>, <code>near</code>,{" "}
            <code>limit</code>, <code>cursor</code>).
          </li>
          <li>
            También: <code>/v1/categories</code>, <code>/v1/sources</code>,{" "}
            <code>/v1/meta</code>.
          </li>
          <li>
            Autenticación por cabecera <code>x-api-key</code>. Hay límite de uso
            por clave.
          </li>
          <li>
            Es información pública de emergencia: úsala citando la fuente y
            respetando a las personas involucradas.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Solicitar acceso</h2>
        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.field}>
            Nombre de contacto
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={200}
            />
          </label>

          <label className={styles.field}>
            Organización (opcional)
            <input
              type="text"
              value={organizacion}
              onChange={(e) => setOrganizacion(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            ¿Para qué usarás el API? (motivo / uso previsto)
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              maxLength={1000}
              rows={3}
            />
          </label>

          <label className={styles.field}>
            Descripción del proyecto (opcional)
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              required
            />
            Acepto usar los datos de forma responsable, citando la fuente y
            respetando la información de las personas.
          </label>

          {status === "error" && (
            <p role="alert" className={styles.formError}>
              No se pudo enviar la solicitud. Inténtalo de nuevo más tarde.
            </p>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={status === "sending" || !acepta}
          >
            {status === "sending" ? "Enviando…" : "Enviar solicitud"}
          </button>
        </form>
      </section>
    </article>
  );
}
