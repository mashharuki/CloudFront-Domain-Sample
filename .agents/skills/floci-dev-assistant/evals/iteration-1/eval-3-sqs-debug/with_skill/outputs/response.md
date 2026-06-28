# SQS `NonExistentQueue` エラーの診断・修正ガイド (Floci)

## エラー概要

```
com.amazonaws.services.sqs.model.AmazonSQSException:
  The specified queue does not exist for this wsdl version.
  (Service: AmazonSQS; Status Code: 400; Error Code: AWS.SimpleQueueService.NonExistentQueue)
```

このエラーは `SqsService.java` 内の複数箇所でスローされます。
最も重要なのは `getQueueUrl()` と `sendMessage()` です：

```java
// SqsService.java:293 — getQueueUrl
if (queueStore.get(storageKey).isEmpty()) {
    throw new AwsException("AWS.SimpleQueueService.NonExistentQueue",
            "The specified queue does not exist for this wsdl version.", 400);
}

// SqsService.java:358-360 — sendMessage
Queue queue = getQueueByUrl(storageKey, queueUrl)
        .orElseThrow(() -> new AwsException("AWS.SimpleQueueService.NonExistentQueue",
                "The specified queue does not exist.", 400));
```

---

## 診断フローチャート

```
NonExistentQueue が発生
│
├── Step 1: リクエストが Floci に届いているか？
├── Step 2: リージョンが一致しているか？（最も多い原因）
├── Step 3: キュー URL の形式が正しいか？
├── Step 4: アカウント ID が一致しているか？
└── Step 5: ストレージにキューが残っているか？
```

---

## Step 1 — リクエストが Floci に届いているか確認する

Floci を起動して、ログにリクエストが来ているか確認します：

```bash
./mvnw quarkus:dev
```

Java SDK の設定で `endpointOverride` が正しく指定されているか確認します：

```java
// AWS Java SDK v2 の場合
SqsClient client = SqsClient.builder()
    .endpointOverride(URI.create("http://localhost:4566"))
    .region(Region.US_EAST_1)
    .build();

// AWS Java SDK v1 の場合
AmazonSQS client = AmazonSQSClientBuilder.standard()
    .withEndpointConfiguration(
        new AwsClientBuilder.EndpointConfiguration(
            "http://localhost:4566", "us-east-1"))
    .build();
```

Floci のログに `SQS action: CreateQueue` や `SQS action: GetQueueUrl` が表示されれば、
リクエストは届いています。

---

## Step 2 — リージョンの不一致（最も多い根本原因）

### なぜ起きるか

