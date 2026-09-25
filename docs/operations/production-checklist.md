# 本番運用チェックリスト

最終更新: 2026-09-07

アプリ本体とSupabaseの統合、およびGemini・Brevo・Cronの本番環境変数登録は完了しています。以下には環境変数の登録作業ではなく、外部サービス側の設定と本番動作確認だけを残します。SecretやAPIキーの実値は、このファイル・Issue・コミット・スクリーンショットへ記載しません。

## Gemini API

- [x] 本番用のGemini APIキーを取得する
- [x] VercelのProduction環境へ`GEMINI_API_KEY`をSecretとして登録する
- [x] `GEMINI_MODEL`未設定時にもアプリ既定モデルを利用できるようにする
- [ ] Google AI Studioで利用制限と請求アラートを設定する
- [x] チャットで共有した旧APIキーをローテーションし、Vercelの値を差し替える
- [ ] 再デプロイ後、super_adminのテスト画面で管理者向け・一般ユーザー向けの両方を確認する
- [ ] Markdownにない内容を推測せず、回答不能時に有人対応へ案内することを確認する

完了条件: Markdownを根拠にGemini回答が生成され、参照元分離・1日10件制限・回答不能時の案内が維持されている。

## Brevoメール通知

- [x] VercelのProduction環境へ`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`、`BREVO_SENDER_NAME`を登録する
- [x] Brevoで送信元メールアドレスまたはドメインの認証状態を確認する
- [x] チャットで共有した旧APIキーをローテーションし、Vercelの値を差し替える
- [x] アプリのチャットBot管理画面で通知先メールアドレスを設定する
- [x] 再デプロイ後、「有人対応を希望しますか？」で「いいえ」を選んだ場合に通知されないことを確認する
- [x] 「はい」を選んだ場合に対応待ちへ登録され、指定先へ実メールが届くことを確認する

完了条件: 「はい」の場合だけ対応待ち登録とメール通知が成功し、監査ログに結果が記録される。

## Vercel Cron

- [x] `SESSION_SECRET`とは別の十分長いランダム値を生成する
- [x] VercelのProduction環境へ`CRON_SECRET`をSecretとして登録する
- [ ] 再デプロイ後、認証なしのCronリクエストが拒否されることを確認する
- [ ] `/api/cron/promote-grades`を認証付きで試験し、同一年の再実行で二重更新されないことを確認する
- [ ] `/api/cron/cleanup-event-uploads`を認証付きで試験し、確定済みPDFを削除しないことを確認する
- [ ] Vercel Logsと`audit_logs`で実行結果を確認する
- [ ] Supabase Free向けのDB疎通Cron（`early`・`midday`・`late`）がProductionに登録され、Vercel Logsで1日3回の成功を確認する

完了条件: 学年更新・アップロード清掃のCronが認証付きで成功し、未認証アクセスを拒否し、再実行安全性と監査記録を確認できる。DB疎通Cronは既存の`CRON_SECRET`で認証し、読み取りだけを実行する。Supabase Freeの自動停止を必ず防げる保証はないため、停止予告メールも確認する。外部ヘルス監視の5分間隔チェックや通知は再開しない。

## 共通の完了作業

- [x] 環境変数追加後にProductionを再デプロイする
- [ ] `GET /api/health`の公開livenessがHTTP 200を返し、認証付きreadinessでDB状態を確認する
- [ ] APIキーやSecretがGit履歴、アプリ画面、ログへ出力されていないことを確認する
- [ ] 完了した項目へ日付と確認者を追記する
