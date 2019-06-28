'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.events = exports.APP_SHOULD_SHOW = exports.APP_SHOULD_LAUNCH = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.initSplash = initSplash;
exports.focusWindow = focusWindow;
exports.pageReady = pageReady;

var _electron = require('electron');

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _events = require('events');

var _moduleUpdater = require('../common/moduleUpdater');

var moduleUpdater = _interopRequireWildcard(_moduleUpdater);

var _ipcMain = require('./ipcMain');

var _ipcMain2 = _interopRequireDefault(_ipcMain);

var _paths = require('../common/paths');

var paths = _interopRequireWildcard(_paths);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const UPDATE_TIMEOUT_WAIT = 10000;
const RETRY_CAP_SECONDS = 60;
// citron note: atom seems to add about 50px height to the frame on mac but not windows
// TODO: see if we can eliminate fudge by using useContentSize BrowserWindow option
const LOADING_WINDOW_WIDTH = 300;
const LOADING_WINDOW_HEIGHT = process.platform == 'darwin' ? 300 : 350;

// TODO: addModulesListener events should use Module's constants
const CHECKING_FOR_UPDATES = 'checking-for-updates';
const UPDATE_CHECK_FINISHED = 'update-check-finished';
const UPDATE_FAILURE = 'update-failure';
const LAUNCHING = 'launching';
const DOWNLOADING_MODULE = 'downloading-module';
const DOWNLOADING_UPDATES = 'downloading-updates';
const DOWNLOADING_MODULES_FINISHED = 'downloading-modules-finished';
const DOWNLOADING_MODULE_PROGRESS = 'downloading-module-progress';
const DOWNLOADED_MODULE = 'downloaded-module';
const NO_PENDING_UPDATES = 'no-pending-updates';
const INSTALLING_MODULE = 'installing-module';
const INSTALLING_UPDATES = 'installing-updates';
const INSTALLED_MODULE = 'installed-module';
const INSTALLING_MODULE_PROGRESS = 'installing-module-progress';
const INSTALLING_MODULES_FINISHED = 'installing-modules-finished';
const UPDATE_MANUALLY = 'update-manually';

const APP_SHOULD_LAUNCH = exports.APP_SHOULD_LAUNCH = 'APP_SHOULD_LAUNCH';
const APP_SHOULD_SHOW = exports.APP_SHOULD_SHOW = 'APP_SHOULD_SHOW';

const events = exports.events = new _events.EventEmitter();

function webContentsSend(win, event, ...args) {
  if (win != null && win.webContents != null) {
    win.webContents.send(`DISCORD_${event}`, ...args);
  }
}

let splashWindow;
let modulesListeners;
let updateTimeout;
let updateAttempt;
let splashState;
let launchedMainWindow;
let quoteCachePath;

function initSplash(startMinimized = false) {
  modulesListeners = {};
  splashState = {};
  launchedMainWindow = false;
  updateAttempt = 0;

  addModulesListener(CHECKING_FOR_UPDATES, () => {
    startUpdateTimeout();
    updateSplashState(CHECKING_FOR_UPDATES);
  });

  addModulesListener(UPDATE_CHECK_FINISHED, (succeeded, updateCount, manualRequired) => {
    stopUpdateTimeout();
    if (!succeeded) {
      scheduleUpdateCheck();
      updateSplashState(UPDATE_FAILURE);
    } else if (updateCount === 0) {
      launchMainWindow();
      updateSplashState(LAUNCHING);
    }
  });

  addModulesListener(DOWNLOADING_MODULE, (name, current, total) => {
    stopUpdateTimeout();
    splashState = { current, total };
    updateSplashState(DOWNLOADING_UPDATES);
  });

  addModulesListener(DOWNLOADING_MODULE_PROGRESS, (name, progress) => {
    splashState.progress = progress;
    updateSplashState(DOWNLOADING_UPDATES);
  });

  addModulesListener(DOWNLOADED_MODULE, (name, current, total, succeeded) => delete splashState.progress);

  addModulesListener(DOWNLOADING_MODULES_FINISHED, (succeeded, failed) => {
    if (failed > 0) {
      scheduleUpdateCheck();
      updateSplashState(UPDATE_FAILURE);
    } else {
      process.nextTick(() => moduleUpdater.quitAndInstallUpdates());
    }
  });

  addModulesListener(NO_PENDING_UPDATES, () => moduleUpdater.checkForUpdates());

  addModulesListener(INSTALLING_MODULE, (name, current, total) => {
    splashState = { current, total };
    updateSplashState(INSTALLING_UPDATES);
  });

  addModulesListener(INSTALLED_MODULE, (name, current, total, succeeded) => delete splashState.progress);

  addModulesListener(INSTALLING_MODULE_PROGRESS, (name, progress) => {
    splashState.progress = progress;
    updateSplashState(INSTALLING_UPDATES);
  });

  addModulesListener(INSTALLING_MODULES_FINISHED, (succeeded, failed) => moduleUpdater.checkForUpdates());

  addModulesListener(UPDATE_MANUALLY, newVersion => {
    splashState.newVersion = newVersion;
    updateSplashState(UPDATE_MANUALLY);
  });

  launchSplashWindow(startMinimized);

  quoteCachePath = _path2.default.join(paths.getUserData(), 'quotes.json');
  _ipcMain2.default.on('UPDATED_QUOTES', (_event, quotes) => cacheLatestQuotes(quotes));
}

