# AI-DLC ワークフロー参照ガイド

## AI-DLCとは

AI Development Lifecycle（AI-DLC）は、AIを開発の協働者として位置付けた開発メソドロジー。
チームとAIがリアルタイムで協調し、要件定義から実装まで一貫した品質を維持する。

AWS Summit Hackathon 2026では、このワークフローの実践が**必須条件**。

---

## ディレクトリ構造と必須ファイル

```
<WORKSPACE-ROOT>/
├── [アプリケーションコード]       ← aidlc-docs/ 外に配置
│
└── aidlc-docs/                   ← ドキュメント専用
    ├── inception/                 ← Inceptionフェーズ成果物
    │   ├── plans/
    │   ├── requirements/
    │   │   └── requirements.md   ← 機能要件・非機能要件
    │   ├── user-stories/
    │   │   └── user-stories.md
    │   ├── application-design/
    │   │   └── application-design.md
    │   └── workflow-planning.md
    ├── construction/              ← Constructionフェーズ成果物
    │   └── {unit-name}/
    │       ├── functional-design/
    │       ├── nfr-requirements/
    │       ├── nfr-design/
    │       ├── infrastructure-design/
    │       └── code/
    ├── build-and-test/
    ├── aidlc-state.md            ← 必須: ワークフロー状態
    └── audit.md                  ← 必須: 全操作ログ
```

---

## Inceptionフェーズ 各ステージ詳細

### Workspace Detection（常時実行）
**目的**: プロジェクトの初期状態を把握
**成果物**: aidlc-state.mdの初期化、audit.mdへの記録
**チェックポイント**:
- Greenfield/Brownfield判定が正確か
- 既存コードの分析が完了しているか

### Requirements Analysis（常時実行）
**目的**: 機能要件・非機能要件の文書化
**成果物**: `aidlc-docs/inception/requirements/requirements.md`
**チェックポイント**:
- 機能要件が網羅的に記載されているか
- 非機能要件（性能・セキュリティ・可用性等）が定義されているか
- ユーザーの承認ログがaudit.mdに記録されているか

### User Stories（条件付き）
**実行条件**: ユーザー向け機能変更、新機能追加時
**成果物**: `aidlc-docs/inception/user-stories/user-stories.md`
**チェックポイント**:
- ペルソナが定義されているか
- ストーリーが「ユーザーとして、〜したい、なぜなら〜」形式で書かれているか
- 受け入れ基準が定義されているか

### Workflow Planning（常時実行）
**目的**: 以降のステージ実行計画の作成
**成果物**: `aidlc-docs/inception/plans/` 配下のプラン文書
**チェックポイント**:
- どのフェーズを実行するか明確か
- ユーザーの承認を得ているか

### Application Design（条件付き）
**実行条件**: 新規コンポーネント・サービスが必要な場合
**成果物**: `aidlc-docs/inception/application-design/application-design.md`
**チェックポイント**:
- アーキテクチャ図が含まれているか
- コンポーネント間の依存関係が明確か
- 技術スタックが定義されているか

### Units Generation（条件付き）
**実行条件**: システムを複数Unitに分解する必要がある場合
**成果物**: Unit of Work文書
**チェックポイント**:
- 各Unitが独立して開発可能か
- Unit間の依存関係と実装順序が明確か
- 各UnitのスコープとDoD（Definition of Done）が定義されているか

---

## Constructionフェーズ 各ステージ詳細

### Functional Design（条件付き、Unit単位）
**実行条件**: 新規データモデル、複雑なビジネスロジックが必要
**成果物**: functional-design.md
**チェックポイント**:
- データモデルが定義されているか
- ビジネスルールが明確か

### NFR Requirements（条件付き、Unit単位）
**実行条件**: 性能・セキュリティ・スケーラビリティ要件がある場合
**成果物**: nfr-requirements.md
**チェックポイント**:
- 非機能要件が具体的な数値で定義されているか

### NFR Design（条件付き、Unit単位）
**実行条件**: NFR Requirementsが実行された場合
**成果物**: nfr-design.md
**チェックポイント**:
- NFR要件に対するアーキテクチャ設計が示されているか

### Infrastructure Design（条件付き、Unit単位）
**実行条件**: インフラ変更・AWSリソース定義が必要な場合
**成果物**: infrastructure-design.md
**チェックポイント**:
- 使用AWSサービスが明記されているか
- デプロイアーキテクチャが図示されているか

### Code Generation（常時実行、Unit単位）
**成果物**: 実際のソースコード + コード要約（aidlc-docs/construction/{unit}/code/）
**チェックポイント**:
- 生成されたコードがFunctional Designと整合しているか
- テストコードが含まれているか

---

## audit.md の正しい形式

```markdown
## [ステージ名またはインタラクション種別]
**Timestamp**: 2026-05-03T10:30:00Z
**User Input**: "[ユーザーの生の入力をそのまま記録 - 要約・言い換え厳禁]"
**AI Response**: "[AIの応答または実行したアクション]"
**Context**: [ステージ、アクション、または決定内容]

---
```

**重要**: ユーザー入力は**完全な生テキスト**で記録すること。要約・言い換えは不可。

---

## aidlc-state.md のチェック形式

```markdown
# AI-DLC State

## Workflow Status
- Phase: Inception
- Current Stage: Completed

## Inception Phase
- [x] Workspace Detection
- [x] Requirements Analysis
- [x] User Stories
- [x] Workflow Planning
- [x] Application Design
- [x] Units Generation
- [ ] Reverse Engineering (N/A - Greenfield)

## Extension Configuration
- Security Baseline: Enabled
- Performance: Enabled

## Units
1. unit-name-1: [status]
2. unit-name-2: [status]
```

---

## よくある AI-DLC 実践ミス

1. **audit.mdを完全上書き**: EditツールでAppendすべきところを全体上書きしている → 過去ログが消滅
2. **ユーザー入力の要約**: 「ユーザーが承認した」だけでは不十分 → 完全な生テキストが必要
3. **ステージのスキップ**: 理由の記録なしにステージをスキップ → 実践証拠が不完全
4. **アプリコードをaidlc-docs/に配置**: ドキュメントとコードの分離違反
5. **aidlc-state.mdの未更新**: ステージ完了後に状態を更新していない
