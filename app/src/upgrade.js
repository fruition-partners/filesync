var path = require('path');
var fs = require('fs-extra');


function upgradeNeeded(config, callback) {
    var oldSyncDir = syncDirWrong(config);
    var needsUpgrade = oldSyncDir;

    callback(needsUpgrade);
    //return oldSyncDir;
}

function syncDirWrong(config) {
    for (var r in config.roots) {

        var oldDir = path.join(r, '.sync');
        //console.log('Checking for old dir: ' + oldDir);
        if (fs.existsSync(oldDir)) {
            console.log('Please remove ' + oldDir + ' and re-run with "--resync"');
            return true;
        }
    }
    return false;
}


module.exports = upgradeNeeded;
