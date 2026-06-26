import { describe, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DomainStack } from "../domain-stack";

const TEST_DOMAIN = "test.click";
const TEST_ZONE_ID = "ZHOSTEDZONETEST";

function template() {
  const app = new App();
  return Template.fromStack(
    new DomainStack(app, "Domain", {
      domainName: TEST_DOMAIN,
      hostedZoneId: TEST_ZONE_ID,
    }),
  );
}

describe("DomainStack", () => {
  it("creates an ACM certificate for the apex domain", () => {
    template().hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: TEST_DOMAIN,
    });
  });

  it("certificate includes wildcard SAN", () => {
    template().hasResourceProperties("AWS::CertificateManager::Certificate", {
      SubjectAlternativeNames: Match.arrayWith([`*.${TEST_DOMAIN}`]),
    });
  });

  it("certificate uses DNS validation", () => {
    template().hasResourceProperties("AWS::CertificateManager::Certificate", {
      ValidationMethod: "DNS",
    });
  });
});
