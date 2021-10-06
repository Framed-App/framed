const tcpp = require('tcp-ping');
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });
const collectData = require('./collect-data.js');

function createJRPCMessage(method, params, id) {
	return {
		jsonrpc: '2.0',
		id,
		method,
		params
	};
}

function tcpPing(host, port, cb) {
	tcpp.ping({ address: host, port: port, attempts: 3, timeout: 2 * 1000 }, function(err, data) {
		if (err) {
			return cb(err, null);
		}

		cb(null, data);
	});
}

// https://coderrocketfuel.com/article/how-to-convert-bytes-to-kb-mb-gb-or-tb-format-in-node-js
function convertBytes(bytes, si = false) {
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	var standardValue = si ? 1000 : 1024;
	bytes = parseInt(bytes);

	if (bytes === 0) {
		return `0 ${sizes[0]}`;
	}

	const i = parseInt(Math.floor(Math.log(bytes) / Math.log(standardValue)));

	if (i === 0) {
		return `${bytes} ${sizes[i]}`;
	}

	return `${(bytes / Math.pow(standardValue, i)).toFixed(1)} ${sizes[i]}`;
}

function convertBits(bits, si = false) {
	const sizes = ['b', 'Kb', 'Mb', 'Gb', 'Tb'];
	var standardValue = si ? 1000 : 1024;
	bits = parseInt(bits);

	if (bits === 0) {
		return `0 ${sizes[0]}`;
	}

	const i = parseInt(Math.floor(Math.log(bits) / Math.log(standardValue)));

	if (i === 0) {
		return `${bits} ${sizes[i]}`;
	}

	return `${(bits / Math.pow(standardValue, i)).toFixed(1)} ${sizes[i]}`;
}

function parseCity(name) {
	var _current = name;
	if (_current.includes(':')) {
		_current = _current.split(':')[1];
	}

	if (_current.includes(',')) {
		// Twitch, just why?!
		if (name.startsWith('US')) {
			_current = _current.split(',')[0];
		} else {
			_current = _current.split(',')[1];
		}
	}

	if (_current.startsWith(' ')) {
		_current = _current.replace(/^ /, '');
	}

	return _current;
}

function parseHost(host) {
	var _u = new URL(host);
	return _u.host;
}

function getRandomTwitchServers(_servers, _userContinent) {
	var _returnCount = 3;
	var _returnArr = [];

	if (_servers.length < 3) {
		return [];
	}

	if (_userContinent) {
		var _pingServers = getServersIn(_servers, _userContinent);

		for (var i = 0; i < _returnCount; i++) {
			var _p = _pingServers[Math.floor(Math.random() * _pingServers.length)];
			if (_p) {
				_returnArr.push(_p);
				_pingServers.remove(_p);
			}
		}

		if (_pingServers.length < 3) {
			console.log('User continent contains less than 3 servers');

			var _altLocations = {
				AF: 'EU',
				AS: 'EU',
				NA: 'EU',
				SA: 'NA',
				EU: 'NA',
				OC: 'NA',
				AN: 'SA'
			};

			var _altServers = getServersIn(_servers, _altLocations[_userContinent]);

			var _runTimes = _returnCount - _returnArr.length;

			for (var j = 0; j < _runTimes; j++) {
				var _a = _altServers[Math.floor(Math.random() * _altServers.length)];
				if (_a) {
					_returnArr.push(_a);
					_altServers.remove(_p);
				}
			}
		}
	} else {
		console.log('User continent blank');

		// Create copy
		var _serversTmp = _servers.slice();

		for (var k = 0; k < _returnCount; k++) {
			var _s = _serversTmp[Math.floor(Math.random() * _serversTmp.length)];
			if (_s) {
				_returnArr.push(_s);
				_serversTmp.remove(_s);
			}
		}
	}

	return _returnArr;
}

function getServersIn(_servers, continent) {
	// Thanks Twitch for having multiple NA locations with different names
	var _twitchLocations = {
		Europe: 'EU',
		Asia: 'AS',
		'South America': 'SA',
		Australia: 'OC',
		'US East': 'NA',
		NA: 'NA',
		'US Central': 'NA',
		'US West': 'NA'
	};

	var _returnArr = [];

	_servers.forEach(function(s) {
		var _location = s.name.split(':')[0];
		var _convertedLocation = _twitchLocations[_location];

		// Ensures that this won't break by Twitch expanding into new locations
		// PS: Twitch, consider add South African servers
		if (_convertedLocation) {
			if (_convertedLocation === continent) {
				_returnArr.push(s);
			}
		}
	});

	return _returnArr;
}

// https://stackoverflow.com/a/3955096
Array.prototype.remove = function() {
	// eslint-disable-next-line prefer-rest-params
	var what, a = arguments, L = a.length, ax;
	while (L && this.length) {
		what = a[--L];
		while ((ax = this.indexOf(what)) !== -1) {
			this.splice(ax, 1);
		}
	}
	return this;
};

const schema = {
	type: 'object',
	additionalProperties: false,
	patternProperties: {
		'/[0-9]+$': {
			type: 'object',
			properties: {
				timestamp: { type: 'number' },
				frames: { type: 'number' },
				pings: {
					type: 'object',
					properties: {
						twitch: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									average: { type: 'number' },
								},
								required: ['name', 'average']
							}
						},
						google: { type: 'number' },
						truewinter: { type: 'number' },
						framed: { type: 'number' }
					},
					required: ['twitch', 'google', 'truewinter', 'framed']
				},
				processes: { type: 'object' }, // Not yet implemented
				system: {
					type: 'object',
					properties: {
						memory: {
							type: 'object',
							properties: {
								memTotal: { type: 'number' },
								memUsed: { type: 'number' }
							},
							required: ['memTotal', 'memUsed']
						},
						network: {
							type: 'object',
							properties: {
								inBytes: { type: 'number' },
								outBytes: { type: 'number' },
								inErrors: { type: 'number' },
								outErrors: { type: 'number' },
								inDiscards: { type: 'number' },
								outDiscards: { type: 'number' }
							},
							required: ['inBytes', 'outBytes', 'inErrors', 'outErrors', 'inDiscards', 'outDiscards']
						},
						disk: {
							type: 'object',
							properties: {
								read: { type: 'number' },
								write: { type: 'number' }
							},
							required: ['read', 'write']
						},
						cpu: {
							type: 'object',
							properties: {
								percentage: { type: 'number' }
							},
							required: ['percentage']
						}
					},
					required: ['memory', 'network', 'disk', 'cpu']
				}
			},
			required: ['timestamp', 'frames', 'pings', 'processes', 'system']
		}
	}
};

function validateFileData(data) {
	var validate = ajv.compile(schema);
	var valid = validate(data);

	if (valid) {
		return { valid: true, message: 'Valid' };
	} else {
		return {
			valid: false,
			message: ajv.errorsText(validate.errors)
		};
	}
}

module.exports.createJRPCMessage = createJRPCMessage;
module.exports.tcpPing = tcpPing;
module.exports.convertBytes = convertBytes;
module.exports.convertBits = convertBits;
module.exports.collectData = collectData;
module.exports.parseCity = parseCity;
module.exports.parseHost = parseHost;
module.exports.getRandomTwitchServers = getRandomTwitchServers;
module.exports.validateFileData = validateFileData;