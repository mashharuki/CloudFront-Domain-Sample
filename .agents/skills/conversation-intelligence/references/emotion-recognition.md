# 感情認識 (Emotion Recognition) 技術リファレンス

## 目次
1. [感情モデルの種類](#1-感情モデルの種類)
2. [テキストベース感情認識](#2-テキストベース感情認識-erc)
3. [音声ベース感情認識](#3-音声ベース感情認識-ser)
4. [マルチモーダル感情認識](#4-マルチモーダル感情認識)
5. [会話コンテキストを考慮したERC](#5-会話コンテキストを考慮したerc)
6. [実装例とモデル選定ガイド](#6-実装例とモデル選定ガイド)
7. [評価指標とデータセット](#7-評価指標とデータセット)

---

## 1. 感情モデルの種類

### カテゴリカル感情モデル（離散）

**Ekman 6基本感情**（最も一般的）:
`anger（怒り）` `disgust（嫌悪）` `fear（恐怖）` `happiness（喜び）` `sadness（悲しみ）` `surprise（驚き）`

**拡張感情セット**:
- IEMOCAP: neutral, happy, sad, angry, excited, frustrated
- MSP-Improv: anger, happiness, sadness, neutral
- GoEmotion (Google): 27感情カテゴリー

### 次元的感情モデル（連続値）

```
Valence（感情価）: 負 ← ── ── ── ── → 正  (不快↔快)
Arousal（覚醒度）: 低 ← ── ── ── ── → 高  (落ち着き↔興奮)
Dominance（支配性）: 弱 ← ── ── ── → 強  （服従↔支配）
```

**選び方の指針**:
- ユーザー体験・製品フィードバック → Valence/Arousal（連続値）
- コールセンター品質管理 → カテゴリカル（怒り・満足の二値でも可）
- 医療・メンタルヘルス → 慎重に設計、専門家監修が必要

---

## 2. テキストベース感情認識 (ERC)

### 推奨モデル（日本語対応）

```python
from transformers import pipeline

# 日本語感情分析（手軽）
# cl-tohoku/bert-base-japanese-sentiment
classifier = pipeline(
    "text-classification",
    model="cardiffnlp/twitter-roberta-base-emotion",  # 英語
    # または
    # model="koheiduck/bert-japanese-finetuned-sentiment"  # 日本語
)

result = classifier("今日は本当に楽しかったです！")
# → [{'label': 'joy', 'score': 0.94}]
```

### LLMを使った感情抽出（最も柔軟）

```python
import anthropic

client = anthropic.Anthropic()

def extract_emotion_with_llm(utterance: str, context: list[str]) -> dict:
    context_str = "\n".join([f"- {u}" for u in context[-5:]])  # 直近5発話

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": f"""以下の会話コンテキストと発話から感情を分析してください。

コンテキスト（直近の発話）:
{context_str}

分析対象の発話:
「{utterance}」

以下のJSON形式で回答してください:
{{
  "primary_emotion": "neutral|joy|anger|sadness|fear|surprise|disgust",
  "confidence": 0.0-1.0,
  "valence": -1.0から1.0（負:不快、正:快）,
  "arousal": 0.0-1.0（低:落ち着き、高:興奮）,
  "reasoning": "判断理由を1文で"
}}"""
        }]
    )
    import json
    return json.loads(response.content[0].text)
```

### 感情変化のアーク検出

```python
from collections import deque
import numpy as np

class EmotionArcDetector:
    def __init__(self, window_size: int = 10):
        self.window = deque(maxlen=window_size)
        self.valence_history = []

    def update(self, emotion: dict) -> dict:
        self.window.append(emotion["valence"])
        self.valence_history.append(emotion["valence"])

        trend = np.polyfit(range(len(self.window)), list(self.window), 1)[0]

        return {
            "current_valence": emotion["valence"],
            "trend": "improving" if trend > 0.05 else "declining" if trend < -0.05 else "stable",
            "rolling_mean": np.mean(self.window)
        }
```

---

## 3. 音声ベース感情認識 (SER)

音声信号から直接感情を推定。テキストでは捉えにくい**声のトーン・抑揚・話速**を活用。

### 音声特徴量

| 特徴量 | 説明 | 感情との関連 |
|--------|------|------------|
| MFCC | メル周波数ケプストラム係数 | 声質全般 |
| F0 (Pitch) | 基本周波数 | 感情価・覚醒度 |
| Energy/RMS | 音のエネルギー | 覚醒度・強度 |
| ZCR | ゼロ交差率 | 音声の粗さ |
| Speaking Rate | 話速 | 覚醒度・緊張度 |

### Wav2Vec2ベースのSER

```python
from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2Processor
import torch
import librosa

class SpeechEmotionRecognizer:
    def __init__(self, model_name="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"):
        self.processor = Wav2Vec2Processor.from_pretrained(model_name)
        self.model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name)
        self.model.eval()

    def predict(self, audio_path: str, start: float = None, end: float = None) -> dict:
        # 音声読み込み
        audio, sr = librosa.load(audio_path, sr=16000)

        # セグメント抽出
        if start is not None and end is not None:
            audio = audio[int(start * sr):int(end * sr)]

        # 短すぎる場合はスキップ
        if len(audio) < sr * 0.5:
            return {"emotion": "neutral", "confidence": 0.0, "skipped": True}

        inputs = self.processor(audio, sampling_rate=16000, return_tensors="pt", padding=True)

        with torch.no_grad():
            logits = self.model(**inputs).logits

        probabilities = torch.softmax(logits, dim=-1)
        predicted_id = torch.argmax(probabilities).item()

        labels = self.model.config.id2label
        return {
            "emotion": labels[predicted_id],
            "confidence": probabilities[0][predicted_id].item(),
            "all_scores": {labels[i]: probabilities[0][i].item() for i in range(len(labels))}
        }
```

---

## 4. マルチモーダル感情認識

音声＋テキスト＋（表情）を組み合わせることで精度が向上する。

### 融合戦略

```python
class MultimodalEmotionFuser:
    """
    Early Fusion: 特徴量レベルで結合（最も柔軟だが学習データが必要）
    Late Fusion: 各モダリティの予測確率を重み付け平均（実装が簡単）
    Hybrid: 音声とテキストをAttentionで融合
    """

    def late_fusion(self, text_probs: dict, audio_probs: dict,
                    text_weight: float = 0.6, audio_weight: float = 0.4) -> dict:
        emotions = set(text_probs.keys()) | set(audio_probs.keys())
        fused = {}
        for emotion in emotions:
            fused[emotion] = (
                text_probs.get(emotion, 0) * text_weight +
                audio_probs.get(emotion, 0) * audio_weight
            )
        return max(fused, key=fused.get), fused

    def confidence_weighted_fusion(self, text_result: dict, audio_result: dict) -> dict:
        # 信頼度が高いモダリティを優先する動的重み付け
        text_conf = text_result["confidence"]
        audio_conf = audio_result["confidence"]
        total = text_conf + audio_conf

        if total < 0.01:
            return {"emotion": "neutral", "confidence": 0.0}

        text_w = text_conf / total
        audio_w = audio_conf / total

        return self.late_fusion(
            text_result["all_scores"],
            audio_result["all_scores"],
            text_w, audio_w
        )
```

---

## 5. 会話コンテキストを考慮したERC

単一発話だけでなく、**会話の流れ**を考慮することで精度が大幅向上する。

### コンテキスト依存ERC（LLMアプローチ）

```python
class ContextualERCAnalyzer:
    """
    各発話を単独で分析するより、会話全体を渡してLLMに分析させる方が
    感情の「文脈依存性」を正しく捉えられる（例：アイロニー、皮肉の検出）
    """

    def analyze_conversation(self, utterances: list[dict]) -> list[dict]:
        conversation_text = "\n".join([
            f"[{u['speaker']}] {u['text']}"
            for u in utterances
        ])

        prompt = f"""以下の会話の各発話について、感情を分析してください。
会話の文脈（前後の発話）を考慮してください。

会話:
{conversation_text}

各発話に対して以下のJSON配列を返してください:
[
  {{
    "utterance_index": 0,
    "emotion": "感情ラベル",
    "intensity": 0.0-1.0,
    "valence": -1.0-1.0,
    "context_dependency": "この感情が前の発話にどう依存しているか"
  }},
  ...
]"""

        # LLM呼び出し（Claude等）
        return self._call_llm(prompt)
```

---

## 6. 実装例とモデル選定ガイド

### 選定フローチャート

```
日本語音声が主な入力？
├─ Yes → 音声+テキストのマルチモーダルが推奨
│   ├─ ASR: Whisper large-v3
│   ├─ テキスト感情: LLM (Claude/GPT-4) または日本語ファインチューン済みBERT
│   └─ 音声感情: Wav2Vec2 (ファインチューニング推奨)
└─ No (英語中心)
    ├─ テキスト: RoBERTa-base on GoEmotions
    └─ 音声: wav2vec2-lg-xlsr SER

リアルタイム処理必要？
├─ Yes → 軽量モデル (DistilBERT + MFCC特徴量)
└─ No → 高精度モデル (LLM + Wav2Vec2)
```

### 日本語対応モデル一覧

| モデル | タスク | 日本語 | 速度 | 精度 |
|--------|--------|--------|------|------|
| `cl-tohoku/bert-base-japanese-v3` | テキスト感情 | ○ | 速い | 高い |
| `rinna/japanese-roberta-base` | テキスト感情 | ○ | 速い | 高い |
| Whisper large-v3 + Claude | ASR+感情 | ◎ | 遅い | 最高 |
| `sonoisa/emotion-japanese-v1` | テキスト感情 | ○ | 速い | 中程度 |

---

## 7. 評価指標とデータセット

### 評価指標

```python
from sklearn.metrics import classification_report, f1_score

def evaluate_erc(y_true: list, y_pred: list, labels: list) -> dict:
    report = classification_report(y_true, y_pred, target_names=labels, output_dict=True)
    return {
        "weighted_f1": f1_score(y_true, y_pred, average='weighted'),
        "macro_f1": f1_score(y_true, y_pred, average='macro'),
        "per_class": {label: report[label] for label in labels}
    }
```

### ベンチマークデータセット

| データセット | 言語 | 規模 | 感情数 | 特徴 |
|------------|------|------|-------|------|
| IEMOCAP | 英語 | 12時間 | 9 | 標準的ベンチマーク |
| MELD | 英語 | Friends台本 | 7 | 多人数会話 |
| CMU-MOSI | 英語 | 2199発話 | 連続値 | マルチモーダル標準 |
| JTES (日本語) | 日本語 | 500発話 | 4 | 日本語感情音声 |
| JVS-MuSiC | 日本語 | 100話者 | - | 感情合成向け |

### 日本語データセット収集戦略（アノテーション）

```python
# クラウドソーシングでのアノテーション設計例
annotation_schema = {
    "instruction": "この発話を読み、最も強く感じる感情を1つ選んでください",
    "options": ["neutral", "joy", "anger", "sadness", "surprise", "fear"],
    "agreement_threshold": 3,  # 5人中3人が一致したら採用
    "inter_annotator_agreement": "Fleiss' kappa > 0.6 を目標"
}
```
