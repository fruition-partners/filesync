/*
 * Add-on to display friendly system style notifications to the user
 * (no more console searching!)
 *
 */

var isMac = /^darwin/.test(process.platform);
//var isWin = /^win/.test(process.platform);

if(isMac) {
    var notify = require('osx-notifier');
}


function notifyUser(config) {

    // a bunch of notification codes to be re-used
    var codes = {
        UPLOAD_COMPLETE: 1,
        UPLOAD_ERROR: -1,
        RECEIVED_FILE: 2,
        RECEIVED_FILE_ERROR: -2,
        RECEIVED_FILE_0_BYTES: -20,
        RECORD_NOT_FOUND: -2.1,
        NOT_IN_SYNC: -3,
        COMPLEX_ERROR: -500
    };

    // notifies the user in a non-command line kind of way
    // currently supports OSX notifactions only...
    // (consider using https://github.com/mikaelbr/node-notifier or https://github.com/dylang/grunt-notify)
    // TODO : notifications sent at the same time may not be displayed to the user in the normal fashion (os X)
    //        but are being received and exist in the notification center. Consider adding delay or merging notifications.
    function msg(code, args) {

        if (config.debug) {
            console.log('notifying with code: '+code);
        }

        var notifyArgs = {};
        // default response
        notifyArgs = {
            type: 'info',
            title: 'Unknown Notification',
            subtitle: 'WTF?',
            message: 'Please look into notifyUser() for code: ' + code
        };

        if(code == codes.UPLOAD_COMPLETE) {
            notifyArgs = {
                type: 'pass',
                title: 'Upload Complete',
                subtitle: args.file,
                message: 'Took no time at all!'
            };
        } else if(code == codes.UPLOAD_ERROR) {

        } else if(code == codes.RECEIVED_FILE) {
            notifyArgs = {
                type: 'pass',
                title: 'Download Complete',
                subtitle: '',
                message: args.file + ' (' + args.table +':'+ args.field + ')//'
            };
        } else if(code == codes.RECEIVED_FILE_ERROR) {
            notifyArgs = {
                type: 'fail',
                title: 'Failed to Download file',
                subtitle: '',
                message: args.file + ' (' + args.table +':'+ args.field + ')'
            };
        } else if(code == codes.RECORD_NOT_FOUND) {
            notifyArgs = {
                type: 'fail',
                title: 'Could not find record',
                subtitle: '',
                message: args.file + ' (' + args.table +':'+ args.field + ')'
            };
        } else if(code == codes.NOT_IN_SYNC) {
            notifyArgs = {
                type: 'fail',
                title: 'File not in sync!',
                subtitle: 'Please update your local version first!',
                message: args.file + ' (' + args.table +':'+ args.field + ')'
            };
        } else if (code == codes.RECEIVED_FILE_0_BYTES) {
            notifyArgs = {
                type: 'info',
                title: 'Record field has no data!',
                subtitle: 'Please add some content to your new file.',
                message: args.file + ' (' + args.table +':'+ args.field + ')'
            };
        } else if (code == codes.COMPLEX_ERROR) {
            notifyArgs = {
                type: 'fail',
                title: 'Connection Error',
                subtitle: '',
                message: 'Please see command line output for details.'
            };
        }

        if(isMac) {
            notify(notifyArgs);
        } else {
            // windows support?
            // linux support?
        }
    }
    return {
        msg: msg,
        codes: codes
    };
};

module.exports = notifyUser;
