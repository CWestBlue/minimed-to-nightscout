/* jshint node: true */
"use strict";

require('dotenv').config();

let mmcns = require('minimed-connect-to-nightscout');

function readEnv(key, defaultVal) {
  let val = process.env[key] ||
    process.env[key.toLowerCase()] ||
    // Azure prefixes environment variables with this
    process.env['CUSTOMCONNSTR_' + key] ||
    process.env['CUSTOMCONNSTR_' + key.toLowerCase()];

  if (val === 'true') val = true;
  if (val === 'false') val = false;
  if (val === 'null') val = null;

  return val !== undefined ? val : defaultVal;
}

let config = {
  username: readEnv('CARELINK_USERNAME'),
  password: readEnv('CARELINK_PASSWORD'),
  nsHost: readEnv('WEBSITE_HOSTNAME'),
  nsBaseUrl: null,
  nsSecret: readEnv('API_SECRET'),
  sgvLimit: 24,
  maxRetryDuration: 1,
  verbose: !readEnv('CARELINK_QUIET', true),
  deviceInterval: 5.1 * 60 * 1000,
};

if (!config.username) {
  throw new Error('Missing CareLink username');
} else if (!config.password) {
  throw new Error('Missing CareLink password');
}

let client = mmcns.carelink.Client({
  username: config.username,
  password: config.password,
  maxRetryDuration: config.maxRetryDuration
});
let entriesUrl = (config.nsBaseUrl ? config.nsBaseUrl : 'https://' + config.nsHost) + '/api/v1/entries.json';
let devicestatusUrl = (config.nsBaseUrl ? config.nsBaseUrl : 'https://' + config.nsHost) + '/api/v1/devicestatus.json';

mmcns.logger.setVerbose(config.verbose);

let filterSgvs = mmcns.filter.makeRecencyFilter((item) => {
  return item['date'];
});

let filterDeviceStatus = mmcns.filter.makeRecencyFilter((item) => {
  return new Date(item['created_at']).getTime();
});

const uploadMaybe = (items, endpoint, callback) => {
  if (items.length === 0) {
    mmcns.logger.log('No new items for ' + endpoint);
    callback();
  } else {
    mmcns.nightscout.upload(items, endpoint, config.nsSecret, function (err, response) {
      if (err) {
        // Continue gathering data from CareLink even if Nightscout can't be reached
        console.log(err);
      }
      callback();
    });
  }
}

const fetchData = () => {
  return new Promise((res, rej) => {
    try {
      client.fetch((err, data) => {
        if (err) {
          console.log(err);
          rej(err)
          return err;
        } else {
          let transformed = mmcns.transform(data, config.sgvLimit);
          let newSgvs = filterSgvs(transformed.entries);
          let newDeviceStatuses = filterDeviceStatus(transformed.devicestatus);
          uploadMaybe(newSgvs, entriesUrl, () => {
            uploadMaybe(newDeviceStatuses, devicestatusUrl, () => {
              res('ok')
            });
          });
        }
      });
    } catch (error) {
      console.error(error);
      rej(error);
    }
  })
};

module.exports = {
  fetchData
}
