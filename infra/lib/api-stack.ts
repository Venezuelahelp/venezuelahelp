import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
  CfnStage,
  DomainName,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as path from "node:path";

export interface ApiStackProps extends StackProps {
  table: dynamodb.Table;
  // Dominio público (la URL del snapshot.json se deriva de aquí).
  domainName: string;
  // Dominio propio del API (p.ej. api.venezuelahelp.click). Opcional: sin él el
  // API queda solo en la URL execute-api (útil en tests).
  apiDomain?: string;
  certificate?: acm.ICertificate;
  hostedZone?: route53.IHostedZone;
}

// API público para terceros: consulta de datos (`/v1/*`, con API key) + intake
// de solicitudes de acceso (`/api-access/requests`, público). Lee el MISMO
// snapshot.json que el front (por HTTP, solo lectura); no toca scraper ni S3.
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const snapshotUrl = `https://${props.domainName}/snapshot.json`;

    const bundling = {
      format: OutputFormat.ESM,
      tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
    } as const;

    function logGroup(scope: Construct, lid: string) {
      return new logs.LogGroup(scope, lid, {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    }

    // ── Lambda de datos (lee el snapshot por HTTP, solo lectura) ───────────────
    const dataFn = new NodejsFunction(this, "DataApiFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/data-api/handler.ts"),
      handler: "handler",
      timeout: Duration.seconds(30),
      // Carga y parsea el snapshot completo en memoria (~38MB JSON, 48k+ ítems);
      // con 256MB daba Runtime.OutOfMemory. 1024MB como el bot/scraper.
      memorySize: 1024,
      logGroup: logGroup(this, "DataApiFnLogs"),
      environment: { SNAPSHOT_URL: snapshotUrl },
      bundling,
    });

    // ── Lambda authorizer (valida la API key contra DynamoDB) ──────────────────
    const authFn = new NodejsFunction(this, "DataAuthorizerFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/data-api/authorizer.ts"),
      handler: "authorizer",
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup: logGroup(this, "DataAuthorizerFnLogs"),
      environment: { TABLE_NAME: props.table.tableName },
      bundling,
    });
    // RW: el authorizer escribe el contador de rate-limit por key.
    props.table.grantReadWriteData(authFn);

    // ── Lambda de intake (recibe solicitudes públicas) ─────────────────────────
    const intakeFn = new NodejsFunction(this, "ApiIntakeFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/public-api/handler.ts"),
      handler: "handler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      logGroup: logGroup(this, "ApiIntakeFnLogs"),
      environment: { TABLE_NAME: props.table.tableName },
      bundling,
    });
    props.table.grantReadWriteData(intakeFn);

    // ── HTTP API ───────────────────────────────────────────────────────────────
    // Dominio propio opcional (api.venezuelahelp.click) con el cert wildcard.
    const customDomain =
      props.apiDomain && props.certificate
        ? new DomainName(this, "ApiDomainName", {
            domainName: props.apiDomain,
            certificate: props.certificate,
          })
        : undefined;

    const api = new HttpApi(this, "DataApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["x-api-key", "content-type"],
      },
      ...(customDomain
        ? { defaultDomainMapping: { domainName: customDomain } }
        : {}),
    });

    if (customDomain && props.apiDomain && props.hostedZone) {
      new route53.ARecord(this, "ApiAlias", {
        zone: props.hostedZone,
        recordName: props.apiDomain,
        target: route53.RecordTarget.fromAlias(
          new route53targets.ApiGatewayv2DomainProperties(
            customDomain.regionalDomainName,
            customDomain.regionalHostedZoneId,
          ),
        ),
      });
    }

    const authorizer = new HttpLambdaAuthorizer("DataKeyAuthorizer", authFn, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: ["$request.header.x-api-key"],
      // Sin caché: la revocación de una key debe surtir efecto de inmediato.
      resultsCacheTtl: Duration.seconds(0),
    });

    const dataIntegration = new HttpLambdaIntegration("DataIntegration", dataFn);

    for (const p of ["/v1/items", "/v1/categories", "/v1/sources", "/v1/meta"]) {
      api.addRoutes({
        path: p,
        methods: [HttpMethod.GET],
        integration: dataIntegration,
        authorizer,
      });
    }

    // Ruta pública (sin authorizer): el solicitante aún no tiene key.
    api.addRoutes({
      path: "/api-access/requests",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("IntakeIntegration", intakeFn),
    });

    // Throttle de stage como backstop (el rate-limit fino es por key / por IP).
    const defaultStage = api.defaultStage?.node.defaultChild as CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingRateLimit: 20,
      throttlingBurstLimit: 40,
    };

    new CfnOutput(this, "DataApiUrl", { value: api.apiEndpoint });
    if (props.apiDomain) {
      new CfnOutput(this, "DataApiCustomUrl", {
        value: `https://${props.apiDomain}`,
      });
    }
  }
}
