// Copyright (c) 2013 Fruition Partners, Inc.
'use strict';

var http = require('http');
var restify = require('restify');
var url = require('url');
var util = require('util');

function sncClient(config) {
    var debug = config.debug;
    var auth = new Buffer(config.auth, 'base64').toString(),
        parts = auth.split(':'),
        user = parts[0],
        pass = parts[1];

    // DP@SNC change : support testing on localhost but default to https
    var protocol = config.protocol ? config.protocol : 'https';

    var client = restify.createJsonClient({url: protocol + '://' + config.host});
    client.basicAuth(user, pass);

    function table(tableName) {

        function validateResponse(err, req, res, obj, request) {

            // consider moving low level debug to high level debug (end user as below)
            if (debug) logResponse(err, req, res, obj, request);

            var help = '';
            // special failing case (connections blocked etc.)
            if (!res && err) {

                var errorList = {
                    'ECONNREFUSED': 'Missing interent connection or connection was refused! (too many requests?)',
                    'ENOTFOUND': 'No connection available (do we have internet?)',
                    'ETIMEDOUT': 'Connection timed out. Internet down?'
                };

                help = errorList[err.code] || 'Something failed badly.. internet connection rubbish?';
                help += util.format('\ndetails: %j', err);
                console.log(help);
                return new Error(help);
            }

            // standard responses
            if (res.statusCode !== 200) {

                if (res.statusCode === 401) help = 'Check credentials.';
                if (res.statusCode === 302) help = 'Verify JSON Web Service plugin is activated.';
                var message = util.format('%s - %s', res.statusCode, http.STATUS_CODES[res.statusCode]);
                if (help) message += ' - ' + help;
                if (err) message += util.format('\ndetails: %j', err);
                return new Error(message);
            }
            if (err) {
                return err;
            }
            if (obj.error) {
                return new Error(obj.error);
            }
            if (!obj.records) {
                return new Error(util.format('Response missing "records" key: %j\nCheck server logs.', obj));
            }
            return null;
        }

        function logResponse(err, req, res, obj, request) {
            var resCode = res ? res.statusCode : 'no response';
            console.log('HTTP ' + req.method + ':', client.url.host, req.path,
                '\nrequest:', request.postObj || '',
                '\nresponse:', util.inspect({statusCode: resCode, body: obj}, true, 10)
            );
        }

        function send(request) {
            var urlObj = {
                pathname: '/' + request.table + '.do',
                query: {
                    // DP@SNC change : JSONv2 not JSON (Eureka+)
                    JSONv2: '',
                    sysparm_action: request.action
                }
            };
            if (request.parmName) {
                urlObj.query['sysparm_' + request.parmName] = request.parmValue;
            }
            var path = url.format(urlObj);

            function handleResponse(err, req, res, obj) {
                err = validateResponse(err, req, res, obj, request);
                request.callback(err, obj);
            }

            if (request.postObj) {
                return client.post(path, request.postObj, handleResponse);
            }

            return client.get(path, handleResponse);
        }

        function getRecords(query, callback) {
            send({table: tableName, action: 'getRecords', parmName: 'query', parmValue: query, callback: callback});
        }

        function get(id, callback) {
            send({table: tableName, action: 'get', parmName: 'sys_id', parmValue: id, callback: callback});
        }

        function insert(obj, callback) {
            send({table: tableName, action: 'insert', postObj: obj, callback: callback});
        }

        function update(query, obj, callback) {
            send({table: tableName, action: 'update', parmName: 'query', parmValue: query, postObj: obj,
                callback: callback});
        }

        return {
            get: get,
            getRecords: getRecords,
            insert: insert,
            update: update
        }
    }

    return {
        table: table
    };
}

module.exports = sncClient;
