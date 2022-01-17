window.framed.getSettings();
window.framed.receiveSettings((settings) => {
	document.getElementById('tokenInputSL').value = settings.token;
	document.getElementById('portInputSL').value = settings.port;
	document.getElementById('tokenInputOBS').value = settings.token;
	document.getElementById('portInputOBS').value = settings.port;
	document.getElementById('ipInput').value = settings.ip;
	document.getElementById('disableHardwareAcceleration').checked = settings.disableHardwareAcceleration;

	switch (settings.streamingSoftware) {
		case 'streamlabs':
			document.getElementById('streamingSoftwareStreamlabs').checked = true;
			break;
		case 'obs':
			document.getElementById('streamingSoftwareOBS').checked = true;
			break;
	}

	updateSettingDisplay(settings.streamingSoftware, true);
});

window.framed.getFingerprint();
window.framed.receiveFingerprint((data) => {
	var img = document.createElement('img');
	img.src = data.qrcode;

	document.getElementById('fingerprintQR').appendChild(img);
	document.getElementById('fingerprintCode').innerText = data.fingerprint;
});

function createWarnElem(message) {
	var warnElem = document.createElement('div');
	warnElem.dataset.type = 'portWarn';
	warnElem.innerText = message;
	warnElem.style.color = 'orange';

	return warnElem;
}

function hideWarnElems() {
	var elems = document.querySelectorAll('div[data-type="portWarn"]');

	for (var i = 0; i < elems.length; i++) {
		elems[i].remove();
	}
}

// alert() caused cursor to vanish in textboxes
function showWarn(message) {
	if (document.querySelectorAll('div[data-type="portWarn"]').length !== 0) return;

	var portSL = document.getElementById('portInputSL');
	var portOBS = document.getElementById('portInputOBS');

	portSL.after(createWarnElem(message));
	portOBS.after(createWarnElem(message));

	setTimeout(function() {
		hideWarnElems();
	}, 5 * 1000);
}

function updateSettingDisplay(s, i = false) {
	switch (s) {
		case 'streamlabs':
			document.getElementById('streamlabsSettings').style.display = 'unset';
			document.getElementById('obsSettings').style.display = 'none';

			if (!i) {
				document.getElementById('portInputSL').value = '59650';
				document.getElementById('portInputOBS').value = '59650';
			}
			break;
		case 'obs':
			document.getElementById('streamlabsSettings').style.display = 'none';
			document.getElementById('obsSettings').style.display = 'unset';

			if (!i) {
				document.getElementById('portInputSL').value = '4444';
				document.getElementById('portInputOBS').value = '4444';
			}
			break;
	}
}

function changeEvent(e) {
	updateSettingDisplay(e.target.value);
}

document.querySelectorAll('input[name="streamingSoftware"]').forEach((r) => {
	r.addEventListener('change', changeEvent);
});

document.getElementById('saveBtn').addEventListener('click', () => {
	var streamingSoftware = document.querySelector('input[name="streamingSoftware"]:checked').value;

	var token;
	var port;

	switch (streamingSoftware) {
		case 'streamlabs':
			token = document.getElementById('tokenInputSL').value;
			port = document.getElementById('portInputSL').value;
			break;
		case 'obs':
			token = document.getElementById('tokenInputOBS').value;
			port = document.getElementById('portInputOBS').value;
			break;
		default:
			alert('No valid streaming software selected');
	}

	var ip = document.getElementById('ipInput').value;
	var disableHardwareAcceleration = document.getElementById('disableHardwareAcceleration').checked;

	if (port < 1000 || port > 65535) {
		showWarn('Port must be between 1000 and 65535');
		return;
	}

	window.framed.saveSettings({
		streamingSoftware,
		token,
		ip,
		port,
		disableHardwareAcceleration
	});
});