// Copyright (c) 2013 Fruition Partners, Inc.
'use strict';

var chokidar = require('chokidar');
require('colors');
var fs = require('fs');
var path = require('path');
var config = require('./config');
var sncClient = require('./snc-client');

var isMac = /^darwin/.test(process.platform);
//var isWin = /^win/.test(process.platform);

if(isMac) {
    var notify = require('osx-notifier');
}
// a bunch of notification codes to be re-used
var UPLOAD_COMPLETE = 1;
var UPLOAD_ERROR = -1;
var RECEIVED_FILE = 2;
var RECEIVED_FILE_ERROR = -2;
var RECORD_NOT_FOUND = -2.1;

function handleError(err, context) {
    console.error('Error:'.red, err);
    if (context) {
        console.error('  context:'.red, context);
    }
}

function getRoot(file) {
    var root = path.dirname(file);
    while (!config.roots[root]) {
        var up = path.dirname(root);
        if (root === up) throw new Error('Failed to find root folder.');
        root = up;
    }
    return root;
}

function getFieldMap(filename, map) {
    var suffixes = Object.keys(map.fields);
    for (var i = 0; i < suffixes.length; i++) {
        var suffix = suffixes[i];
        var match = filename.match(new RegExp(suffix + '$'));
        if (match) {
            var keyValue = filename.slice(0, match.index - 1);
            return {keyValue: keyValue, field: map.fields[suffix]};
        }
    }
    return null;
}

function getSyncMap(file) {
    var folder = path.basename(path.dirname(file));

    // validate parent folder is mapped
    var map = config.folders[folder];
    if (!map) return null;

    // validate file suffix is mapped
    var fieldMap = getFieldMap(path.basename(file), map);
    if (!fieldMap) return null;

    map.keyValue = fieldMap.keyValue;
    map.field = fieldMap.field;
    map.root = getRoot(file);
    return map;
}

function getSncClient(root) {
    var host = config.roots[root];
    host.debug = config.debug;
    if (!host.client) {
        host.client = sncClient(host);
    }
    return host.client;
}

function receive(file, map) {
    var snc = getSncClient(map.root);
    // note: creating a new in scope var so cb gets correct map - map.name was different at cb exec time
    var db = {table: map.table, field: map.field, query: map.key + '=' + map.keyValue};

    snc.table(db.table).getRecords(db.query, function (err, obj) {
        if (err) return handleError(err, db);
        if (obj.records.length === 0) {
            notifyUser(RECORD_NOT_FOUND, {table: map.table, file: map.keyValue, field: map.field});
            return console.log('No records found:'.yellow, db);
        }

        console.log('Received:'.green, db);

        return fs.writeFile(file, obj.records[0][db.field], function (err) {
            if (err) {
                notifyUser(RECEIVED_FILE_ERROR, {table: map.table, file: map.keyValue, field: map.field});
                return handleError(err, file);
            }

            notifyUser(RECEIVED_FILE, {table: map.table, file: map.keyValue, field: map.field});
            return console.log('Saved:'.green, {file: file});
        });
    });
}

// notifies the user in a non-command line kind of way
// currently supports OSX notifactions only...
// (consider using https://github.com/mikaelbr/node-notifier or https://github.com/dylang/grunt-notify)
function notifyUser(code, args) {

    if (config.debug) {
        console.log('notifying with code: '+code);
    }

    var notifyArgs = {};
    // default response
    notifyArgs = {
        type: 'info',
        title: 'Unknown Notification',
        subtitle: 'WTF?',
        message: 'Please look into notifyUser() for code: ' + code
    };

    if(code == UPLOAD_COMPLETE) {
        notifyArgs = {
            type: 'pass',
            title: 'Upload Complete',
            subtitle: args.file,
            message: 'Took no time at all!'
        };
    } else if(code == UPLOAD_ERROR) {

    } else if(code == RECEIVED_FILE) {
        notifyArgs = {
            type: 'pass',
            title: 'Download Complete',
            subtitle: '',
            message: args.file + ' (' + args.table +':'+ args.field + ')//'
        };
    } else if(code == RECEIVED_FILE_ERROR) {
        notifyArgs = {
            type: 'fail',
            title: 'Failed to Download file',
            subtitle: '',
            message: args.file + ' (' + args.table +':'+ args.field + ')'
        };
    } else if(code == RECORD_NOT_FOUND) {
        notifyArgs = {
            type: 'fail',
            title: 'Could not find record',
            subtitle: '',
            message: args.file + ' (' + args.table +':'+ args.field + ')'
        };
    }
    if(isMac) {
        notify(notifyArgs);
    } else {
        // windows support?
        // linux support?
    }
}

function send(file, map) {
    var snc = getSncClient(map.root);
    var db = {table: map.table, field: map.field, query: map.key + '=' + map.keyValue};

    fs.readFile(file, 'utf8', function (err, data) {
        if (err) return handleError(err, {file: file});

        var body = {};
        body[db.field] = data;

        return snc.table(db.table).update(db.query, body, function (err, obj) {
            if (err) {
                notifyUser(UPLOAD_ERROR, {file: map.keyValue});
                return handleError(err, db);
            }
            notifyUser(UPLOAD_COMPLETE, {file: map.keyValue});
            return console.log('Updated:'.green, db);
        });
    });
}

function onAdd(file, stats) {
    var map = getSyncMap(file);
    if (!map) return;

    if (config.debug) console.log('Added:', {file: file, table: map.table, field: map.field});

    if (stats.size > 0) {
        // TODO: insertRecord
        return;
    }

    console.log('Syncing empty file from instance', file);
    receive(file, map);
}

function onChange(file, stats) {
    var map = getSyncMap(file);
    if (!map) return;

    if (stats.size > 0) {
        console.log('Syncing changed file to instance', file);
        send(file, map);
    } else {
        console.log('Syncing empty file from instance', file);
        receive(file, map);
    }
}

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
}

function watchFolders(config) {
    if (!config) {
        console.error('Invalid configuration. Application exiting.'.red);
        process.exit(1);
    }
    logConfig(config);

    var watchedFolders = Object.keys(config.roots);

    chokidar.watch(watchedFolders, {persistent: true})
        .on('add', onAdd)
        .on('change', onChange)
        .on('error', function (error) {
            console.error('Error watching files: %s'.red, error)
        });
}

watchFolders(config);
