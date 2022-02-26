const { contextBridge, ipcRenderer } = require('electron');
require('@sentry/electron/preload');
const Sentry = require('@sentry/electron/renderer');
const utils = require('../../../utils.js');

Sentry.init();

contextBridge.exposeInMainWorld('framed', {
	onerror: (cb) => {
		ipcRenderer.on('error', (_, data) => cb(data));
	},
	oninfo: (cb) => {
		ipcRenderer.on('info', (_, data) => cb(data));
	},
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
	receiveClearDiagData: (cb) => {
		ipcRenderer.on('clearDiagData', () => cb());
	},
	receiveClearFrameData: (cb) => {
		ipcRenderer.on('clearFrameData', () => cb());
	},
	showDiagModal: (data) => {
		ipcRenderer.send('showDiagModal', data);
	},
	openSettings: () => {
		ipcRenderer.send('show-settings');
	},
	openTwitter: () => {
		ipcRenderer.send('open-twitter');
	},
	openDiscord: () => {
		ipcRenderer.send('open-discord');
	},
	openDocs: () => {
		ipcRenderer.send('open-docs');
	}
});