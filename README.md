# メールクレーム検知システム

Exchange Online から Delegate 権限でメールを取得し、Azure OpenAI を使用してクレームを自動検知するシステムです。

## 機能

- 🔐 Azure AD を使用した Exchange Online 認証
- 📧 Delegate 権限でのメール取得
- 📅 期間を指定したメール取得（日時範囲、過去n日/時間）
- 🤖 Azure OpenAI またはローカルLLM によるクレーム自動検知
- ⚡ Azure OpenAI での同時実行リクエストによる高速処理
- 📊 SQLite での処理結果保存・管理
- 📈 クレーム統計とレポート生成
- 💻 インタラクティブな CLI インターフェース

## 必要な設定

### 1. Azure AD App Registration

1. Azure Portal でアプリ登録を作成
2. 以下の API 権限を付与:
   - `Mail.Read` (Delegated)
   - `Mail.Read.Shared` (Delegated) - 共有メールボックスアクセス用
   - `User.Read` (Delegated)
3. 認証設定:
   - アプリケーションの種類: **パブリッククライアント**
   - 「パブリッククライアントフロー」を有効化
   - Device Code Flow を許可

### 2. Exchange Online 権限

- 認証したユーザーが対象メールボックスに対する適切なアクセス権限を持つこと
- 個人メールボックス: Mail.Read権限でアクセス
- 共有メールボックス: Mail.Read.Shared権限 + 共有メールボックスへの適切なアクセス権限
- Exchange Online での代理アクセス権限（必要に応じて）

### 3. AI サービス

#### Azure OpenAI（推奨）
- Azure OpenAI リソースの作成
- GPT-4 や GPT-3.5-turbo のデプロイメント

#### ローカルLLM（ONNX Runtime NPU対応）
- ONNX Runtime + NPU による高速ローカル推論
- localhost:5834 での実行（OpenAI互換API）
- 自動サーバー管理機能付き

## セットアップ

### 1. 依存関係のインストール

```bash
cd email-claim-detector
npm install
```

### 2. ローカルLLMモデルの準備（オプション）

ローカルLLM機能を使用する場合は、ONNXモデルをダウンロードしてください：

```bash
# modelsディレクトリ作成
mkdir -p models
cd models

# 推奨モデルのダウンロード（Phi-3-Mini）
wget -O phi-3-mini-4k-instruct-cpu-int4.onnx \
  "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx/resolve/main/cpu_and_mobile/cpu-int4-rtn-block-32-acc-level-4/phi-3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx"

cd ..
```

### 3. 環境変数の設定

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

| コマンド  | 説明                            | 例                       |
| --------- | ------------------------------- | ------------------------ |
| `process` | メールを処理してクレームを検知  | `process`                |
| `claims`  | 検出されたクレーム一覧を表示    | `claims --severity=high` |
| `stats`   | クレーム統計を表示              | `stats`                  |
| `report`  | AI によるクレームレポートを生成 | `report`                 |
| `server`  | ONNX NPUサーバーを管理          | `server start`           |
| `logs`    | 処理ログを表示                  | `logs`                   |
| `help`    | ヘルプを表示                    | `help`                   |
| `exit`    | アプリケーションを終了          | `exit`                   |

### processコマンドのオプション

| オプション     | 説明                          | 例                        |
| -------------- | ----------------------------- | ------------------------- |
| `--email-address` / `-email` | 指定メールボックスからのみメール取得 | `process --email-address=shared@company.com` |
| `--concurrency` / `-c` | Azure OpenAI 同時実行数を設定（デフォルト: 3） | `process --concurrency=5` |
| `--localllm`   | ローカルLLMを使用             | `process --localllm`      |
| `--debug`      | デバッグモードを有効化        | `process --debug`         |
| `--days=n`     | 過去n日間のメールを処理       | `process --days=7`        |
| `--hours=n`    | 過去n時間のメールを処理       | `process --hours=24`      |
| `--from=date`  | 指定日時以降のメールを処理    | `process --from=2024-01-01` |
| `--to=date`    | 指定日時までのメールを処理    | `process --to=2024-01-31` |

### serverコマンドのオプション

| サブコマンド | 説明                          | 例                        |
| ------------ | ----------------------------- | ------------------------- |
| `start`      | ONNX NPUサーバーを起動        | `server start`            |
| `stop`       | ONNX NPUサーバーを停止        | `server stop`             |
| `status`     | サーバー状態を確認            | `server status`           |
| `restart`    | サーバーを再起動              | `server restart`          |

