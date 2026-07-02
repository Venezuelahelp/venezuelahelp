import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { SCRAPERUN_PK } from "@/shared/keys";
import type { ScrapeRun } from "@/shared/types";

function toRun(item: Record<string, unknown>): ScrapeRun {
  const { PK, SK, ttl, ...rest } = item;
  void PK;
  void SK;
  void ttl;
  return rest as unknown as ScrapeRun;
}

// Historial acotado: TTL de DynamoDB (atributo `ttl`, ya habilitado en la
// tabla — lo usa QaLogRepo) para que la partición no crezca sin límite.
const RETENTION_DAYS = 30;

export class ScrapeRunRepo {
  async put(run: ScrapeRun): Promise<void> {
    const ttl =
      Math.floor(Date.parse(run.ts) / 1000) + RETENTION_DAYS * 24 * 60 * 60;
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: SCRAPERUN_PK, SK: run.ts, ...run, ttl },
      }),
    );
  }

  // Query sobre la partición compartida (como APIREQ) — NUNCA Scan.
  // ScanIndexForward:false → las corridas más recientes primero.
  async list(limit = 10): Promise<ScrapeRun[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": SCRAPERUN_PK },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map(toRun);
  }
}
