import { useState, type FormEvent } from "react";
import { signInUser } from "@/auth";
import styles from "./Login.module.css";

interface LoginProps {
  onAuthed: () => void;
}

export function Login({ onAuthed }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInUser(email, password);
      onAuthed();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al iniciar sesión.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.root}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Administración — VenezuelaHelp</h1>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          {error && (
            <p id="login-error" role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.button}
            aria-busy={loading}
          >
            {loading ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}
