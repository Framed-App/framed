const { spawn } = require('child_process');
const path = require('path');
const events = require('events');
const os = require('os');

var prevFinished = true;
var missedRunsSinceLastSuccess = 0;

var _timer = null;
var _eventEmitter = null;
var _path = null;
var _isProd = null;
var _internalEventEmitter = new events.EventEmitter();

// First run for counters should return 0
// and save the counter value. Do not emit
// event on first run.
var firstRun = true;
var prevCounters = {
	system: {
		network: {
			inBytes: 0,
			outBytes: 0,
			inErrors: 0,
			outErrors: 0,
			inDiscards: 0,
			outDiscards: 0
		},
		disk: {
			read: 0,
			write: 0
		}
	},
	processes: {}
};

function run() {
	if (_eventEmitter === null) {
		if (_timer !== null) {
			stopTimer();
		}

		return console.error('Pass an EventEmitter to the init() function to initialize');
	}
	if (!prevFinished) {
		// Divide the network and IO values by this value + 1
		// Assuming a steady network and IO use, this should give
		// the average over the time instead of showing a high value
		missedRunsSinceLastSuccess++;
		_eventEmitter.emit('longTimeRun');
		return console.log('Previous run not yet finished');
	}

	prevFinished = false;

	var t1 = Date.now();
	var jsonOutput = {
		system: {
			memory: {
				memTotal: 0,
				memUsed: 0
			},
			network: {
				inBytes: 0,
				outBytes: 0,
				inErrors: 0,
				outErrors: 0,
				inDiscards: 0,
				outDiscards: 0
			},
			disk: {
				read: 0,
				write: 0
			},
			cpu: {
				percentage: 0
			}
		},
		// _processes is used internally, programs is returned
		programs: {},
		_processes: {},
		apiCompleteTime: 0
	};

	var _cppPath = _isProd ? path.join(path.parse(_path).dir, 'resources') : __dirname;
	var child = spawn(path.join(_cppPath, 'framed-cpp-api.exe'));

	var cmdOutput = '';

	child.stderr.on('data', function(stderr) {
		if (stderr) {
			_internalEventEmitter.emit('error', stderr);
			return console.error(stderr.toString());
		}
	});

	child.stdout.on('data', function(stdout) {
		cmdOutput += stdout.toString();
	});

	child.on('close', function (code) {
		if (code !== 0) {
			_internalEventEmitter.emit('error', `child process exited with code ${code}`);
			return;
		}
		var t2 = Date.now();
		jsonOutput.apiCompleteTime = t2 - t1;
		//console.log(cmdOutput);
		// Framed C++ API returns the following:
		// * = counter
		// __framed_sys_mem contains:
		//   + memTotal
		//   + memUsed
		// __framed_sys_net-[0-9]+ contains:
		//   + inBytes*
		//   + outBytes*
		//   + inErrors*
		//   + outErrors*
		//   + inDiscards*
		//   + outDiscards*
		// __framed_sys_disk-c contains:
		//   + read*
		//   + write*
		// All others contain:
		//   + mem
		//   + ioRead*
		//   + ioWrite*

		var cmdOutputLines = cmdOutput.split('\r\n');

		for (var i = 0; i < cmdOutputLines.length; i++) {
			if (cmdOutputLines[i] === '') continue;
			let line = parseLine(cmdOutputLines[i]);
			if (!line) {
				continue;
			}
			if (line.name.startsWith('__framed_sys_mem')) {
				if (Object.prototype.hasOwnProperty.call(jsonOutput.system.memory, line.key)) {
					jsonOutput.system.memory[line.key] = line.value;

				}
			} else if (line.name.startsWith('__framed_sys_net')) {
				switch (line.key) {
					case 'inBytes':
						// If previous run(s) missed, divide by missed runs + 1 to get average
						jsonOutput.system.network.inBytes = (line.value - prevCounters.system.network.inBytes) / (missedRunsSinceLastSuccess + 1);
						prevCounters.system.network.inBytes = line.value;
						break;
					case 'outBytes':
						// If previous run(s) missed, divide by missed runs + 1 to get average
						jsonOutput.system.network.outBytes = (line.value - prevCounters.system.network.outBytes) / (missedRunsSinceLastSuccess + 1);
						prevCounters.system.network.outBytes = line.value;
						break;
					default:
						if (firstRun) {
							if (Object.prototype.hasOwnProperty.call(prevCounters.system.network, line.key)) {
								// Display only the network errors and discards since Framed was opened
								prevCounters.system.network[line.key] = line.value;
							}
						}
						if (Object.prototype.hasOwnProperty.call(jsonOutput.system.network, line.key) && Object.prototype.hasOwnProperty.call(prevCounters.system.network, line.key)) {
							jsonOutput.system.network[line.key] = line.value - prevCounters.system.network[line.key];
						}
				}
			} else if (line.name.startsWith('__framed_sys_disk-c')) {
				if (Object.prototype.hasOwnProperty.call(jsonOutput.system.disk, line.key)) {
					// If previous run(s) missed, divide by missed runs + 1 to get average
					jsonOutput.system.disk[line.key] = (line.value - prevCounters.system.disk[line.key]) / (missedRunsSinceLastSuccess + 1);
					prevCounters.system.disk[line.key] = line.value;
				}
			} else {
				if (!Object.prototype.hasOwnProperty.call(prevCounters.processes, line.name)) {
					prevCounters.processes[line.name] = {
						ioRead: 0,
						ioWrite: 0
					};
				}

				if (!Object.prototype.hasOwnProperty.call(jsonOutput._processes, line.name)) {
					jsonOutput._processes[line.name] = {
						mem: 0,
						ioRead: 0,
						ioWrite: 0
					};
				}

				switch (line.key) {
					case 'mem':
						jsonOutput._processes[line.name].mem = line.value;
						break;
					case 'ioRead':
						// If previous run(s) missed, divide by missed runs + 1 to get average
						jsonOutput._processes[line.name].ioRead = (line.value - prevCounters.processes[line.name].ioRead) / (missedRunsSinceLastSuccess + 1);
						prevCounters.processes[line.name].ioRead = line.value;
						break;
					case 'ioWrite':
						// If previous run(s) missed, divide by missed runs + 1 to get average
						jsonOutput._processes[line.name].ioWrite = (line.value - prevCounters.processes[line.name].ioWrite) / (missedRunsSinceLastSuccess + 1);
						prevCounters.processes[line.name].ioWrite = line.value;
						break;
				}
			}
		}

		for (var process in jsonOutput._processes) {
			var regex = /^(.+)-[0-9]+$/g;
			if (!process.match(regex)) continue;
			var processName = regex.exec(process)[1];
			if (!Object.prototype.hasOwnProperty.call(jsonOutput.programs, processName)) {
				jsonOutput.programs[processName] = {
					mem: 0,
					ioRead: 0,
					ioWrite: 0
				};
			}

			jsonOutput.programs[processName].mem += jsonOutput._processes[process].mem;
			jsonOutput.programs[processName].ioRead += jsonOutput._processes[process].ioRead;
			jsonOutput.programs[processName].ioWrite += jsonOutput._processes[process].ioWrite;
		}

		// Clean up old processes that have been closed
		for (var oldProcesses in prevCounters.processes) {
			if (!Object.prototype.hasOwnProperty.call(jsonOutput._processes, oldProcesses)) {
				delete prevCounters.processes[oldProcesses];
			}
		}

		delete jsonOutput._processes;

		missedRunsSinceLastSuccess = 0;
		prevFinished = true;

		if (!firstRun) {
			_internalEventEmitter.emit('cppData', jsonOutput);
		}

		firstRun = false;
	});
}

