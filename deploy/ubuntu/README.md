# Ubuntu + Tailscale Deployment

This directory contains the Linux-specific files for running Titan's Pit and Copyparty on the
same Ubuntu server over direct Tailscale access.

## Included Files

- `titans-pit.env.example`: production `.env` template for Titan's Pit
- `copyparty.env.example`: Linux path and credential template for Copyparty
- `start-titans-pit.sh`: manual startup wrapper for the built Node server
- `start-copyparty.sh`: manual startup wrapper for Copyparty
- `systemd/titans-pit.service`: `systemd` template for Titan's Pit
- `systemd/copyparty.service`: `systemd` template for Copyparty

## 1. Prepare The Server Config

1. Clone the repo to your Ubuntu server, for example at `/srv/titans-pit`.
2. Copy `deploy/ubuntu/titans-pit.env.example` to the repo root as `.env`.
3. Copy `deploy/ubuntu/copyparty.env.example` to `deploy/ubuntu/copyparty.env`.
4. Edit both files with the real Tailscale hostname, Copyparty script path, volume path, username,
   and password.

For the direct-port setup in this repo:

- Titan's Pit listens on `5823`
- Copyparty listens on `5822`
- Tailscale clients must be able to reach both ports

## 2. Manual Smoke Test

Run these from the repo root after the env files are filled in:

```sh
npm install
npm run build
```

In one terminal:

```sh
bash deploy/ubuntu/start-copyparty.sh
```

In another terminal:

```sh
bash deploy/ubuntu/start-titans-pit.sh
```

Then open:

```text
http://your-server-name.tailnet.ts.net:5823
```

Verify:

- folder browsing works
- preview and download links open successfully
- uploads complete successfully
- rename, move, trash, and restore work
- the Copyparty trash path exists at `/_titans_pit_trash`

## 3. Install systemd Services

These templates assume the repo lives at `/srv/titans-pit` and the service user is `titanspit`.
If your server uses a different path or user, edit the unit files before copying them into
`/etc/systemd/system/`.
The chosen service user must be able to read the repo, execute Node and Python, and write to the
Copyparty volume path.

```sh
sudo cp deploy/ubuntu/systemd/copyparty.service /etc/systemd/system/copyparty.service
sudo cp deploy/ubuntu/systemd/titans-pit.service /etc/systemd/system/titans-pit.service
sudo systemctl daemon-reload
sudo systemctl enable --now copyparty.service titans-pit.service
```

Useful service commands:

```sh
sudo systemctl status copyparty.service
sudo systemctl status titans-pit.service
sudo journalctl -u copyparty.service -f
sudo journalctl -u titans-pit.service -f
```

## Notes

- `start-titans-pit.bat` is Windows-only and should not be used on Ubuntu.
- If you later move to a reverse proxy and single-origin setup, update `.env` and set
  `COPYPARTY_PUBLIC_BASE_URL`.
