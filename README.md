# CloudFront-Domain-Sample
CloudFront とカスタムドメインの使い方を学ぶためのサンプルリポジトリです。

## 技術スタック

- React
- Vite
- TypeScript
- CDK
- CloudFront
- S3
- Route53
- ACM

## デプロイ手順

このサンプルは `mashharuki.com` と `www.mashharuki.com` を CloudFront に割り当て、正規 URL を `https://mashharuki.com` にします。

1. `pnpm install`
2. `pnpm cdk deploy DomainStack`
3. `DomainStack` の `NameServers` output を、お名前.com 側の `mashharuki.com` ネームサーバーに設定する
4. `dig NS mashharuki.com` で Route53 への委任を確認する
5. `pnpm frontend build`
6. `pnpm cdk deploy StaticSiteStack`

確認 URL:

- `https://mashharuki.com`
- `https://www.mashharuki.com`

`www` は CloudFront Function で apex ドメインへ 301 リダイレクトします。S3 バケットは非公開で、CloudFront Origin Access Control 経由のみアクセスできます。
