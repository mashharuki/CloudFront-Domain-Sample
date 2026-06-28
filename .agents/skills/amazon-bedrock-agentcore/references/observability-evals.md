# AgentCore Observability & Evaluations

## Observability

Unified view to trace, debug, and monitor agent execution using OpenTelemetry (OTEL). Integrates with CloudWatch, Grafana, Datadog, Dynatrace.

### What It Traces

- Each step in the agent workflow (LLM calls, tool calls, memory operations)
- Input/output at each step
- Latency per step and end-to-end
- Error rates and failure types
- Token usage per invocation

### Agent Code: Adding OTEL Tracing

```python
# requirements.txt additions:
# opentelemetry-api
# opentelemetry-sdk
# opentelemetry-exporter-otlp-proto-grpc
# strands-agents[otel]  # if using Strands

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

# Configure OTEL (AgentCore auto-injects trace context)
resource = Resource(attributes={"service.name": "saborou-agent"})
provider = TracerProvider(resource=resource)
exporter = OTLPSpanExporter(
    endpoint="https://xray.ap-northeast-1.amazonaws.com",  # CloudWatch via OTEL
)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer(__name__)

@app.entrypoint
def invoke(payload: dict) -> dict:
    with tracer.start_as_current_span("agent_invocation") as span:
        span.set_attribute("user.message", payload.get("prompt", ""))
        result = agent(payload.get("prompt", ""))
        span.set_attribute("agent.response", str(result))
        return {"result": str(result)}
```

### Strands with Built-in OTEL

```python
from strands import Agent
from strands.models.bedrock import BedrockModel
from strands.telemetry import setup_telemetry

# Strands has first-class OTEL support
setup_telemetry(
    otlp_endpoint="https://xray.ap-northeast-1.amazonaws.com",
    service_name="saborou-agent",
)

agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    trace_attributes={"environment": "production"},
)
```

### CDK: Runtime with Tracing

```typescript
import * as logs from 'aws-cdk-lib/aws-logs';
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';

const logGroup = new logs.LogGroup(this, 'AgentLogs', {
  retention: logs.RetentionDays.ONE_MONTH,
  encryptionKey: kmsKey,
});

const runtime = new agentcore.Runtime(this, 'Runtime', {
  agentRuntimeArtifact: artifact,
  tracingEnabled: true,  // Enable X-Ray and OTEL tracing
  loggingConfigs: [
    {
      logType: agentcore.LogType.APPLICATION_LOGS,
      destination: agentcore.LoggingDestination.cloudWatchLogs(logGroup),
    },
  ],
});

// Create CloudWatch alarm on error rate
runtime.metricSystemErrors().createAlarm(this, 'AgentErrorAlarm', {
  threshold: 5,
  evaluationPeriods: 2,
  alarmDescription: 'Agent system errors exceeded threshold',
});

// Metric filter for tool-level errors
new logs.MetricFilter(this, 'ToolErrorFilter', {
  logGroup: runtime.applicationLogGroup,
  filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'ERROR'),
  metricNamespace: 'SaborouAgentMetrics',
  metricName: 'ToolErrors',
  metricValue: '1',
});
```

### CloudWatch Queries

```
# Find slow agent invocations (>5s)
fields @timestamp, @message, duration_ms
| filter agent_runtime_id = "your-runtime-id"
| filter duration_ms > 5000
| sort @timestamp desc

# Tool call error rate
fields @timestamp, tool_name, tool_status
| filter tool_status = "error"
| stats count() as error_count by tool_name
| sort error_count desc
```

---

## Evaluations

Automated, consistent, data-driven agent assessment using LLM-as-a-Judge or custom code-based evaluators.

### Evaluation Methods

| Method | When to Use |
|--------|------------|
| **LLM-as-a-Judge** | Subjective quality (helpfulness, accuracy, tone) |
| **Code-based** | Objective criteria (format, regex match, API response codes) |
| **Online (continuous)** | Real production traffic, ongoing quality monitoring |
| **Offline (batch)** | Pre-deployment testing on curated test sets |

### CDK: Online Evaluation

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';

