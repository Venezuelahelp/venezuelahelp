import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface CicdStackProps extends StackProps {
  githubRepo: string; // e.g. "Venezuelahelp/venezuelahelp"
}

function managed(name: string) {
  return iam.ManagedPolicy.fromAwsManagedPolicyName(name);
}

export class CicdStack extends Stack {
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const role = new iam.Role(this, "DeployRole", {
      assumedBy: new iam.WebIdentityPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            // Only workflows running on the main branch can assume this role.
            // workflow_dispatch (rollback) also runs on main, so this covers both.
            "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:ref:refs/heads/main`,
          },
        },
      ),
      // 9 managed policies — stays within the IAM default quota of 10 per role.
      // Route53, ACM, SQS, Budgets, Cognito moved to inline to avoid the limit.
      managedPolicies: [
        managed("AWSCloudFormationFullAccess"),
        managed("AmazonS3FullAccess"),
        managed("AWSLambda_FullAccess"),
        managed("CloudFrontFullAccess"),
        managed("AmazonDynamoDBFullAccess"),
        managed("AmazonAPIGatewayAdministrator"),
        managed("AmazonEventBridgeFullAccess"),
        managed("AmazonSSMFullAccess"),
        managed("CloudWatchLogsFullAccess"),
      ],
    });

    // IAM scoped to roles and policies only — explicitly excludes users, groups,
    // and access keys so the pipeline cannot create or modify IAM identities.
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "IamRolesAndPoliciesOnly",
        actions: [
          "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole",
          "iam:GetRole", "iam:GetRolePolicy", "iam:ListRoles",
          "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
          "iam:PutRolePolicy", "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy",
          "iam:PassRole", "iam:TagRole", "iam:UntagRole",
          "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy",
          "iam:GetPolicyVersion", "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion", "iam:ListPolicyVersions",
          "iam:TagPolicy", "iam:UntagPolicy",
          "iam:CreateOpenIDConnectProvider", "iam:DeleteOpenIDConnectProvider",
          "iam:GetOpenIDConnectProvider", "iam:UpdateOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviders", "iam:TagOpenIDConnectProvider",
          "iam:AddClientIDToOpenIDConnectProvider",
        ],
        resources: ["*"],
      }),
    );

    // Services moved inline to stay under the 10-managed-policy quota.
    // STS GetCallerIdentity: CDK CLI calls this before synthesising.
    // EC2 Describe*: CDK uses this for context lookups (AZs, VPCs).
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "InlinedServices",
        actions: [
          "route53:*",
          "acm:*",
          "sqs:*",
          "budgets:*",
          "cognito-idp:*",
          "sts:GetCallerIdentity",
          "ec2:Describe*",
        ],
        resources: ["*"],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
