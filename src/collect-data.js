const path = require('path');

const { fork } = require('child_process');
const collectNativeDataProcess = fork(path.join(__dirname, 'collect-native-data.js'), ['child']);

collectNativeDataProcess.on('error', (err) => {
	console.error(err);
});

var prevFinished = true;
var missedRunsSinceLastSuccess = 0;

var _timer = null;
var _eventEmitter = null;
var _log = null;

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

		// For future feature
		_eventEmitter.emit('longTimeRun');
		return _log.info('Previous run not yet finished');
	}

	prevFinished = false;

	var t1 = Date.now();
	/*var jsonOutput = {
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
	};*/

	//var _cppPath = _isProd ? path.join(path.parse(_path).dir, 'resources') : __dirname;
	//var child = spawn(path.join(_cppPath, 'framed-cpp-api.exe'));

	var cmdOutput;

	collectNativeDataProcess.send('getPerfData');

	collectNativeDataProcess.once('message', function(m) {
		if (m.message !== 'perfData') return;

		var data = m.data;
		cmdOutput = data;

		/*child.stderr.on('data', function(stderr) {
			if (stderr) {
				_internalEventEmitter.emit('error', stderr);
				return console.error(stderr.toString());
			}
		});

		child.stdout.on('data', function(stdout) {
			cmdOutput += stdout.toString();
		});*/

		/*child.on('close', function (code) {
			if (code !== 0) {
				_internalEventEmitter.emit('error', `child process exited with code ${code}`);
				return;
			}*/
		var t2 = Date.now();
		cmdOutput.apiCompleteTime = t2 - t1;

		//console.log(cmdOutput);

		// Framed C++ API returns the following:
		// * = counter
		// system.memory contains:
		//   + memTotal
		//   + memUsed
		// system.network contains:
		//   + inBytes*
		//   + outBytes*
		//   + inErrors*
		//   + outErrors*
		//   + inDiscards*
		//   + outDiscards*
		// system.disk contains:
		//   + read*
		//   + write*
		// system.cpu contains:
		//   + percentage
		// All others contain:
		//   + mem
		//   + ioRead*
		//   + ioWrite*

		// If previous run(s) missed, divide by missed runs + 1 to get average
		cmdOutput.system.network.inBytes = (cmdOutput.system.network.inBytes - prevCounters.system.network.inBytes) / (missedRunsSinceLastSuccess + 1);
		prevCounters.system.network.inBytes += cmdOutput.system.network.inBytes;

		// If previous run(s) missed, divide by missed runs + 1 to get average
		cmdOutput.system.network.outBytes = (cmdOutput.system.network.outBytes - prevCounters.system.network.outBytes) / (missedRunsSinceLastSuccess + 1);
		prevCounters.system.network.outBytes += cmdOutput.system.network.outBytes;

		if (firstRun) {
			prevCounters.system.network.inErrors = cmdOutput.system.network.inErrors;
			prevCounters.system.network.outErrors = cmdOutput.system.network.outErrors;
			prevCounters.system.network.inDiscards = cmdOutput.system.network.inDiscards;
			prevCounters.system.network.outDiscards = cmdOutput.system.network.outDiscards;
		}

		cmdOutput.system.network.inErrors -= prevCounters.system.network.inErrors;
		cmdOutput.system.network.outErrors -= prevCounters.system.network.outErrors;
		cmdOutput.system.network.inDiscards -= prevCounters.system.network.inDiscards;
		cmdOutput.system.network.outDiscards -= prevCounters.system.network.outDiscards;

		// If previous run(s) missed, divide by missed runs + 1 to get average
		cmdOutput.system.disk.read = (cmdOutput.system.disk.read - prevCounters.system.disk.read) / (missedRunsSinceLastSuccess + 1);
		prevCounters.system.disk.read += cmdOutput.system.disk.read;

		cmdOutput.system.disk.write = (cmdOutput.system.disk.write - prevCounters.system.disk.write) / (missedRunsSinceLastSuccess + 1);
		prevCounters.system.disk.write += cmdOutput.system.disk.write;

		// Keeping the process code here for future reference

		/*if (!Object.prototype.hasOwnProperty.call(prevCounters.processes, line.name)) {
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
		}*/

		delete cmdOutput._processes;

		missedRunsSinceLastSuccess = 0;
		prevFinished = true;

		if (!firstRun) {
			_eventEmitter.emit('cppData', cmdOutput);
		}

		//console.log(jsonOutput);

		firstRun = false;
		//});
	});
}

/*function calculateCPUUsage(cb) {
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
}*/

function parseLine(line) {
	var _output = {};

	var lineArr = line.split(':');

	if (lineArr.length !== 3) {
		console.log(line);
		console.log(lineArr);
		_log.error('The parseLine() function currently only supports lines separated into 3 parts using a colon');
		return null;
	}

	_output.name = removeWhitespace(lineArr[0]);
	_output.key = removeWhitespace(lineArr[1]);
	_output.value = parseInt(removeWhitespace(lineArr[2]));

	//console.log(_output);

	return _output;
}

function removeWhitespace(string) {
	return string.replace(/^\W/g, '').replace(/\W$/g, '');
}

//var _cpuData = 0;
//var _cppData = null;

// This was initially done with a counter,
// but I needed to ensure that one event type
// firing twice doesn't fire the main event
// handler event.
//var _cpuDataEventFired = false;
//var _cppDataEventFired = false;

/*_internalEventEmitter.on('cpuData', function(data) {
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
});*/

/*function resetInternalEventData() {
	//_cpuData = 0;
	_cppData = null;
	_cppDataEventFired = false;
	//_cpuDataEventFired = false;
}*/

/*function handleInternalEventCall() {
	if (_cppDataEventFired && _cpuDataEventFired) {
		_cppData.system.cpu.percentage = _cpuData;
		_eventEmitter.emit('cppData', _cppData);
		resetInternalEventData();
	}
}*/

function init(eventEmitter, log) {
	_eventEmitter = eventEmitter;
	_log = log;

	log.info(`Started native API child process with PID ${collectNativeDataProcess.pid}`);

	_eventEmitter.on('killNativeAPIChildProcess', () => {
		collectNativeDataProcess.kill();
	});
}

function startTimer() {
	if (_timer !== null) return;
	_timer = setInterval(function() {
		// Couldn't get the C++ system CPU code working,
		// so for now, it'll be calculated in Node.js
		/*calculateCPUUsage(function (cpu) {
			_internalEventEmitter.emit('cpuData', cpu);
		});*/
		run();
	}, 1000);
}

function stopTimer() {
	clearInterval(_timer);
	_timer = null;
}

/*function _test() {
	var eventEmitter = new events.EventEmitter();
	init(eventEmitter, __dirname);
	startTimer();

	_eventEmitter.on('cppData', function(data) {
		console.log(data);
	});
}*/

module.exports.init = init;
module.exports.startTimer = startTimer;
module.exports.stopTimer = stopTimer;
//module.exports._test = _test;