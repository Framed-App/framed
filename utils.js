var tcpp = require('tcp-ping');
const { snapshot } = require('process-list');
const os = require('os');

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

function getProcessesMemAndCPU(cb) {
	var _data = {};
	var totalMem = 0;
	var totalCPU = 0;
	var cpuOverCores = 0;

	var _ignoreList = ['System Idle Process'];

	snapshot('name', 'pmem', 'cpu', 'pid').then(function(data) {
		data.forEach(function (d) {
			/*if (d.name.includes('Spotify')) {
				console.log(d);
				console.log(`V: ${convertBytes(d.pmem)}`);
			}*/

			if (!_ignoreList.includes(d.name)) {
				if (!Object.prototype.hasOwnProperty.call(_data, d.name)) {
					_data[d.name] = {
						mem: 0,
						cpu: 0
					};
				}

				_data[d.name].mem += parseInt(d.pmem);
				_data[d.name].cpu += d.cpu;
				//totalMem += parseInt(d.pmem);
				totalCPU += d.cpu;
			}
		});

		for (var _d in _data) {
			_data[_d].cpu = Math.round(_data[_d].cpu * 1000) / 1000;
		}

		cpuOverCores = Math.round(totalCPU / os.cpus().length * 1000) / 1000;

		//console.log(totalMem);
		//console.log(convertBytes(totalMem));

		cb(null, {
			processes: _data,
			//totalMem,
			totalCPU,
			cpuOverCores
		});
	}).catch(function(err) {
		console.error(err);
		cb(err, null);
	});
}

module.exports.createJRPCMessage = createJRPCMessage;
module.exports.tcpPing = tcpPing;
module.exports.getProcessesMemAndCPU = getProcessesMemAndCPU;
module.exports.convertBytes = convertBytes;