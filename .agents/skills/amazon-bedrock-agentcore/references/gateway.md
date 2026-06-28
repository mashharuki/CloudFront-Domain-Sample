# AgentCore Gateway — MCP Server Creation & CDK

## Overview

Gateway converts your APIs, Lambda functions, and existing services into **MCP-compatible tools** that AI agents can call. It also lets you proxy existing MCP servers with added auth/governance.

## Target Types

| Target Type | What It Wraps | CDK Method |
|-------------|--------------|-----------|
| **Lambda** | AWS Lambda function | `gateway.addLambdaTarget()` |
| **OpenAPI** | REST API via OpenAPI 3.x schema | `gateway.addOpenApiTarget()` |
| **Smithy** | REST API via Smithy model | `gateway.addSmithyTarget()` |
| **MCP Server** | Existing MCP server endpoint | `gateway.addMcpServerTarget()` |
| **API Gateway** | Existing API Gateway endpoint | Via OpenAPI or direct |

## Authentication Modes

| Mode | When to Use |
|------|------------|
| **Cognito M2M (default)** | Internal agents using machine-to-machine Cognito auth |
| **Custom JWT** | External IdPs with OIDC (Okta, Entra, Auth0) |
| **AWS IAM** | IAM-based access (Lambda roles, etc.) |
| **No Auth** | Development only — never production |

---

## CLI Workflow

### Step 1: Create Credential Provider (if API key or OAuth)

```bash
# API Key provider (service manages the secret internally)
export API_KEY="your-api-key"
aws bedrock-agentcore-control create-api-key-credential-provider \
  --name "my-api-credentials" \
  --api-key "$API_KEY" \
  --region ap-northeast-1
# Returns: credentialProviderArn, apiKeySecretArn (managed by service)

# OAuth2 provider (custom OIDC)
aws bedrock-agentcore-control create-oauth2-credential-provider \
  --name "my-oauth-credentials" \
  --credential-provider-vendor "CustomOIDC" \
  --oauth2-provider-config-input '{
    "customOidc": {
      "discoveryUrl": "https://idp.example.com/.well-known/openid-configuration",
      "clientId": "client-id",
      "clientSecret": "client-secret"
    }
  }' \
  --region ap-northeast-1
```

> **Important**: Credential provider MUST be created before gateway target.

### Step 2: Upload OpenAPI Schema to S3

```bash
aws s3api put-object \
  --bucket my-schemas-bucket \
  --key api-schema.yaml \
  --body ./openapi-schema.yaml
```

Schema requirements:
- Valid OpenAPI 3.0 or 3.1
- Clear `operationId` and `description` per operation (these become MCP tool names and descriptions)
- `description` quality directly impacts MCP tool usability

### Step 3: Create Gateway

```bash
aws bedrock-agentcore-control create-gateway \
  --name "my-gateway" \
  --protocol-type "MCP" \
  --authorizer-type "OAUTH2_M2M_COGNITO" \
  --region ap-northeast-1
```

### Step 4: Create Gateway Target

```bash
# Lambda target
aws bedrock-agentcore-control create-gateway-target \
  --gateway-identifier <GATEWAY_ID> \
  --name "my-tool" \
  --target-configuration '{
    "lambda": {
      "lambdaArn": "arn:aws:lambda:ap-northeast-1:<ACCOUNT>:function:my-function",
      "toolSchema": {
        "inlinePayload": [{"name": "my_tool", "description": "...", "inputSchema": {...}}]
      }
    }
  }' \
  --region ap-northeast-1

# OpenAPI target
aws bedrock-agentcore-control create-gateway-target \
  --gateway-identifier <GATEWAY_ID> \
  --name "my-api-tools" \
  --target-configuration '{
    "openApiSchema": {
      "s3": {"bucketName": "my-schemas-bucket", "objectKey": "api-schema.yaml"}
    }
  }' \
  --credential-provider-configurations '[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]' \
  --region ap-northeast-1
```

### Step 5: Get MCP Endpoint URL

```bash
aws bedrock-agentcore-control get-gateway \
  --gateway-identifier <GATEWAY_ID> \
  --region ap-northeast-1
# Returns: gatewayUrl = https://<gatewayId>.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com
```

---

## CDK L2 Constructs

### Minimal Gateway (Cognito M2M default)

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';

const gateway = new agentcore.Gateway(this, 'MyGateway', {
  gatewayName: 'my-gateway',
  protocolConfiguration: new agentcore.McpProtocolConfiguration({
    instructions: 'Use this gateway to access SABOROU task management tools',
    searchType: agentcore.McpGatewaySearchType.SEMANTIC,
    supportedVersions: [agentcore.MCPProtocolVersion.MCP_2025_03_26],
  }),
});

// Auto-created Cognito resources
const userPool = gateway.userPool;
const tokenEndpoint = gateway.tokenEndpointUrl;
const scopes = gateway.oauthScopes;
```

### Gateway with Lambda Target (inline tool schema)

```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';

const myFunction = new lambda.Function(this, 'MyToolFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'handler.main',
  code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
});

const gateway = new agentcore.Gateway(this, 'MyGateway', {
  gatewayName: 'my-gateway',
});