function calculateCPUUsage(cb) {
	// Most accurate (compared to task manager) values at
	// 1000ms it seems. With an EventHandler, this should finish
	// just in time.
	var _interval = 1000;
	var cpus = os.cpus().length;
	var combinedTimes1 = 0;
	var idleTimes1 = 0;

	for (var i = 0; i < cpus; i++) {
		var times1 = os.cpus()[i].times;
		combinedTimes1 += times1.user;
		combinedTimes1 += times1.sys;
		idleTimes1 += times1.idle;
	}

	//console.log(combinedTimes1);

	setTimeout(function() {
		var combinedTimes2 = 0;
		var idleTimes2 = 0;

		for (var i = 0; i < cpus; i++) {
			var times2 = os.cpus()[i].times;
			combinedTimes2 += times2.user;
			combinedTimes2 += times2.sys;
			idleTimes2 += times2.idle;
		}

		//console.log(combinedTimes2);

		var calculatedCPUTime = combinedTimes2 - combinedTimes1;
		var idleDiff = idleTimes2 - idleTimes1;
		var cpuPercent = calculatedCPUTime / idleDiff * 100;

		//console.log(`${cpuPercent}%`);

		cb(Math.round(cpuPercent * 100) / 100);
	}, _interval);
}

function parseLine(line) {
	var _output = {};

	var lineArr = line.split(':');

	if (lineArr.length !== 3) {
		console.log(line);
		console.error('The parseLine() function currently only supports lines separated into 3 parts using a colon');
		return null;
	}

	_output.name = removeWhitespace(lineArr[0]);
	_output.key = removeWhitespace(lineArr[1]);
	_output.value = parseInt(removeWhitespace(lineArr[2]));

	return _output;
}

function removeWhitespace(string) {
	return string.replace(/^\W/g, '').replace(/\W$/g, '');
}

var _cpuData = 0;
var _cppData = null;

// This was initially done with a counter,
// but I needed to ensure that one event type
// firing twice doesn't fire the main event
// handler event.
var _cpuDataEventFired = false;
var _cppDataEventFired = false;

_internalEventEmitter.on('cpuData', function(data) {
	_cpuData = data;
	_cpuDataEventFired = true;
	handleInternalEventCall();
});

_internalEventEmitter.on('cppData', function(data) {
	_cppData = data;
	_cppDataEventFired = true;
	handleInternalEventCall();
});

_internalEventEmitter.on('error', function(err) {
	console.error(err);
	resetInternalEventData();
});

function resetInternalEventData() {
	_cpuData = 0;
	_cppData = null;
	_cppDataEventFired = false;
	_cpuDataEventFired = false;
}

function handleInternalEventCall() {
	if (_cppDataEventFired && _cpuDataEventFired) {
		_cppData.system.cpu.percentage = _cpuData;
		_eventEmitter.emit('cppData', _cppData);
		resetInternalEventData();
	}
}

function init(eventEmitter, exePath, isProd) {
	_eventEmitter = eventEmitter;
	_path = exePath;
	_isProd = isProd;
}

function startTimer() {
	_timer = setInterval(function() {
		// Couldn't get the C++ system CPU code working,
		// so for now, it'll be calculated in Node.js
		calculateCPUUsage(function (cpu) {
			_internalEventEmitter.emit('cpuData', cpu);
		});
		run();
	}, 1000);
}

function stopTimer() {
	clearInterval(_timer);
	_timer = null;
}

function _test() {
	var eventEmitter = new events.EventEmitter();
	init(eventEmitter, __dirname);
	startTimer();

	_eventEmitter.on('cppData', function(data) {
		console.log(data);
	});
}

module.exports.init = init;
module.exports.startTimer = startTimer;
module.exports.stopTimer = stopTimer;
module.exports._test = _test;