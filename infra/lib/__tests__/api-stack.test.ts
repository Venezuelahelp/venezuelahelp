import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { ApiStack } from "../api-stack";

function template() {
  const app = new App();
  const data = new DataStack(app, "Data");
  const api = new ApiStack(app, "Api", {
    table: data.table,
    domainName: "venezuelahelp.click",
  });
  return Template.fromStack(api);
}

describe("ApiStack", () => {
  it("creates a single HTTP API", () => {
    template().resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  });

  it("creates three Node 20 Lambdas (data, authorizer, intake)", () => {
    const fns = template().findResources("AWS::Lambda::Function");
    expect(Object.keys(fns).length).toBe(3);
    for (const res of Object.values(fns)) {
      expect(res.Properties?.Runtime).toBe("nodejs20.x");
    }
  });

  it("gives the data Lambda 1024MB (parses the full snapshot; 256MB → OOM)", () => {
    const fns = template().findResources("AWS::Lambda::Function");
    const dataFn = Object.entries(fns).find(([id]) =>
      id.startsWith("DataApiFn"),
    );
    expect(dataFn?.[1].Properties?.MemorySize).toBe(1024);
  });

  it("wires a Lambda authorizer over the x-api-key header", () => {
    template().hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "REQUEST",
      IdentitySource: ["$request.header.x-api-key"],
      EnableSimpleResponses: true,
    });
  });

  it("passes the public snapshot URL to the data Lambda (reads it like the front)", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          SNAPSHOT_URL: "https://venezuelahelp.click/snapshot.json",
        }),
      },
    });
  });

  it("throttles the default stage as a backstop", () => {
    template().hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: Match.objectLike({
        ThrottlingRateLimit: 20,
        ThrottlingBurstLimit: 40,
      }),
    });
  });

  it("creates the protected /v1 routes and the public intake route", () => {
    const t = template();
    const routes = t.findResources("AWS::ApiGatewayV2::Route");
    const keys = Object.values(routes).map((r) => r.Properties?.RouteKey);
    expect(keys).toContain("GET /v1/items");
    expect(keys).toContain("POST /api-access/requests");
  });

  it("does NOT reserve concurrency (account limit is 10)", () => {
    const fns = template().findResources("AWS::Lambda::Function");
    for (const [id, res] of Object.entries(fns)) {
      expect(
        res.Properties?.ReservedConcurrentExecutions,
        `Lambda ${id} must not reserve concurrency`,
      ).toBeUndefined();
    }
  });

  it("retains logs for only 14 days", () => {
    template().hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 14,
    });
  });
});
