/**
 * Authentication Manager
 * 
 * Handles login, logout, and session management.
 * 
 * Learning notes:
 * - Instagram uses encrypted passwords with their public key
 * - Sessions persist via cookies (sessionid, csrftoken, ds_user_id)
 * - Device IDs should be consistent across sessions
 */

import { IgApiClient } from 'instagram-private-api';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { ensureConfigDir, getSessionPath } from './utils';

export interface UserInfo {
  pk: number;
  username: string;
  fullName: string;
}

export class AuthManager {
  private ig: IgApiClient;
  
  constructor() {
    this.ig = new IgApiClient();
  }
  
  /**
   * Login to Instagram
   * 
   * Flow:
   * 1. Generate device profile from username
   * 2. Simulate pre-login flow (mimics real app)
   * 3. Send login request
   * 4. Handle 2FA or challenges if needed
   * 5. Save session for future use
   */
  async login(username?: string): Promise<UserInfo | null> {
    ensureConfigDir();
    
    // Prompt for credentials if not provided
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Username:',
        when: !username,
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
      },
    ]);
    
    const user = username || answers.username;
    const pass = answers.password;
    
    // Generate device profile
    // Using username as seed creates consistent device IDs across sessions
    this.ig.state.generateDevice(user);
    
    const spinner = ora('Logging in...').start();
    
    try {
      // Pre-login flow simulates what the real app does before login
      // This includes fetching configs, contact prefill, etc.
      await this.ig.simulate.preLoginFlow();
      
      // Actual login request
      const loggedInUser = await this.ig.account.login(user, pass);
      
      // Post-login flow (timeline sync, etc.)
      process.nextTick(async () => {
        await this.ig.simulate.postLoginFlow();
      });
      
      // Save session
      await this.saveSession();
      
      spinner.succeed(`Logged in as ${chalk.green(loggedInUser.username)}`);
      
      return {
        pk: loggedInUser.pk,
        username: loggedInUser.username,
        fullName: loggedInUser.full_name,
      };
      
    } catch (error: any) {
      spinner.fail('Login failed');
      
      // Handle different error types
      if (error.name === 'IgCheckpointError') {
        console.log(chalk.yellow('\n⚠️  Challenge required'));
        return await this.handleChallenge();
      }
      
      if (error.name === 'IgLoginTwoFactorRequiredError') {
        console.log(chalk.yellow('\n⚠️  Two-factor authentication required'));
        return await this.handle2FA(error);
      }
      
      if (error.name === 'IgLoginBadPasswordError') {
        console.log(chalk.red('Incorrect password'));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
      
      return null;
    }
  }
  
  /**
   * Handle 2FA verification
   */
  private async handle2FA(error: any): Promise<UserInfo | null> {
    const { twoFactorIdentifier } = error.response.body.two_factor_info;
    
    const { code } = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Enter 2FA code:',
      },
    ]);
    
    try {
      const result = await this.ig.account.twoFactorLogin({
        twoFactorIdentifier,
        verificationCode: code,
        trustThisDevice: '1',
      });
      
      await this.saveSession();
      console.log(chalk.green('✓ 2FA verification successful'));
      
      return {
        pk: result.pk,
        username: result.username,
        fullName: result.full_name,
      };
    } catch (err) {
      console.log(chalk.red('2FA verification failed'));
      return null;
    }
  }
  
  /**
   * Handle challenge (verification required)
   */
  private async handleChallenge(): Promise<UserInfo | null> {
    try {
      // Auto-select verification method
      await this.ig.challenge.auto(true);
      
      console.log(chalk.cyan('Check your email or phone for verification code'));
      
      const { code } = await inquirer.prompt([
        {
          type: 'input',
          name: 'code',
          message: 'Enter verification code:',
        },
      ]);
      
      const result = await this.ig.challenge.sendSecurityCode(code);
      
      await this.saveSession();
      console.log(chalk.green('✓ Challenge completed'));
      
      return result.logged_in_user;
    } catch (err) {
      console.log(chalk.red('Challenge failed'));
      return null;
    }
  }
  
  /**
   * Save session to file for persistence
   */
  private async saveSession(): Promise<void> {
    const serialized = this.ig.state.serialize();
    
    // Remove large constant data we don't need to store
    delete serialized.constants;
    
    const sessionPath = getSessionPath();
    fs.writeFileSync(sessionPath, JSON.stringify(serialized, null, 2));
  }
  
  /**
   * Load session from file
   */
  async loadSession(): Promise<boolean> {
    const sessionPath = getSessionPath();
    
    if (!fs.existsSync(sessionPath)) {
      return false;
    }
    
    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      await this.ig.state.deserialize(sessionData);
      
      // Verify session is still valid
      await this.ig.account.currentUser();
      return true;
    } catch {
      // Session expired or invalid
      return false;
    }
  }
  
  /**
   * Get current logged in user
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    try {
      const loaded = await this.loadSession();
      if (!loaded) return null;
      
      const user = await this.ig.account.currentUser();
      return {
        pk: user.pk,
        username: user.username,
        fullName: user.full_name,
      };
    } catch {
      return null;
    }
  }
  
  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    const sessionPath = getSessionPath();
    
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    
    // Try to logout from Instagram
    try {
      await this.loadSession();
      await this.ig.account.logout();
    } catch {
      // Ignore errors during logout
    }
  }
  
  /**
   * Get the underlying API client (for other modules)
   */
  getClient(): IgApiClient {
    return this.ig;
  }
}

export default AuthManager;
