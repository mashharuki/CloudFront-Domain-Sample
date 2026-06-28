import * as route53 from "aws-cdk-lib/aws-route53";
import * as cdk from "aws-cdk-lib/core";
import type { Construct } from "constructs";
export declare class DomainStack extends cdk.Stack {
    readonly hostedZone: route53.PublicHostedZone;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
