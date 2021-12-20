/* eslint-disable no-useless-constructor */
/* eslint-disable no-unused-vars */
/* eslint-disable no-empty-function */

// This class defines the methods that need to be implemented for software support
class SoftwareSupport {
	constructor(_config, _eventEmitter, _log) {
		this._extEventEmitter = _eventEmitter;
		this.log = _log;
		this.config = _config;
	}

	setConfig(config) {
		this.config = config;
	}

	// These need to be implemented in the subclass.
	// Additionally, the implementation must emit the following events where appropriate:
	// - error
	// - connectedState
	// - resetStreamDiagnosticsData
	// - runStreamDiagnostics
	// - frame
	// - addToStreamDiagnosticsData
	isConnected() {}
	connect() {}
	disconnect() {}
}

module.exports = SoftwareSupport;