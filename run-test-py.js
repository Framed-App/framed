const { spawn } = require('child_process');
const utils = require('./utils.js');
const events = require('events');

var eventEmitter = new events.EventEmitter();

var child = spawn('py', ['test.py']);

var cmdOutput = '';
var memoryJSON = {};
var cpuJSON = {};
var cpuPercentage = 0;

var _readyState = [];
eventEmitter.on('ready', function(data) {
	_readyState.push(data);

	if (_readyState.length === 2) {
		console.log('received all data');

		var _combinedJSON = {};

		for (var m in memoryJSON) {
			if (Object.hasOwnProperty.call(cpuJSON.processes, m)) {
				_combinedJSON[m] = { ...memoryJSON[m], ...cpuJSON.processes[m] };
			}
		}

		console.log(_combinedJSON);
	}
});

child.stderr.on('data', function(stderr) {
	if (stderr) {
		return console.error(stderr.toString());
	}
});

child.stdout.on('data', function(stdout) {
	cmdOutput += stdout.toString();
});

child.on('close', function (code) {
	console.log(`child process exited with code ${code}`);
	memoryJSON = JSON.parse(cmdOutput);
	eventEmitter.emit('ready', 'memory');
});

utils.getProcessesMemAndCPU(function(err, data) {
	if (err) {
		return console.error(err);
	}

	cpuJSON = data;
	//console.log(cpuJSON);
	eventEmitter.emit('ready', 'cpu');
});