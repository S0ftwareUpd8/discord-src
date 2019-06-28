'use strict';

const buildInfo = require('./buildInfo');
const paths = require('../common/paths');
paths.init(buildInfo);
const moduleUpdater = require('../common/moduleUpdater');
moduleUpdater.initPathsOnly(buildInfo);
const requireNative = require('./requireNative');

function getAppMode() {
  if (process.argv && process.argv.includes('--overlay-host')) {
    return 'overlay-host';
  }

  return 'app';
}

const mode = getAppMode();
if (mode === 'app') {
  require('./bootstrap');
} else if (mode === 'overlay-host') {
  requireNative('discord_overlay2/standalone_host.js');
}