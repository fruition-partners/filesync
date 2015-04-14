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
var glob = require("glob");

// ---------------------------------------------------
// custom imports
var config = require('./config'),
    upgradeNeeded = require('./upgrade'),
    sncClient = require('./snc-client'),
    notify = require('./notify');

// custom vars
var notifyObj = notify();
var notifyUserMsg = notifyObj.msg,
    notifyEnabled = true,
    // list of supported notification messages defined in notify.js
    msgCodes = notifyObj.codes;

// a directory to store hash information used to detect remote changes to records before trying to overwrite them
var syncDir = '.sync_data';

var isMac = /^darwin/.test(process.platform);
//var isWin = /^win/.test(process.platform);

var chokiWatcher = false,
    chokiWatcherReady = false;

var filesInQueueToDownload = 0,
    filesToPreLoad = {};

// ---------------------------------------------------


// entry point
function init() {

    if (argv.help) {
        displayHelp();
        process.exit(1);
        return;
    }

    // get config
    try {
        config.setConfigLocation(argv.config);
        config = config.getConfig();
    } catch (e) {
        console.error('Configuration error:'.red, e.message);
        process.exit(1);
    }

    if (config.debug) {
        notifyObj.setDebug();
    }

    function start(upgradeBlocks) {
        if (upgradeBlocks) {
            console.error('Upgrade is needed. Please check the Readme/change log online.'.red);
            process.exit(1);
        }
        if (argv.test) {
            console.log('TEST MODE ACTIVATED'.green);
            testDownload(config);
            return;
        }

        if (config.createAllFolders || argv.setup) {
            setupFolders(config, function () {});
        }
        // pre add some files defined per root in config
        if (config.preLoad) {
            addConfigFiles(config);
        }

        // callback dependency
        if (argv.resync || config._resyncFiles) {
            // retest this!
            config._resyncFiles = true;
            resyncExistingFiles(config);
        }

        initComplete();
    }

    function initComplete() {
        if(config.preLoad || config._resyncFiles) {
            // if files are being downloaded then the watcher will be started when
            // the download queue is cleared
            return;
        }
        console.log('[INIT] initComplete.. starting watcher..');
        watchFolders(config);
    }

    upgradeNeeded(config, start);
}


/*
 * Get a list of all the files and add it to "filesToPreLoad"
 */

function resyncExistingFiles(config) {
    var watchedFolders = Object.keys(config.roots);
    var roots = [];
    for (var i = 0; i < watchedFolders.length; i++) {
        // match all files in all directories (excludes .hidden dirs by default)
        roots.push(watchedFolders[i] + '/**/*');
    }
    var pattern = roots.join('');
    // can be multiple sets
    if(roots.length > 1) {
        pattern = '{' + roots.join(',') + '}';
    }

    glob(pattern, {
        nodir: true
    }, function (err, files) {
        if (err) console.log(err);

        if(files.length === 0) {
            console.log('No files found to resync'.red);
            watchFolders(config);
        }

        // files is an array of filenames.
        for (var x in files) {
            //console.log(('Adding file: '+files[x]).blueBG);
            addToPreLoadList(files[x], {
                filePath: files[x]
            });
        }
    });
}


function notifyUser(code, args) {
    // depending on the notification system, we could flood the OS and get blocked by security
    //   Eg. too many open files via terminal-notifier-pass.app launches)
    if (notifyEnabled) {
        notifyUserMsg(code, args);
    }
}

function addConfigFiles(config) {
    var filesToGet = 0;
    // each root
    for (var r in config.roots) {
        var basePath = r,
            root = config.roots[r];
        if (root.preLoadList) {
            // each folder (assume typed correctly)
            for (var folder in root.preLoadList) {
                // each file to create
                for (var file in root.preLoadList[folder]) {
                    var filePath = path.join(r, folder, root.preLoadList[folder][file]);
                    addToPreLoadList(filePath, {
                        filePath: filePath
                    });
                    filesToGet++;
                }
            }
        }
    }
    console.log(('Downloading ' + filesToGet + ' files...').green + '(disable this by setting preLoad to false in your config file.)');
}

function addToPreLoadList(filePath, options) {
    options = options || {
        filePath: filePath
    };
    // only process if we don't already have it in the list
    if (typeof filesToPreLoad[filePath] == 'undefined') {
        filesToPreLoad[filePath] = options;
        addFile(filePath);
    }
}

function addIfNotPresent(filePath) {
    fs.exists(filePath, function (exists) {
        if (!exists) {
            addFile(filePath);
        }
    });
}


