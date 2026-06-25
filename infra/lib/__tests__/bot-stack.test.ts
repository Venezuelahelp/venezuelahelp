import { describe, it, expect } from "vitest";
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
});
