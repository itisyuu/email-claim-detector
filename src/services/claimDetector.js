import { ExchangeService } from './exchangeService.js';
import { OpenAIService } from './openaiService.js';
import { Database } from '../models/database.js';

export class ClaimDetector {
  constructor() {
    this.exchangeService = new ExchangeService();
    this.openaiService = new OpenAIService();
    this.database = new Database();
    this.isRunning = false;
  }

  async initialize() {
    try {
      console.log('Initializing services...');
      
      await this.database.initialize();
      await this.exchangeService.initialize();
      this.openaiService.initialize();
      
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

    this.isRunning = true;
    const startTime = new Date();
    let emailsProcessed = 0;
    let claimsDetected = 0;
    let errors = null;

    try {
      console.log('Starting email processing...');

      const lastProcessingTime = await this.database.getLastProcessingTime();
      console.log('Last processing time:', lastProcessingTime);

      const emails = await this.exchangeService.getEmails(lastProcessingTime);
      console.log(`Retrieved ${emails.length} emails`);

      if (emails.length === 0) {
        console.log('No new emails to process');
        return { emailsProcessed: 0, claimsDetected: 0 };
      }

      for (const email of emails) {
        try {
          const isProcessed = await this.database.isEmailProcessed(email.id);
          if (isProcessed) {
            console.log(`Email ${email.id} already processed, skipping...`);
            continue;
          }

          console.log(`Processing email: ${email.subject}`);
          
          const emailDetails = await this.exchangeService.getEmailDetails(email.id);
          const emailText = this.exchangeService.extractTextFromEmail(emailDetails);
          
          const senderEmail = emailDetails.from?.emailAddress?.address || '';
          const senderName = emailDetails.from?.emailAddress?.name || '';

          emailDetails.bodyContent = emailText;
          const savedEmailId = await this.database.saveEmail(emailDetails);

          if (emailText.trim()) {
            console.log(`Analyzing email for claims...`);
            const analysisResult = await this.openaiService.analyzeEmailForClaim(
              emailText,
              emailDetails.subject,
              `${senderName} <${senderEmail}>`,
              debugMode
            );

            await this.database.saveClaim(savedEmailId, analysisResult);

            if (analysisResult.isClaim) {
              claimsDetected++;
              console.log(`CLAIM DETECTED - Confidence: ${analysisResult.confidence}%, Category: ${analysisResult.category}, Severity: ${analysisResult.severity}`);
              console.log(`Reason: ${analysisResult.reason}`);
              console.log(`Keywords: ${analysisResult.keywords.join(', ')}`);
              console.log(`Summary: ${analysisResult.summary}`);
              console.log('---');
            } else {
              console.log(`No claim detected (Confidence: ${analysisResult.confidence}%)`);
            }
          }

          emailsProcessed++;
          
          await this.delay(1000);

        } catch (emailError) {
          console.error(`Error processing email ${email.id}:`, emailError);
          errors = errors ? `${errors}; ${emailError.message}` : emailError.message;
        }
      }

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

  async generateReport() {
    try {
      const claims = await this.getClaims({ limit: 100 });
      return await this.openaiService.generateClaimReport(claims);
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('Shutting down services...');
    if (this.database) {
      await this.database.close();
    }
    console.log('Services shut down successfully');
  }
}