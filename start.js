// start.js - 開発サーバー & WebSocketマルチプレイサーバー同時起動スクリプト
import { spawn } from 'child_process';
import os from 'os';

console.log('================================================================');
console.log('🚀 汎用弾道・戦闘・エイムシステム (Combat & Ballistics App)');
console.log('================================================================');

const isWin = os.platform() === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

// 1. WebSocketマルチプレイサーバー起動
console.log('[1/2] マルチプレイWebSocketサーバー (Port: 8080) を起動中...');
const serverProc = spawn(npxCmd, ['tsx', 'server/server.ts'], {
  stdio: 'inherit',
  shell: true
});

// 2. フロントエンドViteサーバー起動
console.log('[2/2] フロントエンドViteサーバー (Port: 3000) を起動中...');
const viteProc = spawn(npxCmd, ['vite', '--port', '3000', '--host'], {
  stdio: 'inherit',
  shell: true
});

console.log('\n🎮 ブラウザで以下のURLを開いてください:');
console.log('👉 http://localhost:3000/\n');

const cleanup = () => {
  console.log('\n🛑 サーバーを停止中...');
  serverProc.kill();
  viteProc.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
