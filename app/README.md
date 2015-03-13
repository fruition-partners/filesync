# FileSync

## Overview

FileSync synchronizes local file changes to mapped records in ServiceNow instances.

This enables ServiceNow developers to use their favorite integrated development environments (IDEs) and text editors
like WebStorm and Sublime for editing JavaScript, HTML, Jelly and other code - without wasting time and interrupting
development workflow copying and pasting code into a browser.

When a file changes within a configured root (project) folder, the parent folder and file name are used to identify the
table and record to be updated.

Adding an empty file, or clearing and saving an existing file, refreshes the local file with the latest instance
version, syncing *from* the instance *to* the local file. This is an easy way to populate your project folder with
existing scripts related to your project.

## Installation

**Step 1.** Ensure the [JSON Web Service plugin](http://wiki.servicenow.com/index.php?title=JSON_Web_Service) is
activated for your instance.

**Step 2.** Unzip **filesync.zip** into your desired install path, for example:

* On Windows: `c:\dev\tools\filesync`
* On Mac: `/Applications/filesync`

**Step 3.** Create a local folder structure for your project / source files. Project folders will be mapped to root
folders in the **app.config.json** config file. The following example folder structure is mapped in the
**app.config.json settings** section below:


    c:\dev
        \project_a
            business_rules
            script_includes
        \project_b
            script_includes
            ui_pages

**Step 4.** Edit **app.config.json**.

* Review the **app.config.json settings** section below for guidance. **Please read all comments.**
* Configure at least one root (project) folder to host, user, pass mapping. user and pass will be encoded and replaced
by an auth key at runtime.
* **Note:** You must restart FileSync any time you update app.config.json.

## Usage

With installation and configuration completed, you can start **filesync** by executing the included batch/shell scripts:

* On Windows, double-click: **filesync.bat**
* On Mac, initially, right-click on **filesync.command** and choose Open. Subsequently, you can double-click to open.

This launches a console window where you should see log messages showing the starting configuration of FileSync.  Do not
close this window.  This is what is watching for file changes.  As you make changes to mapped files, you'll see messages
logged showing the sync processing.

Verify everything works by adding an empty file corresponding to an instance record.  You can do this from your editor
or IDE, or open a new command shell:

On Windows, at a command prompt:

    cd c:\dev\project_a
    md script_includes
    cd script_includes
    copy nul JSUtil.js      <-- creates an empty file named JSUtil.js

On Mac, in Terminal:

    cd /path/to/project_a
    mkdir script_includes
    cd script_includes
    touch JSUtil.js

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

    {
        // maps a root (project) folder to an instance
        "roots": {
            "c:\\dev\\project_a": {                 // full path to root folder
                                                    // on Windows, ensure that backslashes are doubled
                                                    //    since backslash is an escape character in JSON
                                                    // on Mac, remove 'c:' and use forward slashes as in
                                                    //    "/path/to/project_a"
                "host": "demo001.service-now.com",  // instance host name
                "user": "admin",                    // instance credentials
                "pass": "admin"                     //    encoded to auth key and re-saved at runtime
            },
            "c:\\dev\\project_b": {                 // add additional root mappings as needed
                "host": "demo002.service-now.com",
                "auth": "YWRtaW46YWRtaW4="          // example of encoded user/pass
            }
        },
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
                "fields": {                         // multiple fields for the same record can be mapped to multiple
                    "xhtml": "html",                //   files by using different filename suffixes
                    "client.js": "client_script",   //   for ui pages, you might have three separate files:
                    "server.js": "processing_script" //    mypage.xhtml, mypage.client.js, mypage.server.js
                }                                   //   to store the all script associated with the page
            }
            ...
        },
        "debug": false                              // set to true to enable debug logging
    }

## Architecture

FileSync was built using [Node.js](http://nodejs.org/), a platform built on Chrome's JavaScript runtime. Zipped
distribution contents:

* README.md - this file, written in [Markdown](http://daringfireball.net/projects/markdown/) syntax
* node.exe, node-darwin - Node.js runtime binaries
* filesync.bat, filesync.command - Windows and Mac batch/shell scripts for starting FileSync
* app.config.json - configuration file with mapping of folders to instances/tables
* app.js - main application that watches for file changes
* config.js - a module used to load and validate and app.config.json file
* snc-client.js - a module that interacts with SN JSON Web Service to receive and send updates to instance
* node_modules - folder containing 3rd-party node.js modules (from NPM) used to build app