### 組み合わせ例

```bash
# 特定の共有メールボックスから過去7日間のメールを処理
process --email-address=support@company.com --days=7

# 特定のメールボックスからONNX Runtime NPUで処理（デバッグ有効）
process -email shared@company.com --localllm --days=3 --debug

# ONNX Runtime NPUでレポート生成
report --localllm

# サーバー管理
server start    # サーバー起動
server status   # 状態確認
server stop     # サーバー停止

# Azure OpenAIで特定期間のメールを処理
process --from=2024-01-01 --to=2024-01-31

# ONNX Runtime NPUで過去24時間のメールを処理
process --localllm --hours=24

# Azure OpenAI で同時実行数を指定して高速処理
process --days=7 --concurrency=10

# 同時実行とデバッグの組み合わせ
process --concurrency=5 --debug --days=3
```

### 期間指定でのメール取得

システムでは以下の方法で期間を指定してメールを取得できます:

#### プログラム内での使用例

```javascript
import { ExchangeService } from './src/infrastructure/email/exchangeService.js';

const exchangeService = new ExchangeService();
await exchangeService.initialize();

// 過去7日間のメール取得
const emails = await exchangeService.getEmailsByDateRange({
  daysAgo: 7
});

// 過去24時間のメール取得
const recentEmails = await exchangeService.getEmailsByDateRange({
  hoursAgo: 24
});

// 特定期間のメール取得（開始日時と終了日時を指定）
const specificEmails = await exchangeService.getEmailsByDateRange({
  startDate: new Date('2025-08-20'),
  endDate: new Date('2025-08-22')
});

// 開始日時のみ指定（その日時以降のメール）
const fromDateEmails = await exchangeService.getEmailsByDateRange({
  startDate: new Date('2025-08-20')
});
```

#### 期間指定オプション

| オプション    | 説明                          | 例                         |
| ------------- | ----------------------------- | -------------------------- |
| `startDate`   | 取得開始日時を指定            | `new Date('2025-08-20')`   |
| `endDate`     | 取得終了日時を指定            | `new Date('2025-08-22')`   |
| `daysAgo`     | 過去n日前から現在まで         | `daysAgo: 7` (過去7日間)   |
| `hoursAgo`    | 過去n時間前から現在まで       | `hoursAgo: 24` (過去24時間)|

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
│   ├── application/                        # アプリケーション層
│   │   └── claimDetectionOrchestrator.js  # メインオーケストレーション処理
│   ├── infrastructure/                     # インフラストラクチャ層
│   │   ├── ai/                            # AI連携
│   │   │   ├── baseAIService.js           # AI共通基底クラス
│   │   │   ├── openaiService.js           # Azure OpenAI連携
│   │   │   └── localLLMService.js         # ローカルLLM連携 + サーバー管理
│   │   ├── database/                      # データベース
│   │   │   └── database.js                # データベース操作
│   │   └── email/                         # メール連携
│   │       └── exchangeService.js         # Exchange Online連携（期間指定機能含む）
│   ├── presentation/                       # プレゼンテーション層
│   │   └── formatters/                    # フォーマッター
│   │       └── claimFormatter.js          # クレーム表示フォーマッター
│   ├── config/
│   │   ├── config.js                      # 設定管理
│   │   └── exclusionList.json             # クレーム判定除外設定
│   ├── servers/
│   │   └── onnxNpuServer.js               # ONNX Runtime NPUサーバー
│   ├── services/                          # 後方互換性（非推奨）
│   │   └── claimDetector.js               # ClaimDetectionOrchestratorのラッパー
│   ├── cli.js                             # CLIインターフェース
│   └── index.js                           # エントリーポイント
├── data/                                  # データベースファイル
├── .env.example                          # 環境変数テンプレート
├── .env                                  # 環境変数 (作成が必要)
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

- `answer quality`: 回答品質関連
- `answer delay`: 回答遅延関連
- `point less conversation`: 無意味な会話
- `communication`: コミュニケーション関連
- `other`: その他
- `not_claim`: クレームではない

### 重要度

- `high`: 高 (重要な問題、緊急対応が必要)
- `medium`: 中 (一般的な問題)
- `low`: 低 (軽微な問題)

## クレーム判定除外機能

バルクメールや自動送信メールなど、クレーム判定が不要なメールを除外する機能を提供しています。

