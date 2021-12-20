// This file will run on a separate thread

const framedNative = require('./native-api');

process.on('message', (m) => {
	switch (m) {
		case 'getPerfData':
			getPerfData();
			break;
	}
});

function getPerfData() {
	framedNative.getPerfData().then((data) => {
		process.send({ message: 'perfData', data });
	});
}