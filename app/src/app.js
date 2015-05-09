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
var winston = require('winston');
var moment = require('moment');

// ---------------------------------------------------
// custom imports
var config = require('./config'),
    upgradeNeeded = require('./upgrade'),
    sncClient = require('./snc-client'),
    notify = require('./notify'),
    runTests = require('./tests'),
    FileRecordUtil = require('./file-record'),
    FileRecord = FileRecordUtil.FileRecord,
    makeHash = FileRecordUtil.makeHash;

// our wrapper for winston used for logging
var logit = {};

// custom vars
var notifyObj = notify();
var notifyUserMsg = notifyObj.msg,
    notifyEnabled = true,
    // list of supported notification messages defined in notify.js
    msgCodes = notifyObj.codes;


var isMac = /^darwin/.test(process.platform);
//var isWin = /^win/.test(process.platform);

var testsRunning = false;

var chokiWatcher = false,
    chokiWatcherReady = false;

var filesInQueueToDownload = 0,
    filesToPreLoad = {};

// a list of FileRecord objects indexed by file path for easy access
var fileRecords = {};

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
        winston.error('Configuration error:'.red, e.message);
        process.exit(1);
    }

    //config.debug = true;
    setupLogging();

    if (config.debug) {
        notifyObj.setDebug();
    }

    function start(upgradeBlocks) {
        if (upgradeBlocks) {
            logit.error('Upgrade is needed. Please check the Readme/change log online.'.red);
            process.exit(1);
        }
        if (argv.test) {
            logit.info('TEST MODE ACTIVATED'.green);
            testsRunning = true;
            runTests({
                addFile: addFile,
                getSncClient: getSncClient,
                readFile: readFile,
                send: send
            }, config);
            return;
        }

        if (config.createAllFolders || argv.setup) {
            setupFolders(config, function () {});
        }
        // pre add some files defined per root in config
        if (config.preLoad) {
            addConfigFiles();
        }

        // callback dependency
        if (argv.resync || config._resyncFiles) {
            // retest this!
            config._resyncFiles = true;
            resyncExistingFiles();
        }

        initComplete();
    }

    function initComplete() {
        if (config.preLoad || config._resyncFiles) {
            // if files are being downloaded then the watcher will be started when
            // the download queue is cleared
            return;
        }
        logit.log('initComplete.. starting watcher..');
        watchFolders();
    }

    upgradeNeeded(config, start);
}


/*
 * Get a list of all the files and add it to "filesToPreLoad"
 */

function resyncExistingFiles() {
    var watchedFolders = Object.keys(config.roots);
    var roots = [];
    for (var i = 0; i < watchedFolders.length; i++) {
        // match all files in all directories (excludes .hidden dirs by default)
        roots.push(watchedFolders[i] + '/**/*');
    }
    var pattern = roots.join('');
    // can be multiple sets
    if (roots.length > 1) {
        pattern = '{' + roots.join(',') + '}';
    }

    glob(pattern, {
        nodir: true
    }, function (err, files) {
        if (err) logit.error('Exception:', err);

        if (files.length === 0) {
            logit.info('No files found to resync'.red);
            watchFolders();
        }

        // files is an array of filenames.
        for (var x in files) {
            //logit.info(('Adding file: '+files[x]).blueBG);
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

function addConfigFiles() {
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
    logit.log(('Downloading ' + filesToGet + ' files...').green + '(disable this by setting preLoad to false in your config file.)');
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
    logit.error(err);
    if (context) {
        logit.error('  context:', context);
    }
}

function getSncClient(root) {
    var host = config.roots[root];
    if (!host._client) {
        host._logger = logit;
        host.debug = config.debug;
        host._client = sncClient(host);
    }
    return host._client;
}

/* keep track of files waiting to be processed
 * and disable watching files to avoid double processing
 */
function queuedFile() {
    if (chokiWatcher) {
        //logit.info('*********** Killed watch *********** '.green);
        chokiWatcher.close();
        chokiWatcher = false;
    }
    filesInQueueToDownload++;
    logit.info(('Files left in queue: ' + filesInQueueToDownload).redBG);

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
    logit.info(('Files left in queue: ' + filesInQueueToDownload).blueBG);
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
                watchFolders();
            }, 200); // delay for 200 milliseconds to be sure that chokidar won't freak out!
        }
    }
}

