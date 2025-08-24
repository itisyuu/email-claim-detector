import readline from 'readline';
import { ClaimDetector } from './services/claimDetector.js';
import { ClaimFormatter } from './presentation/formatters/claimFormatter.js';
import { validateConfig } from './config/config.js';

export class CLI {
  constructor() {
    this.detector = new ClaimDetector();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    try {
      console.log('🔧 設定を検証中...');
      validateConfig();
      
      console.log('⚙️ サービスを初期化中...');
      await this.detector.initialize();
      
      console.log(ClaimFormatter.showWelcome());
      this.showPrompt();
    } catch (error) {
      console.error('❌ 初期化エラー:', error.message);
      
      if (error.message.includes('Missing required configuration')) {
        console.log('\n📝 設定方法:');
        console.log('1. .env.example ファイルを .env にコピー');
        console.log('2. .env ファイルに必要な設定値を入力');
        console.log('3. アプリケーションを再実行');
      }
      
      process.exit(1);
    }
  }

  async startWithCommand(args) {
    try {
      console.log('🔧 設定を検証中...');
      validateConfig();
      
      console.log('⚙️ サービスを初期化中...');
      await this.detector.initialize();
      
      console.log('📧 コマンドを実行中...');
      
      const command = args.join(' ');
      await this.handleCommand(command);
      
      await this.exit();
    } catch (error) {
      console.error('❌ 初期化エラー:', error.message);
      
      if (error.message.includes('Missing required configuration')) {
        console.log('\n📝 設定方法:');
        console.log('1. .env.example ファイルを .env にコピー');
        console.log('2. .env ファイルに必要な設定値を入力');
        console.log('3. アプリケーションを再実行');
      }
      
      process.exit(1);
    }
  }

  showPrompt() {
    this.rl.question('\n> ', (input) => {
      this.handleCommand(input.trim());
    });
  }

  async handleCommand(input) {
    if (!input) {
      this.showPrompt();
      return;
    }

    const [command, ...args] = input.split(' ');

    try {
      switch (command.toLowerCase()) {
        case 'process':
          await this.processEmails(args);
          break;

        case 'claims':
          await this.showClaims(args);
          break;

        case 'stats':
          await this.showStats();
          break;

        case 'report':
          await this.generateReport(args);
          break;

        case 'logs':
          await this.showLogs();
          break;

        case 'history':
          await this.showHistory(args);
          break;

        case 'server':
          await this.manageServer(args);
          break;

        case 'help':
          console.log(ClaimFormatter.showMenu());
          break;

        case 'exit':
          await this.exit();
          return;

        default:
          console.log(`❌ 不明なコマンド: ${command}`);
          console.log("'help' でコマンド一覧を表示");
          break;
      }
    } catch (error) {
      console.error('❌ エラー:', error.message);
    }

    this.showPrompt();
  }

  async processEmails(args) {
    const debugMode = args.includes('--debug') || args.includes('-d');
    const localllmMode = args.includes('--localllm') || args.includes('-localllm');
    const dateFilters = this.parseDateFilters(args);
    const emailAddress = this.parseEmailAddress(args);
    
    console.log('📧 メールの処理を開始します...');
    if (debugMode) {
      console.log('🔧 デバッグモードが有効です');
    }
    if (localllmMode) {
      console.log('🤖 ローカルLLM & ONNX NPUモードが有効です');
      console.log('⚙️ ONNX NPUサーバーを自動起動します...');
    }
    if (emailAddress) {
      console.log('📮 指定メールボックス:', emailAddress);
    }
    
    if (dateFilters.days || dateFilters.hours || dateFilters.startDate || dateFilters.endDate) {
      console.log('📅 期間指定:', this.formatDateFilters(dateFilters));
    }
    
    try {
      const options = { 
        debug: debugMode,
        useLocalLLM: localllmMode,
        emailAddress: emailAddress,
        ...dateFilters
      };
      const result = await this.detector.processEmails(options);
      console.log(`✅ 処理完了: ${result.emailsProcessed}件のメールを処理し、${result.claimsDetected}件のクレームを検出しました`);
    } catch (error) {
      console.error('❌ メール処理中にエラーが発生しました:', error.message);
    }
  }

