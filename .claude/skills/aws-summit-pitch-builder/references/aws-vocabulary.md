# AWS & クラウド 用語集

AWS Summit Japan の審査員（AWSエンジニア・事業責任者）にとって普遍的に知られている用語。
これらを「ジャーゴン」扱いしない。誤用が疑われる場合のみ指摘する。

## AWS コアサービス

| 用語 | 正しい使い方の例 |
|---|---|
| Lambda | サーバーレス関数実行。「Lambda で〜を処理する」 |
| API Gateway | REST/WebSocket APIのマネージドゲートウェイ |
| DynamoDB | フルマネージドNoSQL DB。「DynamoDBで〜を永続化する」 |
| S3 | オブジェクトストレージ。静的ファイル、バックアップ、データレイク |
| CloudFront | CDN。グローバル配信 + キャッシュ |
| Cognito | 認証・認可。「Cognitoでユーザー管理」 |
| Bedrock | 生成AI API。「Bedrock経由でClaude/Titanを呼ぶ」 |
| EventBridge | イベントバス。「EventBridgeで非同期連携」 |
| SQS | マネージドキュー。「SQSで非同期処理をデカップリング」 |
| SNS | Pub/Sub通知。「SNSでファンアウト」 |
| Step Functions | ワークフローオーケストレーション |
| Fargate | サーバーレスコンテナ実行 |
| ECS | コンテナオーケストレーション |
| RDS | マネージドRDB |
| Aurora | MySQL/PostgreSQL互換マネージドDB |
| Aurora Serverless | オンデマンドスケールのAurora |
| ElastiCache | インメモリキャッシュ（Redis/Memcached） |
| OpenSearch | 全文検索、ログ分析 |
| Kinesis | リアルタイムストリーミング |
| Glue | ETL/データカタログ |
| Athena | S3上でSQLクエリ |
| QuickSight | BIダッシュボード |
| CloudWatch | ログ・メトリクス・アラート |
| X-Ray | 分散トレーシング |
| Secrets Manager | シークレット管理 |
| SSM Parameter Store | 設定値管理 |
| WAF | Webアプリケーションファイアウォール |
| Shield | DDoS保護 |
| KMS | 暗号化キー管理 |
| IAM | 認証・認可。「最小権限原則でIAMロールを設計」 |
| CDK | Infrastructure as Code（TypeScript/Python等） |
| SAM | サーバーレスアプリのIaC |
| CloudFormation | AWSリソースのテンプレートベースプロビジョニング |
| Amplify | フロントエンド + バックエンドのフルスタックホスティング |

## アーキテクチャパターン用語

| 用語 | 意味 |
|---|---|
| サーバーレス | 実行時のみ課金、スケールは自動 |
| マネージドサービス | AWSがインフラ管理を担う |
| イベント駆動 | イベントトリガーで非同期処理 |
| マイクロサービス | 機能単位で独立したサービス群 |
| IaC | インフラをコードで定義・管理 |
| ARM64 / Graviton | AWSのカスタムCPU、コスト効率が高い |
| VPC | 仮想プライベートクラウド |
| CDN | コンテンツデリバリーネットワーク |
| SSE | Server-Sent Events（リアルタイムストリーミング） |
| WebSocket | 双方向リアルタイム通信 |
| cold start | Lambda初回起動時の遅延 |

## 生成AI / Bedrock 用語

| 用語 | 意味 |
|---|---|
| Bedrock | AWSのマネージド生成AIサービス |
| converse API | Bedrock の統一チャット API |
| Tool Use | LLMに関数呼び出しをさせる機能（Function Calling） |
| Claude / Titan / Llama | Bedrock上で使えるモデル |
| RAG | Retrieval Augmented Generation（検索拡張生成） |
| Knowledge Base | Bedrock のマネージドRAGインフラ |
| Agent | Bedrock のマネージドエージェントオーケストレーション |
| ガードレール | Bedrock の出力フィルタリング機能 |
| モデルID | `anthropic.claude-haiku-4-5` のような識別子 |

## 用語が誤用されている場合のみ指摘する

以下の場合のみ指摘:
1. サービスの機能を誤って説明している（例: DynamoDBをRDBとして説明する）
2. 廃止されたサービス名または旧APIを使っている
3. ピッチのターゲットが非技術者で、用語の説明が必要な場合

それ以外は指摘しない。
