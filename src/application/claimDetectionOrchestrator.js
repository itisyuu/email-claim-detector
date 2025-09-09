import { ExchangeService } from '../infrastructure/email/exchangeService.js';
import { OpenAIService } from '../infrastructure/ai/openaiService.js';
import { LocalLLMService } from '../infrastructure/ai/localLLMService.js';
import { Database } from '../infrastructure/database/database.js';
import fs from 'fs';
import path from 'path';

export class ClaimDetectionOrchestrator {
  constructor() {
    this.exchangeService = new ExchangeService();
    this.openaiService = new OpenAIService();
    this.localLLMService = new LocalLLMService();
    this.database = new Database();
    this.isRunning = false;
    this.exclusionList = null;
  }

  async initialize() {
    try {
      console.log('Initializing services...');
      
      await this.database.initialize();
      await this.exchangeService.initialize();
      this.openaiService.initialize();
      this.loadExclusionList();
      
      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Error initializing services:', error);
      throw error;
    }
  }

  async processEmails(options = {}) {
    if (this.isRunning) {
      console.log('Processing is already running, skipping...');
      return;
    }
    
    const debugMode = options.debug || false;
    const { days, hours, startDate, endDate, useLocalLLM, emailAddress, concurrency } = options;

    // Local LLM使用時はサーバーを自動起動
    if (useLocalLLM) {
      console.log('🤖 Local LLM mode detected, starting ONNX NPU Server...');
      const serverStarted = await this.localLLMService.startServer();
      if (!serverStarted) {
        throw new Error('Failed to start ONNX NPU Server');
      }
    }

    // 同時実行数の設定
    if (concurrency && !useLocalLLM) {
      this.openaiService.setConcurrentLimit(concurrency);
    } else if (concurrency) {
      console.log(`⚠️  Concurrency setting ignored in Local LLM mode (concurrency=${concurrency})`);
    }

    this.isRunning = true;
    const startTime = new Date();
    let emailsProcessed = 0;
    let claimsDetected = 0;
    let errors = null;

    try {
      console.log('Starting email processing...');

      let emails;
      if (emailAddress) {
        console.log(`Fetching emails from specific mailbox: ${emailAddress}`);
        if (days || hours || startDate || endDate) {
          const dateRangeOptions = {};
          
          if (days) dateRangeOptions.daysAgo = days;
          if (hours) dateRangeOptions.hoursAgo = hours;
          if (startDate) dateRangeOptions.startDate = startDate;
          if (endDate) dateRangeOptions.endDate = endDate;
          
          const dateRange = this.exchangeService.buildDateRange(dateRangeOptions);
          emails = await this.exchangeService.getEmails(null, dateRange, emailAddress);
        } else {
          const lastProcessingTime = await this.database.getLastProcessingTime();
          emails = await this.exchangeService.getEmails(lastProcessingTime, null, emailAddress);
        }
      } else if (days || hours || startDate || endDate) {
        const dateRangeOptions = {};
        
        if (days) dateRangeOptions.daysAgo = days;
        if (hours) dateRangeOptions.hoursAgo = hours;
        if (startDate) dateRangeOptions.startDate = startDate;
        if (endDate) dateRangeOptions.endDate = endDate;
        
        console.log('Using date range options:', dateRangeOptions);
        emails = await this.exchangeService.getEmailsByDateRange(dateRangeOptions);
      } else {
        const lastProcessingTime = await this.database.getLastProcessingTime();
        console.log('Last processing time:', lastProcessingTime);
        emails = await this.exchangeService.getEmails(lastProcessingTime);
      }
      
      console.log(`Retrieved ${emails.length} emails`);

      if (emails.length === 0) {
        console.log('No new emails to process');
        return { emailsProcessed: 0, claimsDetected: 0 };
      }

      // 同時実行処理と逐次処理の分岐
      if (!useLocalLLM && concurrency && concurrency > 1) {
        // Azure OpenAI の同時実行処理
        await this.processConcurrently(emails, options, debugMode, emailAddress);
      } else {
        // 従来の逐次処理（Local LLM または concurrency=1）
        await this.processSequentially(emails, options, debugMode, emailAddress);
      }

      // 処理されたメール数とクレーム数を計算
      emailsProcessed = await this.countProcessedEmails(startTime);
      claimsDetected = await this.countDetectedClaims(startTime);

    } catch (error) {
      console.error('Error in processEmails:', error);
      errors = error.message;
      throw error;
    } finally {
      const endTime = new Date();
      await this.database.logProcessingRun(
        startTime,
        endTime,
        emailsProcessed,
        claimsDetected,
        errors
      );

      this.isRunning = false;
      
      console.log(`Processing completed. Processed: ${emailsProcessed}, Claims detected: ${claimsDetected}`);
    }

    return { emailsProcessed, claimsDetected };
  }

