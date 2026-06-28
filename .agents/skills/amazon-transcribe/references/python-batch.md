# Python バッチ文字起こし実装リファレンス

## 依存関係

```bash
pip install boto3 requests
```

## 基本的なバッチ文字起こし

```python
import boto3
import time
import json
import uuid
from pathlib import Path

def upload_to_s3(local_path: str, bucket: str, key: str) -> str:
    """ローカルファイルをS3にアップロードしてURIを返す"""
    s3 = boto3.client("s3", region_name="ap-northeast-1")
    s3.upload_file(local_path, bucket, key)
    return f"s3://{bucket}/{key}"


def start_transcription(
    s3_uri: str,
    job_name: str,
    language_code: str = "ja-JP",
    output_bucket: str = None,
    media_format: str = None,
) -> dict:
    """
    文字起こしジョブを開始する
    media_format: 'mp3', 'mp4', 'wav', 'flac', 'ogg', 'amr', 'webm' (省略時はURIから自動推定)
    """
    client = boto3.client("transcribe", region_name="ap-northeast-1")

    # フォーマットの自動推定
    if not media_format:
        ext = s3_uri.split(".")[-1].lower()
        format_map = {
            "mp3": "mp3", "mp4": "mp4", "wav": "wav",
            "flac": "flac", "ogg": "ogg", "amr": "amr", "webm": "webm",
            "m4a": "mp4",
        }
        media_format = format_map.get(ext, "mp3")

    params = {
        "TranscriptionJobName": job_name,
        "Media": {"MediaFileUri": s3_uri},
        "MediaFormat": media_format,
        "LanguageCode": language_code,
    }
    if output_bucket:
        params["OutputBucketName"] = output_bucket

    return client.start_transcription_job(**params)


def wait_for_completion(job_name: str, poll_interval: int = 10, timeout: int = 3600) -> dict:
    """ジョブ完了まで待機（ポーリング）"""
    client = boto3.client("transcribe", region_name="ap-northeast-1")
    elapsed = 0

    while elapsed < timeout:
        response = client.get_transcription_job(TranscriptionJobName=job_name)
        job = response["TranscriptionJob"]
        status = job["TranscriptionJobStatus"]

        print(f"[{elapsed}s] Status: {status}")

        if status == "COMPLETED":
            return job
        elif status == "FAILED":
            raise RuntimeError(f"Job failed: {job.get('FailureReason', 'Unknown')}")

        time.sleep(poll_interval)
        elapsed += poll_interval

    raise TimeoutError(f"Job did not complete within {timeout}s")


def download_transcript(transcript_file_uri: str) -> str:
    """文字起こし結果JSONをダウンロードしてテキストを返す"""
    import requests
    response = requests.get(transcript_file_uri)
    response.raise_for_status()
    data = response.json()
    return data["results"]["transcripts"][0]["transcript"]


def transcribe_file(
    local_path: str,
    s3_bucket: str,
    language_code: str = "ja-JP",
    output_bucket: str = None,
) -> str:
    """ローカルファイルをアップロードして文字起こし（E2Eフロー）"""
    file_name = Path(local_path).name
    job_name = f"job-{uuid.uuid4().hex[:8]}-{Path(local_path).stem}"
    s3_key = f"transcribe-input/{file_name}"

    print(f"Uploading {local_path} to s3://{s3_bucket}/{s3_key}")
    s3_uri = upload_to_s3(local_path, s3_bucket, s3_key)

    print(f"Starting transcription job: {job_name}")
    start_transcription(s3_uri, job_name, language_code, output_bucket)

    print("Waiting for completion...")
    job = wait_for_completion(job_name)

    transcript_uri = job["Transcript"]["TranscriptFileUri"]
    print(f"Downloading transcript from {transcript_uri}")
    return download_transcript(transcript_uri)
```

## EventBridgeを使った非同期処理パターン（Lambda）

