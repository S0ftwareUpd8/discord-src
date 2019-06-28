'use strict';

// bootstrap constants
// after startup, these constants will be merged into core module constants
// since they are used in both locations (see app/Constants.js)

const { releaseChannel } = require('./buildInfo');
const { getSettings } = require('./appSettings');

const settings = getSettings();

function capitalizeFirstLetter(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const APP_NAME = 'Discord' + (releaseChannel === 'stable' ? '' : capitalizeFirstLetter(releaseChannel));
const APP_ID_BASE = 'com.squirrel';
const APP_ID = `${APP_ID_BASE}.${APP_NAME}.${APP_NAME}`;

const API_ENDPOINT = settings.get('API_ENDPOINT') || 'https://discordapp.com/api';
const UPDATE_ENDPOINT = settings.get('UPDATE_ENDPOINT') || API_ENDPOINT;

module.exports = {
  APP_NAME,
  APP_ID,
  API_ENDPOINT,
  UPDATE_ENDPOINT
};