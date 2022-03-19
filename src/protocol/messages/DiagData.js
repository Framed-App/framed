const Message = require('./Message.js');

class DiagData extends Message {
	constructor(installId, data) {
		super(installId, {
			messageType: 'DiagData',
			data
		});
	}
}

module.exports = DiagData;