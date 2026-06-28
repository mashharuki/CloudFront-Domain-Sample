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
exports.DomainStack = void 0;
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const cdk = __importStar(require("aws-cdk-lib/core"));
const site_config_1 = require("../utils/site-config");
class DomainStack extends cdk.Stack {
    hostedZone;
    constructor(scope, id, props) {
        super(scope, id, props);
        this.hostedZone = new route53.PublicHostedZone(this, "HostedZone", {
            zoneName: site_config_1.DOMAIN_NAME,
            comment: `Public hosted zone for ${site_config_1.DOMAIN_NAME}`,
        });
        new cdk.CfnOutput(this, "HostedZoneId", {
            value: this.hostedZone.hostedZoneId,
            description: "Route53 public hosted zone ID.",
        });
        new cdk.CfnOutput(this, "NameServers", {
            value: cdk.Fn.join(", ", this.hostedZone.hostedZoneNameServers ?? [""]),
            description: "Set these name servers at the domain registrar before deploying StaticSiteStack.",
        });
    }
}
exports.DomainStack = DomainStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tYWluLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2RvbWFpbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpRUFBbUQ7QUFDbkQsc0RBQXdDO0FBRXhDLHNEQUFtRDtBQUVuRCxNQUFhLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUN4QixVQUFVLENBQTJCO0lBRXJELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2pFLFFBQVEsRUFBRSx5QkFBVztZQUNyQixPQUFPLEVBQUUsMEJBQTBCLHlCQUFXLEVBQUU7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWTtZQUNuQyxXQUFXLEVBQUUsZ0NBQWdDO1NBQzlDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZFLFdBQVcsRUFDVCxrRkFBa0Y7U0FDckYsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdEJELGtDQXNCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1yb3V0ZTUzXCI7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliL2NvcmVcIjtcbmltcG9ydCB0eXBlIHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IERPTUFJTl9OQU1FIH0gZnJvbSBcIi4uL3V0aWxzL3NpdGUtY29uZmlnXCI7XG5cbmV4cG9ydCBjbGFzcyBEb21haW5TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBob3N0ZWRab25lOiByb3V0ZTUzLlB1YmxpY0hvc3RlZFpvbmU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgdGhpcy5ob3N0ZWRab25lID0gbmV3IHJvdXRlNTMuUHVibGljSG9zdGVkWm9uZSh0aGlzLCBcIkhvc3RlZFpvbmVcIiwge1xuICAgICAgem9uZU5hbWU6IERPTUFJTl9OQU1FLFxuICAgICAgY29tbWVudDogYFB1YmxpYyBob3N0ZWQgem9uZSBmb3IgJHtET01BSU5fTkFNRX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJIb3N0ZWRab25lSWRcIiwge1xuICAgICAgdmFsdWU6IHRoaXMuaG9zdGVkWm9uZS5ob3N0ZWRab25lSWQsXG4gICAgICBkZXNjcmlwdGlvbjogXCJSb3V0ZTUzIHB1YmxpYyBob3N0ZWQgem9uZSBJRC5cIixcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiTmFtZVNlcnZlcnNcIiwge1xuICAgICAgdmFsdWU6IGNkay5Gbi5qb2luKFwiLCBcIiwgdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVOYW1lU2VydmVycyA/PyBbXCJcIl0pLFxuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgIFwiU2V0IHRoZXNlIG5hbWUgc2VydmVycyBhdCB0aGUgZG9tYWluIHJlZ2lzdHJhciBiZWZvcmUgZGVwbG95aW5nIFN0YXRpY1NpdGVTdGFjay5cIixcbiAgICB9KTtcbiAgfVxufVxuIl19