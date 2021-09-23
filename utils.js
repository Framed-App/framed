var tcpp = require('tcp-ping');

var _id = 0;
function getID() {
	_id++;
	return _id;
}

function createJRPCMessage(method, params) {
	return {
		jsonrpc: '2.0',
		id: getID(),
		method,
		params
	};
}

function tcpPing(host, port, cb) {
	tcpp.ping({ address: host, port: port, attempts: 3, timeout: 3 * 1000 }, function(err, data) {
		if (err) {
			return cb(err, null);
		}

		cb(null, data);
	});
}

module.exports.createJRPCMessage = createJRPCMessage;
module.exports.tcpPing = tcpPing;