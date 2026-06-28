# コスト最適化（Cost Optimization）

## 定義
最低価格でビジネス価値を実現するシステムを実行できる能力。

---

## 設計原則（5つ）

1. **クラウド財務管理の実装**
   - コスト最適化をセキュリティ・運用と同等に重視
   - コスト意識の高い組織文化を構築

2. **消費モデルを導入する**
   - 使用分だけ支払う（オンデマンド、サーバーレス優先）
   - 固定コストを変動コストへ

3. **全体的な効率を測定する**
   - ビジネス成果とコストを結びつけて測定
   - ROI を定期的に評価

4. **差別化につながらない作業のコストを削減**
   - マネージドサービスでインフラ管理コストを削減
   - AWSに委託できることはAWSに任せる

5. **コストを分析し帰属関係を明らかにする**
   - タグ付けでコストをワークロード・チームに帰属
   - 透明性のある請求で最適化機会を発見

---

## ベストプラクティスチェックリスト

### クラウド財務管理（COST 1）
- [ ] **COST 1**: コスト最適化のガバナンスがあるか
  - AWS Budgets でアラートを設定しているか
  - Cost Explorer でコストを定期的に分析しているか
  - コストオーナーが定義されているか

### 支出と使用量の認識（COST 2）
- [ ] **COST 2**: コストを把握・分析しているか
  - Cost Allocation Tags が設定されているか
    ```
    必須タグ例:
    - Environment: prod/staging/dev
    - Team: backend/frontend/data
    - Project: my-project
    - Owner: team@example.com
    ```
  - AWS Cost and Usage Report (CUR) が有効か
  - Compute Optimizer の推奨を確認しているか

### コスト効率の高いリソース（COST 3-5）
- [ ] **COST 3**: コスト効率の高いリソースを選択しているか
  - **コンピュート**:
    - Lambda を最大限活用（常時稼働より安い場合が多い）
    - Fargate Spot でバッチ処理
    - EC2 Savings Plans / Reserved Instances の検討
    - Graviton (ARM) インスタンスで最大40%コスト削減
  - **ストレージ**:
    - S3 Intelligent-Tiering で自動階層化
    - EBS gp3 (gp2より安い)
    - 不要なスナップショットの削除
  - **データベース**:
    - DynamoDB on-demand (読み書きが予測困難な場合)
    - Aurora Serverless (可変ワークロード)
    - RDS Reserved Instances (安定したワークロード)
- [ ] **COST 4**: データ転送コストを最適化しているか
  - 同一AZ内の通信を優先
  - VPC Endpoint でインターネット経由通信を削減
  - CloudFront でオリジンへのリクエストを削減
- [ ] **COST 5**: マネージドサービスでコストを削減しているか

### 需要の管理とリソースの供給（COST 6）
- [ ] **COST 6**: 需要に応じてリソースをスケールしているか
  - 開発/テスト環境を夜間・週末に停止
  - Auto Scaling で過剰プロビジョニングを防止

### コスト最適化の文化（COST 7-8）
- [ ] **COST 7**: コスト最適化を継続的に実施しているか
  - 定期的なコストレビュー（月次）
  - Trusted Advisor の推奨事項を確認
- [ ] **COST 8**: 廃棄されたリソースを削除しているか
  - 未使用のEIPを削除
  - 未使用のEBSボリュームを削除
  - 古いスナップショットを削除

---

## よくある問題と修正例

### 🟠 HIGH: コスト可視化なし

```typescript
// AWS Budgets の設定
new budgets.CfnBudget(this, 'MonthlyBudget', {
  budget: {
    budgetType: 'COST',
    timeUnit: 'MONTHLY',
    budgetLimit: {
      amount: 100,
      unit: 'USD',
    },
  },
  notificationsWithSubscribers: [{
    notification: {
      notificationType: 'ACTUAL',
      comparisonOperator: 'GREATER_THAN',
      threshold: 80,
    },
    subscribers: [{
      subscriptionType: 'EMAIL',
      address: 'team@example.com',
    }],
  }],
});
```

### 🟡 MEDIUM: コストタグなし

```typescript
// CDK での全リソースへのタグ適用
import { Tags } from 'aws-cdk-lib';

Tags.of(app).add('Environment', 'production');
Tags.of(app).add('Project', 'my-app');
Tags.of(app).add('Team', 'backend');
Tags.of(app).add('Owner', 'team@example.com');
```

### 🟡 MEDIUM: 開発環境が常時稼働

```bash
# Systems Manager Automation で夜間停止
aws events put-rule \
  --name StopDevInstances \
  --schedule-expression "cron(0 19 ? * MON-FRI *)" \
  --state ENABLED
```

### 🔵 LOW: gp2 EBSを使用している

```typescript
// gp3への移行（同じIOPS/スループットでgp2より安い）
const volume = new ec2.Volume(this, 'Volume', {
  availabilityZone: 'ap-northeast-1a',
  size: Size.gibibytes(100),
  volumeType: ec2.EbsDeviceVolumeType.GP3,
  iops: 3000,
  throughput: 125,
});
```

---

## コスト削減チートシート

| リソース | 削減策 | 削減率目安 |
|---------|--------|----------|
| EC2 | Savings Plans | 最大72% |
| EC2 | Graviton インスタンス | 最大40% |
| Lambda | ARM/Graviton2 | 最大20% |
| S3 | Intelligent-Tiering | 最大68% |
| EBS | gp2→gp3 移行 | 約20% |
| RDS | Reserved Instances | 最大60% |
| データ転送 | VPC Endpoint | インターネット転送費削減 |

---

## AWSサービス対応表

| コスト管理目的 | 推奨サービス |
|-------------|------------|
| コスト分析 | Cost Explorer, CUR |
| 予算アラート | AWS Budgets |
| 最適化推奨 | Compute Optimizer, Trusted Advisor |
| タグ管理 | Resource Groups Tag Editor |
| 異常検知 | Cost Anomaly Detection |
| 詳細請求 | AWS Cost and Usage Report |
