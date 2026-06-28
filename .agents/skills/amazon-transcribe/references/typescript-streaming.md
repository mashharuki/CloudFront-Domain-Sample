# TypeScript / JavaScript ストリーミング実装リファレンス

## 依存関係

```bash
# AWS SDK v3 ストリーミング専用クライアント
npm install @aws-sdk/client-transcribe-streaming

# 認証情報プロバイダー
npm install @aws-sdk/credential-providers

# WAVヘッダー処理（WAVファイルをストリーミングする場合）
npm install wav @types/wav

# マイク入力（Node.js）
npm install mic @types/mic

# ブラウザマイク入力は Web Audio API を使用（インストール不要）
```

## 実装パターン1：PCMファイルのストリーミング（Node.js）

```typescript
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  TranscriptResultStream,
} from "@aws-sdk/client-transcribe-streaming";
import { fromIni } from "@aws-sdk/credential-providers";
import { createReadStream } from "fs";

const REGION = "ap-northeast-1";
const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;
const CHUNK_SIZE = Math.floor((CHUNK_DURATION_MS / 1000) * SAMPLE_RATE * 2); // bytes

async function* createAudioStream(
  filePath: string
): AsyncIterable<AudioStream> {
  const fileStream = createReadStream(filePath);
  let buffer = Buffer.alloc(0);

  for await (const chunk of fileStream) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
    while (buffer.length >= CHUNK_SIZE) {
      yield {
        AudioEvent: {
          AudioChunk: new Uint8Array(buffer.subarray(0, CHUNK_SIZE)),
        },
      };
      buffer = buffer.subarray(CHUNK_SIZE);
      // リアルタイムレートに近づける
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DURATION_MS));
    }
  }
  // 残りのデータを送信
  if (buffer.length > 0) {
    yield { AudioEvent: { AudioChunk: new Uint8Array(buffer) } };
  }
}

async function transcribePcmFile(
  filePath: string,
  languageCode = "ja-JP"
): Promise<string> {
  const client = new TranscribeStreamingClient({
    region: REGION,
    credentials: fromIni(), // ~/.aws/credentials 使用
  });

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: languageCode,
    MediaSampleRateHertz: SAMPLE_RATE,
    MediaEncoding: "pcm",
    AudioStream: createAudioStream(filePath),
  });

  const response = await client.send(command);
  const results: string[] = [];

  for await (const event of response.TranscriptResultStream!) {
    if (event.TranscriptEvent?.Transcript?.Results) {
      for (const result of event.TranscriptEvent.Transcript.Results) {
        if (!result.IsPartial && result.Alternatives?.[0]?.Transcript) {
          const text = result.Alternatives[0].Transcript;
          console.log(`[final] ${text}`);
          results.push(text);
        }
      }
    }
  }

  return results.join(" ");
}

transcribePcmFile("./audio.pcm").then(console.log).catch(console.error);
```

## 実装パターン2：WAVファイルのストリーミング