### 除外設定ファイル

`src/config/exclusionList.json` でクレーム判定から除外するメールを設定できます:

```json
{
  "excludeFromClaimDetection": {
    "emails": [
      "noreply@example.com",
      "marketing@example.com",
      "newsletter@example.com"
    ],
    "domains": [
      "mailchimp.com",
      "sendgrid.net",
      "amazonses.com"
    ],
    "subjectPatterns": [
      "^(Re:|Fwd:)?\\s*Newsletter",
      "^(Re:|Fwd:)?\\s*Marketing",
      "^(Re:|Fwd:)?\\s*Bulk"
    ]
  }
}
```

### 除外条件

以下のいずれかの条件に該当するメールはクレーム判定から除外されます:

1. **特定のメールアドレス** (`emails`)
   - 完全一致で判定
   - 例: `noreply@example.com`, `marketing@example.com`

2. **特定のドメイン** (`domains`)
   - 送信者のドメインで判定
   - 例: `mailchimp.com`, `constantcontact.com`

3. **件名パターン** (`subjectPatterns`)
   - 正規表現パターンで判定
   - 例: Newsletter、Marketing、Bulkで始まる件名

### 除外メールの処理

除外されたメールは:
- OpenAI APIでの分析をスキップ（コスト削減）
- データベースには `category: 'excluded'` として記録
- ログには「excluded from claim detection」として表示

## データベーススキーマ

### emails テーブル

メールの基本情報を保存

### claims テーブル

クレーム分析結果を保存

### processing_log テーブル

処理実行ログを保存

## ONNX Runtime NPU機能

ONNX Runtime + NPUを使用した高速ローカル推論によりクレーム判定を行うことができます。

### 必要条件

- NPU搭載PC (Copilot+ PC推奨)
- ONNX形式のPhi-3またはその他のLLMモデル
- Express.js + ONNX Runtime Node.js環境

### 自動サーバー管理

`process --localllm` コマンドを実行すると、自動的にONNX NPUサーバーが起動されます：

```bash
# 自動でサーバーが起動され、クレーム判定を実行
process --localllm

# レポート生成時も自動起動
report --localllm

# 手動でサーバー管理
server start    # サーバー起動
server status   # 状態確認  
server stop     # サーバー停止
server restart  # 再起動
```

### 技術仕様

- **推論エンジン**: ONNX Runtime with DirectML
- **NPU加速**: DirectML execution provider
- **API互換性**: OpenAI Chat Completions API
- **サーバーポート**: 5834 (設定可能)
- **プロトコル**: HTTP/JSON

### スタンドアローン実行

サーバーを独立して実行することも可能です：

```bash
# NPMスクリプトから起動
npm run server

# 直接実行
node src/servers/onnxNpuServer.js

# 開発モード（ファイル監視）
npm run server:dev
```

### ONNX Runtime NPUの利点

- **高速推論**: NPUによるハードウェア加速
- **プライバシー**: メールデータがローカルで処理される  
- **コスト効率**: Azure OpenAI APIの使用料金が不要
- **低レイテンシ**: ネットワーク遅延がなく高速レスポンス
- **オフライン動作**: インターネット接続不要で動作
- **自動管理**: サーバーの起動・停止を自動化

### モデル選択ガイド

**日本語クレーム判定における推奨モデル（性能順）:**

1. **Phi-3-Mini-4K-Instruct** 🌟 推奨
   - パラメータ数: 3.8B
   - 日本語対応: 優秀
   - 速度: 高速
   - メモリ: 4GB RAM
   - 用途: 一般的なクレーム判定に最適

2. **Phi-3-Medium-4K-Instruct** 
   - パラメータ数: 14B
   - 日本語対応: 最高品質
   - 速度: 中程度
   - メモリ: 16GB RAM
   - 用途: 複雑なクレーム分析

3. **Llama-2-7B-Chat-Japanese**
   - パラメータ数: 7B
   - 日本語対応: 良好
   - 速度: 中程度  
   - メモリ: 8GB RAM
   - 用途: バランス重視

**ハードウェア別推奨設定:**

