// backend/src/telegram/menu.ts
import { normalize } from "@/telegram/retrieval";
import { sortByDistance, type LatLng } from "@/telegram/geo";
import { renderList } from "@/telegram/cards";
import { renderEmergency } from "@/telegram/emergencyInfo";
import type {
  InlineKeyboardMarkup,
  PublicItem,
  ReplyMarkup,
  Snapshot,
} from "@/telegram/types";

export interface MenuResponse {
  text: string;
  replyMarkup?: ReplyMarkup;
}

export const SKIP_LOCATION_TEXT = "Ver sin ubicación";
const MAX_ITEMS = 8;

export const LOCATION_ACTIONS = new Set([
  "insumos",
  "voluntariado",
  "refugios",
  "viveres",
]);

const REFUGIO_RE = /refugio|albergue|alberg/;
const VIVERES_RE =
  /agua|comida|aliment|viver|despensa|enlatad|formula|leche|potable/;

function blob(it: PublicItem): string {
  return normalize(`${it.titulo} ${it.texto}`);
}

function notSuspect(it: PublicItem): boolean {
  return it.trust !== "sospechoso";
}

export function selectItems(action: string, snap: Snapshot): PublicItem[] {
  const acopios = (snap.categories.acopios ?? []).filter(notSuspect);
  switch (action) {
    case "insumos":
      return acopios.filter((it) => !REFUGIO_RE.test(blob(it)));
    case "refugios":
      return acopios.filter((it) => REFUGIO_RE.test(blob(it)));
    case "viveres":
      return acopios.filter((it) => VIVERES_RE.test(blob(it)));
    case "voluntariado":
      return (snap.categories.solicitudes ?? []).filter(notSuspect);
    default:
      return [];
  }
}

const TRUST_RANK: Record<string, number> = {
  verificado: 0,
  corroborado: 1,
  no_verificado: 2,
};
function byTrust(a: PublicItem, b: PublicItem): number {
  return (
    (TRUST_RANK[a.trust ?? "no_verificado"] ?? 2) -
    (TRUST_RANK[b.trust ?? "no_verificado"] ?? 2)
  );
}

const TITLES: Record<string, string> = {
  insumos: "📦 Centros de acopio para aportar insumos",
  voluntariado: "🙋 Dónde se necesita voluntariado",
  refugios: "🏠 Refugios y albergues",
  viveres: "💧 Puntos de distribución de víveres",
};
const BACK_TARGET: Record<string, string> = {
  insumos: "home",
  voluntariado: "home",
  refugios: "ayuda",
  viveres: "ayuda",
};

function backRow(target: string) {
  return [{ text: "⬅️ Volver", callback_data: target }];
}
function backMarkup(target: string): InlineKeyboardMarkup {
  return { inline_keyboard: [backRow(target)] };
}

export function homeScreen(): MenuResponse {
  return {
    text: [
      "👋 ¡Hola! Soy el asistente de VenezuelaHelp.",
      "",
      "Reúno información pública sobre el terremoto de Venezuela (24 de junio de 2026). Usa los botones para encontrar ayuda, o escríbeme tu pregunta en lenguaje natural.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "📦 Aportar insumos", callback_data: "insumos" },
          { text: "🙋 Voluntariado", callback_data: "voluntariado" },
        ],
        [{ text: "🚨 NECESITO AYUDA", callback_data: "ayuda" }],
      ],
    },
  };
}

function helpScreen(): MenuResponse {
  return {
    text: "🚨 NECESITO AYUDA\n\nElige una opción:",
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "🚑 Emergencias médicas y rescate",
            callback_data: "emergencias",
          },
        ],
        [{ text: "🏠 Refugios y albergues", callback_data: "refugios" }],
        [{ text: "💧 Distribución de víveres", callback_data: "viveres" }],
        [{ text: "🐾 Rescate y refugios animales", callback_data: "animales" }],
        [{ text: "⬅️ Volver", callback_data: "home" }],
      ],
    },
  };
}

function animalsScreen(): MenuResponse {
  return {
    text: [
      "🐾 Rescate y refugios animales",
      "",
      "Esta sección estará disponible próximamente. Por ahora no tenemos información verificada de refugios o veterinarias para animales.",
    ].join("\n"),
    replyMarkup: backMarkup("ayuda"),
  };
}

export function navScreen(action: string): MenuResponse | null {
  switch (action) {
    case "home":
      return homeScreen();
    case "ayuda":
      return helpScreen();
    case "emergencias":
      return renderEmergency();
    case "animales":
      return animalsScreen();
    default:
      return null;
  }
}

export function categoryScreen(
  action: string,
  snap: Snapshot,
  userLoc?: LatLng,
): MenuResponse {
  const selected = selectItems(action, snap);
  const ordered = userLoc
    ? sortByDistance(selected, userLoc)
    : [...selected].sort(byTrust);
  const items = ordered.slice(0, MAX_ITEMS);
  const title = TITLES[action] ?? "Resultados";
  const back = BACK_TARGET[action] ?? "home";
  if (items.length === 0) {
    return {
      text: `${title}\n\nNo hay registros disponibles ahora mismo. Intenta más tarde 🙏`,
      replyMarkup: backMarkup(back),
    };
  }
  const { text, buttons } = renderList(items, userLoc);
  return {
    text: `${title}\n\n${text}`,
    replyMarkup: { inline_keyboard: [...buttons, backRow(back)] },
  };
}

export function locationPrompt(action: string): MenuResponse {
  const title = TITLES[action] ?? "Resultados";
  return {
    text: `${title}\n\n📍 Comparte tu ubicación para ordenar por cercanía, o continúa sin ella.`,
    replyMarkup: {
      keyboard: [
        [{ text: "📍 Compartir ubicación", request_location: true }],
        [{ text: SKIP_LOCATION_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}
