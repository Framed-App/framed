const { contextBridge, ipcRenderer } = require('electron');
require('@sentry/electron/preload');
const Sentry = require('@sentry/electron/renderer');

Sentry.init();

contextBridge.exposeInMainWorld('framed', {
	getVersion: () => require('../../../../package.json').version,
	getSettings: () => {
		ipcRenderer.send('get-settings');
	},
	receiveSettings: (cb) => {
		ipcRenderer.on('settings', (_, data) => cb(data));
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
	saveSettings: (data) => {
		ipcRenderer.send('save-settings', data);
	},
	getFingerprint: () => {
		ipcRenderer.send('get-fingerprint');
	},
	receiveFingerprint: (cb) => {
		ipcRenderer.on('fingerprint', (_, data) => cb(data));
	},
	resetAppKey: () => {
		ipcRenderer.send('reset-app-key');
	}
});