```bash
# NPU搭載PC (Copilot+ PC)
ONNX_MODEL_PATH=./models/phi-3-mini-4k-instruct-directml-int4.onnx
ONNX_EXECUTION_PROVIDERS=dml,cpu

# 高性能CPU 
ONNX_MODEL_PATH=./models/phi-3-mini-4k-instruct-cpu-int4.onnx
ONNX_EXECUTION_PROVIDERS=cpu

# GPU搭載PC
ONNX_MODEL_PATH=./models/phi-3-mini-4k-instruct-cuda-fp16.onnx
ONNX_EXECUTION_PROVIDERS=cuda,cpu
```

### モデルの配置とダウンロード

**1. モデル配置ディレクトリの作成:**

```bash
# プロジェクトルートからmodelsディレクトリを作成
cd email-claim-detector
mkdir -p models
cd models
```

**2. 推奨モデルのダウンロード:**

```bash
# Phi-3-Mini CPU版 (推奨・軽量)
wget -O phi-3-mini-4k-instruct-cpu-int4.onnx \
  https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx/resolve/main/cpu_and_mobile/cpu-int4-rtn-block-32-acc-level-4/phi-3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx

# Phi-3-Mini NPU最適化版 (Copilot+ PC推奨)
wget -O phi-3-mini-4k-instruct-directml-int4.onnx \
  https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx-directml/resolve/main/directml/directml-int4-awq-block-128/phi3-mini-4k-instruct-directml-int4-awq-block-128.onnx
```

**3. ディレクトリ構造:**

```
email-claim-detector/
├── src/
├── models/                    # ← ここにモデルファイルを配置
│   ├── phi-3-mini-4k-instruct-cpu-int4.onnx
│   ├── phi-3-mini-4k-instruct-directml-int4.onnx
│   └── [その他のモデルファイル]
├── data/
├── .env
└── package.json
```

**4. .env設定での指定:**

```bash
# 相対パスで指定（推奨）
ONNX_MODEL_PATH=./models/phi-3-mini-4k-instruct-cpu-int4.onnx

# 絶対パスでも可能
ONNX_MODEL_PATH=/full/path/to/email-claim-detector/models/phi-3-mini-4k-instruct-cpu-int4.onnx
```

**5. モデルファイルの確認:**

```bash
# ファイルサイズと存在確認
ls -lh models/

# 設定確認（アプリケーション内から）
server status
```

**6. 複数モデルの管理:**

```bash
# 用途別にファイル名を整理
models/
├── phi-3-mini-cpu-int4.onnx        # 軽量・高速
├── phi-3-mini-npu-int4.onnx        # NPU最適化
├── phi-3-medium-cpu-fp16.onnx      # 高精度
└── llama-2-7b-chat-jp.onnx         # 日本語特化

# .envで使用するモデルを切り替え
ONNX_MODEL_PATH=./models/phi-3-mini-npu-int4.onnx  # NPU使用時
ONNX_MODEL_PATH=./models/phi-3-mini-cpu-int4.onnx  # CPU使用時
```

### 制限事項

- NPU搭載PCでの利用を推奨
- ONNX形式のモデルが必要
- モデルサイズによる処理能力の違い
- メモリ使用量がモデルサイズに依存

## アーキテクチャ設計

### レイヤー構造

Clean Architectureの原則に基づいたレイヤー分離アーキテクチャを採用しています：

#### Application Layer（アプリケーション層）
- **ClaimDetectionOrchestrator**: メインのビジネスロジックオーケストレーション
- 複数のInfrastructure Serviceを協調させて処理を実行

#### Infrastructure Layer（インフラストラクチャ層）
- **AI Services**: AI連携の抽象化と実装
  - `BaseAIService`: 共通AI処理の基底クラス（Template Method Pattern）
  - `OpenAIService`: Azure OpenAI実装（同時実行リクエスト対応）
  - `LocalLLMService`: ローカルLLM実装
- **Email Services**: メール取得の実装
  - `ExchangeService`: Exchange Online連携
- **Database Services**: データ永続化
  - `Database`: SQLiteデータベース操作

#### Presentation Layer（プレゼンテーション層）
- **Formatters**: データ表示フォーマット
  - `ClaimFormatter`: クレーム表示専用フォーマッター

#### 後方互換性
- **services/claimDetector.js**: 既存コードとの互換性を保持（非推奨）

### 設計パターン

1. **Template Method Pattern**: `BaseAIService`で共通処理を定義
2. **Strategy Pattern**: AI実装を切り替え可能
3. **Facade Pattern**: `ClaimDetectionOrchestrator`でサービスを統合
4. **Dependency Injection**: コンストラクタでサービスを注入

### 利点

