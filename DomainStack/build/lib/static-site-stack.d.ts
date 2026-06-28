import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib/core";
import type { Construct } from "constructs";
export interface StaticSiteStackProps extends cdk.StackProps {
    readonly hostedZone: route53.IHostedZone;
    readonly websiteDistPath?: string;
}
export declare class StaticSiteStack extends cdk.Stack {
    readonly bucket: s3.Bucket;
    readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: StaticSiteStackProps);
}
