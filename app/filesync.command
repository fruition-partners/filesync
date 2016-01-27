#!/bin/sh

cd "`dirname "$0"`"
echo "Starting FileSync..."
./node-darwin src/app --config app.config.json
