const { contextBridge, ipcRenderer } = require('electron');
require('@sentry/electron/preload');
const Sentry = require('@sentry/electron/renderer');

Sentry.init();

contextBridge.exposeInMainWorld('framed', {
	getVersion: () => require('../../../../package.json').version,
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
	showLicenseModal: () => {
		ipcRenderer.send('showLicenseModal');
	}
});