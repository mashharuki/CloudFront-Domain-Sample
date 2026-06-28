# Floci に AWS Translate サービスを追加する

## Step 1: プロトコルの選定

AWS Translate は **JSON 1.1** プロトコルを使います。

| 確認ポイント | 詳細 |
|---|---|
| Content-Type | `application/x-amz-json-1.1` |
| ルーティングヘッダ | `X-Amz-Target: AWSShineFrontendService_20170701.<Action>` |
| エンドポイント | `https://translate.{region}.amazonaws.com/` |
| レスポンス | JSON |

AWS SDK が実際に送るリクエストを確認するには:
```bash
aws translate translate-text \
  --text "Hello" \
  --source-language-code en \
  --target-language-code ja \
  --debug 2>&1 | grep "X-Amz-Target"
# → X-Amz-Target: AWSShineFrontendService_20170701.TranslateText
```

Floci では **JSON 1.1 サービスのリファレンス実装は `services/ssm/` や `services/textract/`** です。
Translate は状態を持たない（テキスト変換はステートレス）ため、Textract のパターンが最も近いです。

---

## Step 2: ディレクトリ構成

```
src/main/java/io/github/hectorvent/floci/services/translate/
├── TranslateJsonHandler.java     ← JSON 1.1 ハンドラ（AwsJson11Controller から呼ばれる）
├── TranslateService.java         ← ビジネスロジック
└── model/
    └── TranslationResult.java    ← ドメインモデル
```

---

## Step 3: Javaコード

### 3-1. モデルクラス

```java
// src/main/java/io/github/hectorvent/floci/services/translate/model/TranslationResult.java
package io.github.hectorvent.floci.services.translate.model;

/**
 * Represents the result of a TranslateText operation.
 *
 * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html">TranslateText</a>
 */
public record TranslationResult(
        String translatedText,
        String sourceLanguageCode,
        String targetLanguageCode
) {}
```

---

### 3-2. サービスクラス

```java
// src/main/java/io/github/hectorvent/floci/services/translate/TranslateService.java
package io.github.hectorvent.floci.services.translate;

import io.github.hectorvent.floci.core.common.AwsException;
import io.github.hectorvent.floci.services.translate.model.TranslationResult;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Set;

/**
 * Business logic for Amazon Translate.
 * <p>
 * This is a stub implementation: no real translation is performed.
 * TranslateText echoes the input text back as the "translated" result,
 * which is sufficient for local development and integration testing.
 *
 * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/API_Operations.html">Translate API</a>
 */
@ApplicationScoped
public class TranslateService {

    /** BCP-47 language codes accepted by the stub. */
    private static final Set<String> SUPPORTED_LANGUAGES = Set.of(
            "auto", "en", "ja", "fr", "de", "es", "pt", "it",
            "ko", "zh", "zh-TW", "ar", "ru", "hi"
    );

    /**
     * TranslateText — returns the original text unchanged (stub).
     * <p>
     * In a real implementation this would delegate to an NMT backend.
     * Response shape: https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html
     *
     * @param text               source text (1-10 000 UTF-8 bytes)
     * @param sourceLanguageCode BCP-47 source language code, or "auto"
     * @param targetLanguageCode BCP-47 target language code
     * @return translation result
     */
    public TranslationResult translateText(String text,
                                           String sourceLanguageCode,
                                           String targetLanguageCode) {
        // --- Input validation (matches AWS error behaviour) ---
        if (text == null || text.isBlank()) {
            throw new AwsException("ValidationException",
                    "1 validation error detected: Value at 'text' failed to satisfy constraint: "
                    + "Member must not be null", 400);
        }
        if (text.length() > 10_000) {
            throw new AwsException("TextSizeLimitExceededException",
                    "Input text size exceeds limit. Max length of request text permitted "
                    + "(including spaces) is 10000 bytes.", 400);
        }
        if (sourceLanguageCode == null || sourceLanguageCode.isBlank()) {
            throw new AwsException("ValidationException",
                    "1 validation error detected: Value at 'sourceLanguageCode' failed "
                    + "to satisfy constraint: Member must not be null", 400);
        }
        if (targetLanguageCode == null || targetLanguageCode.isBlank()) {
            throw new AwsException("ValidationException",
                    "1 validation error detected: Value at 'targetLanguageCode' failed "
                    + "to satisfy constraint: Member must not be null", 400);
        }
        if (!SUPPORTED_LANGUAGES.contains(sourceLanguageCode)
                && !"auto".equals(sourceLanguageCode)) {
            throw new AwsException("UnsupportedLanguagePairException",
                    "Amazon Translate does not support translation from the language of "
                    + "the source text into the requested target language.", 400);
        }
        if (!SUPPORTED_LANGUAGES.contains(targetLanguageCode)) {
            throw new AwsException("UnsupportedLanguagePairException",
                    "Amazon Translate does not support translation from the language of "
                    + "the source text into the requested target language.", 400);
        }

        // Stub: echo the text back. Replace with real translation if needed.
        String resolvedSource = "auto".equals(sourceLanguageCode) ? "en" : sourceLanguageCode;
        return new TranslationResult(text, resolvedSource, targetLanguageCode);
    }
}
```

