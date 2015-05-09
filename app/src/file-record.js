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
    this.filePath = file;
    this.config = config;
    this.rootDir = this.getRoot();
    this.errorList = [];
    this.logger = config._logger;
}


method.debug = function () {
    this.logger.info(('filePath: ' + this.filePath).green);

};

function getHashFileLocation(rootDir, filePath) {
    var syncFileRelative = filePath.replace(rootDir, '/' + syncDir);
    var hashFile = rootDir + syncFileRelative;
    return hashFile;
}

method.getLocalHash = function () {
    var hashFile = getHashFileLocation(this.rootDir, this.filePath);
    var fContents = '',
        syncHash = '';
    try {
        fContents = fs.readFileSync(hashFile, 'utf8');
        var metaObj = JSON.parse(fContents);
        syncHash = metaObj.syncHash;
    } catch (err) {
        // don't care. (the calling function will then fail the sync check as desired)
        this.logger.warn('--------- sync data file not yet existing ---------------'.red);
        this.logger.warn('File in question: ' + hashFile);
    }
    return syncHash;
};

function makeHash(data) {
    var hash1 = crypto.createHash('md5').update(data).digest('hex');
    return hash1;
}

method.saveHash = function (data) {
    this.logger.debug('Saving meta/hash data for file: ' + this.filePath);
    var hash = makeHash(data);
    // todo : save more useful meta data.
    var metaData = {
        syncHash: hash
    };

    var dataFile = getHashFileLocation(this.rootDir, this.filePath);
    var outputString = JSON.stringify(metaData);
    fs.outputFile(dataFile, outputString, function (err) {
        if (err) {
            this.logger.error('Could not write out meta file'.red, dataFile);
        }
    });
};

method.getMeta = function () {
    this.logger.log('got meta');
    return {};
};


method.getRoot = function () {
    // cache
    if (this.rootDir) return this.rootDir;

    var root = path.dirname(this.filePath);
    while (!this.config.roots[root]) {
        var up = path.dirname(root);
        if (root === up) throw new Error('Failed to find root folder.');
        root = up;
    }
    return root;
};

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


method.getSyncMap = function () {
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
};

method.validFile = function () {
    return this.getSyncMap();
};
method.errors = function () {
    if (this.errorList.length > 0) {
        return this.errorList;
    }
    return false;
};
method.addError = function (str) {
    this.errorList.push(str);
};

module.exports = {
    FileRecord: FileRecord,
    makeHash: makeHash
};
