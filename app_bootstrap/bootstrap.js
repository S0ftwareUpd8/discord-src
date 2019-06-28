'use strict';

// bootstrap, or what runs before the rest of desktop does
// responsible for handling updates and updating modules before continuing startup

if (process.platform === 'linux') {
  // Some people are reporting audio problems on Linux that are fixed by setting
  // an environment variable PULSE_LATENCY_MSEC=30 -- the "real" fix is to see
  // what conditions require this and set this then (also to set it directly in
  // our webrtc setup code rather than here) but this should fix the bug for now.
  if (process.env.PULSE_LATENCY_MSEC === undefined) {
    process.env.PULSE_LATENCY_MSEC = 30;
  }
}

const { app, Menu } = require('electron');

const buildInfo = require('./buildInfo');
app.setVersion(buildInfo.version);

// expose releaseChannel to a global, since it's used by splash screen
global.releaseChannel = buildInfo.releaseChannel;

const errorHandler = require('./errorHandler');
errorHandler.init();

const paths = require('../common/paths');
paths.init(buildInfo);

global.modulePath = paths.getModulePath();

const appSettings = require('./appSettings');
appSettings.init();

const Constants = require('./Constants');
const GPUSettings = require('./GPUSettings');

const settings = appSettings.getSettings();
// TODO: this is a copy of gpuSettings.getEnableHardwareAcceleration
if (!settings.get('enableHardwareAcceleration', true)) {
  app.disableHardwareAcceleration();
}

// [adill] disables color correction based on monitor's color profile
app.commandLine.appendSwitch('force-color-profile', 'srgb');

// [adill] work around chrome 66 disabling autoplay by default
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function hasArgvFlag(flag) {
  return (process.argv || []).slice(1).includes(flag);
}

console.log(`${Constants.APP_NAME} ${app.getVersion()}`);

let preventStartup = false;
if (process.platform === 'win32') {
  // this tells Windows (in particular Windows 10) which icon to associate your app with, important for correctly
  // pinning app to task bar.
  app.setAppUserModelId(Constants.APP_ID);

  const { handleStartupEvent } = require('./squirrelUpdate');
  // TODO: Isn't using argv[1] fragile?
  const squirrelCommand = process.argv[1];
  // TODO: Should `Discord` be a constant in this case? It's a protocol.
  // TODO: Is protocol case sensitive?
  if (handleStartupEvent('Discord', app, squirrelCommand)) {
    preventStartup = true;
  }
}

const singleInstance = require('./singleInstance');
const appUpdater = require('./appUpdater');
const moduleUpdater = require('../common/moduleUpdater');
const splashScreen = require('./splashScreen');
const autoStart = require('./autoStart');
const requireNative = require('./requireNative');
let coreModule;

function startUpdate() {
  console.log('Starting updater.');
  const startMinimized = hasArgvFlag('--start-minimized');

  appUpdater.update(startMinimized, () => {
    try {
      coreModule = requireNative('discord_desktop_core');
      coreModule.startup({
        paths,
        splashScreen,
        moduleUpdater,
        autoStart,
        buildInfo,
        appSettings,
        Constants,
        GPUSettings
      });
    } catch (err) {
      return errorHandler.fatal(err);
    }
  }, () => {
    coreModule.setMainWindowVisible(!startMinimized);
  });
}

function startApp() {
  console.log('Starting app.');
  paths.cleanOldVersions(buildInfo);
  const startupMenu = require('./startupMenu');
  Menu.setApplicationMenu(startupMenu);

  const multiInstance = hasArgvFlag('--multi-instance');

  if (multiInstance) {
    startUpdate();
  } else {
    singleInstance.create(startUpdate, args => {
      // TODO: isn't relying on index 0 awfully fragile?
      if (args != null && args.length > 0 && args[0] === '--squirrel-uninstall') {
        app.quit();
        return;
      }

      if (coreModule) {
        coreModule.handleSingleInstance(args);
      } else {
        appUpdater.focusSplash();
      }
    });
  }
}

if (preventStartup) {
  console.log('Startup prevented.');
  // TODO: shouldn't we exit out?
} else {
  if (app.isReady()) {
    startApp();
  } else {
    app.once('ready', startApp);
  }
}