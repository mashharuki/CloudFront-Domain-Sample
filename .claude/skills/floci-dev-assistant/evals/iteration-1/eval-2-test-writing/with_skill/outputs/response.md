# SSM Integration Test — eval-2-test-writing (with_skill)

## 調査・判断

### 使用スキル
- `/workspaces/floci/.github/skills/floci-dev-assistant/SKILL.md` を読み込み
- `agents/test-writer.md` を読み込み（JSON 1.1 インテグレーションテストのパターン取得）
- 既存の `SsmIntegrationTest.java` を参照してプロジェクト固有の規約を把握
- `SsmJsonHandler.java` の `handleDescribeParameters` メソッドを参照してレスポンス形状を確認

### 判断
- SSM は `AmazonSSM.*` の `X-Amz-Target` ヘッダーを使う JSON 1.1 プロトコルサービス
- `DescribeParameters` のレスポンスは `Parameters` 配列を返し、各要素に `Name`, `Type`, `Version`, `DataType` が含まれる
- エラーレスポンスは `__type` フィールドで AWS エラーコードを返す（`ParameterNotFound` など）
- テストの順序は `@Order` で制御し、後続テストが前テストで作成したデータに依存する形で設計

---

## 生成したテストクラス

```java
package io.github.hectorvent.floci.services.ssm;

import io.github.hectorvent.floci.testing.RestAssuredJsonUtils;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * SSM インテグレーションテスト。
 * 以下の3シナリオをカバーする:
 *   1. PutParameter  — パラメーターの作成
 *   2. GetParameter  — 存在しないパラメーターの取得でエラーが返ること
 *   3. DescribeParameters — パラメーターの一覧取得
 */
@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SsmScenarioIntegrationTest {

    private static final String SSM_CONTENT_TYPE = "application/x-amz-json-1.1";

    @BeforeAll
    static void configureRestAssured() {
        RestAssuredJsonUtils.configureAwsContentTypes();
    }

    // ---------------------------------------------------------------
    // シナリオ 1: パラメーターの作成 (PutParameter)
    // ---------------------------------------------------------------

    @Test
    @Order(1)
    void putParameter() {
        given()
            .header("X-Amz-Target", "AmazonSSM.PutParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "Name": "/scenario/db/host",
                    "Value": "db.example.com",
                    "Type": "String"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Version", equalTo(1));
    }

    @Test
    @Order(2)
    void putParameterSecureString() {
        given()
            .header("X-Amz-Target", "AmazonSSM.PutParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "Name": "/scenario/db/password",
                    "Value": "s3cr3t",
                    "Type": "SecureString"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Version", equalTo(1));
    }

    @Test
    @Order(3)
    void putParameterStringList() {
        given()
            .header("X-Amz-Target", "AmazonSSM.PutParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "Name": "/scenario/db/replicas",
                    "Value": "replica1.example.com,replica2.example.com",
                    "Type": "StringList"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Version", equalTo(1));
    }

    // ---------------------------------------------------------------
    // シナリオ 2: 存在しないパラメーターの取得でエラーが返ること (GetParameter)
    // ---------------------------------------------------------------

    @Test
    @Order(4)
    void getParameterNotFound() {
        given()
            .header("X-Amz-Target", "AmazonSSM.GetParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                { "Name": "/does/not/exist" }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(400)
            .body("__type", equalTo("ParameterNotFound"));
    }

    @Test
    @Order(5)
    void getParameterNotFoundReturnsMessageField() {
        given()
            .header("X-Amz-Target", "AmazonSSM.GetParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                { "Name": "/absolutely/nonexistent" }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(400)
            .body("__type", equalTo("ParameterNotFound"))
            .body("message", notNullValue());
    }

    // ---------------------------------------------------------------
    // シナリオ 3: パラメーターの一覧取得 (DescribeParameters)
    // ---------------------------------------------------------------

    @Test
    @Order(6)
    void describeParametersReturnsAll() {
        // シナリオ 1 で作成した3つのパラメーターが含まれることを確認
        given()
            .header("X-Amz-Target", "AmazonSSM.DescribeParameters")
            .contentType(SSM_CONTENT_TYPE)
            .body("{}")
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Parameters", notNullValue())
            .body("Parameters.size()", greaterThanOrEqualTo(3));
    }

    @Test
    @Order(7)
    void describeParametersFilterByName() {
        // ParameterFilters で Name=Equals フィルターを使って特定のパラメーターだけを取得
        given()
            .header("X-Amz-Target", "AmazonSSM.DescribeParameters")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "ParameterFilters": [
                        {
                            "Key": "Name",
                            "Option": "Equals",
                            "Values": ["/scenario/db/host"]
                        }
                    ]
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Parameters.size()", equalTo(1))
            .body("Parameters[0].Name", equalTo("/scenario/db/host"))
            .body("Parameters[0].Type", equalTo("String"))
            .body("Parameters[0].Version", equalTo(1));
    }

    @Test
    @Order(8)
    void describeParametersResponseShape() {
        // レスポンスの各フィールドが正しく返されることを確認
        given()
            .header("X-Amz-Target", "AmazonSSM.DescribeParameters")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "ParameterFilters": [
                        {
                            "Key": "Name",
                            "Option": "Equals",
                            "Values": ["/scenario/db/password"]
                        }
                    ]
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Parameters.size()", equalTo(1))
            .body("Parameters[0].Name", equalTo("/scenario/db/password"))
            .body("Parameters[0].Type", equalTo("SecureString"))
            .body("Parameters[0].Version", equalTo(1))
            .body("Parameters[0].DataType", notNullValue())
            .body("Parameters[0].LastModifiedDate", notNullValue());
    }
}
```

---

## 補足

### テストクラス名について
既存の `SsmIntegrationTest.java` との衝突を避けるため `SsmScenarioIntegrationTest` という名前を採用しました。実際のプロジェクトに組み込む場合は、既存の `SsmIntegrationTest.java` に `@Order` を追加しながらマージすることを推奨します。

### `DescribeParameters` のレスポンス形状
`SsmJsonHandler.handleDescribeParameters` の実装を確認したところ、各パラメーターオブジェクトは以下のフィールドを持ちます:
- `Name` (文字列)
- `Type` (文字列: `"String"` / `"SecureString"` / `"StringList"`)
- `Version` (数値)
- `LastModifiedDate` (エポック秒, float)
- `DataType` (文字列)
- `Description` (オプション)

### テスト間の順序依存
`@TestMethodOrder(MethodOrderer.OrderAnnotation.class)` と `@Order` アノテーションで実行順を制御しています。シナリオ 3 (DescribeParameters) はシナリオ 1 (PutParameter) で作成したデータに依存します。これは既存の `SsmIntegrationTest.java` と同様のパターンです。

### エラー形状 (JSON 1.1)
```json
{
  "__type": "ParameterNotFound",
  "message": "..."
}
```
HTTP ステータスは `400`。これは `AwsException` → `AwsExceptionMapper` を経由して生成される標準的な Floci エラー形状です。
