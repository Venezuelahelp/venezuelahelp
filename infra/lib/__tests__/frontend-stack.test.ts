import { describe, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { FrontendStack } from "../frontend-stack";

function template() {
  const app = new App();
  const data = new DataStack(app, "Data");
  const frontend = new FrontendStack(app, "Frontend", {
    snapshotBucket: data.snapshotBucket,
    table: data.table,
  });
  return Template.fromStack(frontend);
}

describe("FrontendStack", () => {
  it("creates exactly 1 CloudFront Distribution", () => {
    template().resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("creates at least 1 S3 Bucket (site bucket)", () => {
    const t = template();
    // The FrontendStack creates a site bucket (BLOCK_ALL, RETAIN)
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("creates a Custom::CDKBucketDeployment resource", () => {
    template().resourceCountIs("Custom::CDKBucketDeployment", 1);
  });

  it("distribution has a CacheBehavior with PathPattern snapshot.json", () => {
    template().hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: "snapshot.json",
          }),
        ]),
      }),
    });
  });

  it("uses the cheapest CloudFront price class (PriceClass_100)", () => {
    template().hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({ PriceClass: "PriceClass_100" }),
    });
  });

  it("creates the beacon track Lambda (Node 20) with TABLE_NAME", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Environment: { Variables: { TABLE_NAME: Match.anyValue() } },
    });
  });

  it("creates the beacon HTTP API with a POST /api/track route", () => {
    const t = template();
    t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /api/track",
    });
  });

  it("throttles the beacon stage's default route settings", () => {
    template().hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: Match.objectLike({
        ThrottlingRateLimit: 50,
        ThrottlingBurstLimit: 100,
      }),
    });
  });

  it("adds an api/track behavior with caching disabled and the viewer-country origin request policy", () => {
    const t = template();
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: "api/track" }),
        ]),
      }),
    });
    t.hasResourceProperties("AWS::CloudFront::OriginRequestPolicy", {
      OriginRequestPolicyConfig: Match.objectLike({
        HeadersConfig: Match.objectLike({
          Headers: Match.arrayWith(["CloudFront-Viewer-Country"]),
        }),
      }),
    });
  });
});
