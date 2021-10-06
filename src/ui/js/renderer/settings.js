window.framed.getSettings();
window.framed.receiveSettings((settings) => {
	document.getElementById('tokenInput').value = settings.token;
	document.getElementById('ipInput').value = settings.ip;
	document.getElementById('portInput').value = settings.port;
});

document.getElementById('saveBtn').addEventListener('click', () => {
	var token = document.getElementById('tokenInput').value;
	var ip = document.getElementById('ipInput').value;
	var port = document.getElementById('portInput').value;

	window.framed.saveSettings({
		token,
		ip,
		port
	});
});