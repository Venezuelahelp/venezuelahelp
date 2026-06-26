import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { ScraperStack } from "../scraper-stack";

function template() {
  const app = new App();
  const data = new DataStack(app, "Data");
  const scraper = new ScraperStack(app, "Scraper", {
    table: data.table,
    snapshotBucket: data.snapshotBucket,
    dlq: data.scraperDlq,
  });
  return Template.fromStack(scraper);
}

describe("ScraperStack", () => {
  it("creates a Node 20 Lambda with TABLE_NAME and SNAPSHOT_BUCKET env", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Environment: {
        Variables: {
          TABLE_NAME: Match.anyValue(),
          SNAPSHOT_BUCKET: Match.anyValue(),
        },
      },
    });
  });

  it("schedules the scraper every 30 minutes", () => {
    template().hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "rate(30 minutes)",
    });
  });

  it("retains scraper logs for only 14 days (no infinite log cost)", () => {
    template().hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 14,
    });
  });

  it("grants the scraper bedrock invoke permission", () => {
    template().hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(["bedrock:InvokeModel"]),
          }),
        ]),
      },
    });
  });
});
