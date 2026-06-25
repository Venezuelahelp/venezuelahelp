import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class DataStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly snapshotBucket: s3.Bucket;
  public readonly scraperDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "Table", {
      tableName: "VenezuelaHelp",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.snapshotBucket = new s3.Bucket(this, "SnapshotBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.scraperDlq = new sqs.Queue(this, "ScraperDlq", {
      queueName: "venezuelahelp-scraper-dlq",
    });
    this.scraperDlq.applyRemovalPolicy(RemovalPolicy.RETAIN);

    new ssm.StringParameter(this, "TableNameParam", {
      parameterName: "/venezuelahelp/table-name",
      stringValue: this.table.tableName,
    });
  }
}
