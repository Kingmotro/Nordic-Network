var path = require('path');
var user = require('./user-extras.js');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var bcrypt = require('bcryptjs');
var toobusy = require('toobusy-js');
var randomstring = require('randomstring');

var values = [];
var props = [];
var valid = false;

fs.readFile('../../public/properities.txt', 'utf8', function (err, data) {
	if (err) {
		return console.log(err);
	}
	values = data.split("\n");
	var port = values[1];
	http.listen(port, function(){
		console.log('listening on *:' + port);
	});
});

app.use(function(req, res, next) {
	if (toobusy()) {
		res.send(503, "Sorry, either we're too popular or someone is DDoS:ing (Server is overloaded)");
	} else {
		next();
	}
});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/test-client-login.html'));
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

function printError(reason, id) {
	io.emit('login-complete', {"success": false, "reason": reason, "id": id});
}

io.on('connection', function(socket){
	var IP = socket.request.connection.remoteAddress;
	socket.on('login', function(data){
		user.isBanned(IP, function(err, banned) {
			if(err) {
				return console.log(err);
			}
			
			if(banned[0]) {
				return printError("Please don't overload our servers.", Number('0.' + __line));
			} else if(banned[1] == 0) {
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
				return printError("Invalid email and/or password.", Number('1.' + __line));
			} else if(((data.email).indexOf("@") != -1) && ((data.email).indexOf(".") != -1)) {
				fs.readdir("../users", function(err, li) {
					if(err) {
						return printError(err, Number('2.' + __line));
					}
					
					li.forEach(function(file) {
						if(file != 'user.txt') {
							var dat = fs.readFileSync("../users/" + file, 'utf8');
							var currentFile = file.substring(0, file.length - 4);
							var esc = false;
							values = dat.split("\n");
							if(values[0].trim() == data.email) {
								dat = bcrypt.compareSync(data.pass, values[1].trim());
								if(dat) {
									var userSession = randomstring.generate(16);
									userSession += Math.round(((new Date()).getTime() / 60000) + 60*24);
									data = fs.readFileSync("../servers/" + currentFile + "/.properities", 'utf8');
									values = data.split("\n");
									values[0] = userSession;
										
									fs.writeFileSync("../servers/" + currentFile + "/.properities", values.join("\n"));
									io.emit('login-complete', {"success": true, "session": userSession});
									valid = true;
								} else {
									valid = false;
								}
								return esc = true;
							}
						}
							
						if(esc) {
							return;
						}
					});
				
					if(!valid) {
						return printError("Incorrect email and/or password", Number('3.' + __line));
					}
				});
			} else {
				printError("Invalid email.", Number('4.' + __line));
			}
		});
	});
});
