export class InstagramClientError extends Error {
	constructor(message: string){
		super(message);
		this.name = 'InstgramClientError';

		}
}

export class AuthenticationError extends Error {
	public reason = 'bad_credentials' | 'checkpoint_required' | 'two_factor_required';
	
	constructor(message: string, reason: 'bad_credentials' | 'checkpoint_required' | 'two_factor_required') {
    super(message);
    this.name = 'AuthenticationError';
    this.reason = reason;
  }
	
}


export class SessionError extends InstagramClientError {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export class InstagramAPIError extends InstagramClientError {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'InstagramAPIError';
    this.statusCode = statusCode;
  }
}


export interface User{
	username: string;
	pk:string;
}

export interface Message{ 
	text: string;
	timestamp: number;
	
}

export interface Thread {
	thread_id: string;
	users: User[];
	lastMessage :Message;
	unreadCount: number;
	lastActivityAt: number;
	is_group: boolean;
}
