import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import { DomainStack } from "../lib/domain-stack";
import { StaticSiteStack } from "../lib/static-site-stack";
import { DOMAIN_NAME, WWW_DOMAIN_NAME } from "../utils/site-config";

const env = { account: "123456789012", region: "us-east-1" };

test("creates a public hosted zone for the apex domain", () => {
  const app = new cdk.App();
  const stack = new DomainStack(app, "TestDomainStack", { env });

  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Route53::HostedZone", {
    Name: `${DOMAIN_NAME}.`,
  });
});

test("creates a private S3 bucket for CloudFront only", () => {
  const template = staticSiteTemplate();

  template.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: "AES256",
          },
        },
      ],
    },
  });

  template.hasResourceProperties("AWS::S3::BucketPolicy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "s3:*",
          Condition: {
            Bool: {
              "aws:SecureTransport": "false",
            },
          },
          Effect: "Deny",
          Principal: {
            AWS: "*",
          },
        }),
        Match.objectLike({
          Action: "s3:GetObject",
          Effect: "Allow",
          Principal: {
            Service: "cloudfront.amazonaws.com",
          },
        }),
      ]),
    },
  });
});

test("configures CloudFront with apex and www aliases", () => {
  const template = staticSiteTemplate();

  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.objectLike({
      Aliases: [DOMAIN_NAME, WWW_DOMAIN_NAME],
      DefaultRootObject: "index.html",
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: "redirect-to-https",
      }),
      CustomErrorResponses: Match.arrayWith([
        Match.objectLike({
          ErrorCode: 403,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
        }),
        Match.objectLike({
          ErrorCode: 404,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
        }),
      ]),
    }),
  });
});

test("creates Route53 A and AAAA alias records for apex and www", () => {
  const template = staticSiteTemplate();

  template.resourceCountIs("AWS::Route53::RecordSet", 4);
  template.hasResourceProperties("AWS::Route53::RecordSet", {
    Name: `${DOMAIN_NAME}.`,
    Type: "A",
  });
  template.hasResourceProperties("AWS::Route53::RecordSet", {
    Name: `${DOMAIN_NAME}.`,
    Type: "AAAA",
  });
  template.hasResourceProperties("AWS::Route53::RecordSet", {
    Name: `${WWW_DOMAIN_NAME}.`,
    Type: "A",
  });
  template.hasResourceProperties("AWS::Route53::RecordSet", {
    Name: `${WWW_DOMAIN_NAME}.`,
    Type: "AAAA",
  });
});

function staticSiteTemplate() {
  const app = new cdk.App();
  const domainStack = new DomainStack(app, "TestStaticSiteDomainStack", {
    env,
  });
  const stack = new StaticSiteStack(app, "TestStaticSiteStack", {
    env,
    hostedZone: domainStack.hostedZone,
    websiteDistPath: "test/fixtures/site",
  });

  return Template.fromStack(stack);
}
