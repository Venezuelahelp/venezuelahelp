import { describe, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { BotStack } from "../bot-stack";

function template() {
  const app = new App();
  const data = new DataStack(app, "Data");
  const bot = new BotStack(app, "Bot", {
    table: data.table,
    snapshotBucket: data.snapshotBucket,
  });
  return Template.fromStack(bot);
}

describe("BotStack", () => {
  it("creates a Node 20 Lambda for the webhook", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
    });
  });
  it("creates an HTTP API", () => {
    template().resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  });
  it("grants bedrock invoke permission", () => {
    const t = template();
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(["bedrock:InvokeModel"]),
          }),
        ]),
      },
    });
  });

  it("caps the webhook Lambda with reserved concurrency (abuse ceiling)", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      ReservedConcurrentExecutions: 5,
    });
  });

  it("retains webhook logs for only 14 days (no infinite log cost)", () => {
    template().hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 14,
    });
  });

  it("requires the webhook secret (fail-closed) via env flag", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({ TELEGRAM_REQUIRE_SECRET: "true" }),
      },
    });
  });

  it("throttles the default API stage to bound request rate", () => {
    template().hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: {
        ThrottlingRateLimit: 5,
        ThrottlingBurstLimit: 10,
      },
    });
  });
});
