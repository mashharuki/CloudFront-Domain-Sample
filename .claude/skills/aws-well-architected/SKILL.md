---
name: aws-well-architected
description: >
  AWS Well-Architected Framework（6つの柱）に基づいてAWSシステムを設計・構築・テスト・リファクタリング・レビューする際に、
  厳格なベストプラクティス準拠チェックと改善提案を提供する専門スキル。
  AWSを使ったシステム開発のあらゆる場面で積極的に使用すること。
  ユーザーがAWSシステムの設計・実装・インフラ構成・CDK/CloudFormationテンプレート・Lambda関数・API Gateway設計・
  DynamoDB設計・セキュリティポリシー・コスト試算・アーキテクチャレビュー・コードレビューなど
  AWSに関するいかなるタスクについて言及した場合は必ずこのスキルを参照してWell-Architected原則への準拠を確認すること。
  "設計してほしい"・"実装してほしい"・"レビューしてほしい"・"最適化したい"・"CDK"・"Lambda"・"DynamoDB"・
  "API Gateway"・"S3"・"CloudFront"・"ECS"・"Fargate"・"Bedrock"・"Cognito"・"IAM"などの
  キーワードが出た場合は必ずこのスキルを適用すること。
version: 1
metadata:
  framework: aws-well-architected
  task: [design, develop, test, refactor, review, architecture, security, cost]
  persona: [architect, developer, devops, sre, security-engineer]
  workload: [serverless, containers, microservices, monolith, data, ml, web]
---

# AWS Well-Architected Framework スキル

## このスキルの目的

AWSを採用したシステムの設計・開発・テスト・リファクタリング・レビューの全ステップで、
**AWS Well-Architected Framework の6つの柱**に基づいた厳格な品質チェックと具体的な改善提案を提供する。

> **重要**: このスキルは「厳しめ」に運用する。発見した問題は明確に指摘し、解決策を具体的に提示する。
> 「おそらく問題ないと思います」のような曖昧な評価は行わない。

---

## 6つの柱（Pillars）概要

| 柱 | 略称 | 焦点 |
|----|------|------|
| オペレーショナルエクセレンス | OE | ビジネス価値を着実に提供し、継続的に改善する |
| セキュリティ | SEC | 情報・システム・資産の保護 |
| 信頼性 | REL | 意図した機能を期待通りに一貫して実行する |
| パフォーマンス効率 | PERF | リソースを効率的に使用してパフォーマンス要件を満たす |
| コスト最適化 | COST | 最低コストでビジネス価値を実現する |
| 持続可能性 | SUS | 環境への影響を最小化する |

詳細な原則・ベストプラクティスは各参照ファイルを読むこと:
- `references/pillars/01-operational-excellence.md`
- `references/pillars/02-security.md`
- `references/pillars/03-reliability.md`
- `references/pillars/04-performance-efficiency.md`
- `references/pillars/05-cost-optimization.md`
- `references/pillars/06-sustainability.md`

---

## 作業フェーズ別の適用方法

ユーザーのリクエストを受けたら、まず**作業フェーズを特定**し、該当するガイドを参照する:

| フェーズ | トリガーキーワード | 参照ファイル |
|----------|------------------|--------------|
| 設計 | アーキテクチャ設計、システム設計、構成検討 | `references/stages/design-review.md` |
| 開発 | 実装、コード作成、CDK, CloudFormation | `references/stages/development-guide.md` |
| テスト | テスト、品質確認、負荷試験、セキュリティテスト | `references/stages/testing-guide.md` |
| リファクタリング | 改善、最適化、移行、リアーキテクチャ | `references/stages/refactoring-guide.md` |
| レビュー | コードレビュー、アーキテクチャレビュー、監査 | `references/stages/code-review-guide.md` |

**フェーズが不明確な場合**は、設計レビュー + コードレビューの両方を実行する。

---

## 評価プロセス（全フェーズ共通）

### Step 1: コンテキスト収集
タスクを受けたら最初に以下を確認する（不明な場合は質問する）:
- システムの種類（Webアプリ / API / データパイプライン / MLワークロード等）
- 想定トラフィック・データ量
- 可用性要件（SLA）
- 規制・コンプライアンス要件
- 予算制約

### Step 2: 関連ピラーの特定
作業内容に応じて**関連する柱を特定**し、対応する参照ファイルを読む。
全柱を毎回チェックするのではなく、コンテキストに応じて優先度を設定する:

- セキュリティ関連変更 → SEC を必ずチェック
- インフラ変更 → REL, PERF, COST をチェック
- データベース設計 → REL, PERF, COST をチェック
- 認証・認可実装 → SEC を必ずチェック
- コスト最適化リクエスト → COST, PERF をチェック

