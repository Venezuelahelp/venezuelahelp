import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CicdStack } from "../cicd-stack";

const TEST_REPO = "org/repo";

function template() {
  const app = new App();
  return Template.fromStack(
    new CicdStack(app, "Cicd", { githubRepo: TEST_REPO }),
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

  it("creates an IAM role with WebIdentity principal scoped to the repo", () => {
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

  it("attaches AdministratorAccess to the deploy role", () => {
    template().hasResourceProperties("AWS::IAM::Role", {
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          "Fn::Join": Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp("AdministratorAccess"),
            ]),
          ]),
        }),
      ]),
    });
  });

  it("outputs the deploy role ARN", () => {
    const outputs = template().findOutputs("*");
    expect(Object.keys(outputs).some((k) => k.startsWith("DeployRoleArn"))).toBe(true);
  });
});
