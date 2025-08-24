#!/usr/bin/env node

import { CLI } from './cli.js';

async function main() {
  const cli = new CLI();
  
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 終了シグナルを受信しました...');
    await cli.exit();
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 終了シグナルを受信しました...');
    await cli.exit();
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ 未処理の例外:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未処理のPromise拒否:', reason);
    process.exit(1);
  });

  // コマンドライン引数がある場合は直接実行
  const args = process.argv.slice(2);
  if (args.length > 0) {
    await cli.startWithCommand(args);
  } else {
    await cli.start();
  }
}

main().catch((error) => {
  console.error('❌ アプリケーション開始エラー:', error);
  process.exit(1);
});