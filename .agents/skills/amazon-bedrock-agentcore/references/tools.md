# AgentCore Tools — Browser & Code Interpreter

## Browser Tool

Cloud-based browser runtime that lets agents navigate websites, fill forms, extract data, and automate web interactions using Playwright or BrowserUse.

### CDK L2 Constructs

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';
import * as s3 from 'aws-cdk-lib/aws-s3';

// Basic browser
const browser = new agentcore.BrowserCustom(this, 'AgentBrowser', {
  browserCustomName: 'agent_browser',
  description: 'Web browser for AI agent automation',
});

// Browser with session recording
const recordingBucket = new s3.Bucket(this, 'BrowserRecordings');
const browserWithRecording = new agentcore.BrowserCustom(this, 'RecordedBrowser', {
  browserCustomName: 'recorded_browser',
  recordingConfig: {
    enabled: true,
    s3Location: {
      bucketName: recordingBucket.bucketName,
      objectKey: 'sessions/',
    },
  },
});

// Browser in VPC
import * as ec2 from 'aws-cdk-lib/aws-ec2';
const vpc = new ec2.Vpc(this, 'BrowserVpc', { maxAzs: 2 });
const privateBrowser = new agentcore.BrowserCustom(this, 'PrivateBrowser', {
  browserCustomName: 'private_browser',
  networkConfiguration: agentcore.BrowserNetworkConfiguration.usingVpc(this, { vpc }),
});

// Grant permissions
browser.grantRead(agentRole);
browser.grantUse(agentRole);
```

### Agent Code Integration

```python
from strands import Agent, tool
from strands.models.bedrock import BedrockModel
import boto3

bedrock_agentcore = boto3.client('bedrock-agentcore', region_name='ap-northeast-1')

@tool
def browse_web(url: str, action: str, selector: str = None) -> dict:
    """Navigate to URL and perform web action"""
    # Start browser session
    session = bedrock_agentcore.start_browser_session(
        browserId=BROWSER_ID,
    )
    session_id = session['sessionId']

    try:
        # Navigate and interact
        result = bedrock_agentcore.perform_browser_action(
            browserId=BROWSER_ID,
            sessionId=session_id,
            action={
                'type': action,  # 'navigate', 'click', 'type', 'extract'
                'url': url,
                'selector': selector,
            }
        )
        return result
    finally:
        bedrock_agentcore.stop_browser_session(
            browserId=BROWSER_ID,
            sessionId=session_id,
        )

agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    tools=[browse_web],
)
```

### CLI Operations

```bash
# Create browser
aws bedrock-agentcore-control create-browser \
  --browser-name "agent-browser" \
  --region ap-northeast-1

# Start session
aws bedrock-agentcore start-browser-session \
  --browser-id <BROWSER_ID> \
  --region ap-northeast-1

# Perform action
aws bedrock-agentcore perform-browser-action \
  --browser-id <BROWSER_ID> \
  --session-id <SESSION_ID> \
  --action '{"type": "navigate", "url": "https://app.slack.com"}' \
  --region ap-northeast-1

# Stop session
aws bedrock-agentcore stop-browser-session \
  --browser-id <BROWSER_ID> \
  --session-id <SESSION_ID> \
  --region ap-northeast-1
```

---

## Code Interpreter Tool

Isolated sandbox environment for agents to execute Python, JavaScript, and TypeScript code securely, enhancing accuracy for complex computational tasks.

### CDK L2 Constructs

```typescript
// Basic code interpreter
const codeInterpreter = new agentcore.CodeInterpreterCustom(this, 'CodeInterpreter', {
  codeInterpreterCustomName: 'agent_code_interpreter',
  description: 'Sandbox for Python/JS code execution',
});

// With sandbox network (no internet access — maximum isolation)
const sandboxInterpreter = new agentcore.CodeInterpreterCustom(this, 'SandboxInterpreter', {
  codeInterpreterCustomName: 'sandbox_interpreter',
  networkConfiguration: agentcore.CodeInterpreterNetworkConfiguration.usingSandboxNetwork(),
});

// With VPC (for accessing internal resources)
const vpcInterpreter = new agentcore.CodeInterpreterCustom(this, 'VpcInterpreter', {
  codeInterpreterCustomName: 'vpc_interpreter',
  networkConfiguration: agentcore.CodeInterpreterNetworkConfiguration.usingVpc(this, {
    vpc: new ec2.Vpc(this, 'InterpreterVpc'),
  }),
});

// Grant permissions
codeInterpreter.grantRead(agentRole);
codeInterpreter.grantUse(agentRole);
```

### Agent Code Integration

```python
from strands import Agent, tool
from strands.models.bedrock import BedrockModel
import boto3

bedrock_agentcore = boto3.client('bedrock-agentcore', region_name='ap-northeast-1')

@tool
def execute_python(code: str, files: list = None) -> dict:
    """Execute Python code in an isolated sandbox"""
    session = bedrock_agentcore.start_code_interpreter_session(
        codeInterpreterId=CODE_INTERPRETER_ID,
    )
    session_id = session['sessionId']

    try:
        result = bedrock_agentcore.execute_code_command(
            codeInterpreterId=CODE_INTERPRETER_ID,
            sessionId=session_id,
            code=code,
            language='python',
        )
        return {
            'output': result.get('output', ''),
            'error': result.get('error', None),
            'files': result.get('outputFiles', []),
        }
    finally:
        bedrock_agentcore.stop_code_interpreter_session(
            codeInterpreterId=CODE_INTERPRETER_ID,
            sessionId=session_id,
        )

agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    tools=[execute_python],
)
```

### Use Cases

| Use Case | Code | Notes |
|----------|------|-------|
| Data analysis | Python (pandas, numpy) | Perfect for CSV/Excel processing |
| Chart generation | Python (matplotlib, plotly) | Returns image files |
| JS/TS execution | JavaScript/TypeScript | For frontend testing or Node.js tasks |
| Math computation | Python | Reliable arithmetic without LLM hallucination |
| File transformation | Python | Format conversion, data cleaning |

### Network Configuration Choice

| Config | Internet Access | Use When |
|--------|----------------|---------|
| `usingSandboxNetwork()` | No | Maximum isolation, no external dependencies |
| `usingPublicNetwork()` | Yes | Need to call external APIs from code |
| `usingVpc()` | Internal only | Access private databases or services |

---

## Security Notes

- Both Browser and Code Interpreter run in isolated microVM environments per session
- Session data is not persisted after `stop` — each session starts clean
- Code Interpreter: default timeout is 30 minutes; session auto-terminates after idle
- Browser: Web Bot Auth signing (`BrowserSigning.ENABLED`) for authenticated web interactions
- Network: use `usingSandboxNetwork()` unless you explicitly need external access
