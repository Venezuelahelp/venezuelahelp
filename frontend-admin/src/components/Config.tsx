import { useState, type FormEvent } from "react";
import type { Config } from "@/types";
import styles from "./Config.module.css";

interface ConfigProps {
  config: Config;
  onSave: (next: Config) => void;
  saving: boolean;
}

export function Config({ config, onSave, saving }: ConfigProps) {
  const [botTriggerMode, setBotTriggerMode] = useState(config.botTriggerMode);
  const [bedrockModelId, setBedrockModelId] = useState(config.bedrockModelId);
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [scrapeRateMin, setScrapeRateMin] = useState(config.scrapeRateMin);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave({ botTriggerMode, bedrockModelId, systemPrompt, scrapeRateMin });
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.heading}>Configuración</h2>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="botTriggerMode" className={styles.label}>
            Modo de activación del bot
          </label>
          <select
            id="botTriggerMode"
            value={botTriggerMode}
            onChange={(e) => setBotTriggerMode(e.target.value)}
            className={styles.select}
          >
            <option value="mention">mention</option>
            <option value="command">command</option>
            <option value="all">all</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="bedrockModelId" className={styles.label}>
            Bedrock Model ID
          </label>
          <input
            id="bedrockModelId"
            type="text"
            value={bedrockModelId}
            onChange={(e) => setBedrockModelId(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="systemPrompt" className={styles.label}>
            System Prompt
          </label>
          <textarea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            className={styles.textarea}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="scrapeRateMin" className={styles.label}>
            Tasa de scrape (minutos)
          </label>
          <input
            id="scrapeRateMin"
            type="number"
            min={5}
            max={1440}
            value={scrapeRateMin}
            onChange={(e) => setScrapeRateMin(Number(e.target.value))}
            className={styles.input}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className={styles.button}
          aria-busy={saving}
        >
          Guardar cambios
        </button>
      </form>
    </div>
  );
}
