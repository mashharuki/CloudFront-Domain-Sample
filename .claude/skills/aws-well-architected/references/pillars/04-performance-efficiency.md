# パフォーマンス効率（Performance Efficiency）

## 定義
クラウドリソースを効率的に使用してパフォーマンス要件を満たし、
需要の変化や技術進歩に合わせて効率性を維持する能力。

---

## 設計原則（5つ）

1. **高度なテクノロジーを誰でも使えるようにする**
   - マネージドサービスを活用して複雑な実装を委託
   - チームのコア業務に集中できる環境を作る

2. **わずか数分でグローバル展開する**
   - CloudFront + マルチリージョン で低レイテンシーを実現
   - IaC でどのリージョンにも素早くデプロイ

3. **サーバーレスアーキテクチャを使用する**
   - Lambda, DynamoDB, API Gateway を優先選択
   - 運用オーバーヘッドを削減

4. **より頻繁に実験する**
   - A/Bテスト、インスタンスタイプの比較テスト
   - パフォーマンスベンチマークの定期実施

5. **メカニカルシンパシー（技術との共鳴）を重視する**
   - データアクセスパターンに最適なDBを選択
   - ユースケースに最適なAWSサービスを選択

---

## ベストプラクティスチェックリスト

### アーキテクチャ選択（PERF 1）
- [ ] **PERF 1**: ワークロードのパフォーマンス目標が定義されているか
  - レスポンスタイム目標（p50, p95, p99）
  - スループット目標（TPS / RPS）
  - ベースラインの測定と記録

### コンピュート（PERF 2-4）
- [ ] **PERF 2**: ワークロードに最適なコンピュートリソースを選択しているか
  - Lambda: 短時間のイベント処理（最大15分）
  - Fargate: コンテナ化されたタスク
  - EC2: 長時間実行、特定ハードウェア要件
- [ ] **PERF 3**: コンピュートリソースをスケーリングしているか
  - Lambda 同時実行数の最適化
  - Provisioned Concurrency の検討
  - ECS Service Auto Scaling の設定
- [ ] **PERF 4**: パフォーマンステストを実施しているか
  - 負荷テスト（Artillery, k6等）
  - AWS X-Ray で ボトルネック特定

### ストレージ（PERF 5）
- [ ] **PERF 5**: ストレージソリューションが適切か
  - アクセスパターンに基づいてS3/EBS/EFS/FSxを選択
  - S3 Intelligent-Tiering でコスト最適化
  - EBS: gp3（gp2より高速・低コスト）を使用

### データベース（PERF 6）
- [ ] **PERF 6**: データベースソリューションが適切か
  - DynamoDB: 高スループット、スケーラブルな単純クエリ
  - Aurora Serverless: 可変ワークロード
  - ElastiCache: 読み取りヘビーなワークロードのキャッシュ
  - Redshift: データウェアハウス・分析
  - 接続プーリングの使用（RDS Proxy）

### ネットワーク（PERF 7）
- [ ] **PERF 7**: ネットワークソリューションが適切か
  - CloudFront CDN でエッジキャッシュ
  - S3 Transfer Acceleration
  - VPC Endpoint で AWS内部通信の最適化
  - Enhanced Networking (ENA) の有効化

### レビューとモニタリング（PERF 8-9）
- [ ] **PERF 8**: パフォーマンスを継続的にモニタリングしているか
  - CloudWatch でメトリクス収集
  - AWS X-Ray でトレーシング
  - パフォーマンスダッシュボードの整備
- [ ] **PERF 9**: トレードオフを理解しているか
  - 一貫性 vs パフォーマンス
  - コスト vs パフォーマンス

---

## よくある問題と修正例

### 🟠 HIGH: Lambda コールドスタートの未対策

```typescript
// Provisioned Concurrency でコールドスタート対策
const fn = new lambda.Function(this, 'Function', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
  memorySize: 1024, // パフォーマンスとコストのバランスを測定して決定
});

const version = fn.currentVersion;
const alias = new lambda.Alias(this, 'ProdAlias', {
  aliasName: 'prod',
  version,
  provisionedConcurrentExecutions: 5,
});
```

### 🟡 MEDIUM: キャッシュなし

```typescript
// API Gateway キャッシュの設定
const api = new apigateway.RestApi(this, 'Api', {
  deployOptions: {
    cachingEnabled: true,
    cacheTtl: Duration.minutes(5),
    cacheClusterEnabled: true,
    cacheClusterSize: '0.5',
  },
});

// ElastiCache Redis の設定
const cache = new elasticache.CfnReplicationGroup(this, 'Cache', {
  replicationGroupDescription: 'My Redis cache',
  cacheNodeType: 'cache.t3.micro',
  automaticFailoverEnabled: true,
  numCacheClusters: 2,
});
```

### 🟡 MEDIUM: DynamoDB の非効率なアクセスパターン

```typescript
// ❌ 非効率: Scan 操作
const result = await dynamodb.scan({
  TableName: 'MyTable',
  FilterExpression: 'userId = :userId',
}).promise();

// ✅ 効率的: Query + GSI
const result = await dynamodb.query({
  TableName: 'MyTable',
  IndexName: 'UserIdIndex', // GSIを使用
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: { ':userId': userId },
}).promise();
```

### 🟡 MEDIUM: RDS接続プーリングなし

```typescript
// RDS Proxy で接続プーリング
const dbProxy = new rds.DatabaseProxy(this, 'DbProxy', {
  proxyTarget: rds.ProxyTarget.fromInstance(dbInstance),
  secrets: [dbInstance.secret!],
  vpc,
  requireTLS: true,
});
```

---

## パフォーマンス測定指標

| 指標 | 目標値（一般的） | 測定方法 |
|------|----------------|---------|
| API レスポンスタイム (p50) | < 100ms | CloudWatch, X-Ray |
| API レスポンスタイム (p99) | < 500ms | CloudWatch, X-Ray |
| Lambda コールドスタート | < 1s | CloudWatch Lambda Insights |
| DynamoDB Read | < 5ms | CloudWatch |
| エラー率 | < 0.1% | CloudWatch |

---

## AWSサービス対応表

| パフォーマンス目的 | 推奨サービス |
|-----------------|------------|
| CDN | CloudFront |
| キャッシュ | ElastiCache (Redis/Memcached) |
| 接続プーリング | RDS Proxy |
| コンテンツ配信 | S3 + CloudFront |
| トレーシング | AWS X-Ray |
| パフォーマンス分析 | CloudWatch, Lambda Insights |
| 負荷テスト | AWS Distributed Load Testing |
| GPU/ML | SageMaker, Inferentia |
