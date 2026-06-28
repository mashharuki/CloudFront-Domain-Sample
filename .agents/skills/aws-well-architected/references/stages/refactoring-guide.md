# リファクタリング・最適化フェーズ Well-Architected ガイド

## このガイドの目的
既存のAWSシステムをWell-Architectedの原則に従って改善・最適化するためのガイド。

---

## リファクタリング優先度フレームワーク

### まず現状を評価する
```
Step 1: AWS Well-Architected Tool でスコアを測定
  → https://console.aws.amazon.com/wellarchitected/

Step 2: AWS Trusted Advisor の推奨事項を確認
  → セキュリティ、コスト、パフォーマンス、耐障害性

Step 3: Compute Optimizer の推奨を確認
  → EC2, Lambda, ECS のライトサイジング推奨

Step 4: Security Hub の発見事項を確認
  → CIS Benchmark、AWS Foundational Security Best Practices

優先度付けの原則:
CRITICAL セキュリティ問題 > HIGH 信頼性問題 > MEDIUM パフォーマンス問題 > LOW コスト最適化
```

---

## セキュリティリファクタリング（最優先）

### ハードコードされたシークレットの除去
```bash
# Step 1: シークレットを Secrets Manager に移行
aws secretsmanager create-secret \
  --name "myapp/production/database" \
  --secret-string '{"password":"old-password"}'

# Step 2: コードを更新
# (development-guide.md の Secrets Manager パターンを参照)

# Step 3: 環境変数/設定ファイルからシークレットを削除
# Step 4: gitの履歴からシークレットを削除（git-filter-repo使用）
git filter-repo --path-glob '*.env' --invert-paths
```

### IAMポリシーの最小権限化
```python
# Step 1: 現在の権限を分析
import boto3

def analyze_iam_permissions(role_name):
    iam = boto3.client('iam')
    
    # 実際に使用されたAPIを確認（CloudTrailから）
    cloudtrail = boto3.client('cloudtrail')
    
    # IAM Access Analyzer の推奨を取得
    analyzer = boto3.client('accessanalyzer')
    response = analyzer.list_findings(
        analyzerArn='arn:aws:access-analyzer:...',
        filter={'resourceType': {'eq': ['AWS::IAM::Role']}}
    )
    return response['findings']
```