function destroySplash() {
  removeModulesListeners();
  stopUpdateTimeout();

  if (splashWindow) {
    splashWindow.setSkipTaskbar(true);
    // defer the window hiding for a short moment so it gets covered by the main window
    const _nukeWindow = () => {
      splashWindow.hide();
      splashWindow.close();
      splashWindow = null;
    };
    setTimeout(_nukeWindow, 100);
  }
}

function addModulesListener(event, listener) {
  modulesListeners[event] = listener;
  moduleUpdater.events.addListener(event, listener);
}

function removeModulesListeners() {
  for (const event of Object.keys(modulesListeners)) {
    moduleUpdater.events.removeListener(event, modulesListeners[event]);
  }
}

function startUpdateTimeout() {
  if (!updateTimeout) {
    updateTimeout = setTimeout(() => scheduleUpdateCheck(), UPDATE_TIMEOUT_WAIT);
  }
}

function stopUpdateTimeout() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
}

function updateSplashState(event) {
  if (splashWindow != null && !splashWindow.isDestroyed() && !splashWindow.webContents.isDestroyed()) {
    webContentsSend(splashWindow, 'SPLASH_UPDATE_STATE', _extends({ status: event }, splashState));
  }
}

function launchSplashWindow(startMinimized) {
  const windowConfig = {
    width: LOADING_WINDOW_WIDTH,
    height: LOADING_WINDOW_HEIGHT,
    transparent: false,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: true
    }
  };

  splashWindow = new _electron.BrowserWindow(windowConfig);

  // prevent users from dropping links to navigate in splash window
  splashWindow.webContents.on('will-navigate', e => e.preventDefault());

  splashWindow.webContents.on('new-window', (e, windowURL) => {
    e.preventDefault();
    _electron.shell.openExternal(windowURL);
    // exit, but delay half a second because openExternal is about to fire
    // some events to things that are freed by app.quit.
    setTimeout(_electron.app.quit, 500);
  });

  if (process.platform !== 'darwin') {
    // citron note: this causes a crash on quit while the window is open on osx
    splashWindow.on('closed', () => {
      splashWindow = null;
      if (!launchedMainWindow) {
        // user has closed this window before we launched the app, so let's quit
        _electron.app.quit();
      }
    });
  }

  _ipcMain2.default.on('SPLASH_SCREEN_READY', () => {
    let cachedQuote = chooseCachedQuote();
    if (cachedQuote) {
      webContentsSend(splashWindow, 'SPLASH_SCREEN_QUOTE', cachedQuote);
    }

    if (splashWindow && !startMinimized) {
      splashWindow.show();
    }

    moduleUpdater.installPendingUpdates();
  });

  const splashUrl = _url2.default.format({
    protocol: 'file',
    slashes: true,
    pathname: _path2.default.join(__dirname, 'splash', 'index.html')
  });

  splashWindow.loadURL(splashUrl);
}

function launchMainWindow() {
  if (!launchedMainWindow && splashWindow != null) {
    launchedMainWindow = true;
    events.emit(APP_SHOULD_LAUNCH);
  }
}

function scheduleUpdateCheck() {
  // TODO: can we use backoff here?
  updateAttempt += 1;
  const retryInSeconds = Math.min(updateAttempt * 10, RETRY_CAP_SECONDS);
  splashState.seconds = retryInSeconds;
  setTimeout(() => moduleUpdater.checkForUpdates(), retryInSeconds * 1000);
}

function focusWindow() {
  if (splashWindow != null) {
    splashWindow.focus();
  }
}

function pageReady() {
  destroySplash();
  process.nextTick(() => events.emit(APP_SHOULD_SHOW));
}

function cacheLatestQuotes(quotes) {
  _fs2.default.writeFile(quoteCachePath, JSON.stringify(quotes), e => {
    if (e) {
      console.warn('Failed updating quote cache with error: ', e);
    }
  });
}

function chooseCachedQuote() {
  let cachedQuote = null;
  try {
    const cachedQuotes = JSON.parse(_fs2.default.readFileSync(quoteCachePath));
    cachedQuote = cachedQuotes[Math.floor(Math.random() * cachedQuotes.length)];
  } catch (_err) {}
  return cachedQuote;
}