# メールクレーム検知システム

Exchange OnlineからDelegate権限でメールを取得し、Azure OpenAIを使用してクレームを自動検知するシステムです。

## 機能

- 🔐 Azure ADを使用したExchange Online認証
- 📧 Delegate権限でのメール取得
- 🤖 Azure OpenAIによるクレーム自動検知
- 📊 SQLiteでの処理結果保存・管理
- 📈 クレーム統計とレポート生成
- 💻 インタラクティブなCLIインターフェース

## 必要な設定

### 1. Azure AD App Registration

1. Azure Portalでアプリ登録を作成
2. 以下のAPI権限を付与:
   - `Mail.Read` (Delegated)
   - `User.Read` (Delegated)
3. 認証設定:
   - アプリケーションの種類: **パブリッククライアント**
   - 「パブリッククライアントフロー」を有効化
   - Device Code Flow を許可

### 2. Exchange Online権限

- 認証したユーザーが対象メールボックスに対する適切なアクセス権限を持つこと
- Exchange Onlineでの代理アクセス権限（必要に応じて）

### 3. Azure OpenAI

- Azure OpenAIリソースの作成
- GPT-4やGPT-3.5-turboのデプロイメント

## セットアップ

### 1. 依存関係のインストール

```bash
cd email-claim-detector
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env`ファイルを編集し、以下の項目を設定:

```env
# Azure AD App Registration (Device Code Flow - Public Client)
CLIENT_ID=your_client_id_here
TENANT_ID=your_tenant_id_here

# Exchange Online Settings
MAILBOX_EMAIL=mailbox@yourdomain.com

# Azure OpenAI Settings
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your_api_key_here
AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name_here

# Database Settings (オプション)
DATABASE_PATH=./data/emails.db

# Application Settings (オプション)
CHECK_INTERVAL_MINUTES=30
MAX_EMAILS_PER_RUN=50
```

## 使用方法

### アプリケーションの開始

```bash
npm start
```

### 利用可能なコマンド

| コマンド | 説明 | 例 |
|---------|------|-----|
| `process` | メールを処理してクレームを検知 | `process` |
| `claims` | 検出されたクレーム一覧を表示 | `claims --severity=high` |
| `stats` | クレーム統計を表示 | `stats` |
| `report` | AIによるクレームレポートを生成 | `report` |
| `logs` | 処理ログを表示 | `logs` |
| `help` | ヘルプを表示 | `help` |
| `exit` | アプリケーションを終了 | `exit` |

### フィルターオプション

```bash
# カテゴリ別のクレーム表示
claims --category=product

# 重要度の高いクレームのみ
claims --severity=high

# 信頼度80%以上のクレーム
claims --confidence=80

# 最新10件のクレーム
claims --limit=10

# 複数条件の組み合わせ
claims --category=service --severity=high --limit=5
```

## プロジェクト構造

```
email-claim-detector/
├── src/
│   ├── config/
│   │   └── config.js          # 設定管理
│   ├── models/
│   │   └── database.js        # データベース操作
│   ├── services/
│   │   ├── exchangeService.js # Exchange Online連携
│   │   ├── openaiService.js   # Azure OpenAI連携
│   │   └── claimDetector.js   # メインロジック
│   ├── utils/
│   │   └── display.js         # 表示ユーティリティ
│   ├── cli.js                 # CLIインターフェース
│   └── index.js               # エントリーポイント
├── data/                      # データベースファイル
├── .env.example              # 環境変数テンプレート
├── .env                      # 環境変数 (作成が必要)
├── package.json
└── README.md
```

## クレーム検知ロジック

システムは以下の基準でクレームを判定します:

### 判定基準
- 不満・苦情・問題の報告
- 解決や対応を求める内容
- 否定的な感情表現
- サービス・商品への批判
- 改善要求

### カテゴリ
- `product`: 商品関連
- `service`: サービス関連
- `billing`: 請求関連
- `delivery`: 配送関連
- `other`: その他
- `not_claim`: クレームではない

### 重要度
- `high`: 高 (重要な問題、緊急対応が必要)
- `medium`: 中 (一般的な問題)
- `low`: 低 (軽微な問題)

## データベーススキーマ

### emails テーブル
メールの基本情報を保存

### claims テーブル
クレーム分析結果を保存

### processing_log テーブル
処理実行ログを保存

## トラブルシューティング

### 認証エラー
- CLIENT_ID, CLIENT_SECRET, TENANT_IDが正しく設定されているか確認
- Azure ADアプリの権限が正しく付与されているか確認
- 管理者による権限の承認が完了しているか確認

### メール取得エラー
- Delegate権限が正しく設定されているか確認
- MAILBOX_EMAILが存在するメールボックスか確認

### OpenAIエラー
- Azure OpenAIのエンドポイントとAPIキーが正しく設定されているか確認
- デプロイメント名が正しいか確認
- APIクォータが十分あるか確認

## ライセンス

MIT License