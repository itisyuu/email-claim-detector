import { Client } from '@microsoft/microsoft-graph-client';
import { PublicClientApplication } from '@azure/msal-node';
import { config } from '../../config/config.js';
import crypto from 'crypto';
import open from 'open';

export class ExchangeService {
  constructor() {
    this.msalClient = null;
    this.graphClient = null;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenCache = null;
  }

  async initialize() {
    const msalConfig = {
      auth: {
        clientId: config.azure.clientId,
        authority: `https://login.microsoftonline.com/${config.azure.tenantId}`,
        redirectUri: 'http://localhost:3000/auth/callback',
      },
      cache: {
        cacheLocation: './data/token-cache.json',
      },
      system: {
        loggerOptions: {
          loggerCallback(loglevel, message, containsPii) {
            if (message.includes('invalid_client')) {
              console.log('MSAL詳細エラー:', message);
            }
          },
          piiLoggingEnabled: false,
          logLevel: 3,
        }
      }
    };

    this.msalClient = new PublicClientApplication(msalConfig);
    
    // トークンキャッシュから既存のトークンを確認
    await this.loadTokenFromCache();
    
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticateWithPKCE();
    }
    
    this.initializeGraphClient();
  }

  async loadTokenFromCache() {
    try {
      const accounts = await this.msalClient.getTokenCache().getAllAccounts();
      if (accounts.length > 0) {
        const silentRequest = {
          scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Read.Shared', 'https://graph.microsoft.com/User.Read'],
          account: accounts[0],
        };

        const response = await this.msalClient.acquireTokenSilent(silentRequest);
        this.accessToken = response.accessToken;
        this.tokenExpiry = response.expiresOn.getTime() - 300000; // 5分前にリフレッシュ
        console.log('✅ 既存のトークンを使用します');
      }
    } catch (error) {
      console.log('📝 新しい認証が必要です');
    }
  }

  generatePKCECodes() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    
    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256'
    };
  }

  async authenticateWithPKCE() {
    console.log('🔐 PKCE付きAuthorization Code Flowで認証を開始します...');
    
    try {
      const pkceCodes = this.generatePKCECodes();
      
      const authCodeUrlParameters = {
        scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Read.Shared', 'https://graph.microsoft.com/User.Read'],
        codeChallenge: pkceCodes.codeChallenge,
        codeChallengeMethod: pkceCodes.codeChallengeMethod,
        redirectUri: 'http://localhost:3000/auth/callback'
      };

      const authCodeUrl = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 Microsoft アカウント認証（PKCE付きAuthorization Code Flow）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📱 以下のURLにアクセスして認証してください：');
      console.log(`🌐 ${authCodeUrl}`);
      console.log('');
      console.log('⚠️ 認証後、コールバックURLから認証コードを取得してください');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👆 ブラウザを自動で開きます...');
      
      // ブラウザで認証ページを開く
      setTimeout(() => {
        open(authCodeUrl);
      }, 2000);

      // コールバックサーバーを起動して認証コードを受け取る
      const authCode = await this.startCallbackServer();
      
      // 認証コードを使ってトークンを取得
      const tokenRequest = {
        scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Read.Shared', 'https://graph.microsoft.com/User.Read'],
        code: authCode,
        codeVerifier: pkceCodes.codeVerifier,
        redirectUri: 'http://localhost:3000/auth/callback'
      };

      const response = await this.msalClient.acquireTokenByCode(tokenRequest);
      
      this.accessToken = response.accessToken;
      this.tokenExpiry = response.expiresOn.getTime() - 300000; // 5分前にリフレッシュ

      console.log('✅ PKCE付きAuthorization Code Flow認証が完了しました');
      
    } catch (error) {
      console.error('❌ PKCE認証エラー:', error.message);
      throw error;
    }
  }

  async startCallbackServer() {
    const http = await import('http');
    const url = await import('url');
    
    return new Promise((resolve, reject) => {
      const server = http.default.createServer((req, res) => {
        const parsedUrl = url.default.parse(req.url, true);
        
        if (parsedUrl.pathname === '/auth/callback') {
          const authCode = parsedUrl.query.code;
          const error = parsedUrl.query.error;
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>認証エラー</h1><p>エラー: ${error}</p>`);
            server.close();
            reject(new Error(`認証エラー: ${error}`));
            return;
          }
          
          if (authCode) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>認証成功</h1><p>認証が完了しました。このウィンドウを閉じてください。</p>`);
            server.close();
            resolve(authCode);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>認証失敗</h1><p>認証コードが見つかりません。</p>`);
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });
      
      server.listen(3000, 'localhost', () => {
        console.log('🌐 コールバックサーバーがポート3000で待機中...');
      });
      
      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // トークンの期限が切れている場合はサイレント更新を試行
    try {
      await this.loadTokenFromCache();
      if (this.accessToken && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }
    } catch (error) {
      console.log('🔄 トークンを再取得します...');
      await this.authenticateWithPKCE();
    }

    return this.accessToken;
  }

  initializeGraphClient() {
    this.graphClient = Client.init({
      authProvider: async (done) => {
        try {
          const token = await this.getAccessToken();
          done(null, token);
        } catch (error) {
          done(error, null);
        }
      },
    });
  }

  async getEmails(lastCheckDate = null, dateRange = null, mailboxEmail = null) {
    try {
      const targetMailbox = mailboxEmail || config.exchange.mailboxEmail;
      let query = `/users/${targetMailbox}/messages`;
      
      const queryParams = [
        '$select=id,subject,body,from,receivedDateTime,hasAttachments,internetMessageId',
        '$orderby=receivedDateTime desc',
        `$top=${config.app.maxEmailsPerRun}`
      ];

      // 期間フィルタリングの構築
      const filterConditions = [];
      
      if (lastCheckDate && !dateRange) {
        // 従来の差分取得ロジック
        filterConditions.push(`receivedDateTime gt ${lastCheckDate.toISOString()}`);
      } else if (dateRange) {
        // 期間指定取得ロジック
        if (dateRange.startDate) {
          filterConditions.push(`receivedDateTime ge ${dateRange.startDate.toISOString()}`);
        }
        if (dateRange.endDate) {
          filterConditions.push(`receivedDateTime le ${dateRange.endDate.toISOString()}`);
        }
      }

      if (filterConditions.length > 0) {
        queryParams.push(`$filter=${filterConditions.join(' and ')}`);
      }

      query += '?' + queryParams.join('&');

      const response = await this.graphClient.api(query).get();
      return response.value || [];
    } catch (error) {
      console.error(`Error fetching emails from ${mailboxEmail || config.exchange.mailboxEmail}:`, error);
      throw error;
    }
  }

  async getEmailDetails(emailId, mailboxEmail = null) {
    try {
      const targetMailbox = mailboxEmail || config.exchange.mailboxEmail;
      const email = await this.graphClient
        .api(`/users/${targetMailbox}/messages/${emailId}`)
        .select('id,subject,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,internetMessageId,sender')
        .get();

      return email;
    } catch (error) {
      console.error(`Error fetching email details for ${emailId} from ${mailboxEmail || config.exchange.mailboxEmail}:`, error);
      throw error;
    }
  }

  async markAsRead(emailId, mailboxEmail = null) {
    try {
      const targetMailbox = mailboxEmail || config.exchange.mailboxEmail;
      await this.graphClient
        .api(`/users/${targetMailbox}/messages/${emailId}`)
        .patch({
          isRead: true
        });
    } catch (error) {
      console.error(`Error marking email ${emailId} as read in ${mailboxEmail || config.exchange.mailboxEmail}:`, error);
      throw error;
    }
  }

  extractTextFromEmail(email) {
    let text = email.subject || '';
    
    if (email.body) {
      if (email.body.contentType === 'html') {
        text += ' ' + this.stripHtml(email.body.content);
      } else {
        text += ' ' + email.body.content;
      }
    }

    return text.trim();
  }

  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 期間を指定してメールを取得するヘルパーメソッド
   * @param {Object} options - 期間指定オプション
   * @param {Date} options.startDate - 開始日時
   * @param {Date} options.endDate - 終了日時
   * @param {number} options.daysAgo - 指定日数前から現在まで
   * @param {number} options.hoursAgo - 指定時間前から現在まで
   * @returns {Promise<Array>} メール配列
   */
  async getEmailsByDateRange(options = {}) {
    const dateRange = this.buildDateRange(options);
    return await this.getEmails(null, dateRange);
  }

  /**
   * 全メールボックス（個人＋共有）からメールを取得
   * @param {Date} lastCheckDate - 最後のチェック日時
   * @param {Object} dateRange - 期間指定オブジェクト
   * @returns {Promise<Array>} 全メールボックスからのメール配列（メールボックス情報付き）
   */
  async getAllMailboxEmails(lastCheckDate = null, dateRange = null) {
    const allEmails = [];
    
    // 個人メールボックス
    try {
      const personalEmails = await this.getEmails(lastCheckDate, dateRange);
      personalEmails.forEach(email => {
        email.mailboxSource = config.exchange.mailboxEmail;
        allEmails.push(email);
      });
    } catch (error) {
      console.error(`Error fetching from personal mailbox ${config.exchange.mailboxEmail}:`, error);
    }

    // 共有メールボックス
    for (const sharedMailbox of config.exchange.sharedMailboxEmails) {
      try {
        const sharedEmails = await this.getEmails(lastCheckDate, dateRange, sharedMailbox);
        sharedEmails.forEach(email => {
          email.mailboxSource = sharedMailbox;
          allEmails.push(email);
        });
      } catch (error) {
        console.error(`Error fetching from shared mailbox ${sharedMailbox}:`, error);
      }
    }

    // 受信日時でソート
    allEmails.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));
    
    return allEmails;
  }

  /**
   * 日付範囲オブジェクトを構築するヘルパーメソッド
   * @param {Object} options - 期間指定オプション
   * @returns {Object} dateRangeオブジェクト
   */
  buildDateRange(options) {
    const now = new Date();
    let startDate = null;
    let endDate = null;

    if (options.startDate) {
      startDate = new Date(options.startDate);
    }

    if (options.endDate) {
      endDate = new Date(options.endDate);
    }

    if (options.daysAgo && !startDate) {
      startDate = new Date(now.getTime() - (options.daysAgo * 24 * 60 * 60 * 1000));
    }

    if (options.hoursAgo && !startDate) {
      startDate = new Date(now.getTime() - (options.hoursAgo * 60 * 60 * 1000));
    }

    return { startDate, endDate };
  }
}