  async showClaims(args) {
    const filters = this.parseFilters(args);
    
    console.log('🔍 クレーム一覧を取得中...');
    
    try {
      const claims = await this.detector.getClaims(filters);
      
      if (claims.length === 0) {
        console.log('📭 指定された条件のクレームが見つかりませんでした');
        return;
      }

      console.log(`📋 ${claims.length}件のクレームが見つかりました`);
      console.log(ClaimFormatter.formatClaimsTable(claims));

      if (claims.length === 1) {
        console.log(ClaimFormatter.formatClaimDetails(claims[0]));
      } else if (claims.length <= 5) {
        console.log('\n詳細表示が必要な場合は、フィルターで絞り込んでください');
      }

    } catch (error) {
      console.error('❌ クレーム取得中にエラーが発生しました:', error.message);
    }
  }

  async showStats() {
    console.log('📊 統計情報を取得中...');
    try {
      const stats = await this.detector.getClaimStats();
      console.log(ClaimFormatter.formatStats(stats));
    } catch (error) {
      console.error('❌ 統計取得中にエラーが発生しました:', error.message);
    }
  }

  async generateReport(args = []) {
    const localllmMode = args.includes('--localllm') || args.includes('-localllm');
    
    if (localllmMode) {
      console.log('📝 ローカルLLM でAIレポートを生成中... (サーバーを起動します)');
      
      // サーバー起動
      const serverStarted = await this.detector.localLLMService.startServer();
      if (!serverStarted) {
        console.error('❌ ONNX NPUサーバーの起動に失敗しました');
        return;
      }
    } else {
      console.log('📝 Azure OpenAI でAIレポートを生成中... (しばらくお待ちください)');
    }
    
    try {
      const report = await this.detector.generateReport(localllmMode);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(localllmMode ? '🤖 ONNX NPU生成レポート' : '🤖 Azure OpenAI生成レポート');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(report);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('❌ レポート生成中にエラーが発生しました:', error.message);
    }
  }

  async showLogs() {
    console.log('📋 処理ログを取得中...');
    try {
      const logs = await this.detector.getRecentProcessingLogs();
      console.log(ClaimFormatter.formatProcessingLog(logs));
    } catch (error) {
      console.error('❌ ログ取得中にエラーが発生しました:', error.message);
    }
  }

  async showHistory(args) {
    const filters = this.parseHistoryFilters(args);
    
    console.log('📧 処理済みメール履歴を取得中...');
    
    try {
      const emails = await this.detector.getProcessedEmails(filters);
      
      if (emails.length === 0) {
        console.log('📭 処理済みメールが見つかりませんでした');
        return;
      }

      console.log(`📋 ${emails.length}件の処理済みメールが見つかりました`);
      console.log(ClaimFormatter.formatEmailHistoryTable(emails));

    } catch (error) {
      console.error('❌ メール履歴取得中にエラーが発生しました:', error.message);
    }
  }

