
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
