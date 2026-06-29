import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { HttpApi, HttpMethod, CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
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
      memorySize: 1024,
      // NOTE: no reservedConcurrentExecutions here. This account's total
      // concurrency limit is 10, and AWS requires keeping >=10 unreserved, so
      // any reservation is rejected. The aggregate spend ceiling instead comes
      // from the API Gateway stage throttle below (plus the per-chat rate limit
      // and the cost Budget); the low account-wide concurrency is itself a cap.
      // Short log retention so CloudWatch storage never grows without bound.
      logGroup: new logs.LogGroup(this, "TelegramFnLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: props.table.tableName,
        SNAPSHOT_BUCKET: props.snapshotBucket.bucketName,
        // Exige el secret del webhook (falla-cerrado) en producción.
        TELEGRAM_REQUIRE_SECRET: "true",
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
          `arn:aws:ssm:${this.region}:${this.account}:parameter/venezuelahelp/telegram-webhook-secret`,
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

    // Throttle the auto-created $default stage. A flood of webhook calls is
    // rejected at the gateway (HTTP 429) before it can invoke Lambda/Bedrock.
    const defaultStage = api.defaultStage?.node.defaultChild as CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingRateLimit: 5,
      throttlingBurstLimit: 10,
    };

    new CfnOutput(this, "WebhookUrl", { value: `${api.apiEndpoint}/webhook` });
  }
}
