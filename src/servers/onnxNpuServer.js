import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ONNXNPUServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.ONNX_NPU_PORT || 5834;
    this.modelPath = process.env.ONNX_MODEL_PATH || './models/phi-3-mini-4k-instruct.onnx';
    this.executionProviders = process.env.ONNX_EXECUTION_PROVIDERS?.split(',') || ['dml', 'cpu'];
    this.isModelLoaded = false;
    this.modelSession = null;
    this.tokenizer = null;
    this.modelConfig = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(cors());
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[ONNX-NPU] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // OpenAI互換チャット完了API
    this.app.post('/api/chat/completions', async (req, res) => {
      try {
        if (!this.isModelLoaded) {
          return res.status(503).json({ 
            error: { 
              message: 'Model not loaded yet. Please wait for initialization to complete.',
              type: 'model_not_ready' 
            } 
          });
        }

        const { 
          messages, 
          temperature = 0.7, 
          max_tokens = 512,
          stream = false 
        } = req.body;

        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({ 
            error: { 
              message: 'Invalid messages format. Expected array of message objects.',
              type: 'invalid_request' 
            } 
          });
        }

        console.log(`[ONNX-NPU] Processing ${messages.length} messages`);

        // シミュレーション（実際のONNX Runtimeロジックはここに実装）
        const response = await this.generateResponse(messages, { temperature, max_tokens });

        const result = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'phi-3-mini-npu',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: response.content
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: response.promptTokens,
            completion_tokens: response.completionTokens,
            total_tokens: response.promptTokens + response.completionTokens
          }
        };

        res.json(result);

      } catch (error) {
        console.error('[ONNX-NPU] API Error:', error);
        res.status(500).json({ 
          error: {
            message: error.message,
            type: 'internal_server_error'
          }
        });
      }
    });

    // ヘルスチェックエンドポイント
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        model_loaded: this.isModelLoaded,
        model_config: this.modelConfig,
        model_path: this.modelPath,
        execution_providers: this.executionProviders,
        port: this.port,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      });
    });

    // モデル情報エンドポイント
    this.app.get('/api/models', (req, res) => {
      const modelId = this.modelConfig?.name.toLowerCase().replace(/\s+/g, '-') || 'unknown-model';
      res.json({
        object: 'list',
        data: [{
          id: modelId,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'local-onnx-npu',
          model_config: this.modelConfig,
          execution_providers: this.executionProviders
        }]
      });
    });
  }

  async initializeModel() {
    try {
      console.log(`[ONNX-NPU] Initializing model: ${this.modelPath}`);
      console.log(`[ONNX-NPU] Execution providers: ${this.executionProviders.join(', ')}`);
      
      // モデル設定を検出
      this.detectModelConfig();
      
      // モデル初期化をシミュレート（実際のONNX Runtimeコードに置き換え）
      console.log(`[ONNX-NPU] Loading ${this.modelConfig.name} model...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.isModelLoaded = true;
      console.log(`[ONNX-NPU] ✅ ${this.modelConfig.name} model loaded successfully`);
      console.log(`[ONNX-NPU] 🔧 Model type: ${this.modelConfig.type}`);
      console.log(`[ONNX-NPU] 🌐 Language support: ${this.modelConfig.languages.join(', ')}`);
      console.log(`[ONNX-NPU] ⚡ Execution providers: ${this.executionProviders.join(', ')}`);
      
    } catch (error) {
      console.error('[ONNX-NPU] Model initialization failed:', error);
      throw error;
    }
  }

  detectModelConfig() {
    const modelName = this.modelPath.toLowerCase();
    
    if (modelName.includes('phi-3-mini')) {
      this.modelConfig = {
        name: 'Phi-3-Mini-4K-Instruct',
        type: 'chat',
        languages: ['en', 'ja', 'zh', 'ko'],
        maxTokens: 4096,
        promptFormat: 'phi3'
      };
    } else if (modelName.includes('phi-3-medium')) {
      this.modelConfig = {
        name: 'Phi-3-Medium-4K-Instruct',
        type: 'chat',
        languages: ['en', 'ja', 'zh', 'ko'],
        maxTokens: 4096,
        promptFormat: 'phi3'
      };
    } else if (modelName.includes('llama-2-7b')) {
      this.modelConfig = {
        name: 'Llama-2-7B-Chat',
        type: 'chat',
        languages: ['en', 'ja'],
        maxTokens: 2048,
        promptFormat: 'llama2'
      };
    } else if (modelName.includes('tinyllama')) {
      this.modelConfig = {
        name: 'TinyLlama-1.1B-Chat',
        type: 'chat',
        languages: ['en'],
        maxTokens: 2048,
        promptFormat: 'llama2'
      };
    } else {
      this.modelConfig = {
        name: 'Unknown Model',
        type: 'chat',
        languages: ['en'],
        maxTokens: 2048,
        promptFormat: 'generic'
      };
    }
  }

  async generateResponse(messages, options = {}) {
    try {
      // 実際のONNX Runtime推論ロジックに置き換える
      const prompt = this.formatMessages(messages);
      
      // シミュレーションレスポンス
      const simulatedResponse = this.getSimulatedResponse(messages);
      
      return {
        content: simulatedResponse,
        promptTokens: prompt.length / 4, // 大まかな推定
        completionTokens: simulatedResponse.length / 4
      };
      
    } catch (error) {
      console.error('[ONNX-NPU] Generation error:', error);
      throw error;
    }
  }

  formatMessages(messages) {
    const format = this.modelConfig?.promptFormat || 'phi3';
    
    switch (format) {
      case 'phi3':
        return this.formatPhi3Messages(messages);
      case 'llama2':
        return this.formatLlama2Messages(messages);
      default:
        return this.formatGenericMessages(messages);
    }
  }

  formatPhi3Messages(messages) {
    let prompt = '';
    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `<|system|>\n${message.content}<|end|>\n`;
      } else if (message.role === 'user') {
        prompt += `<|user|>\n${message.content}<|end|>\n`;
      } else if (message.role === 'assistant') {
        prompt += `<|assistant|>\n${message.content}<|end|>\n`;
      }
    }
    prompt += '<|assistant|>\n';
    return prompt;
  }

  formatLlama2Messages(messages) {
    let prompt = '';
    let systemMsg = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        systemMsg = message.content;
      } else if (message.role === 'user') {
        if (systemMsg) {
          prompt += `[INST] <<SYS>>\n${systemMsg}\n<</SYS>>\n\n${message.content} [/INST] `;
          systemMsg = '';
        } else {
          prompt += `[INST] ${message.content} [/INST] `;
        }
      } else if (message.role === 'assistant') {
        prompt += `${message.content} `;
      }
    }
    
    return prompt;
  }

  formatGenericMessages(messages) {
    let prompt = '';
    for (const message of messages) {
      prompt += `${message.role}: ${message.content}\n\n`;
    }
    prompt += 'assistant: ';
    return prompt;
  }

  getSimulatedResponse(messages) {
    const userMessage = messages[messages.length - 1];
    const content = userMessage.content.toLowerCase();

    // クレーム判定のシミュレーション
    if (content.includes('クレーム') || content.includes('判定')) {
      return JSON.stringify({
        isClaim: content.includes('困っている') || content.includes('問題') || content.includes('不満'),
        confidence: Math.floor(Math.random() * 40) + 60,
        category: content.includes('回答') ? 'answer quality' : 'other',
        severity: 'medium',
        reason: 'NPUによる高速クレーム判定を実行しました',
        keywords: ['NPU', '高速処理'],
        summary: 'ONNX Runtime NPUによる分析結果'
      }, null, 2);
    }

    return 'ONNX Runtime NPUサーバーが正常に動作しています。高速なローカル推論が可能です。';
  }

  async start() {
    try {
      console.log('[ONNX-NPU] Starting ONNX NPU Server...');
      
      // モデル初期化
      await this.initializeModel();
      
      // サーバー開始
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.port, (error) => {
          if (error) {
            reject(error);
            return;
          }
          
          console.log(`[ONNX-NPU] 🚀 Server running on http://localhost:${this.port}`);
          console.log(`[ONNX-NPU] 📊 Health check: http://localhost:${this.port}/health`);
          console.log(`[ONNX-NPU] 🤖 API endpoint: http://localhost:${this.port}/api/chat/completions`);
          resolve();
        });
      });
      
    } catch (error) {
      console.error('[ONNX-NPU] Failed to start server:', error);
      throw error;
    }
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        console.log('[ONNX-NPU] Shutting down server...');
        this.server.close(() => {
          console.log('[ONNX-NPU] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async healthCheck() {
    try {
      const response = await fetch(`http://localhost:${this.port}/health`);
      return await response.json();
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// スタンドアローン実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ONNXNPUServer();
  
  server.start().catch(error => {
    console.error('Failed to start ONNX NPU Server:', error);
    process.exit(1);
  });
  
  // グレースフルシャットダウン
  process.on('SIGINT', async () => {
    console.log('[ONNX-NPU] Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('[ONNX-NPU] Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}