const Message = require('./Message.js');
const protoConfig = require('../proto.config.js');

class Broadcast extends Message {
	constructor(installId, {
		ip,
		port,
		hostname,
		version,
		publicKey
	}) {
		super(installId, {
			messageType: 'identify',
			ip,
			port,
			hostname,
			version,
			minClientVersion: protoConfig.minClientVersion,
			publicKey
		});
	}
}

module.exports = Broadcast;