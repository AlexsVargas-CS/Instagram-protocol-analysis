import { IgApiClient, IgLoginBadPasswordError, IgCheckpointError, IgLoginTwoFactorRequiredError, IgLoginRequiredError } from 'instagram-private-api';
import { withRealtime, IgApiClientRealtime, GraphQLSubscriptions, SkywalkerSubscriptions } from 'instagram_mqtt';
import { User, Thread, Message, GetMessagesResult, GetThreadsResult, AuthenticationError, SessionError, InstagramAPIError } from './types';
import * as fs from 'fs/promises';

// Opt-in debug logging. Off by default so session/token internals never hit the
// log. Enable with IG_DEBUG=1 when diagnosing auth/realtime issues.
const DEBUG = process.env.IG_DEBUG === '1' || process.env.IG_DEBUG === 'true';
function debugLog(msg: string): void {
	if (DEBUG) process.stderr.write(msg);
}

export class InstagramClient {
  private ig: IgApiClientRealtime;
  private sessionPath: string;
  private twoFactorIdentifier?: string;
  private twoFactorUsername?: string;
  private twoFactorIsTOTP?: boolean;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private currentUserPK?: string;
  private realtimeHandlersBound = false;
  private onRealtimeMessage?: (threadId: string, message: Message) => void;
  private onRealtimeError?: (error: string) => void;

