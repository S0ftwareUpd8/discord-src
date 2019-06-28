'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.spawnUpdateInstall = spawnUpdateInstall;
exports.spawnUpdate = spawnUpdate;
exports.handleStartupEvent = handleStartupEvent;
exports.updateExistsSync = updateExistsSync;
exports.restart = restart;

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _autoStart = require('./autoStart');

var autoStart = _interopRequireWildcard(_autoStart);

var _windowsUtils = require('./windowsUtils');

var windowsUtils = _interopRequireWildcard(_windowsUtils);

var _singleInstance = require('./singleInstance');

var singleInstance = _interopRequireWildcard(_singleInstance);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// citron note: this assumes the execPath is in the format Discord/someVersion/Discord.exe
const appFolder = _path2.default.resolve(process.execPath, '..');
const rootFolder = _path2.default.resolve(appFolder, '..');
const exeName = _path2.default.basename(process.execPath);
const updateExe = _path2.default.join(rootFolder, 'Update.exe');

// Specialized spawn function specifically used for spawning the updater in
// update mode. Calls back with progress percentages.
// Returns Promise.
function spawnUpdateInstall(updateUrl, progressCallback) {
  return new Promise((resolve, reject) => {
    const proc = _child_process2.default.spawn(updateExe, ['--update', updateUrl]);
    proc.on('error', reject);
    proc.on('exit', code => {
      if (code !== 0) {
        return reject(new Error(`Update failed with exit code ${code}`));
      }
      return resolve();
    });

    let lastProgress = -1;
    function parseProgress() {
      const lines = stdout.split(/\r?\n/);
      if (lines.length === 1) return;
      // return the last (possibly incomplete) line to stdout for parsing again
      stdout = lines.pop();
      let currentProgress;
      for (const line of lines) {
        if (!/^\d\d?$/.test(line)) continue;
        const progress = Number(line);
        // make sure that this number is steadily increasing
        if (lastProgress > progress) continue;
        currentProgress = progress;
      }
      if (currentProgress == null) return;
      lastProgress = currentProgress;
      progressCallback(Math.min(currentProgress, 100));
    }

    let stdout = '';
    proc.stdout.on('data', chunk => {
      stdout += String(chunk);
      parseProgress();
    });
  });
}

// Spawn the Update.exe with the given arguments and invoke the callback when
// the command completes.
function spawnUpdate(args, callback) {
  windowsUtils.spawn(updateExe, args, callback);
}

// Create a desktop and start menu shortcut by using the command line API
// provided by Squirrel's Update.exe
function createShortcuts(callback, updateOnly) {
  // move icon out to a more stable location, to keep shortcuts from breaking as much
  const icoSrc = _path2.default.join(appFolder, 'app.ico');
  const icoDest = _path2.default.join(rootFolder, 'app.ico');
  let icoForTarget = icoDest;
  try {
    const ico = _fs2.default.readFileSync(icoSrc);
    _fs2.default.writeFileSync(icoDest, ico);
  } catch (e) {
    // if we can't write there for some reason, just use the source.
    icoForTarget = icoSrc;
  }
  const createShortcutArgs = ['--createShortcut', exeName, '--setupIcon', icoForTarget];
  if (updateOnly) {
    createShortcutArgs.push('--updateOnly');
  }
  spawnUpdate(createShortcutArgs, callback);
}

// Add a protocol registration for this application.
function installProtocol(protocol, callback) {
  const queue = [['HKCU\\Software\\Classes\\' + protocol, '/ve', '/d', `URL:${protocol} Protocol`], ['HKCU\\Software\\Classes\\' + protocol, '/v', 'URL Protocol'], ['HKCU\\Software\\Classes\\' + protocol + '\\DefaultIcon', '/ve', '/d', '"' + process.execPath + '",-1'], ['HKCU\\Software\\Classes\\' + protocol + '\\shell\\open\\command', '/ve', '/d', `"${process.execPath}" --url -- "%1"`]];

  windowsUtils.addToRegistry(queue, callback);
}

function terminate(app) {
  app.quit();
  process.exit(0);
}

// Remove the desktop and start menu shortcuts by using the command line API
// provided by Squirrel's Update.exe
function removeShortcuts(callback) {
  spawnUpdate(['--removeShortcut', exeName], callback);
}

// Update the desktop and start menu shortcuts by using the command line API
// provided by Squirrel's Update.exe
function updateShortcuts(callback) {
  createShortcuts(callback, true);
}

// Purge the protocol for this applicationstart.
function uninstallProtocol(protocol, callback) {
  windowsUtils.spawnReg(['delete', 'HKCU\\Software\\Classes\\' + protocol, '/f'], callback);
}

// Handle squirrel events denoted by --squirrel-* command line arguments.
// returns `true` if regular startup should be prevented
function handleStartupEvent(protocol, app, squirrelCommand) {
  switch (squirrelCommand) {
    case '--squirrel-install':
      createShortcuts(() => {
        autoStart.install(() => {
          installProtocol(protocol, () => {
            terminate(app);
          });
        });
      }, false);
      return true;

    case '--squirrel-updated':
      updateShortcuts(() => {
        autoStart.update(() => {
          installProtocol(protocol, () => {
            terminate(app);
          });
        });
      });
      return true;

    case '--squirrel-uninstall':
      removeShortcuts(() => {
        autoStart.uninstall(() => {
          uninstallProtocol(protocol, () => {
            singleInstance.pipeCommandLineArgs(() => terminate(app), () => terminate(app));
          });
        });
      });
      return true;

    case '--squirrel-obsolete':
      terminate(app);
      return true;

    default:
      return false;
  }
}

// Are we using Squirrel for updates?
function updateExistsSync() {
  return _fs2.default.existsSync(updateExe);
}

// Restart app as the new version
function restart(app, newVersion) {
  app.once('will-quit', () => {
    const execPath = _path2.default.resolve(rootFolder, `app-${newVersion}/${exeName}`);
    _child_process2.default.spawn(execPath, [], { detached: true });
  });
  app.quit();
}