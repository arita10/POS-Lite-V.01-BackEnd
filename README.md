# POS-Lite.V01 Backend — License Server

## Start
```bash
npm run start:dev    # development (auto-reload)
node dist/main       # production (after npm run build)
```
Runs on http://localhost:3100/api

---

## Environment (.env)
| Key | Description |
|-----|-------------|
| DATABASE_URL | SQLite path — `file:./license.db` |
| JWT_SECRET | Sign license tokens — **change in production** |
| ADMIN_KEY | Header for admin endpoints — **change in production** |
| PORT | Default 3100 |

---

## API Endpoints

### Client (POS-Lite app)

**POST /api/license/activate** — First-time activation
```json
Body:     { "key": "POS-XXXX", "fingerprint": "abc123", "label": "Chrome/Windows" }
Response: { "token": "<JWT>", "expiresAt": "2027-01-01T00:00:00.000Z" }
```

**POST /api/license/checkin** — Periodic renewal every 30 days
```json
Body:     { "key": "POS-XXXX", "fingerprint": "abc123" }
Response: { "token": "<JWT>", "expiresAt": "2027-01-01T00:00:00.000Z" }
```

---

### Admin (header: `x-admin-key: your-admin-key`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/license/admin/create | Create new license key |
| GET | /api/license/admin/list | List all licenses + devices |
| GET | /api/license/admin/stats | Dashboard counts |
| PATCH | /api/license/admin/:id | Update (revoke/extend/maxDevices) |
| PATCH | /api/license/admin/device/:id/revoke | Block a device |

**Create license body:**
```json
{ "customerName": "Yıldız Market", "customerEmail": "...", "expiresAt": "2027-01-01", "maxDevices": 2 }
```

**Update license body examples:**
```json
{ "isActive": false }           // revoke access
{ "expiresAt": "2028-01-01" }  // extend expiry
{ "maxDevices": 3 }            // allow more devices
```
