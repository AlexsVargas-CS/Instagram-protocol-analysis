import { IgApiClient, IgLoginBadPasswordError, IgCheckpointError, IgLoginTwoFactorRequiredError, IgLoginRequiredError } from 'instagram-private-api';
import { withRealtime, IgApiClientRealtime, GraphQLSubscriptions, SkywalkerSubscriptions } from 'instagram_mqtt';
import { User, Thread, Message, GetMessagesResult, AuthenticationError, SessionError, InstagramAPIError } from './types';
import * as fs from 'fs/promises';

export class InstagramClient {
  private ig: IgApiClient;
  private igRt?: IgApiClientRealtime;
  private sessionPath: string;
  private twoFactorIdentifier?: string;
  private twoFactorUsername?: string;
  private twoFactorIsTOTP?: boolean;
  private saveTimer?: ReturnType<typeof setTimeout>;

	constructor(sessionPath = './session.json') {
		this.ig = new IgApiClient();
		this.sessionPath = sessionPath;
		this.setupAutoSave();
	}
	
	async login(username: string, password: string): Promise<User> {
		try {
			this.ig.state.generateDevice(username);

			// Use launcher.preLoginSync() — a single lightweight endpoint.
			// ig.simulate.preLoginFlow() fires 6+ requests (launcher/sync, qe/sync,
			// attribution, get_prefill_candidates, etc.) that frequently ALL return
			// checkpoint_required and poison the session state.
			try {
				await this.ig.launcher.preLoginSync();
			} catch (preLoginErr) {
				process.stderr.write(`preLoginSync error (non-fatal): ${preLoginErr instanceof Error ? preLoginErr.message : preLoginErr}\n`);
			}

			const loggedInUser = await this.ig.account.login(username, password);

			await this.saveSession();
			await this.runPostLoginFlow();

			return this.mapUser(loggedInUser);

		} catch (error) {
			if (error instanceof IgLoginBadPasswordError) {
				throw new AuthenticationError('Incorrect password', 'bad_credentials');
			}
			else if (error instanceof IgCheckpointError) {
				// Instagram requires identity verification.
				// Call challenge.auto(true) to send a verification code to the user.
				const checkpointWebUrl = error.url;
				process.stderr.write(`[challenge] Checkpoint triggered. Web URL: ${checkpointWebUrl}\n`);

				try {
					await this.ig.challenge.auto(true);
					// Code was sent — read the contact point from checkpoint state.
					const checkpoint: any = this.ig.state.checkpoint;
					const contact = checkpoint?.step_data?.contact_point ?? 'your phone or email';
					process.stderr.write(`[challenge] Code sent to: ${contact}\n`);
					throw new AuthenticationError(
						`Verification code sent to ${contact}`,
						'checkpoint_required',
					);
				} catch (challengeErr) {
					if (challengeErr instanceof AuthenticationError) throw challengeErr;
					// challenge.auto() failed — fall back to browser URL.
					process.stderr.write(`[challenge] auto() failed: ${challengeErr instanceof Error ? challengeErr.message : challengeErr}\n`);
					throw new AuthenticationError(
						`challenge_url:${checkpointWebUrl || 'https://www.instagram.com/challenge/'}`,
						'checkpoint_required',
					);
				}
			}
			else if (error instanceof IgLoginTwoFactorRequiredError) {
				const twoFactorInfo = error.response.body.two_factor_info;
				const isTOTP = twoFactorInfo.totp_two_factor_on;
				const identifier = twoFactorInfo.two_factor_identifier;
				const phone = twoFactorInfo.obfuscated_phone_number;

				this.twoFactorIdentifier = identifier;
				this.twoFactorUsername = username;
				this.twoFactorIsTOTP = isTOTP;

				const hint = isTOTP
					? 'Enter code from your authenticator app'
					: `Enter SMS code sent to ${phone}`;

				throw new AuthenticationError(
					`two_factor:${isTOTP ? 'totp' : 'sms'}:${hint}`,
					'two_factor_required',
				);
			}
			else {
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

	/**
	 * Auto-save session state (cookies, device trust tokens) after every API request.
	 * Uses a 500ms debounce to coalesce rapid bursts (e.g. preLoginFlow fires ~6 requests).
	 * This progressively builds device trust so Instagram is less likely to trigger checkpoints.
	 */
	private setupAutoSave(): void {
		this.ig.request.end$.subscribe(() => {
			if (this.saveTimer) clearTimeout(this.saveTimer);
			this.saveTimer = setTimeout(() => {
				this.saveSession().catch((err) => {
					process.stderr.write(`[auto-save] ${err instanceof Error ? err.message : err}\n`);
				});
			}, 500);
		});
	}

	/**
	 * Manual post-login: fetch reels tray + timeline like a real Android app.
	 * ig.simulate.postLoginFlow() fires many endpoints that can trigger errors
	 * or checkpoint flags. These two calls are what matters for session trust.
	 */
	private async runPostLoginFlow(): Promise<void> {
		try {
			await this.ig.feed.reelsTray('cold_start').request();
		} catch (err) {
			process.stderr.write(`postLoginFlow reelsTray error (non-fatal): ${err instanceof Error ? err.message : err}\n`);
		}
		try {
			await this.ig.feed.timeline('cold_start_fetch').request();
		} catch (err) {
			process.stderr.write(`postLoginFlow timeline error (non-fatal): ${err instanceof Error ? err.message : err}\n`);
		}
	}

	private mapMessage(raw: unknown): Message{
		const r = raw as Record<string, unknown>;

		return {
			itemId: r.item_id ? String(r.item_id) : undefined,
			text: String(r.text ?? ''),
			timestamp: r.timestamp ? Number(r.timestamp) : 0,
			userId: String(r.user_id ?? r.userId ?? ''),
		};
	}
	
	async getMessages(thread_id: string, _cursor?: string): Promise<GetMessagesResult> {
		try {
			const feed = await this.ig.feed.directThread({thread_id,  oldest_cursor: _cursor ?? ''});
			const items = await feed.items();

			const messages = items
				.filter(item => item != null && item.text != null)
				.map((item) => this.mapMessage(item));

			return {
				messages,
				oldestCursor: feed.cursor || null,
				hasOlder: feed.isMoreAvailable(),
			};
		}catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('Session expired: please log in again');
			} else{
				throw new InstagramAPIError(
					error instanceof Error ? error.message : `Failed to fetch messages for thread ${thread_id}`,
				);
			}
		}
	}
	

	async sendMessage(thread_id: string, text: string): Promise<Message> {
		try {
			const thread = this.ig.entity.directThread(thread_id);
			const result = await thread.broadcastText(text);
			// result is RootObject | Payload union — extract fields from whichever shape we get.
			const r = result as unknown as Record<string, unknown>;
			const payload = (r.payload ?? r) as Record<string, unknown>;
			return {
				itemId: payload.item_id ? String(payload.item_id) : undefined,
				text,
				timestamp: payload.timestamp ? Number(payload.timestamp) : Date.now() * 1000,
				userId: 'me',
			};
		} catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('Session expired — please log in again');
			}
			throw new InstagramAPIError(
				error instanceof Error ? error.message : `Failed to send message to thread ${thread_id}`,
			);
		}
	}

	async markRead(thread_id: string, item_id: string): Promise<void> {
		try {
			const thread = this.ig.entity.directThread(thread_id);
			await thread.markItemSeen(item_id);
		} catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('Session expired — please log in again');
			}
			throw new InstagramAPIError(
				error instanceof Error ? error.message : `Failed to mark read for thread ${thread_id}`,
			);
		}
	}

	async submitChallengeCode(code: string): Promise<User> {
		try {
			const response: any = await this.ig.challenge.sendSecurityCode(code);
			await this.saveSession();
			await this.runPostLoginFlow();

			if (response?.logged_in_user) {
				return this.mapUser(response.logged_in_user);
			}

			// Fallback: fetch current user from the now-authenticated session
			const currentUser = await this.ig.account.currentUser();
			return this.mapUser(currentUser);
		} catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('Challenge expired — please log in again');
			}
			throw new InstagramAPIError(
				error instanceof Error ? error.message : 'Invalid verification code',
			);
		}
	}

	async submitTwoFactorCode(code: string): Promise<User> {
		if (!this.twoFactorIdentifier || !this.twoFactorUsername) {
			throw new InstagramAPIError('No pending 2FA challenge');
		}
		try {
			const loggedInUser = await this.ig.account.twoFactorLogin({
				username: this.twoFactorUsername,
				verificationCode: code,
				twoFactorIdentifier: this.twoFactorIdentifier,
				verificationMethod: this.twoFactorIsTOTP ? '0' : '1',
				trustThisDevice: '1',
			});
			await this.saveSession();
			this.twoFactorIdentifier = undefined;
			this.twoFactorUsername = undefined;
			this.twoFactorIsTOTP = undefined;

			await this.runPostLoginFlow();

			return this.mapUser(loggedInUser);
		} catch (error) {
			if (error instanceof IgLoginRequiredError) {
				throw new SessionError('2FA session expired — please log in again');
			}
			throw new InstagramAPIError(
				error instanceof Error ? error.message : 'Invalid 2FA code',
			);
		}
	}

	async startRealtime(onMessage: (threadId: string, message: Message) => void): Promise<void> {
		try {
			// Fetch inbox to get seq_id for proper iris subscription.
			const inbox = await this.ig.feed.directInbox().request();

			this.igRt = withRealtime(this.ig);
			this.igRt.realtime.on('message', (wrapper) => {
				const msg = wrapper.message;
				if (msg.op === 'add' && msg.text && msg.thread_id) {
					const mapped: Message = {
						itemId: msg.item_id ? String(msg.item_id) : undefined,
						text: msg.text,
						timestamp: msg.timestamp ? Number(msg.timestamp) : 0,
						userId: msg.user_id ? String(msg.user_id) : '',
					};
					onMessage(msg.thread_id, mapped);
				}
			});
			this.igRt.realtime.on('error', (err) => {
				process.stderr.write(`Realtime error: ${err.message}\n`);
			});
			await this.igRt.realtime.connect({
				graphQlSubs: [
					GraphQLSubscriptions.getDirectTypingSubscription(this.ig.state.cookieUserId),
					GraphQLSubscriptions.getDirectStatusSubscription(),
				],
				skywalkerSubs: [
					SkywalkerSubscriptions.directSub(this.ig.state.cookieUserId),
				],
				irisData: {
					seq_id: inbox.seq_id,
					snapshot_at_ms: inbox.snapshot_at_ms,
				},
			});
		} catch (error) {
			// Realtime is non-critical; log and continue.
			process.stderr.write(`Realtime connect failed: ${error instanceof Error ? error.message : error}\n`);
		}
	}

	async stopRealtime(): Promise<void> {
		if (this.igRt) {
			await this.igRt.realtime.disconnect();
			this.igRt = undefined;
		}
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
		const last_perm_item = raw_last_perm_item ? this.mapMessage(raw_last_perm_item) : {text: '', timestamp: 0, userId: ''} ; 
	
		
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