  async getClaims(filters = {}) {
    try {
      const claims = await this.database.getClaims(filters);
      return claims.map(row => ({
        id: row.id,
        emailId: row.email_id,
        subject: row.subject,
        senderEmail: row.sender_email,
        senderName: row.sender_name,
        receivedDateTime: row.received_date_time,
        bodyContent: row.body_content,
        isClaim: Boolean(row.is_claim),
        confidence: row.confidence,
        category: row.category,
        severity: row.severity,
        reason: row.reason,
        keywords: JSON.parse(row.keywords || '[]'),
        summary: row.summary,
        analyzedAt: row.analyzed_at
      }));
    } catch (error) {
      console.error('Error getting claims:', error);
      throw error;
    }
  }

  async getClaimStats() {
    try {
      return await this.database.getClaimStats();
    } catch (error) {
      console.error('Error getting claim statistics:', error);
      throw error;
    }
  }

  async generateReport(useLocalLLM = false) {
    try {
      const claims = await this.getClaims({ limit: 100 });
      if (useLocalLLM) {
        console.log('Using Local LLM for report generation...');
        return await this.localLLMService.generateClaimReport(claims);
      } else {
        console.log('Using Azure OpenAI for report generation...');
        return await this.openaiService.generateClaimReport(claims);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  async getProcessedEmails(filters = {}) {
    try {
      return await this.database.getProcessedEmails(filters);
    } catch (error) {
      console.error('Error getting processed emails:', error);
      throw error;
    }
  }

  async getRecentProcessingLogs(limit = 10) {
    const query = `
      SELECT * FROM processing_log 
      ORDER BY run_started_at DESC 
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      this.database.db.all(query, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  loadExclusionList() {
    try {
      const exclusionPath = path.join(process.cwd(), 'src/config/exclusionList.json');
      if (fs.existsSync(exclusionPath)) {
        const exclusionData = fs.readFileSync(exclusionPath, 'utf8');
        this.exclusionList = JSON.parse(exclusionData);
        console.log('Exclusion list loaded successfully');
      } else {
        console.log('No exclusion list found, proceeding without filters');
        this.exclusionList = { excludeFromClaimDetection: { emails: [], domains: [], subjectPatterns: [] } };
      }
    } catch (error) {
      console.error('Error loading exclusion list:', error);
      this.exclusionList = { excludeFromClaimDetection: { emails: [], domains: [], subjectPatterns: [] } };
    }
  }

  shouldExcludeFromClaimDetection(senderEmail, subject) {
    if (!this.exclusionList || !this.exclusionList.excludeFromClaimDetection) {
      return false;
    }

    const { emails, domains, subjectPatterns } = this.exclusionList.excludeFromClaimDetection;
    
    if (emails.includes(senderEmail.toLowerCase())) {
      return true;
    }
    
    const domain = senderEmail.split('@')[1]?.toLowerCase();
    if (domain && domains.includes(domain)) {
      return true;
    }
    
    for (const pattern of subjectPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(subject)) {
          return true;
        }
      } catch (error) {
        console.warn(`Invalid regex pattern: ${pattern}`);
      }
    }
    
    return false;
  }

  /**
   * 同時実行でメールを処理
   */
  async processConcurrently(emails, options, debugMode, emailAddress) {
    console.log(`🔄 Processing ${emails.length} emails concurrently with Azure OpenAI...`);
    
    // 未処理メールのフィルタリング
    const unprocessedEmails = [];
    for (const email of emails) {
      const isProcessed = await this.database.isEmailProcessed(email.id);
      if (!isProcessed) {
        const emailDetails = await this.exchangeService.getEmailDetails(email.id, emailAddress || email.mailboxSource);
        const emailText = this.exchangeService.extractTextFromEmail(emailDetails);
        const senderEmail = emailDetails.from?.emailAddress?.address || '';
        const senderName = emailDetails.from?.emailAddress?.name || '';

        // メールをデータベースに保存
        emailDetails.bodyContent = emailText;
        const savedEmailId = await this.database.saveEmail(emailDetails);

        // 除外チェック
        if (this.shouldExcludeFromClaimDetection(senderEmail, emailDetails.subject)) {
          console.log(`Email from ${senderEmail} excluded from claim detection`);
          const excludedResult = {
            isClaim: false,
            confidence: 0,
            category: 'excluded',
            severity: 'none',
            reason: 'Email excluded from claim detection due to sender/subject filters',
            keywords: [],
            summary: 'Excluded from analysis'
          };
          await this.database.saveClaim(savedEmailId, excludedResult);
        } else if (emailText.trim()) {
          unprocessedEmails.push({
            id: savedEmailId,
            emailId: email.id,
            subject: emailDetails.subject,
            bodyContent: emailText,
            senderEmail: senderEmail,
            senderName: senderName
          });
        }
      }
    }

    if (unprocessedEmails.length === 0) {
      console.log('No unprocessed emails found for concurrent analysis');
      return;
    }

    // 同時実行で分析
    const analysisResults = await this.openaiService.analyzeEmailsConcurrently(unprocessedEmails, debugMode);
    
    // 結果をデータベースに保存
    for (const { emailId, result } of analysisResults) {
      await this.database.saveClaim(emailId, result);
      
      if (result.isClaim) {
        console.log(`CLAIM DETECTED - Confidence: ${result.confidence}%, Category: ${result.category}, Severity: ${result.severity}`);
        console.log(`Reason: ${result.reason}`);
        console.log(`Keywords: ${result.keywords.join(', ')}`);
        console.log(`Summary: ${result.summary}`);
        console.log('---');
      }
    }
  }

  /**
   * 逐次処理でメールを処理（従来の方法）
   */
  async processSequentially(emails, options, debugMode, emailAddress) {
    console.log(`🔄 Processing ${emails.length} emails sequentially...`);
    
    for (const email of emails) {
      try {
        const isProcessed = await this.database.isEmailProcessed(email.id);
        if (isProcessed) {
          console.log(`Email ${email.id} already processed, skipping...`);
          continue;
        }

        console.log(`Processing email: ${email.subject}`);
        
        const emailDetails = await this.exchangeService.getEmailDetails(email.id, emailAddress || email.mailboxSource);
        const emailText = this.exchangeService.extractTextFromEmail(emailDetails);
        
        const senderEmail = emailDetails.from?.emailAddress?.address || '';
        const senderName = emailDetails.from?.emailAddress?.name || '';

        emailDetails.bodyContent = emailText;
        const savedEmailId = await this.database.saveEmail(emailDetails);

        if (this.shouldExcludeFromClaimDetection(senderEmail, emailDetails.subject)) {
          console.log(`Email from ${senderEmail} excluded from claim detection (bulk/automated email)`);
          const excludedResult = {
            isClaim: false,
            confidence: 0,
            category: 'excluded',
            severity: 'none',
            reason: 'Email excluded from claim detection due to sender/subject filters',
            keywords: [],
            summary: 'Excluded from analysis'
          };
          await this.database.saveClaim(savedEmailId, excludedResult);
        } else if (emailText.trim()) {
          console.log(`Analyzing email for claims...`);
          let analysisResult;
          
          if (options.useLocalLLM) {
            console.log('Using Local LLM for analysis...');
            analysisResult = await this.localLLMService.analyzeEmailForClaim(
              emailText,
              emailDetails.subject,
              `${senderName} <${senderEmail}>`,
              debugMode
            );
          } else {
            console.log('Using Azure OpenAI for analysis...');
            analysisResult = await this.openaiService.analyzeEmailForClaim(
              emailText,
              emailDetails.subject,
              `${senderName} <${senderEmail}>`,
              debugMode
            );
          }

          await this.database.saveClaim(savedEmailId, analysisResult);

          if (analysisResult.isClaim) {
            console.log(`CLAIM DETECTED - Confidence: ${analysisResult.confidence}%, Category: ${analysisResult.category}, Severity: ${analysisResult.severity}`);
            console.log(`Reason: ${analysisResult.reason}`);
            console.log(`Keywords: ${analysisResult.keywords.join(', ')}`);
            console.log(`Summary: ${analysisResult.summary}`);
            console.log('---');
          } else {
            console.log(`No claim detected (Confidence: ${analysisResult.confidence}%)`);
          }
        }
        
        await this.delay(1000);

      } catch (emailError) {
        console.error(`Error processing email ${email.id}:`, emailError);
      }
    }
  }

  /**
   * 指定時間以降に処理されたメール数を取得
   */
  async countProcessedEmails(startTime) {
    const query = `
      SELECT COUNT(*) as count FROM emails 
      WHERE created_at >= ?
    `;
    
    return new Promise((resolve, reject) => {
      this.database.db.get(query, [startTime.toISOString()], (err, row) => {
        if (err) reject(err);
        else resolve(row.count || 0);
      });
    });
  }

  /**
   * 指定時間以降に検出されたクレーム数を取得
   */
  async countDetectedClaims(startTime) {
    const query = `
      SELECT COUNT(*) as count FROM claims c
      JOIN emails e ON c.email_id = e.id
      WHERE c.is_claim = 1 AND e.created_at >= ?
    `;
    
    return new Promise((resolve, reject) => {
      this.database.db.get(query, [startTime.toISOString()], (err, row) => {
        if (err) reject(err);
        else resolve(row.count || 0);
      });
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('Shutting down services...');
    
    // Local LLM サーバーを停止
    if (this.localLLMService) {
      await this.localLLMService.stopServer();
    }
    
    // データベースを閉じる
    if (this.database) {
      await this.database.close();
    }
    
    console.log('Services shut down successfully');
  }
}