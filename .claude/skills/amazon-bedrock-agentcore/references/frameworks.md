# AgentCore Framework Integration Patterns

AgentCore is framework-agnostic. This file covers integration patterns for the most common frameworks.

---

## Strands Agents (AWS-native, recommended for Bedrock)

Strands is AWS's lightweight agent framework with first-class AgentCore and Bedrock integration.

### Install

```bash
pip install strands-agents strands-agents-tools bedrock-agentcore
```

### Basic Strands Agent

```python
from strands import Agent, tool
from strands.models.bedrock import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@tool
def search_knowledge_base(query: str) -> dict:
    """Search the internal knowledge base"""
    # Implementation
    return {"results": [...]}

@tool
def get_current_tasks() -> dict:
    """Get the user's current task list"""
    # Implementation
    return {"tasks": [...]}

agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    system_prompt="""You are SABOROU, an AI that helps users manage tasks.
    Help users decide what they can defer (saboru) and what they must do.""",
    tools=[search_knowledge_base, get_current_tasks],
)

@app.entrypoint
def invoke(payload: dict) -> dict:
    result = agent(payload.get("prompt", ""))
    return {"result": str(result), "stop_reason": result.stop_reason}

if __name__ == "__main__":
    app.run()
```

### Strands Multi-Agent (Supervisor)

```python
from strands import Agent
from strands.multiagent import SupervisorAgent

slack_agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    system_prompt="You handle Slack message analysis and reply generation.",
    tools=[analyze_slack_message, generate_reply],
)

task_agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-haiku-4-5-20251001"),
    system_prompt="You manage task prioritization and scheduling.",
    tools=[get_tasks, update_task_priority],
)

supervisor = SupervisorAgent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    agents={"slack_handler": slack_agent, "task_manager": task_agent},
    system_prompt="Coordinate slack handling and task management to help the user.",
)
```

### Strands with AgentCore Memory

```python
from strands import Agent
from strands.models.bedrock import BedrockModel
from bedrock_agentcore.memory import BedrockAgentCoreMemoryClient
import asyncio

memory_client = BedrockAgentCoreMemoryClient(
    memory_id=os.environ["AGENTCORE_MEMORY_ID"],
    region=os.environ.get("AWS_REGION", "ap-northeast-1"),
)

@app.entrypoint
async def invoke(payload: dict, context) -> dict:
    session_id = context.session_id

    # Load memory context
    memories = await memory_client.retrieve_memories(
        session_id=session_id,
        query=payload.get("prompt", ""),
        top_k=3,
    )

    memory_context = "\n".join([m.content for m in memories]) if memories else "No previous context."

    agent = Agent(
        model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
        system_prompt=f"Memory context:\n{memory_context}\n\nYou are SABOROU...",
        tools=[...],
    )

    result = agent(payload.get("prompt", ""))

    # Save this interaction to memory
    await memory_client.save_memory(
        session_id=session_id,
        content=f"User: {payload.get('prompt')}\nSABOROO: {result}",
        memory_type="SHORT_TERM",
    )

    return {"result": str(result)}
```

### Strands with OTEL Telemetry

```python
from strands import Agent
from strands.telemetry import StrandsTelemetry

telemetry = StrandsTelemetry(
    otlp_endpoint="http://localhost:4317",  # Or CloudWatch OTEL endpoint
    service_name="saborou-agent",
    trace_attributes={
        "environment": os.environ.get("ENV", "production"),
        "agent_version": "2.0.0",
    },
)
telemetry.setup()

agent = Agent(
    model=BedrockModel(model_id="jp.anthropic.claude-sonnet-4-6"),
    tools=[...],
)
```

---

## LangGraph

```python
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_aws import ChatBedrock
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from typing import TypedDict, Annotated
from langchain_core.messages import AnyMessage
import operator

app = BedrockAgentCoreApp()

class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]

llm = ChatBedrock(
    model_id="jp.anthropic.claude-sonnet-4-6",
    region_name="ap-northeast-1",
)
tools = [get_tasks, send_slack_reply, judge_sabori]
llm_with_tools = llm.bind_tools(tools)

def call_model(state: AgentState):
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}

def should_continue(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return END

workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.add_node("tools", ToolNode(tools))
workflow.add_edge(START, "agent")
workflow.add_conditional_edges("agent", should_continue, ["tools", END])
workflow.add_edge("tools", "agent")

graph = workflow.compile()

@app.entrypoint
def invoke(payload: dict) -> dict:
    from langchain_core.messages import HumanMessage
    result = graph.invoke({"messages": [HumanMessage(content=payload.get("prompt", ""))]})
    return {"result": result["messages"][-1].content}

if __name__ == "__main__":
    app.run()
```

---

## CrewAI

```python
from crewai import Agent, Task, Crew, Process
from bedrock_agentcore.runtime import BedrockAgentCoreApp
import boto3

app = BedrockAgentCoreApp()

slack_analyst = Agent(
    role='Slack Message Analyst',
    goal='Analyze Slack messages and determine appropriate responses',
    backstory='Expert at understanding workplace communication context',
    tools=[analyze_slack_tool],
    llm="bedrock/jp.anthropic.claude-sonnet-4-6",
)

task_prioritizer = Agent(
    role='Task Prioritization Specialist',
    goal='Determine which tasks can be deferred and which must be done',
    backstory='Expert at time management and task prioritization',
    tools=[get_tasks_tool, judge_sabori_tool],
    llm="bedrock/jp.anthropic.claude-haiku-4-5-20251001",
)

@app.entrypoint
def invoke(payload: dict) -> dict:
    analyze_task = Task(
        description=f"Analyze this message: {payload.get('prompt')}",
        expected_output="Structured analysis of the Slack message",
        agent=slack_analyst,
    )

    prioritize_task = Task(
        description="Based on the analysis, determine sabori status and generate reply",
        expected_output="Sabori decision with reply draft in Japanese",
        agent=task_prioritizer,
    )

    crew = Crew(
        agents=[slack_analyst, task_prioritizer],
        tasks=[analyze_task, prioritize_task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()
    return {"result": str(result)}

if __name__ == "__main__":
    app.run()
```

---

## Dockerfile Templates by Framework

### Strands (ARM64)

```dockerfile
FROM --platform=linux/arm64 python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir strands-agents bedrock-agentcore opentelemetry-sdk
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8080
CMD ["python", "main.py"]
```

### LangGraph (ARM64)

```dockerfile
FROM --platform=linux/arm64 python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir langgraph langchain-aws bedrock-agentcore uvicorn
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### requirements.txt (minimal)

```text
bedrock-agentcore>=0.1.0
strands-agents>=0.1.0
opentelemetry-api>=1.20.0
opentelemetry-sdk>=1.20.0
opentelemetry-exporter-otlp-proto-grpc>=1.20.0
boto3>=1.34.0
```

---

## Framework Decision Guide

| Criterion | Strands | LangGraph | CrewAI |
|-----------|---------|-----------|--------|
| **AWS integration** | Native (best) | Good | Good |
| **Multi-agent** | SupervisorAgent | Graph-based | Role-based |
| **Complexity** | Low | Medium | Medium |
| **State management** | Session-based | Graph state | Task-based |
| **Best for** | Simple-medium agents, AWS-native | Complex workflows with branching | Role-based collaborative tasks |
| **Startup latency** | Low | Medium | Medium |

**Recommendation for SABOROU**: Strands for its simplicity and AWS-native integration with AgentCore Memory and Bedrock.