function receive(file, allDoneCallBack) {
    var map = fileRecords[file].getSyncMap();

    logit.debug('Adding:', {
        file: file,
        table: map.table,
        field: map.field
    });

    // we are about to download something!!
    queuedFile();

    var snc = getSncClient(map.root);
    // note: creating a new in scope var so cb gets correct map - map.name was different at cb exec time
    var db = {
        table: map.table,
        field: map.field,
        query: map.key + '=' + map.keyValue
    };

    // TODO : we can support downloading records with various queries
    //    db = {
    //        table: map.table,
    //        field: map.field,
    //        query: 'sys_created_by' + '=' + 'ben.yukich'
    //    };

    snc.table(db.table).getRecords(db.query, function (err, obj) {
        if (err) {
            notifyUser(msgCodes.COMPLEX_ERROR);
            decrementQueue();
            allDoneCallBack(false);
            return handleError(err, db);
        }
        if (obj.records.length === 0) {
            logit.info('No records found:'.yellow, db);
            fileRecords[file].addError("No records found");

            notifyUser(msgCodes.RECORD_NOT_FOUND, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
            decrementQueue();
            allDoneCallBack(false);
            return;
        }

        if (obj.records[0][db.field].length < 1) {
            logit.info('**WARNING : this record is 0 bytes'.red);

            notifyUser(msgCodes.RECEIVED_FILE_0_BYTES, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
        }
        logit.info('Received:'.green, db);

        //logit.info('Record name: '+obj.records[0].name);
        var objData = obj.records[0][db.field];
        // TODO : use objName instead of file var.
        var objName = obj.records[0].name;

        return fs.outputFile(file, objData, function (err) {
            if (err) {
                notifyUser(msgCodes.RECEIVED_FILE_ERROR, {
                    table: map.table,
                    file: map.keyValue,
                    field: map.field
                });
                return handleError(err, file);
            }

            // write out hash for collision detection
            fileRecords[file].saveHash(obj.records[0][db.field]);
            notifyUser(msgCodes.RECEIVED_FILE, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });

            logit.info('Saved:'.green, {
                file: file
            });
            decrementQueue();
            allDoneCallBack(true);
        });
    });
}

function readFile(file, callback) {
    fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
            notifyUser(msgCodes.COMPLEX_ERROR);
            logit.info(('Error trying to read file: '.red) + file);
            return handleError(err, {
                file: file
            });
        } else {
            callback(data);
        }
    });
}

function push(snc, file, db, map, body) {
    snc.table(db.table).update(db.query, body, function (err, obj) {
        if (err) {
            notifyUser(msgCodes.UPLOAD_ERROR, {
                file: map.keyValue
            });
            return handleError(err, db);
        }

        // update hash for collision detection
        fileRecords[file].saveHash(body[db.field]);
        notifyUser(msgCodes.UPLOAD_COMPLETE, {
            file: map.keyValue
        });
        logit.info('Updated instance version:', db);
    });
}

function send(file) {

    readFile(file, function (data) {

        var map = fileRecords[file].getSyncMap();
        var snc = getSncClient(map.root);
        var db = {
            table: map.table,
            field: map.field,
            query: map.key + '=' + map.keyValue
        };

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
                logit.info('Local has no changes or remote in sync; no need for push/send.');
                return;
            }

            var body = {};
            body[db.field] = data;

            push(snc, file, db, map, body);
        });
    });
}

function addFile(file, stats, callback) {

    if (!trackFile(file)) return;

    stats = stats || false;

    if (stats && stats.size > 0) {
        // these files can be ignored (we only process empty files)
        return;
    }

    // default callback
    callback = callback || function (complete) {
        if (!complete) {
            logit.info(('Could not add file:  ' + file).red);
        }
    };

    logit.info('Syncing empty file from instance', file);
    receive(file, callback);
}

function onChange(file, stats) {
    if (fileHasErrors(file)) {
        return false;
    }
    if (stats.size > 0) {
        logit.info('Potentially syncing changed file to instance', file);
        send(file);
    } else {
        logit.info('Syncing empty file from instance', file);
        receive(file, function (complete) {});
    }
}

function fileHasErrors(file) {
    var f = fileRecords[file];
    var errors = f.errors();
    if (errors) {
        logit.info('This file (' + file + ') failed to work for us previously. Skipping it. Previous errors on file/record: ', errors);
        return true;
    }
    return false;
}

