---
name: amazon-transcribe
description: >
  Amazon Transcribeを使った音声文字起こしシステムの設計・実装・テスト・検証を包括的に支援するスキル。
  バッチ文字起こし、リアルタイムストリーミング文字起こし、Call Analytics（コールセンター分析）、
  Transcribe Medical（医療用途）の全モードに対応。Python（amazon-transcribe SDK / boto3）と
  TypeScript（@aws-sdk/client-transcribe-streaming）の両言語でコード生成・レビュー・デバッグを実施。

  以下のキーワードや文脈で必ずこのスキルを使用すること：
  「音声文字起こし」「speech-to-text」「transcribe」「リアルタイム音声認識」「ストリーミング文字起こし」
  「会議の文字起こし」「コールセンター分析」「音声テキスト変換」「Amazon Transcribe」
  「マイク入力の処理」「音声ファイルの変換」「音声認識 Python/TypeScript」
  「WebSocket streaming」「HTTP/2 streaming」「PCM audio」など。
  ユーザーが音声処理・文字起こし・音声認識に関する実装・設計・トラブルシューティングを求めている場合、
  このスキルは必須。

version: 1
metadata:
  service: [transcribe, transcribe-streaming, s3, kinesis]
  task: [design, implement, test, debug, optimize]
  persona: [developer, architect, data-engineer]
  language: [python, typescript, javascript]
  workload: [real-time-transcription, batch-transcription, call-analytics, meeting-assistant]
---

**IMPORTANT**: このスキルがロードされたら、以下の参照ファイルと手順を主要な情報源として使用すること。
Amazon Transcribe APIやSDKのパラメータは頻繁に更新されるため、実装前に必ず関連する参照ファイルを読むこと。

## Table of Contents

