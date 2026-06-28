# AgentCore CDK Patterns — Complete IaC Examples

## Module Setup

```bash
# CDK >= 2.221.0 required for aws_bedrockagentcore L2 constructs
npm install aws-cdk-lib@^2.221.0

# TypeScript imports
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
```

> **Alpha Warning**: `aws_bedrockagentcore` carries alpha status — breaking changes possible. Pin CDK version in `package.json`.

---

## Pattern 1: Minimal Agent (Quick Start)

Local Dockerfile → ECR → Runtime in 1 stack:

```typescript
export class MinimalAgentStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runtime = new agentcore.Runtime(this, 'Agent', {
      runtimeName: 'my-agent',
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromAsset(
        path.join(__dirname, '../agent')  // Directory with Dockerfile
      ),
    });

    // Output the runtime ARN for use by other services
    new cdk.CfnOutput(this, 'RuntimeArn', { value: runtime.runtimeArn });
  }
}
```

---

## Pattern 2: Production Runtime Stack

VPC + Cognito Auth + CloudWatch + KMS:

```typescript
export class ProductionRuntimeStack extends cdk.Stack {
  public readonly runtime: agentcore.Runtime;
  public readonly userPool: cognito.UserPool;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // KMS key for log encryption
    const logKey = new kms.Key(this, 'LogKey', {
      enableKeyRotation: true,
      description: 'AgentCore log encryption key',
    });

    // VPC with private subnets
    const vpc = new ec2.Vpc(this, 'AgentVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });

    // VPC endpoints (required for private network)
    vpc.addInterfaceEndpoint('EcrDockerEp', { service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER });
    vpc.addInterfaceEndpoint('EcrApiEp', { service: ec2.InterfaceVpcEndpointAwsService.ECR });
    vpc.addGatewayEndpoint('S3Ep', { service: ec2.GatewayVpcEndpointAwsService.S3 });
    vpc.addInterfaceEndpoint('LogsEp', { service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS });
    vpc.addInterfaceEndpoint('BedrockEp', { service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME });
    vpc.addInterfaceEndpoint('SecretsEp', { service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER });

    // Cognito User Pool for M2M auth
    this.userPool = new cognito.UserPool(this, 'AgentUserPool', {
      userPoolName: 'agent-users',
      selfSignUpEnabled: false,
    });
    const userPoolClient = this.userPool.addClient('AgentClient', {
      generateSecret: true,
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [cognito.OAuthScope.custom('agent/invoke')],
      },
    });

    // Application log group
    const logGroup = new logs.LogGroup(this, 'AgentLogs', {
      logGroupName: '/aws/bedrock-agentcore/my-agent',
      retention: logs.RetentionDays.ONE_MONTH,
      encryptionKey: logKey,
    });

    // ECR repository
    const repo = new ecr.Repository(this, 'AgentRepo', {
      repositoryName: 'my-agent',
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Runtime
    this.runtime = new agentcore.Runtime(this, 'AgentRuntime', {
      runtimeName: 'my-agent',
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromEcrRepository(repo, 'latest'),
      networkConfiguration: agentcore.RuntimeNetworkConfiguration.usingVpc(this, {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      }),
      authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
        this.userPool,
        [userPoolClient],
        ['my-audience'],
        ['agent/invoke'],
      ),
      environmentVariables: {
        BEDROCK_MODEL_ID: 'jp.anthropic.claude-sonnet-4-6',
        MEMORY_ID: 'placeholder',  // Set after memory stack deploys
        LOG_LEVEL: 'INFO',
      },
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: cdk.Duration.minutes(15),
        maxLifetime: cdk.Duration.hours(8),
      },
      tracingEnabled: true,
      loggingConfigs: [
        {
          logType: agentcore.LogType.APPLICATION_LOGS,
          destination: agentcore.LoggingDestination.cloudWatchLogs(logGroup),
        },
      ],
    });

    // CloudWatch alarm
    this.runtime.metricSystemErrors().createAlarm(this, 'ErrorAlarm', {
      threshold: 10,
      evaluationPeriods: 2,
    });

    // Outputs
    new cdk.CfnOutput(this, 'RuntimeId', { value: this.runtime.runtimeId });
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}
```

---

## Pattern 3: Gateway + Lambda Tools Stack

