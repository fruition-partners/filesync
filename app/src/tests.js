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
}

function runTests(apiObj, configObj) {
    api = apiObj;
    config = configObj;
    logger = configObj._logger;
    var testQueue = [];
    testQueue.push(testDownload);
    testQueue.push(testUpdateRecord);
    //testQueue.push(testSyncConflict);

    var nextTest;

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

    logger.test('Test file in use:', testFile);

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

function saveFile(snc, table, query, body, callback) {
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
 */
function testUpdateRecord(callback) {

    logger.test('TEST RUNNING: testUpdateRecord()'.yellow);
    var snc = api.getSncClient(getRoot());
    var file = getTestFilePath();

    var uniqueString = 'FileSync test (' + moment().format('x') + ')';

    api.readFile(file, function (data) {
        var body = {
            'script': data + "\n// " + uniqueString
        };

        saveFile(snc, testFile.table, 'name=' + testFile.name, body, recordSaved);
    });

    function recordSaved(complete) {
        if (complete) {
            confirmFile(file, uniqueString);
        } else {
            logger.test('[FAIL]:'.red + ' testUpdateRecord()');
            callback(false);
        }
    }

    function confirmFile(file, subString) {
        getTestFile(function (resp) {
            api.readFile(file, function (data) {
                // check if file contains unique content
                if (data.indexOf(subString) >= 0) {
                    logger.test('[PASS]:'.green + ' testUpdateRecord()');
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
 */
function testSyncConflict(callback) {
    var file = getTestFilePath();

    //api.send(file);
}

module.exports = runTests;
