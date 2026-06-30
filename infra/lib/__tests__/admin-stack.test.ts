import { describe, it, expect, beforeAll } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { ScraperStack } from "../scraper-stack";
import { AdminStack } from "../admin-stack";
import * as fs from "node:fs";
import * as path from "node:path";

// BucketDeployment checks the source path exists at synth time.
// Create a placeholder so CDK can construct the stack without a real build.
beforeAll(() => {
  fs.mkdirSync(path.join(__dirname, "../../../frontend-admin/dist"), {
    recursive: true,
  });
});

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

  it("creates exactly 15 routes, all protected with JWT", () => {
    const t = template();
    t.resourceCountIs("AWS::ApiGatewayV2::Route", 15);
    const routes = t.findResources("AWS::ApiGatewayV2::Route");
    for (const [logicalId, resource] of Object.entries(routes)) {
      expect(
        resource.Properties.AuthorizationType,
        `Route ${logicalId} must use JWT auth`,
      ).toBe("JWT");
    }
  });

  it("registers the API-program routes (programa de API para terceros)", () => {
    const routes = template().findResources("AWS::ApiGatewayV2::Route");
    const keys = Object.values(routes).map((r) => r.Properties?.RouteKey);
    expect(keys).toContain("GET /api-requests");
    expect(keys).toContain("POST /api-requests/{id}/approve");
    expect(keys).toContain("POST /api-requests/{id}/reject");
    expect(keys).toContain("GET /api-keys");
    expect(keys).toContain("POST /api-keys/{id}/revoke");
  });

  it("outputs ApiUrl, UserPoolId, UserPoolClientId", () => {
    const t = template();
    const outputs = t.findOutputs("*");
    const keys = Object.keys(outputs);
    expect(keys.some((k) => k.startsWith("ApiUrl"))).toBe(true);
    expect(keys.some((k) => k.startsWith("UserPoolId"))).toBe(true);
    expect(keys.some((k) => k.startsWith("UserPoolClientId"))).toBe(true);
  });

  it("creates a CloudFront Distribution for the admin SPA", () => {
    template().resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("creates a private S3 bucket for the admin site", () => {
    template().hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("creates two BucketDeployments (assets immutable + html no-cache)", () => {
    // Assets hasheados con cache largo y el index.html/config.json con no-cache
    // para que el navegador no sirva un index viejo tras un deploy.
    template().resourceCountIs("Custom::CDKBucketDeployment", 2);
  });

  it("deploys index.html + invalidation only AFTER the assets are uploaded", () => {
    // Sin esta dependencia, el deployment del index.html (que además dispara la
    // invalidación de CloudFront) puede terminar ANTES de que suban los bundles
    // hasheados → el index nuevo apunta a /assets/*.js que aún no existen → 404
    // → CloudFront los reescribe a index.html(200) → pantalla en blanco ~5 min.
    const deployments = template().findResources("Custom::CDKBucketDeployment");
    const entries = Object.entries(deployments);
    // El deployment del HTML es el que dispara la invalidación (DistributionId).
    const html = entries.find(([, r]) => r.Properties?.DistributionId);
    const assets = entries.find(([, r]) => !r.Properties?.DistributionId);
    expect(html, "debe existir el deployment con invalidación").toBeDefined();
    expect(assets, "debe existir el deployment de assets").toBeDefined();
    const dependsOn = ([] as string[]).concat(html![1].DependsOn ?? []);
    expect(
      dependsOn,
      "el deployment del index.html debe depender del de assets",
    ).toContain(assets![0]);
  });

  it("outputs AdminUrl", () => {
    const t = template();
    const outputs = t.findOutputs("*");
    const keys = Object.keys(outputs);
    expect(keys.some((k) => k.startsWith("AdminUrl"))).toBe(true);
  });

  it("retains admin logs for only 14 days (no infinite log cost)", () => {
    template().hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 14,
    });
  });

  it("uses the cheapest CloudFront price class (PriceClass_100)", () => {
    template().hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({ PriceClass: "PriceClass_100" }),
    });
  });
});
