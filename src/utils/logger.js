import chalk from 'chalk';

export const logger = {
  info(message) {
    console.log(chalk.blue('[INFO]'), message);
  },

  success(message) {
    console.log(chalk.green('[SUCCESS]'), message);
  },

  error(message) {
    console.error(chalk.red('[ERROR]'), message);
  },

  warning(message) {
    console.warn(chalk.yellow('[WARNING]'), message);
  }
};
