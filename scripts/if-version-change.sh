#!/usr/bin/env bash
if git diff HEAD^ -- package.json | grep -e '^+ *"version":'
then
  "$@"
else
  echo "Version was not changed in this commit"
fi
