import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

export interface DomainStackProps extends StackProps {
  domainName: string;
  hostedZoneId: string;
}

export class DomainStack extends Stack {
  readonly hostedZone: route53.IHostedZone;
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "Zone",
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.domainName,
      },
    );

    // Wildcard SAN covers admin.venezuelahelp.click; apex covers the root site.
    // ACM certs for CloudFront must live in us-east-1 (our deployment region).
    this.certificate = new acm.Certificate(this, "Cert", {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
  }
}
