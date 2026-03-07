# Titan's Pit

Titan's Pit is a SvelteKit frontend over Copyparty for browsing, uploading, organizing, previewing, and trashing files in a personal homelab vault.

## Ports

- Titan's Pit app: `5823`
- Copyparty backend: `5822`

## Development

1. Install dependencies:

```sh
npm install
```

2. Copy `.env.example` to `.env` and adjust values if needed.

3. Start Copyparty separately on `5822`.

4. Start the frontend:

```sh
npm run dev
```

For local Windows development, [start-titans-pit.bat](./start-titans-pit.bat) starts both the frontend and Copyparty with the current local paths.

## Production

This repo now uses SvelteKit's Node adapter, so the deployment flow is:

```sh
npm install
npm run build
npm start
```

`npm start` runs:

```sh
node --env-file=.env build
```

That means:

- Node `20.6+` is required
- runtime env comes from `.env`
- the built server listens using `HOST` and `PORT` from `.env`

For Ubuntu + Tailscale deployments, use the templates and service files in [deploy/ubuntu](./deploy/ubuntu).
They include Linux-specific env examples, manual start scripts, and `systemd` unit templates.
Do not use [start-titans-pit.bat](./start-titans-pit.bat) on Linux.

## Required Runtime Env

Minimum useful values:

```env
HOST="0.0.0.0"
PORT="5823"
ORIGIN="http://your-server-hostname-or-ip:5823"
COPYPARTY_BASE_URL="http://127.0.0.1:5822"
COPYPARTY_PASSWORD="your-copyparty-password"
BETTER_AUTH_SECRET="replace-this-with-a-long-random-secret"
```

If Copyparty is on the same machine, keeping `COPYPARTY_BASE_URL` on loopback is fine.

## Leaving It Running

For Ubuntu servers, prefer the `systemd` templates in [deploy/ubuntu](./deploy/ubuntu).

Use a process supervisor. One option included here is PM2:

```sh
pm2 start ecosystem.config.cjs
pm2 save
```

The included [ecosystem.config.cjs](./ecosystem.config.cjs) starts the built Node server with `.env` loaded.
That is still useful if you only want to supervise Titan's Pit and manage Copyparty separately.

Copyparty should still be managed separately by your server's normal process manager or startup method.

## Deployment Checklist

1. Push this repo to GitHub.
2. Pull it on the server.
3. Create the server `.env`.
4. Create `deploy/ubuntu/copyparty.env`.
5. Start Copyparty on `5822`.
6. Run `npm install`.
7. Run `npm run build`.
8. Run `npm start` or install the `systemd` units from [deploy/ubuntu](./deploy/ubuntu).

## Notes

- [device-pwas](./device-pwas) still target Copyparty directly and should point to port `5822`.
- Trash defaults to `/_titans_pit_trash`; create that folder once in the Copyparty-served root if it does not exist yet.
