# 技術スタック選定ガイド

## 目次
1. [スケール別構成](#1-スケール別構成)
2. [コンポーネント別選定表](#2-コンポーネント別選定表)
3. [AWSネイティブ構成](#3-awsネイティブ構成)
4. [リアルタイム処理設計](#4-リアルタイム処理設計)
5. [必須ライブラリ一覧](#5-必須ライブラリ一覧)

---

## 1. スケール別構成

### 小規模（PoC・スタートアップ）

**目安**: 月間100時間未満の音声処理

```
音声入力
   ↓
[Python FastAPI]
   ├─ pyannote.audio      (話者分離)
   ├─ Faster-Whisper      (ASR)
   ├─ transformers        (感情認識)
   └─ Claude API          (5W1H抽出・サマリー)
   ↓
SQLite / PostgreSQL (結果保存)
   ↓
Streamlit / Next.js (可視化)
```

**インフラ**: 単一EC2 g4dn.xlarge または Lambda + SageMaker Endpoint

### 中規模（SMB・エンタープライズ内製）

**目安**: 月間1000時間の音声処理、複数チーム利用

```
音声/テキスト入力
   ↓
[API Gateway]
   ↓
[SQS キュー]
   ↓
[ECS Fargate クラスター]
   ├─ 話者分離ワーカー
   ├─ ASRワーカー
   ├─ 感情認識ワーカー
   └─ 情報抽出ワーカー
   ↓
[DynamoDB]           (結果・メタデータ)
[S3]                 (音声ファイル・中間成果物)
[OpenSearch]         (全文検索・分析)
   ↓
[CloudFront + Next.js] (ダッシュボード)
```

### 大規模（リアルタイム処理・大企業）

```
[Kinesis Data Streams] (音声ストリーム受信)
   ↓
[Kinesis Data Analytics] (リアルタイム前処理)
   ↓
[Lambda] (セグメント検出・ルーティング)
   ↓
[SageMaker Endpoints]
   ├─ 話者分離エンドポイント
   ├─ ASRエンドポイント (Whisper)
   └─ 感情認識エンドポイント
   ↓
[Bedrock] (LLM処理: 5W1H・サマリー)
   ↓
[DynamoDB Streams] → [Lambda] → [WebSocket API] (リアルタイム配信)
```

---

## 2. コンポーネント別選定表

### 音声認識 (ASR)

| ライブラリ | 日本語精度 | 速度 | コスト | 推奨シーン |
|-----------|---------|------|------|----------|
| OpenAI Whisper large-v3 | ◎ | 遅い | GPU必要 | 高精度バッチ処理 |
| Faster-Whisper | ◎ | 速い | GPU効率◎ | **推奨デフォルト** |
| AWS Transcribe | ○ | リアルタイム | 従量課金 | AWSネイティブ構成 |
| ReazonSpeech | ◎ | 速い | 無料 | 日本語特化 |
| Google Speech-to-Text | ○ | リアルタイム | 従量課金 | マルチ言語 |

**日本語推奨**: `Faster-Whisper` + `large-v3` モデル

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda", compute_type="float16")
segments, info = model.transcribe(
    "audio.wav",
    language="ja",
    beam_size=5,
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 500}
)
```

### 話者分離

| ライブラリ | DER | 速度 | ライセンス | 推奨シーン |
|-----------|-----|------|---------|----------|
| pyannote 3.1 | ~11% | 5x RT | MIT+登録 | **推奨デフォルト** |
| NeMo MSDD | ~10% | 高速 | Apache 2.0 | 商用優先 |
| AWS Transcribe | ~15% | RT | 従量課金 | AWSフルマネージド |
| Resemblyzer | 簡易 | 非常に速い | MIT | 軽量PoC |

### 感情認識

| アプローチ | 精度 | コスト | 推奨シーン |
|-----------|------|------|----------|
| LLM (Claude) | 最高 | 高 | 高精度・ドメイン適応 |
| RoBERTa fine-tuned | 高 | 低 | 英語・高速 |
| Wav2Vec2 (音声) | 高 | GPU必要 | マルチモーダル |
| MFCC + XGBoost | 中 | 非常に低 | リアルタイム・エッジ |

### LLM（情報抽出・サマリー）

| モデル | 精度 | コスト | 推奨 |
|--------|------|------|------|
| Claude Sonnet 4 | ◎ | 中 | **デフォルト推奨** |
| Claude Haiku 4.5 | ○ | 低 | 高速・大量処理 |
| Bedrock Claude | ○ | 中 | AWSネイティブ |
| GPT-4o | ◎ | 高 | 英語特化 |

---

## 3. AWSネイティブ構成

```python
# AWS CDK 構成例
from aws_cdk import (
    aws_lambda as lambda_,
    aws_sqs as sqs,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
    aws_apigateway as apigw,
    aws_bedrock as bedrock
)

class ConversationIntelligenceStack(Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)

        # S3: 音声ファイル保存
        audio_bucket = s3.Bucket(self, "AudioBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            lifecycle_rules=[s3.LifecycleRule(
                expiration=Duration.days(90)
            )]
        )

        # DynamoDB: 分析結果
        results_table = dynamodb.Table(self, "AnalysisResults",
            partition_key=dynamodb.Attribute(
                name="conversation_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="created_at",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST
        )

        # SQS: 処理キュー
        analysis_queue = sqs.Queue(self, "AnalysisQueue",
            visibility_timeout=Duration.minutes(15),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=sqs.Queue(self, "DLQ")
            )
        )
```

---

## 4. リアルタイム処理設計

### WebSocket ベースのリアルタイムパイプライン

```python
import asyncio
import websockets
import numpy as np
from dataclasses import dataclass

@dataclass
class AudioChunk:
    data: bytes
    session_id: str
    timestamp: float

class RealtimePipeline:
    CHUNK_DURATION = 2.0   # 2秒ごとに処理
    OVERLAP = 0.5           # 0.5秒のオーバーラップ

    def __init__(self):
        self.buffer = {}  # session_id -> audio buffer
        self.context = {}  # session_id -> conversation context

    async def process_chunk(self, chunk: AudioChunk) -> dict:
        # バッファリング
        if chunk.session_id not in self.buffer:
            self.buffer[chunk.session_id] = bytearray()
        self.buffer[chunk.session_id].extend(chunk.data)

        # チャンクが溜まったら処理
        if len(self.buffer[chunk.session_id]) >= 16000 * 2 * self.CHUNK_DURATION:
            audio_array = np.frombuffer(self.buffer[chunk.session_id], dtype=np.int16)

            # 並列処理
            asr_result, emotion_result = await asyncio.gather(
                self._run_asr(audio_array, chunk.session_id),
                self._run_emotion(audio_array)
            )

            # バッファをオーバーラップ分だけ保持
            overlap_samples = int(16000 * self.OVERLAP)
            self.buffer[chunk.session_id] = bytearray(
                audio_array[-overlap_samples:].tobytes()
            )

            return {
                "session_id": chunk.session_id,
                "timestamp": chunk.timestamp,
                "text": asr_result.get("text"),
                "speaker": asr_result.get("speaker"),
                "emotion": emotion_result
            }
```

---

## 5. 必須ライブラリ一覧

### requirements.txt（プロダクション）

```
# 音声処理
pyannote.audio==3.1.1
faster-whisper==1.0.1
librosa==0.10.1
soundfile==0.12.1
webrtcvad==2.0.10

# 機械学習フレームワーク
torch==2.2.0
torchaudio==2.2.0
transformers==4.40.0
speechbrain==1.0.0

# NLP・情報抽出
spacy==3.7.2
ja-core-news-lg==3.7.0  # python -m spacy download ja_core_news_lg

# LLM クライアント
anthropic==0.34.0
boto3==1.34.0  # AWS Bedrock

# API・非同期
fastapi==0.111.0
uvicorn==0.29.0
websockets==12.0
pydantic==2.7.0

# データ処理
numpy==1.26.4
pandas==2.2.0

# 評価
pyannote.metrics==3.2.1
scikit-learn==1.4.0

# キャッシュ・キュー
redis==5.0.4
celery==5.4.0

# モニタリング
prometheus-client==0.20.0
opentelemetry-sdk==1.24.0
```

### Docker 設定（GPU対応）

```dockerfile
FROM pytorch/pytorch:2.2.0-cuda11.8-cudnn8-runtime

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 日本語モデル事前ダウンロード
RUN python -m spacy download ja_core_news_lg

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```