---

### 3-3. ハンドラクラス

```java
// src/main/java/io/github/hectorvent/floci/services/translate/TranslateJsonHandler.java
package io.github.hectorvent.floci.services.translate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.github.hectorvent.floci.core.common.AwsErrorResponse;
import io.github.hectorvent.floci.services.translate.model.TranslationResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

/**
 * JSON 1.1 handler for Amazon Translate API operations.
 * Dispatches X-Amz-Target: AWSShineFrontendService_20170701.* actions
 * to {@link TranslateService}.
 *
 * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/API_Operations.html">Translate API</a>
 */
@ApplicationScoped
public class TranslateJsonHandler {

    private static final Logger LOG = Logger.getLogger(TranslateJsonHandler.class);

    private final TranslateService translateService;
    private final ObjectMapper objectMapper;

    @Inject
    public TranslateJsonHandler(TranslateService translateService, ObjectMapper objectMapper) {
        this.translateService = translateService;
        this.objectMapper = objectMapper;
    }

    /**
     * Dispatches Translate actions received via {@link io.github.hectorvent.floci.core.common.AwsJson11Controller}.
     */
    public Response handle(String action, JsonNode request, String region) {
        LOG.debugv("Translate action: {0}", action);
        return switch (action) {
            case "TranslateText" -> handleTranslateText(request);
            default -> Response.status(400)
                    .entity(new AwsErrorResponse("UnknownOperationException",
                            "Unknown operation: AWSShineFrontendService_20170701." + action))
                    .build();
        };
    }

    // -------------------------------------------------------------------------
    // Action handlers
    // -------------------------------------------------------------------------

    /**
     * Handles TranslateText.
     * Request:  { "Text": "...", "SourceLanguageCode": "en", "TargetLanguageCode": "ja" }
     * Response: { "TranslatedText": "...", "SourceLanguageCode": "en", "TargetLanguageCode": "ja" }
     *
     * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html">TranslateText</a>
     */
    private Response handleTranslateText(JsonNode request) {
        String text               = getStringField(request, "Text");
        String sourceLanguageCode = getStringField(request, "SourceLanguageCode");
        String targetLanguageCode = getStringField(request, "TargetLanguageCode");

        TranslationResult result =
                translateService.translateText(text, sourceLanguageCode, targetLanguageCode);

        // Build response shape matching AWS wire format exactly
        ObjectNode root = objectMapper.createObjectNode();
        root.put("TranslatedText",      result.translatedText());
        root.put("SourceLanguageCode",  result.sourceLanguageCode());
        root.put("TargetLanguageCode",  result.targetLanguageCode());

        // AppliedTerminologies is required in the response by the SDK even when empty
        root.putArray("AppliedTerminologies");

        return Response.ok(root).build();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private String getStringField(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return (value != null && !value.isNull()) ? value.asText() : null;
    }
}
```

---

## Step 4: サービスの登録

### 4-1. `ResolvedServiceCatalog.java` への追加

`textract` エントリの直後（または末尾）に追記:

```java
descriptor("translate", "translate", config.services().translate().enabled(), true,
        null, null, 5000L, null, ServiceProtocol.JSON,
        protocols(ServiceProtocol.JSON),
        Set.of("AWSShineFrontendService_20170701."), Set.of("translate"), Set.of(), Set.of()),
```

> **`null` storage の理由:** Translate はステートレス（翻訳結果を永続化しない）なので、storageKey・storageMode ともに `null` で問題ありません。Textract・Transcribe と同じパターンです。

---

### 4-2. `AwsJson11Controller.java` への追加

**フィールド宣言:**

```java
private final TranslateJsonHandler translateJsonHandler;
```

**コンストラクタ引数:**

```java
TranslateJsonHandler translateJsonHandler,
```

**コンストラクタ本体:**

```java
this.translateJsonHandler = translateJsonHandler;
```

**`switch` 文:**

```java
case "translate" -> translateJsonHandler.handle(action, request, region);
```

**import 文:**

```java
import io.github.hectorvent.floci.services.translate.TranslateJsonHandler;
```

---

### 4-3. `EmulatorConfig.java` への追加

`ServicesConfig` インタフェースに:

```java
TranslateServiceConfig translate();
```

新しい config インタフェース:

```java
interface TranslateServiceConfig {
    @WithDefault("true")
    boolean enabled();
}
```

---

### 4-4. `application.yml` への追加

`src/main/resources/application.yml` — `floci.services` セクションに:

```yaml
    translate:
      enabled: true
```

`src/test/resources/application.yml` — 同じく:

```yaml
    translate:
      enabled: true
```

---

## Step 5: テスト骨格