	constructor(sessionPath = './session.json') {
		// Wrap with withRealtime() at construction time so the MQTT library
		// shares the same IgApiClientExt instance (and its cookie jar / state)
		// used for login and all API calls. Calling withRealtime() later on a
		// plain IgApiClient causes assertClient() to create a NEW empty client,
		// losing all session state.
		this.ig = withRealtime(new IgApiClient());
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
			this.currentUserPK = String(loggedInUser.pk);

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
				process.stderr.write(`[challenge] IgCheckpointError path. Web URL: ${checkpointWebUrl}\n`);

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
				// Fallback: instagram-private-api only recognizes "challenge_required"
				// but Instagram may also send "checkpoint_required". Detect it from
				// the raw response body and attempt the challenge flow.
				const resp = (error as any)?.response?.body;
				const bodyMsg = resp?.message ?? '';
				if (
					bodyMsg === 'checkpoint_required' ||
					bodyMsg === 'challenge_required' ||
					resp?.checkpoint_url ||
					resp?.challenge
				) {
					process.stderr.write(`[challenge] Fallback checkpoint path (raw response message=${bodyMsg})\n`);
					// Manually set checkpoint state so challenge.auto() can use it.
					(this.ig.state as any).checkpoint = resp;
					const challengeUrl =
						resp?.challenge?.url ??
						resp?.checkpoint_url ??
						'https://www.instagram.com/challenge/';

					try {
						await this.ig.challenge.auto(true);
						const checkpoint: any = this.ig.state.checkpoint;
						const contact = checkpoint?.step_data?.contact_point ?? 'your phone or email';
						process.stderr.write(`[challenge] Code sent to: ${contact}\n`);
						throw new AuthenticationError(
							`Verification code sent to ${contact}`,
							'checkpoint_required',
						);
					} catch (challengeErr) {
						if (challengeErr instanceof AuthenticationError) throw challengeErr;
						process.stderr.write(`[challenge] auto() failed: ${challengeErr instanceof Error ? challengeErr.message : challengeErr}\n`);
						throw new AuthenticationError(
							`challenge_url:${challengeUrl}`,
							'checkpoint_required',
						);
					}
				}
				throw new InstagramAPIError(
					error instanceof Error ? error.message : 'Login failed',
				);
			}
		}
	}
	
	
	
	
	async loadSession(): Promise<User | null> {//session is either restored or not.
		//get the session/ read it, feed saved state back into the library's internal state machine, call user to make sure session hasnt expired.
		try {
			const data = await fs.readFile(this.sessionPath, 'utf-8'); //get session and store
			const stateObject = JSON.parse(data);
			await this.ig.state.deserialize(stateObject); //restores session state from a saved JSON string

			//quickly validiating user session, making sure its not expired
			const user = await this.ig.account.currentUser();
			this.currentUserPK = String(user.pk);

			// Re-parse authorization AFTER currentUser() — the API response
			// may have set/refreshed the ig-set-authorization header via
			// request.js updateState(). parsedAuthorization has @Enumerable(false)
			// so it's never serialized — must be rebuilt from the Bearer token.
			(this.ig.state as any).updateAuthorization();

			// Debug: log authorization state for diagnosing realtime issues.
			const auth = (this.ig.state as any).authorization;
			const parsed = (this.ig.state as any).parsedAuthorization;
			debugLog(`[session] authorization type=${typeof auth}, starts=${auth?.substring?.(0, 20)}\n`);
			debugLog(`[session] parsedAuthorization has sessionid=${!!parsed?.sessionid}\n`);

			return this.mapUser(user);
		}catch {
			return null;
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
		const rawText = r.text != null ? String(r.text) : '';

		return {
			itemId: r.item_id ? String(r.item_id) : undefined,
			// Fall back to a typed placeholder for non-text items (photos, likes,
			// shares, …) so they keep their place in the timeline instead of
			// silently vanishing.
			text: rawText !== '' ? rawText : this.describeNonTextItem(r),
			timestamp: r.timestamp ? Number(r.timestamp) : 0,
			userId: String(r.user_id ?? r.userId ?? ''),
		};
	}

	/**
	 * Produce a short placeholder for a direct item that carries no text, keyed
	 * off item_type. Unknown types degrade to "[<type>]" so nothing is lost.
	 */
	private describeNonTextItem(r: Record<string, unknown>): string {
		const type = String(r.item_type ?? '');
		switch (type) {
			case 'text': return '';
			case 'media': return '[photo]';
			case 'raven_media': return '[disappearing photo]';
			case 'voice_media': return '[voice message]';
			case 'animated_media': return '[GIF]';
			case 'like': return '[like]';
			case 'media_share': return '[shared post]';
			case 'story_share': return '[shared story]';
			case 'clip': return '[shared reel]';
			case 'felix_share': return '[shared video]';
			case 'profile': return '[shared profile]';
			case 'location': return '[shared location]';
			case 'reel_share': return '[story reply]';
			case 'placeholder': return '[unavailable message]';
			case 'video_call_event': return '[video call]';
			case 'link': {
				const link = r.link as Record<string, unknown> | undefined;
				const linkText = link?.text != null ? String(link.text) : '';
				return linkText !== '' ? linkText : '[link]';
			}
			case 'action_log': {
				const log = r.action_log as Record<string, unknown> | undefined;
				const desc = log?.description != null ? String(log.description) : '';
				return desc !== '' ? desc : '[action]';
			}
			case '': return '[message]';
			default: return `[${type}]`;
		}
	}
	
	async getMessages(thread_id: string, _cursor?: string): Promise<GetMessagesResult> {
		try {
			const feed = await this.ig.feed.directThread({thread_id,  oldest_cursor: _cursor ?? ''});
			const items = await feed.items();

			const messages = items
				.filter(item => item != null)
				.map((item) => this.mapMessage(item));

			messages.reverse(); // API returns newest-first; reverse to chronological (oldest-first)

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
				userId: this.currentUserPK || 'me',
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
				this.currentUserPK = String(response.logged_in_user.pk);
				return this.mapUser(response.logged_in_user);
			}

			// Fallback: fetch current user from the now-authenticated session
			const currentUser = await this.ig.account.currentUser();
			this.currentUserPK = String(currentUser.pk);
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
			this.currentUserPK = String(loggedInUser.pk);
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

	async startRealtime(
		onMessage: (threadId: string, message: Message) => void,
		onError?: (error: string) => void,
		retries = 3,
	): Promise<void> {
		// Store the latest callbacks so the (bind-once) handlers always forward to
		// the current server closures, even if startRealtime is invoked again.
		this.onRealtimeMessage = onMessage;
		this.onRealtimeError = onError;
		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				// Verify session is ready for MQTT.
				if (!this.ig.state.cookieUserId) {
					if (attempt < retries - 1) {
						process.stderr.write(
							`[realtime] cookieUserId not ready, retrying in ${2 * (attempt + 1)}s (attempt ${attempt + 1}/${retries})\n`,
						);
						await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
						continue;
					}
					onError?.('Session not ready for realtime (no cookieUserId)');
					return;
				}

				// Ensure parsedAuthorization is populated BEFORE any API call.
				(this.ig.state as any).updateAuthorization();

				// Capture sessionid NOW while parsedAuthorization is valid.
				// The upcoming inbox request may refresh the authorization header
				// to a new Bearer token that lacks sessionid, making parsedAuth stale.
				const parsedAuth = (this.ig.state as any).parsedAuthorization;
				const capturedSessionId: string | undefined = parsedAuth?.sessionid;
				debugLog(`[realtime] attempt=${attempt + 1} capturedSessionId=${!!capturedSessionId}, cookieUserId=${this.ig.state.cookieUserId}\n`);

				// Fetch inbox to get seq_id for proper iris subscription.
				const inbox = await this.ig.feed.directInbox().request();

				// Force-inject sessionid into cookie jar using the value captured
				// BEFORE the inbox request. The inbox response may have refreshed
				// the Bearer token (via ig-set-authorization header) to one that
				// omits sessionid. The MQTT library's constructConnection() reads
				// parsedAuthorization?.sessionid first, falling back to
				// extractCookieValue('sessionid'). Both fail if we don't inject here.
				this.ensureSessionCookies(capturedSessionId);

				// Re-sync parsedAuthorization with the (possibly new) authorization.
				(this.ig.state as any).updateAuthorization();

				// this.ig is already an IgApiClientRealtime (wrapped in constructor),
				// so this.ig.realtime shares the same state/cookie jar.
				// Bind handlers exactly once — registering inside the retry loop
				// would stack duplicate handlers on every attempt.
				this.bindRealtimeHandlers();
				await this.ig.realtime.connect({
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
				return; // Success — exit retry loop.
			} catch (error) {
				if (attempt < retries - 1) {
					process.stderr.write(
						`[realtime] Connect attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : error}, retrying...\n`,
					);
					await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
					continue;
				}
				// Final failure — non-critical; log and notify.
				process.stderr.write(
					`Realtime connect failed after ${retries} attempts: ${error instanceof Error ? error.message : error}\n`,
				);
				onError?.(error instanceof Error ? error.message : String(error));
			}
		}
	}

	/**
	 * Register the realtime event handlers exactly once for this client's lifetime.
	 *
	 * EventEmitter.on() appends rather than replaces, so binding inside the retry
	 * loop (or on each startRealtime call) would deliver every message N times.
	 * The handlers forward to this.onRealtimeMessage / this.onRealtimeError, which
	 * are refreshed on every startRealtime call, so the latest callbacks are used.
	 *
	 * We do NOT removeAllListeners('error'|'close') — the MQTT client registers its
	 * own internal handlers on those events, and removing them could escalate a
	 * recoverable error into an unhandled crash.
	 */
	private bindRealtimeHandlers(): void {
		if (this.realtimeHandlersBound) return;
		this.realtimeHandlersBound = true;

		this.ig.realtime.on('message', (wrapper) => {
			const msg = wrapper.message;
			// Skip echoes of our own sends — iris streams them back to us, but the
			// TUI already shows them optimistically, so forwarding would duplicate.
			// (Trade-off: sends from the user's OTHER devices won't appear live;
			// they surface on the next getMessages reload of the thread.)
			const fromSelf =
				this.currentUserPK != null && String(msg.user_id ?? '') === this.currentUserPK;
			if (msg.op === 'add' && msg.text && msg.thread_id && !fromSelf) {
				const mapped: Message = {
					itemId: msg.item_id ? String(msg.item_id) : undefined,
					text: msg.text,
					timestamp: msg.timestamp ? Number(msg.timestamp) : 0,
					userId: msg.user_id ? String(msg.user_id) : '',
				};
				this.onRealtimeMessage?.(msg.thread_id, mapped);
			}
		});
		this.ig.realtime.on('error', (err) => {
			process.stderr.write(`Realtime error: ${err.message}\n`);
			this.onRealtimeError?.(err.message);
		});
		this.ig.realtime.on('close', () => {
			process.stderr.write(`Realtime connection closed\n`);
			this.onRealtimeError?.('Realtime connection closed');
		});
	}

	/**
	 * Populate the cookie jar with sessionid so the MQTT library can authenticate.
	 *
	 * Instagram's modern auth uses Bearer tokens (IGT:2:...) exclusively, leaving
	 * the cookie jar empty. The MQTT library reads sessionid via:
	 *   parsedAuthorization?.sessionid ?? extractCookieValue('sessionid')
	 *
	 * Problem: API responses may refresh the Bearer token (ig-set-authorization header)
	 * to one that omits sessionid, making parsedAuthorization stale. We solve this by
	 * accepting a pre-captured sessionid (from before the token refresh) and force-
	 * injecting it into the cookie jar as a reliable fallback.
	 */
	private ensureSessionCookies(capturedSessionId?: string): void {
		const rawAuth: string = (this.ig.state as any).authorization ?? '';
		const host = 'https://i.instagram.com/';

		// Try to get sessionid from: 1) pre-captured value, 2) current Bearer token.
		let sessionid = capturedSessionId;
		let dsUserId: string | undefined;

		if (rawAuth.startsWith('Bearer IGT:2:')) {
			try {
				const decoded: { sessionid?: string; ds_user_id?: string } = JSON.parse(
					Buffer.from(rawAuth.substring('Bearer IGT:2:'.length), 'base64').toString(),
				);
				if (!sessionid && decoded.sessionid) sessionid = decoded.sessionid;
				dsUserId = decoded.ds_user_id;
			} catch {
				// Token decode failed — continue with capturedSessionId if available.
			}
		}

		// Always force-inject sessionid cookie (overwrite stale values).
		if (sessionid) {
			(this.ig.state as any).cookieJar.setCookie(
				`sessionid=${sessionid}; Domain=.instagram.com; Path=/; Secure; HttpOnly`,
				host,
			);
			debugLog(`[realtime] Injected sessionid cookie (len=${sessionid.length})\n`);
		} else {
			process.stderr.write('[realtime] WARNING: no sessionid available for cookie injection\n');
		}

		if (dsUserId) {
			try {
				this.ig.state.extractCookieValue('ds_user_id');
			} catch {
				(this.ig.state as any).cookieJar.setCookie(
					`ds_user_id=${dsUserId}; Domain=.instagram.com; Path=/`,
					host,
				);
			}
		}
	}

	async stopRealtime(): Promise<void> {
		try {
			await this.ig.realtime.disconnect();
		} catch {
			// Ignore errors if not connected.
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

	/**
	 * Derive an unread count for an inbox thread.
	 *
	 * Instagram's inbox does NOT return a per-thread unread count. We reconstruct
	 * one by comparing each recent item's timestamp against the viewer's own
	 * last_seen_at timestamp: an item is unread if it's newer than the last time
	 * I saw the thread AND it wasn't sent by me. The inbox only includes the most
	 * recent items, so this can under-count very busy unread threads — that's the
	 * best faithful approximation available from this payload.
	 */
	private computeUnreadCount(r: Record<string, unknown>): number {
		const viewerId = String(r.viewer_id ?? this.currentUserPK ?? '');
		if (!viewerId) return 0;

		const seenMap = r.last_seen_at as Record<string, { timestamp?: string }> | undefined;
		const mySeenTs = seenMap ? Number(seenMap[viewerId]?.timestamp ?? 0) : 0;

		let items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
		if (items.length === 0 && r.last_permanent_item) {
			items = [r.last_permanent_item as Record<string, unknown>];
		}

		let count = 0;
		for (const it of items) {
			const fromMe = String(it.user_id ?? '') === viewerId;
			if (!fromMe && Number(it.timestamp ?? 0) > mySeenTs) count++;
		}
		return count;
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
			unreadCount: this.computeUnreadCount(r),
			lastActivityAt: Number(r.last_activity_at ?? 0),
			is_group: Boolean(r.is_group ?? false),
		};
		
	
	}
	
	
	async getThreads(cursor?: string): Promise<GetThreadsResult> {
		try{
			const feed = this.ig.feed.directInbox();
			if (cursor) {
				// cursor is private — use type assertion to set it for pagination.
				(feed as any).cursor = cursor;
			}
			const raw_Thread = await feed.items();
			return {
				threads: raw_Thread.map((thread) => this.mapThread(thread)),
				oldestCursor: (feed as any).cursor || null,
				hasOlder: feed.isMoreAvailable(),
			};
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