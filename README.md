# FileSync (2.0.0)

## Intro

This is a **maintained** fork of the fruition-parteners filesync repo. This repository adds support for current versions of ServiceNow, cleans up code managment (to allow more contribution!) and provides further solutions to common "editing in ServiceNow environment" issues (eg, conflict saves). See the **Road Map** below for more info. **Contributors wanted!**


## Overview

FileSync synchronizes local file changes to mapped records in ServiceNow instances.

This enables ServiceNow developers to use their favourite integrated development environments (IDEs) and text editors
like WebStorm, Sublime and [Brackets](http://brackets.io/) for editing JavaScript, HTML, Jelly and other code - without wasting time and interrupting
development workflow copying and pasting code into a browser.

When a file changes within a configured root (project) folder, the parent folder and file name are used to identify the
table and record to be updated.

Adding an empty file, or clearing and saving an existing file, refreshes the local file with the latest instance
version, syncing *from* the instance *to* the local file. This is an easy way to populate your project folder with
existing scripts related to your project.

Conflict management also detects if the server version has changed before trying to upload local changes (that may be based on an outdated version).

## Quick Start

**[Download the repository](https://github.com/dynamicdan/filesync/archive/master.zip)** and check out the **[video walk-through](https://vimeo.com/76383815)** of installing, configuring and using FileSync.

Configure the app.config.js file as required per **[app.config.json settings](#appconfigjson-settings)** below. Run the Windows (filesync.bat) or Mac (filesync.command) based app launcher.

## Installation

**Step 1.** Ensure that your instance is running with a version greater or equal to Eureka to make use of the JSONv2 API (enabled by default).

**Step 2.** Create a folder on your computer where the records will be saved.

**Step 3.** Edit **app.config.json**.

* Review the **app.config.json settings** section below for guidance. **Please read all comments.**
* Configure at least one root (project) folder including the host, user and pass. **"user"** and **"pass"** will be encoded and replaced
by an **"auth"** key at runtime.
* **Note:** You must restart FileSync any time you update app.config.json.

## Usage

With installation and configuration completed, you can start **filesync** by executing the included batch/shell scripts:

* Windows: double-click: **filesync.bat**
* Mac: right-click on **filesync.command** and choose Open (OS X first run security). Future use can simply double-click to open.

This launches a console window where you should see log messages showing the starting configuration of FileSync.  Do not
close this window.  This is what is watching for file changes.  As you make changes to mapped files, you'll see messages
logged showing the sync processing.

If you are using the default config then you will already have all the appropraite folders created for you and some test script include files that will have been downloaded from the instance. See "preLoad" and "createAllFolders" options below.

Additionally, you can sync more files by adding an empty file corresponding to an instance record.  You can do this from your editor
or IDE, or via the command line:

On Windows, at a command prompt:

    cd c:\dev\project_a
    md script_includes
    cd script_includes
    copy nul JSUtil.js      <-- creates an empty file named JSUtil.js

On Mac, in Terminal:

    cd /path/to/project_a
    mkdir script_includes
    cd script_includes
    touch JSUtil.js         <-- creates an empty file named JSUtil.js

Adding the empty JSUtil.js file will cause FileSync to sync the (OOB) JSUtil script include to the file. Any changes to
this local file will now be synced to the mapped instance.

The basic workflow is to initially create a script on ServiceNow (script include, business rule, ui script, etc.), then
add an empty file of the same name (and mapped extension) to a mapped local folder.

FileSync does not currently support creating new records in ServiceNow by simply adding local files since there are
additional fields that may need to be populated beyond mapped script fields. So, always start by creating a new
record on the instance, then add the empty local file and start editing your script.

## app.config.json settings

*Comments are included below for documentation purposes but are not valid in JSON files. You can validate JSON at
<http://www.jslint.com/>*

### Simple app.config.json file
```
    {
        // maps a root (project) folder to an instance
        "roots": {
            "c:\\dev\\project_a": {                 // full path to root folder
                                                    // on Windows, ensure that backslashes are doubled
                                                    //   since backslash is an escape character in JSON
                "host": "demo001.service-now.com",  // instance host name
                "user": "admin",                    // instance credentials
                "pass": "admin"                     // encoded to auth key and re-saved at runtime
            },
            "c:\\dev\\project_b": {                 // add additional root mappings as needed
                "host": "demo002.service-now.com",
                "auth": "YWRtaW46YWRtaW4="          // example of encoded user/pass
            },
            "/Users/joe.developer/instance/records": { // mac os non-https example
                "host": "some.instance.com:16001",
                "protocol": "http",                    // if https is not supported then force http here
                "auth": "YWRtaW46YWRtaW4=",
                "preLoad": {
                    "script_includes": ["JSUtil.js",
                                        "Transform.js"] // specify a list of files to create and sync instead of
                                                        //   using the command line.
                }
            }
        },

        "preLoad": true,                            // create files as defined above per root in "preLoad"
        "createAllFolders": true,                   // create local folders to save on manual effort

        "ignoreDefaultFolders": false,              // set to false to use basic mappings defined per
                                                    //  src/records.config.json file

        "debug": false                              // set to true to enable more detailed debug logging
    }
```

### Folder definitions (optional)

See the **src/records.config.json** file for sample definitions.

```
        "roots" { .... },

        // maps a subfolder of a root folder to a table on the configured instance
        "folders": {
            "script_includes": {                    // folder with files to sync
                "table": "sys_script_include",      // table with records to sync to
                "key": "name",                      // field to match with filename to ID unique record
                "fields": {                         // file contents are synced to a field based on filename suffix
                    "js": "script"                  //   files ending in .js will sync to script field
                }
            },
            "business_rules": {
                "table": "sys_script",
                "key": "name",
                "fields": {
                    "js": "script"
                }
            },
            "ui_pages": {
                "table": "sys_ui_page",
                "key": "name",
                "fields": {                          // multiple fields for the same record can be mapped to multiple
                    "xhtml": "html",                 //   files by using different filename suffixes
                    "client.js": "client_script",    //   for ui pages, you might have three separate files:
                    "server.js": "processing_script" //    mypage.xhtml, mypage.client.js, mypage.server.js
                }                                    //   to store the all script associated with the page
            }
            ...
        },
```


### Advanced settings

Property | Values | Default | Purpose
------------ | -------------------- | -------------
debug | Bool: true / false | false | Enable more verbose debugging. Useful to troubleshoot connection issues.
ignoreDefaultFolders | Bool: true / false | false | If false then utilise record to folder mapping defined in **src/records.config.json**.<br />If true then the **"folders"** property must be set as described below.
folders | Object listing folders | not set | See **src/records.config.json** as an example for format and usage. If this property is defined then it will override that defined in **src/records.config.json** on a per folder level. This is an easy way to specify more mappings without modifying core files. If "ignoreDefaultFolders " is set to true then **src/records.config.json** is completely ignored and all mappings must be defined in the "folders" property.
createAllFolders | Bool: true / false | false | Creates all folders specified by folders (if set) or the default **src/records.config.json** file.
preLoad | Bool: true / false | not set | Creates local files that can be spcecified per root/project preLoad setting defined below. Set to false to ignore the below property and therefore avoid re-creating files on startup.
roots[...].preLoad | Object listing folders | n/a |  Defines a list of files to automatically download per folder. Saves on manual file creation efforts <br />Eg: <br />``` preLoad: { ```<br />  ```  "business_rules": ["my special rule.js", "Another rule.js"]```<br />```}```


### Specifying a config file

Config files can be specified in 1 of 3 ways:
 * Not specified (eg from filesync.command) which will use the provided app.config.json file by default
 * By the existence of a file in the home directory
  * on mac: `~/.filesync/app.config.json`
  * on windows: `c:\\<HOME DIR>\.filesync\app.config.json`
 * Or via the command line.
  * Eg. ```./node-darwin src/app --config=~/Desktop/my-instance.config.json```


## Road Map

Considering ServiceNow does not handle merge conflicts at all, this is a major goal of this tool! Contributions to help achieve this road map or improve the tool in general are **greatly** appreciated.

- [x] support latest versions (Eurkea+) of ServiceNow
- [x] add protocol support to use http:// for on-premise setups
- [x] check if the record has been updated on the server before uploading changes and warn the user and cancel the upload (basic conflict management)
- [x] add notification (mac OS) to signify that the upload is complete (or failed)
- [ ] ignore hidden files better (Eg. ".DS_Store", ".jshintrc")
- [ ] when an update conflict has been detected write out the remote file and launch a diff app (command line "diff" or mac OS X Code "FileMerge" via "`opendiff <left> <right>`") for the user to help resolve the differences
- [ ] allow upload override of server record if the user has made a merge of remote and local data

- [ ] upgrade node binaries to latest versions (currently version "v0.8.25". version here http://nodejs.org/dist/v0.10.37/ needs testing with restify)
- [x] upgrade 3rd party node_modules (except restify)
- [ ] upgrade restify or find alternative that works better (restify is at "2.6.0" but should be "3.0.1" which needs "node": ">=0.10" run `npm outdated` for details)
- [x] use standard npm package.json setup to specify 3rd part node_modules




Nice to haves
- [x] auto create folder structure for user (```./node-darwin app/src --setup```)
- [ ] add record browser to automatically download chosen files.
- [x] option to re-download all files from instance (```./node-darwin app/src --resync```)
- [ ] auto download records created or updated by a given user ID
- [ ] notifications play sounds, show more info, are clickable etc.
- [ ] offline support? (keep track of files that are queued to upload when the connection is available again and retry).. maybe not. This could be dangerous if records get updated without someone to test them. Potentially workable if the last queued file is less than 3 minutes ago to cater for flaky mobile/roaming connections.
- [ ] save meta data recieved in request for user info (eg, sys_updated_on, sys_updated_by, sys_mod_count, description)
- [ ] config option to log details to log file (help others send log info)
- [x] download records on startup provided by a list (See ```"preLoad"``` in app.config.json)


## Contributing workflow

Here’s how we suggest you go about proposing a change to this project:

1. [Fork this project][fork] to your account.
2. [Create a branch][branch] for the change you intend to make.
3. Make your changes to your fork.
4. [Send a pull request][pr] from your fork’s branch to our `master` branch.

Using the web-based interface to make changes is fine too, and will help you
by automatically forking the project and prompting to send a pull request too.

[fork]: http://help.github.com/forking/
[branch]: https://help.github.com/articles/creating-and-deleting-branches-within-your-repository
[pr]: http://help.github.com/pull-requests/


## Changes

See [CHANGES.md](https://github.com/dynamicdan/filesync/blob/master/CHANGES.md)


## Architecture

FileSync was built using [Node.js](http://nodejs.org/), a platform built on Chrome's JavaScript runtime.


* README.md - this file, written in [Markdown][Markdown] syntax
* CHANGES.md - clean summary of updates (not versions), written in [Markdown][Markdown] syntax
* app/node.exe, node-darwin - Node.js runtime binaries
* app/filesync.bat, filesync.command - Windows and Mac batch/shell scripts for starting FileSync
* app/app.config.json - configuration file with mapping of folders to instances/tables
* app/node_modules - folder containing 3rd-party node.js modules (from NPM) used to build app
* app/src/app.js - main application that watches for file changes
* app/src/notify.js - fancy system notifications
* app/src/upgrade.js - ensures that users that upgrade can easily resolve *breaking* changes
* app/src/records.config.json - default folder definitions (that can be overwritten in app.config.json files)
* app/src/config.js - a module used to load and validate and app.config.json file
* app/src/snc-client.js - a module that interacts with SN JSON Web Service to receive and send updates to instance
* [root folder] / .syncData/ - a directory used to store information to help synchronise with the instance

[Markdown]: http://daringfireball.net/projects/markdown/

## Windows support

The original version supports windows without any issues. As I don't use windows, I can't easily test the fixes and features I've added in this repo. If you would like to help test and fix things for windows then please submit a pull request or contact me.

Below is a summary of windows support

Feature | Windows | Mac
------------ | ------------ | -------------
Notifications | Not yet supported | Y
Home dir config | Not tested | Y
