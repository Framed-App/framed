const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell } = require('electron');
const axios = require('axios').default;
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const isIp = require('is-ip');
const Store = require('electron-store');
const utils = require('./utils.js');

const store = new Store({
	schema: {
		token: {
			type: 'string',
			default: ''
		},
		port: {
			type: 'number',
			minimum: 1000,
			maximum: 65535,
			default: 59650
		},
		streamingSoftware: {
			type: 'string',
			default: 'obs'
		},
		ip: {
			type: 'string',
			default: '127.0.0.1'
		},
		disableHardwareAcceleration: {
			type: 'boolean',
			default: false
		}
	}
});

const gotTheLock = app.requestSingleInstanceLock();

let win = null;
var _eventEmitter = null;
var _aboutModal = null;
var _settingsModal = null;
var _diagModals = {};
var _diagData = {};
var _viewFRDWindows = {};
var _viewFRDDiagWindows = {};
var _viewFRDData = {};
var _savesDirExists = false;
var _prod = false;
var _log = null;

function start() {
	function createWindow() {
		win = new BrowserWindow({
			width: 800,
			height: 600,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'index.js'),
				contextIsolation: true
			},
			backgroundColor: '#24242c',
			show: false,
			icon: path.join(__dirname, 'img', 'icon.ico')
		});

		win.loadFile(path.join(__dirname, 'ui', 'index.html'));

		const template = [
			{
				label: 'File',
				submenu: [
					{
						label: 'Open',
						click: () => {
							showOpenDialog();
						}
					},
					{
						label: 'Save',
						click: () => {
							showSaveDialog(_diagData);
						}
					},
					{ role: 'quit' }
				]
			},
			{
				label: 'View',
				submenu: [
					{ role: 'reload' },
					{ role: 'forceReload' },
					{ type: 'separator' },
					{ role: 'toggleDevTools' }
				]
			},
			{
				label: 'Help',
				submenu: [
					{
						label: 'About',
						click: () => {
							createAboutModal();
						}
					},
					{
						label: 'Help',
						click: async () => {
							await shell.openExternal(`https://framed-app.com/docs/v${app.getVersion()}`);
						}
					},
					{
						label: 'Logs',
						click: async() => {
							await shell.openPath(path.join(app.getPath('userData'), 'logs'));
						}
					}
				]
			}
		];

		const menu = Menu.buildFromTemplate(template);
		win.setMenu(menu);
	}

	function createViewFRDWindow(filename) {
		if (_viewFRDWindows[filename]) {
			return _viewFRDWindows[filename].focus();
		}

		if (!_viewFRDData[filename]) return;

		_viewFRDWindows[filename] = new BrowserWindow({
			width: 700,
			height: 550,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'view-frd.js'),
				contextIsolation: true
			},
			backgroundColor: '#24242c',
			show: false,
			icon: path.join(__dirname, 'img', 'icon.ico')
		});

		_viewFRDWindows[filename].loadFile(path.join(__dirname, 'ui', 'view-frd.html'));
		_viewFRDWindows[filename].removeMenu();

		_viewFRDWindows[filename].once('ready-to-show', () => {
			_viewFRDWindows[filename].show();
		});

		_viewFRDWindows[filename].on('closed', () => {
			delete _viewFRDWindows[filename];
			delete _viewFRDData[filename];
		});

		_viewFRDWindows[filename].webContents.on('did-finish-load', () => {
			_viewFRDWindows[filename].webContents.send('frdData', {
				name: filename,
				data: _viewFRDData[filename]
			});
		});
	}

	// This was intended to be a modal but this works too
	function createDiagnosticsModal(timestamp) {
		if (_diagModals[timestamp]) {
			return _diagModals[timestamp].focus();
		}

		if (!_diagData[timestamp]) return;

		_diagModals[timestamp] = new BrowserWindow({
			width: 600,
			height: 500,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'diagnostics.js'),
				contextIsolation: true
			},
			backgroundColor: '#24242c',
			show: false,
			icon: path.join(__dirname, 'img', 'icon.ico')
		});

		_diagModals[timestamp].loadFile(path.join(__dirname, 'ui', 'diagnostics.html'));
		_diagModals[timestamp].removeMenu();

		_diagModals[timestamp].once('ready-to-show', () => {
			_diagModals[timestamp].show();
		});

		_diagModals[timestamp].on('closed', () => {
			delete _diagModals[timestamp];
		});

		_diagModals[timestamp].webContents.on('did-finish-load', () => {
			_diagModals[timestamp].webContents.send('diagnostics', _diagData[timestamp]);
		});
	}

	function createFRDDiagWindow(filename, timestamp) {
		if (_viewFRDDiagWindows[`${filename}-${timestamp}`]) {
			return _viewFRDDiagWindows[`${filename}-${timestamp}`].focus();
		}

		if (!_viewFRDData[filename][timestamp]) return;

		_viewFRDDiagWindows[`${filename}-${timestamp}`] = new BrowserWindow({
			width: 600,
			height: 500,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'diagnostics.js'),
				contextIsolation: true
			},
			backgroundColor: '#24242c',
			show: false,
			icon: path.join(__dirname, 'img', 'icon.ico')
		});

		_viewFRDDiagWindows[`${filename}-${timestamp}`].loadFile(path.join(__dirname, 'ui', 'diagnostics.html'));
		_viewFRDDiagWindows[`${filename}-${timestamp}`].removeMenu();

		_viewFRDDiagWindows[`${filename}-${timestamp}`].once('ready-to-show', () => {
			_viewFRDDiagWindows[`${filename}-${timestamp}`].show();
		});

		_viewFRDDiagWindows[`${filename}-${timestamp}`].on('closed', () => {
			delete _viewFRDDiagWindows[`${filename}-${timestamp}`];
		});

		_viewFRDDiagWindows[`${filename}-${timestamp}`].webContents.on('did-finish-load', () => {
			_viewFRDDiagWindows[`${filename}-${timestamp}`].webContents.send('diagnostics', _viewFRDData[filename][timestamp]);
		});
	}

	function createAboutModal() {
		if (_aboutModal !== null) {
			return _aboutModal.focus();
		}

		_aboutModal = new BrowserWindow({
			width: 300,
			height: 400,
			parent: win,
			modal: true,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'about.js'),
				contextIsolation: true
			},
			backgroundColor: '#24242c',
			icon: path.join(__dirname, 'img', 'icon.ico')
		});

		_aboutModal.loadFile(path.join(__dirname, 'ui', 'about.html'));
		_aboutModal.removeMenu();

		_aboutModal.on('ready-to-show', () => {
			_aboutModal.show();
		});

		_aboutModal.webContents.on('will-navigate', (e, url) => {
			var _allowedDomains = ['github.com'];
			var _url = new URL(url);

			e.preventDefault();

			if (_allowedDomains.includes(_url.host)) {
				shell.openExternal(url);
			}
		});

		_aboutModal.on('closed', () => {
			_aboutModal = null;
		});
	}

	function createSettingsModal() {
		if (_settingsModal !== null) {
			return _settingsModal.focus();
		}

		_settingsModal = new BrowserWindow({
			width: 600,
			height: 400,
			parent: win,
			modal: true,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'settings.js'),
				contextIsolation: true
			},
			backgroundColor: '#24242c',
			icon: path.join(__dirname, 'img', 'icon.ico')
		});

		_settingsModal.loadFile(path.join(__dirname, 'ui', 'settings.html'));
		_settingsModal.removeMenu();

		_settingsModal.on('ready-to-show', () => {
			_settingsModal.show();
		});

		_settingsModal.webContents.on('will-navigate', (e, url) => {
			var _allowedDomains = ['github.com'];
			var _url = new URL(url);

			e.preventDefault();

			if (_allowedDomains.includes(_url.host)) {
				shell.openExternal(url);
			}
		});

		_settingsModal.on('closed', () => {
			_settingsModal = null;
		});
	}

	function showOpenDialog() {
		dialog.showOpenDialog(win, {
			defaultPath: path.join(app.getPath('userData'), 'saves'),
			filters: [{
				name: 'Framed Data File',
				extensions: ['frd']
			}]
		}).then(function(data) {
			if (data.canceled) return;
			if (data.filePaths.length !== 1) return;

			fs.readFile(data.filePaths[0], function(err, frdData) {
				if (!win) return;

				if (err) {
					return win.webContents.send('error', `Failed to load data file. Error: ${err.name}`);
				}

				var frdJson = JSON.parse(frdData.toString());
				var frdName = path.parse(data.filePaths[0]).name;
				var validator = utils.validateFileData(frdJson);

				if (!validator.valid) {
					_log.error(`Failed to open data file. Invalid format. ${utils.validateFileData(frdJson).message}`);
					return win.webContents.send('error', 'Failed to open data file. Invalid format');
				}

				_viewFRDData[frdName] = frdJson;
				createViewFRDWindow(frdName);
			});
		}).catch(function(err) {
			win.webContents.send('error', `Failed to show file dialog: ${err.name}`);
		});
	}

	function showSaveDialog(framedData) {
		if (Object.keys(framedData).length === 0) {
			return win.webContents.send('error', 'No diagnostics data to save');
		}

		dialog.showSaveDialog(win, {
			defaultPath: _savesDirExists ? path.join(app.getPath('userData'), 'saves', `${getDate()}`) : `${getDate()}`,
			filters: [{
				name: 'Framed Data File',
				extensions: ['frd']
			}]
		}).then(function(data) {
			if (data.canceled) return;

			fs.writeFile(data.filePath, JSON.stringify(framedData), function(err) {
				if (!win) return;

				if (err) {
					return win.webContents.send('error', `Failed to save data file. Error: ${err.name}`);
				}

				win.webContents.send('info', `Saved data file to ${data.filePath}`);
			});
		}).catch(function(err) {
			win.webContents.send('error', `Failed to show file dialog: ${err.name}`);
		});
	}

	nativeTheme.themeSource = 'dark';

	app.whenReady().then(() => {
		createWindow();

		_eventEmitter.on('error', function(err) {
			if (!win) return;
			if (typeof err === 'string') {
				win.webContents.send('error', err);
			} else if (typeof err === 'object') {
				win.webContents.send('error', err.message);
			}
		});

		ipcMain.on('get-version', () => {
			if (!win) return;

			win.webContents.send('version', app.getVersion());

			if (_aboutModal !== null) {
				_aboutModal.webContents.send('version', app.getVersion());
			}

			for (var f in _viewFRDWindows) {
				_viewFRDWindows[f].webContents.send('version', app.getVersion());
			}
		});

		ipcMain.on('isConnected', () => {
			_eventEmitter.emit('isConnected');
		});

		ipcMain.on('doConnectToWS', () => {
			_eventEmitter.emit('doConnect');
		});

		ipcMain.on('showFRDDiagModal', (_, data) => {
			if (!Object.prototype.hasOwnProperty.call(_viewFRDData, data.filename)) return;

			createFRDDiagWindow(data.filename, data.timestamp);
		});

		ipcMain.on('showDiagModal', (_, data) => {
			createDiagnosticsModal(data);
		});

		ipcMain.on('get-settings', () => {
			if (!_settingsModal) return;

			_settingsModal.webContents.send('settings', store.store);
		});

		ipcMain.on('save-settings', (_, data) => {
			if (!_settingsModal) return;
			_settingsModal.close();

			if (!data.token || !data.ip || !data.port) {
				return win.webContents.send('error', 'Failed to save settings. Required data missing.');
			}

			if (!isIp(data.ip)) {
				return win.webContents.send('error', 'Failed to save settings. Invalid IP');
			}

			if (!data.port.match(/^[0-9]{1,5}$/)) {
				return win.webContents.send('error', 'Failed to save settings. Invalid port');
			}

			if (!['streamlabs', 'obs'].includes(data.streamingSoftware)) {
				return win.webContents.send('error', 'Failed to save settings. Invalid streaming software.');
			}

			var _prevHardwareAccelerationSettings = store.get('disableHardwareAcceleration');

			store.set('streamingSoftware', data.streamingSoftware);
			store.set('token', data.token);
			store.set('ip', data.ip);
			store.set('port', parseInt(data.port));
			store.set('disableHardwareAcceleration', data.disableHardwareAcceleration);

			win.webContents.send('info', 'Saved settings');

			if (data.disableHardwareAcceleration !== _prevHardwareAccelerationSettings) {
				win.webContents.send('info', `You will need to restart Framed to ${data.disableHardwareAcceleration ? 'disable' : 'enable'} hardware acceleration`);
			}

			_prevHardwareAccelerationSettings = data.disableHardwareAcceleration;

			_eventEmitter.emit('doDisconnect');
			_eventEmitter.emit('doSetConfig', data);
			setTimeout(() => {
				_eventEmitter.emit('doConnect');
			}, 50);
		});

		ipcMain.on('show-settings', () => {
			createSettingsModal();
		});

		ipcMain.on('open-twitter', () => {
			shell.openExternal('https://twitter.com/TheFramedApp');
		});

		ipcMain.on('open-discord', () => {
			shell.openExternal('https://framed-app.com/discord');
		});

		ipcMain.on('open-docs', () => {
			shell.openExternal(`https://framed-app.com/docs/v${app.getVersion()}`);
		});

		_eventEmitter.on('connectedState', (connected) => {
			if (!win) return;
			win.webContents.send('connected', connected);
		});

		_eventEmitter.on('cppData', (data) => {
			if (!win) return;
			win.webContents.send('cppData', data);
		});

		_eventEmitter.on('frame', (data) => {
			if (!win) return;
			win.webContents.send('frame', data);
		});

		_eventEmitter.on('diagnostics', (data) => {
			if (!win) return;
			_diagData[data.timestamp] = data;
			win.webContents.send('diagnostics', data);
		});

		_eventEmitter.on('resetStreamDiagnosticsData', () => {
			_diagData = {};

			win.webContents.send('clearDiagData');
			win.webContents.send('clearFrameData');
		});

		win.once('ready-to-show', () => {
			win.show();
			_eventEmitter.emit('doSetConfig', store.store);
			_eventEmitter.emit('doConnect');
			_eventEmitter.emit('startCPPApi');
		});

		win.on('closed', () => {
			for (var diagWin in _diagModals) {
				_diagModals[diagWin].close();
			}

			for (var f in _viewFRDWindows) {
				_viewFRDWindows[f].close();
			}

			for (var d in _viewFRDDiagWindows) {
				_viewFRDDiagWindows[d].close();
			}

			if (_aboutModal !== null) {
				_aboutModal.close();
			}

			if (_settingsModal !== null) {
				_settingsModal.close();
			}

			win = null;
		});

		win.webContents.on('unresponsive', () => {
			_log.info('unresponsive');
		});

		win.webContents.on('crashed', () => {
			_log.info('crashed');
		});

		win.webContents.on('render-process-gone', (_, details) => {
			_log.info('gone');
			_log.info(details);
		});

		win.webContents.on('did-finish-load', () => {
			if (!_prod) return _log.info('Dev version detected. Skipping version check');
			axios.get(`https://cf-api.framed-app.com/latest-version?version=v${app.getVersion()}`).then((response) => {
				if (response.data.newer) {
					switch (response.data.branch) {
						case 'stable':
							win.webContents.send('info', `Update available. Version ${response.data.message.replace(/^v/, '')} has been released.`);
							break;
						case 'beta':
							win.webContents.send('info', `Beta update available. Version ${response.data.message.replace(/^v/, '')} has been released. Note: using beta versions is discouraged.`);
							break;
					}
				}
			}).catch((err) => {
				console.error('Failed to query Framed API to check for updates');
				console.error(err);
			});
		});
	});

	app.on('window-all-closed', function () {
		if (process.platform !== 'darwin') {
			app.quit();
			_eventEmitter.emit('killNativeAPIChildProcess');
		}
	});
}

