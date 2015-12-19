# FileSync Changes

* 2015-12-19 (**Version 3.0.3**)
 * Fix search issue where sync data records were not being saved on slow machines (File I/O racing is bad)
 * Fix missing callback crash (fixes #14)

* 2015-11-23 (**Version 3.0.2**)
 * Support custom "ignoreFile" config option for file watcher (thanks to @dwightgunning)


* 2015-11-16 (**Version 3.0.1**)
 * Fix issue with search where 0 byte files (no proper record data) were causing issues


* 2015-11-06 (**Version 3.0** :mushroom:)
 * Fully enable search because I love being productive! (more details in readme)


* 2015-10-14 (**Version 2.4.10**)
 * Fix rare race condition with File I/O processes that sometimes caused changed files to be overwritten instead of uploaded

* 2015-10-14 (**Version 2.4.9**)
 * Fix osx-notifier issue where record names starting with symbols crashed the notification app on mac (fixes #9)
   * If your record is like "(Keyfile)" then the notifcation will show "_(Keyfile)".

* 2015-10-13 (**Version 2.4.8**)
 * Fix password encoding issue occuring when not specifying a config path (fixes #10)

* 2015-10-09 (**Version 2.4.7**)
 * Fix windows path issues and add upgrade warning
    * **UPGRADE NOTICE**: config files on all systems should now use *nix style paths. This means `"m:\\Desktop\\records"` is now invalid and should be replaced with `"m:/Dekstop/records"`

* 2015-09-01 (**Version 2.4.6**)
 * Added more default folder configs
 * Cleaned up readme
 * Prepared for search and search based auto-download support
 * Added support for flaky SSL setups (self-signed certificates etc.)
   * see `acceptBadSSL` usage in README

* 2015-08-23 (**Version 2.4.5**)
 * Fixed notification parameter bug causing issues for certain notifications

* 2015-08-23 (**Version 2.4.4**)
 * Added option to click notifications which then loads the record in the browser
 * Fixed minor issue where exporting current setup included default folder definitions (which are not needed)

* 2015-08-12 (**Version 2.4.3**)
 * Fixed bug for first run where the file watcher was not being started if preLoad or createAllFolders was true

* 2015-07-19 (**Version 2.4.2**)
 * Updated README and added video to demo FileSync in action

* 2015-05-20 (**Version 2.4.1**)
 * FIX issue where the `--config` option with a relative path did not work

* 2015-05-17 (**Version 2.4.0**)
 * Make README more logical and easier to follow (inc. TOC)
 * Support exporting the current list of downloaded records for quickstart and backup
   * Command Line Usage `/node-darwin src/app --export your-new-file.config.json`

* 2015-05-09 (**Version 2.3.0**)
 * Improved logging (timestamps and proper info/warn/error usage via winston)
 * Refactor, improve documentation and complete test support (testSyncConflict function)
 * Add support for [SASS CSS pre-comiler](http://sass-lang.com/) based development

* 2015-05-06 (**Version 2.2.4**)
 * FIX issue where config files existing on a custom path could not be updated for first-run scenarios.

* 2015-05-01 (**Version 2.2.3**)
 * FIX issue where incorrect file names created by user caused an endless record lookup loop

* 2015-04-13 (**Version 2.2.0**)
 * Isolate file and record based functions in own Class
 * Add tests for downloading and updating records
 * Simplify function calling and add more call backs (to support testing)


* 2015-04-13 (**Version 2.1.0**)
 * Rewrite pre-loading and re-syncing of files.
 * Clean up watching files system to be enabled and disabled at the right times and avoid file writes triggering watch changes

* 2015-04-06 (**Version 2.0.0 !**)
 * Add preLoad option to download files defined per root in "preLoad" object
 * Re-write documentation for app.config.json due to massive simplification and first-run setup
 * Fix redundant requests to instance for syncing
 * Add automatic folder creation option
   * Set ```createAllFolders: true``` in app.config.json

* 2015-04-04
 * Make folder definitions standard across all projects but allow users to override the defaults or extend them.
   * Set ```"ignoreDefaultFolders": true,``` if desired and specify own ```"folders": {...}``` for a custom setup

* 2015-04-03 (**major changes!** :mushroom:)
 * Allow specifying the location of the config file:
   * ```./node-darwin app/src --config=/computer/somefile.json```
 * Cleanup formatting
 * Add help option:
   * ```./node-darwin app/src --help```
 * Save sync data in JSON format so that we can make more use of it
   * WARNING: existing users will need to remove their current .sync dir and resync. When starting the app a warning will be output on the command line explaining what to do...
     * ```./node-darwin app/src --resync```
     * ```rm - Rf .sync``` (per site root dir)

* 2015-03-26
 * Upgraded node_modules (```npm update```) to latest version other than restify (which was throwing too many errors on current and future node versions node@0.10.37 and node@0.12.0 with restify@3.0.1. restify@2.6.0 is stable)
 * Add more connection error support

* 2015-03-23
 * Add basic test support to ensure setup is upgrade safe:
   * ```./node-darwin app/src --test```
 * Add jshint for cleaner scripting
 * Add module to parse command line args easily

* 2015-03-18
 * Fixed some trivial stuff regarding connection handling

* 2015-03-16
 * Added conflict management! Now it's impossible to overwrite server records that would result in data loss!

* 2015-03-14
 * Update readme and add road map. Encourage contribution!
 * Refactored code setup and allow config file to be outside of repo
 * Enable non 'https' instance connections
 * Added notification support (OS X)

* 2015-03-10
 * Added support for Eureka+ versions
 * Initial clone and file re-structure
