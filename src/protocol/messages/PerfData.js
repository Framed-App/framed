const Message = require('./Message.js');

class PerfData extends Message {
	constructor(installId, data) {
		super(installId, {
			messageType: 'PerfData',
			data
		});
	}
}

module.exports = PerfData;