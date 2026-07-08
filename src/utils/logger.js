import pc from 'picocolors';

const ICON = {
  info: pc.dim('·'),
  success: pc.green('✓'),
  error: pc.red('✗'),
  warn: pc.yellow('!'),
  step: pc.dim('→'),
};

const blank = () => console.log('');

export const logger = {
  raw(message = '') {
    console.log(message);
  },
  blank,
  intro(title) {
    blank();
    console.log(pc.bold(pc.dim('─'.repeat(Math.min(48, process.stdout.columns || 48)))));
    console.log(pc.bold(`  ${title}`));
    console.log(pc.bold(pc.dim('─'.repeat(Math.min(48, process.stdout.columns || 48)))));
    blank();
  },
  outro(message = '') {
    blank();
    if (message) console.log(pc.dim(message));
    console.log(pc.bold(pc.dim('─'.repeat(Math.min(48, process.stdout.columns || 48)))));
    blank();
  },
  section(label) {
    blank();
    console.log(pc.dim(pc.bold(label.toUpperCase())));
  },
  info(message) {
    console.log(`  ${ICON.info} ${pc.dim(message)}`);
  },
  step(message) {
    console.log(`  ${ICON.step} ${message}`);
  },
  success(message) {
    console.log(`  ${ICON.success} ${pc.green(message)}`);
  },
  warn(message) {
    console.log(`  ${ICON.warn} ${pc.yellow(message)}`);
  },
  error(message) {
    console.error(`  ${ICON.error} ${pc.red(message)}`);
  },
  detail(message) {
    console.log(`    ${pc.dim(message)}`);
  },
  kv(key, value) {
    console.log(`  ${pc.dim(key.padEnd(10))} ${value}`);
  },
  assets(files) {
    files.forEach((f, i) => {
      const prefix = i === files.length - 1 ? pc.dim('└─') : pc.dim('├─');
      console.log(`  ${prefix} ${f}`);
    });
  },
  diagnostic(message, codeFrame) {
    console.log(`  ${ICON.error} ${pc.red(message)}`);
    if (codeFrame) {
      console.log(pc.dim(codeFrame.split('\n').map(l => `    ${l}`).join('\n')));
    }
  },
  timestamp(message, type = 'info') {
    const t = new Date().toTimeString().slice(0, 8);
    const icon = type === 'success' ? ICON.success : type === 'error' ? ICON.error : pc.dim('·');
    console.log(`  ${pc.dim(t)} ${icon} ${message}`);
  },
};
