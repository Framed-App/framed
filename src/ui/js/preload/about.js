const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('framed', {
	// There's probably a better way to do this, but all searches
	// return either "use remote" or "use app.getVersion()"
	getVersion: () => {
		ipcRenderer.send('get-version');
	},
	receiveVersion: (cb) => {
		ipcRenderer.on('version', (_, data) => cb(data));
	}
});