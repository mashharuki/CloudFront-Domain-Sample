# テストフェーズ Well-Architected ガイド

## このガイドの目的
Well-Architectedの観点からシステムを検証するためのテスト戦略と実施方法。

---

## テスト戦略の全体像

```
テストピラミッド (Well-Architected版):

                    🔺
                  /    \
               E2E Tests   ← 少数、本番同等環境
              (Selenium, Playwright)
            /            \
         Integration Tests  ← 中程度
         (APIテスト, DB連携)
        /                  \
      Unit Tests              ← 多数、高速
    (ビジネスロジック)

    + セキュリティテスト（全層）
    + パフォーマンステスト（負荷試験）
    + カオステスト（信頼性）
```

---

## テストチェックリスト

### ユニットテスト
```
□ ビジネスロジックのカバレッジ > 80%
□ Lambda ハンドラーのテスト（モック使用可）
□ エラーハンドリングパスのテスト
□ 入力バリデーションのテスト（境界値、異常値）
□ CDK Stack のスナップショットテスト
```

```python
# Lambda ユニットテスト例
import pytest
import json
from unittest.mock import patch, MagicMock
from myapp.handler import handler

def test_handler_success():
    event = {
        'body': json.dumps({'name': 'test', 'email': 'test@example.com'}),
        'requestContext': {'requestId': 'test-request-id'}
    }
    
    with patch('boto3.resource') as mock_dynamodb:
        mock_table = MagicMock()
        mock_dynamodb.return_value.Table.return_value = mock_table
        
        response = handler(event, MagicMock())
        
        assert response['statusCode'] == 200
        mock_table.put_item.assert_called_once()

def test_handler_invalid_email():
    event = {
        'body': json.dumps({'name': 'test', 'email': 'invalid-email'})
    }
    response = handler(event, MagicMock())
    assert response['statusCode'] == 400

def test_handler_missing_field():
    event = {'body': json.dumps({'name': 'test'})}  # email欠如
    response = handler(event, MagicMock())
    assert response['statusCode'] == 400
```

```typescript
// CDK Stack テスト
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyStack } from '../lib/my-stack';

test('DynamoDB table has PITR enabled', () => {
  const app = new App();
  const stack = new MyStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true
    }
  });
});

test('S3 bucket has encryption', () => {
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [{
        ServerSideEncryptionByDefault: {
          SSEAlgorithm: 'aws:kms'
        }
      }]
    }
  });
});

test('Lambda function has X-Ray tracing', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    TracingConfig: { Mode: 'Active' }
  });
});
```

### セキュリティテスト（CRITICAL）
```
□ OWASP ZAP / Burp Suite でのスキャン
□ AWS Inspector でのコンテナ/EC2スキャン
□ Secrets Manager のシークレットローテーションテスト
□ IAM ポリシーの過剰権限チェック (IAM Access Analyzer)
□ S3バケットのパブリックアクセス確認
□ ペネトレーションテスト（本番前）
□ SQLインジェクション / XSS テスト
□ 認証バイパステスト
```

```bash
# AWS Security チェック
# IAM Access Analyzer
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:ap-northeast-1:123456789:analyzer/my-analyzer

# S3パブリックアクセスチェック
aws s3api get-bucket-policy-status --bucket my-bucket
aws s3api get-public-access-block --bucket my-bucket

# GuardDuty の高重大度発見
aws guardduty list-findings \
  --detector-id <detector-id> \
  --finding-criteria '{"Criterion":{"severity":{"Gte":7}}}'
```

### 統合テスト
```
□ APIエンドツーエンドテスト（実際のAWSサービス使用）
□ DLQ処理のテスト（エラーメッセージがDLQに届くか）
□ 認証フローのテスト（Cognitoトークン取得→API呼び出し）
□ Cross-Account / Cross-Region アクセステスト
□ イベント駆動フローのテスト（EventBridge → Lambda）
```

