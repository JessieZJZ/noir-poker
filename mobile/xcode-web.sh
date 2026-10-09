#!/bin/sh
set -eu
if [ "${NOIR_SKIP_WEB_PREPARE:-0}" = "1" ]; then exit 0; fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$SRCROOT/../.."
if [ -f mobile/xcode.env ]; then . ./mobile/xcode.env; fi
"${NODE_BINARY:-node}" scripts/mobile.mjs copy ios