### Step 3: チェック実行
各ピラーの原則・ベストプラクティスに照らしてチェックを実行する。
参照ファイルの「チェックリスト」セクションを使用する。

### Step 4: 結果報告
以下の**標準レポート形式**で結果を報告する:

```
## Well-Architected レビュー結果

### サマリー
- チェック済みピラー: [リスト]
- 重大な問題: X件
- 改善推奨: Y件
- ベストプラクティス準拠: Z件

### 発見事項

#### 🔴 CRITICAL（必須修正）
**[ピラー] 項目名**
- 問題: [具体的な問題の説明]
- リスク: [放置した場合のリスク]
- 修正方法: [具体的なコードや設定の変更手順]
- 参考: [AWS公式ドキュメントURL]

#### 🟠 HIGH（早期対応推奨）
**[ピラー] 項目名**
- 問題: [説明]
- 推奨対応: [具体的な改善方法]

#### 🟡 MEDIUM（次スプリントで対応）
**[ピラー] 項目名**
- 問題: [説明]
- 推奨対応: [改善方法]

#### 🔵 LOW（改善機会）
**[ピラー] 項目名**
- 現状: [説明]
- 最適化案: [提案]

### 準拠確認済み項目
✅ [Well-Architectedに準拠している良い設計の項目を列挙]

### 次のアクション（優先順位付き）
1. [最優先アクション]
2. [次のアクション]
...
```

---

## 重要な判断基準

### CRITICAL（必須修正）に該当するもの
以下は本番環境での使用前に**必ず修正が必要**:
- IAMの過剰権限（`*:*` ポリシー、AdminAccess等）
- 暗号化なしのデータ保存・転送
- 認証なしの公開APIエンドポイント
- シングルAZ構成（SLAが99%以上の場合）
- ハードコードされたシークレット・認証情報
- バックアップ/DRなし（重要データの場合）
- CloudTrail・ログ無効化

### HIGH（早期対応推奨）
- Auto Scalingの未設定
- 適切なモニタリング・アラートの欠如
- コストの可視化ができていない
- デプロイ時の手動ステップ（自動化不足）
- テストの欠如（特にカオスエンジニアリング）

---

## 使用する主要AWSサービスパターン

### セキュリティ
- **認証情報管理**: AWS Secrets Manager / Parameter Store（絶対にハードコード禁止）
- **IAM**: 最小権限、IAM Roles（静的キー禁止）
- **暗号化**: KMS, ACM（転送中・保存時の両方）
- **ネットワーク**: VPC, Security Groups, NACLs, WAF
- **監査**: CloudTrail, Config, GuardDuty, SecurityHub

### 信頼性
- **マルチAZ**: RDS Multi-AZ, DynamoDB Global Tables, ELB
- **障害対応**: Circuit Breaker, Retry with Exponential Backoff
- **バックアップ**: AWS Backup, S3 Versioning, RDS Snapshots
- **復旧テスト**: Chaos Engineering with AWS Fault Injection Simulator

### パフォーマンス
- **キャッシュ**: ElastiCache (Redis/Memcached), CloudFront, API Gatewayキャッシュ
- **DB最適化**: DynamoDB GSI/LSI設計, RDS Read Replica, Aurora
- **非同期処理**: SQS, SNS, EventBridge, Kinesis

### コスト最適化
- **コンピュート**: Lambda (サーバーレス), Fargate Spot, EC2 Savings Plans
- **ストレージ**: S3 Intelligent-Tiering, EBS gp3
- **モニタリング**: Cost Explorer, AWS Budgets, Compute Optimizer

---

## AWS CDK / CloudFormation 固有チェック

CDK または CloudFormation を使用している場合、追加でチェックする:

```
□ cdk-nag を実行して準拠確認（AwsSolutionsChecks）
□ cfn-guard でポリシーチェック
□ 削除保護の設定（terminationProtection: true for stateful resources）
□ リソースの除去ポリシー（RemovalPolicy）が適切に設定されているか
□ cdk.context.json がコミットされているか
□ Secrets Manager / Parameter Store の参照（ハードコード禁止）
□ L2 Constructsの優先使用
```

---

## 参照リソース

- [AWS Well-Architected Framework 公式](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
- [Well-Architected Labs](https://www.wellarchitectedlabs.com/)
- [AWS Well-Architected Tool](https://aws.amazon.com/well-architected-tool/)
- [AWS Solutions Library](https://aws.amazon.com/solutions/)
