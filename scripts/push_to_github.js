// scripts/push_to_github.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OWNER = 'youyouboydragonOfficial';
const REPO = 'ballistics-combat-framework';

// gh auth token からトークン取得
const token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
const headers = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Node-GitHub-Uploader'
};

async function api(endpoint, method = 'GET', body = null) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}${endpoint}`;
  const options = {
    method,
    headers: { ...headers }
  };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API Error [${method} ${endpoint}]: ${res.status} ${text}`);
  }
  return res.json();
}

function getAllFiles(dir, baseDir = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === 'dist' || file === '.git' || file === '.system_generated') {
      continue;
    }
    const fullPath = path.join(dir, file);
    const relPath = path.join(baseDir, file).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

async function run() {
  console.log(`🚀 GitHubリポジトリ [${OWNER}/${REPO}] へのコードプッシュを開始します...`);

  // 1. 空リポジトリかどうかチェック
  let isEmpty = false;
  let parentCommitSha = null;
  try {
    const refRes = await api('/git/refs/heads/main');
    parentCommitSha = refRes.object.sha;
  } catch (e) {
    isEmpty = true;
  }

  // 空の場合は README.md を Contents API で作成してリポジトリを初期化
  if (isEmpty) {
    console.log('🌱 空リポジトリを検出。README.md を Contents API で初期コミットします...');
    const readmeContent = fs.readFileSync('README.md', 'utf-8');
    const initRes = await api('/contents/README.md', 'PUT', {
      message: 'chore: initial commit',
      content: Buffer.from(readmeContent).toString('base64')
    });
    parentCommitSha = initRes.commit.sha;
    console.log(`  ✓ 初期コミット完了 (SHA: ${parentCommitSha})`);
  }

  const files = getAllFiles('.');
  console.log(`📁 送信対象ファイル数: ${files.length} 件`);

  // 2. 各ファイルの Blob を作成
  const treeItems = [];
  for (const f of files) {
    const content = fs.readFileSync(f.fullPath);
    const base64Content = content.toString('base64');
    const blobRes = await api('/git/blobs', 'POST', {
      content: base64Content,
      encoding: 'base64'
    });

    treeItems.push({
      path: f.relPath,
      mode: '100644',
      type: 'blob',
      sha: blobRes.sha
    });
    console.log(`  ✓ Blob created: ${f.relPath}`);
  }

  // 3. Tree の作成
  console.log('🌲 Git Tree を作成中...');
  const treeRes = await api('/git/trees', 'POST', {
    tree: treeItems
  });
  console.log(`  ✓ Tree SHA: ${treeRes.sha}`);

  // 4. Commit の作成
  console.log('📝 Git Commit を作成中...');
  const commitPayload = {
    message: 'feat: Complete modular combat, ballistics, and aim framework',
    tree: treeRes.sha,
    parents: [parentCommitSha]
  };
  const commitRes = await api('/git/commits', 'POST', commitPayload);
  console.log(`  ✓ Commit SHA: ${commitRes.sha}`);

  // 5. main ブランチの更新
  console.log('🔗 main ブランチの Ref を更新中...');
  await api('/git/refs/heads/main', 'PATCH', {
    sha: commitRes.sha,
    force: true
  });

  console.log(`\n🎉 成功！すべてのコードがリポジトリにプッシュされました:`);
  console.log(`👉 https://github.com/${OWNER}/${REPO}`);
}

run().catch((err) => {
  console.error('❌ プッシュ処理中にエラーが発生しました:', err);
  process.exit(1);
});
