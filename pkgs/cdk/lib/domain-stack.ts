import * as route53 from "aws-cdk-lib/aws-route53";
import * as cdk from "aws-cdk-lib/core";
import type { Construct } from "constructs";
import { DOMAIN_NAME } from "./site-config";

export class DomainStack extends cdk.Stack {
  public readonly hostedZone: route53.PublicHostedZone;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.hostedZone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: DOMAIN_NAME,
      comment: `Public hosted zone for ${DOMAIN_NAME}`,
    });

    new cdk.CfnOutput(this, "HostedZoneId", {
      value: this.hostedZone.hostedZoneId,
      description: "Route53 public hosted zone ID.",
    });

    new cdk.CfnOutput(this, "NameServers", {
      value: cdk.Fn.join(", ", this.hostedZone.hostedZoneNameServers ?? [""]),
      description:
        "Set these name servers at the domain registrar before deploying StaticSiteStack.",
    });
  }
}
