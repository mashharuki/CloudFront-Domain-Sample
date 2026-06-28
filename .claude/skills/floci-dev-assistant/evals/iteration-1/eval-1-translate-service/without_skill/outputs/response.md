# FlociにAWS Translateサービスを追加する

## 1. 使用するAWSプロトコル

**AWS Translate は JSON 1.1 プロトコル** を使用します。

具体的には：
- `Content-Type: application/x-amz-json-1.1`
- `X-Amz-Target: AWSShineFrontendService_20170701.<Action>` ヘッダー
- エンドポイント: `translate.{region}.amazonaws.com`

FlociではこのプロトコルはすでにAWS SDK互換の `AwsJson11Controller` で一元管理されているため、他のJSON 1.1サービス（Transcribe、Textract、ACMなど）と同様のパターンで追加できます。

---

## 2. 実装する骨格コード

以下のファイルを新規作成します：

```
src/main/java/io/github/hectorvent/floci/services/translate/
  ├── TranslateJsonHandler.java
  ├── TranslateService.java
  └── model/
        └── TranslatedText.java
```

また、既存ファイルへの変更が必要です：
- `EmulatorConfig.java` — サービス設定インターフェース追加
- `ResolvedServiceCatalog.java` — サービス登録
- `AwsJson11Controller.java` — ハンドラー注入とルーティング
- `src/main/resources/application.yml` — デフォルト設定追加

---

## 3. Javaコード

### 3.1 モデルクラス: `TranslatedText.java`

```java
package io.github.hectorvent.floci.services.translate.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.quarkus.runtime.annotations.RegisterForReflection;

/**
 * Represents the response of a TranslateText request.
 *
 * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html">AWS Translate API</a>
 */
@RegisterForReflection
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TranslatedText(
        @JsonProperty("TranslatedText") String translatedText,
        @JsonProperty("SourceLanguageCode") String sourceLanguageCode,
        @JsonProperty("TargetLanguageCode") String targetLanguageCode,
        @JsonProperty("AppliedTerminologies") java.util.List<AppliedTerminology> appliedTerminologies
) {
    @RegisterForReflection
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AppliedTerminology(
            @JsonProperty("Name") String name,
            @JsonProperty("Terms") java.util.List<Term> terms
    ) {}

    @RegisterForReflection
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Term(
            @JsonProperty("SourceText") String sourceText,
            @JsonProperty("TargetText") String targetText
    ) {}
}
```

---

### 3.2 サービスクラス: `TranslateService.java`

```java
package io.github.hectorvent.floci.services.translate;

import io.github.hectorvent.floci.core.common.AwsException;
import io.github.hectorvent.floci.services.translate.model.TranslatedText;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.Set;

/**
 * Stub for Amazon Translate.
 * TranslateText returns the original text unchanged (emulator behavior).
 * No real translation is performed.
 *
 * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/Welcome.html">AWS Translate API</a>
 */
@ApplicationScoped
public class TranslateService {

    private static final Set<String> SUPPORTED_LANGUAGE_CODES = Set.of(
            "af", "sq", "am", "ar", "hy", "az", "bn", "bs", "bg", "ca",
            "zh", "zh-TW", "hr", "cs", "da", "fa-AF", "nl", "en", "et",
            "fa", "tl", "fi", "fr", "fr-CA", "ka", "de", "el", "gu", "ht",
            "ha", "he", "hi", "hu", "is", "id", "ga", "it", "ja", "kn",
            "kk", "ko", "lv", "lt", "mk", "ms", "ml", "mt", "mr", "mn",
            "no", "ps", "pl", "pt", "pt-PT", "pa", "ro", "ru", "sr", "si",
            "sk", "sl", "so", "es", "es-MX", "sw", "sv", "tl", "ta", "te",
            "th", "tr", "uk", "ur", "uz", "vi", "cy"
    );

    /**
     * Emulates TranslateText.
     * The emulator returns the source text unchanged (stub behavior).
     *
     * @param text               Input text to translate (max 10,000 UTF-8 bytes)
     * @param sourceLanguageCode Source language code or "auto"
     * @param targetLanguageCode Target language code
     * @return A {@link TranslatedText} with the (unchanged) text
     */
    public TranslatedText translateText(String text, String sourceLanguageCode, String targetLanguageCode) {
        if (text == null || text.isBlank()) {
            throw new AwsException("InvalidRequestException",
                    "Text must not be null or empty.", 400);
        }
        if (targetLanguageCode == null || targetLanguageCode.isBlank()) {
            throw new AwsException("InvalidRequestException",
                    "TargetLanguageCode must not be null or empty.", 400);
        }
        if (!SUPPORTED_LANGUAGE_CODES.contains(targetLanguageCode)) {
            throw new AwsException("UnsupportedLanguagePairException",
                    "Amazon Translate does not support translation from the language of the source text into the requested target language. "
                            + "Unsupported language pair: " + sourceLanguageCode + " to " + targetLanguageCode, 400);
        }

        // Resolve "auto" source detection – emulator always returns "en" as detected language
        String resolvedSourceCode = "auto".equals(sourceLanguageCode) ? "en" : sourceLanguageCode;

        // Stub: return original text unchanged
        return new TranslatedText(text, resolvedSourceCode, targetLanguageCode, List.of());
    }
}
```

