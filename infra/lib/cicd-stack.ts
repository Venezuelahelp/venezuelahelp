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
    });

    // Minimal permissions: the CDK CLI assumes bootstrap roles for all operations.
    // - cdk-*-lookup-role   → context lookups (hosted zone, etc.)
    // - cdk-*-file-publishing-role → uploads Lambda zips to the bootstrap S3 bucket
    // - cdk-*-deploy-role   → calls CloudFormation to create/update stacks
    // CloudFormation then assumes cdk-*-cfn-exec-role (AdministratorAccess) to
    // create resources — that role is assumed by the CloudFormation service principal,
    // never directly by this role.
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "CdkBootstrapRoles",
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    // CDK CLI calls GetCallerIdentity to verify credentials before synthesising.
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "CallerIdentity",
        effect: iam.Effect.ALLOW,
        actions: ["sts:GetCallerIdentity"],
        resources: ["*"],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
