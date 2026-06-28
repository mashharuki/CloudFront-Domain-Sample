# Amazon Transcribe 高度な機能リファレンス

## Call Analytics（コールセンター分析）

コールセンター音声を高度に分析する特化モード。通常の文字起こしより追加の洞察を提供。

### 分析できる項目
- スピーカー識別（エージェント vs カスタマー）
- 感情分析（ポジティブ/ネガティブ/ニュートラル/混在）
- 通話要約・アクションアイテム（Generative Call Summarizationが必要）
- 中断・沈黙の検出
- トーク比率（発話時間の割合）
- 音量分析
- カスタム分類ルール

### Python実装

```python
import boto3
import time
import json

def start_call_analytics_job(
    s3_uri: str,
    job_name: str,
    data_access_role_arn: str,
    output_bucket: str,
) -> dict:
    client = boto3.client("transcribe", region_name="ap-northeast-1")

    return client.start_call_analytics_job(
        CallAnalyticsJobName=job_name,
        Media={"MediaFileUri": s3_uri},
        DataAccessRoleArn=data_access_role_arn,
        OutputLocation=f"s3://{output_bucket}/call-analytics/",
        ChannelDefinitions=[
            {"ChannelId": 0, "ParticipantRole": "AGENT"},
            {"ChannelId": 1, "ParticipantRole": "CUSTOMER"},
        ],
        Settings={
            "VocabularyName": "call-center-vocab",  # オプション
            "LanguageModelName": "my-custom-lm",    # オプション
        },
    )


def get_call_analytics_results(job_name: str) -> dict:
    client = boto3.client("transcribe", region_name="ap-northeast-1")

    while True:
        response = client.get_call_analytics_job(CallAnalyticsJobName=job_name)
        job = response["CallAnalyticsJob"]
        status = job["CallAnalyticsJobStatus"]

        if status == "COMPLETED":
            return job
        elif status == "FAILED":
            raise RuntimeError(f"Job failed: {job.get('FailureReason')}")
        time.sleep(10)


def parse_call_analytics_output(result_json: dict) -> dict:
    """Call Analytics結果JSONを解析"""
    categories = result_json.get("Categories", {})
    channel_definitions = result_json.get("ChannelDefinitions", [])

    # 感情分析の取得
    sentiments = {}
    for channel in result_json.get("ConversationCharacteristics", {}).get(
        "Sentiment", {}
    ).get("OverallSentiment", {}).items():
        sentiments[channel[0]] = channel[1]

    # 中断回数
    interruptions = result_json.get("ConversationCharacteristics", {}).get(
        "Interruptions", {}
    ).get("TotalCount", 0)

    return {
        "sentiments": sentiments,
        "interruptions": interruptions,
        "categories_matched": list(categories.keys()),
    }
```

---

## Transcribe Medical（医療用途）

医療現場向けに最適化されたモード。HIPAA準拠。医療専門用語の認識精度が高い。

### 対応言語：英語（en-US）のみ

### Python実装

```python
import boto3

def start_medical_transcription(
    s3_uri: str,
    job_name: str,
    output_bucket: str,
    specialty: str = "PRIMARYCARE",
    transcript_type: str = "CONVERSATION",
) -> dict:
    """
    specialty: 'PRIMARYCARE' | 'CARDIOLOGY' | 'NEUROLOGY' | 'ONCOLOGY' | 'RADIOLOGY' | 'UROLOGY'
    transcript_type: 'CONVERSATION' (診察) | 'DICTATION' (音声入力)
    """
    client = boto3.client("transcribe", region_name="us-east-1")  # Medical は us-east-1推奨

    return client.start_medical_transcription_job(
        MedicalTranscriptionJobName=job_name,
        Media={"MediaFileUri": s3_uri},
        MediaFormat="mp3",
        LanguageCode="en-US",
        OutputBucketName=output_bucket,
        Specialty=specialty,
        Type=transcript_type,
        # PHI自動識別
        ContentIdentificationType="PHI",
    )
```

---

## カスタム言語モデル (Custom Language Model)

ドメイン特化テキストで訓練した言語モデルで、専門用語の精度を大幅向上。

### 作成フロー

```python
import boto3

def create_custom_language_model(
    model_name: str,
    base_model_name: str,  # "NarrowBand" or "WideBand"
    language_code: str,
    training_data_s3_uri: str,
    tuning_data_s3_uri: str,
    data_access_role_arn: str,
) -> dict:
    client = boto3.client("transcribe", region_name="ap-northeast-1")

    return client.create_language_model(
        ModelName=model_name,
        LanguageCode=language_code,
        BaseModelName=base_model_name,
        InputDataConfig={
            "S3Uri": training_data_s3_uri,
            "TuningDataS3Uri": tuning_data_s3_uri,
            "DataAccessRoleArn": data_access_role_arn,
        },
    )


def wait_for_model(model_name: str) -> None:
    """カスタムモデルの訓練完了を待機（数十分かかる場合あり）"""
    client = boto3.client("transcribe", region_name="ap-northeast-1")
    while True:
        response = client.describe_language_model(ModelName=model_name)
        status = response["LanguageModel"]["ModelStatus"]
        print(f"Model status: {status}")
        if status in ("COMPLETED", "FAILED"):
            break
        time.sleep(60)
```