1. **責務の明確化**: 各レイヤーが明確な責務を持つ
2. **テスト容易性**: 各レイヤーを独立してテスト可能
3. **拡張性**: 新しいAIプロバイダの追加が容易
4. **保守性**: 変更の影響範囲が限定される
5. **コード重複削除**: 共通処理の一元化（約500行削減）
6. **パフォーマンス最適化**: Azure OpenAIの同時実行による高速処理

## トラブルシューティング

### 認証エラー

- CLIENT_ID, CLIENT_SECRET, TENANT_ID が正しく設定されているか確認
- Azure AD アプリの権限が正しく付与されているか確認
- 管理者による権限の承認が完了しているか確認

### メール取得エラー

- Delegate 権限が正しく設定されているか確認
- MAILBOX_EMAIL が存在するメールボックスか確認

### Azure OpenAI エラー

- Azure OpenAI のエンドポイントと API キーが正しく設定されているか確認
- デプロイメント名が正しいか確認
- API クォータが十分あるか確認
- 同時実行数がレート制限内に収まっているか確認

### ONNX Runtime NPU エラー

**モデルファイルが見つからない:**
```bash
# モデルファイルの存在確認
ls -la models/

# パスを確認
echo $ONNX_MODEL_PATH

# モデルを再ダウンロード
cd models
wget -O phi-3-mini-4k-instruct-cpu-int4.onnx [URL]
```

**サーバーが起動しない:**
```bash
# ポートが使用中でないか確認
netstat -an | grep 5834
lsof -i :5834

# 手動でサーバー起動してエラー確認
npm run server

# ログでエラー詳細確認
server status
```

**NPU/DirectMLが使用されない:**
```bash
# 実行プロバイダーの確認
ONNX_EXECUTION_PROVIDERS=dml,cpu

# NPUドライバーの確認（Windows）
dxdiag

# DirectMLの確認
server status  # execution_providersを確認
```

**メモリ不足エラー:**
```bash
# より軽量なモデルを使用
ONNX_MODEL_PATH=./models/phi-3-mini-cpu-int4.onnx

# 最大トークン数を削減
ONNX_MAX_TOKENS=256
```

## Azure OpenAI 同時実行機能

### 概要

Azure OpenAIを使用したメール分析において、複数のリクエストを並行処理することで大幅な処理時間短縮を実現します。

### 特徴

- **高速処理**: 従来の逐次処理と比較して大幅な時間短縮
- **設定可能な同時実行数**: `--concurrency` オプションで1〜任意の数まで設定可能
- **レート制限対応**: Azure OpenAIのレート制限を考慮した適切な制御
- **チャンク処理**: 指定された同時実行数でメールをバッチ処理
- **エラーハンドリング**: 個別のメール処理でエラーが発生しても他の処理を継続

### 使用方法

#### 基本的な同時実行

```bash
# デフォルト同時実行数（3）で処理
process

# 同時実行数を5に設定
process --concurrency=5
process -c=5

# 同時実行数を10に設定して過去7日間を処理
process --days=7 --concurrency=10
```

#### 推奨設定

**小規模処理（～100メール）:**
```bash
process --concurrency=3    # デフォルト設定
```

**中規模処理（100～1000メール）:**
```bash
process --concurrency=5    # バランス重視
```

**大規模処理（1000メール以上）:**
```bash
process --concurrency=10   # 高速処理重視
```

### 制限事項

- **Azure OpenAI専用**: Local LLM使用時は同時実行設定が無視されます
- **レート制限**: Azure OpenAIのレート制限を超える設定は推奨されません
- **メモリ使用量**: 同時実行数に比例してメモリ使用量が増加します
- **API コスト**: 並行処理によりAPI呼び出し回数は変わりませんが、短時間で多数のリクエストが発生します

### パフォーマンス目安

| メール数 | 逐次処理時間 | 同時実行（5並列）時間 | 短縮効果 |
|---------|-------------|-------------------|---------|
| 50      | 約3分       | 約1分             | 約67%短縮 |
| 200     | 約12分      | 約3分             | 約75%短縮 |
| 1000    | 約60分      | 約15分            | 約75%短縮 |

### 注意点

- Azure OpenAIのレート制限に応じて適切な同時実行数を設定してください
- 大量処理時はAPI使用量が短時間に集中するため、課金に注意してください
- ネットワーク環境やAzure OpenAIサービスの応答時間により効果は変動します
