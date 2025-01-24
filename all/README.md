# Racer

# Local Development Guide

## Local Setup

https://localhost:8080
https://play.hytopia.com/?join=localhost:8080/

## Multiplayer Setup

$NODE_ENV=production
bun --watch index.ts
cloudflared tunnel --url http://localhost:8080
