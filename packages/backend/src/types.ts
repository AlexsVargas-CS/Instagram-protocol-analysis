export interface User{
	username: string;
	pk:string;
}

export interface Message{ 
	text: string;
	timestamp: number;
	
}

export interface Thread {
	thread_Id: string;
	users: User[];
	lastMessage: Message;
	unreadCount: number;
	lastActivityAt: number;
	is_group: boolean;
}


	/*thread_Title: string;
	last_seen_at: any;
	users: DirectInboxFeedResponseUsersItem[];
	is_group: boolean;
	items:DirectInboxFeedResponseItemsItem[];
	last_permanent_item: DirectInboxFeedResponseLastPermanentItem;
	last_activity_at: string;*/
