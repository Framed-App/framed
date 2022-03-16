const Message = require('./Message.js');

class SceneList extends Message {
	constructor(installId, data) {
		super(installId, {
			messageType: 'SceneList',
			data
		});
	}
}

module.exports = SceneList;