```typescript
import { TranscribeStreamingClient, StartStreamTranscriptionCommand, AudioStream } from "@aws-sdk/client-transcribe-streaming";
import { createReadStream } from "fs";
import { Reader as WavReader } from "wav";

async function* wavAudioStream(
  wavFilePath: string,
  chunkDurationMs = 100
): AsyncIterable<AudioStream> {
  return new Promise<AsyncIterable<AudioStream>>((resolve, reject) => {
    const reader = new WavReader();
    const chunks: Buffer[] = [];
    let sampleRate = 16000;

    reader.on("format", (format) => {
      sampleRate = format.sampleRate;
      const chunkSize = Math.floor(
        (chunkDurationMs / 1000) * format.sampleRate * format.channels * (format.bitDepth / 8)
      );

      async function* generate(): AsyncIterable<AudioStream> {
        let buffer = Buffer.alloc(0);
        for (const chunk of chunks) {
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= chunkSize) {
            yield {
              AudioEvent: {
                AudioChunk: new Uint8Array(buffer.subarray(0, chunkSize)),
              },
            };
            buffer = buffer.subarray(chunkSize);
            await new Promise((r) => setTimeout(r, chunkDurationMs));
          }
        }
        if (buffer.length > 0) {
          yield { AudioEvent: { AudioChunk: new Uint8Array(buffer) } };
        }
      }

      resolve(generate());
    });

    reader.on("data", (chunk: Buffer) => chunks.push(chunk));
    reader.on("error", reject);

    createReadStream(wavFilePath).pipe(reader);
  });
}

// 簡略版：wavライブラリでサンプルレートを取得してから送信
async function transcribeWavFile(wavPath: string, languageCode = "ja-JP"): Promise<string> {
  const { getSampleRate } = await import("./utils/wavUtils"); // サンプルレート取得ユーティリティ
  const sampleRate = await getSampleRate(wavPath);

  const client = new TranscribeStreamingClient({ region: "ap-northeast-1" });
  const command = new StartStreamTranscriptionCommand({
    LanguageCode: languageCode,
    MediaSampleRateHertz: sampleRate,
    MediaEncoding: "pcm",
    AudioStream: await wavAudioStream(wavPath),
  });

  const response = await client.send(command);
  const results: string[] = [];

  for await (const event of response.TranscriptResultStream!) {
    const transcriptResults = event.TranscriptEvent?.Transcript?.Results ?? [];
    for (const result of transcriptResults) {
      if (!result.IsPartial) {
        results.push(result.Alternatives?.[0]?.Transcript ?? "");
      }
    }
  }

  return results.join(" ");
}
```

## 実装パターン3：ブラウザのマイクから（React）

```typescript
import { useEffect, useRef, useState } from "react";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from "@aws-sdk/client-transcribe-streaming";

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;
const CHUNK_SIZE = Math.floor((CHUNK_DURATION_MS / 1000) * SAMPLE_RATE * 2);

// ブラウザの AudioContext でPCMに変換
async function* browserMicStream(
  mediaStream: MediaStream
): AsyncIterable<AudioStream> {
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = audioContext.createMediaStreamSource(mediaStream);
  const processor = audioContext.createScriptProcessor(CHUNK_SIZE / 2, 1, 1);

  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(audioContext.destination);

  while (true) {
    if (chunks.length === 0) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    const float32Data = chunks.shift()!;
    // Float32 (-1.0 to 1.0) → Int16 PCM に変換
    const int16Data = new Int16Array(float32Data.length);
    for (let i = 0; i < float32Data.length; i++) {
      int16Data[i] = Math.max(-32768, Math.min(32767, float32Data[i] * 32768));
    }
    yield { AudioEvent: { AudioChunk: new Uint8Array(int16Data.buffer) } };
  }
}

export function useTranscription(credentials: {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}) {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1 },
    });
    streamRef.current = mediaStream;
    setIsRecording(true);

    const client = new TranscribeStreamingClient({
      region: credentials.region ?? "ap-northeast-1",
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "ja-JP",
      MediaSampleRateHertz: SAMPLE_RATE,
      MediaEncoding: "pcm",
      AudioStream: browserMicStream(mediaStream),
    });

    const response = await client.send(command);

    for await (const event of response.TranscriptResultStream!) {
      const results = event.TranscriptEvent?.Transcript?.Results ?? [];
      for (const result of results) {
        if (!result.IsPartial) {
          setTranscript((prev) => prev + " " + (result.Alternatives?.[0]?.Transcript ?? ""));
        }
      }
    }
  };

  const stopRecording = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  };

  return { transcript, isRecording, startRecording, stopRecording };
}
```

## 実装パターン4：Node.js マイク入力（Server-side）

