# コードレビュー Well-Architected ガイド

## このガイドの目的
AWSシステムのコードレビューをWell-Architectedの視点で実施するための包括的なガイド。

---

## コードレビューの進め方

### レビュー開始前の準備
```
1. 変更の影響範囲を把握する
   □ どのAWSサービスに変更があるか
   □ 本番データへの影響があるか
   □ スキーマ変更やデータ移行があるか
   □ 既存APIの変更（破壊的変更）があるか

2. 優先的にチェックするピラーを決める
   □ セキュリティ変更 → SECを最優先
   □ インフラ変更 → REL, COSTを重点確認
   □ DB変更 → PERF, RELを重点確認
   □ 新機能 → 全柱を確認
```

---

## セキュリティレビュー（常に最優先）

### 自動チェックツール（PR前に実行すること）
```bash
# 1. Secrets のスキャン
trufflehog filesystem . --fail
# または
git-secrets --scan

# 2. CDK の Well-Architected チェック
npm run cdk:synth  # cdk-nag が統合されている前提

# 3. 依存関係の脆弱性チェック
npm audit
# または
pip audit

# 4. IaC の静的解析
cfn-guard validate \
  --data cdk.out/*.template.json \
  --rules .cfn-guard/rules/
```

### コードレビュー セキュリティチェックリスト
```
IAM・認証:
□ IAMポリシーにワイルドカード（*:*）がないか
□ 静的IAMアクセスキーが使用されていないか
□ IAMロールに適切な信頼ポリシーが設定されているか
□ Cognito設定が適切か（MFA、パスワードポリシー）

シークレット管理:
□ ハードコードされたシークレット・APIキーがないか
□ 環境変数に実際の値が入っていないか（名前のみが正しい）
□ Secrets Manager / Parameter Store を使用しているか
□ ログにシークレットが出力されていないか

ネットワーク:
□ Security Groupが最小限のポートのみ開放しているか
□ S3バケットのパブリックアクセスがブロックされているか
□ APIエンドポイントに認証があるか
□ HTTPSが強制されているか

データ保護:
□ 保存データが暗号化されているか（S3, DynamoDB, RDS）
□ 転送データが暗号化されているか（TLS）
□ 機密データがログに出力されていないか
□ データ保持期間が適切か（TTL設定）
```

---

## 信頼性レビュー

```
エラーハンドリング:
□ 全ての外部サービス呼び出しにtry-catchがあるか
□ タイムアウトが設定されているか（全ての外部呼び出し）
□ リトライロジックが実装されているか（指数バックオフ）
□ Circuit Breaker パターンがあるか（必要な場合）
□ DLQ（Dead Letter Queue）が設定されているか（SQS/Lambda）

冪等性:
□ POST/PUT操作が冪等か（同じリクエストを複数回実行しても安全か）
□ 重複処理防止のメカニズムがあるか（idempotency key）

スケーラビリティ:
□ DynamoDB Scan を使用していないか
□ 一括処理でバッチサイズが適切か
□ Lambda の同時実行数制限が設定されているか
□ RDS接続が適切に管理されているか（接続プーリング）
```

---

## パフォーマンスレビュー

```
データベース:
□ N+1クエリ問題がないか
□ 適切なインデックスが使用されているか
□ Scan の代わりに Query を使用しているか
□ ページネーションが実装されているか（大量データ取得）
□ 不要なデータ取得がないか（必要なフィールドのみ）

Lambda:
□ コールドスタートの影響を最小化しているか
□ グローバル変数でクライアントを初期化しているか（再利用）
□ 不要なAWS SDK初期化がないか
□ メモリサイズが適切か

コスト:
□ ループ内でAWS APIを呼び出していないか（バッチ処理を使用）
□ 不要なCloudWatch Metricsが発行されていないか
□ ログレベルが本番に適切か（DEBUG→ERRORへ）
```

---

## コードパターンのチェック

### Lambdaの実装パターン

