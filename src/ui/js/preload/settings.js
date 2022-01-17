const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('framed', {
	getSettings: () => {
		ipcRenderer.send('get-settings');
	},
	receiveSettings: (cb) => {
		ipcRenderer.on('settings', (_, data) => cb(data));
	},
	saveSettings: (data) => {
		ipcRenderer.send('save-settings', data);
	},
	getFingerprint: () => {
		ipcRenderer.send('get-fingerprint');
	},
	receiveFingerprint: (cb) => {
		ipcRenderer.on('fingerprint', (_, data) => cb(data));
	}
});