/*
 * Track this file in our fileRecords list.
 * Return the file or false if not valid
 */
function trackFile(file) {

    var f = fileRecords[file] ? fileRecords[file] : false;
    // existing, check for errors
    if (f && fileHasErrors(file)) {
        return false; // can't process
    } else {
        // new, check if valid
        f = new FileRecord(config, file);
        if (f.validFile()) {
            fileRecords[file] = f;
        } else {
            return false; // not valid in terms of mapped files in config
        }
    }
    return f;
}

/* This first gets the remote record and compares with the previous
 * downloaded version. If the same then allow upload (ob.inSync is true).
 */
function instanceInSync(snc, db, map, file, newData, callback) {

    // first lets really check if we have a change
    var previousLocalVersionHash = fileRecords[file].getLocalHash();
    var newDataHash = makeHash(newData);
    if (previousLocalVersionHash == newDataHash) {
        callback(false, {
            inSync: true,
            noPushNeeded: true
        });
        return; // no changes
    }

    logit.info('Comparing remote version with previous local version...');
    // TODO : duplicate code here
    snc.table(db.table).getRecords(db.query, function (err, obj) {
        if (err) {
            notifyUser(msgCodes.COMPLEX_ERROR);
            return handleError(err, db);
        }
        if (obj.records.length === 0) {
            logit.info('No records found:'.yellow, db);
            notifyUser(msgCodes.RECORD_NOT_FOUND, {
                table: map.table,
                file: map.keyValue,
                field: map.field
            });
            return;
        }

        logit.info('Received:'.green, db);
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
            fileRecords[file].saveHash(newData);

            // case 2. the last local downloaded version matches the server version (stanard collision test scenario)
        } else if (remoteHash == previousLocalVersionHash) {
            obj.inSync = true;
        }
        // case 3, the remote version changed since we last downloaded it = not in sync
        callback(err, obj);
    });
}


function watchFolders() {

    // Watching folders will currently screw up our testing so don't do it when running tests.
    if (testsRunning) return;

    logit.info('*********** Watching for changes ***********'.green);
    var watchedFolders = Object.keys(config.roots);
    chokiWatcher = chokidar.watch(watchedFolders, {
            persistent: true,
            // ignores use anymatch (https://github.com/es128/anymatch)
            ignored: ["**/.*"] // ignore hidden files/dirs
        })
        .on('add', function (file, stats) {

            if (chokiWatcherReady) {
                addFile(file, stats);
            } else {
                trackFile(file);
            }
        })
        .on('change', onChange)
        .on('ready', function () {
            chokiWatcherReady = true;
        })
        .on('error', function (error) {
            logit.error('Error watching files: %s'.red, error);
        });
    // TODO : clear up old hash files when files removed..
    // .on('unlink', function(path) {logit.info('File', path, 'has been removed');})
}

// for each root create the folders because we are lazy ppl
function setupFolders(config, callback) {
    var dirsExpected = 0,
        dirsCreated = 0;

    dirsExpected = Object.keys(config.roots).length * Object.keys(config.folders).length;

    function dirError(err) {
        if (err) logit.info(err);
        dirsCreated++;
        if (dirsCreated >= dirsExpected) {
            // we are done creating all the folders
            callback();
        }
    }

    // for each root create our dirs
    for (var r in config.roots) {
        //logit.info('found r: '+r);
        for (var f in config.folders) {
            var newDir = path.join(r, f);
            fs.ensureDir(newDir, dirError);
        }
    }
}

/*
 * @debug Bool : true to set log level to (include) debug
 */
function setupLogging() {
    var logger = new(winston.Logger)({
        transports: [
        new(winston.transports.Console)({
                timestamp: function () {
                    return moment().format("HH:mm:ss");
                    //return moment().format("YY-MM-DD HH:mm:ss");
                    //return Date.now();
                },
                colorize: true,
                prettyPrint: true
            })
    ]
    });

    // support easier debugging of tests
    logit.test = function() {
        //arguments;
        console.log('...............');
        if(typeof arguments[0] == 'string') {
            this.info(arguments[0].underline);
        } else {
            this.info(arguments[0]);
        }
        for(var i=1; i< arguments.length; i++) {
            this.info(' - ', arguments[i]);
        }
        console.log('...............');
    };

    logger.extend(logit);

    if(config.debug) {
        logger.level = 'debug';
    }
    config._logger = logit;
}



init();
