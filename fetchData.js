/* jshint node: true */
"use strict";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

require('dotenv').config();

const fs = require('fs');

let mmcns = require('minimed-connect-to-nightscout');
import got from 'got';
let moment = require('moment');

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

const checkShouldConnect = () => {
  return new Promise((res, rej) => {
    got.get('https://conner-nightscout.herokuapp.com/api/v1/entries.json?count=1', {responseType: 'json'})
    .then(gotRes => {
      const latestSg = gotRes.body[0];
      console.log(latestSg);
      const sgDate = moment(latestSg.dateString);
      const lastCheck = moment().diff(sgDate, 'minutes');
      res(lastCheck > 5)
    }).catch(err => console.log(err))
  })
}

export const fetchData = async () => {
  const shouldConnect = await checkShouldConnect();
  if (!shouldConnect) {
    return "Nothing to Update";
  }
  return new Promise((res, rej) => {
    try {
      let client = mmcns.carelink.Client({
        username: config.username,
        password: config.password,
        maxRetryDuration: config.maxRetryDuration
      });
      client.fetch((err, data) => {
        if (err) {
          console.log(err);
          rej(err)
          return err;
        } else {
          let transformed = mmcns.transform(data, config.sgvLimit);
          fs.writeFile('./test.json', JSON.stringify(transformed), err => {
            if (err) {
              console.log(err);
            }
          })
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

