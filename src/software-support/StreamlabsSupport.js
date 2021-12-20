const SoftwareSupport = require('./SoftwareSupport.js');
const SockJS = require('sockjs-client');
const utils = require('../utils.js');

const GET_PERFORMANCE_INTERVAL = 15 * 1000;

class StreamlabsSupport extends SoftwareSupport {
	constructor(_config, _eventEmitter, _log) {
		super(_config, _eventEmitter, _log);

		this._authenticated = false;
		this._messageMap = new Map();
		this._droppedFramesLatest = 0;
		this._ignoreNextDroppedFrames = false;
		this._interval = null;
		this.sock = null;

		this._id = 0;
	}

	_getID() {
		this._id++;
		return this._id;
	}

	isConnected() {
		if (this.sock !== null && this._authenticated) {
			return true;
		}

		return false;
	}

	connect() {
		if (this.sock !== null) {
			return this.log.warn('Socket already established');
		}

		if (!this.config) {
			return this.log.error('Streamlabs: config not set');
		}

		this.sock = new SockJS(`http://${this.config.ip}:${this.config.port}/api`);

		this.sock.onopen = () => {
			this.log.info(`Opened connection to ${this.config.streamingSoftware}`);

			var _authRequest = utils.createJRPCMessage('auth', {
				resource: 'TcpServerService',
				args: [this.config.token]
			}, this._getID());

			this._messageMap.set(_authRequest.id, 'auth');
			this._send(_authRequest);

			var _request = utils.createJRPCMessage('streamingStatusChange', {
				resource: 'StreamingService',
			}, this._getID());

			this._messageMap.set(_request.id, 'stateevent');
			this._send(_request);

			var _stateRequest = utils.createJRPCMessage('getModel', {
				resource: 'StreamingService'
			}, this._getID());
			this._messageMap.set(_stateRequest.id, 'state');
			this._send(_stateRequest);
		};

		this.sock.onmessage = (e) => {
			var data = JSON.parse(e.data);
			//log.info(data);
			if (data.id !== null && !this._messageMap.has(data.id)) return;

			if (data.error) {
				this.log.error(data.error);
				this._extEventEmitter.emit('error', data.error.message);
				this.sock.close();
				return;
			}

			if (data.id === null) {
				this._handleEvent(data.result);
				return;
			}

			switch (this._messageMap.get(data.id)) {
				case 'auth':
					this._authenticated = true;
					this.log.info(`Connected to ${this.config.streamingSoftware}`);
					this._extEventEmitter.emit('connectedState', true);
					break;
				case 'performance':
					this._handlePerformanceData(data.result);
					break;
				case 'state':
					if (data.result.streamingStatus === 'live' && this._interval === null) {
						this.log.info('App opened after streamer went live');
						// Don't count dropped frames from before Framed was opened
						this._ignoreNextDroppedFrames = true;
						this._getPerformance();
						this._interval = setInterval(() => {
							this._getPerformance();
						}, GET_PERFORMANCE_INTERVAL);
					}
					break;
			}

			this._messageMap.delete(data.id);
		};

		this.sock.onclose = (e) => {
			this.log.info(`Closed connection to ${this.config.streamingSoftware}`);
			//log.info(e);
			clearInterval(this._interval);
			this._interval = null;
			this.sock = null;
			this._authenticated = false;

			this._extEventEmitter.emit('connectedState', false);

			if (e.code === 1002 || e.code === 2000) {
				this.log.error(`Failed to connect to ${this.config.streamingSoftware}. Error code: ${e.code} (${e.reason})`);
				this._extEventEmitter.emit('error', `Failed to connect to ${this.config.streamingSoftware}. Error code: ${e.code} (${e.reason})`);
			}
		};

		this.sock.onerror = (err) => {
			this.log.info(`An error occurred while connecting to ${this.config.streamingSoftware}`);
			this.log.error(err);
			this.sock.close();
		};
	}

	disconnect() {
		if (this.sock === null) return;
		this.sock.close();
	}

	_handleEvent(data) {
		if (data.emitter === 'STREAM') {
			switch (data.data) {
				case 'live':
					if (this._interval === null) {
						/*_streamDiagnosticsData.frames = {};
						_droppedFramesLatest = 0;
						initStreamDiagnosticsData();*/

						this._extEventEmitter.emit('resetStreamDiagnosticsData');

						this._interval = setInterval(() => {
							this._getPerformance();
						}, GET_PERFORMANCE_INTERVAL);
					}
					break;
				case 'offline':
					if (this._interval !== null) {
						clearInterval(this._interval);
						this._interval = null;
					}
					break;
			}
		}
	}

	_send(json) {
		if (!this.sock || !json) return;
		this.sock.send(JSON.stringify(json));
	}

	_getPerformance() {
		if (!this._authenticated) return;

		var _performanceRequest = utils.createJRPCMessage('getModel', { resource: 'PerformanceService' }, this._getID());
		this._messageMap.set(_performanceRequest.id, 'performance');
		this._send(_performanceRequest);
	}

	_runDiagnostics(timestamp) {
		this._extEventEmitter.emit('runStreamDiagnostics', timestamp);
	}

	_handlePerformanceData(data) {
		var timestamp = Date.now();
		this._extEventEmitter.emit('frame', {
			x: timestamp,
			y: data.numberDroppedFrames
		});

		if (data.numberDroppedFrames > this._droppedFramesLatest && !this._ignoreNextDroppedFrames) {
			this._droppedFramesLatest = data.numberDroppedFrames;
			//_streamDiagnosticsData.frames[timestamp] = data.numberDroppedFrames;
			this._extEventEmitter.emit('addToStreamDiagnosticsData', timestamp, data.numberDroppedFrames);
			this._runDiagnostics(timestamp);
		}

		if (this._ignoreNextDroppedFrames) {
			this._droppedFramesLatest = data.numberDroppedFrames;
			this._ignoreNextDroppedFrames = false;
		}
	}
}

module.exports = StreamlabsSupport;