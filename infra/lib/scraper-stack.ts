import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as path from "node:path";

export interface ScraperStackProps extends StackProps {
  table: dynamodb.Table;
  snapshotBucket: s3.Bucket;
  dlq: sqs.Queue;
}

export class ScraperStack extends Stack {
  public readonly scraperFn: lambda.IFunction;

  constructor(scope: Construct, id: string, props: ScraperStackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, "ScraperFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/scraper/handler.ts"),
      handler: "handler",
      timeout: Duration.minutes(10),
      memorySize: 512,
      deadLetterQueue: props.dlq,
      environment: {
        TABLE_NAME: props.table.tableName,
        SNAPSHOT_BUCKET: props.snapshotBucket.bucketName,
      },
      bundling: {
        format: OutputFormat.ESM,
        tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
      },
    });

    this.scraperFn = fn;

    props.table.grantReadWriteData(fn);
    props.snapshotBucket.grantWrite(fn);

    new events.Rule(this, "ScraperSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(30)),
      targets: [new targets.LambdaFunction(fn)],
    });
  }
}
