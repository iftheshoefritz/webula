#! /bin/bash

# capture the --source and --since arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --source)
      source=$2
      shift
      ;;
    --since)
      since=$2
      shift
      ;;
  esac
  shift
done

find $source -type f -newermt "$since" -exec cp -t public/cardimages {} +

