const { contextBridge, ipcRenderer } = require('electron');
require('@sentry/electron/preload');
const Sentry = require('@sentry/electron/renderer');
const utils = require('../../../utils.js');

Sentry.init();

contextBridge.exposeInMainWorld('framed', {
	getVersion: () => require('../../../../package.json').version,
	receiveDiagnostics: (cb) => {
		ipcRenderer.on('diagnostics', (_, data) => cb(data));
	},
	isProd: () => require('electron-util/node').isUsingAsar,
	getInstallId: () => {
		ipcRenderer.send('get-install-id');
	},
	receiveInstallId: (cb) => {
		ipcRenderer.on('install-id', (_, data) => cb(data));
	},
	getIsAnalyticsEnabled: () => {
		ipcRenderer.send('is-analytics-enabled');
	},
	receiveIsAnalyticsEnabled: (cb) => {
		ipcRenderer.on('analytics-enabled', (_, data) => cb(data));
	},
	convertBits: (bits, si) => utils.convertBits(bits, si),
	convertBytes: (bytes, si) => utils.convertBytes(bytes, si)
});