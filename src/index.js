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

  await cli.start();
}

main().catch((error) => {
  console.error('❌ アプリケーション開始エラー:', error);
  process.exit(1);
});