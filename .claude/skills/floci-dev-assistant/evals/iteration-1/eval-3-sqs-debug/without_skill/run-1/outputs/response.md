# SQS `NonExistentQueue` エラーの診断・修正手順

## エラーの概要

```
com.amazonaws.services.sqs.model.AmazonSQSException:
  The specified queue does not exist for this wsdl version.
  (Service: AmazonSQS; Status Code: 400; Error Code: AWS.SimpleQueueService.NonExistentQueue)
```

このエラーメッセージ「**for this wsdl version**」は、Floci 内で 1 箇所だけ使われています。

**ファイル:** `src/main/java/io/github/hectorvent/floci/services/sqs/SqsService.java`

```java
// ~line 295
public String getQueueUrl(String queueName, String region) {
    String accountId = regionResolver.getAccountId();
    String queueUrl = baseUrl + "/" + accountId + "/" + queueName;
    String storageKey = regionKey(region, queueUrl);
    if (queueStore.get(storageKey).isEmpty()) {
        throw new AwsException("AWS.SimpleQueueService.NonExistentQueue",
                "The specified queue does not exist for this wsdl version.", 400);
    }
    return queueUrl;
}
```

つまり、エラーは **`SendMessage` 自体でなく、`GetQueueUrl` アクション**の中で発生しています。
AWS Java SDK v1 は、キュー名からメッセージを送るときに内部で `GetQueueUrl` を先に呼ぶことがあります。

---

## ストレージキーの仕組み

Floci は SQS キューを次のキーで保存します（`SqsService.java` の `regionKey` / `extractQueuePath`）：

```
<region>::/<accountId>/<queueName>
```

例：`us-east-1::/000000000000/my-queue`

`extractQueuePath` はホスト名を除いてパス部分だけを使うため、ホスト名の違い（`localhost` vs `floci` など）は問題になりません。しかしリージョン・アカウント ID が異なると別のキーになり、キューが見つからなくなります。

---

## 診断ステップ

### ステップ 1: SDK のエンドポイント設定を確認する

AWS Java SDK v1 でエンドポイントを明示していない場合、リクエストは実際の AWS に飛びます。

```java
// 正しい設定例（Java SDK v1）
AmazonSQS sqs = AmazonSQSClientBuilder.standard()
    .withEndpointConfiguration(
        new AwsClientBuilder.EndpointConfiguration(
            "http://localhost:4566",  // Floci のエンドポイント
            "us-east-1"              // Floci に合わせたリージョン
        )
    )
    .withCredentials(new AWSStaticCredentialsProvider(
        new BasicAWSCredentials("test", "test")
    ))
    .build();
```

### ステップ 2: キュー作成時のリージョンと参照時のリージョンが一致しているか確認する

Floci はリージョンを `Authorization` ヘッダの署名情報（`Credential=.../region/...`）から取り出します。

**確認クラス:** `RegionResolver.java` の `resolveRegionFromAuth()`

リージョンが一致しない場合、`createQueue` で `us-east-1::/000000000000/my-queue` に保存されても、`getQueueUrl` が `ap-northeast-1::/000000000000/my-queue` を検索してヒットしません。

**チェック方法:**
- `CreateQueue` 呼び出しの Authorization ヘッダとリージョン
- `GetQueueUrl`（または `SendMessage`）のリージョン

### ステップ 3: アカウント ID が一致しているか確認する

キュー URL は `baseUrl + "/" + accountId + "/" + queueName` で構成されます。

- `accountId` は `RegionResolver.getAccountId()` から取得
- リクエストスコープ内では `RequestContext` から動的に解決される
- スコープ外ではデフォルト値 `000000000000`（`EmulatorConfig.defaultAccountId()`）が使われる

SDK の認証情報や `Authorization` ヘッダでアカウント ID が変わると、キューが見つからなくなります。

**確認ファイル:**
- `src/main/java/io/github/hectorvent/floci/config/EmulatorConfig.java`（`defaultAccountId()`）
- `src/main/resources/application.yml`（設定値）

### ステップ 4: `effectiveBaseUrl` と実際のエンドポイントが一致しているか確認する

`createQueue` でキュー URL を作るとき `config.effectiveBaseUrl()` を使います。
Docker 環境で `FLOCI_HOSTNAME` などを設定している場合、内部ホスト名と SDK が送る URL が食い違うことがあります。

**確認クラス:** `EmulatorConfig.java` の `effectiveBaseUrl()`

