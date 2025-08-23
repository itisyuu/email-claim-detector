import sqlite3 from 'sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../../config/config.js';

export class Database {
  constructor() {
    this.db = null;
    this.dbPath = config.database.path;
  }

  async initialize() {
    try {
      await this.ensureDirectoryExists();
      
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          throw err;
        }
      });

      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  async ensureDirectoryExists() {
    const dir = path.dirname(this.dbPath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async createTables() {
    const createEmailsTable = `
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id TEXT UNIQUE NOT NULL,
        internet_message_id TEXT,
        subject TEXT,
        sender_email TEXT,
        sender_name TEXT,
        received_date_time DATETIME,
        body_content TEXT,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createClaimsTable = `
      CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER,
        is_claim BOOLEAN NOT NULL,
        confidence INTEGER,
        category TEXT,
        severity TEXT,
        reason TEXT,
        keywords TEXT,
        summary TEXT,
        raw_response TEXT,
        analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (email_id) REFERENCES emails (id)
      )
    `;

    const createProcessingLogTable = `
      CREATE TABLE IF NOT EXISTS processing_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_started_at DATETIME,
        run_completed_at DATETIME,
        emails_processed INTEGER,
        claims_detected INTEGER,
        errors TEXT,
        status TEXT
      )
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_emails_received_date ON emails(received_date_time);
      CREATE INDEX IF NOT EXISTS idx_emails_email_id ON emails(email_id);
      CREATE INDEX IF NOT EXISTS idx_claims_is_claim ON claims(is_claim);
      CREATE INDEX IF NOT EXISTS idx_claims_severity ON claims(severity);
    `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createEmailsTable);
        this.db.run(createClaimsTable);
        this.db.run(createProcessingLogTable);
        this.db.run(createIndexes, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async saveEmail(email) {
    const query = `
      INSERT OR IGNORE INTO emails (
        email_id, internet_message_id, subject, sender_email, sender_name,
        received_date_time, body_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const senderEmail = email.from?.emailAddress?.address || '';
    const senderName = email.from?.emailAddress?.name || '';

    return new Promise((resolve, reject) => {
      this.db.run(query, [
        email.id,
        email.internetMessageId,
        email.subject,
        senderEmail,
        senderName,
        email.receivedDateTime,
        email.bodyContent || ''
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async saveClaim(emailId, analysisResult) {
    const query = `
      INSERT INTO claims (
        email_id, is_claim, confidence, category, severity,
        reason, keywords, summary, raw_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const keywords = JSON.stringify(analysisResult.keywords);

    return new Promise((resolve, reject) => {
      this.db.run(query, [
        emailId,
        analysisResult.isClaim,
        analysisResult.confidence,
        analysisResult.category,
        analysisResult.severity,
        analysisResult.reason,
        keywords,
        analysisResult.summary,
        analysisResult.rawResponse
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getProcessedEmails(filters = {}) {
    let query = `
      SELECT e.*, c.is_claim, c.confidence, c.category, c.severity 
      FROM emails e
      LEFT JOIN claims c ON e.id = c.email_id
      WHERE 1=1
    `;
    
    const params = [];

    if (filters.dateFrom) {
      query += ' AND e.received_date_time >= ?';
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ' AND e.received_date_time <= ?';
      params.push(filters.dateTo);
    }

    if (filters.sender) {
      query += ' AND (e.sender_email LIKE ? OR e.sender_name LIKE ?)';
      params.push(`%${filters.sender}%`);
      params.push(`%${filters.sender}%`);
    }

    query += ' ORDER BY e.received_date_time DESC';

    const limit = filters.limit || 50;
    query += ' LIMIT ?';
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getClaims(filters = {}) {
    let query = `
      SELECT e.*, c.* FROM emails e
      INNER JOIN claims c ON e.id = c.email_id
      WHERE c.is_claim = 1
    `;
    
    const params = [];

    if (filters.category) {
      query += ' AND c.category = ?';
      params.push(filters.category);
    }

    if (filters.severity) {
      query += ' AND c.severity = ?';
      params.push(filters.severity);
    }

    if (filters.dateFrom) {
      query += ' AND e.received_date_time >= ?';
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ' AND e.received_date_time <= ?';
      params.push(filters.dateTo);
    }

    if (filters.confidence) {
      query += ' AND c.confidence >= ?';
      params.push(filters.confidence);
    }

    query += ' ORDER BY e.received_date_time DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getClaimStats() {
    const queries = {
      totalClaims: 'SELECT COUNT(*) as count FROM claims WHERE is_claim = 1',
      totalEmails: 'SELECT COUNT(*) as count FROM emails',
      claimsByCategory: `
        SELECT category, COUNT(*) as count 
        FROM claims 
        WHERE is_claim = 1 
        GROUP BY category
      `,
      claimsBySeverity: `
        SELECT severity, COUNT(*) as count 
        FROM claims 
        WHERE is_claim = 1 
        GROUP BY severity
      `,
      recentClaims: `
        SELECT COUNT(*) as count 
        FROM claims c
        INNER JOIN emails e ON c.email_id = e.id
        WHERE c.is_claim = 1 
        AND e.received_date_time >= datetime('now', '-7 days')
      `
    };

    const results = {};

    for (const [key, query] of Object.entries(queries)) {
      results[key] = await new Promise((resolve, reject) => {
        this.db.all(query, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    return results;
  }

  async logProcessingRun(startTime, endTime, emailsProcessed, claimsDetected, errors = null) {
    const query = `
      INSERT INTO processing_log (
        run_started_at, run_completed_at, emails_processed, 
        claims_detected, errors, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const status = errors ? 'error' : 'success';

    return new Promise((resolve, reject) => {
      this.db.run(query, [
        startTime,
        endTime,
        emailsProcessed,
        claimsDetected,
        errors,
        status
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getLastProcessingTime() {
    const query = `
      SELECT run_completed_at 
      FROM processing_log 
      WHERE status = 'success'
      ORDER BY run_completed_at DESC 
      LIMIT 1
    `;

    return new Promise((resolve, reject) => {
      this.db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row ? new Date(row.run_completed_at) : null);
      });
    });
  }

  async isEmailProcessed(emailId) {
    const query = 'SELECT 1 FROM emails WHERE email_id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.get(query, [emailId], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}