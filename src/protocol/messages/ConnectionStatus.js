const Message = require('./Message.js');

class ConnectionStatus extends Message {
	constructor(installId, data) {
		super(installId, {
			messageType: 'ConnectionStatus',
			...data
		});
	}
}

module.exports = ConnectionStatus;