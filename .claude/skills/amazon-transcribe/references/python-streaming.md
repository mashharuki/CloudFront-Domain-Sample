# Python ストリーミング実装リファレンス

## 依存関係

```bash
# amazon-transcribe SDK（非同期ストリーミング専用）
pip install amazon-transcribe

# マイク入力処理
pip install sounddevice numpy

# オーディオファイル処理
pip install soundfile pydub
```

## 実装パターン1：マイクリアルタイム文字起こし

```python
import asyncio
import sounddevice as sd
import numpy as np
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = "int16"
CHUNK_DURATION_MS = 100  # 100ms per chunk
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)
CHUNK_BYTES = CHUNK_SAMPLES * 2  # 16-bit = 2 bytes/sample


class TranscriptHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream, callback=None):
        super().__init__(output_stream)
        self.callback = callback
        self.final_transcript = []

    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        for result in transcript_event.transcript.results:
            transcript = result.alternatives[0].transcript
            if result.is_partial:
                # 部分的な認識結果（まだ確定していない）
                print(f"\r[partial] {transcript}", end="", flush=True)
            else:
                # 確定した認識結果
                print(f"\n[final]   {transcript}")
                self.final_transcript.append(transcript)
                if self.callback:
                    await self.callback(transcript)


async def mic_stream(stop_event: asyncio.Event):
    """マイクから音声チャンクを非同期ジェネレータとして生成"""
    loop = asyncio.get_event_loop()
    input_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def audio_callback(indata, frame_count, time_info, status):
        if status:
            print(f"Audio status: {status}")
        loop.call_soon_threadsafe(input_queue.put_nowait, bytes(indata))

    with sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=DTYPE,
        blocksize=CHUNK_SAMPLES,
        callback=audio_callback,
    ):
        print("Recording... Press Ctrl+C to stop.")
        while not stop_event.is_set():
            try:
                chunk = await asyncio.wait_for(input_queue.get(), timeout=1.0)
                yield chunk
            except asyncio.TimeoutError:
                continue


async def transcribe_from_microphone(language_code: str = "ja-JP"):
    client = TranscribeStreamingClient(region="ap-northeast-1")
    stop_event = asyncio.Event()

    stream = await client.start_stream_transcription(
        language_code=language_code,
        media_sample_rate_hz=SAMPLE_RATE,
        media_encoding="pcm",
        # オプション：部分的な安定化を有効化（精度向上）
        enable_partial_results_stabilization=True,
        partial_results_stability="medium",
    )

    handler = TranscriptHandler(stream.output_stream)

    async def write_audio():
        try:
            async for chunk in mic_stream(stop_event):
                await stream.input_stream.send_audio_event(audio_chunk=chunk)
        except asyncio.CancelledError:
            pass
        finally:
            await stream.input_stream.end_stream()

    try:
        await asyncio.gather(write_audio(), handler.handle_events())
    except KeyboardInterrupt:
        stop_event.set()

    return " ".join(handler.final_transcript)


if __name__ == "__main__":
    result = asyncio.run(transcribe_from_microphone())
    print(f"\nFull transcript: {result}")
```

## 実装パターン2：PCMファイルのストリーミング

```python
import asyncio
from pathlib import Path
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

SAMPLE_RATE = 16000
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000) * 2  # bytes


class SimpleHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream):
        super().__init__(output_stream)
        self.results: list[str] = []

    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        for result in transcript_event.transcript.results:
            if not result.is_partial:
                text = result.alternatives[0].transcript
                self.results.append(text)
                print(f"[final] {text}")


async def file_audio_stream(file_path: str):
    """PCMファイルを均等チャンクで非同期ストリーミング"""
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk
            # リアルタイムレートに近づけるために待機
            await asyncio.sleep(CHUNK_DURATION_MS / 1000)


async def transcribe_pcm_file(pcm_file: str, language_code: str = "ja-JP") -> str:
    client = TranscribeStreamingClient(region="ap-northeast-1")

    stream = await client.start_stream_transcription(
        language_code=language_code,
        media_sample_rate_hz=SAMPLE_RATE,
        media_encoding="pcm",
    )

    handler = SimpleHandler(stream.output_stream)

    async def send_audio():
        async for chunk in file_audio_stream(pcm_file):
            await stream.input_stream.send_audio_event(audio_chunk=chunk)
        await stream.input_stream.end_stream()

    await asyncio.gather(send_audio(), handler.handle_events())
    return " ".join(handler.results)
```

