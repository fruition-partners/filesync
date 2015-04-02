// Copyright (c) 2013 Fruition Partners, Inc.


// ---------------------------------------------------
// 3rd party modules

var argv = require('minimist')(process.argv.slice(2));
//console.dir(argv);

var chokidar = require('chokidar');
require('colors');
var fs = require('fs-extra');
var path = require('path');
// used to generate a hash of a file
var crypto = require('crypto');


// ---------------------------------------------------
// custom code
var config = require('./config');
var upgradeNeeded = require('./upgrade');
var sncClient = require('./snc-client');
var notify = require('./notify');
var notifyUser = null;
// list of supported notification messages defined in notify.js
var msgCodes = null;

// ---------------------------------------------------

// true when all existing files should be re-downloaded
var resyncFiles = false;

// a directory to store hash information used to detect remote changes to records before trying to overwrite them
var syncDir = '.sync_data';

// store a collection of files being written out so that we can ignore them from our watch script
var filesInprogress = {};

var isMac = /^darwin/.test(process.platform);
//var isWin = /^win/.test(process.platform);


// entry point
function init() {

    if (argv.help) {
        displayHelp();
        process.exit(1);
        return;
    }

    // get config
    try {
        config = config();
        configValid(config);
    } catch (e) {
        console.error('Configuration error:'.red, e.message);
        process.exit(1);
    }

    // setup notify
    var notifyObj = notify(config);
    notifyUser = notifyObj.msg;
    msgCodes = notifyObj.codes;

    function start(upgradeBlocks) {
        if (upgradeBlocks) {
            console.error('Upgrade is needed. Please check the Readme/change log online.'.red);
            process.exit(1);
        }

        if (argv.setup) {
            setupFolders(config, function () {});
        } else if (argv.test) {
            console.log('TEST MODE ACTIVATED'.green);
            testDownload(config);
        } else if (argv.resync) {
            resyncFiles = true;
            watchFolders(config);
        } else {
            watchFolders(config);
        }
    }

    upgradeNeeded(config, start);
}

function displayHelp() {
    var msgs = ['--help     (shows this message)',
                '--setup    (will create your folders for you)',
               '--test     (will run a download test for a known file on the instance)',
               '--resync   (will re-download all the files to get the latest server version)'];
    console.log('Help'.green);
    console.log('List of options:');
    for (var i in msgs) {
        console.log(' ' + msgs[i]);
    }
}

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
            return {
                keyValue: keyValue,
                field: map.fields[suffix]
            };
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
    console.log('checking writing file for : ' + file);
    return filesInprogress[file];
}

function receive(file, map) {
    var snc = getSncClient(map.root);
    // note: creating a new in scope var so cb gets correct map - map.name was different at cb exec time
    var db = {
        table: map.table,
        field: map.field,
        query: map.key + '=' + map.keyValue
    };

    snc.table(db.table).getRecords(db.query, function (err, obj) {
        if (err) {
            notifyUser(msgCodes.COMPLEX_ERROR);
            return handleError(err, db);
        }
        if (obj.records.length === 0) {
            notifyUser(msgCodes.RECORD_NOT_FOUND, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
            return console.log('No records found:'.yellow, db);
        }

        if (obj.records[0][db.field].length < 1) {
            console.log('**WARNING : this record is 0 bytes');
            notifyUser(msgCodes.RECEIVED_FILE_0_BYTES, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
        }
        console.log('Received:'.green, db);

        writingFile(file);

        return fs.writeFile(file, obj.records[0][db.field], function (err) {
            doneWritingFile(file);
            if (err) {
                notifyUser(msgCodes.RECEIVED_FILE_ERROR, {
                    table: map.table,
                    file: map.keyValue,
                    field: map.field
                });
                return handleError(err, file);
            }

            // write out hash for collision detection
            saveHash(map.root, file, obj.records[0][db.field]);
            notifyUser(msgCodes.RECEIVED_FILE, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
            return console.log('Saved:'.green, {
                file: file
            });
        });
    });
}

function send(file, map) {
    var snc = getSncClient(map.root);
    var db = {
        table: map.table,
        field: map.field,
        query: map.key + '=' + map.keyValue
    };

    fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
            notifyUser(msgCodes.COMPLEX_ERROR);
            return handleError(err, {
                file: file
            });
        }

        var body = {};
        body[db.field] = data;

        // only allow an update if the instance is still in sync with the local env.
        instanceInSync(snc, db, map, file, data, function (err, obj) {

            if (!obj.inSync) {
                notifyUser(msgCodes.NOT_IN_SYNC, {
                    table: map.table,
                    file: map.keyValue,
                    field: map.field
                });
                return;
            }
            if (obj.noPushNeeded) {
                console.log('Local and remote in sync, no need for push/send.');
                return;
            }

            return snc.table(db.table).update(db.query, body, function (err, obj) {
                if (err) {
                    notifyUser(msgCodes.UPLOAD_ERROR, {
                        file: map.keyValue
                    });
                    return handleError(err, db);
                }

                // update hash for collision detection
                saveHash(map.root, file, data);
                notifyUser(msgCodes.UPLOAD_COMPLETE, {
                    file: map.keyValue
                });
                return console.log('Updated:'.green, db);
            });
        });
    });
}