### 統合テスト

```java
// src/test/java/io/github/hectorvent/floci/services/translate/TranslateIntegrationTest.java
package io.github.hectorvent.floci.services.translate;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class TranslateIntegrationTest {

    @Test
    void translateText_returnsTranslatedText() {
        given()
            .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
            .contentType("application/x-amz-json-1.1")
            .body("""
                {
                  "Text": "Hello, world!",
                  "SourceLanguageCode": "en",
                  "TargetLanguageCode": "ja"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("TranslatedText",     notNullValue())
            .body("SourceLanguageCode", equalTo("en"))
            .body("TargetLanguageCode", equalTo("ja"))
            .body("AppliedTerminologies", notNullValue());
    }

    @Test
    void translateText_rejectsBlankText() {
        given()
            .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
            .contentType("application/x-amz-json-1.1")
            .body("""
                {
                  "Text": "",
                  "SourceLanguageCode": "en",
                  "TargetLanguageCode": "ja"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(400)
            .body("__type", equalTo("ValidationException"));
    }

    @Test
    void translateText_rejectsUnsupportedLanguage() {
        given()
            .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
            .contentType("application/x-amz-json-1.1")
            .body("""
                {
                  "Text": "Hello",
                  "SourceLanguageCode": "en",
                  "TargetLanguageCode": "xx-UNKNOWN"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(400)
            .body("__type", equalTo("UnsupportedLanguagePairException"));
    }
}
```

### ユニットテスト

```java
// src/test/java/io/github/hectorvent/floci/services/translate/TranslateServiceTest.java
package io.github.hectorvent.floci.services.translate;

import io.github.hectorvent.floci.core.common.AwsException;
import io.github.hectorvent.floci.services.translate.model.TranslationResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TranslateServiceTest {

    private TranslateService service;

    @BeforeEach
    void setUp() {
        service = new TranslateService();
    }

    @Test
    void translateText_returnsEchoedText() {
        TranslationResult result = service.translateText("Hello", "en", "ja");
        assertThat(result.translatedText()).isEqualTo("Hello");
        assertThat(result.sourceLanguageCode()).isEqualTo("en");
        assertThat(result.targetLanguageCode()).isEqualTo("ja");
    }

    @Test
    void translateText_resolvesAutoSourceLanguage() {
        TranslationResult result = service.translateText("Hello", "auto", "ja");
        assertThat(result.sourceLanguageCode()).isEqualTo("en");
    }

    @Test
    void translateText_throwsOnBlankText() {
        AwsException ex = assertThrows(AwsException.class,
                () -> service.translateText("", "en", "ja"));
        assertThat(ex.getCode()).isEqualTo("ValidationException");
        assertThat(ex.getStatusCode()).isEqualTo(400);
    }

    @Test
    void translateText_throwsOnTooLongText() {
        String longText = "a".repeat(10_001);
        AwsException ex = assertThrows(AwsException.class,
                () -> service.translateText(longText, "en", "ja"));
        assertThat(ex.getCode()).isEqualTo("TextSizeLimitExceededException");
    }

    @Test
    void translateText_throwsOnUnsupportedTargetLanguage() {
        AwsException ex = assertThrows(AwsException.class,
                () -> service.translateText("Hello", "en", "xx-UNKNOWN"));
        assertThat(ex.getCode()).isEqualTo("UnsupportedLanguagePairException");
    }

    @Test
    void translateText_throwsOnNullSourceLanguageCode() {
        AwsException ex = assertThrows(AwsException.class,
                () -> service.translateText("Hello", null, "ja"));
        assertThat(ex.getCode()).isEqualTo("ValidationException");
    }
}
```

---

## Step 6: 動作確認コマンド

```bash
# 1. Floci を起動
./mvnw quarkus:dev

# 2. 別ターミナルで AWS CLI で確認
aws --endpoint-url http://localhost:4566 translate translate-text \
  --text "Hello, world!" \
  --source-language-code en \
  --target-language-code ja

# 期待するレスポンス:
# {
#     "TranslatedText": "Hello, world!",
#     "SourceLanguageCode": "en",
#     "TargetLanguageCode": "ja",
#     "AppliedTerminologies": []
# }
```

---

## まとめ

| 項目 | 内容 |
|---|---|
| プロトコル | **JSON 1.1** (`application/x-amz-json-1.1`) |
| X-Amz-Target プレフィックス | `AWSShineFrontendService_20170701.` |
| externalKey (ResolvedServiceCatalog) | `"translate"` |
| ストレージ | 不要（ステートレス） |
| 実装ファイル数 | 3（Handler・Service・Model） + 登録 4 箇所 |
| 最小実装アクション | `TranslateText` |

Textract (`services/textract/`) と全く同じパターンで実装できます。
`AwsException` を正しく使い、レスポンスの `AppliedTerminologies` フィールドを必ず含めることがポイントです（AWS SDK がこのフィールドを必須と見なすため）。
