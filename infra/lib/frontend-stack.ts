import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpApi, HttpMethod, CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";

export interface FrontendStackProps extends StackProps {
  snapshotBucket: s3.Bucket;
  table: dynamodb.Table;
  domainName?: string;
  certificate?: acm.ICertificate;
  hostedZone?: route53.IHostedZone;
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Private site bucket — BLOCK_ALL, no auto-delete, RETAIN
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Import snapshotBucket by ARN to avoid a cross-stack cyclic dependency:
    // S3BucketOrigin.withOriginAccessControl adds a bucket policy to the bucket's
    // stack (DataStack) referencing our Distribution ARN, which would create
    // Data->Frontend while Frontend->Data already exists. Using fromBucketArn
    // produces an IBucket whose addToResourcePolicy is a no-op, so no policy
    // is written into DataStack and the cycle never forms.
    // NOTE: the OAC bucket policy must be applied via a separate grant or
    // manually during the first real deploy (a known cross-stack OAC trade-off).
    const snapshotBucketRef = s3.Bucket.fromBucketArn(
      this,
      "SnapshotBucketRef",
      props.snapshotBucket.bucketArn,
    );

    // Short cache policy for snapshot.json so fresh data surfaces quickly
    const snapshotCachePolicy = new cloudfront.CachePolicy(
      this,
      "SnapshotCachePolicy",
      {
        defaultTtl: Duration.seconds(60),
        minTtl: Duration.seconds(0),
        maxTtl: Duration.seconds(120),
      },
    );

    // ── Beacon de analítica de visitantes ───────────────────────────────────
    // El front público hace POST /api/track al cargar. Va por CloudFront (que
    // añade el header CloudFront-Viewer-Country) hacia esta HTTP API → Lambda →
    // DynamoDB. No guarda IP. El sitio estático sigue cacheado aparte.
    const trackFn = new NodejsFunction(this, "TrackFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/track/handler.ts"),
      handler: "handler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, "TrackFnLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: { TABLE_NAME: props.table.tableName },
      bundling: {
        format: OutputFormat.ESM,
        tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
      },
    });
    props.table.grantWriteData(trackFn);

    const trackApi = new HttpApi(this, "TrackApi");
    trackApi.addRoutes({
      path: "/api/track",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("TrackIntegration", trackFn),
    });
    // Throttle del stage por defecto: acota costo/abuso del endpoint público.
    const trackStage = trackApi.defaultStage!.node.defaultChild as CfnStage;
    trackStage.defaultRouteSettings = {
      throttlingRateLimit: 50,
      throttlingBurstLimit: 100,
    };

    const trackOrigin = new origins.HttpOrigin(
      `${trackApi.apiId}.execute-api.${this.region}.amazonaws.com`,
    );
    // Reenvía al origen el país que añade CloudFront y el User-Agent.
    const trackOrp = new cloudfront.OriginRequestPolicy(this, "TrackOrp", {
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        "CloudFront-Viewer-Country",
        "User-Agent",
      ),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.none(),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      // Cheapest edge footprint (NA/EU). LATAM viewers still resolve fine via
      // the nearest enabled edge; the ~30% price bump of ALL isn't worth it.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultRootObject: "index.html",
      ...(props.domainName && props.certificate
        ? {
            domainNames: [props.domainName, `www.${props.domainName}`],
            certificate: props.certificate,
          }
        : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "snapshot.json": {
          origin:
            origins.S3BucketOrigin.withOriginAccessControl(snapshotBucketRef),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: snapshotCachePolicy,
        },
        "api/track": {
          origin: trackOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: trackOrp,
        },
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
    });

    if (props.hostedZone && props.domainName) {
      const cfTarget = route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution),
      );
      new route53.ARecord(this, "ApexAlias", {
        zone: props.hostedZone,
        recordName: props.domainName,
        target: cfTarget,
      });
      new route53.ARecord(this, "WwwAlias", {
        zone: props.hostedZone,
        recordName: `www.${props.domainName}`,
        target: cfTarget,
      });
    }

    // Deploy frontend-public/dist to site bucket, invalidate distribution on deploy
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [
        s3deploy.Source.asset(
          path.join(__dirname, "../../frontend-public/dist"),
        ),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "SiteUrl", {
      value: props.domainName
        ? `https://www.${props.domainName}`
        : `https://${distribution.distributionDomainName}`,
    });
  }
}