```python
# API統合テスト例
import requests
import pytest
import boto3
import os

BASE_URL = os.environ['API_BASE_URL']

@pytest.fixture
def auth_token():
    # Cognito からトークン取得
    client = boto3.client('cognito-idp')
    response = client.initiate_auth(
        AuthFlow='USER_PASSWORD_AUTH',
        AuthParameters={
            'USERNAME': os.environ['TEST_USER'],
            'PASSWORD': os.environ['TEST_PASSWORD'],
        },
        ClientId=os.environ['CLIENT_ID'],
    )
    return response['AuthenticationResult']['IdToken']

def test_create_item(auth_token):
    response = requests.post(
        f'{BASE_URL}/items',
        headers={'Authorization': f'Bearer {auth_token}'},
        json={'name': 'test-item', 'value': 42}
    )
    assert response.status_code == 201
    assert 'id' in response.json()

def test_unauthorized_access():
    response = requests.get(f'{BASE_URL}/items')
    assert response.status_code == 401

def test_invalid_input(auth_token):
    response = requests.post(
        f'{BASE_URL}/items',
        headers={'Authorization': f'Bearer {auth_token}'},
        json={'name': 'x' * 1000}  # 長すぎる入力
    )
    assert response.status_code == 400
```

### パフォーマンステスト
```
□ 負荷テスト（目標TPS x 1.5 での動作確認）
□ スパイクテスト（急激なトラフィック増加）
□ ソークテスト（長時間の安定動作）
□ Lambda コールドスタート時間の測定
□ DynamoDB のスループット上限確認
□ APIレスポンスタイムのp50/p95/p99測定
```

```yaml
# k6 負荷テスト設定
config:
  target: 100  # 100 RPS
  duration: "5m"

scenarios:
  spike_test:
    executor: ramping-arrival-rate
    startRate: 10
    timeUnit: '1s'
    preAllocatedVUs: 50
    stages:
      - duration: '1m', target: 10   # ウォームアップ
      - duration: '2m', target: 100  # 目標負荷
      - duration: '30s', target: 200 # スパイク
      - duration: '1m', target: 10   # クールダウン

thresholds:
  http_req_duration: ['p95<500']  # p95が500ms以下
  http_req_failed: ['rate<0.001'] # エラー率0.1%以下
```

### カオスエンジニアリング（信頼性テスト）
```
□ AZ障害のシミュレーション（AWS FIS）
□ Lambdaエラーの注入テスト
□ DynamoDB スロットリングテスト
□ ネットワーク遅延の注入
□ 依存サービス障害のシミュレーション
□ RTO/RPO の実測確認
```

```json
// AWS Fault Injection Simulator テンプレート例
{
  "description": "Lambda エラー率注入テスト",
  "actions": {
    "InjectLambdaErrors": {
      "actionId": "aws:lambda:invocation-error",
      "parameters": {
        "errorType": "ServiceException",
        "errorPercentage": "30"
      },
      "targets": {
        "Functions": "MyLambdaFunctions"
      }
    }
  },
  "targets": {
    "MyLambdaFunctions": {
      "resourceType": "aws:lambda:function",
      "resourceArns": ["arn:aws:lambda:..."],
      "selectionMode": "ALL"
    }
  }
}
```

---

## CI/CDへのテスト統合

### パイプラインテストゲート
```yaml
# GitHub Actions での Well-Architected テスト統合
name: Well-Architected Test Gate

on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run cdk-nag
        run: |
          npm ci
          npx cdk synth
          # cdk-nag の結果確認（エラーがあればfail）
      
      - name: Run cfn-guard
        run: |
          cfn-guard validate \
            --data cdk.out/*.template.json \
            --rules security-rules.guard

      - name: Check for hardcoded secrets
        run: |
          # git-secrets または trufflehog でスキャン
          trufflehog filesystem . --fail

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run unit tests with coverage
        run: |
          npm test -- --coverage
          # カバレッジが80%未満ならfail
```

---

## テスト環境のWell-Architected チェック
```
本番前に確認すること:
□ テスト環境が本番と同等の構成か（スケール以外）
□ テストデータに実際の個人情報が含まれていないか
□ テスト環境のシークレットが本番と分離されているか
□ テスト環境のコストモニタリングが設定されているか
□ テスト後に環境をクリーンアップする仕組みがあるか
```
