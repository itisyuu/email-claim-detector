export class ClaimFormatter {
  static formatClaimsTable(claims) {
    if (claims.length === 0) {
      return 'クレームが見つかりませんでした。';
    }

    const headers = ['日時', '差出人', '件名', 'カテゴリ', '重要度', '信頼度', '要約'];
    const separator = headers.map(h => '-'.repeat(Math.max(h.length, 10))).join(' | ');
    const headerRow = headers.map(h => h.padEnd(Math.max(h.length, 10))).join(' | ');

    let output = `\n${headerRow}\n${separator}\n`;

    claims.forEach(claim => {
      const date = new Date(claim.receivedDateTime).toLocaleString('ja-JP');
      const sender = `${claim.senderName} <${claim.senderEmail}>`.substring(0, 30);
      const subject = (claim.subject || '').substring(0, 40);
      const summary = (claim.summary || '').substring(0, 50);

      const row = [
        date.padEnd(20),
        sender.padEnd(30),
        subject.padEnd(40),
        (claim.category || '').padEnd(10),
        (claim.severity || '').padEnd(10),
        `${claim.confidence}%`.padEnd(10),
        summary.padEnd(50)
      ].join(' | ');

      output += `${row}\n`;
    });

    return output;
  }

  static formatClaimDetails(claim) {
    const date = new Date(claim.receivedDateTime).toLocaleString('ja-JP');
    
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 クレーム詳細
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 受信日時: ${date}
👤 差出人: ${claim.senderName} <${claim.senderEmail}>
📋 件名: ${claim.subject}

🏷️ カテゴリ: ${claim.category}
⚠️ 重要度: ${claim.severity}
📊 信頼度: ${claim.confidence}%

💭 要約:
${claim.summary}

🔍 判定理由:
${claim.reason}

🔑 検出キーワード:
${claim.keywords.join(', ')}

📄 本文:
${claim.bodyContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  static formatStats(stats) {
    const total = stats.totalClaims?.[0]?.count || 0;
    const totalEmails = stats.totalEmails?.[0]?.count || 0;
    const recent = stats.recentClaims?.[0]?.count || 0;

    let output = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 クレーム統計
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 総メール数: ${totalEmails}
🚨 総クレーム数: ${total}
📈 検出率: ${totalEmails > 0 ? ((total / totalEmails) * 100).toFixed(1) : 0}%
🕐 過去7日間のクレーム: ${recent}

📊 カテゴリ別:
`;

    if (stats.claimsByCategory && stats.claimsByCategory.length > 0) {
      stats.claimsByCategory.forEach(cat => {
        output += `  • ${cat.category}: ${cat.count}件\n`;
      });
    } else {
      output += '  データなし\n';
    }

    output += '\n⚠️ 重要度別:\n';
    if (stats.claimsBySeverity && stats.claimsBySeverity.length > 0) {
      stats.claimsBySeverity.forEach(sev => {
        const icon = sev.severity === 'high' ? '🔴' : sev.severity === 'medium' ? '🟡' : '🟢';
        output += `  ${icon} ${sev.severity}: ${sev.count}件\n`;
      });
    } else {
      output += '  データなし\n';
    }

    output += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    return output;
  }

  static formatProcessingLog(logs) {
    if (logs.length === 0) {
      return '処理ログが見つかりませんでした。';
    }

    const headers = ['開始時刻', '終了時刻', 'メール数', 'クレーム数', 'ステータス'];
    const separator = headers.map(() => '-'.repeat(15)).join(' | ');
    const headerRow = headers.map(h => h.padEnd(15)).join(' | ');

    let output = `\n${headerRow}\n${separator}\n`;

    logs.forEach(log => {
      const startTime = new Date(log.run_started_at).toLocaleString('ja-JP');
      const endTime = log.run_completed_at ? new Date(log.run_completed_at).toLocaleString('ja-JP') : '実行中';
      const status = log.status === 'success' ? '✅ 成功' : '❌ エラー';

      const row = [
        startTime.padEnd(15),
        endTime.padEnd(15),
        String(log.emails_processed || 0).padEnd(15),
        String(log.claims_detected || 0).padEnd(15),
        status.padEnd(15)
      ].join(' | ');

      output += `${row}\n`;

      if (log.errors) {
        output += `  エラー: ${log.errors}\n`;
      }
    });

    return output;
  }

  static showMenu() {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 メールクレーム検知システム
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

コマンド一覧:
  1️⃣  process     - メールを処理してクレームを検知
  2️⃣  claims      - 検出されたクレーム一覧を表示
  3️⃣  stats       - クレーム統計を表示
  4️⃣  report      - AIによるクレームレポートを生成
  5️⃣  logs        - 処理ログを表示
  6️⃣  history     - 処理済みメール履歴を表示
  7️⃣  help        - このヘルプを表示
  8️⃣  exit        - アプリケーションを終了

processコマンドのオプション:
  process --debug / process -d       - デバッグモードでメール処理を実行
  process --email-address=test@example.com / process -email test@example.com
                                     - 指定メールボックスからのみメール取得
  process --days=7                   - 過去7日間のメールを処理
  process --hours=24                 - 過去24時間のメールを処理
  process --from=2025-08-20          - 指定日時以降のメールを処理
  process --to=2025-08-22            - 指定日時までのメールを処理
  process --from=2025-08-20 --to=2025-08-22  - 期間指定でメールを処理

フィルター例:
  claims --category=product      - 商品関連のクレーム
  claims --severity=high         - 重要度の高いクレーム
  claims --confidence=80         - 信頼度80%以上のクレーム
  claims --limit=10              - 最新10件のクレーム
  
  history --limit=20             - 最新20件のメール履歴
  history --sender=example.com   - 指定送信者のメール履歴
  history --date-from=2024-01-01 - 指定日以降のメール履歴

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  static formatEmailHistoryTable(emails) {
    if (emails.length === 0) {
      return '処理済みメールが見つかりませんでした。';
    }

    const headers = ['日時', '差出人', '件名', 'クレーム判定', '処理日時'];
    const separator = headers.map(h => '-'.repeat(Math.max(h.length, 15))).join(' | ');
    const headerRow = headers.map(h => h.padEnd(Math.max(h.length, 15))).join(' | ');

    let output = `\n${headerRow}\n${separator}\n`;

    emails.forEach(email => {
      const receivedDate = new Date(email.received_date_time).toLocaleString('ja-JP');
      const sender = `${email.sender_name || ''} <${email.sender_email || ''}>`.substring(0, 30);
      const subject = (email.subject || '無題').substring(0, 40);
      const claimStatus = email.is_claim ? 
        `🚨 クレーム (${email.confidence}%)` : 
        '✅ 正常';
      const processedAt = new Date(email.processed_at).toLocaleString('ja-JP');

      const row = [
        receivedDate.padEnd(20),
        sender.padEnd(30),
        subject.padEnd(40),
        claimStatus.padEnd(20),
        processedAt.padEnd(20)
      ].join(' | ');

      output += `${row}\n`;
    });

    return output;
  }

  static showWelcome() {
    return `
🚀 メールクレーム検知システムを開始しました
📧 Exchange Online からメールを取得し、Azure OpenAI でクレームを検知します

'help' と入力してコマンド一覧を表示
'process' と入力してメール処理を開始
`;
  }
}