```python
# Lambda関数1: ジョブを開始する
import boto3
import json

def lambda_start_job(event, context):
    """S3イベントトリガーでジョブを開始"""
    s3_key = event["Records"][0]["s3"]["object"]["key"]
    s3_bucket = event["Records"][0]["s3"]["bucket"]["name"]

    transcribe = boto3.client("transcribe")
    job_name = f"job-{s3_key.replace('/', '-').replace('.', '-')}"

    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": f"s3://{s3_bucket}/{s3_key}"},
        MediaFormat=s3_key.split(".")[-1],
        LanguageCode="ja-JP",
        OutputBucketName=s3_bucket,
        OutputKey=f"transcripts/{job_name}.json",
    )
    return {"jobName": job_name}


# Lambda関数2: EventBridgeでジョブ完了を受け取る
def lambda_handle_completion(event, context):
    """EventBridge経由でTranscribeジョブ完了を処理"""
    job_name = event["detail"]["TranscriptionJobName"]
    status = event["detail"]["TranscriptionJobStatus"]

    if status == "COMPLETED":
        # トランスクリプトをDynamoDBに保存するなど
        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table("Transcriptions")
        table.put_item(Item={
            "jobName": job_name,
            "status": status,
            "completedAt": event["time"],
        })
    else:
        print(f"Job {job_name} failed")
```

EventBridgeルールの設定例（CDK）：

```python
from aws_cdk import aws_events as events, aws_events_targets as targets, aws_lambda as lambda_

# Transcribeジョブ完了イベントをLambdaでキャッチ
rule = events.Rule(
    self, "TranscribeCompleteRule",
    event_pattern=events.EventPattern(
        source=["aws.transcribe"],
        detail_type=["Transcribe Job State Change"],
        detail={"TranscriptionJobStatus": ["COMPLETED", "FAILED"]},
    ),
)
rule.add_target(targets.LambdaFunction(my_lambda))
```

## バッチジョブの高度な設定

```python
client.start_transcription_job(
    TranscriptionJobName=job_name,
    Media={"MediaFileUri": s3_uri},
    MediaFormat="mp3",
    LanguageCode="ja-JP",
    OutputBucketName="my-output-bucket",

    # スピーカー識別（最大10人）
    Settings={
        "ShowSpeakerLabels": True,
        "MaxSpeakerLabels": 2,
    },

    # カスタム語彙
    # Settings={"VocabularyName": "my-vocab"},

    # チャンネル識別（ステレオ音声）
    # Settings={"ChannelIdentification": True},

    # PII自動識別・マスキング
    ContentRedaction={
        "RedactionType": "PII",
        "RedactionOutput": "redacted",
        "PiiEntityTypes": ["NAME", "PHONE", "EMAIL", "ADDRESS", "CREDIT_DEBIT_NUMBER"],
    },

    # 言語自動識別
    # IdentifyLanguage=True,
    # LanguageOptions=["ja-JP", "en-US"],

    # タグ
    Tags=[{"Key": "Project", "Value": "Hackathon"}],
)
```

## トランスクリプトJSONの解析

```python
import json
import requests

def parse_transcript_json(json_path_or_url: str) -> dict:
    """文字起こし結果JSONを解析してテキスト・タイムスタンプを取得"""
    if json_path_or_url.startswith("http"):
        data = requests.get(json_path_or_url).json()
    else:
        with open(json_path_or_url) as f:
            data = json.load(f)

    results = data["results"]
    full_text = results["transcripts"][0]["transcript"]

    # 単語レベルのタイムスタンプ
    word_timestamps = [
        {
            "word": item["alternatives"][0]["content"],
            "start": float(item.get("start_time", 0)),
            "end": float(item.get("end_time", 0)),
            "confidence": float(item["alternatives"][0].get("confidence", 1.0)),
        }
        for item in results["items"]
        if item["type"] == "pronunciation"
    ]

    # スピーカーラベル（識別が有効な場合）
    speaker_segments = []
    if "speaker_labels" in results:
        for segment in results["speaker_labels"]["segments"]:
            speaker_segments.append({
                "speaker": segment["speaker_label"],
                "start": float(segment["start_time"]),
                "end": float(segment["end_time"]),
            })

    return {
        "full_text": full_text,
        "word_timestamps": word_timestamps,
        "speaker_segments": speaker_segments,
    }
```

## カスタム語彙の管理

```python
def create_vocabulary(name: str, language_code: str, phrases: list[str]) -> None:
    client = boto3.client("transcribe", region_name="ap-northeast-1")
    client.create_vocabulary(
        VocabularyName=name,
        LanguageCode=language_code,
        Phrases=phrases,
    )
    # 作成完了まで待機
    while True:
        response = client.get_vocabulary(VocabularyName=name)
        if response["VocabularyState"] in ("READY", "FAILED"):
            break
        time.sleep(2)


def update_vocabulary(name: str, language_code: str, phrases: list[str]) -> None:
    client = boto3.client("transcribe", region_name="ap-northeast-1")
    client.update_vocabulary(
        VocabularyName=name,
        LanguageCode=language_code,
        Phrases=phrases,
    )
```
