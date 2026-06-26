import { PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "node:crypto";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { VISIT_PK, VSTAT_PK } from "@/shared/keys";
import type { Device } from "@/track/userAgent";

// Retención: los eventos de visita (con país, no IP) se auto-eliminan a los 90
// días. Los contadores agregados (VSTAT) son conteos anónimos sin PII → se
// guardan más tiempo para tendencia histórica barata.
const VISIT_TTL_DAYS = 90;
const VSTAT_TTL_DAYS = 400;
const DAY_S = 24 * 60 * 60;

export interface VisitInput {
  country: string;
  browser: string;
  device: Device;
  os: string;
  path: string;
  referrer: string;
  now: string; // ISO
}

export interface VisitEvent {
  ts: string;
  country: string;
  browser: string;
  device: string;
  os: string;
  path: string;
  referrer: string;
}

export interface DimCount {
  key: string;
  count: number;
}

export interface AnalyticsResult {
  kpis: { today: number; last7: number; last30: number };
  byCountry: DimCount[];
  byBrowser: DimCount[];
  byDevice: DimCount[];
  recent: VisitEvent[];
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

// Resta `n` días a una fecha yyyy-mm-dd y devuelve yyyy-mm-dd.
function minusDays(date: string, n: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - n * DAY_S * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export class VisitRepo {
  // Un evento (para la lista de recientes) + cuatro contadores agregados
  // (para los KPIs). El sufijo aleatorio evita colisión de SK en el mismo ms.
  async record(v: VisitInput): Promise<void> {
    const date = dateOf(v.now);
    const epoch = Math.floor(Date.parse(v.now) / 1000);
    const rand = randomBytes(3).toString("hex");

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: VISIT_PK(date),
          SK: `${v.now}#${rand}`,
          ts: v.now,
          country: v.country,
          browser: v.browser,
          device: v.device,
          os: v.os,
          path: v.path,
          referrer: v.referrer,
          ttl: epoch + VISIT_TTL_DAYS * DAY_S,
        },
      }),
    );

    const statTtl = epoch + VSTAT_TTL_DAYS * DAY_S;
    const dims = [
      "_total",
      `country#${v.country}`,
      `browser#${v.browser}`,
      `device#${v.device}`,
    ];
    await Promise.all(
      dims.map((dim) =>
        ddb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: VSTAT_PK, SK: `${date}#${dim}` },
            UpdateExpression: "ADD #c :one SET #t = :ttl",
            ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
            ExpressionAttributeValues: { ":one": 1, ":ttl": statTtl },
          }),
        ),
      ),
    );
  }

  // Visitas recientes (lista del admin). Consulta la partición de hoy desc; si
  // no llena el cupo, completa con la de ayer.
  async recent(now: string, limit = 100): Promise<VisitEvent[]> {
    const today = dateOf(now);
    const events: VisitEvent[] = [];
    for (const date of [today, minusDays(today, 1)]) {
      if (events.length >= limit) break;
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": VISIT_PK(date) },
          ScanIndexForward: false,
          Limit: limit - events.length,
        }),
      );
      for (const it of res.Items ?? []) {
        events.push({
          ts: it.ts as string,
          country: it.country as string,
          browser: it.browser as string,
          device: it.device as string,
          os: it.os as string,
          path: it.path as string,
          referrer: it.referrer as string,
        });
      }
    }
    return events;
  }

  // Suma los contadores VSTAT del rango [fromDate, toDate] y los agrega por
  // dimensión. Una sola Query por rango de SK (sin escanear eventos).
  async statsRange(
    fromDate: string,
    toDate: string,
  ): Promise<{
    total: number;
    byCountry: Record<string, number>;
    byBrowser: Record<string, number>;
    byDevice: Record<string, number>;
  }> {
    let total = 0;
    const byCountry: Record<string, number> = {};
    const byBrowser: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND SK BETWEEN :a AND :b",
          ExpressionAttributeValues: {
            ":pk": VSTAT_PK,
            ":a": `${fromDate}#`,
            ":b": `${toDate}#￿`,
          },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) {
        const sk = it.SK as string;
        const count = (it.count as number) ?? 0;
        const dim = sk.slice(11); // longitud de "yyyy-mm-dd#"
        if (dim === "_total") total += count;
        else if (dim.startsWith("country#"))
          byCountry[dim.slice(8)] = (byCountry[dim.slice(8)] ?? 0) + count;
        else if (dim.startsWith("browser#"))
          byBrowser[dim.slice(8)] = (byBrowser[dim.slice(8)] ?? 0) + count;
        else if (dim.startsWith("device#"))
          byDevice[dim.slice(7)] = (byDevice[dim.slice(7)] ?? 0) + count;
      }
      ExclusiveStartKey = res.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return { total, byCountry, byBrowser, byDevice };
  }

  // Compone la respuesta del endpoint /analytics: KPIs (hoy/7d/30d) + desgloses
  // del rango de 30d + visitas recientes.
  async analytics(now: string): Promise<AnalyticsResult> {
    const today = dateOf(now);
    const [todayStats, last7, last30, recent] = await Promise.all([
      this.statsRange(today, today),
      this.statsRange(minusDays(today, 6), today),
      this.statsRange(minusDays(today, 29), today),
      this.recent(now, 100),
    ]);
    const toSorted = (m: Record<string, number>): DimCount[] =>
      Object.entries(m)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
    return {
      kpis: {
        today: todayStats.total,
        last7: last7.total,
        last30: last30.total,
      },
      byCountry: toSorted(last30.byCountry),
      byBrowser: toSorted(last30.byBrowser),
      byDevice: toSorted(last30.byDevice),
      recent,
    };
  }
}
