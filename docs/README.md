# Fortylove ドキュメント

このページをドキュメントの入口として使用します。実装の概要は[プロジェクトREADME](../README.md)、安全な報告方法は[セキュリティポリシー](../SECURITY.md)を確認してください。

## 要件

- [Chatbot・画面改善要件](requirements/chatbot-and-ui.md) — Chatbot、FAQ、画面表示、Markdown取り込みの仕様
- [品質要件](requirements/quality.md) — セキュリティ、信頼性、性能、テスト、運用の基準

要件を変更するときは、対応する文書を更新します。実施手順や確認結果は要件文書へ混在させず、下記の運用文書へ記録します。

## 運用

- [本番運用チェックリスト](operations/production-checklist.md) — 未完了の本番確認と完了状況
- [データベース変更手順](operations/database.md) — Supabaseの変更前後、検証、異常時対応
- [監視・品質試験](operations/quality.md) — Health監視、Sentry、CI、復元試験、性能評価

本番作業では、最初に本番運用チェックリストを確認し、DB変更がある場合だけデータベース変更手順を併用します。

## 文書の置き場所

| 種類 | 保存先 |
| --- | --- |
| 現行の機能・品質要件 | `docs/requirements/` |
| 現在使う運用手順・チェックリスト | `docs/operations/` |
| Supabase SQL固有の説明 | `supabase/README.md` |

新しい文書を追加した場合は、この目次にもリンクを追加してください。Secret、APIキー、個人情報、実データは文書へ記載しません。