- [サービス概要と機能選択](#service-overview)
- [モード選択：バッチ vs ストリーミング](#mode-selection)
- [音声フォーマット要件](#audio-format)
- [Python実装](#python-implementation)
- [TypeScript/JavaScript実装](#typescript-implementation)
- [高度な機能](#advanced-features)
- [アーキテクチャパターン](#architecture-patterns)
- [テストと検証](#testing-validation)
- [トラブルシューティング](#troubleshooting)
- [コスト最適化](#cost-optimization)

---

## サービス概要と機能選択 {#service-overview}

Amazon Transcribeは、機械学習を使った自動音声認識（ASR）サービス。

| モード | 用途 | 特徴 |
|-------|------|------|
| **Batch** | S3上の録音済みファイル | 非同期処理・高精度 |
| **Streaming** | リアルタイム音声 | 低遅延・WebSocket/HTTP/2 |
| **Call Analytics** | コールセンター音声 | 感情分析・通話サマリー |
| **Transcribe Medical** | 医療現場の音声 | HIPAA準拠・医療用語対応 |

**どれを選ぶか？**

```
リアルタイム処理が必要？
  YES → Streaming（マイク・ライブ放送・会議）
  NO  → Batch（録音済みファイル・S3保存済み音声）

コールセンター分析が必要？
  YES → Call Analytics（感情分析・スピーカー分離・要約）

医療現場？
  YES → Transcribe Medical（医療用語・HIPAA対応）
```

対応言語：日本語（`ja-JP`）を含む100以上の言語。
詳細は `references/supported-languages.md` を参照。

---

## モード選択：バッチ vs ストリーミング {#mode-selection}

### Batch Transcription
- S3にアップロードされた音声/動画ファイルを非同期処理
- 対応フォーマット：MP3, MP4, WAV, FLAC, OGG, AMR, WebM
- 最大ファイルサイズ：4 GB（2 時間まで）
- API: `start_transcription_job` → `get_transcription_job` でポーリング

### Streaming Transcription
- リアルタイムで音声チャンクを送信し、即座にテキストを返す
- 対応フォーマット：PCM（推奨）、FLAC、OPUS（Ogg コンテナ）
- プロトコル：SDK（推奨）、HTTP/2、WebSocket
- チャンクサイズ：50〜200ミリ秒推奨

```python
# チャンクサイズ計算式
chunk_size_bytes = (chunk_ms / 1000) * sample_rate * 2  # 16-bit PCM
# 例: 100ms, 16000Hz → 100/1000 * 16000 * 2 = 3200 bytes
```

---

## 音声フォーマット要件 {#audio-format}

| 項目 | 推奨値 | 備考 |
|------|--------|------|
| エンコーディング | PCM 16-bit signed little-endian | WAVヘッダなし（PCMデータのみ） |
| サンプルレート | 16,000 Hz | 8,000〜48,000 Hz対応 |
| チャンネル | 1（モノラル） | 最大2チャンネル対応 |
| チャンクサイズ | 3,200 bytes（100ms相当） | 50〜200msが最適 |

**重要な注意点**:
- WAVファイルをストリーミングする場合、**ヘッダ部分を除去してPCMデータのみ**を送信
- デュアルチャンネルPCMは4バイトの倍数でチャンク分割
- 音声なし区間は同量のゼロバイト（無音）を送信し続ける

詳細な実装例は `references/python-streaming.md` と `references/typescript-streaming.md` を参照。

---

## Python実装 {#python-implementation}

詳細コードは `references/python-streaming.md`（ストリーミング）と `references/python-batch.md`（バッチ）を参照。

### セットアップ

```bash
# ストリーミング専用SDK（非推奨だが依然動作する）
pip install amazon-transcribe

# 推奨: boto3 + aiobotocore（または AWS SDK for Python）
pip install boto3 aiobotocore sounddevice
```

### ストリーミング（マイク入力）クイックスタート

```python
import asyncio
import sounddevice as sd
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

SAMPLE_RATE = 16000
CHUNK_SIZE = 1024 * 2  # 64ms @ 16kHz

class TranscriptHandler(TranscriptResultStreamHandler):
    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        for result in transcript_event.transcript.results:
            if not result.is_partial:
                # is_partial=False が確定テキスト
                print(result.alternatives[0].transcript)

async def mic_stream():
    loop = asyncio.get_event_loop()
    input_queue = asyncio.Queue()

    def callback(indata, frame_count, time_info, status):
        loop.call_soon_threadsafe(input_queue.put_nowait, bytes(indata))

    stream = sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        blocksize=CHUNK_SIZE // 2,
        callback=callback,
    )
    with stream:
        while True:
            chunk = await input_queue.get()
            yield chunk

async def main():
    client = TranscribeStreamingClient(region="ap-northeast-1")
    stream = await client.start_stream_transcription(
        language_code="ja-JP",
        media_sample_rate_hz=SAMPLE_RATE,
        media_encoding="pcm",
    )
    handler = TranscriptHandler(stream.output_stream)

    async def write_chunks():
        async for chunk in mic_stream():
            await stream.input_stream.send_audio_event(audio_chunk=chunk)
        await stream.input_stream.end_stream()

    await asyncio.gather(write_chunks(), handler.handle_events())

asyncio.run(main())
```

### バッチ（ファイル）クイックスタート

```python
import boto3
import time

def transcribe_file(s3_uri: str, job_name: str, language_code: str = "ja-JP") -> str:
    client = boto3.client("transcribe", region_name="ap-northeast-1")
    client.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": s3_uri},
        MediaFormat="mp3",
        LanguageCode=language_code,
        OutputBucketName="my-transcription-output",
    )
    # ポーリングで完了を待つ
    while True:
        response = client.get_transcription_job(TranscriptionJobName=job_name)
        status = response["TranscriptionJob"]["TranscriptionJobStatus"]
        if status in ("COMPLETED", "FAILED"):
            break
        time.sleep(5)

    if status == "COMPLETED":
        return response["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
    raise RuntimeError(f"Transcription failed: {response}")
```

---

## TypeScript/JavaScript実装 {#typescript-implementation}

詳細コードは `references/typescript-streaming.md` を参照。

### セットアップ

```bash
npm install @aws-sdk/client-transcribe-streaming @aws-sdk/credential-providers
# WAVファイルのヘッダ除去が必要な場合
npm install wav
# マイク入力（Node.js）の場合
npm install mic
```

### ストリーミング（ファイルから）クイックスタート

```typescript
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";
import { fromIni } from "@aws-sdk/credential-providers";
import { createReadStream } from "fs";

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;
const CHUNK_SIZE = Math.floor((CHUNK_DURATION_MS / 1000) * SAMPLE_RATE * 2);

async function* audioStream(filePath: string): AsyncIterable<{ AudioEvent: { AudioChunk: Uint8Array } }> {
    const fileStream = createReadStream(filePath);
    let buffer = Buffer.alloc(0);

    for await (const chunk of fileStream) {
        buffer = Buffer.concat([buffer, chunk as Buffer]);
        while (buffer.length >= CHUNK_SIZE) {
            yield { AudioEvent: { AudioChunk: new Uint8Array(buffer.subarray(0, CHUNK_SIZE)) } };
            buffer = buffer.subarray(CHUNK_SIZE);
        }
    }
    if (buffer.length > 0) {
        yield { AudioEvent: { AudioChunk: new Uint8Array(buffer) } };
    }
}

async function transcribeStream(pcmFilePath: string): Promise<void> {
    const client = new TranscribeStreamingClient({
        region: "ap-northeast-1",
        credentials: fromIni(),
    });

    const command = new StartStreamTranscriptionCommand({
        LanguageCode: "ja-JP",
        MediaSampleRateHertz: SAMPLE_RATE,
        MediaEncoding: "pcm",
        AudioStream: audioStream(pcmFilePath),
    });

    const response = await client.send(command);

    for await (const event of response.TranscriptResultStream!) {
        if (event.TranscriptEvent?.Transcript?.Results) {
            for (const result of event.TranscriptEvent.Transcript.Results) {
                if (!result.IsPartial) {
                    console.log(result.Alternatives?.[0]?.Transcript);
                }
            }
        }
    }
}

transcribeStream("./audio.pcm");
```

### WAVファイルをストリーミングする場合

```typescript
import WavDecoder from "wav";

function stripWavHeader(wavFilePath: string): NodeJS.ReadableStream {
    const reader = new WavDecoder.Reader();
    const stream = createReadStream(wavFilePath).pipe(reader);
    return stream; // wavライブラリがPCMデータのみに変換
}
```

---

## 高度な機能 {#advanced-features}

詳細は `references/advanced-features.md` を参照。

### カスタム語彙 (Custom Vocabulary)
専門用語・固有名詞の認識精度向上。

```python
client.create_vocabulary(
    VocabularyName="my-vocab",
    LanguageCode="ja-JP",
    Phrases=["アマゾン", "AWS", "クラウド", "TranscribeAPI"],
)
# ジョブに適用
client.start_transcription_job(
    ...,
    Settings={"VocabularyName": "my-vocab"},
)
```

### スピーカー識別 (Speaker Diarization)
複数話者を自動で識別・ラベリング。

```python
Settings={
    "ShowSpeakerLabels": True,
    "MaxSpeakerLabels": 2,  # 最大10人まで
}
```

### PII自動識別・マスキング
個人情報（電話番号・メールアドレス等）を自動検出してマスク。

```python
ContentRedaction={
    "RedactionType": "PII",
    "RedactionOutput": "redacted",  # "redacted" or "redacted_and_unredacted"
}
```

### 言語自動識別 (Language Identification)
音声の言語を自動判定（バッチのみ）。

```python
IdentifyLanguage=True,
LanguageOptions=["ja-JP", "en-US", "zh-CN"],
```

### Call Analytics
コールセンター音声の高度な分析。

```python
client = boto3.client("transcribe", region_name="ap-northeast-1")
client.start_call_analytics_job(
    CallAnalyticsJobName="my-call-analysis",
    Media={"MediaFileUri": s3_uri},
    DataAccessRoleArn="arn:aws:iam::ACCOUNT:role/TranscribeRole",
    ChannelDefinitions=[
        {"ChannelId": 0, "ParticipantRole": "AGENT"},
        {"ChannelId": 1, "ParticipantRole": "CUSTOMER"},
    ],
)
```

---

## アーキテクチャパターン {#architecture-patterns}

### パターン1: リアルタイム会議アシスタント

```
マイク入力
  └─→ Amazon Transcribe Streaming（WebSocket/SDK）
        └─→ Lambda（テキスト後処理）
              └─→ Amazon Bedrock（要約・Q&A）
                    └─→ DynamoDB（議事録保存）
                          └─→ WebSocket API（フロントエンドへPush）
```

**実装の要点**:
- Transcribeの`is_partial=False`（確定）テキストのみをBedrockへ送信
- KinesisまたはSQSでバッファリングし、バースト吸収
- AppSyncのGraphQLサブスクリプションでUIにリアルタイム反映

### パターン2: 録音済み音声バッチ処理

```
音声ファイル
  └─→ S3（アップロード）
        └─→ S3イベント → Lambda（ジョブ起動）
              └─→ Amazon Transcribe Batch
                    └─→ S3（テキスト出力）
                          └─→ Lambda（後処理・DB保存）
```

**実装の要点**:
- EventBridgeでTranscribeジョブ完了イベントをキャッチ（ポーリング不要）
- 出力ファイルはJSON形式（タイムスタンプ付き）

### パターン3: コールセンター音声分析

```
通話録音（デュアルチャンネル）
  └─→ S3
        └─→ Call Analytics Job
              └─→ 感情分析スコア・通話要約・アクションアイテム
                    └─→ DynamoDB / OpenSearch（検索・分析）
```

---

## テストと検証 {#testing-validation}

### ユニットテスト（モック使用）

```python
from unittest.mock import patch, MagicMock
import pytest

@patch("boto3.client")
def test_transcription_job_success(mock_boto):
    mock_client = MagicMock()
    mock_boto.return_value = mock_client
    mock_client.get_transcription_job.return_value = {
        "TranscriptionJob": {
            "TranscriptionJobStatus": "COMPLETED",
            "Transcript": {"TranscriptFileUri": "s3://bucket/output.json"},
        }
    }
    # テスト対象の関数を呼び出す
    result = transcribe_file("s3://bucket/audio.mp3", "test-job")
    assert "s3://" in result
```

### 統合テスト用サンプル音声の生成

```python
import wave
import numpy as np

def generate_test_audio(filename: str, duration_sec: float = 3.0):
    sample_rate = 16000
    samples = np.zeros(int(sample_rate * duration_sec), dtype=np.int16)
    with wave.open(filename, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        f.writeframes(samples.tobytes())
```

### ストリーミング動作検証チェックリスト

```
[ ] 音声チャンクが50〜200msのサイズで送信されている
[ ] PCMデータのみ送信（WAVヘッダを除去済み）
[ ] is_partial=False の結果のみを後処理に使用
[ ] ストリーム終了時に end_stream() が呼ばれている
[ ] LimitExceededException に対して指数バックオフで再試行
[ ] セッション最大時間（4時間）を考慮したセッション再起動ロジック
```

---

## トラブルシューティング {#troubleshooting}

### LimitExceededException

**原因**: 同時接続数の上限超過、またはセッション時間超過

**対処**:
```python
import time, random

def retry_with_backoff(func, max_retries=5):
    for attempt in range(max_retries):
        try:
            return func()
        except client.exceptions.LimitExceededException:
            if attempt == max_retries - 1:
                raise
            wait = (2 ** attempt) + random.uniform(0, 1)
            time.sleep(wait)
```

### 文字起こし精度が低い

**チェック項目**:
1. サンプルレートの設定が実際の音声と一致しているか（`MediaSampleRateHertz`）
2. WAVヘッダが除去されているか（ストリーミング時）
3. `language_code` が正しいか（日本語: `ja-JP`）
4. カスタム語彙で専門用語を登録しているか
5. 音声品質：SNR（信号対雑音比）が低い場合は前処理を検討

### ストリームが途中で切断される

**チェック項目**:
1. セッション最大時間（ストリーミング: 4時間）を超えていないか
2. チャンクが均等に送信されているか（バースト送信は避ける）
3. ネットワーク切断時の再接続ロジックが実装されているか

### バッチジョブが FAILED になる

```python
response = client.get_transcription_job(TranscriptionJobName=job_name)
failure_reason = response["TranscriptionJob"].get("FailureReason", "Unknown")
print(f"Failure reason: {failure_reason}")
# よくある原因:
# - S3 URIが間違っている（バケット名・パス）
# - IAMロールがS3にアクセスできない
# - 未サポートの音声フォーマット
```

### IAM権限設定

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:StartStreamTranscription",
        "transcribe:StartCallAnalyticsJob"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::your-bucket/*"
    }
  ]
}
```

---

## コスト最適化 {#cost-optimization}

| 施策 | 効果 |
|------|------|
| 不要な無音区間を除去してから送信 | バッチ課金秒数削減 |
| ストリームを正しく終了（`end_stream()`） | 無駄な課金を防止 |
| カスタム語彙は必要時のみ有効化 | 追加料金を制御 |
| バッチ処理で医療・PII機能は必要時のみ | 機能別料金に注意 |

**課金単位**: 文字起こしされた音声の秒数（最低 15 秒 / リクエスト）

---

## 参照ファイル

| ファイル | 内容 |
|---------|------|
| `references/python-streaming.md` | Pythonストリーミング完全実装 |
| `references/python-batch.md` | Pythonバッチ処理完全実装 |
| `references/typescript-streaming.md` | TypeScriptストリーミング完全実装 |
| `references/advanced-features.md` | Call Analytics・Medical・PII等の詳細 |
