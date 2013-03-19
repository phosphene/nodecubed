var express = require('express')
  , http = require('http')
  , app = express()
  , server = http.createServer(app).listen(8081)
  , io = require('socket.io').listen(server)
  ;

var	xmp  = require(__dirname + "/xmp");

var XMP_SERVER   = "b7.colo.ucirrus.com";
var XMP_PORT     = 9128;
var XMP_CATALOG  = "NSN";
var XMP_USER     = "system";
var XMP_PASSWORD = "aardvark";

var numConnections = 0;

function XmpResponse () {}

XmpResponse.prototype = new process.EventEmitter();
XmpResponse.prototype.status = function (client,n) {
	var self = this;
	this.interval = setInterval(function(){
		if (client.responsePending) self.emit('pending');
		else {
			clearInterval(self.interval);
			self.emit('done');
		}
	},n);	
}

app.use(express.static(__dirname + "/client"));

app.get('/rest/data', function(req, res) {
	var xmpClient = getXmpClient(XMP_SERVER,XMP_PORT,XMP_CATALOG,XMP_USER,XMP_PASSWORD);
	var label = "DATA_LABEL";
	var sql = "select database_name from catalog.adbtbl";
	console.log(sql);
	xmpClient.onlogin = function () {
		var data = new Array();
		var xmpResponse = new XmpResponse();
		xmpClient.execute(label, sql, function(){
			var n = xmpClient.getNumRowResponses(label);
			for (var i = 0; i < n; i++) {
				var databaseName = xmpClient.getRowData(i,label)[0];
				var row = {"databaseName":databaseName};
				console.log(row);
				data.push(row);
			}
			xmpClient.clearRowData(label);
		});
		xmpResponse.on('done', function(){
			res.send(data);
		});
		xmpResponse.status(xmpClient, 100);		
	};
});

//io.set('heartbeat timeout',2);
//last argument to sockets.on controls speed of emission
io.set('log level',2);

io.sockets.on('connection', function (socket) {
	var that = socket;
	socket.i = 0;
	socket.xmpIntervalId = setInterval(function(){
		var v = getRandomValues(10);
		console.log(v);
		socket.volatile.emit('value',v);

	}, 30);

	socket.on('disconnect', function() {
		console.log('close, xmpIntervalId = ' + this.xmpIntervalId);
		clearInterval(this.xmpIntervalId);
		this.xmpIntervalId = 0;
	});
});

function getRandomValues (n) {
	var values = [];
	var i = 0;
	for (var x = 0; x < n; x++) {
		f = (x == 4) ? 10 : 1;
		values.push(Math.max(-10, Math.min(10,f * .8 * Math.random() - .4 + .2 * Math.cos(i += x * .02))));		
	}
	return values;
}
