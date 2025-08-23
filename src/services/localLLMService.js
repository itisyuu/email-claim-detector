import { ONNXNPUServer } from '../servers/onnxNpuServer.js';

export class LocalLLMService {
  constructor() {
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

  async analyzeEmailForClaim(emailContent, subject = '', sender = '', debug = false) {
    try {
      const prompt = this.buildClaimAnalysisPrompt(emailContent, subject, sender);
      
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
        console.log('\n🔧 ===== Local LLM DEBUG: リクエスト =====');
        console.log('📧 件名:', subject);
        console.log('👤 差出人:', sender);
        console.log('📝 メール本文:');
        console.log(emailContent.substring(0, 200) + (emailContent.length > 200 ? '...' : ''));
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

      const result = data.choices[0].message.content;
      const parsedResult = this.parseAnalysisResult(result, debug);

      if (debug) {
        console.log('\n🔧 ===== Local LLM DEBUG: 解析結果 =====');
        console.log('🎯 クレーム判定:', parsedResult.isClaim ? 'YES' : 'NO');
        console.log('📊 信頼度:', parsedResult.confidence + '%');
        console.log('🏷️ カテゴリ:', parsedResult.category);
        console.log('⚠️ 重要度:', parsedResult.severity);
        console.log('💡 判定理由:', parsedResult.reason);
        console.log('🔍 キーワード:', parsedResult.keywords.join(', ') || 'なし');
        console.log('📋 要約:', parsedResult.summary);
        
        if (parsedResult.parseError) {
          console.log('❌ パースエラー詳細:', parsedResult.parseError);
        }
        
        if (parsedResult.confidence === 0 && parsedResult.reason.includes('失敗')) {
          console.log('⚠️  注意: 解析失敗により、デフォルト値が使用されています');
        }
        
        console.log('=================================\n');
      }

      return parsedResult;

    } catch (error) {
      if (debug) {
        console.log('\n🔧 ===== Local LLM DEBUG: エラー =====');
        console.log('❌ エラータイプ:', error.constructor.name);
        console.log('❌ エラーメッセージ:', error.message);
        console.log('❌ エラースタック:', error.stack);
        console.log('==============================\n');
      }
      console.error('Error analyzing email with Local LLM:', error);
      throw error;
    }
  }

  buildClaimAnalysisPrompt(emailContent, subject, sender) {
    return `以下のメールを分析し、顧客からのクレームかどうかを判定してください。催促を受けている場合も、クレームとみなします。：

件名: ${subject}
差出人: ${sender}
本文:
${emailContent}

以下の形式でJSONレスポンスを返してください：
{
  "isClaim": boolean,
  "confidence": number (0-100),
  "category": string ("answer quality", "answer delay", "point less conversation", "communication", "other", "not_claim"),
  "severity": string ("low", "medium", "high"),
  "reason": string (判定理由),
  "keywords": array (クレーム判定に使用したキーワード),
  "summary": string (要約)
}

判定基準:
- 不満、苦情、問題の報告が含まれているか
- 解決や対応を求める内容か
- 否定的な感情表現があるか
- IT supportに対する批判的な内容があるか
- 改善要求があるか

キーワード例: 困っている、問題、不満、おかしい、間違い、対応、解決、返金、交換、苦情、クレーム、不具合、故障、未回答、遅延、催促`;
  }

  parseAnalysisResult(result, debug = false) {
    if (debug) {
      console.log('\n🔍 ===== Local LLM DEBUG: パース詳細 =====');
      console.log('📝 生レスポンス長:', result?.length || 0, '文字');
      console.log('📝 生レスポンス内容:');
      console.log('---始まり---');
      console.log(result);
      console.log('---終わり---');
    }

    if (!result || result.trim() === '') {
      if (debug) {
        console.log('❌ パースエラー: 空またはnullのレスポンス');
        console.log('=================================\n');
      }
      return {
        isClaim: false,
        confidence: 0,
        category: 'other',
        severity: 'medium',
        reason: 'Local LLMから空のレスポンスが返されました',
        keywords: [],
        summary: '',
        rawResponse: result,
        parseError: 'Empty or null response'
      };
    }

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (debug) {
        console.log('🔍 JSON正規表現マッチ:', jsonMatch ? '成功' : '失敗');
        if (jsonMatch) {
          console.log('📊 抽出されたJSON:');
          console.log(jsonMatch[0]);
        }
      }
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (debug) {
            console.log('✅ JSONパース: 成功');
            console.log('📊 パース後オブジェクト:', JSON.stringify(parsed, null, 2));
          }

          const validCategories = ["answer quality", "answer delay", "point less conversation", "communication", "other", "not_claim"];
          const validSeverities = ['low', 'medium', 'high'];
          
          if (debug) {
            console.log('🔍 フィールド検証:');
            console.log('  - isClaim:', typeof parsed.isClaim, parsed.isClaim);
            console.log('  - confidence:', typeof parsed.confidence, parsed.confidence);
            console.log('  - category:', typeof parsed.category, parsed.category, validCategories.includes(parsed.category) ? '✅' : '❌');
            console.log('  - severity:', typeof parsed.severity, parsed.severity, validSeverities.includes(parsed.severity) ? '✅' : '❌');
            console.log('  - reason:', typeof parsed.reason, parsed.reason?.length || 0, '文字');
            console.log('  - keywords:', Array.isArray(parsed.keywords) ? '✅配列' : '❌非配列', parsed.keywords?.length || 0, '個');
            console.log('  - summary:', typeof parsed.summary, parsed.summary?.length || 0, '文字');
          }
          
          const processedResult = {
            isClaim: Boolean(parsed.isClaim),
            confidence: Math.min(Math.max(parseInt(parsed.confidence) || 0, 0), 100),
            category: validCategories.includes(parsed.category) ? parsed.category : 'other',
            severity: validSeverities.includes(parsed.severity) ? parsed.severity : 'medium',
            reason: parsed.reason || '',
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
            summary: parsed.summary || '',
            rawResponse: result
          };

          if (debug) {
            console.log('✅ 最終処理結果:', JSON.stringify(processedResult, null, 2));
            console.log('=================================\n');
          }

          return processedResult;
        } catch (jsonParseError) {
          if (debug) {
            console.log('❌ JSONパース失敗:', jsonParseError.message);
            console.log('❌ パース対象文字列:', jsonMatch[0].substring(0, 500) + '...');
            console.log('=================================\n');
          }
          return {
            isClaim: false,
            confidence: 0,
            category: 'other',
            severity: 'medium',
            reason: `JSON解析エラー: ${jsonParseError.message}`,
            keywords: [],
            summary: '',
            rawResponse: result,
            parseError: `JSON parse failed: ${jsonParseError.message}`
          };
        }
      } else {
        if (debug) {
          console.log('❌ JSON構造が見つかりません');
          console.log('🔍 レスポンス形式チェック:');
          console.log('  - 中括弧の有無:', result.includes('{') && result.includes('}') ? '✅' : '❌');
          console.log('  - 改行文字数:', (result.match(/\n/g) || []).length);
          console.log('  - 特殊文字:', /[^\x20-\x7E]/.test(result) ? '含む' : '含まない');
          console.log('=================================\n');
        }
        return {
          isClaim: false,
          confidence: 0,
          category: 'other',
          severity: 'medium',
          reason: 'Local LLMレスポンスにJSON構造が見つかりませんでした',
          keywords: [],
          summary: '',
          rawResponse: result,
          parseError: 'No JSON structure found in response'
        };
      }
    } catch (parseError) {
      if (debug) {
        console.log('❌ パース処理全体でエラー:', parseError.message);
        console.log('❌ エラースタック:', parseError.stack);
        console.log('=================================\n');
      }
      console.error('Error parsing Local LLM response:', parseError);
      return {
        isClaim: false,
        confidence: 0,
        category: 'other',
        severity: 'medium',
        reason: `Local LLM応答の解析に失敗しました: ${parseError.message}`,
        keywords: [],
        summary: '',
        rawResponse: result,
        parseError: parseError.message
      };
    }
  }

  async generateClaimReport(claims) {
    if (claims.length === 0) {
      return 'クレームが検出されませんでした。';
    }

    const prompt = `以下のクレーム一覧から要約レポートを作成してください：

${claims.map((claim, index) => `
${index + 1}. 件名: ${claim.subject}
   カテゴリ: ${claim.category}
   重要度: ${claim.severity}
   要約: ${claim.summary}
   日時: ${claim.receivedDateTime}
`).join('\n')}

以下の形式でレポートを作成してください：
- 総件数と期間
- カテゴリ別集計
- 重要度別集計
- 主要な問題の傾向
- 対応が必要な優先案件`;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'クレーム分析レポートを作成する専門アシスタントです。日本語で簡潔で分かりやすいレポートを作成してください。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error generating claim report with Local LLM:', error);
      return 'レポート生成中にエラーが発生しました。';
    }
  }
}