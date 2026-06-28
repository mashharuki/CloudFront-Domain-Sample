# 開発フェーズ Well-Architected ガイド

## このガイドの目的
実装・コーディング段階でWell-Architectedの原則を適用し、
セキュアで信頼性の高いコードを作成するためのガイド。

---

## 開発段階のチェックリスト

### インフラストラクチャ as Code（IaC）

#### CDK 開発チェック
```
□ L2 Constructs を優先使用（L1は最終手段）
□ cdk-nag を統合してWell-Architectedチェックを自動化
□ cdk synth → cdk diff → cdk deploy の順で実行
□ 削除保護の設定（stateful リソース）
□ RemovalPolicy の適切な設定
□ Secrets Manager / Parameter Store の使用（ハードコード禁止）
□ タグをスタックレベルで設定
□ マルチスタック設計（ステートフル/ステートレス分離）
```

```typescript
// cdk-nag の統合（必須）
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
```

### Lambdaファンクション開発

#### 必須実装パターン
```python
import json
import logging
import os
import boto3
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

# AWS Lambda Powertools を使用（必須）
logger = Logger(service="my-service")
tracer = Tracer(service="my-service")
metrics = Metrics(namespace="MyApp", service="my-service")

@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
@logger.inject_lambda_context(log_event=True)
def handler(event, context):
    # 構造化ログ
    logger.info("Processing request", extra={"request_id": context.aws_request_id})
    
    try:
        result = process(event)
        metrics.add_metric(name="SuccessCount", unit=MetricUnit.Count, value=1)
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
    except Exception as e:
        logger.exception("Failed to process request")
        metrics.add_metric(name="ErrorCount", unit=MetricUnit.Count, value=1)
        raise
```

#### Lambda 設定チェック
```
□ タイムアウト設定（デフォルト3秒は短すぎる場合が多い）
□ メモリサイズの最適化（Lambda Power Tuning で測定）
□ 環境変数でシークレットを直接設定しない
□ IAMロールは最小権限
□ VPCが必要か検討（DynamoDBはVPCエンドポイント経由）
□ Dead Letter Queue (DLQ) の設定
□ 冪等性の実装（重複実行対策）
□ X-Ray トレーシングの有効化
```

### APIの実装

#### API Gateway チェック
```
□ 認証の設定（Cognito/IAM/Lambda Authorizer）
□ スロットリング設定（デフォルト: 10,000 RPS）
□ CORS設定（必要最小限のオリジンのみ許可）
□ リクエストバリデーション（JSON Schema）
□ アクセスログの有効化
□ WAFの統合
□ カスタムドメイン + ACM証明書
```

```typescript
// API Gateway の適切な設定
const api = new apigateway.RestApi(this, 'Api', {
  deployOptions: {
    throttlingBurstLimit: 1000,
    throttlingRateLimit: 500,
    accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
    accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
    tracingEnabled: true,
    metricsEnabled: true,
  },
  defaultCorsPreflightOptions: {
    allowOrigins: ['https://example.com'], // 本番はワイルドカード禁止
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type'],
  },
});
```

### データベース実装

#### DynamoDB 設計チェック
```
□ アクセスパターンを事前に定義
□ Single Table Design の検討
□ GSI/LSIの適切な設計
□ Scan を使用しない（Query に置き換え）
□ キャパシティモードの選択（PAY_PER_REQUEST 推奨）
□ PITR（ポイントインタイムリカバリ）の有効化
□ TTL の設定（不要なデータの自動削除）
□ 暗号化の有効化（デフォルトで有効）
```

```typescript
// DynamoDB テーブルの適切な設定
const table = new dynamodb.Table(this, 'Table', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
  timeToLiveAttribute: 'ttl',
  removalPolicy: RemovalPolicy.RETAIN, // 本番環境では必ず RETAIN
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // 変更追跡が必要な場合
});
```

### セキュリティ実装

#### シークレット管理（絶対ルール）
```python
# ❌ 絶対禁止
API_KEY = "hardcoded-secret-key"
DB_PASSWORD = "my-password"

# ✅ 必須: Secrets Manager を使用
import boto3
import json
from functools import lru_cache

@lru_cache(maxsize=None)  # Lambda の再利用でキャッシュ
def get_secret(secret_name: str) -> dict:
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# 環境変数でシークレット名を渡す（値は渡さない）
secret = get_secret(os.environ['SECRET_NAME'])
```

#### 入力バリデーション
```python
from pydantic import BaseModel, validator
import re

class UserInput(BaseModel):
    email: str
    name: str
    
    @validator('email')
    def validate_email(cls, v):
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', v):
            raise ValueError('Invalid email format')
        return v
    
    @validator('name')
    def validate_name(cls, v):
        if len(v) > 100:
            raise ValueError('Name too long')
        # SQLインジェクション対策（DynamoDBは本来不要だが習慣として）
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Invalid characters in name')
        return v
```

---

## 開発ベストプラクティス

### エラーハンドリング
```python
# Lambda での適切なエラーハンドリング
class RetryableError(Exception):
    """再試行可能なエラー（SQSのvisibility timeoutで再処理）"""
    pass

class NonRetryableError(Exception):
    """再試行不可のエラー（DLQに送信）"""
    pass

def handler(event, context):
    try:
        process(event)
    except boto3.exceptions.Boto3Error as e:
        if is_throttling_error(e):
            raise RetryableError(f"Throttled: {e}")
        raise NonRetryableError(f"AWS Error: {e}")
    except ValidationError as e:
        raise NonRetryableError(f"Invalid input: {e}")
```

### 環境変数管理
```typescript
// CDK での環境変数設定（値を直接入れない）
const fn = new lambda.Function(this, 'Function', {
  environment: {
    // ✅ Secrets Manager のシークレット名
    SECRET_NAME: secret.secretName,
    // ✅ リソース名/ARN
    TABLE_NAME: table.tableName,
    BUCKET_NAME: bucket.bucketName,
    // ❌ 実際の値を入れない
    // DB_PASSWORD: 'my-password',
  },
});

// Secrets Manager のシークレットアクセス権を付与
secret.grantRead(fn);
table.grantReadWriteData(fn);
```

---

## コードレビューチェックリスト（開発者向け自己チェック）

PR提出前に以下を確認:

```
セキュリティ:
□ ハードコードされたシークレットがないか
□ IAMポリシーが最小権限か
□ 入力バリデーションが実装されているか
□ エラーメッセージに機密情報が含まれていないか

信頼性:
□ タイムアウトが全て設定されているか
□ リトライロジック（指数バックオフ）があるか
□ 冪等性が確保されているか（POST/PUT/DELETE）
□ エラーハンドリングが適切か

オペレーション:
□ 構造化ログが実装されているか
□ メトリクスが発行されているか（ビジネスKPI）
□ X-Rayトレーシングが有効か

パフォーマンス:
□ N+1クエリ問題がないか
□ 不要なAWSAPI呼び出しがないか
□ キャッシュを適切に使用しているか
```
