import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";

export interface BotStackProps extends StackProps {
  table: dynamodb.Table;
  snapshotBucket: s3.Bucket;
}

export class BotStack extends Stack {
  constructor(scope: Construct, id: string, props: BotStackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, "TelegramFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/telegram/handler.ts"),
      handler: "handler",
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE_NAME: props.table.tableName,
        SNAPSHOT_BUCKET: props.snapshotBucket.bucketName,
      },
      bundling: {
        format: OutputFormat.ESM,
        tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
      },
    });

    props.table.grantReadWriteData(fn);
    props.snapshotBucket.grantRead(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/venezuelahelp/telegram-token`,
        ],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:Converse"],
        resources: ["*"],
      }),
    );

    const api = new HttpApi(this, "BotApi");
    api.addRoutes({
      path: "/webhook",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("BotIntegration", fn),
    });

    new CfnOutput(this, "WebhookUrl", { value: `${api.apiEndpoint}/webhook` });
  }
}
