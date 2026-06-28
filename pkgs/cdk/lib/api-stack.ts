import * as path from "node:path";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cdk from "aws-cdk-lib/core";
import type { Construct } from "constructs";

export class ApiStack extends cdk.Stack {
  public readonly api: apigwv2.HttpApi;
  public readonly table: dynamodb.Table;
  public readonly handler: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "TodoTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.handler = new nodejs.NodejsFunction(this, "TodoApiHandler", {
      entry: path.join(process.cwd(), "../backend/src/lambda.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, "TodoApiHandlerLogGroup", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        mainFields: ["module", "main"],
        target: "node20",
      },
      environment: {
        TODO_TABLE_NAME: this.table.tableName,
      },
    });
    this.table.grantReadWriteData(this.handler);

    this.api = new apigwv2.HttpApi(this, "TodoHttpApi", {
      apiName: "todo-api",
      createDefaultStage: true,
      defaultIntegration: new integrations.HttpLambdaIntegration(
        "TodoApiIntegration",
        this.handler,
      ),
    });

    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: this.api.apiEndpoint,
    });
  }
}
