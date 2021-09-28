const { spawn } = require('child_process');

var prevFinished = true;
var missedRunsSinceLastSuccess = 0;

var _timer = null;
var _eventEmitter = null;

// First run for counters should return 0
// and save the counter value. Do not emit
// event on first run.
var firstRun = true;
var prevCounters = {
	system: {
		network: {
			inBytes: 0,
			outBytes: 0
		},
		disk: {
			read: 0,
			write: 0
		}
	},
	programs: {}
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
		return console.log('Previous run not yet finished');
	}

	prevFinished = false;
	missedRunsSinceLastSuccess = 0;

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
			}
		},
		programs: {}
	};
	var child = spawn('framed-cpp-api.exe');

	var cmdOutput = '';

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
		var t2 = Date.now();
		console.log(t2 - t1);
		//console.log(cmdOutput);
		// __framed_sys_mem contains:
		//   + memTotal
		//   + memUsed
		// __framed_sys_net-[0-9]+ contains:
		//   + inBytes
		//   + outBytes
		//   + inErrors
		//   + outErrors
		//   + inDiscards
		//   + outDiscards
		// __framed_sys_disk-c contains:
		//   + read
		//   + write
		// All others contain:
		//   + mem
		//   + ioRead
		//   + ioWrite
		prevFinished = true;
	});
}

function 

function init(eventEmitter) {
	_eventEmitter = eventEmitter;
}

function startTimer() {
	_timer = setInterval(function() {
		run();
	}, 1000);
}

function stopTimer() {
	clearInterval(_timer);
	_timer = null;
}

module.exports.init = init;
module.exports.startTimer = startTimer;
module.exports.stopTimer = stopTimer;