```typescript
export class GatewayToolsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Tool Lambda function
    const toolFn = new lambda.Function(this, 'ToolFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: 'tools.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../tools')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE: 'saborou-tasks',
      },
    });

    // Grant DynamoDB access to tool Lambda
    toolFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      resources: ['arn:aws:dynamodb:ap-northeast-1:*:table/saborou-tasks'],
    }));

    // Gateway
    const gateway = new agentcore.Gateway(this, 'ToolGateway', {
      gatewayName: 'saborou-tools',
      protocolConfiguration: new agentcore.McpProtocolConfiguration({
        instructions: 'SABOROU task management and Slack integration tools',
        searchType: agentcore.McpGatewaySearchType.SEMANTIC,
        supportedVersions: [agentcore.MCPProtocolVersion.MCP_2025_03_26],
      }),
    });

    // Add Lambda target with tool schema
    gateway.addLambdaTarget('SaborouTools', {
      lambda: toolFn,
      toolSchema: agentcore.ToolSchema.fromInline([
        {
          name: 'get_active_tasks',
          description: 'Get all active tasks for the current user including Slack message context',
          inputSchema: {
            type: agentcore.SchemaDefinitionType.OBJECT,
            properties: {},
            required: [],
          },
        },
        {
          name: 'judge_sabori',
          description: 'Judge if a task can be deferred (saboro). Returns: can_saboru, borderline, or must_do with reasoning',
          inputSchema: {
            type: agentcore.SchemaDefinitionType.OBJECT,
            properties: {
              task_id: {
                type: agentcore.SchemaDefinitionType.STRING,
                description: 'The task ID to evaluate',
              },
              slack_context: {
                type: agentcore.SchemaDefinitionType.STRING,
                description: 'The Slack message content for context',
              },
            },
            required: ['task_id', 'slack_context'],
          },
        },
        {
          name: 'send_slack_reply',
          description: 'Send a pre-approved reply to a Slack message thread',
          inputSchema: {
            type: agentcore.SchemaDefinitionType.OBJECT,
            properties: {
              channel: { type: agentcore.SchemaDefinitionType.STRING, description: 'Slack channel ID' },
              thread_ts: { type: agentcore.SchemaDefinitionType.STRING, description: 'Thread timestamp' },
              text: { type: agentcore.SchemaDefinitionType.STRING, description: 'Reply text (approved by human)' },
            },
            required: ['channel', 'thread_ts', 'text'],
          },
        },
      ]),
    });

    // Outputs
    new cdk.CfnOutput(this, 'GatewayUrl', {
      value: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com`,
    });
    new cdk.CfnOutput(this, 'GatewayId', { value: gateway.gatewayId });
  }
}
```

---

## Pattern 4: Memory + Evaluations Stack

```typescript
export class MemoryEvalStack extends cdk.Stack {
  public readonly memory: agentcore.Memory;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Long-term memory with built-in extraction
    this.memory = new agentcore.Memory(this, 'AgentMemory', {
      memoryName: 'saborou-memory',
      description: 'Stores user sabori patterns and preferences',
      ltmExtractionStrategies: [
        agentcore.LTMExtractionStrategy.builtinExtractorProvider(),
      ],
    });

    // Quality evaluation
    const evaluation = new agentcore.OnlineEvaluation(this, 'QualityEval', {
      evaluationName: 'saborou-quality',
      description: 'Evaluates sabori proposal quality and Japanese naturalness',
      evaluators: [
        agentcore.Evaluator.llmAsAJudge({
          foundationModelArn: 'arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-4-6',
          evaluationInstructions: `
            Evaluate the SABOROU agent response on:
            1. Appropriateness (1-5): Is the sabori decision reasonable?
            2. Japanese Naturalness (1-5): Does the reply draft sound natural?
            3. Safety (1-5): Is it safe to send this to Slack?
            Return JSON: {"appropriateness": N, "naturalness": N, "safety": N, "reasoning": "..."}
          `,
        }),
      ],
    });

    new cdk.CfnOutput(this, 'MemoryId', { value: this.memory.memoryId });
    new cdk.CfnOutput(this, 'EvaluationId', { value: evaluation.evaluationId });
  }
}
```

---

## Pattern 5: Complete SABOROU v2 Stack

Multi-stack deployment with cross-stack references:

```typescript
// bin/app.ts
const app = new cdk.App();
const env = { account: process.env.CDK_ACCOUNT, region: 'ap-northeast-1' };

// Deploy in order: memory → gateway → runtime
const memoryStack = new MemoryEvalStack(app, 'SaborouMemory', { env });
const gatewayStack = new GatewayToolsStack(app, 'SaborouGateway', { env });
const runtimeStack = new ProductionRuntimeStack(app, 'SaborouRuntime', {
  env,
  memoryId: memoryStack.memory.memoryId,
  gatewayUrl: gatewayStack.gatewayUrl,
});
```

---

## Deployment Commands

```bash
# Install CDK
npm install -g aws-cdk

# Bootstrap (once per account/region)
cdk bootstrap aws://<ACCOUNT>/ap-northeast-1

# Deploy all stacks
cdk deploy --all --require-approval never

# Deploy specific stack
cdk deploy SaborouRuntime

# Diff before deploy
cdk diff SaborouRuntime

# Destroy (careful!)
cdk destroy --all
```

## Common CDK Gotchas

| Issue | Fix |
|-------|-----|
| `iam:CreateServiceLinkedRole` error | Deployment role needs this permission for AgentCore SLRs |
| ARM64 build fails on M1/M2 Mac | Use `docker buildx build --platform linux/arm64` |
| Gateway URL not available at synth time | Use `cdk.CfnOutput` and reference after deploy |
| Alpha breaking changes | Pin CDK: `"aws-cdk-lib": "2.221.0"` in package.json |
| ECR image not yet pushed when CDK deploys | Use `fromAsset()` for CDK to build & push, or pre-push before CDK deploy |
