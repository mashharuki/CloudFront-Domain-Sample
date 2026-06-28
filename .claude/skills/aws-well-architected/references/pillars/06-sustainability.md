# 持続可能性（Sustainability）

## 定義
クラウドワークロードが環境に与える影響、特にエネルギー消費と効率性に焦点を当てる。
長期的な環境・経済・社会への悪影響を最小化することを目指す。

---

## 設計原則（6つ）

1. **持続可能性への影響を理解する**
   - ワークロードの環境フットプリントを測定・把握
   - Customer Carbon Footprint Tool を活用

2. **持続可能性目標を設定する**
   - 具体的な削減目標を設定（KPI化）
   - ビジネス指標と環境指標を連動させる

3. **使用率を最大化する**
   - アイドルリソースを排除
   - 適切なサイズ設定（右サイジング）

4. **より効率的で新しいハードウェアとソフトウェアの提供**
   - 新しいより効率的なインスタンスタイプへの移行
   - Graviton (ARM) インスタンスはx86比最大60%省エネ

5. **マネージドサービスを使用する**
   - AWSのマネージドサービスはリソース共有により効率的
   - データセンター運用をAWSに任せる

6. **クラウドインフラストラクチャのライフサイクルへの影響を軽減する**
   - 不要なデータ・リソースの削除
   - データライフサイクル管理の実装

---

## ベストプラクティスチェックリスト

### リージョン選択（SUS 1）
- [ ] **SUS 1**: 持続可能性を考慮したリージョン選択をしているか
  - 再生可能エネルギー使用率の高いリージョンを優先
  - AWS の Sustainability Data Hub を参照

### ユーザー動作パターン（SUS 2）
- [ ] **SUS 2**: ユーザーの動作に合わせてリソースを調整しているか
  - ピーク時間外のスケールダウン
  - コンテンツをユーザーに近い場所に配置（CloudFront）

### ソフトウェアとアーキテクチャ（SUS 3）
- [ ] **SUS 3**: ソフトウェアを最適化しているか
  - 非効率なアルゴリズム・コードの改善
  - キャッシュを活用して不要な計算を削減
  - メモリリークの修正

### データ（SUS 4）
- [ ] **SUS 4**: データ管理が最適化されているか
  - 不要なデータを削除
  - データ圧縮の活用
  - S3 ライフサイクルポリシーの設定
  - DynamoDB TTL の設定

### ハードウェアとサービス（SUS 5）
- [ ] **SUS 5**: 効率的なハードウェアを使用しているか
  - Graviton インスタンスへの移行
  - 新世代インスタンスタイプへのアップグレード
  - サーバーレスで必要な時だけリソースを使用

### 開発とデプロイ（SUS 6）
- [ ] **SUS 6**: 開発・デプロイプロセスを最適化しているか
  - 不要なビルド・テスト実行を削減
  - 適切なCI/CD キャッシュ設定

---

## よくある問題と修正例

### 🔵 LOW: 非効率なデータ保持

```typescript
// S3 ライフサイクルポリシーで不要データを自動削除
const bucket = new s3.Bucket(this, 'DataBucket', {
  lifecycleRules: [
    {
      id: 'transition-to-ia',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(30),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(90),
        },
      ],
      expiration: Duration.days(365), // 1年後に削除
    },
  ],
});

// DynamoDB TTL で古いレコードを自動削除
const table = new dynamodb.Table(this, 'Table', {
  timeToLiveAttribute: 'ttl',
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
```

### 🔵 LOW: Graviton 未使用

```typescript
// Graviton2 インスタンスへの移行（最大40%省エネ・コスト削減）
const cluster = new ecs.Cluster(this, 'Cluster');
cluster.addCapacity('DefaultAutoScalingGroup', {
  instanceType: new ec2.InstanceType('m6g.xlarge'), // Graviton2
  machineImage: ecs.EcsOptimizedImage.amazonLinux2(
    ecs.AmiHardwareType.ARM
  ),
});

// Lambda ARM アーキテクチャ
const fn = new lambda.Function(this, 'Function', {
  architecture: lambda.Architecture.ARM_64, // Graviton2
  runtime: lambda.Runtime.NODEJS_20_X,
});
```

### 🔵 LOW: 非効率なクエリ・処理

```python
# ❌ 非効率: 全データをロードして処理
all_records = table.scan()['Items']
filtered = [r for r in all_records if r['status'] == 'active']

# ✅ 効率的: フィルタリングをDBに委譲
response = table.query(
    IndexName='StatusIndex',
    KeyConditionExpression=Key('status').eq('active')
)
```

---

## AWSの持続可能性への取り組み

- AWS は 2025年までに再生可能エネルギー100%を目標
- データセンターのPUE（電力使用効率）は業界平均より優れている
- Customer Carbon Footprint Tool でユーザーの排出量を可視化

---

## AWSサービス対応表

| 持続可能性目的 | 推奨サービス |
|-------------|------------|
| 使用量把握 | Customer Carbon Footprint Tool |
| 省エネコンピュート | Graviton インスタンス, Lambda ARM |
| データ最適化 | S3 Intelligent-Tiering, DynamoDB TTL |
| 不要リソース特定 | Compute Optimizer, Trusted Advisor |
| エッジキャッシュ | CloudFront (オリジンリクエスト削減) |
