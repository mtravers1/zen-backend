#!/bin/bash

# Get the latest git tag, e.g., "v1.0.0"
VERSION_TAG=$(git describe --tags --abbrev=0)

# Strip 'v' prefix for package.json version, if it exists
if [[ $VERSION_TAG == v* ]]; then
  APP_VERSION=${VERSION_TAG:1}
else
  APP_VERSION=$VERSION_TAG
fi

# Update package.json and package-lock.json
echo "Updating package.json to version $APP_VERSION"
# Use --allow-same-version to prevent errors if the version is already correct
npm version "$APP_VERSION" --no-git-tag-version --allow-same-version > /dev/null

# Set the release name based on your format (using the original tag)
RELEASE_NAME="$VERSION_TAG"

echo "Setting SENTRY_RELEASE to $RELEASE_NAME"

# Export the variable so your application can access it
export SENTRY_RELEASE=$RELEASE_NAME

# If using Create React App, variables must be prefixed.
# The init code I provided will check for both.
export REACT_APP_SENTRY_RELEASE=$RELEASE_NAME