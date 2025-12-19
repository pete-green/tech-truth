# Tech Truth Server Information

## SSH Access
- **SSH Command**: `ssh pete@66.57.165.30`
- **Port Forward Address**: 66.57.165.30 (through firewall)
- **Actual Server IP**: 66.57.165.26

## Application
- **Project Location**: `/projects/tech-truth`
- **App URL**: https://tech-truth.gogreenpha.com

## Server Notes
- Multiple applications on this server
- Uses Caddy for reverse proxy
- Uses Docker for containerization
- DO NOT interfere with other applications

## Scheduled Syncs
- GPS sync should run every 15 minutes via cron
- Endpoint: POST /api/sync-gps
- Also runs: /api/sync-data, /api/sync-punches