function ensureExists(path, cb) {
	fs.mkdir(path, function(err) {
		if (err) {
			if (err.code === 'EEXIST') {
				return cb(null);
			} else {
				return cb(err);
			}
		} else {
			return cb(null);
		}
	});
}

function getDate() {
	return moment().format('YYYY-MM-DD-HH-mm-ss');
}

function init(eventEmitter, prod, log) {
	if (!gotTheLock) {
		return app.quit();
	} else {
		// eslint-disable-next-line no-unused-vars
		app.on('second-instance', (event, commandLine, workingDirectory) => {
			// Someone tried to run a second instance, we should focus our window.
			if (win) {
				if (win.isMinimized()) win.restore();
				win.focus();
			}
		});
	}

	log.info(`Started Framed v${app.getVersion()}`);

	if (store.get('disableHardwareAcceleration')) {
		log.info('Disabling hardware acceleration');
		app.disableHardwareAcceleration();
	}

	_eventEmitter = eventEmitter;
	_prod = prod;
	_log = log;

	ensureExists(path.join(app.getPath('userData'), 'saves'), function(err) {
		if (err) {
			_savesDirExists = false;
		} else {
			_savesDirExists = true;
		}

		start();
	});
}

function isAlreadyOpen() {
	return !gotTheLock;
}

function getApp() {
	return app;
}

process.on('uncaughtException', function (err) {
	if (_log) {
		_log.error(err);
	} else {
		console.error(err);
	}
});

module.exports.init = init;
module.exports.isAlreadyOpen = isAlreadyOpen;
module.exports.getApp = getApp;