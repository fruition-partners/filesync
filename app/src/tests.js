var path = require('path'),
    moment = require('moment');

var api,
    config,
    logger;

var testFile = {
    name: 'JSUtil',
    suffix: 'js',
    folder: 'script_includes',
    table: 'sys_script_include'
};

function runTests(apiObj, configObj) {
    api = apiObj;
    config = configObj;
    logger = configObj._logger;
    var testQueue = [],
        nextTest;

    testQueue.push(testDownload);
    testQueue.push(testUpdateRecord);
    testQueue.push(testSyncConflict);

    // missing tests
    //testQueue.push(testFolderSetup);
    //testQueue.push(testExportConfig);
    //testQueue.push(testUpgradeNeeded);

    function testDone(passed) {
        if (passed) {
            nextTest = testQueue.shift();
            if (nextTest) {
                nextTest(testDone);
            } else {
                logger.test("Testing Complete.".green);
                process.exit(1);
            }
        } else {
            logger.test("TESTS FAILED. Stopping tests.");
            process.exit(1);
        }
    }

    logger.test(('Running ' + testQueue.length + ' test(s).').bold);
    logger.test('Test file in use: %j', testFile);

    // start tests
    nextTest = testQueue.shift();
    nextTest(testDone);
}

function getTestFilePath() {
    // this should be an out of the box file available on Dublin, Eureka, Fuji...
    var testFilePath = path.join(getRoot(), testFile.folder, testFile.name + '.' + testFile.suffix);
    return testFilePath;
}

function getTestFile(callback) {
    var testFilePath = getTestFilePath();

    logger.test('Creating test file: ' + testFilePath);
    api.addFile(testFilePath, false, callback);
}

function getRoot() {
    var roots = Object.keys(config.roots);
    return roots[0];
}

/*
 * Calls addFile to download a record
 */
function testDownload(callback) {
    logger.test('TEST RUNNING: testDownload()'.yellow);
    getTestFile(fileAdded);

    function fileAdded(complete) {
        if (complete) {
            logger.test('[PASS]:'.green + ' testDownload()');
        } else {
            logger.test('[FAIL]:'.red + ' testDownload()');
        }
        callback(complete);
    }
}

function updateRecord(snc, table, query, body, callback) {
    logger.test('Attempting record update:', table, query);
    snc.table(table).update(query, body, function (err, obj) {
        if (err) {
            logger.test('Could not save record'.red);
            callback(false);
            return;
        }
        callback(true);
    });
}

/*
 * Test trying to update an existing record
 *
 * 1. get file
 * 2. modify local file
 * 3. trigger send of file
 */
function testUpdateRecord(callback) {

    logger.test('TEST RUNNING: testUpdateRecord()'.yellow);

    var snc = api.getSncClient(getRoot());
    var file = getTestFilePath();

    var uniqueString = 'FileSync test (' + moment().format('x') + ')';

    getTestFile(fileAdded);

    function fileAdded(complete) {
        if (complete) {
            updateLocalFile();
        } else {
            logger.test('[FAIL]:'.red + ' testUpdateRecord()');
            callback(complete);
        }

    }

    function updateLocalFile() {
        api.readFile(file, function (data) {
            var body = {
                'script': data + "\n// " + uniqueString
            };

            api.writeFile(file, body.script, function (fileWritten) {
                if (fileWritten) {
                    api.send(file, sendResult);
                } else {
                    logger.test('[FAIL]:'.red + ' testSyncConflict() - could not update local file contents');
                    callback(false);
                }
            });
        });
    }

    function sendResult(complete) {
        if (complete) {
            logger.test('testUpdateRecord() - we were able to update the remote instance version');
            confirmFile(file, uniqueString);
        } else {
            logger.test('[FAIL]:'.red + ' testUpdateRecord() - we could not update the remote instance');
            callback(false);
        }
    }

    function confirmFile(file, subString) {
        getTestFile(function (resp) {
            api.readFile(file, function (data) {
                // check if file contains unique content
                if (data.indexOf(subString) >= 0) {
                    logger.test('[PASS]:'.green + ' testUpdateRecord() - we can confirm the content on the server is correct');
                    callback(true);
                } else {
                    logger.test('[FAIL]:'.red + ' testUpdateRecord() - file downloaded is not what was pushed');
                    callback(false);
                }
            });
        });
    }
}

/*
 * Tests trying to upload a record that has already been changed on the server
 *
 * 1. update server side record
 * 2. update local file
 * 3. TRY to use local file to update server record (should be rejected)
 */
function testSyncConflict(callback) {
    logger.test('TEST RUNNING: testSyncConflict()'.yellow);

    var snc = api.getSncClient(getRoot());
    var file = getTestFilePath();
    var uniqueString = 'FileSync test (' + moment().format('x') + ')';

    api.readFile(file, function (data) {
        var body = {
            'script': data + "\n// " + uniqueString
        };

        updateRecord(snc, testFile.table, 'name=' + testFile.name, body, recordSaved);
    });

    function recordSaved(complete) {
        if (complete) {
            // server record updated, now update local file
            api.writeFile(file, 'whatever', function (fileWritten) {
                if (fileWritten) {
                    api.send(file, sendResult);
                } else {
                    logger.test('[FAIL]:'.red + ' testSyncConflict() - could not update local file contents');
                }
            });
        } else {
            logger.test('[FAIL]:'.red + ' testSyncConflict() - could not update instance record');
            callback(false);
        }
    }

    function sendResult(complete) {
        // there was no sync conflict but should have been so we fail
        if (complete) {
            logger.test('[FAIL]:'.red + ' testSyncConflict() - we overwrote our online record without a sync conflict');
            callback(false);
        } else {
            // there was a sync conflict and the record was not updated (as expected);
            logger.test('[PASS]:'.green + ' testSyncConflict() - we received a sync conflict and the record was not updated');
            callback(true);
        }
    }
}

module.exports = runTests;
