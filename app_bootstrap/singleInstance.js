'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.create = create;
exports.pipeCommandLineArgs = pipeCommandLineArgs;

var _electron = require('electron');

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _buildInfo = require('./buildInfo');

var _buildInfo2 = _interopRequireDefault(_buildInfo);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function deleteSocketFile(socketPath) {
  if (process.platform === 'win32') {
    return;
  }

  if (_fs2.default.existsSync(socketPath)) {
    try {
      _fs2.default.unlinkSync(socketPath);
    } catch (error) {
      // Ignore ENOENT errors in case the file was deleted between the exists
      // check and the call to unlink sync. This occurred occasionally on CI
      // which is why this check is here.
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * Creates server to listen for additional atom application launches.
 *
 * You can run the command multiple times, but after the first launch
 * the other launches will just pass their information to this server and then
 * close immediately.
 */
function listenForArgumentsFromNewProcess(socketPath, callback) {
  deleteSocketFile(socketPath);

  const server = _net2.default.createServer(connection => {
    connection.on('data', data => {
      const args = JSON.parse(data);
      callback(args);
    });
  });
  server.listen(socketPath);
  server.on('error', error => console.error('Application server failed', error));
  return server;
}

function tryStart(socketPath, callback, otherAppFound) {
  // FIXME: Sometimes when socketPath doesn't exist, net.connect would strangely
  // take a few seconds to trigger 'error' event, it could be a bug of node
  // or atom-shell, before it's fixed we check the existence of socketPath to
  // speedup startup.
  if (process.platform !== 'win32' && !_fs2.default.existsSync(socketPath)) {
    callback();
    return;
  }

  const client = _net2.default.connect({ path: socketPath }, () => {
    client.write(JSON.stringify(process.argv.slice(1)), () => {
      client.end();
      otherAppFound();
    });
  });
  client.on('error', callback);
}

function makeSocketPath() {
  let name = _electron.app.getName();
  if (_buildInfo2.default.releaseChannel !== 'stable') {
    name = _electron.app.getName() + _buildInfo2.default.releaseChannel;
  }

  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\' + name + '-sock';
  } else {
    return _path2.default.join(_os2.default.tmpdir(), name + '.sock');
  }
}

function create(startCallback, newProcessCallback) {
  const socketPath = makeSocketPath();

  tryStart(socketPath, () => {
    const server = listenForArgumentsFromNewProcess(socketPath, newProcessCallback);

    _electron.app.on('will-quit', () => {
      server.close();
      deleteSocketFile(socketPath);
    });

    _electron.app.on('will-exit', () => {
      server.close();
      deleteSocketFile(socketPath);
    });

    startCallback();
  }, () => {
    console.log('Another instance exists. Quitting.');
    _electron.app.exit(0);
  });
}

function pipeCommandLineArgs(noOtherAppFoundCallback, otherAppFound) {
  tryStart(makeSocketPath(), noOtherAppFoundCallback, otherAppFound);
}