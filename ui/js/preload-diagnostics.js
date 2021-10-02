const { contextBridge, ipcRenderer } = require('electron');
const utils = require('../../utils.js');

contextBridge.exposeInMainWorld('framed', {
	receiveDiagnostics: (cb) => {
		ipcRenderer.on('diagnostics', (_, data) => cb(data));
	},
	convertBits: (bits, si) => utils.convertBits(bits, si),
	convertBytes: (bytes, si) => utils.convertBytes(bytes, si)
});