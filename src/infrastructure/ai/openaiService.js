import OpenAI from 'openai';
import { config } from '../../config/config.js';
import { BaseAIService } from './baseAIService.js';

export class OpenAIService extends BaseAIService {
  constructor() {
    super();
    this.client = null;
  }

  initialize() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: `${config.openai.endpoint}/openai/deployments/${config.openai.deploymentName}`,
      defaultQuery: { 'api-version': '2024-02-15-preview' },
      defaultHeaders: {
        'api-key': config.openai.apiKey,
      },
    });
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
      max_completion_tokens: 2000,
      temperature: 1,
    };

    if (debug) {
      console.log('\n🤖 AOAIへのリクエスト:');
      console.log('エンドポイント:', `${config.openai.endpoint}/openai/deployments/${config.openai.deploymentName}`);
      console.log('リクエストペイロード:', JSON.stringify(requestPayload, null, 2));
      console.log('================================\n');
    }
    
    const response = await this.client.chat.completions.create(requestPayload);

    if (debug) {
      console.log('\n🔧 ===== AOAI DEBUG: レスポンス =====');
      console.log('📊 レスポンス統計:');
      console.log('- プロンプトトークン数:', response.usage?.prompt_tokens || 'N/A');
      console.log('- 完了トークン数:', response.usage?.completion_tokens || 'N/A');
      console.log('- 総トークン数:', response.usage?.total_tokens || 'N/A');
      console.log('- モデル:', response.model || 'N/A');
      console.log('- 作成時間:', response.created || 'N/A');
      console.log('- レスポンスID:', response.id || 'N/A');
      console.log('- choices配列長:', response.choices?.length || 0);
      
      if (!response.choices || response.choices.length === 0) {
        console.log('❌ 警告: choices配列が空またはundefined');
      } else {
        console.log('- 選択されたchoiceのindex:', 0);
        console.log('- choice.finish_reason:', response.choices[0].finish_reason || 'N/A');
        console.log('- choice.message.role:', response.choices[0].message?.role || 'N/A');
        console.log('- choice.message.content長:', response.choices[0].message?.content?.length || 0);
      }
      
      console.log('\n💬 AOAIからの生レスポンス:');
      const content = response.choices[0].message.content;
      if (!content) {
        console.log('❌ 警告: メッセージコンテンツがnullまたはundefined');
      } else if (content.trim() === '') {
        console.log('❌ 警告: メッセージコンテンツが空文字列');
      } else {
        console.log(content);
      }
      console.log('===================================\n');
    }

    return response.choices[0].message.content;
  }

  getServiceName() {
    return 'Azure OpenAI';
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
      console.log('\n🔍 ===== AOAI DEBUG: パース詳細 =====');
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
        reason: 'Azure OpenAIから空のレスポンスが返されました',
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
          reason: 'Azure OpenAIレスポンスにJSON構造が見つかりませんでした',
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
      console.error('Error parsing Azure OpenAI response:', parseError);
      return {
        isClaim: false,
        confidence: 0,
        category: 'other',
        severity: 'medium',
        reason: `Azure OpenAI応答の解析に失敗しました: ${parseError.message}`,
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
      const response = await this.client.chat.completions.create({
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
        max_completion_tokens: 2000,
        temperature: 1,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating claim report with Azure OpenAI:', error);
      return 'レポート生成中にエラーが発生しました。';
    }
  }
}