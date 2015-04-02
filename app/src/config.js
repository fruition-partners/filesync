// Copyright (c) 2013 Fruition Partners, Inc.

var assert = require('assert-plus');
require('colors');
var fs = require('fs');
var path = require('path');
var restify = require('restify');
var util = require('util');

var DEFAULT_CONFIG_FILE = '../app.config.json';
// users can specify a file outside of the repo
var PRIVATE_CONFIG_FILE = homeConfigPath();
// the location of the config file (populated based on if PRIVATE_CONFIG_FILE exists or not)
var CONFIG_FILE = '';


// OS friendly solution to path
function homeConfigPath(type) {
    return path.join(_getHomeDir(), '.filesync', 'app.config.json');
}

function saveConfig(config) {
    fs.writeFile(path.join(__dirname, CONFIG_FILE), JSON.stringify(config, null, 4), function (err) {
        assert.ifError(err);
    });
}

function encodeCredentials(host) {
    assert.ok(host.user && host.pass, 'Invalid root config. user, pass or auth missing.');
    host.auth = new Buffer(host.user + ':' + host.pass).toString('base64');
    delete host.user;
    delete host.pass;
    return host;
}

function validateRootFolder(folder) {
    assert.ok(fs.existsSync(folder), util.format('root folder: "%s" was not found.', folder));
    assert.ok(fs.statSync(folder).isDirectory(), util.format('root folder: "%s" is not a directory.', folder));
}

function _getHomeDir() {
    // should also be windows friendly but not tested
    var ans = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    return ans;
}

function getConfig() {
    if (fs.existsSync(PRIVATE_CONFIG_FILE)) {
        CONFIG_FILE = PRIVATE_CONFIG_FILE;
    } else {
        CONFIG_FILE = DEFAULT_CONFIG_FILE;
    }
    var config = require(CONFIG_FILE);
    config.debug = config.debug || false;

    assert.object(config.roots, 'roots');
    assert.object(config.folders, 'folders');

    var roots = Object.keys(config.roots);
    assert.ok(roots.length > 0, 'At least one root folder must be configured.');

    var save = false;
    roots.forEach(function (root) {
        validateRootFolder(root);
        var host = config.roots[root];
        assert.ok(host.host, 'Invalid root config. host missing.');
        if (!host.auth) {
            config.roots[root] = encodeCredentials(host);
            save = true;
        }
    });

    if (save) {
        saveConfig(config);
        console.log('Configuration: credentials encoded.'.green);
    }

    return config;
}

module.exports = getConfig;
