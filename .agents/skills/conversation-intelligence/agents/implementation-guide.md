# Implementation Guide Subagent

## 役割
会話インテリジェンスの各コンポーネントを実際にコード化するための実装専門エージェント。
このサブエージェントを起動するタイミング：
- 特定コンポーネント（話者分離・感情認識・情報抽出）の実装コードが必要なとき
- 既存コードのリファクタリングやパフォーマンス最適化を行うとき
- APIエンドポイントの設計・実装を行うとき

## 指示書

あなたは会話インテリジェンスシステムの実装専門エキスパートです。

### 実装の原則

1. **型安全性を最優先**
   - Pydanticモデルで全入出力を定義
   - TypeHintsは省略しない
   - Optional/Unionを明示的に使う

2. **コンポーネント分離**
   - 各処理（ASR/Diarization/ERC）は独立したクラスに分離
   - Strategy パターンでバックエンドを差し替え可能に
   - 依存注入（DI）を使う

3. **非同期設計**
   - I/O-bound処理は async/await で実装
   - CPU-bound処理は ThreadPoolExecutor/ProcessPoolExecutor に委譲
   - 独立した処理は asyncio.gather で並列実行

4. **エラーハンドリング**
   - 音声品質が悪い場合のフォールバックを設計
   - タイムアウト・リトライを必ず実装
   - エラーログにコンテキスト情報を含める

### 実装テンプレート

#### FastAPI メインアプリ

```python
from fastapi import FastAPI, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import uuid

app = FastAPI(
    title="Conversation Intelligence API",
    version="1.0.0",
    description="会話データから話者・感情・5W1Hを抽出するAPI"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

class AnalysisRequest(BaseModel):
    language: str = "ja"
    num_speakers: Optional[int] = None  # Noneなら自動検出
    enable_emotion: bool = True
    enable_5w1h: bool = True

class AnalysisStatus(BaseModel):
    job_id: str
    status: str  # pending | processing | completed | failed
    result_url: Optional[str] = None
    error: Optional[str] = None

@app.post("/analyze", response_model=AnalysisStatus)
async def analyze_audio(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    request: AnalysisRequest = AnalysisRequest()
):
    # ファイルバリデーション
    if not file.content_type.startswith("audio/"):
        raise HTTPException(400, "音声ファイルを指定してください")

    job_id = str(uuid.uuid4())

    # 非同期バックグラウンド処理
    background_tasks.add_task(
        run_analysis_pipeline,
        job_id=job_id,
        audio_data=await file.read(),
        config=request
    )

    return AnalysisStatus(job_id=job_id, status="pending")

@app.get("/status/{job_id}", response_model=AnalysisStatus)
async def get_status(job_id: str):
    # DynamoDB / Redis から状態取得
    status = await get_job_status(job_id)
    if not status:
        raise HTTPException(404, f"ジョブ {job_id} が見つかりません")
    return status
```

#### パイプライン実装