---

### 3.3 ハンドラークラス: `TranslateJsonHandler.java`

```java
package io.github.hectorvent.floci.services.translate;

import com.fasterxml.jackson.databind.JsonNode;
import io.github.hectorvent.floci.core.common.AwsErrorResponse;
import io.github.hectorvent.floci.services.translate.model.TranslatedText;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

/**
 * JSON 1.1 handler for Amazon Translate API operations.
 * Dispatches X-Amz-Target: AWSShineFrontendService_20170701.* actions to {@link TranslateService}.
 *
 * @see <a href="https://docs.aws.amazon.com/translate/latest/APIReference/Welcome.html">AWS Translate API</a>
 */
@ApplicationScoped
public class TranslateJsonHandler {

    private static final Logger LOG = Logger.getLogger(TranslateJsonHandler.class);

    private final TranslateService translateService;

    @Inject
    public TranslateJsonHandler(TranslateService translateService) {
        this.translateService = translateService;
    }

    public Response handle(String action, JsonNode request, String region) {
        LOG.debugv("Translate action: {0}", action);
        return switch (action) {
            case "TranslateText" -> {
                TranslatedText result = translateService.translateText(
                        getStringField(request, "Text"),
                        getStringField(request, "SourceLanguageCode"),
                        getStringField(request, "TargetLanguageCode"));
                yield Response.ok(result).build();
            }
            default -> Response.status(400)
                    .entity(new AwsErrorResponse("UnknownOperationException",
                            "Unknown operation: AWSShineFrontendService_20170701." + action))
                    .build();
        };
    }

    private String getStringField(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return (value != null && !value.isNull()) ? value.asText() : null;
    }
}
```

---

## 4. 既存ファイルへの変更

### 4.1 `EmulatorConfig.java` — サービス設定インターフェース追加

`EmulatorConfig` の `ServicesConfig` インターフェース内に以下を追加：

```java
// ServicesConfig インターフェース内（例: transcribe() の近く）
TranslateServiceConfig translate();
```

`EmulatorConfig.java` の末尾付近（例: `TranscribeServiceConfig` の後）に追加：

```java
interface TranslateServiceConfig {
    @WithDefault("true")
    boolean enabled();
}
```

### 4.2 `ResolvedServiceCatalog.java` — サービス登録

`ServiceCatalog` のコンストラクタ引数 `List.of(...)` の末尾（最後の `descriptor(...)` の後）に追加：

```java
descriptor("translate", "translate", config.services().translate().enabled(), true,
        null, null, 5000L, null, ServiceProtocol.JSON,
        protocols(ServiceProtocol.JSON),
        Set.of("AWSShineFrontendService_20170701."), Set.of("translate"), Set.of(), Set.of())
```

### 4.3 `AwsJson11Controller.java` — ハンドラー注入とルーティング

**インポート追加：**
```java
import io.github.hectorvent.floci.services.translate.TranslateJsonHandler;
```

**フィールド追加：**
```java
private final TranslateJsonHandler translateJsonHandler;
```

