# 運用品質の導入・検証

この文書の設定値はすべて変数名のみ。実際の宛先、鍵、会員データ、DBダンプはGitへ保存しない。
ローカル試験の合格と、本番で通知・復元・SLOを確認できた状態は区別する。

## 導入範囲

| 項目 | 実装 | 本番で別途必要な確認 |
| --- | --- | --- |
| Health監視・通知 | 外部実行、2回連続の異常／正常で障害／復旧を通知 | Secrets設定、初回正常実行、通知・復旧演習 |
| Error Tracking | Sentryのブラウザ／サーバーエラー収集、署名付きWebhook | DSN、Internal Integration、Issue Alertの設定と疎通 |
| Security Headers | nosniff、埋め込み禁止、Referrer/Permissions Policy、限定CSP | デプロイ後のレスポンスとPDF表示確認 |
| 主要業務E2E | 実PostgreSQL＋PostgRESTで登録・予約・管理者操作・失効確認 | GitHub上の必須チェック成功確認 |
| axe A11y | ログイン・登録・会員画面・FAQ・チャット・設定 | キーボード／スクリーンリーダーの手動確認 |
| Backup Restore | 別DBへ復元、行・関数・権限照合、Storage補助手順 | 実データ量と実Supabase Storageを使った隔離演習 |
| 性能SLO | 本番ビルドを20回計測しp95を検査 | 本番回線、ピーク負荷、AI応答、月間可用性の実測 |

## 反映順序

1. 現DBとStorageを別々にバックアップし、復元先を確認する。
2. 既存環境では `supabase/migrations/20260906_operations_quality.sql` を実行する。新規環境の `schema.sql` にも同内容を収録済み。既存環境を初期化しない。
3. アプリを反映する。通知は初期状態で無効。
4. super_adminの「運用設定」で通知先を保存する。admin/memberには設定を許可しない。変更と監査記録は同じDBトランザクションで確定する。
5. 下記の外部サービス設定と動作試験を行い、その後に通知を有効化する。

## 外部Health監視

`/api/health` は未認証では `{status:"ok"}` のlivenessのみを返し、DBに触れない。
`Authorization: Bearer <MONITOR_SECRET>` を付けるとDB疎通を含むreadinessを検査する。誤った認証は401。結果はキャッシュしない。
`/api/ops/monitor-config` も同じ認証が必須で、super_adminの保存済み宛先を返す。

- Vercel: `MONITOR_SECRET`、Brevoの既存環境変数。
- GitHub Actions repository variable: `MONITOR_URL`（HTTPSのサイトoriginのみ）。
- GitHub Actions secrets: `MONITOR_SECRET`（Vercelと同値）、`MONITOR_STATE_KEY`（32文字以上のランダム値）、`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`。
- `.github/workflows/monitor.yml` をmainに反映し、最初は手動実行で成功を確認する。
- 保存済み宛先へのテストメールは管理画面から送る。未保存の入力先には送らない。

5分おきのスケジュールはGitHub側の遅延や停止の影響を受けるため、正確な5分間隔や検知時間の保証ではない。厳密なSLAが必要なら独立した専用監視へ移す。
最後に取得できた宛先・通知状態・最大31日分のサンプルをAES-GCMで暗号化しActions cacheへ保存する。障害時にはこの宛先を使用するため、障害中の宛先変更は取得できるまで反映されない。
cache消失や初回からの障害では宛先を取得できずジョブを失敗させる。GitHub失敗通知を保守担当が受け取れる設定にし、定期実行自体が止まっていないかも確認する。
メール失敗は次回再試行。連続した同一障害の繰り返し通知は抑止するが、配送のexactly-onceは保証しない。

## Sentry

- Vercelに `SENTRY_DSN`、`NEXT_PUBLIC_SENTRY_DSN` を設定して再ビルドする。
- Sentry Internal IntegrationのWebhookを `/api/ops/sentry-webhook` に設定する。
- Integrationの署名用secretを `SENTRY_WEBHOOK_SECRET`、対象プロジェクトIDを `SENTRY_PROJECT_ID` に保存する。
- Issue AlertにIntegrationへの通知アクションを設定し、super_adminのエラー通知を有効にする。
- 署名不一致・対象外プロジェクトは拒否。同じevent IDの配送はDBリースで重複抑止し、失敗は再試行可能にする。

入力本文・Cookie・ヘッダー・ユーザー情報・Breadcrumbs・任意のcontextを送らず、allowlistで作り直したエラー種別とスタック位置だけを送信する。Replay、Tracing、ソースマップの外部アップロードは有効化しない。
機微情報を削除する分、エラーの詳細やグルーピング精度には制約がある。意図的にcatchして通常レスポンスに変換したすべての障害を自動捕捉するものではない。
本番で意図的な例外を起こさず、まず隔離環境で検証する。Webhookはアプリ停止中には配信できないため外部Health監視を併用する。