#### ✅ 良いパターン
```python
import boto3
import json
import logging
import os
from aws_lambda_powertools import Logger, Tracer

logger = Logger()
tracer = Tracer()

# グローバルスコープでクライアントを初期化（コールドスタート最適化）
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    logger.info("Processing", extra={"event": event})
    
    # 入力バリデーション
    if 'body' not in event:
        return {'statusCode': 400, 'body': 'Missing body'}
    
    try:
        body = json.loads(event['body'])
        validate(body)  # バリデーション関数
        
        result = table.put_item(Item=body)
        return {'statusCode': 201, 'body': json.dumps({'id': body['id']})}
    
    except ValidationError as e:
        logger.warning("Validation error", extra={"error": str(e)})
        return {'statusCode': 400, 'body': str(e)}
    
    except Exception as e:
        logger.exception("Unexpected error")
        # シークレットや内部情報を含む詳細エラーを外部に返さない
        return {'statusCode': 500, 'body': 'Internal server error'}
```

#### ❌ 悪いパターン（指摘事項）
```python
import boto3

# ❌ ハンドラー内でクライアント初期化（毎回作成）
def handler(event, context):
    dynamodb = boto3.resource('dynamodb')  # コールドスタートのたびに作成
    
    # ❌ エラーハンドリングなし
    body = json.loads(event['body'])
    
    # ❌ Scan使用
    result = table.scan()
    
    # ❌ 詳細エラーをそのまま返す（内部情報漏洩）
    try:
        ...
    except Exception as e:
        return {'statusCode': 500, 'body': str(e)}  # スタックトレース漏洩！
```

---

## CDK / IaC コードレビュー

```typescript
// ❌ よくある問題
const bucket = new s3.Bucket(this, 'Bucket', {
  // publicReadAccess: true,  // 🔴 CRITICAL: パブリック公開
  // encryption: s3.BucketEncryption.UNENCRYPTED,  // 🔴 暗号化なし
  // removalPolicy: RemovalPolicy.DESTROY,  // 🟠 本番でDESTROYは危険
});

// ✅ 正しい実装
const bucket = new s3.Bucket(this, 'Bucket', {
  encryption: s3.BucketEncryption.KMS_MANAGED,
  enforceSSL: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  versioned: true,
  removalPolicy: RemovalPolicy.RETAIN,
  serverAccessLogsBucket: accessLogBucket,
  lifecycleRules: [{
    expiration: Duration.days(365),
    transitions: [{
      storageClass: s3.StorageClass.INFREQUENT_ACCESS,
      transitionAfter: Duration.days(90),
    }],
  }],
});
```

---

## レビューコメントのテンプレート

### CRITICAL コメント
```
🔴 **[SEC] セキュリティ問題 - 必須修正**

**問題**: [具体的な問題の説明]

**リスク**: [放置した場合のリスク]

**修正方法**:
```[言語]
[修正後のコード]
```

**参考**: [AWS公式ドキュメントへのリンク]

---この問題は本番マージ前に必ず修正が必要です。---
```

### HIGH コメント
```
🟠 **[REL] 信頼性の問題 - 早期対応推奨**

**問題**: [説明]
**推奨対応**: [具体的な対応方法]
```

### MEDIUM コメント
```
🟡 **[PERF] パフォーマンス改善の機会**

現在の実装でも動作しますが、以下の改善を検討してください:
[改善提案]
```

### 良いコードへのコメント
```
✅ **[WELL-ARCHITECTED] Good Practice**

[具体的に何が良いか、なぜ良いのかの説明]
```

---

## 承認基準

```
✅ PRをマージしてよい条件:
  □ CRITICAL 問題が0件
  □ HIGH 問題が解決または次スプリントのIssueに登録
  □ cdk-nag でエラーなし
  □ セキュリティスキャンでクリーン
  □ テストが通過

❌ マージ禁止条件:
  □ ハードコードされたシークレットがある
  □ IAMにワイルドカード権限がある
  □ 本番データへの破壊的変更がある
  □ セキュリティスキャンに引っかかっている
  □ cdk-nag にエラーがある（適切なSuppressionなし）
```
