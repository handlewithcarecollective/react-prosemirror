#!/usr/bin/env bash

# Copyright (c) The New York Times Company

if git diff origin/main -- package.json | grep -e '^+ *"version":'
then
  echo "Not checking version; version was changed in this branch"
else
  "$@"
fi
