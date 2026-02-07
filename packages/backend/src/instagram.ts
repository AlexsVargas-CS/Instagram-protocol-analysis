import { IgApiClient } from 'instagram-private-api';
import * as fs from 'fs/promises';
import { User, Thread, Message } from './types';

export class InstagramClient {
  private ig: IgApiClient;
  private sessionPath: string;

	constructor(sessionPath = './session.json') {
		this.ig = new IgApiClient();
		this.sessionPath = sessionPath;
	}
	
	async login(username:string, password: string): Promise<User> {
		this.ig.state.generateDevice(username); 
		await.this.ig.simulate.preLoginFlow();
		
		const loggedInUser = await this.ig.account.login(username, password); //login fails catch will be added later...
		
		await this.saveSession(); //creating multiple sessions can raise sus!
		
		return this.mapUser(loggedInUser);
	}
	
	async loadSession(): Promise<boolean> {//session is either restored or not.
		//get the session/ read it, feed saved state back into the library's internal state machine, call user to make sure session hasnt expired.
		try {
			data = await fs.readFile(this.sessionPath, 'utf-8'); //get session and store
			const stateObject = JSON.parse(data);
			await this.ig.state.deserialize(stateObject); //restores session state from a saved JSON string 
			
			//quickly validiating user session, making sure its not expired
			await this.ig.account.currentUser();
			return true;
		}catch {
			return false;
		}
	}
	
	private async SaveSession(): Promise<void> {
		cosnt session = await this.ig.state.serialize()// extracts libs full state
		delete session.constants;
		await fs.writeFile(this.sessionPath, JSON.stringify(session));
		
	}
	
	
	

}