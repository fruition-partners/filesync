var path = require('path');

var api,
    config;

function runTests(apiObj, configObj) {
    api = apiObj;
    config = configObj;
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
                console.log("Testing Complete.".green);
                process.exit(1);
            }
        } else {
            console.log("TESTS FAILED. Stopping tests.");
            process.exit(1);
        }
    }

    // start tests
    nextTest = testQueue.shift();
    nextTest(testDone);
}

function getTestFile(callback) {
    // this should be an out of the box file available on Dublin, Eureka, Fuji...
    var testFilePath = path.join(getRoot(), 'script_includes', 'JSUtil.js');

    console.log('Creating test file: ' + testFilePath);
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
    console.log('TEST RUNNING: testDownload()'.yellow);
    getTestFile(fileAdded);

    function fileAdded(complete) {
        if (complete) {
            console.log('[PASS]:'.green + ' testDownload()');
        } else {
            console.log('[FAIL]:'.red + ' testDownload()');
        }
        callback(complete);
    }
}

function saveFile(snc, table, query, body, callback) {
    console.log('Attempting record update: ' + [table, query, body].join(', '));
    snc.table(table).update(query, body, function (err, obj) {
        if (err) {
            console.log('Could not save record'.red);
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

    console.log('TEST RUNNING: testUpdateRecord()'.yellow);
    var snc = api.getSncClient(getRoot());
    var file = path.join(getRoot(), 'script_includes', 'JSUtil.js');

    // TODO use time stamp to make unique
    var uniqueString = "FileSync test data xxxx";

    api.readFile(file, function (data) {
        var body = {
            'script': data + "\n// " + uniqueString
        };

        saveFile(snc, 'sys_script_include', 'name=JSUtil', body, recordSaved);
    });

    function recordSaved(complete) {
        if (complete) {
            confirmFile(file, uniqueString);
        } else {
            console.log('[FAIL]:'.red + ' testUpdateRecord()');
            callback(false);
        }
    }

    function confirmFile(file, subString) {
        getTestFile(function (resp) {
            api.readFile(file, function (data) {
                // check if file contains unique content
                if (data.indexOf(subString) >= 0) {
                    console.log('[PASS]:'.green + ' testUpdateRecord()');
                    callback(true);
                } else {
                    console.log('[FAIL]:'.red + ' testUpdateRecord() - file downloaded is not what was pushed');
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
    var file = path.join(getRoot(), 'script_includes', 'JSUtil.js');

    //api.send(file);
}

module.exports = runTests;
