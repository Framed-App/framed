const Message = require('./Message.js');

class DiagData extends Message {
	constructor(installId, data) {
		var _data = {
			messageType: 'DiagData',
			success: data.success
		};

		if (data.error) _data.error = data.error;

		super(installId, _data);
	}
}

module.exports = DiagData;