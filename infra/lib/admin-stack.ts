import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as path from "node:path";

export interface AdminStackProps extends StackProps {
  table: dynamodb.Table;
  scraperFn: lambda.IFunction;
}

export class AdminStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    // ── Cognito ──────────────────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, "AdminUserPool", {
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const client = userPool.addClient("AdminClient", {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // ── Admin Lambda ──────────────────────────────────────────────────────────
    const fn = new NodejsFunction(this, "AdminFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/admin-api/handler.ts"),
      handler: "handler",
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE_NAME: props.table.tableName,
        SCRAPER_FN_NAME: props.scraperFn.functionName,
      },
      bundling: {
        format: OutputFormat.ESM,
        tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
      },
    });

    props.table.grantReadWriteData(fn);
    props.scraperFn.grantInvoke(fn);

    // ── HTTP API + JWT Authorizer ─────────────────────────────────────────────
    const authorizer = new HttpUserPoolAuthorizer("AdminAuthorizer", userPool, {
      userPoolClients: [client],
    });

    const api = new HttpApi(this, "AdminApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["authorization", "content-type"],
      },
    });

    const integration = new HttpLambdaIntegration("AdminIntegration", fn);

    // ── Routes ────────────────────────────────────────────────────────────────
    api.addRoutes({
      path: "/config",
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });
    api.addRoutes({
      path: "/config",
      methods: [HttpMethod.PUT],
      integration,
      authorizer,
    });
    api.addRoutes({
      path: "/sources",
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });
    api.addRoutes({
      path: "/sources/{id}",
      methods: [HttpMethod.PATCH],
      integration,
      authorizer,
    });
    api.addRoutes({
      path: "/scrape",
      methods: [HttpMethod.POST],
      integration,
      authorizer,
    });
    api.addRoutes({
      path: "/stats",
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
  }
}
