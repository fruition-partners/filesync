// Copyright (c) 2013 Fruition Partners, Inc.
'use strict';

var chokidar = require('chokidar');
require('colors');
var fs = require('fs-extra');
var path = require('path');
var config = require('./config');
var sncClient = require('./snc-client');

// a directory to store hash information used to detect remote changes to records before trying to overwrite them
var syncDir = '.sync';

// store a collection of files being written out so that we can ignore them from our watch script
var filesInprogress = {};

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
var RECEIVED_FILE_0_BYTES = -20;
var RECORD_NOT_FOUND = -2.1;
var NOT_IN_SYNC = -3;

// used to generate a hash of a file
var crypto = require('crypto');


function handleError(err, context) {
    console.error('Error:'.red, err);
    if (context) {
        console.error('  context:'.red, context);
    }
}
function _getHomeDir() {
    // should also be windows friendly but not tested
    var ans = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    return ans;
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

// maintain a list of files being written
function writingFile(file) {
    filesInprogress[file] = true;
}
function doneWritingFile(file) {
    delete filesInprogress[file];
}
function isWritingFile(file) {
    console.log('checking writing file for : '+file);
    return filesInprogress[file];
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

        if(obj.records[0][db.field].length < 1) {
            console.log('**WARNING : this record is 0 bytes');
            notifyUser(RECEIVED_FILE_0_BYTES, {table: map.table, file: map.keyValue, field: map.field});
        }
        console.log('Received:'.green, db);

        writingFile(file);

        return fs.writeFile(file, obj.records[0][db.field], function (err) {
            doneWritingFile(file);
            if (err) {
                notifyUser(RECEIVED_FILE_ERROR, {table: map.table, file: map.keyValue, field: map.field});
                return handleError(err, file);
            }

            // write out hash for collision detection
            saveHash(map.root, file, obj.records[0][db.field]);
            notifyUser(RECEIVED_FILE, {table: map.table, file: map.keyValue, field: map.field});
            return console.log('Saved:'.green, {file: file});
        });
    });
}

// notifies the user in a non-command line kind of way
// currently supports OSX notifactions only...
// (consider using https://github.com/mikaelbr/node-notifier or https://github.com/dylang/grunt-notify)
// TODO : notifications sent at the same time may not be displayed to the user in the normal fashion (os X)
//        but are being received and exist in the notification center. Consider adding delay or merging notifications.
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
    } else if(code == NOT_IN_SYNC) {
        notifyArgs = {
            type: 'fail',
            title: 'File not in sync!',
            subtitle: 'Please update your local version first!',
            message: args.file + ' (' + args.table +':'+ args.field + ')'
        };
    } else if (code == RECEIVED_FILE_0_BYTES) {
        notifyArgs = {
            type: 'info',
            title: 'Record field has no data!',
            subtitle: 'Please add some content to your new file.',
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

        // only allow an update if the instance is still in sync with the local env.
        instanceInSync(snc, db, map, file, data, function (err, obj) {

            if(!obj.inSync) {
                notifyUser(NOT_IN_SYNC, {table: map.table, file: map.keyValue, field: map.field});
                return;
            }
            if(obj.noPushNeeded) {
                console.log('Local and remote in sync, no need for push/send.');
                return;
            }

            return snc.table(db.table).update(db.query, body, function (err, obj) {
                if (err) {
                    notifyUser(UPLOAD_ERROR, {file: map.keyValue});
                    return handleError(err, db);
                }

                // update hash for collision detection
                saveHash(map.root, file, data);
                notifyUser(UPLOAD_COMPLETE, {file: map.keyValue});
                return console.log('Updated:'.green, db);
            });
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
    if(isWritingFile(file)) {
        console.log('Still writing out a file so ignoring: '+file);
        return;
    }

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

// -------------------- hash functions for managing remote changes happening before local changes get uploaded
function makeHash(data) {
    var hash1 = crypto.createHash('md5').update(data).digest('hex');
    return hash1;
}
function getHashFileLocation(rootDir, file) {
    var syncFileRelative = file.replace(rootDir, '/' + syncDir);
    var hashFile = rootDir + syncFileRelative;
    return hashFile;
}
function saveHash(rootDir, file, data) {
    if (config.debug) {
        console.log('Saving hash for file: '+file);
    }
    var hash = makeHash(data);
    var hashFile = getHashFileLocation(rootDir, file);
    fs.outputFile(hashFile, hash, function (err) {
        if (err) {
           console.log('Could not write out hash file'.red, hashFile);
        }
    });
}
function getLocalHash(rootDir, file) {
    var hashFile = getHashFileLocation(rootDir, file);
    var fContents = '';
    try {
        fContents = fs.readFileSync(hashFile, 'utf8');
    } catch (err) {
        // don't care.
        console.log('--------- hash file not yet existing ---------------');
    }
    return fContents;
}
/* This first gets the remote record and compares with the previous
 * downloaded version. If the same then allow upload (ob.inSync is true).
 *
 */
function instanceInSync(snc, db, map, file, newData, callback) {
    console.log('Comparing remote version with previous local version...');
    // TODO : duplicate code here
    snc.table(db.table).getRecords(db.query, function (err, obj) {
        if (err) return handleError(err, db);
        if (obj.records.length === 0) {
            notifyUser(RECORD_NOT_FOUND, {table: map.table, file: map.keyValue, field: map.field});
            return console.log('No records found:'.yellow, db);
        }

        console.log('Received:'.green, db);
        var remoteVersion = obj.records[0][db.field];
        var remoteHash = makeHash(remoteVersion);
        var previousLocalVersionHash = getLocalHash(map.root, file);
        var newDataHash = makeHash(newData);

        obj.inSync = false; // adding property. default to false
        obj.noPushNeeded = false; // default to false to assume we must upload

        // case 1. Records local and remote are the same
        if(newDataHash == remoteHash) {
            // handle the scenario where the remote version was changed to match the local version.
            // when this happens update the local hash as there would be no collision here (and nothing to push!)
            obj.inSync = true;
            obj.noPushNeeded = true;
            // update local hash.
            saveHash(map.root, file, newData);

        // case 2. the last local downloaded version matches the server version (stanard collision test scenario)
        } else if(remoteHash == previousLocalVersionHash) {
            obj.inSync = true;
        }
        // case 3, the remote version changed since we last downloaded it = not in sync
        callback(err, obj);
    });
}
// -----------------------------------------------------------


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
    var ignoreDir = new RegExp("/" + syncDir + "/");
    chokidar.watch(watchedFolders, {persistent: true, ignored: ignoreDir})
        .on('add', onAdd)
        .on('change', onChange)
        .on('error', function (error) {
            console.error('Error watching files: %s'.red, error)
        });
    // TODO : clear up old hash files when files removed..
    // .on('unlink', function(path) {console.log('File', path, 'has been removed');})
}

watchFolders(config);
