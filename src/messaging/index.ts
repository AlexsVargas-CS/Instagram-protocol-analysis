/**
 * Messaging Client
 * 
 * Handles direct message operations.
 * 
 * Learning notes:
 * - REST API: POST /api/v1/direct_v2/threads/broadcast/text/
 * - MQTT: Real-time bidirectional messaging (more advanced)
 * - Thread IDs are very long numbers (340282366841710300949128...)
 */

import { IgApiClient } from 'instagram-private-api';
import chalk from 'chalk';
import ora from 'ora';
import { AuthManager } from '../auth';

interface Thread {
  threadId: string;
  threadTitle: string;
  lastMessage: string;
  lastActivityAt: number;
  users: Array<{
    pk: number;
    username: string;
    fullName: string;
  }>;
}

interface Message {
  itemId: string;
  userId: number;
  text: string;
  timestamp: number;
  itemType: string;
}

export class MessagingClient {
  private ig: IgApiClient | null = null;
  private auth: AuthManager;
  
  constructor() {
    this.auth = new AuthManager();
  }
  
  /**
   * Ensure we have a valid session
   */
  private async ensureLoggedIn(): Promise<boolean> {
    const loaded = await this.auth.loadSession();
    if (!loaded) {
      console.log(chalk.yellow('Not logged in. Run `ig-research login` first.'));
      return false;
    }
    this.ig = this.auth.getClient();
    return true;
  }
  
  /**
   * Get inbox threads
   * 
   * API: GET /api/v1/direct_v2/inbox/
   */
  async showInbox(): Promise<void> {
    if (!await this.ensureLoggedIn()) return;
    
    const spinner = ora('Fetching inbox...').start();
    
    try {
      const inboxFeed = this.ig!.feed.directInbox();
      const threads = await inboxFeed.items();
      
      spinner.stop();
      
      if (threads.length === 0) {
        console.log(chalk.gray('No conversations found.'));
        return;
      }
      
      console.log(chalk.cyan('\n📥 Inbox\n'));
      console.log('─'.repeat(50));
      
      for (const thread of threads.slice(0, 10)) {
        const users = thread.users.map(u => u.username).join(', ');
        const lastItem = thread.last_permanent_item;
        const lastMessage = lastItem?.text || lastItem?.item_type || 'Media';
        const time = this.formatTime(thread.last_activity_at);
        
        // Thread display
        console.log(chalk.white.bold(thread.thread_title || users));
        console.log(chalk.gray(`  ${this.truncate(lastMessage, 40)}`));
        console.log(chalk.gray(`  ${time}`));
        console.log();
      }
      
      console.log('─'.repeat(50));
      console.log(chalk.gray(`Showing ${Math.min(threads.length, 10)} of ${threads.length} conversations`));
      
    } catch (error: any) {
      spinner.fail('Failed to fetch inbox');
      console.log(chalk.red(`Error: ${error.message}`));
    }
  }
  
  /**
   * Get messages from a specific thread
   * 
   * API: GET /api/v1/direct_v2/threads/<thread_id>/
   */
  async getThread(threadId: string): Promise<Message[]> {
    if (!await this.ensureLoggedIn()) return [];
    
    try {
      const thread = this.ig!.feed.directThread({ thread_id: threadId });
      const items = await thread.items();
      
      return items.map(item => ({
        itemId: item.item_id,
        userId: item.user_id,
        text: item.text || item.item_type,
        timestamp: Number(item.timestamp),
        itemType: item.item_type,
      }));
    } catch (error) {
      console.log(chalk.red('Failed to fetch thread'));
      return [];
    }
  }
  
  /**
   * Send a text message
   * 
   * API: POST /api/v1/direct_v2/threads/broadcast/text/
   * 
   * Request body includes:
   * - thread_ids or recipient user IDs
   * - text content
   * - client_context (UUID for deduplication)
   */
  async sendMessage(recipientUsername: string, text: string): Promise<boolean> {
    if (!await this.ensureLoggedIn()) return false;
    
    const spinner = ora('Sending message...').start();
    
    try {
      // First, get the user ID from username
      const userId = await this.getUserId(recipientUsername);
      if (!userId) {
        spinner.fail(`User "${recipientUsername}" not found`);
        return false;
      }
      
      // Send the message
      // This creates a new thread if one doesn't exist
      const result = await this.ig!.direct.send({
        userIds: [userId.toString()],
        text: text,
      });
      
      spinner.succeed(`Message sent to ${chalk.green(recipientUsername)}`);
      return true;
      
    } catch (error: any) {
      spinner.fail('Failed to send message');
      
      // Handle specific errors
      if (error.message.includes('checkpoint')) {
        console.log(chalk.yellow('⚠️  Account flagged for verification'));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
      
      return false;
    }
  }
  
  /**
   * Get user ID from username
   * 
   * API: GET /api/v1/users/<username>/usernameinfo/
   */
  private async getUserId(username: string): Promise<number | null> {
    try {
      const user = await this.ig!.user.searchExact(username);
      return user.pk;
    } catch {
      return null;
    }
  }
  
  /**
   * Format timestamp to relative time
   */
  private formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp / 1000; // Instagram uses microseconds
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp / 1000).toLocaleDateString();
  }
  
  /**
   * Truncate string with ellipsis
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

export default MessagingClient;