## 実装パターン3：WAVファイルのストリーミング

```python
import wave
import asyncio
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler

CHUNK_DURATION_MS = 100


async def wav_audio_stream(wav_file: str):
    """WAVファイルからPCMデータのみ（ヘッダ除去）をストリーミング"""
    with wave.open(wav_file, "rb") as wf:
        sample_rate = wf.getframerate()
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()

        # チャンクサイズ計算（100ms相当）
        frames_per_chunk = int(sample_rate * CHUNK_DURATION_MS / 1000)
        chunk_size = frames_per_chunk * channels * sampwidth

        while True:
            data = wf.readframes(frames_per_chunk)
            if not data:
                break
            yield data, sample_rate
            await asyncio.sleep(CHUNK_DURATION_MS / 1000)


async def transcribe_wav_file(wav_path: str, language_code: str = "ja-JP") -> str:
    # まずサンプルレートを取得
    with wave.open(wav_path, "rb") as wf:
        sample_rate = wf.getframerate()
        channels = wf.getnchannels()

    print(f"WAV info: {sample_rate}Hz, {channels}ch")

    client = TranscribeStreamingClient(region="ap-northeast-1")
    stream = await client.start_stream_transcription(
        language_code=language_code,
        media_sample_rate_hz=sample_rate,
        media_encoding="pcm",
    )

    class Handler(TranscriptResultStreamHandler):
        def __init__(self, output_stream):
            super().__init__(output_stream)
            self.texts: list[str] = []

        async def handle_transcript_event(self, event):
            for result in event.transcript.results:
                if not result.is_partial:
                    self.texts.append(result.alternatives[0].transcript)

    handler = Handler(stream.output_stream)

    async def send():
        async for chunk, _ in wav_audio_stream(wav_path):
            await stream.input_stream.send_audio_event(audio_chunk=chunk)
        await stream.input_stream.end_stream()

    await asyncio.gather(send(), handler.handle_events())
    return " ".join(handler.texts)
```

## 高度なオプション

```python
stream = await client.start_stream_transcription(
    language_code="ja-JP",
    media_sample_rate_hz=16000,
    media_encoding="pcm",
    # カスタム語彙
    vocabulary_name="my-custom-vocab",
    # 語彙フィルター（不要語除去）
    vocabulary_filter_name="my-filter",
    vocabulary_filter_method="remove",  # "remove", "mask", "tag"
    # スピーカー識別
    show_speaker_label=True,
    # 部分結果の安定化
    enable_partial_results_stabilization=True,
    partial_results_stability="high",  # "low", "medium", "high"
    # チャンネル識別（ステレオ）
    enable_channel_identification=True,
    number_of_channels=2,
    # PII識別
    pii_entity_types=["NAME", "PHONE", "EMAIL", "ADDRESS"],
)
```

## エラーハンドリング

```python
import asyncio
import random
from amazon_transcribe.exceptions import TranscribeStreamingError

async def transcribe_with_retry(pcm_file: str, max_retries: int = 3) -> str:
    for attempt in range(max_retries):
        try:
            return await transcribe_pcm_file(pcm_file)
        except TranscribeStreamingError as e:
            if "LimitExceededException" in str(e) and attempt < max_retries - 1:
                wait = (2 ** attempt) + random.uniform(0, 1)
                print(f"Rate limited. Retrying in {wait:.1f}s...")
                await asyncio.sleep(wait)
            else:
                raise
    raise RuntimeError("Max retries exceeded")
```

## 環境変数設定

```bash
export AWS_DEFAULT_REGION=ap-northeast-1
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
# IAMロール使用時はenv varは不要
```