```typescript
// Step 2: 最小権限ポリシーに更新
// Before: ワイルドカード権限
const badPolicy = new iam.PolicyStatement({
  actions: ['dynamodb:*'],
  resources: ['*'],
});

// After: 最小権限
const goodPolicy = new iam.PolicyStatement({
  actions: [
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem',
    'dynamodb:Query',
  ],
  resources: [
    table.tableArn,
    `${table.tableArn}/index/*`,
  ],
});
```

---

## 信頼性のリファクタリング

### シングルAZからマルチAZへの移行
```typescript
// RDS: Single AZ → Multi-AZ (ダウンタイムなし)
// コンソールまたはCLIで変更可能
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --multi-az \
  --apply-immediately

// DynamoDB: グローバルテーブルへの移行
const table = new dynamodb.Table(this, 'Table', {
  replicationRegions: ['us-east-1', 'ap-northeast-1'],
});
```

### SQSによる非同期化（強制同期→非同期）
```typescript
// Before: Lambda が直接外部APIを呼び出す（タイムアウトリスク）
// After: SQS キューを介して非同期化

const queue = new sqs.Queue(this, 'ProcessingQueue', {
  visibilityTimeout: Duration.seconds(300), // Lambdaのタイムアウト x 6
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3,
  },
  encryption: sqs.QueueEncryption.KMS_MANAGED,
});

const processorFn = new lambda.Function(this, 'Processor', {
  // ...
  reservedConcurrentExecutions: 10, // 並列実行数を制限
});

processorFn.addEventSource(
  new lambdaEventSources.SqsEventSource(queue, {
    batchSize: 10,
    maxBatchingWindow: Duration.seconds(5),
  })
);
```

### バックアップの追加
```typescript
// AWS Backup で統合バックアップ管理
const plan = new backup.BackupPlan(this, 'BackupPlan', {
  backupPlanRules: [
    new backup.BackupPlanRule({
      ruleName: 'DailyBackup',
      scheduleExpression: events.Schedule.cron({
        minute: '0',
        hour: '2',
      }),
      deleteAfter: Duration.days(30),
      moveToColdStorageAfter: Duration.days(7),
    }),
  ],
});

plan.addSelection('BackupAll', {
  resources: [
    backup.BackupResource.fromDynamoDbTable(table),
    backup.BackupResource.fromRdsDatabaseInstance(dbInstance),
  ],
});
```

---

## パフォーマンスのリファクタリング

### キャッシュの追加
```typescript
// ElastiCache Redis の追加
const cache = new elasticache.CfnReplicationGroup(this, 'Cache', {
  replicationGroupDescription: 'Application Cache',
  cacheNodeType: 'cache.t3.micro',
  numCacheClusters: 2,
  automaticFailoverEnabled: true,
  atRestEncryptionEnabled: true,
  transitEncryptionEnabled: true,
});
```

```python
# キャッシュパターンの実装
import redis
import json
from functools import wraps

redis_client = redis.Redis(host=os.environ['REDIS_HOST'])

def cache(ttl_seconds=300):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{args}:{kwargs}"
            
            # キャッシュ確認
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # キャッシュミス: 実際の処理
            result = func(*args, **kwargs)
            redis_client.setex(cache_key, ttl_seconds, json.dumps(result))
            return result
        return wrapper
    return decorator

@cache(ttl_seconds=60)
def get_user(user_id: str):
    # DynamoDB から取得
    ...
```

### Lambda Power Tuning による最適化
```bash
# Lambda Power Tuning（メモリとコストの最適バランスを見つける）
# https://github.com/alexcasalboni/aws-lambda-power-tuning

aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:...:stateMachine:powerTuningStateMachine \
  --input '{
    "lambdaARN": "arn:aws:lambda:...:function:my-function",
    "powerValues": [128, 256, 512, 1024, 2048, 3008],
    "num": 10,
    "payload": {},
    "parallelInvocation": true,
    "strategy": "balanced"
  }'
```

---

## コスト最適化のリファクタリング

### 未使用リソースのクリーンアップ
```bash
# 未使用のEIPを特定・削除
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].[AllocationId,PublicIp]' \
  --output table

# 未使用のEBSボリュームを特定
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].[VolumeId,Size,CreateTime]' \
  --output table

# 古いスナップショットを特定（90日以上）
aws ec2 describe-snapshots \
  --owner-ids self \
  --query 'Snapshots[?StartTime<`2024-01-01`].[SnapshotId,StartTime,VolumeSize]'
```

### EC2からLambdaへの移行（適切な場合）
```
移行判断基準:
✅ Lambda に向いている:
  - 実行時間 < 15分
  - リクエスト駆動（HTTP/イベント）
  - バースト性のあるワークロード
  - 実行頻度が低い（常時稼働不要）

❌ Lambda に向かない:
  - 実行時間 > 15分
  - 常時実行が必要
  - 大量メモリ（10GB以上）
  - TCPコネクション維持が必要
```

---

## リファクタリングのリスク管理

### 安全なリファクタリング手順
```
1. バックアップの確認・作成
2. ステージング環境でのテスト
3. 本番への段階的適用（カナリアデプロイ）
4. モニタリングダッシュボードの準備
5. ロールバック手順の準備・テスト
6. 変更の実施
7. モニタリングの確認（15-30分）
8. 問題なければ完了、問題があればロールバック
```

### CDK リファクタリング（リソース置換を避ける）
```typescript
// Construct IDを変更するとリソースが置換される！
// ❌ IDを変更しない
// Before: new lambda.Function(this, 'OldName', ...)
// After:  new lambda.Function(this, 'NewName', ...)  ← 置換発生！

// ✅ 安全なリファクタリング
// cdk refactor コマンドを使用
// または Cfn overrides で論理IDを固定

const fn = new lambda.Function(this, 'NewName', {
  // ...
});
(fn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('OldNameXXXXXX');
```
