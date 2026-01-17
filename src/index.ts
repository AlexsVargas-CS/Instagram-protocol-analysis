#!/usr/bin/env node

/**
 * Instagram Protocol Analysis CLI
 * 
 * A minimal Instagram client built for learning purposes.
 * This project explores Instagram's private API through reverse engineering.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { AuthManager } from './auth';
import { MessagingClient } from './messaging';

const program = new Command();

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════════════╗
║     Instagram Protocol Analysis CLI               ║
║     Educational Research Project                  ║
╚═══════════════════════════════════════════════════╝
`;

program
  .name('ig-research')
  .description('A minimal Instagram CLI for protocol research')
  .version('0.1.0');

// Auth commands
program
  .command('login')
  .description('Login to Instagram')
  .option('-u, --username <username>', 'Instagram username')
  .action(async (options) => {
    console.log(chalk.cyan(banner));
    console.log(chalk.yellow('⚠️  This is for educational purposes only.\n'));
    
    const auth = new AuthManager();
    await auth.login(options.username);
  });

program
  .command('logout')
  .description('Logout and clear session')
  .action(async () => {
    const auth = new AuthManager();
    await auth.logout();
    console.log(chalk.green('✓ Logged out successfully'));
  });

program
  .command('whoami')
  .description('Display current logged in user')
  .action(async () => {
    const auth = new AuthManager();
    const user = await auth.getCurrentUser();
    if (user) {
      console.log(chalk.green(`Logged in as: ${user.username}`));
    } else {
      console.log(chalk.yellow('Not logged in'));
    }
  });

// Messaging commands
program
  .command('inbox')
  .description('View direct message inbox')
  .action(async () => {
    const messaging = new MessagingClient();
    await messaging.showInbox();
  });

program
  .command('send')
  .description('Send a direct message')
  .requiredOption('-t, --to <username>', 'Recipient username')
  .requiredOption('-m, --message <text>', 'Message text')
  .action(async (options) => {
    const messaging = new MessagingClient();
    await messaging.sendMessage(options.to, options.message);
  });

// Research/Debug commands
program
  .command('debug')
  .description('Show debug information')
  .action(async () => {
    console.log(chalk.cyan('Debug Information:'));
    console.log('─'.repeat(40));
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Session file: ~/.ig-research/session.json`);
    console.log('─'.repeat(40));
  });

// Main execution
async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

// Show banner if no args
if (process.argv.length <= 2) {
  console.log(chalk.cyan(banner));
  console.log(chalk.gray('Run with --help to see available commands\n'));
  program.outputHelp();
}

main();
