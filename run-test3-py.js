const { spawn } = require('child_process');
const utils = require('./utils.js');
const events = require('events');
const procList = require('process-list');

// 20-40% CPU :(

/*var processes = [{
	pid: 8848
}];*/

function run() {
	function extractPID(arr) {
		var result = [];

		for (var i = 0; i < arr.length; i++) {
			result.push(arr[i].pid);
		}

		return result;
	}

	function splitUp(arr, n) {
		var rest = arr.length % n, // how much to divide
			restUsed = rest, // to keep track of the division over the elements
			partLength = Math.floor(arr.length / n),
			result = [];

		for (var i = 0; i < arr.length; i += partLength) {
			var end = partLength + i,
				add = false;

			if (rest !== 0 && restUsed) { // should add one element for the division
				end++;
				restUsed--; // we've used one division element now
				add = true;
			}

			result.push(arr.slice(i, end)); // part of the array

			if (add) {
				i++; // also increment i in the case we added an extra element for division
			}
		}

		return result;
	}

	procList.snapshot('pid').then(function(processes) {
		var processArr = splitUp(extractPID(processes), 8);
		console.log(processArr);
		for (var i = 0; i < processArr.length; i++) {
			(function(i) {
				let process = processArr[i].join(',');
				var eventEmitter = new events.EventEmitter();

				var child = spawn('py', ['test3.py', process]);

				var cmdOutput = '';
				var memoryJSON = {};
				var cpuJSON = {};
				var cpuPercentage = 0;

				var _readyState = [];
				eventEmitter.on('ready', function(data) {
					_readyState.push(data);

					//console.log(process.pid);
					//console.log(memoryJSON);

					/*if (_readyState.length === 2) {
						console.log('received all data');

						var _combinedJSON = {};

						for (var m in memoryJSON) {
							if (Object.hasOwnProperty.call(cpuJSON.processes, m)) {
								_combinedJSON[m] = { ...memoryJSON[m], ...cpuJSON.processes[m] };
							}
						}

						console.log(_combinedJSON);
					}*/
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
					//console.log(cmdOutput);
					memoryJSON = JSON.parse(cmdOutput);
					eventEmitter.emit('ready', 'memory');
				});

				/*utils.getProcessesMemAndCPU(function(err, data) {
					if (err) {
						return console.error(err);
					}

					cpuJSON = data;
					//console.log(cpuJSON);
					eventEmitter.emit('ready', 'cpu');
				});*/
			}(i));
		}
	});
}

setInterval(function() {
	run();
}, 1000);