**コンストラクタ引数追加：**
```java
TranslateJsonHandler translateJsonHandler,
```

**コンストラクタ代入追加：**
```java
this.translateJsonHandler = translateJsonHandler;
```

**`switch` ブロックにケース追加（`transcribe` ケースの後）：**
```java
case "translate" -> translateJsonHandler.handle(action, request, region);
```

### 4.4 `application.yml` — デフォルト設定追加

`transcribe:` セクションの後に追加：

```yaml
    translate:
      enabled: true
```

---

## 5. テストクラス（参考）

```java
package io.github.hectorvent.floci.services.translate;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.equalTo;

/**
 * Integration tests for the Amazon Translate stub.
 * Protocol: JSON 1.1 — Content-Type: application/x-amz-json-1.1,
 *           X-Amz-Target: AWSShineFrontendService_20170701.&lt;Action&gt;
 */
@QuarkusTest
class TranslateIntegrationTest {

    private static final String AUTH_HEADER =
            "AWS4-HMAC-SHA256 Credential=AKID/20260101/us-east-1/translate/aws4_request";

    @Test
    void translateText_shouldReturnOriginalTextAsStub() {
        RestAssured.given()
                .contentType("application/x-amz-json-1.1")
                .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
                .header("Authorization", AUTH_HEADER)
                .body("""
                        {
                          "Text": "Hello, world!",
                          "SourceLanguageCode": "en",
                          "TargetLanguageCode": "ja"
                        }
                        """)
                .post("/")
                .then()
                .statusCode(200)
                .body("TranslatedText", equalTo("Hello, world!"))
                .body("SourceLanguageCode", equalTo("en"))
                .body("TargetLanguageCode", equalTo("ja"));
    }

    @Test
    void translateText_withAutoDetect_shouldReturnDefaultSourceLanguage() {
        RestAssured.given()
                .contentType("application/x-amz-json-1.1")
                .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
                .header("Authorization", AUTH_HEADER)
                .body("""
                        {
                          "Text": "Bonjour le monde",
                          "SourceLanguageCode": "auto",
                          "TargetLanguageCode": "en"
                        }
                        """)
                .post("/")
                .then()
                .statusCode(200)
                .body("TranslatedText", equalTo("Bonjour le monde"))
                .body("SourceLanguageCode", equalTo("en"))
                .body("TargetLanguageCode", equalTo("en"));
    }

    @Test
    void translateText_withEmptyText_shouldReturn400() {
        RestAssured.given()
                .contentType("application/x-amz-json-1.1")
                .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
                .header("Authorization", AUTH_HEADER)
                .body("""
                        {
                          "Text": "",
                          "SourceLanguageCode": "en",
                          "TargetLanguageCode": "ja"
                        }
                        """)
                .post("/")
                .then()
                .statusCode(400);
    }

    @Test
    void translateText_withUnsupportedTargetLanguage_shouldReturn400() {
        RestAssured.given()
                .contentType("application/x-amz-json-1.1")
                .header("X-Amz-Target", "AWSShineFrontendService_20170701.TranslateText")
                .header("Authorization", AUTH_HEADER)
                .body("""
                        {
                          "Text": "Hello",
                          "SourceLanguageCode": "en",
                          "TargetLanguageCode": "xx-INVALID"
                        }
                        """)
                .post("/")
                .then()
                .statusCode(400);
    }
}
```

---

## まとめ

| 項目 | 内容 |
|------|------|
| **プロトコル** | JSON 1.1（`application/x-amz-json-1.1`） |
| **Target ヘッダー** | `AWSShineFrontendService_20170701.TranslateText` |
| **新規ファイル** | `TranslateJsonHandler.java`, `TranslateService.java`, `model/TranslatedText.java` |
| **変更ファイル** | `EmulatorConfig.java`, `ResolvedServiceCatalog.java`, `AwsJson11Controller.java`, `application.yml` |
| **エミュレーター動作** | 翻訳は行わず元のテキストをそのまま返す（スタブ） |
| **エラーハンドリング** | `AwsException` を使用し、AWS互換のエラーレスポンスを生成 |
