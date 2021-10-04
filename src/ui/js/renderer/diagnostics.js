window.framed.receiveDiagnostics((data) => {
	console.log(data);
	// eslint-disable-next-line no-undef
	document.getElementById('time').innerText = moment(data.timestamp).format('D MMM YYYY h:mm:ss A');
	document.getElementById('frames').innerText = data.frames;
	document.getElementById('system-cpu').innerText = `${data.system.cpu.percentage}%`;
	document.getElementById('system-memory').innerText = window.framed.convertBytes(data.system.memory.memUsed);
	document.getElementById('system-disk-read').innerText = `${window.framed.convertBytes(data.system.disk.read)}/s`;
	document.getElementById('system-disk-write').innerText = `${window.framed.convertBytes(data.system.disk.write)}/s`;
	document.getElementById('system-download').innerText = `${window.framed.convertBits(data.system.network.inBytes * 8)}ps`;
	document.getElementById('system-upload').innerText = `${window.framed.convertBits(data.system.network.outBytes * 8)}ps`;

	createPingElem('Google', data.pings.google);
	createPingElem('TrueWinter', data.pings.truewinter);

	for (var i = 0; i < data.pings.twitch.length; i++) {
		createPingElem(`Twitch: ${data.pings.twitch[i].name}`, data.pings.twitch[i].average);
	}
});

function createPingElem(name, ping) {
	var _pingsElem = document.getElementById('pings');

	var div = document.createElement('div');
	div.className = 'ping';
	div.innerText = `${name}: ${ping}ms`;

	_pingsElem.appendChild(div);
}