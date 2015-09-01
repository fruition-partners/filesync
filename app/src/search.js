// non documented function. Worry about that some other day. It won't go away soon because nodejs relies on it!
var extend = require('util')._extend;


var method = Search.prototype;

function Search(config, snc) {
    this.config = config;
    this.snc = snc;
    this.logger = config._logger;
}


method.getResults = function (queryObj) {
    var logger = this.logger,
        snc = this.snc,
        db = {
            table: queryObj.table || '',
            field: queryObj.field || 'script', // default
            query: queryObj.query || '',
            rows: queryObj.rows || 5 // default
        };

    if (queryObj.demo) {
        db.table = 'sys_script';
        db.query = 'sys_updated_by' + '=' + 'admin' + '^ORDERBYDESC' + 'sys_updated_on';
    }

    var folder = '',
        table = '',
        folObj,
        fields,
        f;

    // query one specific table
    if (queryObj.demo || queryObj.table) {
        for (folder in this.config.folders) {
            folObj = this.config.folders[folder];
            table = folObj.table;
            fields = folObj.fields;

            // find table with props we need
            if (table == db.table) {
                db.key = folObj.key;
                db.folder = folder;

                for (f in fields) {
                    this.logger.info('use field: %s = %s', f, fields[f]);
                    db.fieldSuffix = f;
                    getRecords(fields[f], db, cb);
                }
                break;
            }
        }

    } else {
        // run query on all folders configured

        for (folder in this.config.folders) {
            folObj = this.config.folders[folder];
            var key = folObj.key,
                firstField = '';

            fields = folObj.fields;
            table = folObj.table;

            this.logger.info('use table %s', table);

            db.table = table;
            db.folder = folder;
            db.key = key;


            for (f in fields) {
                this.logger.info('use field: %s = %s', f, fields[f]);
                db.fieldSuffix = f;
                getRecords(fields[f], db, cb);
            }
            //break;

        }
    }

    function cb(results) {
        for (var i in results) {
            var record = results[i];

            logger.info('Path to save: ' + record.__FS_fileName);
        }

        //process.exit(1);
    }

    function getRecords(fieldName, db, cb) {
        logger.info('args:', arguments);

        // we have a problem with objects "passed by reference" and so we make a local var here
        var loc = {};
        var locDB = extend(loc, db);

        snc.table(db.table).getRecords(db, function (err, obj) {
            if (err) {
                logger.info('ERROR in query.'.red);
                //decrementQueue();
                //allDoneCallBack(false);
                //process.exit(1);
                return; // handleError(err, db);
            }
            if (obj.records.length === 0) {
                logger.info('No records found:'.yellow);
                //decrementQueue();
                //allDoneCallBack(false);
                //process.exit(1);
                return;
            }

            logger.info('records found'.green);
            var i;
            for (i in obj.records) {
                var record = obj.records[i];
                //console.log(record);
                console.log('Record Found: "' + record[locDB.key] + '"');
                console.log('- Created on ' + record.sys_created_on);
                console.log('- Updated by ' + record.sys_updated_by + ' on ' + record.sys_updated_on);

                var fileName = locDB.folder + '/' + record[locDB.key] + '.' + locDB.fieldSuffix;
                record.__FS_fileName = fileName;
            }

            logger.info('Found %s records.'.green, i * 1 + 1);
            cb(obj.records);

        });
    }

};

module.exports = {
    Search: Search
};