  async manageServer(args) {
    const [action] = args;
    
    try {
      switch (action?.toLowerCase()) {
        case 'start':
          console.log('🚀 ONNX NPUサーバーを起動中...');
          const started = await this.detector.localLLMService.startServer();
          if (started) {
            console.log('✅ サーバーが正常に起動しました');
          } else {
            console.log('❌ サーバーの起動に失敗しました');
          }
          break;

        case 'stop':
          console.log('🛑 ONNX NPUサーバーを停止中...');
          await this.detector.localLLMService.stopServer();
          console.log('✅ サーバーが停止しました');
          break;

        case 'status':
          console.log('🔍 ONNX NPUサーバーの状態を確認中...');
          const health = await this.detector.localLLMService.checkServerHealth();
          console.log('📊 サーバー状態:');
          console.log(JSON.stringify(health, null, 2));
          break;

        case 'restart':
          console.log('🔄 ONNX NPUサーバーを再起動中...');
          await this.detector.localLLMService.stopServer();
          await new Promise(resolve => setTimeout(resolve, 2000));
          const restarted = await this.detector.localLLMService.startServer();
          if (restarted) {
            console.log('✅ サーバーが正常に再起動しました');
          } else {
            console.log('❌ サーバーの再起動に失敗しました');
          }
          break;

        default:
          console.log('❌ 無効なサーバーコマンドです');
          console.log('利用可能なコマンド:');
          console.log('  server start  - サーバーを起動');
          console.log('  server stop   - サーバーを停止');
          console.log('  server status - サーバー状態を確認');
          console.log('  server restart - サーバーを再起動');
          break;
      }
    } catch (error) {
      console.error('❌ サーバー管理中にエラーが発生しました:', error.message);
    }
  }

  parseFilters(args) {
    const filters = {};

    args.forEach(arg => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key && value) {
          switch (key) {
            case 'category':
              filters.category = value;
              break;
            case 'severity':
              filters.severity = value;
              break;
            case 'confidence':
              filters.confidence = parseInt(value);
              break;
            case 'limit':
              filters.limit = parseInt(value);
              break;
            case 'date-from':
              filters.dateFrom = value;
              break;
            case 'date-to':
              filters.dateTo = value;
              break;
          }
        }
      }
    });

    return filters;
  }

  parseHistoryFilters(args) {
    const filters = {};

    args.forEach(arg => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key && value) {
          switch (key) {
            case 'limit':
              filters.limit = parseInt(value);
              break;
            case 'date-from':
              filters.dateFrom = value;
              break;
            case 'date-to':
              filters.dateTo = value;
              break;
            case 'sender':
              filters.sender = value;
              break;
          }
        }
      }
    });

    return filters;
  }

  parseDateFilters(args) {
    const filters = {};

    args.forEach(arg => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key && value) {
          switch (key) {
            case 'days':
              filters.days = parseInt(value);
              break;
            case 'hours':
              filters.hours = parseInt(value);
              break;
            case 'from':
              filters.startDate = new Date(value);
              break;
            case 'to':
              filters.endDate = new Date(value);
              break;
          }
        }
      }
    });

    return filters;
  }

  parseEmailAddress(args) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--email-address' || arg === '-email') {
        return args[i + 1];
      }
      
      if (arg.startsWith('--email-address=')) {
        return arg.substring('--email-address='.length);
      }
      
      if (arg.startsWith('-email=')) {
        return arg.substring('-email='.length);
      }
    }
    
    return null;
  }

  formatDateFilters(filters) {
    const parts = [];
    
    if (filters.days) {
      parts.push(`過去${filters.days}日間`);
    }
    
    if (filters.hours) {
      parts.push(`過去${filters.hours}時間`);
    }
    
    if (filters.startDate && filters.endDate) {
      parts.push(`${filters.startDate.toLocaleDateString()} ～ ${filters.endDate.toLocaleDateString()}`);
    } else if (filters.startDate) {
      parts.push(`${filters.startDate.toLocaleDateString()} 以降`);
    } else if (filters.endDate) {
      parts.push(`${filters.endDate.toLocaleDateString()} まで`);
    }
    
    return parts.join(', ');
  }

  async exit() {
    console.log('🛑 アプリケーションを終了中...');
    try {
      await this.detector.shutdown();
      this.rl.close();
      console.log('👋 お疲れ様でした！');
      process.exit(0);
    } catch (error) {
      console.error('❌ 終了処理中にエラーが発生しました:', error.message);
      process.exit(1);
    }
  }
}