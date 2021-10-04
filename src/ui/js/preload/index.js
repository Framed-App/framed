const { contextBridge, ipcRenderer } = require('electron');
const utils = require('../../../utils.js');

contextBridge.exposeInMainWorld('framed', {
	onerror: (cb) => {
		ipcRenderer.on('error', (_, data) => cb(data));
	},
	oninfo: (cb) => {
		ipcRenderer.on('info', (_, data) => cb(data));
	},
	// There's probably a better way to do this, but all searches
	// return either "use remote" or "use app.getVersion()"
	getVersion: () => {
		ipcRenderer.send('get-version');
	},
	receiveVersion: (cb) => {
		ipcRenderer.on('version', (_, data) => cb(data));
	},
	requestIsConnected: () => {
		ipcRenderer.send('isConnected');
	},
	receiveConnected: (cb) => {
		ipcRenderer.on('connected', (_, data) => cb(data));
	},
	connectToWS: () => {
		ipcRenderer.send('doConnectToWS');
	},
	receiveCPPData: (cb) => {
		ipcRenderer.on('cppData', (_, data) => cb(data));
	},
	convertBits: (bits, si) => utils.convertBits(bits, si),
	convertBytes: (bytes, si) => utils.convertBytes(bytes, si),
	receiveDiagnostics: (cb) => {
		ipcRenderer.on('diagnostics', (_, data) => cb(data));
	},
	receiveFrame: (cb) => {
		ipcRenderer.on('frame', (_, data) => cb(data));
	},
	showDiagModal: (data) => {
		ipcRenderer.send('showDiagModal', data);
	},
	openSettings: () => {
		ipcRenderer.send('show-settings');
	}
});