#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib/core"));
const domain_stack_1 = require("../lib/domain-stack");
const static_site_stack_1 = require("../lib/static-site-stack");
const site_config_1 = require("../utils/site-config");
const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: site_config_1.CLOUD_FRONT_REGION,
};
const domainStack = new domain_stack_1.DomainStack(app, "DomainStack", { env });
new static_site_stack_1.StaticSiteStack(app, "StaticSiteStack", {
    env,
    hostedZone: domainStack.hostedZone,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vYmluL2Nkay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxzREFBd0M7QUFDeEMsc0RBQWtEO0FBQ2xELGdFQUEyRDtBQUMzRCxzREFBMEQ7QUFFMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDMUIsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7SUFDeEMsTUFBTSxFQUFFLGdDQUFrQjtDQUMzQixDQUFDO0FBRUYsTUFBTSxXQUFXLEdBQUcsSUFBSSwwQkFBVyxDQUFDLEdBQUcsRUFBRSxhQUFhLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBRWpFLElBQUksbUNBQWUsQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUU7SUFDMUMsR0FBRztJQUNILFVBQVUsRUFBRSxXQUFXLENBQUMsVUFBVTtDQUNuQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliL2NvcmVcIjtcbmltcG9ydCB7IERvbWFpblN0YWNrIH0gZnJvbSBcIi4uL2xpYi9kb21haW4tc3RhY2tcIjtcbmltcG9ydCB7IFN0YXRpY1NpdGVTdGFjayB9IGZyb20gXCIuLi9saWIvc3RhdGljLXNpdGUtc3RhY2tcIjtcbmltcG9ydCB7IENMT1VEX0ZST05UX1JFR0lPTiB9IGZyb20gXCIuLi91dGlscy9zaXRlLWNvbmZpZ1wiO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuY29uc3QgZW52ID0ge1xuICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICByZWdpb246IENMT1VEX0ZST05UX1JFR0lPTixcbn07XG5cbmNvbnN0IGRvbWFpblN0YWNrID0gbmV3IERvbWFpblN0YWNrKGFwcCwgXCJEb21haW5TdGFja1wiLCB7IGVudiB9KTtcblxubmV3IFN0YXRpY1NpdGVTdGFjayhhcHAsIFwiU3RhdGljU2l0ZVN0YWNrXCIsIHtcbiAgZW52LFxuICBob3N0ZWRab25lOiBkb21haW5TdGFjay5ob3N0ZWRab25lLFxufSk7XG4iXX0=