```typescript
import { TranscribeStreamingClient, StartStreamTranscriptionCommand, AudioStream } from "@aws-sdk/client-transcribe-streaming";
import mic from "mic";

const SAMPLE_RATE = 16000;

async function* micAudioStream(): AsyncIterable<AudioStream> {
  const micInstance = mic({
    rate: String(SAMPLE_RATE),
    channels: "1",
    bitwidth: "16",
    encoding: "signed-integer",
    endian: "little",
  });

  const micStream = micInstance.getAudioStream();
  micInstance.start();

  try {
    for await (const chunk of micStream) {
      yield { AudioEvent: { AudioChunk: new Uint8Array(chunk as Buffer) } };
    }
  } finally {
    micInstance.stop();
  }
}

async function transcribeFromMic(): Promise<void> {
  const client = new TranscribeStreamingClient({ region: "ap-northeast-1" });
  const command = new StartStreamTranscriptionCommand({
    LanguageCode: "ja-JP",
    MediaSampleRateHertz: SAMPLE_RATE,
    MediaEncoding: "pcm",
    AudioStream: micAudioStream(),
    EnablePartialResultsStabilization: true,
    PartialResultsStability: "medium",
  });

  console.log("Recording... Ctrl+C to stop.");
  const response = await client.send(command);

  for await (const event of response.TranscriptResultStream!) {
    const results = event.TranscriptEvent?.Transcript?.Results ?? [];
    for (const result of results) {
      const text = result.Alternatives?.[0]?.Transcript ?? "";
      if (result.IsPartial) {
        process.stdout.write(`\r[partial] ${text}   `);
      } else {
        console.log(`\n[final]   ${text}`);
      }
    }
  }
}

transcribeFromMic().catch(console.error);
```

## 高度なオプション（TypeScript）

```typescript
const command = new StartStreamTranscriptionCommand({
  LanguageCode: "ja-JP",
  MediaSampleRateHertz: 16000,
  MediaEncoding: "pcm",
  AudioStream: myAudioStream(),

  // カスタム語彙
  VocabularyName: "my-custom-vocab",

  // 語彙フィルター
  VocabularyFilterName: "my-filter",
  VocabularyFilterMethod: "remove",

  // スピーカー識別
  ShowSpeakerLabel: true,

  // 部分結果の安定化
  EnablePartialResultsStabilization: true,
  PartialResultsStability: "high",

  // チャンネル識別（ステレオ）
  EnableChannelIdentification: true,
  NumberOfChannels: 2,

  // 言語自動識別（LanguageCode の代わりに使用）
  // IdentifyLanguage: true,
  // LanguageOptions: "ja-JP,en-US",
});
```

## エラーハンドリング（TypeScript）

```typescript
import { TranscribeStreamingServiceException } from "@aws-sdk/client-transcribe-streaming";

async function transcribeWithRetry(
  filePath: string,
  maxRetries = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transcribePcmFile(filePath);
    } catch (error) {
      if (
        error instanceof TranscribeStreamingServiceException &&
        error.name === "LimitExceededException" &&
        attempt < maxRetries - 1
      ) {
        const wait = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.warn(`Rate limited. Retrying in ${wait.toFixed(0)}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded");
}
```

## AWS認証情報の設定

```typescript
import { fromEnv, fromIni, fromInstanceMetadata } from "@aws-sdk/credential-providers";

// 環境変数から（Lambda・ECSタスク・CI/CD環境）
const client1 = new TranscribeStreamingClient({
  region: "ap-northeast-1",
  credentials: fromEnv(),
});

// ~/.aws/credentials から（ローカル開発）
const client2 = new TranscribeStreamingClient({
  region: "ap-northeast-1",
  credentials: fromIni({ profile: "default" }),
});

// EC2 インスタンスメタデータから
const client3 = new TranscribeStreamingClient({
  region: "ap-northeast-1",
  credentials: fromInstanceMetadata(),
});

// ハードコードは厳禁（本番では使用しない）
// credentials: { accessKeyId: "...", secretAccessKey: "..." }  ← NG
```
