# AgentCore Runtime — Design, Implementation & CDK

## Table of Contents
- Protocol Selection
- Container Contract
- Agent Code Patterns
- Deployment (CLI)
- CDK L2 Constructs
- Lifecycle & Scaling
- Security

---

## Protocol Selection

Choose protocol BEFORE writing code — it determines the container's HTTP contract.

| Protocol | Health Endpoint | Invoke Path | Best For |
|----------|----------------|------------|---------|
| **HTTP** | `/health` → 200 | POST `/invocations` | Existing web frameworks (FastAPI, Flask, Express) |
| **MCP** | `/health` → 200 | `/mcp` (Streamable HTTP) | Agent exposing capabilities as MCP tools |
| **A2A** | `/.well-known/agent.json` | Agent task endpoints | Multi-agent direct communication |
| **AG-UI** | `/ping` → 200 | `/invocations` (SSE) | Frontend chat with real-time streaming |

**Decision guide:**
- REST request-response → **HTTP**
- Agent IS the tool server → **MCP**
- Agents talk to each other → **A2A**
- Chat UI with streaming → **AG-UI**
- Unsure → start with **HTTP**

---

## Container Contract

Requirements for ALL protocols:

| Requirement | Detail |
|-------------|--------|
| **Architecture** | **ARM64 (Graviton)** — x86 WILL NOT START |
| **Port** | 8080 (default, configurable) |
| **Health check** | Protocol-specific (see table above) |
| **Startup** | Must reach ready state within timeout |
| **Logging** | stdout/stderr → CloudWatch automatically |
| **Shutdown** | Handle SIGTERM gracefully |
| **Provided env vars** | `RUNTIME_ID`, `AWS_REGION`, AWS credentials |

### Dockerfile (ARM64 — Python + Strands)

```dockerfile
FROM --platform=linux/arm64 python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8080

CMD ["python", "main.py"]
```

Build for ARM64 from x86 machine:
```bash
docker buildx build --platform linux/arm64 -t my-agent:latest .
```

---

## Agent Code Patterns

### Pattern 1: bedrock-agentcore SDK (HTTP protocol, Strands)

```python
# main.py
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models.bedrock import BedrockModel

app = BedrockAgentCoreApp()

agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    system_prompt="You are a helpful assistant.",
)

@app.entrypoint
def invoke(payload: dict) -> dict:
    result = agent(payload.get("prompt", ""))
    return {"result": str(result)}

if __name__ == "__main__":
    app.run()
```

### Pattern 2: FastAPI (HTTP protocol, any framework)

```python
# main.py
from fastapi import FastAPI
import uvicorn
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app_core = BedrockAgentCoreApp()
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/invocations")
async def invoke(payload: dict):
    # Your agent logic here
    return {"result": "..."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

### Pattern 3: Starter Toolkit (CLI-based quickstart)

```bash
pip install bedrock-agentcore bedrock-agentcore-starter-toolkit strands-agents

# Configure and deploy in one step:
agentcore configure -e my_agent.py
agentcore launch

# Invoke:
agentcore invoke '{"prompt": "Hello!"}'
```

### Session Management (multi-turn)

```python
@app.entrypoint
def invoke(payload: dict, context) -> dict:
    session_id = context.session_id  # Persists across turns
    # Retrieve session state from AgentCore Memory using session_id
    # ... agent logic ...
    return {"result": "..."}
```

---

## Deployment (CLI)

```bash
# 1. Push to ECR
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.ap-northeast-1.amazonaws.com
docker tag my-agent:latest <ACCOUNT>.dkr.ecr.ap-northeast-1.amazonaws.com/my-agent:latest
docker push <ACCOUNT>.dkr.ecr.ap-northeast-1.amazonaws.com/my-agent:latest

# 2. Create Runtime
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name "my-agent" \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<ECR_URI>"}}' \
  --role-arn "arn:aws:iam::<ACCOUNT>:role/AgentCoreRuntime" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --protocol-configuration '{"serverProtocol":"HTTP"}' \
  --region ap-northeast-1

# 3. Create Endpoint
aws bedrock-agentcore-control create-agent-runtime-endpoint \
  --agent-runtime-id <RUNTIME_ID> \
  --name "production" \
  --region ap-northeast-1

# 4. Wait for READY
aws bedrock-agentcore-control get-agent-runtime-endpoint \
  --agent-runtime-id <RUNTIME_ID> \
  --endpoint-id <ENDPOINT_ID>

# 5. Invoke
aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-endpoint-arn <ENDPOINT_ARN> \
  --payload '{"prompt":"Hello!"}' \
  --region ap-northeast-1
