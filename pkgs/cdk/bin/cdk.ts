#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { ApiStack } from "../lib/api-stack";
import { DomainStack } from "../lib/domain-stack";
import { StaticSiteStack } from "../lib/static-site-stack";
import { CLOUD_FRONT_REGION } from "../utils/site-config";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: CLOUD_FRONT_REGION,
};

const domainStack = new DomainStack(app, "DomainStack", { env });
const apiStack = new ApiStack(app, "ApiStack", { env });

new StaticSiteStack(app, "StaticSiteStack", {
  env,
  apiEndpoint: apiStack.api.apiEndpoint,
  hostedZone: domainStack.hostedZone,
});
