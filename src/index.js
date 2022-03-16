const axios = require('axios');
const events = require('events');
const utils = require('./utils.js');
const collectData = require('./collect-data.js');
const electronUtil = require('electron-util/node');
const log = require('electron-log');
const Sentry = require('@sentry/electron');
const StreamlabsSupport = require('./software-support/StreamlabsSupport.js');
const OBSSupport = require('./software-support/OBSSupport.js');

log.transports.console.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] > {text}';
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] > {text}';
// 50KB
log.transports.file.maxSize = 51200;

var _servers = [];
var _userContinent;
var _streamDiagnosticsData = {};
var _eventEmitter = new events.EventEmitter();
var config = {
	streamingSoftware: 'obs',
	token: '',
	ip: '127.0.0.1',
	port: 59650
};

const app = require('./app.js');

if (app.isAlreadyOpen()) {
	// Quit here, no need to connect to APIs
	return app.getApp().quit();
}

if (app.isAnalyticsEnabled()) {
	Sentry.init({
		dsn: 'https://f50fab09b3594ba498ecc266b95d07b5@o1153309.ingest.sentry.io/6232316',
		environment: electronUtil.isUsingAsar ? 'production' : 'development',
		release: `${require('../package.json').version}${electronUtil.isUsingAsar ? '' : ' (dev)'}`
	});
	Sentry.setUser({ id: app.getInstallId() });
	log.info('Sentry initialized');
}

app.init(_eventEmitter, electronUtil.isUsingAsar, log);
collectData.init(_eventEmitter, log);

const streamlabsSupport = new StreamlabsSupport(config, _eventEmitter, log);
const obsSupport = new OBSSupport(config, _eventEmitter, log);

_eventEmitter.on('doSetConfig', (_thisConfig) => {
	config = _thisConfig;

	streamlabsSupport.setConfig(config);
	obsSupport.setConfig(config);
});

_eventEmitter.on('srvGetSceneList', (con) => {
	switch (config.streamingSoftware) {
		case 'obs':
			obsSupport.getSceneList((err, data) => {
				if (err) return;

				_eventEmitter.emit('srvSceneList', data, con);
			});
			break;
		case 'streamlabs':
			streamlabsSupport.getSceneList((err, data) => {
				if (err) return;

				_eventEmitter.emit('srvSceneList', data, con);
			});
			break;
	}
});

_eventEmitter.on('srvSwitchScenes', (sceneName) => {
	switch (config.streamingSoftware) {
		case 'obs':
			obsSupport.switchToScene(sceneName);
			break;
		case 'streamlabs':
			streamlabsSupport.switchToScene(sceneName);
			break;
	}
})

axios.get('https://ingest.twitch.tv/ingests').then(function(response) {
	//log.info(response.data);
	_servers = response.data.ingests;
	log.info('Saved Twitch ingest server list');
}).catch(function(error) {
	log.error('Unable to query Twitch API');
	log.error(error);
});

axios.get('https://cf-api.framed-app.com/get-location').then(function(response) {
	log.info(response.data);
	_userContinent = response.data.continent;
	log.info('Saved user continent');
}).catch(function(error) {
	log.error('Unable to query Framed API to get user location');
	log.error(error);
});

// Shitty way of handling logs from the utils file without needing to somehow pass the ElectronLog instance just once
process.on('warning', (warning) => {
	if (warning.code.startsWith('FRAMED_')) {
		log.warn(warning.message);
	}
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

_eventEmitter.on('resetStreamDiagnosticsData', () => {
	_streamDiagnosticsData.frames = {};
	initStreamDiagnosticsData();
});

_eventEmitter.on('addToStreamDiagnosticsData', (timestamp, dropped) => {
	_streamDiagnosticsData.frames[timestamp] = dropped;
});

_eventEmitter.on('runStreamDiagnostics', (timestamp) => {
	runDiagnostics(timestamp);
});

function connectToWS() {
	switch (config.streamingSoftware) {
		case 'streamlabs':
			streamlabsSupport.connect();
			break;
		case 'obs':
			obsSupport.connect();
			break;
	}
}

_eventEmitter.on('isConnected', function() {
	switch (config.streamingSoftware) {
		case 'streamlabs':
			_eventEmitter.emit('connectedState', streamlabsSupport.isConnected());
			break;
		case 'obs':
			_eventEmitter.emit('connectedState', obsSupport.isConnected());
			break;
	}
});

_eventEmitter.on('doConnect', () => {
	connectToWS();
});

_eventEmitter.on('doDisconnect', () => {
	switch (config.streamingSoftware) {
		case 'streamlabs':
			streamlabsSupport.disconnect();
			break;
		case 'obs':
			obsSupport.disconnect();
			break;
	}
});

_eventEmitter.on('startCPPApi', () => {
	collectData.startTimer();
});

_eventEmitter.on('stopCPPApi', () => {
	collectData.stopTimer();
});

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
	log.info('Running diagnostics');
	if (_latestCPPData !== null) {
		_streamDiagnosticsData.system[timestamp] = _latestCPPData.system;
	}

	var _pingServers = utils.getRandomTwitchServers(_servers, _userContinent);
	_streamDiagnosticsData.pings.twitch[timestamp] = [];

	if (_pingServers.length < 3) {
		_twitchPinged = 3 - (_pingServers.length - 1);
		_eventEmitter.emit('diagnosticsPing', 'twitch', timestamp);
	}

	for (var i = 0; i < _pingServers.length; i++) {
		let _pingLocation = utils.parseCity(_pingServers[i].name);
		log.info(`Pinging Twitch ingest server in ${_pingLocation}`);

		utils.tcpPing(utils.parseHost(_pingServers[i].url_template), 1935, function(err, data) {
			if (err) {
				_streamDiagnosticsData.pings.twitch[timestamp].push({
					name: _pingLocation,
					average: -1
				});

				_eventEmitter.emit('diagnosticsPing', 'twitch', timestamp);
				return log.error(err);
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
			return log.error(err);
		}

		_streamDiagnosticsData.pings.google[timestamp] = data.avg ? Math.round(data.avg * 100) / 100 : -1;
		_eventEmitter.emit('diagnosticsPing', 'google', timestamp);
	});

	utils.tcpPing('truewinter.dev', 443, function(err, data) {
		if (err) {
			_streamDiagnosticsData.pings.truewinter[timestamp] = -1;
			_eventEmitter.emit('diagnosticsPing', 'truewinter', timestamp);
			return log.error(err);
		}

		_streamDiagnosticsData.pings.truewinter[timestamp] = data.avg ? Math.round(data.avg * 100) / 100 : -1;
		_eventEmitter.emit('diagnosticsPing', 'truewinter', timestamp);
	});

	utils.tcpPing('framed-app.com', 443, function(err, data) {
		if (err) {
			_streamDiagnosticsData.pings.framed[timestamp] = -1;
			_eventEmitter.emit('diagnosticsPing', 'framed', timestamp);
			return log.error(err);
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