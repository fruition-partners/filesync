# FileSync Changes

* 2015-04-13 (**Version 2.2.0**)
 * Isolate file and record based functions in own Class
 * Add tests for downloading and updating records
 * Simplify function calling and add more call backs (to support testing).


* 2015-04-13 (**Version 2.1.0**)
 * Rewrite pre-loading and re-syncing of files.
 * Clean up watching files system to be enabled and disabled at the right times and avoid file writes triggering watch changes.

* 2015-04-06 (**Version 2.0.0 !**)
 * Add preLoad option to download files defined per root in "preLoad" object.
 * Re-write documentation for app.config.json due to massive simplification and first-run setup.
 * Fix redundant requests to instance for syncing
 * Add automatic folder creation option
   * Set ```createAllFolders: true``` in app.config.json

* 2015-04-04
 * Make folder definitions standard across all projects but allow users to override the defaults or extend them.
   * Set ```"ignoreDefaultFolders": true,``` if desired and specify own ```"folders": {...}``` for a custom setup.

* 2015-04-03 (**major changes!** :mushroom:)
 * Allow specifying the location of the config file:
   * ```./node-darwin app/src --config=/computer/somefile.json```
 * Cleanup formatting
 * Add help option:
   * ```./node-darwin app/src --help```
 * Save sync data in JSON format so that we can make more use of it.
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
 * Added support for Eureka+ versions.
 * Initial clone and file re-structure
