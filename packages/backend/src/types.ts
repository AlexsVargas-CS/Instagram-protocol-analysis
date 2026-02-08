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
