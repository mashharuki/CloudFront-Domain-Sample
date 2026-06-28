# 信頼性（Reliability）

## 定義
意図した機能を期待通りに、正しく、一貫して実行するワークロードの能力。
また、ワークロードのライフサイクル全体を通じて、ワークロードを運用およびテストする能力。

---

## 設計原則（5つ）

1. **障害から自動的に復旧する**
   - KPIを継続的にモニタリング
   - しきい値超過時に自動復旧を開始（Auto Scaling, Circuit Breaker）

2. **リカバリ手順をテストする**
   - 本番環境と同等の環境でのリカバリテスト
   - Chaos Engineering（AWS FIS）を活用

3. **水平方向にスケールして可用性を高める**
   - シングルポイントオブフェイラー（SPOF）を排除
   - マルチAZ / マルチリージョン構成

4. **容量を推測しない**
   - Auto Scaling で動的にスケール
   - 需要に基づいたリソース配分

5. **自動化で変更を管理する**
   - インフラ変更を自動化（IaC）
   - 変更の追跡と確認プロセス

---

## ベストプラクティスチェックリスト

### 基盤（REL 1-2）

#### CRITICAL チェック
- [ ] **REL 1**: サービスクォータを管理しているか
  - AWS Service Quotas で制限を確認
  - 必要に応じて事前に引き上げ申請
  - `aws service-quotas list-service-quotas --service-code ec2`
- [ ] **REL 2**: ネットワークトポロジーが適切に設計されているか
  - マルチAZ 構成
  - VPC 設計（プライベート/パブリックサブネット分離）
  - Transit Gateway や VPC Peering の適切な使用

### ワークロードアーキテクチャ（REL 3-4）
- [ ] **REL 3**: 分散システムで依存関係を管理しているか
  - Circuit Breaker パターンの実装
  - タイムアウトの設定（全APIコール）
  - 冪等性（Idempotency）の確保
  - 指数バックオフとジッターによるリトライ
- [ ] **REL 4**: ワークロードが障害に耐えられる設計か
  - Single Point of Failure がないか
  - Bulkhead（隔壁）パターンの採用
  - サービスの疎結合化（SQS, SNS経由）

### 変更管理（REL 5-7）
- [ ] **REL 5**: デプロイ変更を監視しているか
  - Blue/Green またはカナリアデプロイ
  - ロールバック手順の準備
- [ ] **REL 6**: リソースを需要に応じてスケールできるか
  - Auto Scaling Group の設定
  - Lambda の同時実行制限の設定
  - DynamoDB の容量モードの選択（On-Demand推奨）
- [ ] **REL 7**: ワークロードの変更を統合テストしているか

### 障害管理（REL 8-12）
- [ ] **REL 8**: データをバックアップしているか
  - AWS Backup の設定
  - S3 バージョニングの有効化
  - RDS スナップショット（自動/手動）
  - DynamoDB PITRの有効化
- [ ] **REL 9**: 障害を隔離して影響を軽減しているか
  - マルチリージョン or マルチAZ
  - 障害ドメインの定義
- [ ] **REL 10**: リカバリを自動化しているか
  - RDS の Multi-AZ フェイルオーバー
  - ELB の自動ヘルスチェック
  - Auto Scaling の自動置換
- [ ] **REL 11**: 障害から学んでいるか
  - RTO/RPO が定義・テストされているか
- [ ] **REL 12**: 本番環境でカオスエンジニアリングを実施しているか

---

## よくある問題と修正例

### 🔴 CRITICAL: シングルAZ構成（SLA 99%以上）

```typescript
// ❌ シングルAZ
const db = new rds.DatabaseInstance(this, 'DB', {
  multiAz: false, // 危険！
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
});

// ✅ Multi-AZ 構成
const db = new rds.DatabaseInstance(this, 'DB', {
  multiAz: true,
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  backupRetention: Duration.days(7),
  deletionProtection: true,
});
```

### 🔴 CRITICAL: バックアップなし

```typescript
// DynamoDB PITR（ポイントインタイムリカバリ）
const table = new dynamodb.Table(this, 'Table', {
  pointInTimeRecovery: true,
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
```

### 🟠 HIGH: Auto Scalingなし

```typescript
// Lambda の同時実行制限設定
const fn = new lambda.Function(this, 'Function', {
  reservedConcurrentExecutions: 100,
  // デフォルトタイムアウトを設定（無限ループ防止）
  timeout: Duration.seconds(30),
});

// ECS Service の Auto Scaling
const scaling = service.autoScaleTaskCount({ maxCapacity: 10 });
scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
});
```

### 🟠 HIGH: Circuit Breaker なし

```python
# Lambda での指数バックオフリトライ
import time
import random

def call_with_retry(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = (2 ** attempt) + random.uniform(0, 1)
            time.sleep(wait_time)
```

---

## 可用性目標別の推奨構成

| SLA目標 | 構成 |
|---------|------|
| 99% (87.6h/年) | シングルAZ（開発環境のみ可） |
| 99.9% (8.76h/年) | マルチAZ |
| 99.95% (4.38h/年) | マルチAZ + ReadReplica |
| 99.99% (52.6m/年) | マルチリージョン Active-Passive |
| 99.999% (5.26m/年) | マルチリージョン Active-Active |

---

## AWSサービス対応表

| 目的 | 推奨サービス |
|------|------------|
| ロードバランシング | ALB, NLB |
| 自動スケーリング | Auto Scaling Group, Lambda |
| マネージドDB | RDS Multi-AZ, DynamoDB Global Tables |
| メッセージキュー | SQS (DLQ必須), SNS |
| バックアップ | AWS Backup, S3 Versioning |
| 障害テスト | AWS Fault Injection Simulator |
| サーキットブレーカー | AWS App Mesh, Resilience Hub |
| DNS フェイルオーバー | Route 53 Health Check |
