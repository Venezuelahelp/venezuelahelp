import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CicdStack } from "../cicd-stack";

const TEST_REPO = "org/repo";
const TEST_ENV = { account: "123456789012", region: "us-east-1" };

function template() {
  const app = new App();
  return Template.fromStack(
    new CicdStack(app, "Cicd", { env: TEST_ENV, githubRepo: TEST_REPO }),
  );
}

describe("CicdStack", () => {
  it("creates a GitHub OIDC provider", () => {
    template().hasResourceProperties(
      "Custom::AWSCDKOpenIdConnectProvider",
      Match.objectLike({
        Url: "https://token.actions.githubusercontent.com",
        ClientIDList: ["sts.amazonaws.com"],
      }),
    );
  });

  it("creates an IAM role restricted to main branch", () => {
    template().hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                "token.actions.githubusercontent.com:sub": `repo:${TEST_REPO}:ref:refs/heads/main`,
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it("does not attach AdministratorAccess or IAMFullAccess", () => {
    const roles = template().findResources("AWS::IAM::Role");
    for (const role of Object.values(roles)) {
      const arns = JSON.stringify(role.Properties?.ManagedPolicyArns ?? []);
      expect(arns).not.toContain("AdministratorAccess");
      expect(arns).not.toContain("IAMFullAccess");
    }
  });

  it("IAM inline policy excludes user and group actions", () => {
    const policies = template().findResources("AWS::IAM::Policy");
    const allActions = Object.values(policies)
      .flatMap((p) => p.Properties?.PolicyDocument?.Statement ?? [])
      .flatMap((s: { Action: string | string[] }) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      );
    const forbidden = ["iam:CreateUser", "iam:DeleteUser", "iam:CreateGroup",
      "iam:CreateAccessKey", "iam:AttachUserPolicy"];
    for (const action of forbidden) {
      expect(allActions).not.toContain(action);
    }
  });

  it("attaches service-scoped managed policies", () => {
    const t = template();
    for (const policy of [
      "AWSCloudFormationFullAccess",
      "AmazonS3FullAccess",
      "AWSLambda_FullAccess",
      "IAMFullAccess",
      "CloudFrontFullAccess",
    ]) {
      t.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            "Fn::Join": Match.arrayWith([
              Match.arrayWith([Match.stringLikeRegexp(policy)]),
            ]),
          }),
        ]),
      });
    }
  });

  it("outputs the deploy role ARN", () => {
    const outputs = template().findOutputs("*");
    expect(Object.keys(outputs).some((k) => k.startsWith("DeployRoleArn"))).toBe(true);
  });
});
