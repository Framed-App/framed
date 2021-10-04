window.framed.getVersion();
window.framed.receiveVersion((version) => {
	document.getElementById('version').innerText = version;
});