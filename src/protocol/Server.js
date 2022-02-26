var net = require('net');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const protoConfig = require('./proto.config.js');
const utils = require('../utils.js');
const PerfData = require('./messages/PerfData.js');
const DiagData = require('./messages/DiagData.js');

class Server {
	constructor(installId, password, port, privateKey, log) {
		this.installId = installId;
		this.password = password;
		this.port = port;
		this.privateKey = privateKey;
		this.log = log;

		this._keys = {};
		this._eventEmitter = new EventEmitter();
		this._server = net.createServer();

		this._server.on('connection', (...args) => this._handleConnection(...args));

		this._server.listen(port, () => {
			this.log.info(`Server listening on ${this._server.address().address}:${this._server.address().port}`);
		});

		this._eventEmitter.on('srvPerfData', (...args) => this._handlePerfData(...args));
		this._eventEmitter.on('srvDiagData', (...args) => this._handleDiagData(...args));
	}

	getPacketParts(packet) {
		return packet.split(protoConfig.delimiter);
	}

	_getPacketPartsIfValid(packet, con) {
		var parts = this.getPacketParts(packet);
		if (parts.length !== protoConfig.msgInParts) return null;
		if (parts[0] !== 'Framed') return null;
		if (parts[1] !== this.installId) return null;
		if (parts[2].length === 0) return null;

		try {
			if (parts[2] === 'KeyExchange') {
				this._decryptRsaJson(parts[3]);
			} else {
				var _remote = `${con.remoteAddress}:${con.remotePort}`;
				this._decryptJson(parts[3], this._keys[_remote], parts[2]);
			}
		} catch (e) {
			console.error(e);
			return null;
		}

		return parts;
	}

	getEventEmitter() {
		return this._eventEmitter;
	}

	_handleConnection(con) {
		// run this after the client should disconnect
		const TIMEOUT = 10000 + 250;
		this.log.info(`Connection from ${con.remoteAddress}:${con.remotePort}`);
		con.setTimeout(TIMEOUT);

		con.on('timeout', () => {
			this.log.info(`${con.remoteAddress}:${con.remotePort} hasn't sent any data in ${TIMEOUT / 1000} seconds`);
			con.destroy();
		});

		con.on('data', (d) => this._handleData(d, con));
		con.on('close', () => this._handleDisconnect(con));
	}

	_handleDisconnect(con) {
		this.log.info(`${con.remoteAddress}:${con.remotePort} disconnected`);
		delete this._keys[`${con.remoteAddress}:${con.remotePort}`];
	}

	_handleData(data, con) {
		data = data.toString().trim();
		var p = this._getPacketPartsIfValid(data, con);

		if (!p) return;

		if (p[2] === 'KeyExchange') {
			if (Object.prototype.hasOwnProperty.call(this._keys, `${con.remoteAddress}:${con.remotePort}`)) {
				this.log.info(`Updating key for ${con.remoteAddress}:${con.remotePort}`);
			} else {
				this.log.info(`Setting key for ${con.remoteAddress}:${con.remotePort}`);
			}

			this._keys[`${con.remoteAddress}:${con.remotePort}`] = this._decryptRsaJson(p[3]).key;
		} else if (!Object.prototype.hasOwnProperty.call(this._keys, `${con.remoteAddress}:${con.remotePort}`)) {
			this.log.info(`${con.remoteAddress}:${con.remotePort} tried sending data before key exchange`);
		} else {
			var decrypted = this._decryptJson(p[3], this._keys[`${con.remoteAddress}:${con.remotePort}`], p[2]);

			switch (decrypted.messageType) {
				case 'GetPerfData':
					this._eventEmitter.emit('srvGetPerfData', con);
					break;
				case 'GetDiagData':
					this._eventEmitter.emit('srvGetDiagData', decrypted.lastTimestamp, con);
					break;
			}
		}
	}

	_handlePerfData(data, con) {
		var perfData = new PerfData(this.installId, data);
		perfData.enableEncryption(this._keys[`${con.remoteAddress}:${con.remotePort}`], utils.generateSecureRandomString(16));
		con.write(`${perfData.getPacketData()}\n`);
	}

	_handleDiagData(data, con) {
		var diagData = new DiagData(this.installId, data);
		diagData.enableEncryption(this._keys[`${con.remoteAddress}:${con.remotePort}`], utils.generateSecureRandomString(16));
		con.write(`${diagData.getPacketData()}\n`);
	}

	_decryptRsaJson(encrypted) {
		var _privateKey = Buffer.from(this.privateKey, 'base64').toString().replace(/\\n/g, '\n');
		var buffer = Buffer.from(encrypted, 'base64');

		var decrypted = crypto.privateDecrypt({
			key: _privateKey,
			passphrase: this.installId,
			padding: crypto.constants.RSA_PKCS1_PADDING
		}, buffer);

		return JSON.parse(decrypted.toString());
	}

	_decryptJson(encrypted, key, iv) {
		var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
		var decrypted = decipher.update(encrypted, 'base64', 'utf-8');
		return JSON.parse(decrypted + decipher.final('utf-8'));
	}
}

module.exports = Server;