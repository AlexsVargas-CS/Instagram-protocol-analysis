import * as readline from 'readline';
import 'dotenv/config';
import {InstagramClient} from './instagram';

const client = new InstagramClient();

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}


interface JsonRpcError {
  code: number;
  message: string;
}


// Server-initiated events (no id, nobody asked for these)
interface JsonRpcEvent {
  event: string;
  data: unknown;
}


interface Request {
	id: number;
	method: string;
	params: Record<string, unknown>;	
}


function sendResponse(id:number, result: unknown): void{
	const response: JsonRpcResponse = {
		id,
		result
	};
	
	console.log(JSON.stringify(response));
}

function sendError(id:number, code: number, message: string): void{
	const response: JsonRpcResponse = {
		id,
		error:{
			code,
			message
		},
	};
	console.log(JSON.stringify(response));
	
}

function sendEvent(event:string, data: unknown): void{
	const response: JsonRpcEvent = {
		event, 
		data
	};
	console.log(JSON.stringify(response));
}

const rl = readline.createInterface({
	input: process.stdin,
	terminal: false, //not interactive terminl 
	
});

rl.on('line', async (line:string) => { //goal: dont allow any input other then a valid input 

	let request; 
	
	try{
		request = JSON.parse(line);
	} catch {
		sendError(0, -32700, 'Parse Error');
		return;
	}
	
});



async function handleRequest(req: Request): Promise<void> {
	let result: unknown;
	
	switch(req.method) {
		case 'login':{
		const username = (req.params.username as string) || process.env.IG_USERNAME;
		const password = (req.params.password as string) || process.env.IG_PASSWORD; 
		result = await client.login(username!, password!);
		break;
		}
		case 'getThreads': {
			result = await client.getThreads();
			break;
		}
		case 'getMessages': {
			result = await client.getMessages(
			req.params.thread_id as string,
			req.params.cursor as string | undefined,
			);
			
			break;
		}
		case 'sendMessage': {
			result = await client.sendMessage(
			(req.params.thread_id as string), 
			(req.params.text as string),
			);
			break; 
		}
		
		default: 
		sendError(req.id, -32601, `Method not found: ${req.method}`);
		return; 
	}
	sendResponse(req.id, result);
	
	
	
}  

