set shell := ["bash", "-uc"]

default:
  @just --list

start:
  docker build -t mgmt .
  docker run --rm --name mgmt --hostname mgmt -v "$(pwd):/root/Application" -d mgmt

mgmt:
  docker exec -it mgmt bash

ps:
  docker ps

stop:
  docker stop mgmt

clean:
  rm -rf ssh-keys
