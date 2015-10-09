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
    this.filePath = normalisePath(file);
    this.config = config;
    this.rootDir = this.getRoot();
    this.errorList = [];
    this.logger = config._logger;
}

function makeHash(data) {
    var hash1 = crypto.createHash('md5').update(data).digest('hex');
    return hash1;
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

// fix windows path issues (windows can handle both '\' and '/' so be *nix friendly)
function normalisePath(p) {
    return p.replace(/\\/g, '/');
}


// ------------------------------------------------
// methods
// ------------------------------------------------


method.getRecordUrl = function () {
    var syncMap = this.getSyncMap(),
        root = syncMap.root,
        rootConfig = this.config.roots[root],
        host = rootConfig.host,
        protocol = rootConfig.protocol ? rootConfig.protocol : 'https',
        url = protocol + '://' + host + '/' + syncMap.table + '.do?sysparm_query=' + syncMap.key + '=' + syncMap.keyValue;

    // in order to work with notify we must have a strictly valid URL (no spaces)
    url = url.replace(/\s/g, "%20");

    return url;

};

method.getMetaFilePath = function () {
    var syncFileRelative = this.filePath.replace(this.rootDir, path.sep + syncDir);
    var hashFile = this.rootDir + syncFileRelative;
    return hashFile;
};


method.getFileName = function () {
    return path.basename(this.filePath);
};

method.getFolderName = function () {
    return path.basename(path.dirname(this.filePath));
};

method.debug = function () {
    this.logger.info(('filePath: ' + this.filePath).green);

};

method.getLocalHash = function () {
    var metaData = this._getMeta();
    if (metaData) {
        return metaData.syncHash;
    }
    this.logger.warn('--------- sync data not yet existing ---------------'.red);
    return '';
};


method.saveHash = function (data, callback) {
    this.logger.debug('Saving meta/hash data for file: ' + this.filePath);
    var metaData = {
        syncHash: makeHash(data)
    };
    this._saveMeta(metaData, callback);
};

// todo : allow extending existing meta data
method._saveMeta = function (metaData, callback) {
    var dataFile = this.getMetaFilePath();
    var outputString = JSON.stringify(metaData);
    var _this = this;

    fs.outputFile(dataFile, outputString, function (err) {
        if (err) {
            _this.logger.error('Could not write out meta file'.red, dataFile);
            callback(false);
        } else {
            callback(true);
        }
    });
};

method._getMeta = function () {
    var metaFilePath = this.getMetaFilePath();
    var fContents = '';

    try {
        fContents = fs.readFileSync(metaFilePath, 'utf8');
        var metaObj = JSON.parse(fContents);
        return metaObj;
    } catch (err) {
        // don't care. (the calling function will then fail the sync check as desired)
        this.logger.warn('--------- meta data file not yet existing ---------------'.red);
        this.logger.warn('File in question: ' + metaFilePath);
    }
    return false;
};


method.getRoot = function () {
    // cache
    if (this.rootDir) return this.rootDir;

    var root = path.dirname(this.filePath);

    // help find the root path on windows
    // (config json file cannot use '\\' or '\' paths; even if on windows)
    root = normalisePath(root);

    while (!this.config.roots[root]) {
        var up = path.dirname(root);
        if (root === up) throw new Error('Failed to find root folder.');
        root = up;
    }
    return root;
};


method.getSyncMap = function () {
    var folder = this.getFolderName();
    var fileName = this.getFileName();

    // validate parent folder is mapped
    var map = this.config.folders[folder];
    if (!map) return null;

    // validate file suffix is mapped
    var fieldMap = getFieldMap(fileName, map);
    if (!fieldMap) return null;

    map.keyValue = fieldMap.keyValue;
    map.fileName = fieldMap.keyValue;
    // special sass case
    if (this.isSCSS()) {
        map.keyValue += '_scss';
    }
    map.field = fieldMap.field;
    map.root = this.rootDir;
    this.syncMap = map;
    return map;
};

method.isSCSS = function () {
    if (this.filePath.indexOf('.scss') > 0) {
        return true;
    }
    return false;
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
