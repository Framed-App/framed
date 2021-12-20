var chartConfig = {
	type: 'line',
	data: {
		datasets: [{
			label: 'Dropped Frames',
			data: [],
			borderColor: '#f1ebeb'
		}]
	},
	options: {
		maintainAspectRatio: false,
		scales: {
			x: {
				type: 'time'
			},
			y: {
				min: 0
			}
		},
		animation: false
	}
};

// eslint-disable-next-line no-undef
var chart = new Chart(
	document.getElementById('droppedFramesChart'),
	chartConfig
);

// eslint-disable-next-line no-unused-vars
function generateRandomDataset(length) {
	var data = [];
	var _min = 0;
	var _prevTime = Date.now() - (15 * 1000 * length);

	for (var i = 0; i < length; i++) {
		var _d = _min + Math.floor(Math.random() * 100);
		var _t = _prevTime;
		_min = _d;
		_prevTime += 15 * 1000;
		data.push({ x: _t, y: _d });
	}

	return data;
}

window.framed.receiveFrame((data) => {
	chartConfig.data.datasets[0].data.push(data);
	chart.update();
});

window.framed.receiveClearFrameData(() => {
	chartConfig.data.datasets[0].data = [];
	chart.update();
});