function displayHelp() {
    var msgs = ['--help     (shows this message)',
                '--config   (specify a path to your app.config.json file)',
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
    if (!host._client) {
        host._client = sncClient(host);
        host.debug = config.debug;
    }
    return host._client;
}

/* keep track of files waiting to be processed
 * and disable watching files to avoid double processing
 */
function queuedFile() {
    if (chokiWatcher) {
        //console.log('*********** Killed watch *********** '.green);
        chokiWatcher.close();
        chokiWatcher = false;
    }
    filesInQueueToDownload++;
    console.log(('Files left in queue: ' + filesInQueueToDownload).redBG);

    // more than 2 files in the queue? Lets disable notify to avoid the ulimit issue
    if (filesInQueueToDownload > 2) {
        notifyEnabled = false;
    }
}

/*
 * When done processing a file consider if we can re-enable
 * notifications and watching for changed files.
 */
function decrementQueue() {
    filesInQueueToDownload--;
    console.log(('Files left in queue: ' + filesInQueueToDownload).blueBG);
    if (filesInQueueToDownload === 0) {
        // restart watch
        if (!notifyEnabled) {
            notifyEnabled = true;
            notifyUser(msgCodes.ALL_DOWNLOADS_COMPLETE, "");
        }
        if (!chokiWatcher) {
            // do not start watching folders straight away as there may be IO streams
            // being closed which will cause a "change" event for chokidar on the file.
            setTimeout(function () {
                watchFolders(config);
            }, 200); // delay for 200 milliseconds to be sure that chokidar won't freak out!
        }
    }
}

function receive(file, map) {
    // we are about to download something!!
    queuedFile();

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
            decrementQueue();
            return handleError(err, db);
        }
        if (obj.records.length === 0) {
            notifyUser(msgCodes.RECORD_NOT_FOUND, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
            decrementQueue();
            return console.log('No records found:'.yellow, db);
        }

        if (obj.records[0][db.field].length < 1) {
            console.log('**WARNING : this record is 0 bytes'.red);
            notifyUser(msgCodes.RECEIVED_FILE_0_BYTES, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
        }
        console.log('Received:'.green, db);

        return fs.outputFile(file, obj.records[0][db.field], function (err) {
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

            console.log('Saved:'.green, {
                file: file
            });
            decrementQueue();
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
                console.log('Local has no changes or remote in sync; no need for push/send.');
                return;
            }

            snc.table(db.table).update(db.query, body, function (err, obj) {
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
                console.log('Updated instance version:'.green, db);
            });
        });
    });
}

function addFile(file, stats) {
    stats = stats || false;
    var map = getSyncMap(file);
    if (!map) return;

    if (stats && stats.size > 0) {
        // these files can be ignored (we only process empty files)
        return;
    }
    if (config.debug) console.log('Adding:', {
        file: file,
        table: map.table,
        field: map.field
    });

    console.log('Syncing empty file from instance', file);
    receive(file, map);
}

function onChange(file, stats) {
    var map = getSyncMap(file);
    if (!map) return;

    if (stats.size > 0) {
        console.log('Potentially syncing changed file to instance', file);
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
            console.log('Could not write out meta file'.red, dataFile);
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
        console.log('--------- data file not yet existing ---------------'.red);
    }
    return fContents;
}



/* This first gets the remote record and compares with the previous
 * downloaded version. If the same then allow upload (ob.inSync is true).
 */
function instanceInSync(snc, db, map, file, newData, callback) {

    // first lets really check if we have a change
    var previousLocalVersionHash = getLocalHash(map.root, file);
    var newDataHash = makeHash(newData);
    if (previousLocalVersionHash == newDataHash) {
        callback(false, {
            inSync: true,
            noPushNeeded: true
        });
        return; // no changes
    }

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



function watchFolders(config) {
    console.log('*********** Watching for changes ***********'.green);
    var watchedFolders = Object.keys(config.roots);
    chokiWatcher = chokidar.watch(watchedFolders, {
            persistent: true,
            // ignores use anymatch (https://github.com/es128/anymatch)
            ignored: ["**/.*"] // ignore hidden files/dirs
        })
        .on('add', function (file, stats) {
            if (chokiWatcherReady) {
                addFile(file, stats);
            }
        })
        .on('change', onChange)
        .on('ready', function () {
            chokiWatcherReady = true;
        })
        .on('error', function (error) {
            console.error('Error watching files: %s'.red, error);
        });
    // TODO : clear up old hash files when files removed..
    // .on('unlink', function(path) {console.log('File', path, 'has been removed');})
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

    for (var r in config.roots) {
        testFilePath = path.join(r, testFile);
        console.log('Creating test file: ' + testFilePath);
        addFile(testFilePath);
        break;
    }

}

init();
