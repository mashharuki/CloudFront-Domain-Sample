# オペレーショナルエクセレンス（Operational Excellence）

## 定義
優れたカスタマーエクスペリエンスを着実に提供しながら、ソフトウェアを正しく構築する取り組み。
チームの編成、ワークロードの設計、大規模な運用、継続的な改善が含まれる。

---

## 設計原則（8つ）

1. **ビジネス成果を中心にチームを編成する**
   - リーダーシップのビジョンと効果的な運用モデルを整合させる
   - KPIを設定してビジネス目標に紐付ける

2. **オブザーバビリティを実装して実用的なインサイトを得る**
   - ワークロードの動作・パフォーマンス・信頼性・コスト・健全性を包括的に把握
   - データドリブンな意思決定を実現する

3. **可能な場合は安全に自動化する**
   - ワークロードとその運用をコードとして定義（IaC）
   - ガードレールを設定した上で自動化する

4. **小規模かつ可逆的な変更を頻繁に行う**
   - 疎結合アーキテクチャで変更影響範囲を最小化
   - Blue/Green デプロイ、カナリアリリースを活用

5. **オペレーション手順を頻繁に改善する**
   - Runbookとドキュメントを常に最新状態に保つ
   - ゲームデイ・ポストモーテムで継続改善

6. **障害を予測する**
   - 障害シナリオをシミュレーション（Chaos Engineering）
   - Pre-Mortem（障害事前分析）を実施

7. **運用上のイベントとメトリクスから学ぶ**
   - すべての障害・インシデントから教訓を得る
   - Blameless post-mortem 文化を構築

8. **マネージドサービスを使用する**
   - 可能な限りAWSマネージドサービスを活用
   - 差別化につながらない運用作業を削減

---

## ベストプラクティスチェックリスト

### 組織（OPS 1-3）
- [ ] **OPS 1**: ビジネス優先順位が明確に定義されているか
  - リスクレジストリが存在するか
  - 定期的に優先順位を見直しているか
- [ ] **OPS 2**: チーム構造とオーナーシップが明確か
  - 各コンポーネントのオーナーが定義されているか
  - RACI / 責任分担が明確か
- [ ] **OPS 3**: 実験と学習の文化があるか
  - 心理的安全性があるか
  - 失敗から学ぶプロセスがあるか

### 準備（OPS 4-7）
- [ ] **OPS 4**: ワークロードを設計段階でオブザーバビリティを組み込んでいるか
  - メトリクス・ログ・トレースの3つが揃っているか（Observability三本柱）
  - CloudWatch, X-Ray, CloudTrail が設定されているか
- [ ] **OPS 5**: ワークロードを変更を安全に行えるよう設計しているか
  - CI/CD パイプラインが整備されているか
  - デプロイのロールバック手順があるか
- [ ] **OPS 6**: 本番環境と同等のテスト環境があるか
- [ ] **OPS 7**: 障害モードを理解し文書化しているか

### 運用（OPS 8-9）
- [ ] **OPS 8**: ワークロードの健全性を理解しているか
  - SLI/SLO/SLA が定義されているか
  - アラームがビジネス価値に紐付いているか
- [ ] **OPS 9**: 顧客の需要に対応するためのイベント管理があるか
  - オンコール体制が整備されているか
  - Incident Management プロセスがあるか

### 進化（OPS 10-12）
- [ ] **OPS 10**: 継続的な改善プロセスがあるか
  - Post-Mortem が定期的に実施されているか
  - 改善アクションが追跡されているか
- [ ] **OPS 11**: 運用の知見をチーム間で共有しているか
- [ ] **OPS 12**: ビジネス成果に対する運用のフィードバックループがあるか

---

## よくある問題と修正方法

### 問題1: ログが無効化されている
```
# CloudTrail の有効化（必須）
aws cloudtrail create-trail \
  --name my-trail \
  --s3-bucket-name my-cloudtrail-bucket \
  --is-multi-region-trail \
  --enable-log-file-validation

# CDK での実装
new cloudtrail.Trail(this, 'Trail', {
  isMultiRegionTrail: true,
  enableFileValidation: true,
  s3Bucket: bucket,
});
```

### 問題2: アラームが未設定
```typescript
// Lambda エラー率アラーム
new cloudwatch.Alarm(this, 'LambdaErrorRate', {
  metric: lambdaFunction.metricErrors(),
  threshold: 1,
  evaluationPeriods: 1,
  alarmDescription: 'Lambda function error rate exceeded threshold',
  actionsEnabled: true,
  alarmActions: [snsTopic.topicArn],
});
```

### 問題3: 手動デプロイ（自動化なし）
- GitHub Actions / CodePipeline を整備
- インフラは CDK / CloudFormation で管理
- デプロイ手順を文書化・自動化する

---

## AWSサービス対応表

| 目的 | 推奨サービス |
|------|------------|
| メトリクス・ログ | CloudWatch Metrics, CloudWatch Logs |
| 分散トレーシング | AWS X-Ray |
| 監査ログ | CloudTrail |
| 設定変更追跡 | AWS Config |
| CI/CD | CodePipeline, CodeBuild, CodeDeploy |
| インシデント管理 | AWS Systems Manager Incident Manager |
| Runbook | Systems Manager Automation |
| カオスエンジニアリング | AWS Fault Injection Simulator |
