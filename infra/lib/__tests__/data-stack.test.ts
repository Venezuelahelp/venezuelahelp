import { describe, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";

function template() {
  const app = new App();
  const stack = new DataStack(app, "TestDataStack");
  return Template.fromStack(stack);
}

describe("DataStack", () => {
  it("creates a pay-per-request DynamoDB table named VenezuelaHelp", () => {
    template().hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "VenezuelaHelp",
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("creates a snapshot S3 bucket and a scraper DLQ", () => {
    const t = template();
    t.resourceCountIs("AWS::S3::Bucket", 1);
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    t.hasResourceProperties("AWS::SQS::Queue", {
      QueueName: "venezuelahelp-scraper-dlq",
    });
    t.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/venezuelahelp/table-name",
      Type: "String",
    });
  });
});
