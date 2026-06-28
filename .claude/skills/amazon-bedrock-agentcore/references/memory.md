# AgentCore Memory — Short-term & Long-term Memory

## Overview

AgentCore Memory provides managed memory infrastructure so agents can maintain context across turns (short-term) and across sessions (long-term). Compatible with LangGraph, LangChain, Strands, LlamaIndex.

## Memory Types

| Type | Scope | Use Case |
|------|-------|---------|
| **Short-term** | Within a session | Multi-turn conversation context, recent tool results |
| **Long-term** | Across sessions | User preferences, past decisions, knowledge learned from operations |

## Key Concept: Memory vs. Knowledge

- **Memory** = conversation state + user context (what did we talk about, user preferences)
- **Knowledge** = organizational facts (RAG, documentation) — use Knowledge Bases for this

Don't confuse the two. Memory grows with user interaction; knowledge grows with documentation updates.

---

## CDK L2 Constructs

### Basic Memory Store

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';

const memory = new agentcore.Memory(this, 'AgentMemory', {
  memoryName: 'agent-memory',
  description: 'Long-term memory for conversational agent',
});

// Access: memory.memoryId, memory.memoryArn
```

### Memory with Built-in Extraction Strategy

```typescript
const memory = new agentcore.Memory(this, 'AgentMemory', {
  memoryName: 'agent-memory',
  ltmExtractionStrategies: [
    agentcore.LTMExtractionStrategy.builtinExtractorProvider(),
  ],
});
```

### Memory with Custom Lambda Extractor

```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';

const extractorLambda = new lambda.Function(this, 'MemoryExtractor', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'extractor.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../memory-extractor')),
});

const memory = new agentcore.Memory(this, 'AgentMemory', {
  memoryName: 'agent-memory',
  ltmExtractionStrategies: [
    agentcore.LTMExtractionStrategy.customExtractorProvider(
      extractorLambda,
      'honne-extractor'  // Extracts "true feelings" from user approvals
    ),
  ],
});
```

---

## Agent Code Integration

### With Strands (Python)

```python
from strands import Agent
from strands.models.bedrock import BedrockModel
from bedrock_agentcore.memory import BedrockAgentCoreMemoryClient

# Initialize memory client
memory_client = BedrockAgentCoreMemoryClient(
    memory_id="your-memory-id",
    region="ap-northeast-1"
)

async def invoke_with_memory(session_id: str, user_message: str) -> str:
    # Retrieve relevant memories
    memories = await memory_client.retrieve_memories(
        session_id=session_id,
        query=user_message,
        top_k=5
    )

    # Build context from memories
    context = "\n".join([m.content for m in memories])

    agent = Agent(
        model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
        system_prompt=f"User context:\n{context}\n\nYou are a helpful assistant.",
    )

    result = agent(user_message)

    # Save to memory after response
    await memory_client.save_memory(
        session_id=session_id,
        content=f"User: {user_message}\nAgent: {result}",
    )

    return str(result)
```

### CLI Operations

```bash
# Create memory store
aws bedrock-agentcore-control create-memory \
  --memory-name "agent-memory" \
  --region ap-northeast-1

# Save a memory
aws bedrock-agentcore save-memory-records \
  --memory-id <MEMORY_ID> \
  --session-id "session-123" \
  --memory-records '[{"content": "User prefers concise responses", "type": "USER_PREFERENCE"}]' \
  --region ap-northeast-1

# Retrieve memories
aws bedrock-agentcore retrieve-memory-records \
  --memory-id <MEMORY_ID> \
  --session-id "session-123" \
  --query "user communication preferences" \
  --region ap-northeast-1

# List sessions
aws bedrock-agentcore list-memory-sessions \
  --memory-id <MEMORY_ID> \
  --region ap-northeast-1
```

---

## Integration Patterns

### Shared Memory Across Agents

```python
# Both agents use the same memory_id — they share memory automatically
agent_a = AgentWithMemory(memory_id="shared-memory-id", agent_id="agent-a")
agent_b = AgentWithMemory(memory_id="shared-memory-id", agent_id="agent-b")
```

### Long-term Memory Extraction (Honne Data Pattern)

In SABOROU's case, every user voice approval ("いいよ") becomes a data point:

```python
async def on_user_approval(session_id: str, task: dict, user_said: str):
    """Save approved sabori decisions as long-term memory"""
    await memory_client.save_memory(
        session_id=session_id,
        content=json.dumps({
            "event": "sabori_approved",
            "task_type": task["category"],
            "context": task["slack_message"],
            "user_response": user_said,
            "timestamp": datetime.now().isoformat(),
        }),
        memory_type="LONG_TERM",
    )
```

---

## Security

| Concern | Guidance |
|---------|---------|
| PII in memory | Memory content may include PII. Encrypt with KMS if needed. |
| Access control | Use execution role with least-privilege `bedrock-agentcore:*Memory*` permissions |
| Retention | Configure memory TTL for GDPR/compliance — don't retain indefinitely |
| Cross-agent sharing | Intentional sharing requires explicit `memory_id` configuration — not accidental |