Floci の `SqsService` はストレージキーを次のように構築します
（[src/main/java/io/github/hectorvent/floci/services/sqs/SqsService.java](../../../../../src/main/java/io/github/hectorvent/floci/services/sqs/SqsService.java#L990)）：

```java
private static String regionKey(String region, String queueUrl) {
    return region + "::" + extractQueuePath(queueUrl);
}
```

例えば `us-east-1` で作成したキューのキーは：
```
us-east-1::/000000000000/my-queue
```

リージョンは AWS Signature v4 の `Authorization` ヘッダから抽出されます
（[RegionResolver.java](../../../../../src/main/java/io/github/hectorvent/floci/core/common/RegionResolver.java#L44)）：

```java
// Credential=AKID/20260215/us-west-2/s3/aws4_request
private static final Pattern CREDENTIAL_REGION_PATTERN =
        Pattern.compile("Credential=\\S+/\\d{8}/([^/]+)/");

public String resolveRegionFromAuth(String authorizationHeader) {
    Matcher matcher = CREDENTIAL_REGION_PATTERN.matcher(authorizationHeader);
    return matcher.find() ? matcher.group(1) : defaultRegion;
}
```

つまり **SDK クライアントに設定したリージョンが `CreateQueue` と `SendMessage` で
異なると、ストレージキーが一致せずキューが見つからない**。

### 確認方法

AWS CLI の `--debug` オプションでリクエストの Authorization ヘッダを確認します：

```bash
# CreateQueue のリージョンを確認
aws sqs create-queue --queue-name my-queue \
  --endpoint-url http://localhost:4566 \
  --region us-east-1 --debug 2>&1 | grep "Credential="

# SendMessage のリージョンを確認
aws sqs send-message --queue-url http://localhost:4566/000000000000/my-queue \
  --message-body "test" \
  --endpoint-url http://localhost:4566 \
  --region us-east-1 --debug 2>&1 | grep "Credential="
```

両者のリージョン部分（`us-east-1` など）が一致しているか確認します。

### Java SDK で確認する場合

```java
// CreateQueue と SendMessage に同じ Region を使うこと
Region region = Region.US_EAST_1;

SqsClient sqsClient = SqsClient.builder()
    .endpointOverride(URI.create("http://localhost:4566"))
    .region(region)            // ← ここを統一する
    .build();
```

---

## Step 3 — キュー URL の形式確認

### なぜ起きるか

`sendMessage` でキューの URL を直接指定する場合、
Floci が `extractQueuePath()` でホスト部分を除いたパスをキーとして使います：

```java
// SqsService.java:994-1010
private static String extractQueuePath(String queueUrl) {
    int schemeEnd = queueUrl.indexOf("://");
    int pathStart = queueUrl.indexOf('/', schemeEnd + 3);
    return queueUrl.substring(pathStart);
    // http://localhost:4566/000000000000/my-queue
    //                     → /000000000000/my-queue
}
```

**ホストが異なっても動作する**（localhost と localhost.localstack.cloud は同等）。
しかし **アカウント ID（パス第一要素）や キュー名が異なると一致しない**。

### 正しいキュー URL の取得方法

`CreateQueue` のレスポンスに含まれる `QueueUrl` を必ず使います。
または `GetQueueUrl` を呼んで URL を取得します：

```java
// 推奨: CreateQueue のレスポンスから取得
CreateQueueResponse createResp = sqsClient.createQueue(
    CreateQueueRequest.builder().queueName("my-queue").build());
String queueUrl = createResp.queueUrl();

// あるいは GetQueueUrl を使う
GetQueueUrlResponse urlResp = sqsClient.getQueueUrl(
    GetQueueUrlRequest.builder().queueName("my-queue").build());
String queueUrl = urlResp.queueUrl();

// この URL を SendMessage に渡す
sqsClient.sendMessage(SendMessageRequest.builder()
    .queueUrl(queueUrl)
    .messageBody("Hello Floci")
    .build());
```

---

## Step 4 — アカウント ID の不一致

### なぜ起きるか

`createQueue` でキュー URL を生成するとき：

```java
// SqsService.java:196
String accountId = regionResolver.getAccountId();
String queueUrl = baseUrl + "/" + accountId + "/" + queueName;
```

`getAccountId()` は `RequestContext` から取得するか、設定のデフォルト値
（`floci.default-account-id` = `000000000000`）を使います。

マルチアカウント構成や、SDK のクレデンシャルに異なるアカウント ID が含まれる場合、
`SendMessage` の URL に含まれるアカウント ID が異なる可能性があります。

### 確認方法

```bash
# Floci でデフォルトアカウント ID を確認
grep "default-account-id" src/main/resources/application.yml

# 生成されたキュー URL を確認（CreateQueue レスポンス）
aws sqs create-queue --queue-name my-queue \
  --endpoint-url http://localhost:4566 --region us-east-1
# → { "QueueUrl": "http://localhost:4566/000000000000/my-queue" }
```

`000000000000` 以外のアカウント ID が返ってくる場合は
`EmulatorConfig` の設定を確認してください。

---

## Step 5 — ストレージにキューが残っているか

### なぜ起きるか

デフォルトのストレージモードが `memory` の場合、
Floci を再起動するとデータが消えます。

### 確認方法

```bash
# application.yml でストレージモードを確認
grep -A5 "sqs" src/main/resources/application.yml
```

永続化が必要な場合は `persistent` または `hybrid` に変更します：

```yaml
floci:
  services:
    sqs:
      storage:
        mode: persistent
```

---

## 関連する Floci ソースファイル一覧

| ファイル | 役割 |
|---|---|
| [SqsService.java](../../../../../src/main/java/io/github/hectorvent/floci/services/sqs/SqsService.java) | キューの作成・検索・メッセージ送受信のビジネスロジック。`regionKey()`, `getQueueByUrl()`, `extractQueuePath()`, `getQueueUrl()`, `sendMessage()` |
| [SqsQueryHandler.java](../../../../../src/main/java/io/github/hectorvent/floci/services/sqs/SqsQueryHandler.java) | Query プロトコル（form-encoded POST / XML レスポンス）の処理。`handleGetQueueUrl()`, `handleSendMessage()` |
| [SqsJsonHandler.java](../../../../../src/main/java/io/github/hectorvent/floci/services/sqs/SqsJsonHandler.java) | JSON 1.0 プロトコルの処理（API Gateway 経由の SQS）。同名の `handleGetQueueUrl()`, `handleSendMessage()` |
| [AwsQueryController.java](../../../../../src/main/java/io/github/hectorvent/floci/core/common/AwsQueryController.java) | Query プロトコルのディスパッチ・リージョン解決 |
| [RegionResolver.java](../../../../../src/main/java/io/github/hectorvent/floci/core/common/RegionResolver.java) | Authorization ヘッダからリージョンを抽出 |
| [SqsQueueUrlRouterFilter.java](../../../../../src/main/java/io/github/hectorvent/floci/core/common/SqsQueueUrlRouterFilter.java) | キュー URL をパスから読み取るフィルタ |

---

## デバッグ手順まとめ

### 1. Floci ログを確認

```bash
./mvnw quarkus:dev 2>&1 | grep -E "SQS action|NonExistentQueue|storageKey"
```

### 2. リージョン一致を確認（最優先）

```bash
# CreateQueue 時
aws sqs create-queue --queue-name test \
  --endpoint-url http://localhost:4566 --region us-east-1 --debug 2>&1 \
  | grep -E "Credential|QueueUrl"

# SendMessage 時
aws sqs send-message \
  --queue-url "http://localhost:4566/000000000000/test" \
  --message-body "ping" \
  --endpoint-url http://localhost:4566 --region us-east-1 --debug 2>&1 \
  | grep "Credential"
```

### 3. キューの存在を直接確認

```bash
aws sqs list-queues \
  --endpoint-url http://localhost:4566 --region us-east-1
```

### 4. 修正コード例（Java SDK v2）

```java
Region region = Region.US_EAST_1;   // CreateQueue / SendMessage で統一

SqsClient client = SqsClient.builder()
    .endpointOverride(URI.create("http://localhost:4566"))
    .region(region)
    .credentialsProvider(StaticCredentialsProvider.create(
        AwsBasicCredentials.create("test", "test")))
    .build();

// Step 1: キューを作成
String queueUrl = client.createQueue(b -> b.queueName("my-queue"))
    .queueUrl();   // ← この URL をそのまま使う

// Step 2: メッセージを送信（CreateQueue のレスポンス URL を使う）
client.sendMessage(b -> b
    .queueUrl(queueUrl)
    .messageBody("Hello Floci"));
```

---

## Floci コードを修正する場合

もし Floci 側に問題がある（例：特定のリージョンでストレージキーが正しく生成されていない）場合は、
以下のメソッドを重点的に確認してください：

### `SqsService.java` — `regionKey()`

```java
// 現在の実装 (line 990-992)
private static String regionKey(String region, String queueUrl) {
    return region + "::" + extractQueuePath(queueUrl);
}
```

期待される形式：`us-east-1::/000000000000/my-queue`

デバッグログを追加して実際のキーを確認：
```java
private static String regionKey(String region, String queueUrl) {
    String key = region + "::" + extractQueuePath(queueUrl);
    LOG.debugv("storageKey={0}", key);
    return key;
}
```

### `RegionResolver.java` — `resolveRegionFromAuth()`

Authorization ヘッダが null または不正な場合、`defaultRegion` が使われます。
SDK がローカル向けの署名をどう生成しているか確認が必要な場合があります。

---

## エラーが `getQueueUrl` から来ている場合

Java SDK v1 は `SendMessage` の前に内部で `GetQueueUrl` を呼びます。
この場合エラーが `getQueueUrl()` から来ている可能性が高いです：

```java
// SqsService.java:293-297
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

`baseUrl` は `EmulatorConfig.effectiveBaseUrl()` から取得します。
`http://localhost:4566` が返っていることを確認してください。

---

## 結論

このエラーの原因は 90% の場合 **リージョンの不一致** です。
`CreateQueue` と `SendMessage` で同一のリージョンを使い、
`CreateQueue` のレスポンスに含まれる `QueueUrl` をそのまま `SendMessage` に渡すことで解決します。
