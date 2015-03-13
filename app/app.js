// Copyright (c) 2013 Fruition Partners, Inc.
'use strict';

var chokidar = require('chokidar');
require('colors');
var fs = require('fs');
var path = require('path');
var config = require('./config');
var sncClient = require('./snc-client');

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
        if (obj.records.length === 0) return console.log('No records found:'.yellow, db);

        console.log('Received:'.green, db);

        return fs.writeFile(file, obj.records[0][db.field], function (err) {
            if (err) return handleError(err, file);

            return console.log('Saved:'.green, {file: file});
        });
    });
}

function send(file, map) {
    var snc = getSncClient(map.root);
    var db = {table: map.table, field: map.field, query: map.key + '=' + map.keyValue};

    fs.readFile(file, 'utf8', function (err, data) {
        if (err) return handleError(err, {file: file});

        var body = {};
        body[db.field] = data;

        return snc.table(db.table).update(db.query, body, function (err, obj) {
            if (err) return handleError(err, db);

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
