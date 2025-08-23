import { ONNXNPUServer } from '../../servers/onnxNpuServer.js';
import { BaseAIService } from './baseAIService.js';

export class LocalLLMService extends BaseAIService {
  constructor() {
    super();
    this.endpoint = 'http://localhost:5834/api/chat/completions';
    this.onnxServer = null;
    this.isServerManaged = false;
  }

  async startServer() {
    try {
      // サーバーが既に起動しているかチェック
      const healthCheck = await this.checkServerHealth();
      if (healthCheck.status === 'ok') {
        console.log('🟢 ONNX NPU Server is already running');
        return true;
      }

      console.log('🔵 Starting ONNX NPU Server...');
      this.onnxServer = new ONNXNPUServer();
      await this.onnxServer.start();
      this.isServerManaged = true;
      
      // サーバー起動確認
      await this.waitForServer();
      console.log('✅ ONNX NPU Server started successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to start ONNX NPU Server:', error);
      return false;
    }
  }

  async stopServer() {
    if (this.onnxServer && this.isServerManaged) {
      console.log('🔴 Stopping ONNX NPU Server...');
      await this.onnxServer.stop();
      this.onnxServer = null;
      this.isServerManaged = false;
      console.log('✅ ONNX NPU Server stopped');
    }
  }

  async checkServerHealth() {
    try {
      const response = await fetch(`http://localhost:5834/health`, {
        method: 'GET',
        timeout: 5000
      });
      return await response.json();
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async waitForServer(maxRetries = 30, intervalMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      const health = await this.checkServerHealth();
      if (health.status === 'ok' && health.model_loaded) {
        return true;
      }
      console.log(`⏳ Waiting for server... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Server failed to start within timeout period');
  }

  async callAI(prompt, debug = false) {
    const requestPayload = {
      messages: [
        {
          role: 'system',
          content: 'あなたは情シス部門がユーザから受けるメールがクレームかどうかを判定する専門のAIアシスタントです。日本語で回答してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      stream: false
    };

    if (debug) {
      console.log('\n🤖 Local LLMへのリクエスト:');
      console.log('エンドポイント:', this.endpoint);
      console.log('リクエストペイロード:', JSON.stringify(requestPayload, null, 2));
      console.log('================================\n');
    }
    
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (debug) {
      console.log('\n🔧 ===== Local LLM DEBUG: レスポンス =====');
      console.log('📊 レスポンス統計:');
      console.log('- プロンプトトークン数:', data.usage?.prompt_tokens || 'N/A');
      console.log('- 完了トークン数:', data.usage?.completion_tokens || 'N/A');
      console.log('- 総トークン数:', data.usage?.total_tokens || 'N/A');
      console.log('- モデル:', data.model || 'N/A');
      console.log('- 作成時間:', data.created || 'N/A');
      console.log('- レスポンスID:', data.id || 'N/A');
      console.log('- choices配列長:', data.choices?.length || 0);
      
      if (!data.choices || data.choices.length === 0) {
        console.log('❌ 警告: choices配列が空またはundefined');
      } else {
        console.log('- 選択されたchoiceのindex:', 0);
        console.log('- choice.finish_reason:', data.choices[0].finish_reason || 'N/A');
        console.log('- choice.message.role:', data.choices[0].message?.role || 'N/A');
        console.log('- choice.message.content長:', data.choices[0].message?.content?.length || 0);
      }
      
      console.log('\n💬 Local LLMからの生レスポンス:');
      const content = data.choices[0].message.content;
      if (!content) {
        console.log('❌ 警告: メッセージコンテンツがnullまたはundefined');
      } else if (content.trim() === '') {
        console.log('❌ 警告: メッセージコンテンツが空文字列');
      } else {
        console.log(content);
      }
      console.log('===================================\n');
    }

    return data.choices[0].message.content;
  }

  getServiceName() {
    return 'Local LLM';
  }
}