'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _events = require('events');

var _squirrelUpdate = require('./squirrelUpdate');

var squirrelUpdate = _interopRequireWildcard(_squirrelUpdate);

var _electron = require('electron');

var _request = require('./request');

var _request2 = _interopRequireDefault(_request);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function versionParse(verString) {
  return verString.split('.').map(i => parseInt(i));
}

function versionNewer(verA, verB) {
  let i = 0;
  while (true) {
    const a = verA[i];
    const b = verB[i];
    i++;
    if (a === undefined) {
      return false;
    } else {
      if (b === undefined || a > b) {
        return true;
      }
      if (a < b) {
        return false;
      }
    }
  }
}

class AutoUpdaterWin32 extends _events.EventEmitter {
  constructor() {
    super();

    this.updateUrl = null;
    this.updateVersion = null;
  }

  setFeedURL(updateUrl) {
    this.updateUrl = updateUrl;
  }

  quitAndInstall() {
    if (squirrelUpdate.updateExistsSync()) {
      squirrelUpdate.restart(_electron.app, this.updateVersion || _electron.app.getVersion());
    } else {
      require('auto-updater').quitAndInstall();
    }
  }

  downloadAndInstallUpdate(callback) {
    squirrelUpdate.spawnUpdateInstall(this.updateUrl, progress => {
      this.emit('update-progress', progress);
    }).catch(err => callback(err)).then(() => callback());
  }

  checkForUpdates() {
    if (this.updateUrl == null) {
      throw new Error('Update URL is not set');
    }

    this.emit('checking-for-update');

    if (!squirrelUpdate.updateExistsSync()) {
      this.emit('update-not-available');
      return;
    }

    squirrelUpdate.spawnUpdate(['--check', this.updateUrl], (error, stdout) => {
      if (error != null) {
        this.emit('error', error);
        return;
      }

      try {
        // Last line of the output is JSON details about the releases
        const json = stdout.trim().split('\n').pop();
        const releasesFound = JSON.parse(json).releasesToApply;
        if (releasesFound == null || releasesFound.length == 0) {
          this.emit('update-not-available');
          return;
        }

        const update = releasesFound.pop();
        this.emit('update-available');
        this.downloadAndInstallUpdate(error => {
          if (error != null) {
            this.emit('error', error);
            return;
          }

          this.updateVersion = update.version;

          this.emit('update-downloaded', {}, update.release, update.version, new Date(), this.updateUrl, this.quitAndInstall.bind(this));
        });
      } catch (error) {
        error.stdout = stdout;
        this.emit('error', error);
      }
    });
  }
}

// todo
class AutoUpdaterLinux extends _events.EventEmitter {
  constructor() {
    super();
    this.updateUrl = null;
  }

  setFeedURL(url) {
    this.updateUrl = url;
  }

  checkForUpdates() {
    const currVersion = versionParse(_electron.app.getVersion());
    this.emit('checking-for-update');

    _request2.default.get({ url: this.updateUrl, encoding: null }, (error, response, body) => {
      if (error) {
        console.error('[Updates] Error fetching ' + this.updateUrl + ': ' + error);
        this.emit('error', error);
        return;
      }

      if (response.statusCode === 204) {
        // you are up to date
        this.emit('update-not-available');
      } else if (response.statusCode === 200) {
        let latestVerStr = '';
        let latestVersion = [];
        try {
          const latestMetadata = JSON.parse(body);
          latestVerStr = latestMetadata.name;
          latestVersion = versionParse(latestVerStr);
        } catch (e) {}

        if (versionNewer(latestVersion, currVersion)) {
          console.log('[Updates] You are out of date!');
          // you need to update
          this.emit('update-manually', latestVerStr);
        } else {
          console.log('[Updates] You are living in the future!');
          this.emit('update-not-available');
        }
      } else {
        // something is wrong
        console.error(`[Updates] Error: fetch returned: ${response.statusCode}`);
        this.emit('update-not-available');
      }
    });
  }
}

let autoUpdater;

// TODO
// events: checking-for-update, update-available, update-not-available, update-manually, update-downloaded, error
// also, checkForUpdates, setFeedURL, quitAndInstall
// also, see electron.autoUpdater, and its API
switch (process.platform) {
  case 'darwin':
    autoUpdater = require('electron').autoUpdater;
    break;
  case 'win32':
    autoUpdater = new AutoUpdaterWin32();
    break;
  case 'linux':
    autoUpdater = new AutoUpdaterLinux();
    break;
}

exports.default = autoUpdater;
module.exports = exports['default'];