## CIとローカル試験

必須ジョブ名 `database` / `verify` を維持。PRの軽微変更では重い処理を省略し、mainは全検査。
実DB品質試験はfixture未準備をskipにしない。外部メール・Gemini・Sentry送信はテスト環境変数で無効化する。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e:smoke
pnpm test:e2e:experience
```

実DB試験にはlocalhostのPostgreSQL 17、psql/pg_dump/pg_restore、PostgREST 12.2.12が必要。
`PGHOST`、`PGPORT`、`PGUSER`、`PGPASSWORD`、`PGDATABASE=fortylove_quality` を設定し、**空の専用DB**で次を実行する。
WindowsではPostgRESTが参照するlibpq.dllを含むPostgreSQL binもPATHへ入れる。

```sh
pnpm test:quality:setup
pnpm test:quality
pnpm test:restore
```

品質試験は3012、54330、54331ポートを使用。setupは既存データを削除しない。再演習には別の使い捨てクラスタを用意する。
GitHub artifactは `.ops-reports/*.json` の数値のみ。DBダンプ・Storage・メールアドレス・ブラウザtraceはアップロードしない。
文字コントラストを含むaxe検査を無効化して通すことはしない。外部Google Fonts取得だけはCIで止め、フォールバックフォントを使用する。

## 復元と性能の評価範囲

ローカル復元は新しい `fortylove_quality_restore_*` DBを作り、既存DBを上書きしない。成果物とDBは確認後に担当者が破棄する。
合成PDF/画像のバイト比較は実Storage API復元の代用証明ではない。

実Storageの補助ツールは `scripts/ops/storage-snapshot.mjs export|restore <snapshot.enc>`。
`BACKUP_SUPABASE_URL`、`BACKUP_SERVICE_ROLE_KEY`、32文字以上の `BACKUP_ENCRYPTION_KEY` を環境変数で渡す。対象bucketはavatars/event-documents、上限256MiB・10,000オブジェクト。大規模運用はストリーミング方式に変更する。
restoreは新規の空プロジェクトだけを使い、`RESTORE_CONFIRM_HOST` で対象ホストを再指定する。bucketが一つでもあれば拒否し、上書きしない。中断時の部分復元は自動削除しないので、新しい空の復元先で再演習する。
DBバックアップだけではStorageの実ファイルは戻らない。実演習では更新を止めて整合したDB/Storageスナップショットを取り、Storage復元後にpublicスキーマを復元し、bucket設定/RLSも確認する。旧プロジェクトURLを含むavatar_url等は復元先へ変換してからログイン・画像・PDF・予約を検証する。
バックアップは暗号化しGit/公開artifact外で管理。復号鍵を別保管し、最低日次の取得と定期復元を運用で担保する。

性能検査はhome/admin/eventsのTTFB p95 1秒、見出し表示p95 2.5秒、資料直返しのチャットp95を計測する。ローカル値を本番値と呼ばない。
復元RTO 4時間・RPO 24時間は本番データ量、取得周期、復号・作業時間を含めて別途判定する。

## 追加セキュリティレビューの扱い（2026-09-06）

- Next.js: [公式2026年8月セキュリティリリース](https://nextjs.org/blog/august-2026-security-release)に従い15.5.24へ更新し、関連Lintパッケージも揃える。適用条件の異なる2件のCriticalであり、このアプリで悪用されたという意味ではない。
- 問い合わせ専用Rate Limit: 通常チャットとは別に、ユーザーごと時間／日次の原子的制限を追加する価値が高い。本文の微変更で回避できる重複検知だけでは不十分。今後の対応対象。
- アバター: 固定キーへの上書きだけでは同時更新や形式・キャッシュ問題が残る。再エンコード・容量制限、旧ファイル回収・失敗時整合性を合わせて設計する。今後の対応対象。
- ファイル検査: MIMEに加え画像decode・最大画素数・再エンコード、PDF signatureを検査する。signatureだけで安全性を保証しない。今後の対応対象。
- service_role: クライアントの名前やファイルを分けるだけではRLSの第二防衛線にならない。現在の独自認証に対応するDB権限/JWT設計、RLS、権限テストを含めて段階移行する。重要RPCも呼び出し主体を信頼できる形で束縛する必要がある。
- ログインID: 表示名の重複は実社会では正常。同名そのものをなりすましと決めつけず、認証用の一意IDを分離する。既存会員へのID通知・復旧手順と切替期間を決めてから移行する。
- CSP: 今回は埋め込み等の限定的な防御。script-srcを制限する厳格CSPは未導入で、XSS全般を防ぐとは説明しない。nonceとNext.js/PDFの互換性試験を別途設計する。

本番鍵を会話や公開場所に貼り付けた場合は、サービス側で失効・再発行し、環境変数へ直接登録する。実値をこの文書に記載しない。