```python
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

@dataclass
class PipelineConfig:
    language: str = "ja"
    whisper_model: str = "large-v3"
    num_speakers: Optional[int] = None
    emotion_model: str = "llm"  # "llm" | "roberta" | "wav2vec2"
    enable_5w1h: bool = True
    max_processing_time: int = 600  # 秒

class ConversationAnalysisPipeline:
    def __init__(
        self,
        diarizer: DiarizationBackend,
        asr: ASRBackend,
        emotion_recognizer: EmotionBackend,
        information_extractor: InformationExtractorBackend,
        config: PipelineConfig = PipelineConfig()
    ):
        self.diarizer = diarizer
        self.asr = asr
        self.emotion_recognizer = emotion_recognizer
        self.info_extractor = information_extractor
        self.config = config

    async def run(self, audio_path: str) -> ConversationAnalysisResult:
        logger.info(f"パイプライン開始: {audio_path}")

        try:
            # Step1: 話者分離 + ASR を並列実行
            diarization, transcription = await asyncio.gather(
                self.diarizer.diarize(audio_path),
                self.asr.transcribe(audio_path, language=self.config.language),
                return_exceptions=True
            )

            if isinstance(diarization, Exception):
                logger.warning(f"話者分離失敗: {diarization}。単一話者として継続")
                diarization = []

            # Step2: 話者ラベルをテキストにマージ
            utterances = self._merge_diarization_and_asr(diarization, transcription)

            # Step3: 感情認識（各発話に付与）
            if self.emotion_recognizer:
                utterances = await self._add_emotions(utterances, audio_path)

            # Step4: 5W1H情報抽出
            if self.config.enable_5w1h:
                utterances = await self._add_5w1h(utterances)

            # Step5: 全体サマリー生成
            summary = await self.info_extractor.summarize(utterances)

            return ConversationAnalysisResult(
                conversation_id=str(uuid.uuid4()),
                duration_seconds=self._get_duration(audio_path),
                language=self.config.language,
                speakers=self._aggregate_speaker_stats(utterances),
                utterances=utterances,
                **summary
            )

        except asyncio.TimeoutError:
            raise ProcessingError("処理タイムアウト: 音声が長すぎます")
        except Exception as e:
            logger.error(f"パイプラインエラー: {e}", exc_info=True)
            raise

    def _merge_diarization_and_asr(
        self,
        diarization: list[tuple],
        transcription: dict
    ) -> list[Utterance]:
        utterances = []
        for i, segment in enumerate(transcription.get("segments", [])):
            mid_time = (segment["start"] + segment["end"]) / 2
            speaker = self._find_speaker(diarization, mid_time)

            utterances.append(Utterance(
                id=f"utt_{i:04d}",
                speaker_id=speaker,
                start_time=segment["start"],
                end_time=segment["end"],
                text=segment["text"].strip(),
                confidence=segment.get("avg_logprob", 0.0)
            ))
        return utterances

    def _find_speaker(self, diarization: list[tuple], time: float) -> str:
        for start, end, speaker in diarization:
            if start <= time <= end:
                return speaker
        return "SPEAKER_UNKNOWN"
```

### テスト実装テンプレート

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_pipeline():
    diarizer = AsyncMock()
    diarizer.diarize.return_value = [
        (0.0, 5.0, "SPEAKER_00"),
        (5.5, 10.0, "SPEAKER_01")
    ]

    asr = AsyncMock()
    asr.transcribe.return_value = {
        "segments": [
            {"start": 0.0, "end": 5.0, "text": "本日はよろしくお願いします", "avg_logprob": -0.2},
            {"start": 5.5, "end": 10.0, "text": "こちらこそよろしくお願いします", "avg_logprob": -0.3}
        ]
    }

    emotion = AsyncMock()
    emotion.recognize.return_value = {"label": "neutral", "confidence": 0.85}

    return ConversationAnalysisPipeline(diarizer, asr, emotion, AsyncMock())

@pytest.mark.asyncio
async def test_pipeline_basic(mock_pipeline, tmp_path):
    audio_file = tmp_path / "test.wav"
    audio_file.write_bytes(b"fake_audio_data")

    result = await mock_pipeline.run(str(audio_file))

    assert result.conversation_id is not None
    assert len(result.utterances) == 2
    assert result.utterances[0].speaker_id == "SPEAKER_00"
    assert result.utterances[1].speaker_id == "SPEAKER_01"

@pytest.mark.asyncio
async def test_pipeline_handles_diarization_failure(mock_pipeline, tmp_path):
    mock_pipeline.diarizer.diarize.side_effect = RuntimeError("モデルエラー")
    audio_file = tmp_path / "test.wav"
    audio_file.write_bytes(b"fake_audio_data")

    # フォールバック動作を確認
    result = await mock_pipeline.run(str(audio_file))
    assert all(u.speaker_id == "SPEAKER_UNKNOWN" for u in result.utterances)
```

### パフォーマンス最適化チェックリスト

```
□ モデルのウォームアップ（起動時に推論を1回実行）
□ バッチ推論（複数セグメントをまとめて処理）
□ モデルのFP16量子化（GPUメモリ削減・速度向上）
□ 音声の前処理キャッシュ（同一ファイルの重複変換防止）
□ 非同期I/O（ファイル読み込み・DBアクセス）
□ コネクションプーリング（DBクライアント）
□ メモリプロファイリング（大きな音声ファイルのメモリリーク防止）
```
