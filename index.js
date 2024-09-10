import express from "express";
import {WebSocketServer} from "ws";
import path from "path";
import http from "http";
import { config } from "dotenv";
import { randomUUID } from "crypto";


config();

const app = express();

app.use(express.static(path.resolve("static")));


const HOST_BASE_ID = process.env.HOST_BASE

let host_base;


let hosts = new Map();
let clients = new Map();


let stalled_requests = new Map();

function decycle(obj, replacer) {
  const seen = new WeakMap();

  function derez(value, path) {
    // Handle primitive values (string, number, boolean, etc.)
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    // If we've seen this object before, it's a circular reference
    if (seen.has(value)) {
      return { $ref: seen.get(value) };
    }

    // Store the current path for this object
    seen.set(value, path);

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item, index) => derez(item, path + "[" + index + "]"));
    }

    // Handle regular objects
    const result = {};
    Object.keys(value).forEach((key) => {
      result[key] = derez(value[key], path + "[" + JSON.stringify(key) + "]");
    });

    return result;
  }

  return derez(obj, "$");
}

app.get("/:id", (req, res) => {
	
	let url_id = req.params.id;


	if(hosts.has(url_id)){

		let host = hosts.get(url_id);
	

		let request_id = randomUUID();	
		stalled_requests.set(request_id, res);

		host.send(JSON.stringify({
			method:"rest",
			request_id,
			req_obj : decycle(req)
		}))
		
		return
	}	

	//when no such id exists then we return a 404
	res.send(`there is no server running under the url_id ${url_id}`);
})

app.post("/:id", (req, res) => {

	let url_id = req.params.id;

	if(hosts.has(url_id)){
		let host = hosts.get(url_id);
	
		let request_id = randomUUID();
		stalled_requests.set(request_id, res);

		host.send(JSON.stringify({
			method:"rest",
			request_id,
			req_obj : decycle(req)
		}))
	}

	res.send(`there is no server running under the url ${url_id}`)
})


const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const wss = new WebSocketServer({server});


wss.on("connection", socket => {

	socket.on("message", proto_msg => {
		

		const msg = JSON.parse(proto_msg.toString());
			

		try {

			if(msg.method == "client.to_host"){
				let target_host = hosts.get(msg.host_id);
				

				console.log(target_host.send)

				msg.sender_id = socket.client_id;

				target_host.send(JSON.stringify(msg))

			}

			if(msg.method == "host.to_client"){
				let target_client = clients.get(msg.client_id);

				if(!target_client){
					throw("target client does not exist");
				}

				msg.sender_id = socket.host_id;

				target_host.send(JSON.stringify(msg))
			}

			if(msg.method == "keepalive"){
				socket.send(JSON.stringify({"method":"keepalive"}))
			}

			if(msg.method == "host_base_auth"){

				if(msg.id = HOST_BASE_ID){
					host_base = socket;
				}
			}
				

			if(msg.method == "client.login"){
				
				let client_id = randomUUID();
				socket.client_id = client_id;
				clients.set(client_id, socket);

			}
			

			//method that comes back on trying to log in to the host base
			if(msg.method == "host_base.login"){
				if(msg.success){
					socket.host_id = msg.host_id
						
					let host = clients.get(msg.client_id);

					hosts.set(msg.host_id, host);	

					socket.client_id = null;

					clients.delete(msg.client_id)	
				}	

				clients.get(socket.client_id).send("there is no registered id of that host")
				
			}

			if(msg.method == "host.login"){	
				if(host_base){
					let current_id = randomUUID();

					socket.client_id = current_id;
					clients.set(current_id, socket);

					host_base.send(JSON.stringify({
						"method":"host.login",
						"host_id" : msg.host_id,
						"client_id" : current_id
					}))
					return
				}
				throw("no host_base activated")
			}
			
			if(msg.method == "rest"){


				let stalled = stalled_requests.get(msg.request_id);

				stalled.send(msg.body)

			}

		}catch(e){
			socket.send(JSON.stringify(e))
		}
			

		

	})

	socket.on("close", () => {
		if(socket.client_id){
			clients.delete(socket.client_id);
		}
		if(socket.host_id){
			hosts.delete(socket.host_id);
		}
	})
	
})





server.listen(PORT, () => console.log("server up and running"))
