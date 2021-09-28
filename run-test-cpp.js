const { spawn } = require('child_process');

var prevFinished = true;
var missedRunsSinceLastSuccess = 0;

function run() {
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
		// __framed_sys contains memTotal and memUsed
		// All others contain mem, read, and write
		prevFinished = true;
	});
}

setInterval(function() {
	run();
}, 1000);