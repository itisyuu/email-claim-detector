import readline from 'readline';
import { ClaimDetector } from './services/claimDetector.js';
import { DisplayUtils } from './utils/display.js';
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
      
      console.log(DisplayUtils.showWelcome());
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
          await this.generateReport();
          break;

        case 'logs':
          await this.showLogs();
          break;

        case 'history':
          await this.showHistory(args);
          break;

        case 'help':
          console.log(DisplayUtils.showMenu());
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
    const dateFilters = this.parseDateFilters(args);
    
    console.log('📧 メールの処理を開始します...');
    if (debugMode) {
      console.log('🔧 デバッグモードが有効です');
    }
    
    if (dateFilters.days || dateFilters.hours || dateFilters.startDate || dateFilters.endDate) {
      console.log('📅 期間指定:', this.formatDateFilters(dateFilters));
    }
    
    try {
      const options = { 
        debug: debugMode,
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
      console.log(DisplayUtils.formatClaimsTable(claims));

      if (claims.length === 1) {
        console.log(DisplayUtils.formatClaimDetails(claims[0]));
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
      console.log(DisplayUtils.formatStats(stats));
    } catch (error) {
      console.error('❌ 統計取得中にエラーが発生しました:', error.message);
    }
  }

  async generateReport() {
    console.log('📝 AIレポートを生成中... (しばらくお待ちください)');
    try {
      const report = await this.detector.generateReport();
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🤖 AI生成レポート');
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
      console.log(DisplayUtils.formatProcessingLog(logs));
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
      console.log(DisplayUtils.formatEmailHistoryTable(emails));

    } catch (error) {
      console.error('❌ メール履歴取得中にエラーが発生しました:', error.message);
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