gateway.addLambdaTarget('TaskTool', {
  lambda: myFunction,
  toolSchema: agentcore.ToolSchema.fromInline([
    {
      name: 'get_tasks',
      description: 'Retrieve the current task list for the authenticated user',
      inputSchema: {
        type: agentcore.SchemaDefinitionType.OBJECT,
        properties: {
          status: {
            type: agentcore.SchemaDefinitionType.STRING,
            description: 'Filter by status: active, completed, or all',
          },
        },
        required: [],
      },
    },
    {
      name: 'judge_sabori',
      description: 'Judge whether a task can be deferred (sabori) based on context',
      inputSchema: {
        type: agentcore.SchemaDefinitionType.OBJECT,
        properties: {
          task_id: { type: agentcore.SchemaDefinitionType.STRING, description: 'Task ID' },
          context: { type: agentcore.SchemaDefinitionType.STRING, description: 'Slack message context' },
        },
        required: ['task_id', 'context'],
      },
    },
  ]),
});
```

### Gateway with OpenAPI Target (REST API)

```typescript
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

const schemaBucket = new s3.Bucket(this, 'SchemaBucket');

// Deploy schema to S3
new s3deploy.BucketDeployment(this, 'DeploySchema', {
  sources: [s3deploy.Source.asset(path.join(__dirname, '../schemas'))],
  destinationBucket: schemaBucket,
});

const gateway = new agentcore.Gateway(this, 'ApiGateway', {
  gatewayName: 'api-gateway',
  authorizerConfiguration: agentcore.GatewayAuthorizer.usingCustomJwt({
    discoveryUrl: 'https://cognito-idp.ap-northeast-1.amazonaws.com/<USER_POOL_ID>/.well-known/openid-configuration',
    allowedClients: ['my-client-id'],
    allowedAudiences: ['my-audience'],
    allowedScopes: ['read', 'write'],
  }),
});

gateway.addOpenApiTarget('HonoApiTools', {
  apiSchema: agentcore.ApiSchema.fromS3File(schemaBucket, 'hono-api-schema.yaml'),
  credentialProviderConfigurations: [
    agentcore.GatewayCredentialProvider.fromApiKeyIdentity(apiKeyProvider),
  ],
});
```

### Gateway with Existing MCP Server

```typescript
// Connect to an existing MCP server (e.g., GitHub, Slack, JIRA)
const githubOAuth = agentcore.OAuth2CredentialProvider.usingGithub(this, 'GithubOAuth', {
  oAuth2CredentialProviderName: 'github-oauth',
  clientId: 'your-github-client-id',
  clientSecret: cdk.SecretValue.secretsManager('github/client-secret'),
});

gateway.addMcpServerTarget('GithubMcp', {
  gatewayTargetName: 'github-tools',
  description: 'GitHub integration tools',
  endpoint: 'https://github-mcp.example.com',
  credentialProviderConfigurations: [
    agentcore.GatewayCredentialProvider.fromOauthIdentity(githubOAuth, {
      scopes: ['repo', 'read:user'],
    }),
  ],
});
```

### Gateway with IAM Auth + Lambda Invoker

```typescript
const gateway = new agentcore.Gateway(this, 'IamGateway', {
  gatewayName: 'iam-gateway',
  authorizerConfiguration: agentcore.GatewayAuthorizer.usingAwsIam(),
});

// Grant Lambda permission to invoke the gateway
const invokerLambda = new lambda.Function(this, 'Invoker', { /* ... */ });
gateway.grantInvoke(invokerLambda);
```

### Gateway with KMS Encryption

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';

const encryptionKey = new kms.Key(this, 'GatewayKey', {
  enableKeyRotation: true,
  description: 'AgentCore Gateway encryption key',
});

const gateway = new agentcore.Gateway(this, 'EncryptedGateway', {
  gatewayName: 'encrypted-gateway',
  kmsKey: encryptionKey,
  exceptionLevel: agentcore.GatewayExceptionLevel.DEBUG,  // Use INFO in prod
});
```

---

## Calling Gateway from Agent Code

```python
# In your agent code, configure MCP client to use Gateway endpoint
import httpx
from mcp import ClientSession, StompTransport

gateway_url = "https://<GATEWAY_ID>.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com/mcp"

async def call_gateway_tool(tool_name: str, args: dict, jwt_token: str):
    headers = {"Authorization": f"Bearer {jwt_token}"}
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{gateway_url}/tools/{tool_name}",
            json=args,
            headers=headers,
        )
        return response.json()
```

```typescript
// From ElevenLabs Conversational AI SDK
import { useConversation } from "@11labs/client";

const conversation = useConversation({
  agentId: process.env.ELEVENLABS_AGENT_ID!,
  clientTools: {
    mcp: {
      serverUrl: `https://${GATEWAY_ID}.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com/mcp`,
      authToken: cognitoJwt,
    },
  },
});
```

---

## Security

| Concern | Guidance |
|---------|---------|
| API keys | Created via `create-api-key-credential-provider` — stored in Secrets Manager by service. Never manage separately. |
| Production auth | Always use Cognito, JWT, or IAM — never `GatewayAuthorizer.withNoAuth()` in prod |
| Schema in S3 | Enable SSE-KMS on schema bucket for sensitive OpenAPI specs |
| IAM scope | Gateway execution role: only `execute-api:Invoke` on the specific API Gateway ARN |
| Logging | CloudTrail for all `bedrock-agentcore-control` calls |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `CredentialProviderNotFound` | Target created before credential provider | Create credential provider first, then target |
| Gateway status `FAILED` | Schema invalid or IAM permissions wrong | Validate OpenAPI schema; check CloudTrail |
| MCP tools not matching schema | Poor `operationId`/`description` in schema | Improve schema descriptions — these become tool names |
| Auth 401 on gateway call | JWT expired or wrong audience | Check `allowedAudiences` and `allowedClients` in authorizer config |
