const axios = require('axios');
const SockJS = require('sockjs-client');
const events = require('events');
const utils = require('./utils.js');

var sock = null;

const GET_PERFORMANCE_INTERVAL = 15 * 1000;
var _authenticated = false;
var _droppedFramesLatest = 0;
var _messageMap = new Map();
var _interval = null;
var _servers = [];
var _userContinent;
var _ignoreNextDroppedFrames = false;
var _streamDiagnosticsData = {};
var _eventEmitter = new events.EventEmitter();
var config = {
	token: '',
	ip: '127.0.0.1',
	port: 59650
};

const app = require('./app.js');

if (app.isAlreadyOpen()) {
	// Quit here, no need to connect to APIs
	return app.getApp().quit();
}

app.init(_eventEmitter);
utils.collectData.init(_eventEmitter);

var _id = 0;
function getID() {
	_id++;
	return _id;
}

axios.get('https://ingest.twitch.tv/ingests').then(function(response) {
	//console.log(response.data);
	_servers = response.data.ingests;
	console.log('Saved Twitch ingest server list');
}).catch(function(error) {
	console.error('Unable to query Twitch API');
	console.error(error);
});

axios.get('https://cf-api.framed-app.com/get-location').then(function(response) {
	console.log(response.data);
	_userContinent = response.data.continent;
	console.log('Saved user continent');
}).catch(function(error) {
	console.error('Unable to query Framed API to get user location');
	console.error(error);
});

function initStreamDiagnosticsData() {
	_streamDiagnosticsData = {
		frames: {},
		pings: {
			twitch: {},
			google: {},
			truewinter: {},
			framed: {},
		},
		processes: {},
		system: {}
	};
}

initStreamDiagnosticsData();

function connectToWS() {
	if (sock !== null) return;
	if (!config.token) return _eventEmitter.emit('error', 'Please open settings and set the token');

	sock = new SockJS(`http://${config.ip}:${config.port}/api`);

	sock.onopen = function() {
		console.log('open');

		var _authRequest = utils.createJRPCMessage('auth', {
			resource: 'TcpServerService',
			args: [config.token]
		}, getID());

		_messageMap.set(_authRequest.id, 'auth');
		send(_authRequest);

		var _request = utils.createJRPCMessage('streamingStatusChange', {
			resource: 'StreamingService',
		}, getID());

		_messageMap.set(_request.id, 'stateevent');
		send(_request);

		var _stateRequest = utils.createJRPCMessage('getModel', {
			resource: 'StreamingService'
		}, getID());
		_messageMap.set(_stateRequest.id, 'state');
		send(_stateRequest);
	};

	sock.onmessage = function(e) {
		var data = JSON.parse(e.data);
		//console.log(data);
		if (data.id !== null && !_messageMap.has(data.id)) return;

		if (data.error) {
			console.error(data.error);
			_eventEmitter.emit('error', data.error.message);
			sock.close();
			return;
		}

		if (data.id === null) {
			handleEvent(data.result);
			return;
		}

		switch (_messageMap.get(data.id)) {
			case 'auth':
				_authenticated = true;
				console.log('Connected to Streamlabs OBS');
				_eventEmitter.emit('connectedState', true);
				break;
			case 'performance':
				handlePerformanceData(data.result);
				break;
			case 'state':
				if (data.result.streamingStatus === 'live' && _interval === null) {
					console.log('App opened after streamer went live');
					// Don't count dropped frames from before Framed was opened
					_ignoreNextDroppedFrames = true;
					getPerformance();
					_interval = setInterval(function() {
						getPerformance();
					}, GET_PERFORMANCE_INTERVAL);
				}
				break;
		}

		_messageMap.delete(data.id);
	};

	sock.onclose = function(e) {
		console.log('close');
		//console.log(e);
		clearInterval(_interval);
		_interval = null;
		sock = null;
		_authenticated = false;

		_eventEmitter.emit('connectedState', false);

		if (e.code === 1002 || e.code === 2000) {
			_eventEmitter.emit('error', `Failed to connect to Streamlabs OBS. Error code: ${e.code} (${e.reason})`);
		}
	};

	sock.onerror = function(err) {
		console.log('error');
		console.error(err);
		sock.close();
	};
}

_eventEmitter.on('isConnected', function() {
	if (sock !== null && _authenticated) {
		_eventEmitter.emit('connectedState', true);
	} else {
		_eventEmitter.emit('connectedState', false);
	}
});

_eventEmitter.on('doSetConfig', (_thisConfig) => {
	config = _thisConfig;
});

_eventEmitter.on('doConnect', () => {
	connectToWS();
});

_eventEmitter.on('doDisconnect', () => {
	if (sock === null) return;
	sock.close();
});

_eventEmitter.on('startCPPApi', () => {
	utils.collectData.startTimer();
});

_eventEmitter.on('stopCPPApi', () => {
	utils.collectData.stopTimer();
});

function handleEvent(data) {
	if (data.emitter === 'STREAM') {
		switch (data.data) {
			case 'live':
				if (_interval === null) {
					_streamDiagnosticsData.frames = {};
					_droppedFramesLatest = 0;
					initStreamDiagnosticsData();
					_interval = setInterval(function() {
						getPerformance();
					}, GET_PERFORMANCE_INTERVAL);
				}
				break;
			case 'offline':
				if (_interval !== null) {
					clearInterval(_interval);
					_interval = null;
				}
				break;
		}
	}
}

