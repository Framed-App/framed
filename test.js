var utils = require('./utils.js');

utils.getProcessesMemAndCPU(function(err, data) {
	if (err) {
		return console.error(err);
	}

	console.log(data);
});