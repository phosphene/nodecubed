var WEB_SOCKET_SWF_LOCATION = "js/WebSocketMain.swf";
if (typeof console == "undefined") var console = { log: function(m) {} }; 

var XmpClient = base2.Base.extend({

	socket : null,
	
	connect: function () {
		//this.socket = io.connect();
		this.socket = io.connect('http://localhost:8081', { 'connect timeout': 5000, 'reconnect':false }); 
		var that = this;
		this.socket.on('connected', function (data) {
			console.log('socket.io connected');			
			that.connected();
		});
		
		this.socket.on('value', function (data) {
			that.value(data);
		});

	},
	
	send: function (messageType, message) {
		this.socket.emit(messageType, message);
	},
	
	connected: function () {
		
	}

});
