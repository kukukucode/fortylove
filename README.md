# 早大Fortylove

早稲田大学のテニスサークル「Fortylove」の新歓運営を支援するWebアプリです。新入生の受付からイベント予約、参加者管理、問い合わせ対応までを一つの画面で扱えます。

## 現在の主な機能

### 一般ユーザー

- 新規登録、ログイン、プロフィール管理、退会
- 練習・イベントの閲覧、予約、キャンセル
- 参加予定のカレンダー表示
- イベント資料（PDF）の閲覧
- 公開FAQの閲覧
- 公開設定中のWebチャットBotの利用

### 管理者

- 登録者、イベント、予約、出欠、FAQの管理
- イベント資料の登録と更新
- 問い合わせの確認と回答
- 権限に応じた管理機能

### WebチャットBot

- Markdown資料・公開FAQ・今後のイベント情報を参照した回答
- 管理者用・一般ユーザー用の参照元と公開状態の分離
- 1人1日10件の利用上限と有人対応への引き継ぎ
- `super_admin`によるMarkdown更新、動作テスト、通知先設定
- 一般的な参考回答の任意表示と、会話を保持する右下チャット

チャットBotの公開範囲や外部サービスとの連携は、管理画面と本番環境の設定に従います。

## 技術構成

- Next.js / React / TypeScript
- Supabase（Database / Storage）
- Vercel
- ESLint / Vitest / Playwright
- GitHub Actions

## ローカル開発

Node.js 22以上とpnpm 11を使用します。

```bash
pnpm install
pnpm dev
```

環境変数は`.env.example`を参考にローカル環境へ設定してください。APIキーやSecretなどの実値はGitへ保存しません。

## 検証

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

通常の変更は、上記をまとめて実行する`pnpm check`でも確認できます。ブラウザテストは`pnpm test:e2e`、Chatbot・FAQのPC／スマホ操作確認は`pnpm test:e2e:experience`を使用します。

Pull RequestではLint・型検査・単体テストを常に実行し、変更内容に応じてDB統合テスト、ビルド、E2Eテストを追加します。README・`docs/`配下・`.docx`だけの変更では重い検査を省略し、`main`への反映時は全検査を実行します。

## ドキュメント

- [品質要件定義書](docs/quality-requirements/Fortylove_品質要件定義書.md)
- [Chatbot・画面改善要件](docs/quality-requirements/Fortylove_改善要件書_20260906.md)
- [Chatbot・FAQ改善の反映手順](docs/operations/chatbot-experience-rollout.md)
- [監視・品質試験の導入手順](docs/operations/quality-rollout.md)
- [データベース更新手順](docs/operations/database-migrations.md)
- [本番運用チェックリスト](docs/operations/production-todo.md)

## セキュリティ

詳細は[セキュリティポリシー](SECURITY.md)を確認してください。