```

---

## CDK L2 Constructs

### Minimal Runtime (local asset → ECR)

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';
import * as path from 'path';

const runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  runtimeName: 'my-agent',
  agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromAsset(
    path.join(__dirname, '../agent')  // directory with Dockerfile
  ),
});

// Runtime automatically creates a DEFAULT endpoint
// Access: runtime.runtimeId, runtime.runtimeArn
```

### Runtime with VPC + Cognito Auth

```typescript
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';

const vpc = new ec2.Vpc(this, 'AgentVpc', { maxAzs: 2 });
const userPool = new cognito.UserPool(this, 'AgentUserPool');
const userPoolClient = userPool.addClient('AgentClient');

const runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  runtimeName: 'my-agent',
  agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromAsset(
    path.join(__dirname, '../agent')
  ),
  networkConfiguration: agentcore.RuntimeNetworkConfiguration.usingVpc(this, {
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  }),
  authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
    userPool,
    [userPoolClient],
    ["audience1"],
    ["read", "write"],
  ),
  environmentVariables: {
    BEDROCK_MODEL_ID: 'jp.anthropic.claude-sonnet-4-6',
    LOG_LEVEL: 'INFO',
  },
  lifecycleConfiguration: {
    idleRuntimeSessionTimeout: cdk.Duration.minutes(10),
    maxLifetime: cdk.Duration.hours(4),
  },
  tracingEnabled: true,
});

// Grant invoker (e.g., Lambda) permission
runtime.grantInvokeRuntime(invokerLambda);
```

### Runtime from ECR (pre-built image)

```typescript
import * as ecr from 'aws-cdk-lib/aws-ecr';

const repo = ecr.Repository.fromRepositoryName(this, 'AgentRepo', 'my-agent-repo');

const runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  runtimeName: 'my-agent',
  agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromEcrRepository(repo, 'v1.0.0'),
});
```

### Runtime from S3 (ZIP code, no Docker)

```typescript
import * as s3 from 'aws-cdk-lib/aws-s3';

const codeBucket = new s3.Bucket(this, 'AgentCode');

const runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  runtimeName: 'my-agent',
  agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromS3({
    bucketName: codeBucket.bucketName,
    objectKey: 'deployment_package.zip',
  }, agentcore.AgentCoreRuntime.PYTHON_3_12, ['opentelemetry-instrument', 'main.py']),
});
```

### Adding Versioned Endpoints

```typescript
const prodEndpoint = runtime.addEndpoint('production', {
  version: '1',
  description: 'Stable production endpoint',
});

const devEndpoint = runtime.addEndpoint('development', {
  version: '2',  // Points to latest
  description: 'Development endpoint',
});
```

### Logging

```typescript
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';

const logGroup = new logs.LogGroup(this, 'AgentLogs', {
  retention: logs.RetentionDays.ONE_MONTH,
  encryptionKey: kmsKey,  // Required for PII workloads
});

const runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  // ...
  tracingEnabled: true,
  loggingConfigs: [
    {
      logType: agentcore.LogType.APPLICATION_LOGS,
      destination: agentcore.LoggingDestination.cloudWatchLogs(logGroup),
    },
  ],
});

// Create metric filter on runtime's applicationLogGroup
new logs.MetricFilter(this, 'ToolErrors', {
  logGroup: runtime.applicationLogGroup,
  filterPattern: logs.FilterPattern.stringValue('$.tool_status', '=', 'error'),
  metricNamespace: 'AgentMetrics',
  metricName: 'ToolExecutionErrors',
});
```

---

## Lifecycle & Scaling

- Auto-scaling based on invocation count and latency
- Cold start on first request to new instance — use Provisioned Concurrency for latency-sensitive workloads
- Session isolation: each session runs in a separate microVM
- Configure `idleRuntimeSessionTimeout` and `maxLifetime` in `lifecycleConfiguration`

---

## Security

| Concern | Solution |
|---------|---------|
| Secrets | Secrets Manager — NEVER in environment variables |
| Network | VPC mode for production — PUBLIC mode only for dev/test |
| Auth | Always configure `authorizerConfiguration` (Cognito / JWT / OAuth) |
| IAM | Least-privilege execution role per agent, with `aws:SourceArn` condition |
| Logs | KMS-encrypt CloudWatch log groups for PII workloads |
| Images | Scan ECR images (ECR Enhanced Scanning) before deployment |

### VPC Endpoints Required for Private Network

```typescript
// Required VPC endpoints when using VPC network mode
vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
  service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
});
vpc.addInterfaceEndpoint('EcrApiEndpoint', {
  service: ec2.InterfaceVpcEndpointAwsService.ECR,
});
vpc.addGatewayEndpoint('S3Endpoint', {
  service: ec2.GatewayVpcEndpointAwsService.S3,
});
vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
  service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
});
// Recommended
vpc.addInterfaceEndpoint('BedrockRuntimeEndpoint', {
  service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
});
vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
  service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
});
```
