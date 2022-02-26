document.getElementById('version').innerText = window.framed.getVersion();

function setSize() {
	document.getElementById('droppedFramesChartContainer').style.height = `${window.innerHeight / 2}px`;
	document.getElementById('mainFooter').style.width = `${window.innerWidth - 20}px`;
}

window.addEventListener('resize', function() {
	setSize();
});

setSize();

var frdData = {};
var fn;
var _prevHover;

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
		plugins: {
			legend: {
				display: false
			}
		},
		// Displaying the line would indicate that the dropped frames
		// increased over time since the last dropped frames point,
		// which is inaccurate.
		borderWidth: 0,
		pointBorderWidth: 1,
		animation: false,
		onHover: function(e, elem) {
			if (elem.length === 0) return;

			if (_prevHover !== elem[0].element.parsed.x) {
				_prevHover = elem[0].element.parsed.x;

				setSystemStats(frdData[elem[0].element.parsed.x]);
			}
		}
	}
};

// eslint-disable-next-line no-undef
var chart = new Chart(
	document.getElementById('droppedFramesChart'),
	chartConfig
);

window.framed.receiveFRDData((data) => {
	frdData = data.data;
	fn = data.name;
	document.getElementById('frdFile').innerText = data.name;

	for (var d in data.data) {
		chartConfig.data.datasets[0].data.push({
			x: data.data[d].timestamp,
			y: data.data[d].frames
		});

		addDiagnostics(data.data[d]);
	}

	chart.update();
});

function sanitize(string) {
	var chars = {
		'&': '&amp',
		'<': '&lt',
		'>': '&gt',
		'"': '&quot',
		'\'': '&#x27'
	};

	for (var char in chars) {
		string = string.toString().replaceAll(char, chars[char]);
	}

	return string;
}

function setSystemStats(data) {
	document.getElementById('system-cpu').innerText = `${sanitize(data.system.cpu.percentage)}%`;
	document.getElementById('system-memory').innerText = sanitize(window.framed.convertBytes(data.system.memory.memUsed));
	document.getElementById('system-disk-read').innerText = `${sanitize(window.framed.convertBytes(data.system.disk.read))}/s`;
	document.getElementById('system-disk-write').innerText = `${sanitize(window.framed.convertBytes(data.system.disk.write))}/s`;
	document.getElementById('system-download').innerText = `${sanitize(window.framed.convertBits(data.system.network.inBytes * 8))}ps`;
	document.getElementById('system-upload').innerText = `${sanitize(window.framed.convertBits(data.system.network.outBytes * 8))}ps`;

	// eslint-disable-next-line no-undef
	document.getElementById('sysStatsTime').innerText = `System stats at ${sanitize(moment(data.timestamp).format('D MMM YYYY h:mm:ss A'))}`;
}

function addDiagnostics(data) {
	var _diagElem = document.getElementById('diagnostics');

	var div = document.createElement('div');
	div.className = 'diagnostic';
	div.dataset.id = data.timestamp;
	// eslint-disable-next-line no-undef
	div.innerText = moment(data.timestamp).format('D MMM YYYY h:mm:ss A');
	div.innerHTML += `<span title="Dropped Frames"><i class="fas fa-video"></i> <span class="diagnostic-frames">${sanitize(data.frames)}</span></span>`;

	div.addEventListener('click', (e) => {
		window.framed.showFRDDiagModal({
			timestamp: e.target.dataset.id,
			filename: fn
		});
	});

	_diagElem.appendChild(div);
}