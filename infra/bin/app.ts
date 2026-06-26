import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { ScraperStack } from "../lib/scraper-stack";
import { BotStack } from "../lib/bot-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { AdminStack } from "../lib/admin-stack";
import { BudgetStack } from "../lib/budget-stack";
import { DomainStack } from "../lib/domain-stack";
import { CicdStack } from "../lib/cicd-stack";

const app = new App();
// Env explícito desde CDK_DEFAULT_ACCOUNT/REGION (poblado por el CLI o pasado
// a mano). Evita que los stacks queden "environment-agnostic" y que el deploy
// falle al no poder resolver la cuenta desde la cadena de credenciales del SDK.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};
const domainName = app.node.getContext("domainName") as string;
const hostedZoneId = app.node.getContext("hostedZoneId") as string;
const githubRepo = app.node.getContext("githubRepo") as string;
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
const domain = new DomainStack(app, "VenezuelaHelpDomainStack", {
  env,
  domainName,
  hostedZoneId,
});
new FrontendStack(app, "VenezuelaHelpFrontendStack", {
  env,
  snapshotBucket: data.snapshotBucket,
  table: data.table,
  domainName,
  certificate: domain.certificate,
  hostedZone: domain.hostedZone,
});
new AdminStack(app, "VenezuelaHelpAdminStack", {
  env,
  table: data.table,
  scraperFn: scraper.scraperFn,
  adminDomain: `admin.${domainName}`,
  certificate: domain.certificate,
  hostedZone: domain.hostedZone,
});
// Cost circuit breaker. Override the recipient/ceiling via env at synth/deploy:
//   ALERT_EMAIL=tu@correo.com BUDGET_LIMIT_USD=10 npx cdk deploy VenezuelaHelpBudgetStack
new BudgetStack(app, "VenezuelaHelpBudgetStack", {
  env,
  alertEmail: process.env.ALERT_EMAIL ?? "mserranolm@gmail.com",
  monthlyLimitUsd: Number(process.env.BUDGET_LIMIT_USD ?? 10),
});
// OIDC provider + IAM role so GitHub Actions can deploy without stored credentials.
// Deploy once manually: cdk deploy VenezuelaHelpCicdStack --profile VenezuelaHelp
// Then add the DeployRoleArn output as GitHub Secret AWS_ROLE_ARN.
new CicdStack(app, "VenezuelaHelpCicdStack", { env, githubRepo });
