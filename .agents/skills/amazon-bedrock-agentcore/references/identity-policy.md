# AgentCore Identity & Policy

## Identity Service

Identity provides secure agent authentication with external IdPs (Okta, Entra ID, Cognito, Auth0), so agents can act on behalf of users without managing credentials.

### WorkloadIdentity CDK Construct

```typescript
import * as agentcore from 'aws-cdk-lib/aws_bedrockagentcore';

const workloadIdentity = new agentcore.WorkloadIdentity(this, 'AgentIdentity', {
  workloadIdentityName: 'customer-support-agent-prod',
  allowedResourceOauth2ReturnUrls: [
    'https://app.example.com/oauth/callback',
    'https://extension.example.com/auth/callback',  // Chrome extension OAuth redirect
  ],
  tags: { team: 'agents', env: 'prod' },
});
```

### OAuth2 Credential Providers (for Gateway targets)

```typescript
// GitHub
const githubCreds = agentcore.OAuth2CredentialProvider.usingGithub(this, 'GitHubCreds', {
  oAuth2CredentialProviderName: 'github-credentials',
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: cdk.SecretValue.secretsManager('github/oauth/client-secret'),
});

// Okta
const oktaCreds = agentcore.OAuth2CredentialProvider.usingCustom(this, 'OktaCreds', {
  oAuth2CredentialProviderName: 'okta-credentials',
  clientId: 'okta-client-id',
  clientSecret: cdk.SecretValue.secretsManager('okta/client-secret'),
  discoveryUrl: 'https://my-org.okta.com/.well-known/openid-configuration',
});

// Microsoft Entra ID
const entraCreds = agentcore.OAuth2CredentialProvider.usingCustom(this, 'EntraCreds', {
  oAuth2CredentialProviderName: 'entra-credentials',
  clientId: 'entra-client-id',
  clientSecret: cdk.SecretValue.secretsManager('entra/client-secret'),
  authorizationServerMetadata: {
    issuer: 'https://login.microsoftonline.com/<TENANT_ID>/v2.0',
    authorizationEndpoint: 'https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token',
  },
});
```

### Runtime Authorizer Configurations

```typescript
// Cognito (Machine-to-Machine)
const runtime = new agentcore.Runtime(this, 'Runtime', {
  agentRuntimeArtifact: artifact,
  authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
    userPool,
    [userPoolClient],
    ['my-audience'],
    ['read', 'write'],
  ),
});

// JWT from external IdP
const runtime = new agentcore.Runtime(this, 'Runtime', {
  agentRuntimeArtifact: artifact,
  authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingJWT(
    'https://my-org.okta.com/.well-known/openid-configuration',
    ['client-id'],
    ['audience'],
    ['read', 'write'],
  ),
});

// Custom claims (extract department/role from JWT)
const customClaims = [
  agentcore.RuntimeCustomClaim.withStringValue('department', 'engineering'),
  agentcore.RuntimeCustomClaim.withStringArrayValue('roles', ['admin']),
  agentcore.RuntimeCustomClaim.withStringArrayValue(
    'permissions',
    ['read', 'write'],
    agentcore.CustomClaimOperator.CONTAINS_ANY,
  ),
];
```

---

## Policy Service (Cedar)

Policy provides deterministic governance for agent actions. It intercepts every Gateway tool call and evaluates Cedar policies before execution. Agents operate within defined boundaries without slowing down.

### What Cedar Does

- Intercepts tool calls BEFORE execution
- Evaluates natural language rules or Cedar policy expressions
- Allows or denies based on principal, action, resource, context
- Zero latency impact (synchronous evaluation in-path)

### Policy Patterns

```cedar
// Allow engineering team to read and write tasks
permit(
  principal in Group::"engineering-team",
  action in [Action::"get_tasks", Action::"create_task", Action::"update_task"],
  resource in ResourceType::"saborou-tasks"
);

// Deny deletion for non-admins
forbid(
  principal,
  action == Action::"delete_task",
  resource
) unless {
  principal has role &&
  principal.role == "admin"
};

// Allow Slack replies only after human approval
permit(
  principal,
  action == Action::"send_slack_reply",
  resource
) when {
  context has humanApproved &&
  context.humanApproved == true
};
```

### CLI Configuration

```bash
# Create policy store
aws bedrock-agentcore-control create-policy \
  --policy-name "agent-governance" \
  --policy-type "CEDAR" \
  --region ap-northeast-1

# Attach policy to gateway
aws bedrock-agentcore-control update-gateway \
  --gateway-identifier <GATEWAY_ID> \
  --policy-id <POLICY_ID> \
  --region ap-northeast-1
```

### Testing Policies

```bash
# Test a policy evaluation
aws bedrock-agentcore-control is-authorized \
  --policy-id <POLICY_ID> \
  --principal '{"entityType":"User","entityId":"user-123"}' \
  --action '{"actionType":"Action","actionId":"send_slack_reply"}' \
  --resource '{"entityType":"ResourceType","entityId":"slack-channel-general"}' \
  --context '{"humanApproved": true}' \
  --region ap-northeast-1
```

---

## IAM Execution Roles

Every AgentCore resource needs an execution role. The CDK constructs auto-create them, but here's what they require:

### Runtime Execution Role (manual)

```typescript
const runtimeRole = new iam.Role(this, 'AgentRuntimeRole', {
  assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
  conditions: {
    ArnLike: {
      'aws:SourceArn': `arn:aws:bedrock-agentcore:ap-northeast-1:${ACCOUNT}:agent-runtime/*`,
    },
    StringEquals: {
      'aws:SourceAccount': ACCOUNT,
    },
  },
});

runtimeRole.addToPolicy(new iam.PolicyStatement({
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
  ],
  resources: ['arn:aws:bedrock:ap-northeast-1::foundation-model/*'],
}));

runtimeRole.addToPolicy(new iam.PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: ['arn:aws:secretsmanager:ap-northeast-1:*:secret:saborou/*'],
}));
```

### Required Permissions Summary

| Component | Principal | Key Permissions |
|-----------|-----------|----------------|
| Runtime | `bedrock-agentcore.amazonaws.com` | `bedrock:InvokeModel`, `ecr:GetDownloadUrl`, `logs:CreateLogGroup` |
| Gateway | `bedrock-agentcore.amazonaws.com` | `lambda:InvokeFunction`, `s3:GetObject` (schema), `secretsmanager:GetSecretValue` |
| Memory | `bedrock-agentcore.amazonaws.com` | `bedrock:InvokeModel` (for extraction), `dynamodb:*` (internal) |
| Browser | `bedrock-agentcore.amazonaws.com` | `s3:PutObject` (recordings) |
| Code Interpreter | `bedrock-agentcore.amazonaws.com` | None (sandbox) |

### Invoker Permissions

```typescript
// Allow a Lambda to invoke AgentCore Runtime
invokerLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['bedrock-agentcore:InvokeAgentRuntime'],
  resources: [runtime.runtimeArn],
}));

// Allow a Lambda to invoke Gateway
invokerLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['bedrock-agentcore:InvokeGateway'],
  resources: [gateway.gatewayArn],
}));
```