訓練データ形式（S3にテキストファイルをアップロード）:
```
# training-data.txt
これはサンプルの訓練テキストです。
専門用語やドメイン特有の表現を多く含めてください。
1ファイル最大200万単語まで。
```

---

## PII検出・マスキング

### バッチ処理でのPII設定

```python
client.start_transcription_job(
    ...
    ContentRedaction={
        "RedactionType": "PII",
        "RedactionOutput": "redacted",           # "redacted_and_unredacted" で両方出力
        "PiiEntityTypes": [
            "NAME",
            "PHONE",
            "EMAIL",
            "ADDRESS",
            "CREDIT_DEBIT_NUMBER",
            "CREDIT_DEBIT_CVV",
            "CREDIT_DEBIT_EXPIRY",
            "PIN",
            "SSN",
            "BANK_ACCOUNT_NUMBER",
            "BANK_ROUTING",
        ],
    },
)
```

### ストリーミングでのPII設定（Python）

```python
stream = await client.start_stream_transcription(
    language_code="en-US",  # 英語のみ対応
    media_sample_rate_hz=16000,
    media_encoding="pcm",
    pii_entity_types=["NAME", "PHONE", "EMAIL"],
    content_redaction_type="PII",  # "PII" のみ
)
```

---

## 語彙フィルター（不要語削除）

フィラーワード（「えー」「あの」等）や不適切な表現を除去。

```python
def create_vocabulary_filter(
    filter_name: str,
    language_code: str,
    words: list[str],
) -> None:
    client = boto3.client("transcribe", region_name="ap-northeast-1")
    client.create_vocabulary_filter(
        VocabularyFilterName=filter_name,
        LanguageCode=language_code,
        Words=words,  # 最大300語
    )


# 使用例：バッチジョブ
client.start_transcription_job(
    ...,
    Settings={
        "VocabularyFilterName": "filler-words-filter",
        "VocabularyFilterMethod": "remove",  # "remove" | "mask" | "tag"
    },
)

# 使用例：ストリーミング
stream = await client.start_stream_transcription(
    ...,
    vocabulary_filter_name="filler-words-filter",
    vocabulary_filter_method="remove",
)
```

---

## 言語自動識別

バッチ処理のみ対応。音声の言語を自動判定。

```python
client.start_transcription_job(
    TranscriptionJobName=job_name,
    Media={"MediaFileUri": s3_uri},
    OutputBucketName=output_bucket,
    # LanguageCode は不要（IdentifyLanguage使用時）
    IdentifyLanguage=True,
    LanguageOptions=["ja-JP", "en-US", "zh-CN", "ko-KR"],
    # 複数言語が混在する音声
    # IdentifyMultipleLanguages=True,
)

# 結果から識別された言語を取得
job = client.get_transcription_job(TranscriptionJobName=job_name)
identified_language = job["TranscriptionJob"].get("IdentifiedLanguageScore")
language_code = job["TranscriptionJob"].get("LanguageCode")
```

---

## リアルタイム文字起こし + Bedrockによる要約（統合パターン）

```python
import asyncio
import boto3
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler

class MeetingHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream):
        super().__init__(output_stream)
        self.segments: list[str] = []
        self.bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

    async def handle_transcript_event(self, event):
        for result in event.transcript.results:
            if not result.is_partial:
                text = result.alternatives[0].transcript
                self.segments.append(text)
                print(f"[transcript] {text}")

                # 10セグメントごとに要約を生成
                if len(self.segments) % 10 == 0:
                    await self.summarize()

    async def summarize(self):
        context = "\n".join(self.segments[-20:])  # 直近20セグメント
        prompt = f"以下の会議の発言を3行で要約してください:\n{context}"

        response = self.bedrock.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
        summary = json.loads(response["body"].read())["content"][0]["text"]
        print(f"\n[Summary] {summary}\n")
```

---

## サポート言語一覧（主要言語抜粋）

| 言語コード | 言語 | バッチ | ストリーミング |
|-----------|------|--------|-----------|
| `ja-JP` | 日本語 | ✓ | ✓ |
| `en-US` | 英語（米国） | ✓ | ✓ |
| `en-GB` | 英語（英国） | ✓ | ✓ |
| `zh-CN` | 中国語（簡体字） | ✓ | ✓ |
| `ko-KR` | 韓国語 | ✓ | ✓ |
| `de-DE` | ドイツ語 | ✓ | ✓ |
| `fr-FR` | フランス語（フランス） | ✓ | ✓ |
| `es-ES` | スペイン語（スペイン） | ✓ | ✓ |
| `pt-BR` | ポルトガル語（ブラジル） | ✓ | ✓ |
| `it-IT` | イタリア語 | ✓ | ✓ |

完全なリストは公式ドキュメント参照：https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html
