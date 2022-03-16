const SoftwareSupport = require('./SoftwareSupport.js');
const OBSWebSocket = require('obs-websocket-js');

const GET_PERFORMANCE_INTERVAL = 4 * 1000;

class OBSSupport extends SoftwareSupport {
	constructor(_config, _eventEmitter, _log) {
		super(_config, _eventEmitter, _log);

		this.obs = null;
		this._authenticated = false;
		this._isLive = false;
		this._interval = null;
		this._ignoreNextDroppedFrames = false;

		this._streamStatus = {};
		this._droppedFramesLatest = 0;
		this._scenes = [];
	}

	isConnected() {
		return this._authenticated;
	}

	_streamWentLive(ignore = false) {
		this.log.info('Stream started');
		this._extEventEmitter.emit('resetStreamDiagnosticsData');

		if (ignore) {
			this.log.info('Dropped frames detected while isLive is false. Assuming app was opened after streamer went live.');
			this._ignoreNextDroppedFrames = true;
			this._getPerformance();
		}

		// While StreamStatus provides this data every 2 seconds,
		// I'd rather only use it every 15 seconds to keep the different
		// SoftwareSupport classes as similar as possible.
		this._interval = setInterval(() => {
			this._getPerformance();
		}, GET_PERFORMANCE_INTERVAL);
	}

	_getPerformance() {
		var _nowDroppedFrames = this._streamStatus['num-dropped-frames'];

		var timestamp = Date.now();
		this._extEventEmitter.emit('frame', {
			x: timestamp,
			y: _nowDroppedFrames
		});

		if (_nowDroppedFrames > this._droppedFramesLatest && !this._ignoreNextDroppedFrames) {
			this._droppedFramesLatest = _nowDroppedFrames;
			this._extEventEmitter.emit('addToStreamDiagnosticsData', timestamp, _nowDroppedFrames);
			this._runDiagnostics(timestamp);
		}

		if (this._ignoreNextDroppedFrames) {
			this._droppedFramesLatest = _nowDroppedFrames;
			this._ignoreNextDroppedFrames = false;
		}
	}

	_runDiagnostics(timestamp) {
		this.log.info('Dropped frames detected, running diagnostics');
		this._extEventEmitter.emit('runStreamDiagnostics', timestamp);
	}

	_getScenes(cb) {
		this.obs.send('GetSceneList').then((scenes) => {
			cb(null, {
				currentScene: scenes['current-scene'],
				scenes: scenes.scenes.map((s) => s.name)
			});
		}).catch((e) => {
			cb(e, null);
		});
	}

	connect() {
		if (this._authenticated) return this.log.warn('OBS connection already established');

		this.obs = new OBSWebSocket();
		this.obs.connect({
			address: `${this.config.ip}:${this.config.port}`,
			password: this.config.token
		}).then(() => {
			this.log.info('Connected to OBS');
			this._authenticated = true;
			this._extEventEmitter.emit('connectedState', true);

			this.obs.on('ConnectionClosed', () => {
				this.log.info('OBS connection closed');
				this._extEventEmitter.emit('connectedState', false);
				this._authenticated = false;
				this._isLive = false;
				this._droppedFramesLatest = 0;
				this._ignoreNextDroppedFrames = false;

				if (this._interval) {
					clearInterval(this._interval);
				}
			});

			this.obs.on('StreamStatus', (data) => {
				this._streamStatus = data;

				if (!this._isLive && data['num-dropped-frames'] !== 0) {
					this._streamWentLive(true);
				} else if (!this._isLive) {
					this._streamWentLive();
				}

				this._isLive = true;
			});

			this.obs.on('StreamStopped', () => {
				this.log.info('Stream stopped');
				this._isLive = false;
				this._droppedFramesLatest = 0;
				this._ignoreNextDroppedFrames = false;

				if (this._interval) {
					clearInterval(this._interval);
				}
			});

			// Just some testing code, please ignore
			/*this.getSceneList((err, data) => {
				if (err) {
					return console.error(err);
				}

				var _scenes = data.scenes.filter((_s) => _s !== data.currentScene)
					.filter((_s) => !_s.startsWith('Util:'));
				console.log(_scenes);

				var _sc = _scenes[Math.floor(Math.random() * _scenes.length)];
				console.log(_sc);
				this.switchToScene(_sc);
			});*/
		}).catch((err) => {
			this.log.error(`Failed to connect to OBS: ${err.error}`);
			this._extEventEmitter.emit('error', `Failed to connect to OBS: ${err.error}`);
		});

		this.obs.on('error', err => {
			this.log.error('OBS socket error:', err);
		});
	}

	disconnect() {
		if (!this.obs) return;

		this.log.info('Disconnecting from OBS');

		this.obs.disconnect();
		this.obs = null;
		this._authenticated = false;
		this._extEventEmitter.emit('connectedState', false);
		this._droppedFramesLatest = 0;
		this._ignoreNextDroppedFrames = false;

		if (this._interval) {
			clearInterval(this._interval);
		}
	}

	getSceneList(cb) {
		this._getScenes((err, data) => {
			if (err) {
				return cb(err, null);
			}

			this._scenes = data.scenes;
			cb(null, data);
		});
	}

	switchToScene(scene) {
		if (!this._scenes.includes(scene)) return;

		this.obs.send('SetCurrentScene', {
			'scene-name': scene
		});
	}
}

module.exports = OBSSupport;