import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import { ApiStack } from "../lib/api-stack";
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
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({
          PathPattern: "v1/*",
          AllowedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
            "PUT",
            "PATCH",
            "POST",
            "DELETE",
          ],
          CachePolicyId: Match.anyValue(),
          OriginRequestPolicyId: Match.anyValue(),
          ViewerProtocolPolicy: "redirect-to-https",
        }),
      ]),
    }),
  });
});

test("uses a CloudFront function for SPA fallback instead of global error responses", () => {
  const template = staticSiteTemplate();

  template.hasResourceProperties("AWS::CloudFront::Function", {
    FunctionConfig: Match.objectLike({
      Runtime: "cloudfront-js-2.0",
    }),
    FunctionCode: Match.stringLikeRegexp('request.uri = "/index.html"'),
  });
  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.not(
      Match.objectLike({
        CustomErrorResponses: Match.anyValue(),
      }),
    ),
  });
});

test("creates the Todo API table, Lambda, and HTTP API", () => {
  const app = new cdk.App();
  const stack = new ApiStack(app, "TestApiStack", { env });
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    SSESpecification: {
      SSEEnabled: true,
    },
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true,
    },
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs20.x",
    Timeout: 10,
    Environment: {
      Variables: Match.objectLike({
        TODO_TABLE_NAME: {
          Ref: Match.stringLikeRegexp("TodoTable"),
        },
      }),
    },
  });
  template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
    ProtocolType: "HTTP",
  });
  template.hasResourceProperties("AWS::ApiGatewayV2::Integration", {
    IntegrationType: "AWS_PROXY",
  });
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith([
            "dynamodb:BatchGetItem",
            "dynamodb:Query",
            "dynamodb:GetItem",
            "dynamodb:Scan",
            "dynamodb:ConditionCheckItem",
            "dynamodb:BatchWriteItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:DescribeTable",
          ]),
          Effect: "Allow",
        }),
      ]),
    },
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
    apiEndpoint: "https://abc123.execute-api.us-east-1.amazonaws.com",
    env,
    hostedZone: domainStack.hostedZone,
    websiteDistPath: "test/fixtures/site",
  });

  return Template.fromStack(stack);
}