function onAdd(file, stats) {
    var map = getSyncMap(file);
    if (!map) return;

    if (stats.size > 0) {

        if (resyncFiles) {
            console.log('Resync file: ' + file);
            fs.writeFile(file, '', function (err) {
                if (err) {

                    console.log('could not reset file to 0 bytes'.red);
                    return;
                }
                //console.log('wrote file: ' + file);
            });
        }
        // these files can be ignored (we only process empty files)
        return;
    }
    if (config.debug) console.log('Added:', {
        file: file,
        table: map.table,
        field: map.field
    });

    console.log('Syncing empty file from instance', file);
    receive(file, map);
}

function onChange(file, stats) {
    if (isWritingFile(file)) {
        console.log('Still writing out a file so ignoring: ' + file);
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
        console.log('Saving meta/hash data for file: ' + file);
    }
    var hash = makeHash(data);
    // todo : save more useful meta data.
    var metaData = {
        syncHash: hash
    };

    var dataFile = getHashFileLocation(rootDir, file);
    var outputString = JSON.stringify(metaData);
    fs.outputFile(dataFile, outputString, function (err) {
        if (err) {
            console.log('Could not write out meta file'.red, hashFile);
        }
    });
}

function getLocalHash(rootDir, file) {
        var hashFile = getHashFileLocation(rootDir, file);
        var fContents = '';
        try {
            fContents = fs.readFileSync(hashFile, 'utf8');
            var metaObj = JSON.parse(fContents);
            fContents = metaObj.syncHash;
        } catch (err) {
            // don't care.
            console.log('--------- data file not yet existing ---------------');
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
            if (err) {
                notifyUser(msgCodes.COMPLEX_ERROR);
                return handleError(err, db);
            }
            if (obj.records.length === 0) {
                notifyUser(msgCodes.RECORD_NOT_FOUND, {
                    table: map.table,
                    file: map.keyValue,
                    field: map.field
                });
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
            if (newDataHash == remoteHash) {
                // handle the scenario where the remote version was changed to match the local version.
                // when this happens update the local hash as there would be no collision here (and nothing to push!)
                obj.inSync = true;
                obj.noPushNeeded = true;
                // update local hash.
                saveHash(map.root, file, newData);

                // case 2. the last local downloaded version matches the server version (stanard collision test scenario)
            } else if (remoteHash == previousLocalVersionHash) {
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
    var watchedFolders = Object.keys(config.roots);
    var ignoreDir = new RegExp("/" + syncDir + "/");
    chokidar.watch(watchedFolders, {
            persistent: true,
            ignored: ignoreDir
        })
        .on('add', onAdd)
        .on('change', onChange)
        .on('error', function (error) {
            console.error('Error watching files: %s'.red, error);
        });
    // TODO : clear up old hash files when files removed..
    // .on('unlink', function(path) {console.log('File', path, 'has been removed');})
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

// for each root create the folders because we are lazy ppl
function setupFolders(config, callback) {
    var dirsExpected = 0,
        dirsCreated = 0;

    dirsExpected = Object.keys(config.roots).length * Object.keys(config.folders).length;

    function dirError(err) {
        if (err) console.log(err);
        dirsCreated++;
        if (dirsCreated >= dirsExpected) {
            // we are done creating all the folders
            callback();
        }
    }

    // for each root create our dirs
    for (var r in config.roots) {
        //console.log('found r: '+r);
        for (var f in config.folders) {
            var newDir = path.join(r, f);
            fs.ensureDir(newDir, dirError);
        }
    }
}

/*
 * Creates a file
 */
function testDownload(config) {
    console.log('Lets run a test'.blue);
    // this should be an out of the box file available on Dublin, Eureka, Fuji...
    var testFile = path.join('script_includes', 'JSUtil.js'),
        testFilePath = '';

    function fileCreated(err) {
        if (err) console.log(err);
        console.log('created test file!');
        // hard code stats obj.
        onAdd(testFilePath, {
            size: 0
        });
    }
    for (var r in config.roots) {
        testFilePath = path.join(r, testFile);
        console.log('Creating test file: ' + testFilePath);
        fs.ensureFile(testFilePath, fileCreated);
        break;
    }

}

init();
