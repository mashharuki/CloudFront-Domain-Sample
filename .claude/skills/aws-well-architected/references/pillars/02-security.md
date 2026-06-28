# セキュリティ（Security）

## 定義
情報、システム、アセットを保護しながら、リスク評価と緩和戦略を通じてビジネス価値を提供する能力。

> **⚠️ 重要**: セキュリティの問題は最優先で対応する。発見した脆弱性は必ず CRITICAL または HIGH で報告すること。

---

## 設計原則（7つ）

1. **強力なアイデンティティ基盤を実装する**
   - 最小特権の原則を徹底
   - 静的な長期認証情報を使用しない（IAM Role を使用）
   - MFA を必須化

2. **トレーサビリティの維持**
   - すべてのAPIコール・リソース変更をログに記録
   - リアルタイムモニタリングとアラート

3. **すべての層にセキュリティを適用する（多層防御）**
   - ネットワーク層・アプリケーション層・データ層の全層で保護
   - Defense in Depth（多層防御）を実装

4. **セキュリティのベストプラクティスの自動化**
   - セキュリティチェックをCI/CDパイプラインに組み込む
   - AWS Config Rules、Security Hub で継続的評価

5. **転送中・保存中のデータを保護する**
   - すべてのデータを暗号化（TLS 1.2以上、AES-256）
   - KMSでキー管理を一元化

6. **人をデータから遠ざける**
   - 本番データへの直接アクセスを最小化
   - 必要な場合のみ一時的なアクセスを付与

7. **セキュリティイベントへの準備**
   - インシデントレスポンス計画を事前に策定・テスト
   - セキュリティゲームデイの実施

---

## ベストプラクティスチェックリスト

### アイデンティティとアクセス管理（SEC 1-4）

#### 必須チェック（CRITICAL）
- [ ] **IAM Root ユーザーの使用禁止**
  - MFAが有効化されているか
  - アクセスキーが存在しないか: `aws iam get-account-summary`
- [ ] **IAMポリシーに `*:*` や `"Action": "*"` がないか**
  - `AdministratorAccess` は使用しない（真に必要な場合のみ）
  - 最小権限でポリシーを作成する
- [ ] **長期IAMアクセスキーを使用していないか**
  - EC2/Lambda/ECSはIAM Roleを使用
  - CI/CDはOIDCプロバイダーを使用
- [ ] **MFAが重要アカウントで有効化されているか**

#### 推奨チェック
- [ ] **SEC 2**: IAM Identity Center (SSO) を使用しているか
- [ ] **SEC 3**: 権限境界（Permission Boundary）を設定しているか
- [ ] **SEC 4**: IAM Access Analyzerで外部公開を検出しているか

### 検出（SEC 5-6）
- [ ] **CloudTrail が全リージョンで有効化されているか**
  - ログファイル検証が有効か
  - S3バケットに適切に保存されているか
- [ ] **AWS Config が有効化されているか**
  - 必須ルールが設定されているか
- [ ] **GuardDuty が有効化されているか**
- [ ] **Security Hub が有効化されているか**

### インフラストラクチャ保護（SEC 7-8）
- [ ] **VPC設計が適切か**
  - パブリック/プライベートサブネットが分離されているか
  - NAT Gatewayを経由したアウトバウンドのみ許可
  - 不要なポートが開放されていないか
- [ ] **Security Group のルールが最小限か**
  - `0.0.0.0/0` からのインバウンドは最小化
  - ソースにCIDRではなくSecurity Group IDを使用
- [ ] **WAFが重要なWebアプリに適用されているか**
- [ ] **VPCエンドポイントを使用してインターネット経由通信を排除しているか**

### データ保護（SEC 9-10）
- [ ] **保存データの暗号化**
  - S3: デフォルト暗号化（SSE-S3またはSSE-KMS）
  - RDS/DynamoDB: 暗号化有効化
  - EBS: 暗号化有効化
  - Secrets Manager/Parameter Store使用（ハードコード禁止）
- [ ] **転送中データの暗号化**
  - HTTPSのみ（HTTP→HTTPSリダイレクト）
  - TLS 1.2以上を使用
- [ ] **機密データの分類と保護**
  - Macie で S3のデータを分類

### アプリケションセキュリティ（SEC 11）
- [ ] **OWASP Top 10 対策が実施されているか**
  - SQLインジェクション対策
  - XSS対策
  - CSRF対策
- [ ] **入力値検証が実装されているか**
- [ ] **依存関係の脆弱性チェックが自動化されているか**
  - Amazon Inspector / GitHub Dependabot

---

## よくある重大問題と修正例

### 🔴 CRITICAL: ハードコードされた認証情報

```python
# ❌ 絶対NG
aws_access_key = "AKIAIOSFODNN7EXAMPLE"
aws_secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# ✅ 正しい実装: Secrets Manager を使用
import boto3
import json

def get_secret(secret_name):
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])
```

### 🔴 CRITICAL: 過剰なIAM権限

```json
// ❌ 絶対NG
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*"
}

// ✅ 最小権限ポリシー
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject"
  ],
  "Resource": "arn:aws:s3:::my-specific-bucket/*",
  "Condition": {
    "StringEquals": {
      "s3:prefix": ["uploads/"]
    }
  }
}
```

### 🔴 CRITICAL: 暗号化なしのS3バケット

```typescript
// CDK での正しい実装
const bucket = new s3.Bucket(this, 'SecureBucket', {
  encryption: s3.BucketEncryption.KMS_MANAGED,
  enforceSSL: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  versioned: true,
  serverAccessLogsBucket: accessLogsBucket,
  removalPolicy: RemovalPolicy.RETAIN,
});
```

### 🔴 CRITICAL: 認証なしの公開API

```typescript
// API Gateway での認証設定
const api = new apigateway.RestApi(this, 'SecureApi', {
  defaultMethodOptions: {
    authorizationType: apigateway.AuthorizationType.COGNITO,
    authorizer: cognitoAuthorizer,
  },
  deployOptions: {
    accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
    accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
  },
});
```

---

## AWSサービス対応表

| セキュリティ領域 | 推奨サービス |
|-----------------|------------|
| 認証・認可 | IAM, Cognito, IAM Identity Center |
| シークレット管理 | Secrets Manager, SSM Parameter Store |
| 脅威検出 | GuardDuty, Inspector, Macie |
| 監査・ログ | CloudTrail, CloudWatch Logs, Config |
| コンプライアンス | Security Hub, Config Rules |
| ネットワーク保護 | WAF, Shield, VPC, Security Groups |
| 証明書 | ACM (Certificate Manager) |
| 暗号化 | KMS, CloudHSM |
