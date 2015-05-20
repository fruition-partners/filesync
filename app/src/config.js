/*
 * Load settings and config used to identify project, connection and folder syncing information.
 */

var assert = require('assert-plus');
require('colors');
var fs = require('fs');
var path = require('path');
var restify = require('restify');
var util = require('util');

// non documented function. Worry about that some other day. It won't go away soon because nodejs relies on it!
var extend = require('util')._extend;

// the location of the config file (populated dynamically)
var config_file = '';
var DEFAULT_CONFIG_FILE = path.join('..', 'app.config.json');

// initial config for folders and record matchup (can be overridden in app.config.json)
var CONFIG_RECORDS = path.join('..', 'src', 'records.config.json');

function saveConfig(config) {
    fs.writeFile(config_file, JSON.stringify(config, null, 4), function (err) {
        if (err) console.log('Error updating/writing config file. path: ' + config_file);
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

function configValid(config) {
    if (!config) {
        console.error('Invalid configuration. Application exiting.'.red);
        process.exit(1);
        return false;
    }
    logConfig(config);
    return true;
}

// OS friendly solution to path
function homeConfigPath() {
    return path.join(_getHomeDir(), '.filesync', 'app.config.json');
}

function _getHomeDir() {
    // should also be windows friendly but not tested
    var ans = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    return ans;
}

function loadFolders(config) {
    var confRecords = require(CONFIG_RECORDS);
    // if true in the app.config.json file then we won't load our default folders
    if (!config.ignoreDefaultFolders) {

        // config.folders can extend/overwrite confRecords.folders if provided
        if (config.folders) {
            config.folders = extend(confRecords.folders, config.folders);
        } else {
            config.folders = confRecords.folders;
        }
    }
}

function getConfig() {
    var config = require(config_file);
    config.debug = config.debug || false;

    assert.object(config.roots, 'roots');

    var roots = Object.keys(config.roots);
    assert.ok(roots.length > 0, 'At least one root folder must be configured.');

    loadFolders(config);
    assert.object(config.folders, 'folders');

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

    configValid(config);
    return config;
}

function setConfigLocation(pathToConfig) {
    var configFile = '';

    // set by cmd line option
    if (pathToConfig) {
        // resolve ~/ or ../ style paths
        pathToConfig = path.resolve(pathToConfig);
        // pathToConfig must exist or the (advanced) user has made a mistake that they can fix
        configFile = pathToConfig;
    } else {
        // is there a file outside of the repo?
        configFile = homeConfigPath();
        if (!fs.existsSync(configFile)) {
            // no file in ~/.filesync/ so use the fallback as default
            configFile = DEFAULT_CONFIG_FILE;
        }
    }
    console.log('Using config file: ' + configFile.green);
    config_file = configFile;
    return configFile;
}


// debug
function logConfig(config) {
    console.log('');
    console.log('Root folder sync to instance mapping:');
    Object.keys(config.roots).forEach(function (root) {
        console.log('-', root, '|', config.roots[root].host);
    });
    console.log('');
    console.log('Root subfolder to table mapping:');
    Object.keys(config.folders).forEach(function (folder) {
        console.log('-', folder, '|', config.folders[folder].table);
    });
    console.log('');

    if (config.debug) {
        console.log(JSON.stringify(config));
    }
}


module.exports = {
    "getConfig": getConfig,
    "setConfigLocation": setConfigLocation
};
