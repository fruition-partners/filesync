/*
 * Everything to do with managing a record object and corresponding file
 */

require('colors');
var fs = require('fs-extra'),
    path = require('path'),
    crypto = require('crypto');

var method = FileRecord.prototype,
    syncDir = '.sync_data';

function FileRecord(config, file) {
    //console.log('Added file: ' + file);
    this.filePath = file;
    this.config = config;
    this.rootDir = this.getRoot();
}


method.debug = function () {
    console.log(('filePath: ' + this.filePath).green);

}

function getHashFileLocation(rootDir, filePath) {
    var syncFileRelative = filePath.replace(rootDir, '/' + syncDir);
    var hashFile = rootDir + syncFileRelative;
    return hashFile;
}

method.getLocalHash = function () {
    var hashFile = getHashFileLocation(this.rootDir, this.filePath);
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

function makeHash(data) {
    var hash1 = crypto.createHash('md5').update(data).digest('hex');
    return hash1;
}

method.saveHash = function (data) {
    if (this.config.debug) {
        console.log('Saving meta/hash data for file: ' + this.filePath);
    }
    var hash = makeHash(data);
    // todo : save more useful meta data.
    var metaData = {
        syncHash: hash
    };

    var dataFile = getHashFileLocation(this.rootDir, this.filePath);
    var outputString = JSON.stringify(metaData);
    fs.outputFile(dataFile, outputString, function (err) {
        if (err) {
            console.log('Could not write out meta file'.red, dataFile);
        }
    });
}

method.getMeta = function () {
    console.log('got meta');
    return {};
}


method.getRoot = function() {
    // cache
    if(this.rootDir) return this.rootDir;

    var root = path.dirname(this.filePath);
    while (!this.config.roots[root]) {
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


method.getSyncMap = function() {
    var folder = path.basename(path.dirname(this.filePath));

    // validate parent folder is mapped
    var map = this.config.folders[folder];
    if (!map) return null;

    // validate file suffix is mapped
    var fieldMap = getFieldMap(path.basename(this.filePath), map);
    if (!fieldMap) return null;

    map.keyValue = fieldMap.keyValue;
    map.field = fieldMap.field;
    map.root = this.rootDir;
    this.syncMap = map;
    return map;
}

method.validFile = function() {
    return this.getSyncMap();
}

module.exports = {
    FileRecord: FileRecord,
    makeHash: makeHash
};
