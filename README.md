# レシート家計簿

レシートを撮ると、品目ごとにジャンル分けして、月にいくら何に使ったかを集計する家計簿。

- **URL**: https://hakuogre-del.github.io/kakeibo/ （スマホはホーム画面に追加するとアプリのように使える）
- **データ**: Supabase（プロジェクト `kakeibo` / `gyqbxaqgayywrvhrqswu`）。メール＋パスワードでログインし、同じアカウントならどの端末でも同じ記録が見える。行レベルセキュリティで本人の行しか読み書きできない。
- **レシート読み取り**: Supabase Edge Function `scan-receipt`（`supabase/functions/scan-receipt`）が Google Gemini API（無料枠）で画像を解析し、店名・日付・品目・税込金額・ジャンル・合計をJSONで返す。APIキーは Supabase のシークレット `GEMINI_API_KEY` に置き、ブラウザには出さない。ログイン中のユーザーしか呼べない。任意で `ALLOWED_EMAILS`（カンマ区切り）を設定すると使える人を限定できる。

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | アプリ本体（1ファイル完結） |
| `manifest.webmanifest`, `icon*.{svg,png}` | ホーム画面追加用 |
| `supabase/functions/scan-receipt/index.ts` | AIレシート読み取り（Gemini） |

## テーブル

- `expenses` — id, user_id, date, store, memo, items(jsonb: name/amount/category), total, source(receipt/manual)
- `settings` — user_id, budget

## 公開

`main` ブランチに push すると GitHub Pages が自動で更新される。
