import { IgApiClient, IgLoginBadPasswordError, IgCheckpointError, IgLoginTwoFactorRequiredError, IgLoginRequiredError } from 'instagram-private-api';
import { User, Thread, Message, AuthenticationError, SessionError, InstagramAPIError } from './types';
import * as fs from 'fs/promises';

export class InstagramClient {
  private ig: IgApiClient;
  private sessionPath: string;

	constructor(sessionPath = './session.json') {
		this.ig = new IgApiClient();
		this.sessionPath = sessionPath;
	}
	
	async login(username:string, password: string): Promise<User> {
		try {
			
			this.ig.state.generateDevice(username);
			
			await this.ig.simulate.preLoginFlow();

			const loggedInUser = await this.ig.account.login(username, password); //login fails catch will be added later...

			await this.saveSession(); //creating multiple sessions can raise sus!

			return this.mapUser(loggedInUser);
		
		}
		catch(error) {
			if (error instanceof IgLoginBadPasswordError) {
				throw new AuthenticationError('Incorrect password', 'bad_credentials');
			}
			else if (error instanceof IgCheckpointError) {
				throw new AuthenticationError('Challenge required — verify on your phone', 'checkpoint_required');
			} 
			else if (error instanceof IgLoginTwoFactorRequiredError) {	
				throw new AuthenticationError('Two-factor authentication required', 'two_factor_required');
			}
			else{
				throw new InstagramAPIError(
					error instanceof Error ? error.message : 'Login failed',
				);
				
			}
		
		}
		
	}
	
	
	
	
	async loadSession(): Promise<boolean> {//session is either restored or not.
		//get the session/ read it, feed saved state back into the library's internal state machine, call user to make sure session hasnt expired.
		try {
			const data = await fs.readFile(this.sessionPath, 'utf-8'); //get session and store
			const stateObject = JSON.parse(data);
			await this.ig.state.deserialize(stateObject); //restores session state from a saved JSON string 
			
			//quickly validiating user session, making sure its not expired
			await this.ig.account.currentUser();
			return true;
		}catch {
			return false;
		}
	}
	
	private async saveSession(): Promise<void> {
		const session = await this.ig.state.serialize()// extracts libs full state
		delete session.constants;
		await fs.writeFile(this.sessionPath, JSON.stringify(session));
		
	}
	
	private mapMessage(raw: unknown): Message{
		const r = raw as Record<string, unknown>;
		
		return {
			text: String(r.text ?? ''),
			timestamp: 0,
		};
	}
	
	async getMessages(thread_id: string, _cursor?: string): Promise<Message[]> {
		try {
			const feed = await this.ig.feed.directThread({thread_id: threadId});
			const threads = await feed.items(); // this should return a array that contains the threads info
		//with this raw thread we can now extract last_permanent_item
		
		//we then return a threads then map it using thread.last_perm after 
		//we filter by checking that the item is not empty and finally map it to mapMessage
		
			return threads
			.map(thread => thread.last_permanent_item)
			.filter(item => item != null)
			.map((item) => this.mapMessage(item));
	
		//throw new Error(`getMessages not yet implemented for thread ${threadId}`)
		}catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('Session expired: please log in again');
			} else{
				throw new InstagramAPIError(
					error instanceof Error ? error.message : `Failed to fetch messages for thread ${threadId}`,
				);
			}
		}
		

		
		
	}
	

	async sendMessage(thread_id: string, _text: string): Promise<Message> {
    // TODO: Implement in Phase 5
    throw new Error(`sendMessage not yet implemented for thread ${threadId}`);
	}

	// basically our types differ from the library we are using 
	// thus we must map our types to only include what we want from the library
	//Want to use my own types isntead of libraries maps 
	
	
	
	//Here we call the API and it returns its own response object (full structure)
	//So our mapper just take the full struct and we take the parts we need from it 
	// and create our own types
	
	private mapUser(raw: unknown): User {
		const r = raw as Record<string, unknown>;
		return {
			pk: String(r.pk ?? ''),
			username: String(r.username ?? ''),
			
		};
	}

	private mapThread(raw:unknown): Thread{
		const r = raw as Record<string, unknown>;
		const raw_user = r.users;
		const raw_last_perm_item = r.last_permanent_item;
		
		const users = Array.isArray(raw_user) ? raw_user.map((field) => this.mapUser(field)) : []; // check if users array exists, then map else empty arr
		const last_perm_item = raw_last_perm_item ? this.mapMessage(raw_last_perm_item) : {text: '', timestamp: 0} ; 
	
		
		return{
			thread_id : String(r.thread_id ?? ''),
			users: users,
			lastMessage : last_perm_item,
			unreadCount: 0,
			lastActivityAt: 0,
			is_group: Boolean(r.is_group ?? false),
		};
		
	
	}
	
	
	async getThreads(): Promise<Thread[]> {
		try{
			const feed = await this.ig.feed.directInbox();
			const raw_Thread = await feed.items();
			return raw_Thread.map((thread) => this.mapThread(thread)); 
		} catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('Session expired — please log in again');
			} 
			else{
				throw new InstagramAPIError(
					error instanceof Error ? error.message : 'Failed to fetch threads',
				);
			}
		} 
		
		
		
	}
	
	
	
	

}