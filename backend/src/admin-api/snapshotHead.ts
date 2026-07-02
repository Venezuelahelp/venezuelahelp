import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "@/shared/logger";

const moduleS3 = new S3Client({});

// LastModified del snapshot.json en S3 = fin del último scrape (la señal
// operativa correcta: el `generatedAt` interno se sella al INICIO de la
// corrida, ~11 min antes). Contrato: NUNCA lanza — si falta la env var o el
// HeadObject falla, devuelve undefined y /stats sale sin `snapshotUpdatedAt`.
export async function getSnapshotUpdatedAt(deps?: {
  s3?: Pick<S3Client, "send">;
}): Promise<string | undefined> {
  const s3 = deps?.s3 ?? moduleS3;
  const bucket = process.env.SNAPSHOT_BUCKET;
  if (!bucket) return undefined;
  try {
    const res = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: "snapshot.json" }),
    );
    return res.LastModified?.toISOString();
  } catch (err) {
    logger.warn("no se pudo leer el LastModified del snapshot", { err });
    return undefined;
  }
}