```java
default String effectiveBaseUrl() {
    String url = hostname()
            .map(h -> baseUrl().replaceFirst("://[^:/]+(:\\d+)?", "://" + h + "$1"))
            .orElse(baseUrl());
    // TLS 対応...
    return url;
}
```

Docker Compose 環境では `FLOCI_HOSTNAME=floci` のように設定されていると、
返ってくるキュー URL が `http://floci:4566/000000000000/my-queue` になり、
SDK が `http://localhost:4566/...` でアクセスすると `extractQueuePath` により
パス `/000000000000/my-queue` は同じになるため問題なし。
ただし、アカウント ID が違う場合はパスが変わるため注意。

### ステップ 5: ストレージモードと永続化を確認する

インメモリストレージ（`memory` モード）を使っている場合、Floci を再起動するとキューが消えます。

**確認ファイル:**
- `src/main/resources/application.yml` の `floci.storage.mode`
- `src/main/java/io/github/hectorvent/floci/core/storage/StorageFactory.java`

ストレージモードは `memory` / `persistent` / `hybrid` / `wal` から選べます。
開発中に再起動したあと CreateQueue を再実行し忘れていないか確認してください。

### ステップ 6: Floci のログでキュー作成を確認する

Floci 起動後、キュー作成が成功していれば次のようなログが出ます：

```
INFO  [SqsService] Created standard queue: my-queue in region us-east-1
```

このログが出ていない、または異なるリージョンで出ている場合は作成自体が想定通りではありません。

---

## 確認すべき主なファイル・クラス一覧

| ファイル | 確認ポイント |
|---|---|
| `src/main/java/.../services/sqs/SqsService.java` | `getQueueUrl()` (line ~295)、`regionKey()`、`extractQueuePath()` |
| `src/main/java/.../services/sqs/SqsQueryHandler.java` | `handleGetQueueUrl()`、`handleSendMessage()` でのパラメータ取得 |
| `src/main/java/.../core/common/RegionResolver.java` | `resolveRegionFromAuth()`、`getAccountId()` |
| `src/main/java/.../config/EmulatorConfig.java` | `effectiveBaseUrl()`、`defaultRegion()`、`defaultAccountId()` |
| `src/main/resources/application.yml` | `floci.base-url`、`floci.default-region`、`floci.storage.mode` |
| `src/main/java/.../core/storage/StorageFactory.java` | ストレージバックエンドの実装選択 |

---

## 最も多い原因と修正方法

### 原因 A: リージョン不一致（最多）

**症状:** `CreateQueue` は成功しているが `GetQueueUrl` / `SendMessage` が失敗する。

**修正:** SDK クライアントのリージョンを Floci の設定（デフォルト `us-east-1`）に合わせる。

```java
new AwsClientBuilder.EndpointConfiguration("http://localhost:4566", "us-east-1")
```

### 原因 B: キュー作成後に Floci を再起動した（インメモリモード）

**修正:** 
1. `application.yml` でストレージを永続化に変更する、または
2. Floci 起動後に毎回 `CreateQueue` を呼ぶ初期化スクリプトを用意する。

```yaml
floci:
  storage:
    mode: persistent
```

### 原因 C: SDK に QueueUrl ではなくキュー名を渡している

AWS SDK v1 の `SendMessage` に `QueueUrl` ではなくキュー名（`my-queue`）を渡すと、
SDK は内部で `GetQueueUrl` を呼び出してからメッセージを送ります。
`getQueueUrl` では Floci が管理するアカウント ID とリージョンでキューを検索するため、
これらが合っていないと失敗します。

**修正:** `CreateQueue` の戻り値から直接 `QueueUrl` を取得して使う。

```java
CreateQueueResult result = sqs.createQueue(new CreateQueueRequest("my-queue"));
String queueUrl = result.getQueueUrl();  // この URL を SendMessage に渡す
sqs.sendMessage(queueUrl, "Hello, Floci!");
```

---

## デバッグ時の確認コマンド

```bash
# Floci に登録されているキューを一覧表示
aws --endpoint-url http://localhost:4566 sqs list-queues

# キュー URL を取得（これが失敗していればエラーの直接原因）
aws --endpoint-url http://localhost:4566 sqs get-queue-url --queue-name my-queue

# 認証情報とリージョンを明示してテスト
AWS_DEFAULT_REGION=us-east-1 \
  aws --endpoint-url http://localhost:4566 sqs get-queue-url --queue-name my-queue
```
