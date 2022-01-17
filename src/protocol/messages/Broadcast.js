const OrderedJSON = require('@truewinter/orderedjson');
const Message = require('./Message.js');
const protoConfig = require('../proto.config.js');
const crypto = require('crypto');

class Broadcast extends Message {
	constructor(installId, {
		ip,
		port,
		hostname,
		version,
		publicKey,
		_privateKey
	}) {
		var data = new OrderedJSON();
		data.add('messageType', 'identify');
		data.add('ip', ip);
		data.add('port', port);
		data.add('hostname', hostname);
		data.add('version', version);
		data.add('minClientVersion', protoConfig.minClientVersion);

		const sign = crypto.createSign('SHA256');
		sign.write(data.getJSON());
		sign.end();
		const signature = sign.sign({
			key: Buffer.from(_privateKey, 'base64').toString().replace(/\\n/g, '\n'),
			passphrase: installId
		}, 'base64');

		data.add('publicKey', publicKey);
		data.add('sig', signature);
		super(installId, data);
	}
}

module.exports = Broadcast;