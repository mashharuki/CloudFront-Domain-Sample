#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { DomainStack } from "../lib/domain-stack";
import { CLOUD_FRONT_REGION } from "../lib/site-config";
import { StaticSiteStack } from "../lib/static-site-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: CLOUD_FRONT_REGION,
};

const domainStack = new DomainStack(app, "DomainStack", { env });

new StaticSiteStack(app, "StaticSiteStack", {
  env,
  hostedZone: domainStack.hostedZone,
});
