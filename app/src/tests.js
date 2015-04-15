var path = require('path');

var api,
    config;

function runTests(apiObj, configObj) {
    api = apiObj;
    config = configObj;

    testDownload();
}

/*
 * Calls addFile to download a record
 */
function testDownload() {
    console.log('Lets run a test'.blue);
    // this should be an out of the box file available on Dublin, Eureka, Fuji...
    var testFile = path.join('script_includes', 'JSUtil.js'),
        testFilePath = '';

    for (var r in config.roots) {
        testFilePath = path.join(r, testFile);
        console.log('Creating test file: ' + testFilePath);
        api.addFile(testFilePath);
        break;
    }
    // TODO : certify that file exists (without manual checking)
}

/*
 * Tests trying to upload a record that has already been changed on the server
 */
function testSyncConflict() {
    // TODO
}

module.exports = runTests;
