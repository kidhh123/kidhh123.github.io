# kidhh123.github.io

個人網站，使用 [Astro](https://astro.build)（底層 Vite）建置，部署於 GitHub Pages。

## 開發指令

| 指令 | 作用 |
| --- | --- |
| `npm install` | 第一次：安裝依賴 |
| `npm run dev` | 開發伺服器，存檔自動刷新（預設 http://localhost:4321） |
| `npm run build` | 建置：產出 `dist/` 純靜態檔 |
| `npm run preview` | 本機預覽 build 結果 |

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| `src/pages/` | 頁面（檔名即網址，例：`aboutme.astro` → `/aboutme`） |
| `src/layouts/` | 共用版面（`BaseLayout`） |
| `src/components/` | 共用元件（如 `Nav`） |
| `public/` | 原樣輸出的靜態資源（`images/`、`sounds/`、`data/`） |
| `legacy/` | 舊版手刻 HTML，逐頁遷移用的參考 |
| `.github/workflows/` | GitHub Actions 自動部署設定 |

## 部署流程

Push 到 `main` → GitHub Actions 自動 `npm run build` → 部署到 GitHub Pages。
原始碼（`.astro` / `.md`）才進 git；建置產物 `dist/` 不進 git，由 Actions 重新編譯。
