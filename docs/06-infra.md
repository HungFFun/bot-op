# 06 — Hạ tầng: laptop Ubuntu làm server

## Cài đặt máy
- Ubuntu Server 24.04 LTS, cáp LAN (không dùng Wi-Fi), cắm sạc + UPS nhỏ nếu có.
- Không ngủ khi gập máy: `/etc/systemd/logind.conf` → `HandleLidSwitch=ignore`, `HandleLidSwitchExternalPower=ignore`; `systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`.
- Giới hạn sạc ~80% nếu BIOS/TLP hỗ trợ (`tlp` → `STOP_CHARGE_THRESH_BAT0=80`).
- Timezone `Asia/Ho_Chi_Minh`; `unattended-upgrades` chỉ bản vá bảo mật.
- Docker Engine + compose plugin; user deploy trong group docker.
- Tailscale để SSH từ xa. Không mở port nào trên router.
- Tắt màn hình console để giảm nhiệt (`consoleblank=60`).

## Docker Compose (services)
| Service | Ghi chú |
|---|---|
| postgres | 16-alpine, volume `pgdata`, chỉ expose trong network nội bộ |
| api | port nội bộ 3000 |
| web | build tĩnh, phục vụ bởi Caddy/nginx, proxy `/api` → api |
| worker | pg-boss |
| zalo-agent | volume `zalo-session` (cookie/imei), `restart: unless-stopped` |
| cloudflared | Cloudflare Tunnel → web |

Volume `uploads` dùng chung cho api, worker, zalo-agent.

## Cloudflare Tunnel
- Domain trỏ về Cloudflare, tạo tunnel, map `op.<domain>` → `web:80`.
- Có thể bật Cloudflare Access (email OTP) cho `/admin` để thêm một lớp bảo vệ.

## Backup
- `ops/backup.sh` (03:00): `pg_dump -Fc` → nén → `rclone copy` lên Google Drive `bot-op-backup/`; giữ 30 bản.
- Sync `/data/uploads` bằng `rclone sync` cùng lúc.
- `ops/restore.sh` + **thử khôi phục ngay tuần đầu** lên DB tạm.
- Ghi kết quả backup vào settings/log; thất bại → Web Push owner.

## Giám sát
- Healthcheck docker cho mọi service.
- Endpoint `/api/health` (DB, queue, agent_health).
- Nhiệt độ/disk: cron kiểm tra `df` > 85% hoặc nhiệt CPU cao → Web Push.
