var toobusy = require('toobusy-js');
var user = require('./user-lib.js');
// var mcLib = require('./auto-updater.js');
var fs = require('fs');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var bcrypt = require('bcryptjs');
var randomstring = require('randomstring');
var mkdir = require('mkdirp');
var exec = require('child_process').exec;

var values = [];
var props = [];
var valid = false;
var c_io = require('socket.io-client');
var client;

fs.readFile('properities.txt', 'utf8', function (err, data) {
	if (err) {
		return console.log(err);
	}
	
	values = data.split("\n");
	var c_port = values[0];
	
	// List of dedicated servers
	// SERV 1
	var host = values[1];
	var port = values[2];
	client = c_io('http://' + host + ":" + port);
	
	// Listen to clients
	http.listen(c_port, function(){
		console.log('listening on *:' + c_port);
	});
});

app.use(function(req, res, next) {
	if (toobusy()) {
		res.send(503, "Sorry, either we're too popular or someone is DDoS:ing (Server is overloaded)");
	} else {
		next();
	}
});

// Get line number; for debugging
Object.defineProperty(global, '__stack', {
  get: function(){
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack){ return stack; };
    var err = new Error;
    Error.captureStackTrace(err, arguments.callee);
    var stack = err.stack;
    Error.prepareStackTrace = orig;
    return stack;
  }
});

Object.defineProperty(global, '__line', {
  get: function(){
    return __stack[1].getLineNumber();
  }
});

// MAIN

function Reset() {
	fs.readFile('bans.txt', 'utf8', function(err, data) {
		if(data != '') {
			var items = data.split("\n");
			for(i = 0; i < items.length; i++) {
				items[i] = items[i].split(" ");
			}
			
			for(i = 0; i < items.length; i++) {
				items[i][1] = 0;
				items[i] = items[i].join(" ");
			}
			
			data = items.join("\n");
			fs.writeFile('bans.txt', data, function(err, data) {
				return;
			});
		}
	});
}

setInterval(Reset, 4096);

// Send data to client
function sendToClient(name, data, id) {
	if(id) {
		io.emit(name, {"success": false, "reason": data, "id": id});
	} else if(data) {
		io.emit(name, {"success": true, "info": data});
	} else {
		io.emit(name, {"success": true});
	}
}

function boolify(obj, ignoreCase) {
	if(ignoreCase) {
		str = str.toLowerCase();
	}
	
	if(obj == 'true' || obj == 1 || obj == '1') {
		return true;
	} else {
		return false;
	}
}

