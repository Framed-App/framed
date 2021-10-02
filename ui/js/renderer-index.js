window.framed.onerror((err) => {
	addNotice('alert', err);
});

window.framed.getVersion();
window.framed.receiveVersion((version) => {
	document.getElementById('version').innerText = version;
});

function setSize() {
	document.getElementById('droppedFramesChartContainer').style.height = `${window.innerHeight / 2}px`;
	document.getElementById('mainFooter').style.width = `${window.innerWidth - 20}px`;
}

window.addEventListener('resize', function() {
	setSize();
});

setSize();

var _ignoreConnectedStatusClick = false;
document.getElementById('connectedStatus').addEventListener('click', function() {
	if (_ignoreConnectedStatusClick) {
		console.warn('Ignoring connectedStatus click');
		addNotice('info', 'Please wait 5 seconds before attempting another reconnect');
		return;
	}
	window.framed.connectToWS();

	_ignoreConnectedStatusClick = true;
	setTimeout(() => {
		_ignoreConnectedStatusClick = false;
	}, 5000);
});

window.framed.requestIsConnected();
window.framed.receiveConnected((connected) => {
	var _connectedElem = document.getElementById('connectedStatus');

	_connectedElem.classList.remove('connected');
	_connectedElem.classList.remove('disconnected');

	_connectedElem.classList.add(connected ? 'connected' : 'disconnected');
});

function generateRandomness(length) {
	var _output = '';
	var _chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

	for (var i = 0; i < length; i++) {
		_output += _chars.split('')[Math.floor(Math.random() * _chars.length)];
	}

	return _output;
}

function sanitize(string) {
	var chars = {
		'&': '&amp',
		'<': '&lt',
		'>': '&gt',
		'"': '&quot',
		'\'': '&#x27'
	};

	for (var char in chars) {
		string = string.replace(char, chars[char]);
	}

	return string;
}

function addNotice(type, message) {
	var _noticesElem = document.getElementById('notices');
	var _noticeId = generateRandomness(16);
	var _allowedTypes = ['alert', 'info'];

	var div = document.createElement('div');
	div.className = `notice ${_allowedTypes.includes(type) ? type : 'info'}`;
	div.id = `notice-${_noticeId}`;
	var closeBtn = document.createElement('span');
	closeBtn.className = 'closeNotice';
	closeBtn.innerText = 'x';
	var msg = document.createElement('span');
	msg.innerText = sanitize(message);

	div.appendChild(closeBtn);
	div.appendChild(msg);

	closeBtn.addEventListener('click', handleCloseNoticeClick);

	_noticesElem.appendChild(div);

	return _noticeId;
}

function handleCloseNoticeClick(e) {
	e.target.parentElement.remove();
}

window.framed.receiveCPPData((data) => {
	document.getElementById('system-cpu').innerText = `${data.system.cpu.percentage}%`;
	document.getElementById('system-memory').innerText = window.framed.convertBytes(data.system.memory.memUsed);
	document.getElementById('system-disk-read').innerText = `${window.framed.convertBytes(data.system.disk.read)}/s`;
	document.getElementById('system-disk-write').innerText = `${window.framed.convertBytes(data.system.disk.write)}/s`;
	document.getElementById('system-download').innerText = `${window.framed.convertBits(data.system.network.inBytes * 8)}ps`;
	document.getElementById('system-upload').innerText = `${window.framed.convertBits(data.system.network.outBytes * 8)}ps`;
});

window.framed.receiveDiagnostics((data) => {
	var _diagElem = document.getElementById('diagnostics');

	var div = document.createElement('div');
	div.className = 'diagnostic';
	div.dataset.id = data.timestamp;
	// eslint-disable-next-line no-undef
	div.innerText = moment(data.timestamp).format('D MMM YYYY h:mm:ss A');

	div.addEventListener('click', (e) => {
		window.framed.showDiagModal(e.target.dataset.id);
	});

	_diagElem.appendChild(div);
});