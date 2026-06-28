"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assertions_1 = require("aws-cdk-lib/assertions");
const cdk = __importStar(require("aws-cdk-lib/core"));
const domain_stack_1 = require("../lib/domain-stack");
const static_site_stack_1 = require("../lib/static-site-stack");
const site_config_1 = require("../utils/site-config");
const env = { account: "123456789012", region: "us-east-1" };
test("creates a public hosted zone for the apex domain", () => {
    const app = new cdk.App();
    const stack = new domain_stack_1.DomainStack(app, "TestDomainStack", { env });
    const template = assertions_1.Template.fromStack(stack);
    template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: `${site_config_1.DOMAIN_NAME}.`,
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
            Statement: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
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
                assertions_1.Match.objectLike({
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
        DistributionConfig: assertions_1.Match.objectLike({
            Aliases: [site_config_1.DOMAIN_NAME, site_config_1.WWW_DOMAIN_NAME],
            DefaultRootObject: "index.html",
            DefaultCacheBehavior: assertions_1.Match.objectLike({
                ViewerProtocolPolicy: "redirect-to-https",
            }),
            CustomErrorResponses: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    ErrorCode: 403,
                    ResponseCode: 200,
                    ResponsePagePath: "/index.html",
                }),
                assertions_1.Match.objectLike({
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
        Name: `${site_config_1.DOMAIN_NAME}.`,
        Type: "A",
    });
    template.hasResourceProperties("AWS::Route53::RecordSet", {
        Name: `${site_config_1.DOMAIN_NAME}.`,
        Type: "AAAA",
    });
    template.hasResourceProperties("AWS::Route53::RecordSet", {
        Name: `${site_config_1.WWW_DOMAIN_NAME}.`,
        Type: "A",
    });
    template.hasResourceProperties("AWS::Route53::RecordSet", {
        Name: `${site_config_1.WWW_DOMAIN_NAME}.`,
        Type: "AAAA",
    });
});
function staticSiteTemplate() {
    const app = new cdk.App();
    const domainStack = new domain_stack_1.DomainStack(app, "TestStaticSiteDomainStack", {
        env,
    });
    const stack = new static_site_stack_1.StaticSiteStack(app, "TestStaticSiteStack", {
        env,
        hostedZone: domainStack.hostedZone,
        websiteDistPath: "test/fixtures/site",
    });
    return assertions_1.Template.fromStack(stack);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90ZXN0L2Nkay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsdURBQXlEO0FBQ3pELHNEQUF3QztBQUN4QyxzREFBa0Q7QUFDbEQsZ0VBQTJEO0FBQzNELHNEQUFvRTtBQUVwRSxNQUFNLEdBQUcsR0FBRyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBRTdELElBQUksQ0FBQyxrREFBa0QsRUFBRSxHQUFHLEVBQUU7SUFDNUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSwwQkFBVyxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFFL0QsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFM0MsUUFBUSxDQUFDLHFCQUFxQixDQUFDLDBCQUEwQixFQUFFO1FBQ3pELElBQUksRUFBRSxHQUFHLHlCQUFXLEdBQUc7S0FDeEIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUM7QUFFSCxJQUFJLENBQUMsaURBQWlELEVBQUUsR0FBRyxFQUFFO0lBQzNELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixFQUFFLENBQUM7SUFFdEMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1FBQ2hELDhCQUE4QixFQUFFO1lBQzlCLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsZ0JBQWdCLEVBQUUsSUFBSTtZQUN0QixxQkFBcUIsRUFBRSxJQUFJO1NBQzVCO1FBQ0QsZ0JBQWdCLEVBQUU7WUFDaEIsaUNBQWlDLEVBQUU7Z0JBQ2pDO29CQUNFLDZCQUE2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QUFXLENBQUMsR0FBRyxFQUFFLDJCQUEyQixFQUFFO1FBQ3BFLEdBQUc7S0FDSixDQUFDLENBQUM7SUFDSCxNQUFNLEtBQUssR0FBRyxJQUFJLG1DQUFlLENBQUMsR0FBRyxFQUFFLHFCQUFxQixFQUFFO1FBQzVELEdBQUc7UUFDSCxVQUFVLEVBQUUsV0FBVyxDQUFDLFVBQVU7UUFDbEMsZUFBZSxFQUFFLG9CQUFvQjtLQUN0QyxDQUFDLENBQUM7SUFFSCxPQUFPLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25DLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNYXRjaCwgVGVtcGxhdGUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYi9jb3JlXCI7XG5pbXBvcnQgeyBEb21haW5TdGFjayB9IGZyb20gXCIuLi9saWIvZG9tYWluLXN0YWNrXCI7XG5pbXBvcnQgeyBTdGF0aWNTaXRlU3RhY2sgfSBmcm9tIFwiLi4vbGliL3N0YXRpYy1zaXRlLXN0YWNrXCI7XG5pbXBvcnQgeyBET01BSU5fTkFNRSwgV1dXX0RPTUFJTl9OQU1FIH0gZnJvbSBcIi4uL3V0aWxzL3NpdGUtY29uZmlnXCI7XG5cbmNvbnN0IGVudiA9IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcInVzLWVhc3QtMVwiIH07XG5cbnRlc3QoXCJjcmVhdGVzIGEgcHVibGljIGhvc3RlZCB6b25lIGZvciB0aGUgYXBleCBkb21haW5cIiwgKCkgPT4ge1xuICBjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICBjb25zdCBzdGFjayA9IG5ldyBEb21haW5TdGFjayhhcHAsIFwiVGVzdERvbWFpblN0YWNrXCIsIHsgZW52IH0pO1xuXG4gIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlJvdXRlNTM6Okhvc3RlZFpvbmVcIiwge1xuICAgIE5hbWU6IGAke0RPTUFJTl9OQU1FfS5gLFxuICB9KTtcbn0pO1xuXG50ZXN0KFwiY3JlYXRlcyBhIHByaXZhdGUgUzMgYnVja2V0IGZvciBDbG91ZEZyb250IG9ubHlcIiwgKCkgPT4ge1xuICBjb25zdCB0ZW1wbGF0ZSA9IHN0YXRpY1NpdGVUZW1wbGF0ZSgpO1xuXG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgfSxcbiAgICBCdWNrZXRFbmNyeXB0aW9uOiB7XG4gICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0OiB7XG4gICAgICAgICAgICBTU0VBbGdvcml0aG06IFwiQUVTMjU2XCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgfSk7XG5cbiAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0UG9saWN5XCIsIHtcbiAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBBY3Rpb246IFwiczM6KlwiLFxuICAgICAgICAgIENvbmRpdGlvbjoge1xuICAgICAgICAgICAgQm9vbDoge1xuICAgICAgICAgICAgICBcImF3czpTZWN1cmVUcmFuc3BvcnRcIjogXCJmYWxzZVwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIEVmZmVjdDogXCJEZW55XCIsXG4gICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICBBV1M6IFwiKlwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBBY3Rpb246IFwiczM6R2V0T2JqZWN0XCIsXG4gICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICBTZXJ2aWNlOiBcImNsb3VkZnJvbnQuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgXSksXG4gICAgfSxcbiAgfSk7XG59KTtcblxudGVzdChcImNvbmZpZ3VyZXMgQ2xvdWRGcm9udCB3aXRoIGFwZXggYW5kIHd3dyBhbGlhc2VzXCIsICgpID0+IHtcbiAgY29uc3QgdGVtcGxhdGUgPSBzdGF0aWNTaXRlVGVtcGxhdGUoKTtcblxuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvblwiLCB7XG4gICAgRGlzdHJpYnV0aW9uQ29uZmlnOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgIEFsaWFzZXM6IFtET01BSU5fTkFNRSwgV1dXX0RPTUFJTl9OQU1FXSxcbiAgICAgIERlZmF1bHRSb290T2JqZWN0OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIERlZmF1bHRDYWNoZUJlaGF2aW9yOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgVmlld2VyUHJvdG9jb2xQb2xpY3k6IFwicmVkaXJlY3QtdG8taHR0cHNcIixcbiAgICAgIH0pLFxuICAgICAgQ3VzdG9tRXJyb3JSZXNwb25zZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIEVycm9yQ29kZTogNDAzLFxuICAgICAgICAgIFJlc3BvbnNlQ29kZTogMjAwLFxuICAgICAgICAgIFJlc3BvbnNlUGFnZVBhdGg6IFwiL2luZGV4Lmh0bWxcIixcbiAgICAgICAgfSksXG4gICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIEVycm9yQ29kZTogNDA0LFxuICAgICAgICAgIFJlc3BvbnNlQ29kZTogMjAwLFxuICAgICAgICAgIFJlc3BvbnNlUGFnZVBhdGg6IFwiL2luZGV4Lmh0bWxcIixcbiAgICAgICAgfSksXG4gICAgICBdKSxcbiAgICB9KSxcbiAgfSk7XG59KTtcblxudGVzdChcImNyZWF0ZXMgUm91dGU1MyBBIGFuZCBBQUFBIGFsaWFzIHJlY29yZHMgZm9yIGFwZXggYW5kIHd3d1wiLCAoKSA9PiB7XG4gIGNvbnN0IHRlbXBsYXRlID0gc3RhdGljU2l0ZVRlbXBsYXRlKCk7XG5cbiAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKFwiQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXRcIiwgNCk7XG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Um91dGU1Mzo6UmVjb3JkU2V0XCIsIHtcbiAgICBOYW1lOiBgJHtET01BSU5fTkFNRX0uYCxcbiAgICBUeXBlOiBcIkFcIixcbiAgfSk7XG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Um91dGU1Mzo6UmVjb3JkU2V0XCIsIHtcbiAgICBOYW1lOiBgJHtET01BSU5fTkFNRX0uYCxcbiAgICBUeXBlOiBcIkFBQUFcIixcbiAgfSk7XG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Um91dGU1Mzo6UmVjb3JkU2V0XCIsIHtcbiAgICBOYW1lOiBgJHtXV1dfRE9NQUlOX05BTUV9LmAsXG4gICAgVHlwZTogXCJBXCIsXG4gIH0pO1xuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlJvdXRlNTM6OlJlY29yZFNldFwiLCB7XG4gICAgTmFtZTogYCR7V1dXX0RPTUFJTl9OQU1FfS5gLFxuICAgIFR5cGU6IFwiQUFBQVwiLFxuICB9KTtcbn0pO1xuXG5mdW5jdGlvbiBzdGF0aWNTaXRlVGVtcGxhdGUoKSB7XG4gIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gIGNvbnN0IGRvbWFpblN0YWNrID0gbmV3IERvbWFpblN0YWNrKGFwcCwgXCJUZXN0U3RhdGljU2l0ZURvbWFpblN0YWNrXCIsIHtcbiAgICBlbnYsXG4gIH0pO1xuICBjb25zdCBzdGFjayA9IG5ldyBTdGF0aWNTaXRlU3RhY2soYXBwLCBcIlRlc3RTdGF0aWNTaXRlU3RhY2tcIiwge1xuICAgIGVudixcbiAgICBob3N0ZWRab25lOiBkb21haW5TdGFjay5ob3N0ZWRab25lLFxuICAgIHdlYnNpdGVEaXN0UGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL3NpdGVcIixcbiAgfSk7XG5cbiAgcmV0dXJuIFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG59XG4iXX0=