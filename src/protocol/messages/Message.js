const OrderedJSON = require('@truewinter/orderedjson');
const crypto = require('crypto');
const protoConfig = require('../proto.config.js');

class Message {
	// key = null will show it as being optional
	constructor (installId, json) {
		if (typeof installId !== 'string') throw new TypeError('Install ID must be a string');
		if (typeof json !== 'object') throw new TypeError('JSON must be a JSON object');
		if (Array.isArray(json)) throw new TypeError('JSON must be a JSON object');

		this.installId = installId;
		this.json = json;
	}

	enableEncryption(key, iv) {
		this.key = key;
		this.iv = iv;
	}

	getPacketData() {
		var packet = '';

		function addToPacket(data) {
			packet += data;
		}

		function delim() {
			packet += protoConfig.delimiter;
		}

		addToPacket('Framed');
		delim();
		addToPacket(this.installId);
		delim();

		if (this.key && this.iv) {
			addToPacket(this.iv);
			delim();
			if (this.json instanceof OrderedJSON) {
				addToPacket(this._encryptJson(this.json.getJSON()));
			} else {
				addToPacket(this._encryptJson(JSON.stringify(this.json)));
			}
		} else if (this.json instanceof OrderedJSON) {
			addToPacket(this.json.getJSON());
		} else {
			addToPacket(JSON.stringify(this.json));
		}

		return packet;
	}

	_encryptJson(data) {
		var cipher = crypto.createCipheriv('aes-256-cbc', this.key, this.iv);
		var encrypted = Buffer.concat([
			cipher.update(data),
			cipher.final()
		]);
		return Buffer.from(encrypted).toString('base64');
	}
}

module.exports = Message;