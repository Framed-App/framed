const Message = require('./Message.js');

class SceneListError extends Message {
	constructor(installId, data) {
		super(installId, {
			messageType: 'SceneListError',
			...data
		});
	}
}

module.exports = SceneListError;