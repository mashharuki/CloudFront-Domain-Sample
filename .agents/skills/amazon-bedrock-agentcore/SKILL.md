---
name: amazon-bedrock-agentcore
description: |
  Expert guide for designing, developing, testing, and deploying AI agent products using Amazon Bedrock AgentCore.
  Covers ALL AgentCore components (Runtime, Gateway/MCP, Memory, Identity, Browser, Code Interpreter,
  Observability, Evaluations, Policy, Registry, Payments) with CDK L2 constructs for IaC.

  ALWAYS invoke this skill when the user mentions any of the following:
  - "AgentCore", "bedrock-agentcore", "agent runtime", "MCP gateway", "agent memory"
  - Deploying an AI agent to AWS (serverless, containerized)
  - Converting APIs or Lambda functions to MCP tools
  - Agent identity / OAuth / credential management on AWS
  - Browser automation or code interpreter for AI agents
  - Evaluating agent quality (LLM-as-a-Judge, automated evals)
  - Cedar policy or governance for AI agents
  - Strands, LangGraph, CrewAI, LlamaIndex deployment to AWS
  - CDK infrastructure for AI agents (aws_bedrockagentcore, Runtime, Gateway constructs)
  - "エージェント", "MCP サーバー", "エージェント デプロイ" (Japanese equivalents)
---

# Amazon Bedrock AgentCore — Expert Skill

Amazon Bedrock AgentCore is a **framework-agnostic, model-agnostic** platform for building, deploying, and operating AI agents at scale. It works with any open-source framework (Strands, LangGraph, CrewAI, LlamaIndex, OpenAI Agents SDK, Google ADK) and any foundation model.

## Quick Decision: Which Component Do You Need?

| User Goal | AgentCore Component | Reference |
|-----------|-------------------|-----------|
| Deploy agent code serverlessly (any framework) | **Runtime** | [runtime.md](references/runtime.md) |
| Single-API agent loop (no container needed) | **Harness** | AWS docs |
| Expose REST API / Lambda as MCP tools | **Gateway** | [gateway.md](references/gateway.md) |
| Connect to existing MCP servers | **Gateway** (MCP target) | [gateway.md](references/gateway.md) |
| Multi-turn conversation memory | **Memory** | [memory.md](references/memory.md) |
| Agent auth with Okta/Cognito/Entra | **Identity** | [identity-policy.md](references/identity-policy.md) |
| Policy/governance for tool calls | **Policy (Cedar)** | [identity-policy.md](references/identity-policy.md) |
| Agent executes Python/JS code in sandbox | **Code Interpreter** | [tools.md](references/tools.md) |
| Agent navigates websites / fills forms | **Browser** | [tools.md](references/tools.md) |
| Trace, debug, monitor agent in prod | **Observability** | [observability-evals.md](references/observability-evals.md) |
| Measure agent quality (LLM-as-a-Judge) | **Evaluations** | [observability-evals.md](references/observability-evals.md) |
| IaC with AWS CDK | **CDK L2 constructs** | [cdk-patterns.md](references/cdk-patterns.md) |
| Strands / LangGraph / CrewAI integration | **Framework patterns** | [frameworks.md](references/frameworks.md) |

## Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                   Amazon Bedrock AgentCore                          │
│                                                                      │
│  ┌─────────┐  ┌─────────┐  ┌────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Runtime │  │ Gateway │  │ Memory │  │ Identity │  │  Policy │ │
│  │(deploy) │  │ (MCP)   │  │(state) │  │  (auth)  │  │ (Cedar) │ │
│  └─────────┘  └─────────┘  └────────┘  └──────────┘  └─────────┘ │
│                                                                      │
│  ┌──────────────┐  ┌─────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │Code Interpret│  │ Browser │  │Observability│  │ Evaluations │ │
│  │  (sandbox)   │  │ (web)   │  │  (OTEL)     │  │(LLM judge)  │ │
│  └──────────────┘  └─────────┘  └─────────────┘  └─────────────┘ │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐                          │
│  │ Registry │  │ Payments │  │ Harness │                          │
│  │(catalog) │  │  (x402)  │  │(managed)│                          │
│  └──────────┘  └──────────┘  └─────────┘                          │
└────────────────────────────────────────────────────────────────────┘
```

## Standard Workflow

When the user asks to build or deploy something with AgentCore, follow this sequence:

```
1. UNDERSTAND scope → Which components? Which framework?
2. DESIGN architecture → Read relevant reference files
3. IMPLEMENT → Agent code + CDK IaC (cdk-patterns.md)
4. TEST locally → Python/SDK invocation tests
5. DEPLOY → CDK deploy
6. VERIFY → Observability + Evaluations
```

## API Endpoints (Critical — Wrong Endpoint = Error)

| Plane | Client Name | Use For |
|-------|------------|---------|
| Control | `bedrock-agentcore-control` | Create/manage runtimes, gateways, memory, evaluations |
| Data | `bedrock-agentcore` | Invoke agent runtimes |
| Gateway Data | `{gatewayId}.gateway.bedrock-agentcore.{region}.amazonaws.com` | Call a specific gateway's MCP endpoint |

Refer to [AgentCore endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock_agentcore.html) for current endpoints.

## CDK Module (L2 Constructs)

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore'; // TypeScript
```
```python
from aws_cdk import aws_bedrockagentcore as agentcore  # Python
```

**Available in CDK ≥ 2.221.0** (alpha — breaking changes possible).

Key constructs: `Runtime`, `Gateway`, `Memory`, `BrowserCustom`, `CodeInterpreterCustom`, `OnlineEvaluation`, `WorkloadIdentity`

See [cdk-patterns.md](references/cdk-patterns.md) for complete IaC examples.

## Key Constraints (Always Apply)

- **ARM64 only for Runtime containers** — x86 images will not start
- **Protocol must be chosen before building container** (HTTP / MCP / A2A / AG-UI)
- **Endpoint required** — Runtime is not invocable until a Runtime Endpoint is created and READY
- **No secrets in environment variables** — use Secrets Manager
- **Production Runtimes must have authorizer** — never deploy unauthenticated
- **CDK alpha status** — `aws_bedrockagentcore` module may have breaking changes; pin CDK version

## Pricing (Consumption-based, No Upfront)

| Use Case | Estimated Cost |
|----------|---------------|
| Simple agent (low volume) | ~¥450/month |
| Customer support agent (high volume) | ~¥11,000/month |
| Exact rates | [AgentCore Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) |

## When to Read Reference Files

- Building/deploying agent → [runtime.md](references/runtime.md)
- Exposing APIs as MCP tools → [gateway.md](references/gateway.md)
- Adding memory to agent → [memory.md](references/memory.md)
- Auth / identity setup → [identity-policy.md](references/identity-policy.md)
- Browser / code sandbox → [tools.md](references/tools.md)
- Monitoring / evaluation → [observability-evals.md](references/observability-evals.md)
- Full CDK stacks → [cdk-patterns.md](references/cdk-patterns.md)
- Framework integration (Strands/LangGraph) → [frameworks.md](references/frameworks.md)
