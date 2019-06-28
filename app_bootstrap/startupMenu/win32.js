'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _electron = require('electron');

exports.default = [{
  label: '&File',
  submenu: [{
    label: '&Exit',
    click: () => _electron.app.quit(),
    accelerator: 'Alt+F4'
  }]
}];
module.exports = exports['default'];