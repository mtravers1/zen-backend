#!/bin/bash

# Get the latest git tag, e.g., "v1.0.0"
VERSION=$(git describe --tags --abbrev=0)

# Set the release name based on your format
RELEASE_NAME="$VERSION"

echo "Setting SENTRY_RELEASE to $RELEASE_NAME"

# Export the variable so your application can access it
export SENTRY_RELEASE=$RELEASE_NAME

# If using Create React App, variables must be prefixed.
# The init code I provided will check for both.
export REACT_APP_SENTRY_RELEASE=$RELEASE_NAME