const { contextBridge, ipcRenderer } = require('electron');
const utils = require('../../../utils.js');

contextBridge.exposeInMainWorld('framed', {
	getVersion: () => {
		ipcRenderer.send('get-version');
	},
	receiveVersion: (cb) => {
		ipcRenderer.on('version', (_, data) => cb(data));
	},
	convertBits: (bits, si) => utils.convertBits(bits, si),
	convertBytes: (bytes, si) => utils.convertBytes(bytes, si),
	showFRDDiagModal: (data) => {
		ipcRenderer.send('showFRDDiagModal', data);
	},
	receiveFRDData: (cb) => {
		ipcRenderer.on('frdData', (_, data) => cb(data));
	}
});