io.on('connection', function(socket){
	var IP = socket.request.connection.remoteAddress;
	
	// REGISTRATION
	socket.on('register', function(data){
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return sendToClient('reg-complete', "Please don't overload our servers.", '0.' + __line);
			} else if(banned[1]) {
				user.addIP(IP, function(err) {
					if(err) {
						console.log(err);
					}
					
					user.incrUsage(IP, 16);
				});
			} else {
				user.incrUsage(IP, 16);
			}
			
			if(typeof data.email != 'string' || typeof data.pass != 'string') {
				return sendToClient('reg-complete', "Invalid email and/or password.", '1.' + __line);
			} else if(((data.email).indexOf("@") != -1) && ((data.email).indexOf(".") != -1)) {
				bcrypt.genSalt(10, function(err, salt) {
					if(err) {
						return sendToClient('reg-complete', err, '2.' + __line);
					}
					
					// Hash password
					bcrypt.hash(data.pass, salt, function(err, hash) { 
						if(err) {
							return sendToClient('reg-complete', err, '3.' + __line);
						}
						
						// Search the database to check if the user already exists
						user.find(data.email, function(err, found, dat, last, usr) {
							if(err) {
								return sendToClient('reg-complete', err, '4.' + __line);
							}
							
							if(found) {
								return sendToClient('reg-complete', "An account with this email has already been registered...", '5.' + __line);
							}
							
							// Check other databases
							client.emit('find-user', {"email": data.email});
							
							client.on('done-looking', function(data) {
								if(data.err) {
									return sendToClient('reg-complete', data.err, '6.' + __line);
								}
								
								if(data.found) {
									return sendToClient('reg-complete', "An account with this email has already been registered...", '7.' + __line);
								}
							
								// User doesn't exist yet, register new user
								// Add email & hash to user file
								fs.writeFile("users/" + usr + ".txt", data.email + "\n" + hash, function(err, data) {
									if(err) {
										return sendToClient('reg-complete', err, '8.' + __line);
									}
									
									// Make sure next user registered doesn't get the same user id
									fs.writeFile("users/user.txt", Number(usr) + 1, function(err, data) {
										if(err) {
											return sendToClient('reg-complete', err, '9.' + __line);
										}
										
										sendToClient('reg-complete');
									});
								});
							});
						});
					});
				});
			} else {
				sendToClient('reg-complete', "This is impossible unless you hacked :/", '10.' + __line);
			}
		});
	});
	
	// LOGIN
	socket.on('login', function(data){
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return sendToClient('login-complete', "Please don't overload our servers.", '0.' + __line);
			} else if(banned[1]) {
				user.addIP(IP, function(err) {
					if(err) {
						console.log(err);
					}
					
					user.incrUsage(IP, 8);
				});
			} else {
				user.incrUsage(IP, 8);
			}
			
			if(typeof data.email != 'string' || typeof data.pass != 'string') {
				return sendToClient('login-complete', "Invalid email and/or password.", '1.' + __line);
			} else if(((data.email).indexOf("@") != -1) && ((data.email).indexOf(".") != -1)) {
				user.find(data.email, function(err, found, dat, usr) {
					if(err) {
						return sendToClient('login-complete', err, '2.' + __line);
					}
					
					if(found) {
						bcrypt.compare(data.pass, dat[1].trim(), function(err, valid) {
							if(err) {
								return sendToClient('login-complete', err, '3.' + __line);
							}
							
							if(valid) {
								var userSession = randomstring.generate(16);
								userSession += Math.round(((new Date()).getTime() / 60000) + 60*24);
								dat[2] = userSession;
								
								fs.writeFile("users/" + usr + "/user.txt", dat.join("\n"), function(err, data) {
									if(err) {
										return sendToClient('login-complete', err, '4.' + __line);
									}
									
									sendToClient('login-complete', {"user": usr, "session": userSession});
								});
							} else {
								return sendToClient('login-complete', "Invalid email and/or password", '4.' + __line);
							}
						});
					} else {
						client.emit('login-user', {"email": data.email, "pass": data.pass});
						
						client.on('login-done', function(data) {
							if(data.err) {
								return sendToClient('login-complete', data.err, '5.' + __line + " " + data.id);
							}
								
							if(data.matching) {
								io.emit('login-complete', {"success": true, "session": data.session});
							} else {
								return sendToClient('login-complete', "Incorrect email and/or password", '6.' + __line);
							}
						});
					}
				});
			} else {
				sendToClient('login-complete', "Invalid email.", '7.' + __line);
			}
		});
	});
	
	// SERVER CREATION
	socket.on('create-serv', function(data){
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return sendToClient('creation-complete', "Please don't overload our servers.", '0.' + __line);
			} else if(banned[1]) {
				user.addIP(IP, function(err) {
					if(err) {
						console.log(err);
					}
					
					user.incrUsage(IP, 16);
				});
			} else {
				user.incrUsage(IP, 16);
			}
			
			if(typeof data.session != 'string' || (data.session).length < 24) {
				return sendToClient('creation-complete', "Invalid session ID.", '1.' + __line);
			} else if(Math.round((new Date).getTime() / 60000 > (data.session).substring(16))) {
				return sendToClient('creation-complete', "Session has expired.", '2.' + __line);
			} else if(data.type < 0 || data.type > 2) {
				return sendToClient('creation-complete', "Invalid server type.", '3.' + __line);
			} else if(typeof data.id == 'number') {
				
				// User id specified, get user session
				user.get(data.id, function(err, dat) {
					if(err) {
						return sendToClient('creation-complete', err, '4.' + __line);
					}
					
					// Check if session is valid
					if(dat[2].trim() == data.session) {
						
						// Session valid, create server
						mkdir("users/" + data.id + "/server", function(err) {
							if(err) {
								return sendToClient('creation-complete', err, '5.' + __line);
							}
							
							fs.writeFile("users/" + data.id + "/server/.properities", "0\n" + data.type + "\n0\n0", function(err, dat) {
								if(err) {
									return sendToClient('creation-complete', err, '6.' + __line);
								}
								
								if(data.type == 0) {
									mcLib.addJar("users/" + data.id + "/server", function(err) {
										if(err) {
											return sendToClient('creation-complete', err, '7' + __line);
										}
										
										sendToClient('creation-complete');
									});
								}
							});
						});
					} else {
						sendToClient('creation-complete', "Unknown session.", '8.' + __line);
					}
				});
			} else {
				
				// User id not specified, look through every user file for a matching session
				user.findSession(data.session, function(err, found, usr) {
					if(err) {
						return sendToClient('creation-complete', err, '9.' + __line);
					}
					
					if(found) {
						// Session valid, create server
						mkdir("users/" + usr + "/server", function(err) {
							if(err) {
								return sendToClient('creation-complete', err, '10.' + __line);
							}
							
							fs.writeFile("users/" + usr + "/server/.properities", "0\n" + data.type + "\n0\n0", function(err, dat) {
								if(err) {
									return sendToClient('creation-complete', err, '11.' + __line);
								}
								
								if(data.type == 0) {
									mcLib.addJar("users/" + usr + "/server", function(err) {
										if(err) {
											return sendToClient('creation-complete', err, '12.' + __line);
										}
										
										sendToClient('creation-complete');
									});
								}
							});
						});
					} else {
						sendToClient('creation-complete', "Unknown session.", '13.' + __line);
					}
				});
			}
		});
	});
	
	// CONTROL PANEL
	socket.on('start-server', function(data){
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return sendToClient('server-checked', "Please don't overload our servers.", '0.' + __line);
			} else if(banned[1]) {
				user.addIP(IP, function(err) {
					if(err) {
						console.log(err);
					}
					
					user.incrUsage(IP, 8);
				});
			} else {
				user.incrUsage(IP, 8);
			}
			
			if(typeof data.server != 'number' || typeof data.session != 'string') {
				return sendToClient('server-checked', "Invalid server ID and/or session ID.", '1.' + __line);
			}
			
			fs.readFile('servers/' + data.server + '/.properities', 'utf8', function(err, dat) {
				if (err) {
					return sendToClient('server-checked', err, '2.' + __line);
				}
				
				props = dat.split("\n");
				var serv_isSleeping = boolify(props[0].trim());
				var serv_type = props[1].trim();
				var serv_typeCS = serv_type.substring(1, 2);
				var serv_rank = props[2].trim();
				var serv_timeOn = props[3].trim(); // Will not be used in this case, it's just here so we can remember it
				var serv_lastOn = props[4].trim(); // Will not be used in this case, it's just here so we can remember it
				var serv_ram = [[256, 512, 1024, 2048, 4096], [512, 1024, 2048, 4096], [512, 1024, 2048, 4096]];
				
				fs.readFile('users/' + data.server + ".txt", 'utf8', function(err, dat) {
					props = dat.split("\n");
					var user_session = props[2].trim();
					
					// Check if session is matching
					if(user_session == data.session) {
						
						// Run server
						if(serv_type == 0) {
							// Minecraft
							
							exec("java -Xmx" + serv_ram[serv_type][serv_rank] + "M -Xms" + serv_ram[serv_type][serv_rank] + "M -jar servers/" + data.server + "/minecraft_server.jar nogui", function(err2, out, stderr) {
								if(err2) {
									return sendToClient('server-checked', stderr, '3.' + __line);
								}
								
								sendToClient('server-checked', serv_type);
							});
						} else if(serv_type.substring(0, 1) == 1) {
							// CS:GO
							
							if(serv_typeCS == 1) { // Classic Competive
								exec("./srcds_run -game csgo -console -usercon +game_type 0 +game_mode 1 +mapgroup mg_active +map de_dust2", function(err, out, stderr) {
									if(err) {
										return sendToClient('server-checked', stderr, '4.' + __line);
									}
									
									sendToClient('server-checked', serv_type);
								});
							} else if(serv_typeCS == 2) { // Arms Race
								exec("./srcds_run -game csgo -console -usercon +game_type 1 +game_mode 0 +mapgroup mg_armsrace +map ar_shoots", function(err, out, stderr) {
									if(err) {
										return sendToClient('server-checked', stderr, '5.' + __line);
									}
									
									sendToClient('server-checked', serv_type);
								});
							} else if(serv_typeCS == 3) { // Demolition
								exec("./srcds_run -game csgo -console -usercon +game_type 1 +game_mode 1 +mapgroup mg_demolition +map de_lake", function(err, out, stderr) {
									if(err) {
										return sendToClient('server-checked', stderr, '6.' + __line);
									}
									
									sendToClient('server-checked', serv_type);
								});
							} else if(serv_typeCS == 4) { // Deathmatch
								exec("./srcds_run -game csgo -console -usercon +game_type 1 +game_mode 2 +mapgroup mg_allclassic +map de_dust", function(err, out, stderr) {
									if(err) {
										return sendToClient('server-checked', stderr, '7.' + __line);
									}
									
									sendToClient('server-checked', serv_type);
								});
							} else { // Classic Casual
								exec("./srcds_run -game csgo -console -usercon +game_type 0 +game_mode 0 +mapgroup mg_active +map de_dust2", function(err, out, stderr) {
									if(err) {
										return sendToClient('server-checked', stderr, '8.' + __line);
									}
									
									sendToClient('server-checked', serv_type);
								});
							}
						} else if(serv_type == 2) {
							// TF2
							return sendToClient('server-checked', "WIP", '9.' + __line);
						} else {
							return sendToClient('server-checked', "Unknown server type", '10.' + __line);
						}
					} else {
						return sendToClient('server-checked', "ACCESS DENIED. But seriously, start your own server instead of others :P", '11.' + __line);
					}
				});
			});
		});
	});
	
	socket.on('stop-server', function(data) {
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return sendToClient('server-stopped', "Please don't overload our servers.", '0.' + __line);
			} else if(banned[1]) {
				user.addIP(IP, function(err) {
					if(err) {
						console.log(err);
					}
					
					user.incrUsage(IP, 8);
				});
			} else {
				user.incrUsage(IP, 8);
			}
			
			if(typeof data.server != 'number' || typeof data.session != 'string') {
				return sendToClient('server-stopped', "Invalid server ID and/or session ID.", '1.' + __line);
			}
			
			fs.readFile('servers/' + data.server + '/.properities', 'utf8', function(err, dat) {
				if (err) {
					return sendToClient('server-stopped', err, '2.' + __line);
				}
				
				props = dat.split("\n");
				var serv_isSleeping = boolify(props[0].trim());
				var serv_type = props[1].trim();
				var serv_typeCS = serv_type.substring(1, 2);
				var serv_rank = props[2].trim();
				var serv_timeOn = props[3].trim();
				var serv_IP = "";
				var rcon_port = 0;
				var rcon_pass = "";
				var serv_ram = [[256, 512, 1024, 2048, 4096], [512, 1024, 2048, 4096], [512, 1024, 2048, 4096]];
				
				fs.readFile('users/' + data.server + ".txt", 'utf8', function(err, dat) {
					props = dat.split("\n");
					var user_session = props[2].trim();
					
					// Check if session is matching
					if(user_session == data.session) {
						if(serv_type == 0) {
							// Minecraft
							
							fs.readFile('servers/' + data.server + '/server.properities', 'utf8', function(err, data) {
								if(err) {
									return sendToClient('server-stopped', err, '3.' + __line);
								}
								
								props = data.split("\n");
								for(i = 0; i < props.length; i++) {
									if(props[i].substring(0, 9) == 'server-ip') {
										serv_IP = props[i].substring(10);
									} else if(props[i].substring(0, 9) == 'rcon.port') {
										rcon_port = props[i].substring(10);
									} else if(props[i].substring(0, 13) == 'rcon.password') {
										rcon_pass = props[i].substring(14);
									}
								}
								
								var conn = new Rcon(serv_IP, rcon_port, rcon_pass);
								
								conn.on('auth', function() {
									conn.send('stop');
								}).on('error', function(err) {
									sendToClient('server-stopped');
								});
								
								conn.connect();
							});
						}
					}
				});
			});
		});
	});
	
	socket.on('console-cmd', function(data) {
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return sendToClient('console-query', "Please don't overload our servers.", '0.' + __line);
			} else if(banned[1]) {
				user.addIP(IP, function(err) {
					if(err) {
						console.log(err);
					}
					
					user.incrUsage(IP, 4);
				});
			} else {
				user.incrUsage(IP, 4);
			}
			
			if(typeof data.session != 'string' || (data.session).length < 24) {
				return sendToClient('console-query', "Invalid session ID.", '1.' + __line);
			} else if(Math.round((new Date).getTime() / 60000 > (data.session).substring(16))) {
				return sendToClient('console-query', "Session has expired.", '2.' + __line);
			} else if(typeof data.id == 'number') {
				
				// Get user data
				user.get(data.id, function(err, line, dat) {
					if(err) {
						// User most likely not found on this server;
						// look on other server(s) before sending error in case it's there
						// WIP; for now it will send error anyway
						return sendToClient('console-query', err, '3.' + __line + '.' + line);
					}
					
					// Check if session is valid
					if(dat[2].trim() == data.session) {
						
						// Session valid, get server data
						fs.readFile('servers/' + data.server + '/.properities', 'utf8', function(err, dat) {
							if (err) {
								return sendToClient('console-query', err, '4.' + __line);
							}
							
							props = data.split("\n");
							var serv_type = props[1].trim();
							var serv_IP = "";
							var rcon_port = 0;
							var rcon_pass = "";
							
							if(serv_type == 0) {
								
								// Minecraft
								fs.readFile('servers/' + data.id + '/server.properities', 'utf8', function(err, dat) {
									if(err) {
										return sendToClient('console-query', err, '5.' + __line);
									}
									
									props = dat.split("\n");
									for(i = 0; i < props.length; i++) {
										if(props[i].substring(0, 9) == 'server-ip') {
											serv_IP = props[i].substring(10);
										} else if(props[i].substring(0, 9) == 'rcon.port') {
											rcon_port = props[i].substring(10);
										} else if(props[i].substring(0, 13) == 'rcon.password') {
											rcon_pass = props[i].substring(14);
										}
									}
									
									var conn = new Rcon(serv_IP, rcon_port, rcon_pass);
									
									conn.on('auth', function() {
										conn.send(data.cmd);
									}).on('response', function(data) {
										sendToClient('console-query', data);
									}).on('error', function(err) {
										return sendToClient('console-query', err, '6.' + __line);
									});
									
									conn.connect();
								});
							} else {
								return sendToClient('console-query', "This game does not support RCON :(", '7.' + __line);
							}
						});
					}
			} else {
				return sendToClient('console-query', "Invalid user id.", '8.' + __line);
			}
		});
	});
	
	// INDEX
	
	socket.on('get-main-stats', function(data) {
		user.getTotal(function(err, data) {
			sendToClient('main-stats', {"servers": data});
			// WIP: Get RAM usage & other stats
		});
	});
});