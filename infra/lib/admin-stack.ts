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
import * as logs from "aws-cdk-lib/aws-logs";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as path from "node:path";

export interface AdminStackProps extends StackProps {
  table: dynamodb.Table;
  scraperFn: lambda.IFunction;
  // Bucket del snapshot (HeadObject → edad del snapshot en /stats).
  snapshotBucket: s3.Bucket;
  // Dominio público del sitio: la URL del snapshot.json para /items/search
  // se deriva de aquí (el Lambda lee por HTTP igual que el data-api).
  publicDomain: string;
  adminDomain?: string;
  certificate?: acm.ICertificate;
  hostedZone?: route53.IHostedZone;
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
      // Short log retention so CloudWatch storage never grows without bound.
      logGroup: new logs.LogGroup(this, "AdminFnLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: props.table.tableName,
        SCRAPER_FN_NAME: props.scraperFn.functionName,
        SNAPSHOT_BUCKET: props.snapshotBucket.bucketName,
        SNAPSHOT_URL: `https://${props.publicDomain}/snapshot.json`,
      },
      bundling: {
        format: OutputFormat.ESM,
        tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
      },
    });

    props.table.grantReadWriteData(fn);
    props.scraperFn.grantInvoke(fn);
    // Solo lectura de snapshot.json (HeadObject → LastModified para /stats).
    props.snapshotBucket.grantRead(fn, "snapshot.json");

    // ── HTTP API + JWT Authorizer ─────────────────────────────────────────────
    const authorizer = new HttpUserPoolAuthorizer("AdminAuthorizer", userPool, {
      userPoolClients: [client],
    });

    const api = new HttpApi(this, "AdminApi", {
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: props.adminDomain
          ? [`https://${props.adminDomain}`]
          : ["*"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.POST,
          CorsHttpMethod.DELETE,
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
    });
    api.addRoutes({
      path: "/config",
      methods: [HttpMethod.PUT],
      integration,
    });
    api.addRoutes({
      path: "/sources",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/sources",
      methods: [HttpMethod.POST],
      integration,
    });
    api.addRoutes({
      path: "/sources/{id}",
      methods: [HttpMethod.PATCH],
      integration,
    });
    api.addRoutes({
      path: "/sources/{id}",
      methods: [HttpMethod.DELETE],
      integration,
    });
    api.addRoutes({
      path: "/scrape",
      methods: [HttpMethod.POST],
      integration,
    });
    api.addRoutes({
      path: "/stats",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/analytics",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/tg-users",
      methods: [HttpMethod.GET],
      integration,
    });

    // ── Observabilidad ────────────────────────────────────────────────────────
    api.addRoutes({
      path: "/qa-logs/{chatId}",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/items/search",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/scrape-runs",
      methods: [HttpMethod.GET],
      integration,
    });

    // ── Programa de API para terceros ────────────────────────────────────────
    api.addRoutes({
      path: "/api-requests",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/api-requests/{id}/approve",
      methods: [HttpMethod.POST],
      integration,
    });
    api.addRoutes({
      path: "/api-requests/{id}/reject",
      methods: [HttpMethod.POST],
      integration,
    });
    api.addRoutes({
      path: "/api-keys",
      methods: [HttpMethod.GET],
      integration,
    });
    api.addRoutes({
      path: "/api-keys/{id}/revoke",
      methods: [HttpMethod.POST],
      integration,
    });

    // ── Admin SPA Hosting ─────────────────────────────────────────────────────
    const siteBucket = new s3.Bucket(this, "AdminSiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const distribution = new cloudfront.Distribution(
      this,
      "AdminDistribution",
      {
        // Cheapest edge footprint (NA/EU); admin traffic is tiny and internal.
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        defaultRootObject: "index.html",
        ...(props.adminDomain && props.certificate
          ? {
              domainNames: [props.adminDomain],
              certificate: props.certificate,
            }
          : {}),
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
        ],
      },
    );

    if (props.hostedZone && props.adminDomain) {
      new route53.ARecord(this, "AdminAlias", {
        zone: props.hostedZone,
        recordName: props.adminDomain,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(distribution),
        ),
      });
    }

    const adminDist = path.join(__dirname, "../../frontend-admin/dist");

    // Assets hasheados (`/assets/*`, favicon, etc.): cache largo e inmutable —
    // su nombre lleva un hash de contenido, así que una URL nunca cambia.
    // `prune: false` para no borrar los bundles viejos (un index.html que un
    // navegador aún tenga cacheado los seguirá encontrando en vez de dar 404).
    const deployAssets = new s3deploy.BucketDeployment(
      this,
      "DeployAdminAssets",
      {
        sources: [
          s3deploy.Source.asset(adminDist, { exclude: ["index.html"] }),
        ],
        destinationBucket: siteBucket,
        cacheControl: [
          s3deploy.CacheControl.fromString(
            "public, max-age=31536000, immutable",
          ),
        ],
        prune: false,
      },
    );

    // index.html + config.json: SIN caché (el navegador revalida siempre). Sin
    // esto, el navegador conserva un index.html viejo que referencia bundles ya
    // borrados → 404 → admin en blanco hasta Cmd+Shift+R en cada deploy. Aquí
    // se invalida CloudFront (los assets, al ser inmutables/hasheados, no lo
    // necesitan).
    const deployHtml = new s3deploy.BucketDeployment(this, "DeployAdminHtml", {
      sources: [
        s3deploy.Source.asset(adminDist, { exclude: ["assets/**"] }),
        s3deploy.Source.jsonData("config.json", {
          apiUrl: api.apiEndpoint,
          userPoolId: userPool.userPoolId,
          userPoolClientId: client.userPoolClientId,
          region: this.region,
        }),
      ],
      destinationBucket: siteBucket,
      cacheControl: [
        s3deploy.CacheControl.fromString("no-cache, no-store, must-revalidate"),
      ],
      prune: false,
      distribution,
      distributionPaths: ["/", "/index.html", "/config.json"],
    });

    // El index.html (y su invalidación de CloudFront) deben subir SOLO después de
    // que los bundles hasheados ya estén en S3. Sin este orden, CloudFormation
    // puede correr ambos deployments en paralelo: si el index nuevo se publica y
    // se invalida antes de que suban los /assets/*, el navegador pide un bundle
    // inexistente → 404 → errorResponses lo reescribe a index.html(200) → el
    // <script type=module> recibe HTML → pantalla en blanco (cacheada ~5 min).
    deployHtml.node.addDependency(deployAssets);

    // ── Outputs ───────────────────────────────────────────────────────────────
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "AdminUrl", {
      value: props.adminDomain
        ? `https://${props.adminDomain}`
        : `https://${distribution.distributionDomainName}`,
    });
  }
}
