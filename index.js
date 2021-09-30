//const JSONRPCClient = require('json-rpc-2.0').JSONRPCClient;
const axios = require('axios');
const SockJS = require('sockjs-client');
const utils = require('./utils.js');
const config = require('./config.json');

var sock = new SockJS(`http://${config.host}:${config.port}/api`);

const GET_PERFORMANCE_INTERVAL = 15 * 1000;
var _authenticated = false;
var _droppedFramesLatest = 0;
var _messageMap = new Map();
var _interval = null;
var _servers = [];
var _userContinent;
var _ignoreNextDroppedFrames = false;
var _streamDiagnosticsData = {};

axios.get('https://ingest.twitch.tv/ingests').then(function(response) {
	//console.log(response.data);
	_servers = response.data.ingests;
	console.log('Saved Twitch ingest server list');
}).catch(function(error) {
	console.error('Unable to query Twitch API');
	console.error(error);
});

axios.get('https://framed-api.truewinter.dev/').then(function(response) {
	console.log(response.data);
	_userContinent = response.data.continent;
	console.log('Saved user continent');
}).catch(function(error) {
	console.error('Unable to query Framed API');
	console.error(error);
});

function initStreamDiagnosticsData() {
	_streamDiagnosticsData = {
		frames: {},
		pings: {
			twitch: {},
			google: {},
			truewinter: {}
		},
		processes: {},
		network: {}
	};
}

initStreamDiagnosticsData();

sock.onopen = function() {
	console.log('open');

	var _authRequest = utils.createJRPCMessage('auth', {
		resource: 'TcpServerService',
		args: [config.token]
	});

	_messageMap.set(_authRequest.id, 'auth');
	send(_authRequest);

	var _request = utils.createJRPCMessage('streamingStatusChange', {
		resource: 'StreamingService',
	});

	_messageMap.set(_request.id, 'stateevent');
	send(_request);

	var _stateRequest = utils.createJRPCMessage('getModel', {
		resource: 'StreamingService'
	});
	_messageMap.set(_stateRequest.id, 'state');
	send(_stateRequest);
};

sock.onmessage = function(e) {
	var data = JSON.parse(e.data);
	console.log(data);
	if (data.id !== null && !_messageMap.has(data.id)) return;

	if (data.error) {
		console.error(data.error);
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

sock.onclose = function() {
	console.log('close');
	clearInterval(_interval);
	_interval = null;
};

sock.onerror = function(err) {
	console.log('error');
	console.error(err);
	sock.close();
};

function send(json) {
	sock.send(JSON.stringify(json));
}

function getPerformance() {
	if (!_authenticated) return;

	var _performanceRequest = utils.createJRPCMessage('getModel', { resource: 'PerformanceService' });
	_messageMap.set(_performanceRequest.id, 'performance');
	send(_performanceRequest);
}

function handlePerformanceData(data) {
	console.log(data);
	if (data.numberDroppedFrames > _droppedFramesLatest && !_ignoreNextDroppedFrames) {
		var timestamp = Date.now();
		_droppedFramesLatest = data.numberDroppedFrames;
		_streamDiagnosticsData.frames[timestamp] = data.numberDroppedFrames;
		runDiagnostics(timestamp);
	}

	if (_ignoreNextDroppedFrames) {
		_ignoreNextDroppedFrames = false;
	}
}

function runDiagnostics(timestamp) {
	var _pingServers = utils.getRandomTwitchServers(_servers, _userContinent);
	_streamDiagnosticsData.pings.twitch[timestamp] = [];
	console.log(_pingServers);
	for (var i = 0; i < _pingServers.length; i++) {
		let _pingLocation = utils.parseCity(_pingServers[i].name);
		console.log(`Pinging Twitch ingest server in ${_pingLocation}`);

		utils.tcpPing(utils.parseHost(_pingServers[i].url_template), 1935, function(err, data) {
			if (err) {
				return console.error(err);
			}

			_streamDiagnosticsData.pings.twitch[timestamp].push({
				name: _pingLocation,
				average: Math.round(data.avg * 100) / 100
			});
		});
	}

	utils.tcpPing('google.com', 443, function(err, data) {
		if (err) {
			return console.error(err);
		}

		_streamDiagnosticsData.pings.google[timestamp] = Math.round(data.avg * 100) / 100;
	});

	utils.tcpPing('truewinter.dev', 443, function(err, data) {
		if (err) {
			return console.error(err);
		}

		_streamDiagnosticsData.pings.truewinter[timestamp] = Math.round(data.avg * 100) / 100;
	});

	console.log(_streamDiagnosticsData);
}

// https://stackoverflow.com/a/3955096
Array.prototype.remove = function() {
	// eslint-disable-next-line prefer-rest-params
	var what, a = arguments, L = a.length, ax;
	while (L && this.length) {
		what = a[--L];
		while ((ax = this.indexOf(what)) !== -1) {
			this.splice(ax, 1);
		}
	}
	return this;
};
