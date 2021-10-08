const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell, ipcRenderer } = require('electron');
const axios = require('axios').default;
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const isIp = require('is-ip');
const Store = require('electron-store');

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
		ip: {
			type: 'string',
			default: '127.0.0.1'
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
var _savesDirExists = false;

function start() {
	function createWindow() {
		win = new BrowserWindow({
			width: 800,
			height: 600,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload', 'index.js'),
				contextIsolation: true
			},
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
						click: () => {}
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
					}
				]
			}
		];

		const menu = Menu.buildFromTemplate(template);
		win.setMenu(menu);
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
		});

		ipcMain.on('isConnected', () => {
			_eventEmitter.emit('isConnected');
		});

		ipcMain.on('doConnectToWS', () => {
			_eventEmitter.emit('doConnect');
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

			store.set('token', data.token);
			store.set('ip', data.ip);
			store.set('port', parseInt(data.port));

			win.webContents.send('info', 'Saved settings');

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

			if (_aboutModal !== null) {
				_aboutModal.close();
			}

			if (_settingsModal !== null) {
				_settingsModal.close();
			}

			win = null;
		});

		win.webContents.on('unresponsive', () => {
			console.log('unresponsive');
		});

		win.webContents.on('crashed', () => {
			console.log('crashed');
		});

		win.webContents.on('render-process-gone', (_, details) => {
			console.log('gone');
			console.log(details);
		});

		win.webContents.on('did-finish-load', () => {
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
		if (process.platform !== 'darwin') app.quit();
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

function init(eventEmitter) {
	if (!gotTheLock) {
		return app.quit();
	} else {
		app.on('second-instance', (event, commandLine, workingDirectory) => {
			// Someone tried to run a second instance, we should focus our window.
			if (win) {
				if (win.isMinimized()) win.restore();
				win.focus();
			}
		});
	}

	_eventEmitter = eventEmitter;

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
	console.log(err);
});

module.exports.init = init;
module.exports.isAlreadyOpen = isAlreadyOpen;
module.exports.getApp = getApp;