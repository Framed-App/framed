const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const gotTheLock = app.requestSingleInstanceLock();

let win = null;
var _eventEmitter;
var _diagModals = {};
var _diagData = {};

function start() {
	function createWindow() {
		win = new BrowserWindow({
			width: 800,
			height: 600,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload-index.js'),
				contextIsolation: true
			},
			show: false,
			autoHideMenuBar: true
		});

		win.loadFile('ui/index.html');
	}

	// This was intended to be a modal but this works too
	function createDiagnosticsModal(timestamp) {
		if (_diagModals[timestamp]) {
			return _diagModals[timestamp].focus();
		}

		if (!_diagData[timestamp]) return;

		_diagModals[timestamp] = new BrowserWindow({
			width: 600,
			height: 400,
			webPreferences: {
				preload: path.join(__dirname, 'ui', 'js', 'preload-diagnostics.js'),
				contextIsolation: true
			},
			show: false,
			autoHideMenuBar: true
		});

		_diagModals[timestamp].loadFile('ui/diagnostics.html');

		_diagModals[timestamp].once('ready-to-show', () => {
			_diagModals[timestamp].show();
		});

		_diagModals[timestamp].on('close', () => {
			delete _diagModals[timestamp];
		});

		_diagModals[timestamp].webContents.on('did-finish-load', () => {
			_diagModals[timestamp].webContents.send('diagnostics', _diagData[timestamp]);
		});
	}

	nativeTheme.themeSource = 'dark';

	app.whenReady().then(() => {
		createWindow();
		_eventEmitter.emit('doConnect');
		_eventEmitter.emit('startCPPApi');

		_eventEmitter.on('error', function(err) {
			if (!win) return;
			if (typeof err === 'string') {
				win.webContents.send('error', err);
			} else if (typeof err === 'object') {
				win.webContents.send('error', err.message);
			}
		});

		ipcMain.on('get-version', () => {
			win.webContents.send('version', app.getVersion());
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

		setTimeout(() => {
			_eventEmitter.emit('error', 'test error');
		}, 10000);

		win.once('ready-to-show', () => {
			win.show();
		});

		win.on('close', () => {
			for (var diagWin in _diagModals) {
				_diagModals[diagWin].close();
			}
		});

		win.webContents.on('did-finish-load', () => {
			//win.webContents.openDevTools();
			win.webContents.send('test', 'testing');
		});
	});

	app.on('window-all-closed', function () {
		if (process.platform !== 'darwin') app.quit();
	});
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
	start();
}

function isAlreadyOpen() {
	return !gotTheLock;
}

function getApp() {
	return app;
}

module.exports.init = init;
module.exports.isAlreadyOpen = isAlreadyOpen;
module.exports.getApp = getApp;