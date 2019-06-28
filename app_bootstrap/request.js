'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _electron = require('electron');

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _log(_msg) {
  // console.log('[Request] ' + _msg);
}

function requestWithMethod(method, origOpts, origCallback) {
  if (typeof origOpts == 'string') {
    origOpts = { url: origOpts };
  }

  const opts = _extends({}, origOpts, { method });

  let callback;
  if (origCallback || opts.callback) {
    const origOptsCallback = opts.callback;
    delete opts.callback;
    callback = (...args) => {
      if (origCallback) {
        origCallback.apply(this, args);
      }
      if (origOptsCallback) {
        origOptsCallback.apply(this, args);
      }
    };
  }

  const strictOpts = _extends({}, opts, { strictSSL: true });
  const laxOpts = _extends({}, opts, { strictSSL: false });

  const rv = new _events2.default();

  if (callback) {
    _log('have callback, so wrapping');
    rv.on('response', response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        callback(null, response, Buffer.concat(chunks));
      });
    });
    rv.on('error', error => callback(error));
  }

  const requestTypes = [{
    factory: function () {
      return (0, _request2.default)(strictOpts);
    },
    method: 'node_request_strict'
  }, {
    factory: function () {
      const qs = _querystring2.default.stringify(strictOpts.qs);
      const nr = _electron.net.request(_extends({}, strictOpts, { url: `${strictOpts.url}?${qs}` }));
      nr.end();
      return nr;
    },
    method: 'electron_net_request_strict'
  }, {
    factory: function () {
      return (0, _request2.default)(laxOpts);
    },
    method: 'node_request_lax'
  }];

  function attempt(index) {
    const { factory, method } = requestTypes[index];
    _log(`Attempt #${index + 1}: ${method}`);
    factory().on('response', response => {
      _log(`${method} success! emitting response ${response}`);
      rv.emit('response', response);
    }).on('error', error => {
      if (index + 1 < requestTypes.length) {
        _log(`${method} failure, trying next option`);
        attempt(index + 1);
      } else {
        _log(`${method} failure, out of options`);
        rv.emit('error', error);
      }
    });
  }

  attempt(0);

  return rv;
}

// only supports get for now, since retrying is non-idempotent and
// we'd want to grovel the errors to make sure it's safe to retry
for (const method of ['get']) {
  requestWithMethod[method] = requestWithMethod.bind(null, method);
}

exports.default = requestWithMethod;
module.exports = exports['default'];