# 話者分離・話者認識 技術リファレンス

## 目次
1. [話者分離 (Speaker Diarization) の基礎](#1-話者分離の基礎)
2. [主要ライブラリとモデル比較](#2-主要ライブラリとモデル比較)
3. [実装パターン](#3-実装パターン)
4. [話者認識 (Speaker Identification/Verification)](#4-話者認識)
5. [評価指標とデバッグ](#5-評価指標とデバッグ)
6. [日本語特有の考慮事項](#6-日本語特有の考慮事項)

---

## 1. 話者分離の基礎

話者分離（Speaker Diarization）は「誰がいつ話したか」を特定するタスク。
主な処理ステップ：

```
音声 → VAD（音声区間検出）→ 特徴抽出 → クラスタリング → セグメント境界調整
```

### 主要サブタスク
| サブタスク | 説明 |
|---|---|
| VAD (Voice Activity Detection) | 音声区間 vs 無音区間の分類 |
| Speaker Segmentation | 話者交代点の検出 |
| Speaker Embedding | 話者の声紋をベクトル化 |
| Clustering | 同一話者のセグメントをグループ化 |
| Re-segmentation | 初期クラスタリング結果の精細化 |
| Speaker Identification | クラスタを既知話者に紐付け（オプション） |

---

## 2. 主要ライブラリとモデル比較

### pyannote.audio（推奨・デファクトスタンダード）

```python
from pyannote.audio import Pipeline

# 注意: Hugging Face Token と利用規約への同意が必要
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="YOUR_HF_TOKEN"
)

# 実行
diarization = pipeline("audio.wav")

# 結果の取得
for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"{turn.start:.1f}s - {turn.end:.1f}s: {speaker}")
```

**強み**: 高精度・活発なコミュニティ・事前学習済みモデル豊富
**注意**: 商用利用には登録・ライセンス確認が必要

### WhisperX（Whisper + 話者分離の統合）

```python
import whisperx

device = "cuda"
audio_file = "audio.mp3"
batch_size = 16
compute_type = "float16"

# Whisperで文字起こし
model = whisperx.load_model("large-v3", device, compute_type=compute_type)
audio = whisperx.load_audio(audio_file)
result = model.transcribe(audio, batch_size=batch_size, language="ja")

# アライメント
model_a, metadata = whisperx.load_align_model(language_code="ja", device=device)
result = whisperx.align(result["segments"], model_a, metadata, audio, device)

# 話者分離
diarize_model = whisperx.DiarizationPipeline(use_auth_token="HF_TOKEN", device=device)
diarize_segments = diarize_model(audio)

# 話者ラベルをテキストに付与
result = whisperx.assign_word_speakers(diarize_segments, result)
```

**強み**: ASR + Diarization を一気に処理、日本語対応、単語レベルアライメント

### NeMo (NVIDIA)

```python
from nemo.collections.asr.models import NeuralDiarizer

# 設定ファイルベースで動作
config = {
    "diarizer": {
        "manifest_filepath": "manifest.json",
        "out_dir": "./output",
        "oracle_num_speakers": None,
        "speaker_embeddings": {
            "model_path": "titanet_large"
        }
    }
}
```

**強み**: エンタープライズグレード、TitaNet埋め込みモデルが高精度

### モデル性能比較

| システム | DER (AMI) | DER (VoxConverse) | 処理速度 | ライセンス |
|---------|-----------|-------------------|---------|---------|
| pyannote 3.1 | ~11% | ~9% | リアルタイムの5-10x | MIT + 利用規約 |
| WhisperX | ~12-15% | - | リアルタイムの3-5x | MIT |
| NeMo MSDD | ~10% | ~8% | GPUで高速 | Apache 2.0 |
| SpeakerLM (2025) | ~8% | - | - | 要確認 |

---

## 3. 実装パターン

### パターンA: 最小実装（PoC向け）

```python
from pyannote.audio import Pipeline
import whisper

def transcribe_with_speakers(audio_path: str) -> list[dict]:
    # 話者分離
    diarizer = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                         use_auth_token=HF_TOKEN)
    diarization = diarizer(audio_path)

    # 音声認識
    asr_model = whisper.load_model("large-v3")
    transcription = asr_model.transcribe(audio_path, language="ja")

    # マージ: 各セグメントに話者を付与
    utterances = []
    for segment in transcription["segments"]:
        seg_start = segment["start"]
        seg_end = segment["end"]
        speaker = get_speaker_at_time(diarization, (seg_start + seg_end) / 2)
        utterances.append({
            "speaker": speaker,
            "start": seg_start,
            "end": seg_end,
            "text": segment["text"]
        })
    return utterances

def get_speaker_at_time(diarization, time: float) -> str:
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        if turn.start <= time <= turn.end:
            return speaker
    return "UNKNOWN"
```

### パターンB: プロダクション向け（非同期・スケーラブル）

```python
from dataclasses import dataclass
from abc import ABC, abstractmethod
import asyncio

@dataclass
class Utterance:
    speaker_id: str
    start_time: float
    end_time: float
    text: str
    confidence: float

class DiarizationBackend(ABC):
    @abstractmethod
    async def diarize(self, audio_path: str) -> list[tuple]:
        pass

class PyAnnoteDiarizer(DiarizationBackend):
    def __init__(self, hf_token: str):
        from pyannote.audio import Pipeline
        self.pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )

    async def diarize(self, audio_path: str) -> list[tuple]:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self.pipeline, audio_path)
        return [(turn.start, turn.end, speaker)
                for turn, _, speaker in result.itertracks(yield_label=True)]

class ConversationPipeline:
    def __init__(self, diarizer: DiarizationBackend, asr, emotion_recognizer=None):
        self.diarizer = diarizer
        self.asr = asr
        self.emotion_recognizer = emotion_recognizer

    async def process(self, audio_path: str) -> list[Utterance]:
        diarization, transcription = await asyncio.gather(
            self.diarizer.diarize(audio_path),
            self.asr.transcribe(audio_path)
        )
        return self._merge(diarization, transcription)
```

---

## 4. 話者認識

話者認識は「このセグメントは登録済み話者の誰か？」を特定するタスク。

### 埋め込みモデル

| モデル | 特徴 | 使い方 |
|--------|------|--------|
| ECAPA-TDNN | 最高精度、SpeechBrainで利用可能 | 登録話者が少ない場合 |
| d-vector (GE2E) | Google製、安定した性能 | 汎用 |
| TitaNet (NeMo) | NVIDIAのSOTA | エンタープライズ |
| ResNet-293 (WeSpeaker) | 大規模データで学習 | 高精度が必要な場合 |

### 実装例（SpeechBrain）

```python
from speechbrain.inference.speaker import SpeakerRecognition

# モデルロード
verification = SpeakerRecognition.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="pretrained_models/spkrec-ecapa"
)

# 話者登録（登録フェーズ）
def register_speaker(name: str, audio_samples: list[str]) -> np.ndarray:
    embeddings = []
    for audio in audio_samples:
        emb = verification.encode_batch(audio)
        embeddings.append(emb)
    return np.mean(embeddings, axis=0)  # 平均埋め込みで代表

# 話者識別（識別フェーズ）
def identify_speaker(audio_segment: str, registered_speakers: dict) -> str:
    query_emb = verification.encode_batch(audio_segment)
    best_speaker = None
    best_score = -1

    for name, ref_emb in registered_speakers.items():
        score, _ = verification.verify_batch(query_emb, ref_emb)
        if score > best_score:
            best_score = score
            best_speaker = name

    return best_speaker if best_score > THRESHOLD else "UNKNOWN"
```

---

## 5. 評価指標とデバッグ

### DER (Diarization Error Rate)

```
DER = (Missed Speech + False Alarm + Speaker Error) / Total Speech Duration
```

- **Missed Speech**: 音声を無音と判定した割合
- **False Alarm**: 無音を音声と判定した割合
- **Speaker Error**: 話者の誤認識割合

```python
from pyannote.metrics.diarization import DiarizationErrorRate

metric = DiarizationErrorRate()
# reference: 正解データ (Annotation)
# hypothesis: モデルの予測 (Annotation)
der = metric(reference, hypothesis)
print(f"DER: {abs(der) * 100:.1f}%")
```

### よくある失敗パターンと対処

| 問題 | 原因 | 対処 |
|------|------|------|
| DERが30%超 | ノイズが多い | WebRTC VADでノイズ除去前処理 |
| 話者数が倍になる | クラスタリング閾値が低すぎる | `min_cluster_size` を増やす |
| 同一話者が2つに分かれる | チャンネル切り替えで声質変化 | x-vectorsの閾値調整 |
| 重複発話が検出できない | モノラル音源の限界 | EEND-OLA系モデルへ変更 |

---

## 6. 日本語特有の考慮事項

- **Whisper large-v3** は日本語のWERが約5-8%（英語と同等）
- **フィラー語**（えー、あの、まあ）の扱いを決める（除去 vs 保持）
- **敬語レベル**で話者の社会的関係が推定可能（応用）
- **話者交代タイミング**が英語より短い傾向（日本語会話の特性）
- 日本語ASRのファインチューニング: ReazonSpeech、CSJ（日本語話し言葉コーパス）

```python
# 日本語特化Whisper設定
result = model.transcribe(
    audio,
    language="ja",
    task="transcribe",
    initial_prompt="以下は日本語の会話です。",
    temperature=0,           # 決定論的デコード
    no_speech_threshold=0.6, # 無音判定閾値
    condition_on_previous_text=True
)
```
