import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { ScraperStack } from "../scraper-stack";
import { AdminStack } from "../admin-stack";

function template() {
  const app = new App();
  const data = new DataStack(app, "Data");
  const scraper = new ScraperStack(app, "Scraper", {
    table: data.table,
    snapshotBucket: data.snapshotBucket,
    dlq: data.scraperDlq,
  });
  const admin = new AdminStack(app, "Admin", {
    table: data.table,
    scraperFn: scraper.scraperFn,
  });
  return Template.fromStack(admin);
}

describe("AdminStack", () => {
  it("creates a Cognito UserPool", () => {
    template().resourceCountIs("AWS::Cognito::UserPool", 1);
  });

  it("creates a UserPool client with no secret", () => {
    template().hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith([
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_USER_SRP_AUTH",
      ]),
    });
  });

  it("creates a Node 20 Lambda with TABLE_NAME and SCRAPER_FN_NAME", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Environment: {
        Variables: {
          TABLE_NAME: Match.anyValue(),
          SCRAPER_FN_NAME: Match.anyValue(),
        },
      },
    });
  });

  it("creates an HTTP API", () => {
    template().resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  });

  it("creates a JWT authorizer", () => {
    template().hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "JWT",
    });
  });

  it("creates routes protected with JWT", () => {
    template().hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: Match.anyValue(),
      AuthorizationType: "JWT",
    });
  });

  it("outputs ApiUrl, UserPoolId, UserPoolClientId", () => {
    const t = template();
    const outputs = t.findOutputs("*");
    const keys = Object.keys(outputs);
    expect(keys.some((k) => k.startsWith("ApiUrl"))).toBe(true);
    expect(keys.some((k) => k.startsWith("UserPoolId"))).toBe(true);
    expect(keys.some((k) => k.startsWith("UserPoolClientId"))).toBe(true);
  });
});
