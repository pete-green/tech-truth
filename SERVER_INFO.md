# Tech Truth Server Information

## SSH Access
- **SSH Command**: `ssh pete@66.57.165.30`
- **Port Forward Address**: 66.57.165.30 (through firewall)
- **Actual Server IP**: 66.57.165.26

## Application
- **Project Location**: `~/projects/tech-truth` (or `/home/pete/projects/tech-truth`)
- **App URL**: https://tech-truth.gogreenpha.com
- **Docker Container**: `tech-truth` on port 3002 -> 3000
- **Deploy Command**:
  ```bash
  cd ~/projects/tech-truth && \
  git pull && \
  docker build -t tech-truth:latest . && \
  docker stop tech-truth && \
  docker rm tech-truth && \
  docker run -d --name tech-truth --restart unless-stopped \
    -p 3002:3000 \
    --env-file ~/projects/tech-truth/.env.local \
    -e HOSTNAME=0.0.0.0 \
    --network deployment-platform_public \
    tech-truth:latest
  ```

**IMPORTANT**:
- The `HOSTNAME=0.0.0.0` env var is required for Next.js to accept connections from Caddy
- The container MUST be on the `deployment-platform_public` network for Caddy to reach it

## Server Notes
- Multiple applications on this server
- Uses Caddy for reverse proxy
- Uses Docker for containerization
- DO NOT interfere with other applications

## Scheduled Syncs
- GPS sync should run every 15 minutes via cron
- Endpoint: POST /api/sync-gps
- Also runs: /api/sync-data, /api/sync-punches
