# SSM インテグレーションテスト（スキルなし）

以下は、Floci の SSM サービスに対して3つのシナリオをカバーするインテグレーションテストクラスです。

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

@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SsmScenarioIntegrationTest {

    private static final String SSM_CONTENT_TYPE = "application/x-amz-json-1.1";

    @BeforeAll
    static void configureRestAssured() {
        RestAssuredJsonUtils.configureAwsContentTypes();
    }

    /**
     * シナリオ1: パラメーターの作成（PutParameter）
     * パラメーターを新規作成し、バージョン 1 が返ることを確認する。
     */
    @Test
    @Order(1)
    void putParameter_createsParameterSuccessfully() {
        given()
            .header("X-Amz-Target", "AmazonSSM.PutParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "Name": "/test/scenario/host",
                    "Value": "example.com",
                    "Type": "String"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Version", equalTo(1));
    }

    /**
     * シナリオ2: 存在しないパラメーターの取得でエラーが返ること（GetParameter でエラー）
     * 存在しないパラメーター名を指定すると HTTP 400 と ParameterNotFound エラーが返ることを確認する。
     */
    @Test
    @Order(2)
    void getParameter_nonExistent_returnsParameterNotFound() {
        given()
            .header("X-Amz-Target", "AmazonSSM.GetParameter")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "Name": "/test/scenario/does-not-exist"
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(400)
            .body("__type", equalTo("ParameterNotFound"));
    }

    /**
     * シナリオ3: パラメーターの一覧取得（DescribeParameters）
     * DescribeParameters を呼び出し、作成済みのパラメーターが結果に含まれることを確認する。
     */
    @Test
    @Order(3)
    void describeParameters_returnsCreatedParameter() {
        given()
            .header("X-Amz-Target", "AmazonSSM.DescribeParameters")
            .contentType(SSM_CONTENT_TYPE)
            .body("""
                {
                    "ParameterFilters": [
                        {
                            "Key": "Name",
                            "Option": "BeginsWith",
                            "Values": ["/test/scenario/"]
                        }
                    ]
                }
                """)
        .when()
            .post("/")
        .then()
            .statusCode(200)
            .body("Parameters", not(empty()))
            .body("Parameters[0].Name", equalTo("/test/scenario/host"))
            .body("Parameters[0].Type", equalTo("String"));
    }
}
```

## 説明

### 使用したパターン

| 要素 | 内容 |
|------|------|
| テストフレームワーク | JUnit 5 + `@QuarkusTest` |
| HTTP クライアント | RestAssured (`given().when().post("/").then()`) |
| AWS プロトコル | JSON 1.1（`X-Amz-Target` ヘッダー + `application/x-amz-json-1.1` コンテントタイプ） |
| テスト順序制御 | `@TestMethodOrder(MethodOrderer.OrderAnnotation.class)` + `@Order` |
| Content-Type 設定 | `RestAssuredJsonUtils.configureAwsContentTypes()` を `@BeforeAll` で呼び出し |

### 各シナリオ

1. **PutParameter**（Order 1）: `/test/scenario/host` パラメーターを `String` 型で作成し、レスポンスの `Version` が `1` であることを検証。
2. **GetParameter でエラー**（Order 2）: 存在しない `/test/scenario/does-not-exist` を取得しようとして `HTTP 400` + `__type: ParameterNotFound` が返ることを検証。
3. **DescribeParameters**（Order 3）: `ParameterFilters` でパス prefix フィルターを指定し、Order 1 で作成したパラメーターが一覧に含まれることを検証。

### 配置先

```
src/test/java/io/github/hectorvent/floci/services/ssm/SsmScenarioIntegrationTest.java
```