// LLM-as-a-Judge evaluator
const evaluation = new agentcore.OnlineEvaluation(this, 'AgentEvaluation', {
  evaluationName: 'saborou-quality-eval',
  description: 'Evaluates quality of SABOROU sabori proposals',
  evaluators: [
    agentcore.Evaluator.llmAsAJudge({
      foundationModelArn: 'arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-4-6',
      evaluationInstructions: `
        Evaluate the agent's sabori proposal on these dimensions:
        1. Appropriateness: Is the proposal reasonable given the Slack context?
        2. Clarity: Is the reply draft clear and natural in Japanese?
        3. Safety: Does it avoid sending inappropriate messages?
        Score each 1-5 and provide brief reasoning.
      `,
    }),
  ],
});

// Code-based evaluator (Lambda)
const evaluatorFn = new lambda.Function(this, 'EvaluatorFn', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'evaluator.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../evaluator')),
});

const codeEval = new agentcore.OnlineEvaluation(this, 'CodeEvaluation', {
  evaluationName: 'format-checker',
  evaluators: [
    agentcore.Evaluator.codeBased({
      evaluatorLambda: evaluatorFn,
      evaluatorName: 'json-format-checker',
    }),
  ],
});
```

### Code-based Evaluator Lambda

```python
# evaluator/evaluator.py
import json
import re

def handler(event, context):
    """Evaluate agent output for format and safety"""
    agent_output = event.get('agentOutput', '')
    expected_format = event.get('expectedFormat', {})

    results = []

    # Check 1: Response is valid JSON if expected
    if expected_format.get('json'):
        try:
            json.loads(agent_output)
            results.append({'criterion': 'valid_json', 'passed': True})
        except json.JSONDecodeError:
            results.append({'criterion': 'valid_json', 'passed': False, 'reason': 'Not valid JSON'})

    # Check 2: Japanese language check
    japanese_pattern = re.compile(r'[぀-ゟ゠-ヿ一-龯]')
    has_japanese = bool(japanese_pattern.search(agent_output))
    results.append({'criterion': 'japanese_response', 'passed': has_japanese})

    # Check 3: Not too long (for voice readability)
    results.append({
        'criterion': 'voice_length',
        'passed': len(agent_output) <= 200,
        'value': len(agent_output),
    })

    return {
        'evaluationResults': results,
        'overall_passed': all(r['passed'] for r in results),
    }
```

### CLI: Running Offline Evaluations

```bash
# Create evaluation job
aws bedrock-agentcore-control create-evaluation-job \
  --evaluation-name "pre-deploy-eval" \
  --agent-runtime-id <RUNTIME_ID> \
  --test-cases '[
    {
      "input": {"prompt": "田中さんからSlackでメッセージが来ました。今日対応すべきですか？"},
      "expectedOutput": {"should_defer": true, "reply_draft": "..."}
    }
  ]' \
  --evaluators '[{"type": "LLM_AS_JUDGE", "modelArn": "..."}]' \
  --region ap-northeast-1

# Get evaluation results
aws bedrock-agentcore-control get-evaluation-job \
  --evaluation-job-id <JOB_ID> \
  --region ap-northeast-1
```

### Interpreting Results

| Score | Meaning | Action |
|-------|---------|--------|
| 4.5-5.0 | Excellent | Deploy to production |
| 3.5-4.4 | Good | Deploy with monitoring |
| 2.5-3.4 | Acceptable | Review weak areas before deploying |
| < 2.5 | Poor | Revise agent or prompts |

---

## Observability Integration with External Tools

### Grafana

```python
# Send OTEL traces to Grafana Cloud
exporter = OTLPSpanExporter(
    endpoint="https://tempo-<REGION>.grafana.net/tempo",
    headers={"Authorization": f"Basic {GRAFANA_API_KEY}"},
)
```

### Datadog

```python
# Send to Datadog
exporter = OTLPSpanExporter(
    endpoint="https://trace.agent.datadoghq.com",
    headers={"DD-API-KEY": os.environ["DATADOG_API_KEY"]},
)
```

See `agentcore-samples/integrations/observability/` for full working examples.
