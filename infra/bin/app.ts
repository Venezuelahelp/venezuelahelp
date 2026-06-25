import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { ScraperStack } from "../lib/scraper-stack";
import { BotStack } from "../lib/bot-stack";

const app = new App();
const env = { region: "us-east-1" };
const data = new DataStack(app, "VenezuelaHelpDataStack", { env });
new ScraperStack(app, "VenezuelaHelpScraperStack", {
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
