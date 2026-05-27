# Railway persistent file storage

## One-time setup (Railway dashboard)

1. Open your **Travel OS** project → **API** service.
2. **Add volume** (right-click canvas or `Ctrl+K` → "Add volume").
3. Attach to the API service with mount path: `/data`
4. **Variables** → add:
   ```
   STORAGE_LOCAL_DIR=/data/uploads
   ```
5. Deploy (auto on push, or click **Redeploy**).

## Verify after deploy

1. Open **Deployments** → latest deploy **logs**.
2. Confirm: `Using storage dir: /data/uploads`
3. Log in as Owner/Admin, then:
   - `GET /api/v1/storage/status` — shows `localUploadDir` and optional `volumeMount`
   - `POST /api/v1/storage/test-upload` — multipart field `file`
4. Note the returned `url` (e.g. `/uploads/_test/1234-doc.pdf`).
5. **Redeploy** the API service.
6. `GET` the same `url` again — file should still load.

## Local dev

In `apps/api/.env`:

```
STORAGE_LOCAL_DIR=./uploads
```

Files are served at `http://localhost:4000/uploads/...`.
