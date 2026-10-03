# レシート家計簿

レシートを撮ると、品目ごとにジャンル分けして、月にいくら何に使ったかを集計する家計簿。

- **URL**: https://hakuogre-del.github.io/kakeibo/ （スマホはホーム画面に追加するとアプリのように使える）
- **データ**: Supabase（プロジェクト `kakeibo` / `gyqbxaqgayywrvhrqswu`）。メール＋パスワードでログインし、同じアカウントならどの端末でも同じ記録が見える。行レベルセキュリティで本人の行しか読み書きできない。
- **レシート読み取り**: [Tesseract.js](https://github.com/naptha/tesseract.js) によるスマホ内OCR。無料・APIキー不要。読み取った文字から店名・日付・品目・金額・合計を抜き出し、キーワードと店名でジャンルを推定する。

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | アプリ本体（1ファイル完結） |
| `manifest.webmanifest`, `icon*.{svg,png}` | ホーム画面追加用 |

## テーブル

- `expenses` — id, user_id, date, store, memo, items(jsonb: name/amount/category), total, source(receipt/manual)
- `settings` — user_id, budget

## 公開

`main` ブランチに push すると GitHub Pages が自動で更新される。
