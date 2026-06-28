# 会話解析・5W1H情報抽出 技術リファレンス

## 目次
1. [5W1H情報抽出の概要](#1-5w1h情報抽出の概要)
2. [NLP情報抽出手法](#2-nlp情報抽出手法)
3. [LLMによる情報抽出](#3-llmによる情報抽出)
4. [会話構造分析](#4-会話構造分析)
5. [アクション・タスク抽出](#5-アクション・タスク抽出)
6. [多人数会議の分析](#6-多人数会議の分析)
7. [出力スキーマ設計](#7-出力スキーマ設計)

---

## 1. 5W1H情報抽出の概要

会話から以下の構造情報を抽出する：

| 要素 | 英語 | 例 |
|------|------|---|
| いつ | When | 「来週月曜日」「午後3時に」「Q3の決算発表後」 |
| どこ | Where | 「東京オフィス」「Zoom会議室」「本社3階会議室」 |
| 誰が | Who | 「田中部長」「営業チーム全員」「クライアントのABC社」 |
| 何を | What | 「提案書の作成」「バグの修正」「契約の締結」 |
| なぜ | Why | 「売上を改善するため」「期限があるから」 |
| どのように | How | 「メールで送る」「直接訪問する」「自動化で対処」 |

---

## 2. NLP情報抽出手法

### Named Entity Recognition (NER)

```python
import spacy

# 日本語モデル
nlp = spacy.load("ja_core_news_lg")

def extract_entities(text: str) -> dict:
    doc = nlp(text)
    entities = {
        "PERSON": [],    # 人名
        "ORG": [],       # 組織名
        "GPE": [],       # 地名・国名
        "DATE": [],      # 日付
        "TIME": [],      # 時刻
        "MONEY": [],     # 金額
        "EVENT": [],     # イベント名
    }

    for ent in doc.ents:
        if ent.label_ in entities:
            entities[ent.label_].append({
                "text": ent.text,
                "start": ent.start_char,
                "end": ent.end_char
            })

    return entities

# 使用例
text = "田中さんが来週月曜日に東京オフィスで山田部長と会議をします"
result = extract_entities(text)
# → {"PERSON": ["田中", "山田部長"], "DATE": ["来週月曜日"], "GPE": ["東京"]}
```

### 関係抽出（Relation Extraction）

```python
# OpenIE的なアプローチでSPO（主語・述語・目的語）を抽出
def extract_spo_triplets(text: str) -> list[dict]:
    doc = nlp(text)
    triplets = []

    for sent in doc.sents:
        for token in sent:
            if token.dep_ == "ROOT":  # 述語
                subject = None
                obj = None

                for child in token.children:
                    if child.dep_ in ("nsubj", "nsubjpass"):
                        subject = child.text
                    elif child.dep_ in ("dobj", "obj", "iobj"):
                        obj = child.text

                if subject or obj:
                    triplets.append({
                        "subject": subject,
                        "predicate": token.text,
                        "object": obj
                    })

    return triplets
```

---

## 3. LLMによる情報抽出

LLMを使うと、ルールベースでは難しい暗黙的な情報も抽出できる。

### 発話単位の5W1H抽出

```python
import anthropic
import json

client = anthropic.Anthropic()

def extract_5w1h_from_utterance(
    utterance: str,
    speaker: str,
    context: list[str]
) -> dict:
    context_str = "\n".join(context[-3:]) if context else "（会話開始）"

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": f"""以下の発話から5W1H情報を抽出してください。

話者: {speaker}
コンテキスト（直近の発話）:
{context_str}

対象発話: 「{utterance}」

明示的に言及されているもののみ抽出してください（推測は含めない）。
情報がない要素はnullとしてください。

JSON形式で回答:
{{
  "who": ["人物・組織のリスト"],
  "what": ["行動・出来事・トピック"],
  "when": ["時間表現"],
  "where": ["場所"],
  "why": ["理由・目的"],
  "how": ["方法・手段"],
  "is_action_item": true/false,
  "action_assignee": "誰が担当するか（action_itemがtrueの場合）",
  "action_deadline": "期限（action_itemがtrueの場合）"
}}"""
        }]
    )

    try:
        return json.loads(response.content[0].text)
    except json.JSONDecodeError:
        return _empty_5w1h()

def _empty_5w1h() -> dict:
    return {
        "who": [], "what": [], "when": [], "where": [],
        "why": [], "how": [],
        "is_action_item": False, "action_assignee": None, "action_deadline": None
    }
```

### 会話全体サマリー生成

```python
def generate_conversation_summary(utterances: list[dict]) -> dict:
    conversation_text = "\n".join([
        f"[{u['speaker']} ({u['start_time']:.0f}秒)] {u['text']}"
        for u in utterances
    ])

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": f"""以下の会話を分析し、構造化されたサマリーを作成してください。

会話:
{conversation_text}

以下のJSON形式で回答してください:
{{
  "title": "会話のタイトル（1文）",
  "duration_summary": "会話の概要（2-3文）",
  "participants": [
    {{"name": "話者名", "role": "推定される役割", "speaking_time_percent": 0}}
  ],
  "key_topics": ["主要トピック1", "トピック2"],
  "decisions": ["決定事項1", "決定事項2"],
  "action_items": [
    {{
      "task": "タスク内容",
      "assignee": "担当者",
      "deadline": "期限",
      "priority": "high/medium/low"
    }}
  ],
  "sentiment_arc": "会話全体の感情の流れ（例: neutral → positive → concerned）",
  "unresolved_issues": ["未解決の問題や議題"]
}}"""
        }]
    )

    return json.loads(response.content[0].text)
```

---

## 4. 会話構造分析

### 発話行為（Speech Act）分類

```python
SPEECH_ACT_PROMPT = """
以下の発話の発話行為（Speech Act）を分類してください:

発話: 「{utterance}」

カテゴリ:
- QUESTION: 質問・問いかけ
- ANSWER: 回答・情報提供
- REQUEST: 依頼・要求
- PROMISE: 約束・コミットメント
- STATEMENT: 陳述・説明
- GREETING: 挨拶・社交的表現
- DISAGREEMENT: 反対・異議
- AGREEMENT: 同意・確認
- SUGGESTION: 提案

JSON: {{"act": "カテゴリ", "confidence": 0.0-1.0}}
"""

def classify_speech_act(utterance: str) -> dict:
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",  # 速度優先
        max_tokens=64,
        messages=[{"role": "user",
                   "content": SPEECH_ACT_PROMPT.format(utterance=utterance)}]
    )
    return json.loads(response.content[0].text)
```

### 話者交代パターン分析

```python
from collections import Counter
from itertools import pairwise

def analyze_turn_taking(utterances: list[dict]) -> dict:
    speakers = [u["speaker"] for u in utterances]
    turn_pairs = list(pairwise(speakers))

    return {
        "total_turns": len(utterances),
        "speaker_turn_count": Counter(speakers),
        "transition_matrix": Counter(turn_pairs),
        "avg_utterance_duration": {
            speaker: sum(u["end"] - u["start"]
                        for u in utterances if u["speaker"] == speaker)
                    / speakers.count(speaker)
            for speaker in set(speakers)
        },
        "longest_monologue": max(
            (u["end"] - u["start"] for u in utterances), default=0
        )
    }
```

---

## 5. アクション・タスク抽出

### アクションアイテム検出

```python
ACTION_INDICATORS_JA = [
    "します", "やります", "確認します", "送ります", "作成します",
    "お願いします", "ください", "してもらえますか", "までに",
    "担当します", "対応します", "検討します"
]

def detect_action_items_heuristic(utterance: str, speaker: str) -> bool:
    """ヒューリスティックな事前フィルタリング（LLM呼び出しコスト削減）"""
    return any(indicator in utterance for indicator in ACTION_INDICATORS_JA)

class ActionItemExtractor:
    def __init__(self, threshold: float = 0.7):
        self.threshold = threshold

    def extract(self, utterances: list[dict]) -> list[dict]:
        candidates = [
            u for u in utterances
            if detect_action_items_heuristic(u["text"], u["speaker"])
        ]

        # LLMで精緻化
        action_items = []
        for candidate in candidates:
            result = extract_5w1h_from_utterance(
                candidate["text"], candidate["speaker"], []
            )
            if result.get("is_action_item"):
                action_items.append({
                    "utterance": candidate["text"],
                    "speaker": candidate["speaker"],
                    "timestamp": candidate["start"],
                    "task": result["what"][0] if result["what"] else candidate["text"],
                    "assignee": result.get("action_assignee"),
                    "deadline": result.get("action_deadline")
                })

        return action_items
```

---

## 6. 多人数会議の分析

### 発言量・発言パターン分析

```python
import numpy as np
from dataclasses import dataclass

@dataclass
class SpeakerStats:
    speaker_id: str
    total_speech_time: float
    turn_count: int
    avg_utterance_length: float
    interruption_count: int
    question_count: int
    emotion_distribution: dict

def analyze_meeting_participation(utterances: list[dict]) -> dict:
    stats = {}

    for utt in utterances:
        sid = utt["speaker"]
        if sid not in stats:
            stats[sid] = {
                "speech_time": 0, "turns": 0, "chars": 0,
                "questions": 0, "emotions": []
            }

        duration = utt["end"] - utt["start"]
        stats[sid]["speech_time"] += duration
        stats[sid]["turns"] += 1
        stats[sid]["chars"] += len(utt.get("text", ""))
        if "？" in utt.get("text", "") or "?" in utt.get("text", ""):
            stats[sid]["questions"] += 1
        if "emotion" in utt:
            stats[sid]["emotions"].append(utt["emotion"]["label"])

    total_time = sum(s["speech_time"] for s in stats.values())

    return {
        speaker: {
            "speech_time_seconds": s["speech_time"],
            "participation_rate": s["speech_time"] / total_time if total_time > 0 else 0,
            "turn_count": s["turns"],
            "question_count": s["questions"],
            "dominant_emotion": Counter(s["emotions"]).most_common(1)[0][0]
                               if s["emotions"] else "unknown"
        }
        for speaker, s in stats.items()
    }
```

### インタラクションネットワーク分析

```python
def build_interaction_network(utterances: list[dict]) -> dict:
    """誰が誰に向けて発言しているかのネットワークを構築"""
    from itertools import pairwise

    edges = Counter()
    for (prev, curr) in pairwise(utterances):
        if prev["speaker"] != curr["speaker"]:
            edges[(prev["speaker"], curr["speaker"])] += 1

    return {
        "nodes": list(set(u["speaker"] for u in utterances)),
        "edges": [
            {"from": src, "to": dst, "weight": count}
            for (src, dst), count in edges.items()
        ]
    }
```

---

## 7. 出力スキーマ設計

### 標準会話解析結果スキーマ

```python
from pydantic import BaseModel
from typing import Optional

class EmotionResult(BaseModel):
    label: str
    confidence: float
    valence: Optional[float] = None
    arousal: Optional[float] = None

class Entities5W1H(BaseModel):
    who: list[str] = []
    what: list[str] = []
    when: list[str] = []
    where: list[str] = []
    why: list[str] = []
    how: list[str] = []

class Utterance(BaseModel):
    id: str
    speaker_id: str
    speaker_name: Optional[str] = None
    start_time: float
    end_time: float
    text: str
    confidence: float
    emotion: Optional[EmotionResult] = None
    entities: Optional[Entities5W1H] = None
    speech_act: Optional[str] = None
    is_action_item: bool = False

class ActionItem(BaseModel):
    task: str
    assignee: Optional[str] = None
    deadline: Optional[str] = None
    priority: str = "medium"
    source_utterance_id: str

class ConversationAnalysisResult(BaseModel):
    conversation_id: str
    duration_seconds: float
    language: str = "ja"
    speakers: list[dict]
    utterances: list[Utterance]
    summary: Optional[str] = None
    key_topics: list[str] = []
    decisions: list[str] = []
    action_items: list[ActionItem] = []
    sentiment_arc: Optional[str] = None
    participation_stats: Optional[dict] = None
```