function send(json) {
	if (!sock || !json) return;
	sock.send(JSON.stringify(json));
}

function getPerformance() {
	if (!_authenticated) return;

	var _performanceRequest = utils.createJRPCMessage('getModel', { resource: 'PerformanceService' }, getID());
	_messageMap.set(_performanceRequest.id, 'performance');
	send(_performanceRequest);
}

function handlePerformanceData(data) {
	var timestamp = Date.now();
	_eventEmitter.emit('frame', {
		x: timestamp,
		y: data.numberDroppedFrames
	});

	if (data.numberDroppedFrames > _droppedFramesLatest && !_ignoreNextDroppedFrames) {
		_droppedFramesLatest = data.numberDroppedFrames;
		_streamDiagnosticsData.frames[timestamp] = data.numberDroppedFrames;
		runDiagnostics(timestamp);
	}

	if (_ignoreNextDroppedFrames) {
		_droppedFramesLatest = data.numberDroppedFrames;
		_ignoreNextDroppedFrames = false;
	}
}

var _latestCPPData = null;

_eventEmitter.on('cppData', (data) => {
	_latestCPPData = data;
});

var _twitchPinged = 0;
var _googlePinged = false;
var _twPinged = false;
var _framedPinged = false;

_eventEmitter.on('diagnosticsPing', (ping, timestamp) => {
	switch (ping) {
		case 'twitch':
			if (_twitchPinged !== 3) {
				_twitchPinged++;
			}
			break;
		case 'google':
			_googlePinged = true;
			break;
		case 'truewinter':
			_twPinged = true;
			break;
		case 'framed':
			_framedPinged = true;
			break;
	}

	if (_twitchPinged === 3 && _googlePinged && _twPinged && _framedPinged) {
		sendDiagnosticsToUI(timestamp);
		_twitchPinged = 0;
		_googlePinged = false;
		_twPinged = false;
		_framedPinged = false;
	}
});

function runDiagnostics(timestamp) {
	if (_latestCPPData !== null) {
		_streamDiagnosticsData.system[timestamp] = _latestCPPData.system;
	}

	var _pingServers = utils.getRandomTwitchServers(_servers, _userContinent);
	_streamDiagnosticsData.pings.twitch[timestamp] = [];

	for (var i = 0; i < _pingServers.length; i++) {
		let _pingLocation = utils.parseCity(_pingServers[i].name);
		console.log(`Pinging Twitch ingest server in ${_pingLocation}`);

		utils.tcpPing(utils.parseHost(_pingServers[i].url_template), 1935, function(err, data) {
			if (err) {
				_streamDiagnosticsData.pings.twitch[timestamp].push({
					name: _pingLocation,
					average: -1
				});

				_eventEmitter.emit('diagnosticsPing', 'twitch', timestamp);
				return console.error(err);
			}

			_streamDiagnosticsData.pings.twitch[timestamp].push({
				name: _pingLocation,
				average: data.avg ? Math.round(data.avg * 100) / 100 : -1
			});

			_eventEmitter.emit('diagnosticsPing', 'twitch', timestamp);
		});
	}

	utils.tcpPing('google.com', 443, function(err, data) {
		if (err) {
			_streamDiagnosticsData.pings.google[timestamp] = -1;
			_eventEmitter.emit('diagnosticsPing', 'google', timestamp);
			return console.error(err);
		}

		_streamDiagnosticsData.pings.google[timestamp] = data.avg ? Math.round(data.avg * 100) / 100 : -1;
		_eventEmitter.emit('diagnosticsPing', 'google', timestamp);
	});

	utils.tcpPing('truewinter.dev', 443, function(err, data) {
		if (err) {
			_streamDiagnosticsData.pings.truewinter[timestamp] = -1;
			_eventEmitter.emit('diagnosticsPing', 'truewinter', timestamp);
			return console.error(err);
		}

		_streamDiagnosticsData.pings.truewinter[timestamp] = data.avg ? Math.round(data.avg * 100) / 100 : -1;
		_eventEmitter.emit('diagnosticsPing', 'truewinter', timestamp);
	});

	utils.tcpPing('framed-app.com', 443, function(err, data) {
		if (err) {
			_streamDiagnosticsData.pings.framed[timestamp] = -1;
			_eventEmitter.emit('diagnosticsPing', 'framed', timestamp);
			return console.error(err);
		}

		_streamDiagnosticsData.pings.framed[timestamp] = data.avg ? Math.round(data.avg * 100) / 100 : -1;
		_eventEmitter.emit('diagnosticsPing', 'framed', timestamp);
	});
}

function sendDiagnosticsToUI(timestamp) {
	var _emitData = {
		timestamp,
		frames: 0,
		pings: {
			twitch: [],
			google: 0,
			truewinter: 0,
			framed: 0
		},
		processes: {},
		system: {},
	};

	_emitData.frames = _streamDiagnosticsData.frames[timestamp];
	_emitData.pings.twitch = _streamDiagnosticsData.pings.twitch[timestamp];
	_emitData.pings.google = _streamDiagnosticsData.pings.google[timestamp];
	_emitData.pings.truewinter = _streamDiagnosticsData.pings.truewinter[timestamp];
	_emitData.pings.framed = _streamDiagnosticsData.pings.framed[timestamp];
	_emitData.system = _streamDiagnosticsData.system[timestamp];

	_eventEmitter.emit('diagnostics', _emitData);
}