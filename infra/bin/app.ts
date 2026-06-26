import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { ScraperStack } from "../lib/scraper-stack";
import { BotStack } from "../lib/bot-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { AdminStack } from "../lib/admin-stack";

const app = new App();
// Env explícito desde CDK_DEFAULT_ACCOUNT/REGION (poblado por el CLI o pasado
// a mano). Evita que los stacks queden "environment-agnostic" y que el deploy
// falle al no poder resolver la cuenta desde la cadena de credenciales del SDK.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};
const data = new DataStack(app, "VenezuelaHelpDataStack", { env });
const scraper = new ScraperStack(app, "VenezuelaHelpScraperStack", {
  env,
  table: data.table,
  snapshotBucket: data.snapshotBucket,
  dlq: data.scraperDlq,
});
new BotStack(app, "VenezuelaHelpBotStack", {
  env,
  table: data.table,
  snapshotBucket: data.snapshotBucket,
});
new FrontendStack(app, "VenezuelaHelpFrontendStack", {
  env,
  snapshotBucket: data.snapshotBucket,
});
new AdminStack(app, "VenezuelaHelpAdminStack", {
  env,
  table: data.table,
  scraperFn: scraper.scraperFn,
});
