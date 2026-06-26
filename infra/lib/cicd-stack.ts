import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface CicdStackProps extends StackProps {
  githubRepo: string; // e.g. "Venezuelahelp/venezuelahelp"
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
      // AdministratorAccess is required because:
      // 1. cdk bootstrap (runs in the pipeline) creates IAM roles, S3, ECR, SSM
      // 2. cdk deploy creates Lambda, CloudFront, Route53, ACM, DynamoDB, Cognito, etc.
      // The OIDC condition (main branch only) is the security boundary — the role
      // cannot be assumed from feature branches, forks, or outside GitHub Actions.
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
