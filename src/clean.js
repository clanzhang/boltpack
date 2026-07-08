import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const PARCEL_CACHE_DIR = '.parcel-cache';

export function clean({ outDir = 'dist' } = {}) {
  const cacheDir = path.resolve(process.cwd(), PARCEL_CACHE_DIR);
  const distDir = path.resolve(process.cwd(), outDir);

  const removed = [];

  try {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      removed.push('.parcel-cache');
    }
  } catch (err) {
    // 静默忽略删除错误，保证命令始终安全
  }

  try {
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
      removed.push(outDir);
    }
  } catch (err) {
    // 静默忽略删除错误
  }

  if (removed.length > 0) {
    console.log(
      chalk.green.bold(`✨ 缓存与产物已彻底清理，你的项目现在清爽无比！`)
    );
    removed.forEach(item => {
      console.log(chalk.gray(`   - ${item}`));
    });
  } else {
    console.log(chalk.gray('✨ 项目本来就很干净，无事可做～'));
  }
}

export function cleanOutDir(outDir) {
  const distDir = path.resolve(process.cwd(), outDir);
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log(chalk.gray('🧹 已清空历史构建产物'));
  } catch (err) {
    // 静默忽略
  }
}
