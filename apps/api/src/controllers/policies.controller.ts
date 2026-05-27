import { Request, Response, NextFunction } from 'express';
import db, { withTransaction } from '../config/db';
import { storage } from '../config/storage';
import { logger } from '../config/logger';
import { parsePolicyPdf } from '../utils/pdf-parser';

// ─── Helpers ──────────────────────────────────────────────────
function bad(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function shapePolicy(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:            row.id,
    category:      row.category,
    title:         row.title,
    description:   row.description,
    isActive:      row.is_active,
    publishedVersionId:     row.published_version_id ?? null,
    publishedVersionNumber: row.published_version_number ?? null,
    publishedAt:            row.published_at ?? null,
    versionCount:           row.version_count ?? 0,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function shapeVersion(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:                row.id,
    policyId:          row.policy_id,
    versionNumber:     row.version_number,
    sourceFilename:    row.source_filename,
    sourcePdfPath:     row.source_pdf_path,
    parsedTree:        row.parsed_tree,
    isPublished:       row.is_published,
    uploadedAt:        row.uploaded_at,
    publishedAt:       row.published_at,
    uploadedByEmail:   row.uploaded_by_email ?? null,
  };
}

// ─── GET /policies — list all policies + their current version ──
export async function listPolicies(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT p.*,
              pv.id            AS published_version_id,
              pv.version_number AS published_version_number,
              pv.published_at,
              (SELECT COUNT(*) FROM policy_versions WHERE policy_id = p.id) AS version_count
         FROM policies p
    LEFT JOIN policy_versions pv
           ON pv.policy_id = p.id AND pv.is_published = true
        WHERE p.is_active = true
        ORDER BY p.category, p.title`
    );
    res.json({ success: true, data: result.rows.map(shapePolicy) });
  } catch (err) { next(err); }
}

// ─── GET /policies/:id — policy meta + current published tree ──
export async function getPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const p = await db.query(`SELECT * FROM policies WHERE id = $1`, [req.params.id]);
    if (!p.rows[0]) return bad(res, 'NOT_FOUND', 'Policy not found.', 404);
    const v = await db.query(
      `SELECT pv.*, u.email AS uploaded_by_email
         FROM policy_versions pv
    LEFT JOIN users u ON u.id = pv.uploaded_by
        WHERE pv.policy_id = $1 AND pv.is_published = true
        LIMIT 1`,
      [req.params.id]
    );
    res.json({
      success: true,
      data: {
        policy:           shapePolicy(p.rows[0]),
        publishedVersion: shapeVersion(v.rows[0]),
      },
    });
  } catch (err) { next(err); }
}

// ─── GET /policies/:id/versions ──────────────────────────────
export async function listVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT pv.id, pv.policy_id, pv.version_number, pv.source_filename,
              pv.is_published, pv.uploaded_at, pv.published_at,
              u.email AS uploaded_by_email
         FROM policy_versions pv
    LEFT JOIN users u ON u.id = pv.uploaded_by
        WHERE pv.policy_id = $1
        ORDER BY pv.version_number DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows.map(shapeVersion) });
  } catch (err) { next(err); }
}

// ─── GET /policies/versions/:versionId — full tree (preview) ──
export async function getVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT pv.*, u.email AS uploaded_by_email
         FROM policy_versions pv
    LEFT JOIN users u ON u.id = pv.uploaded_by
        WHERE pv.id = $1`,
      [req.params.versionId]
    );
    if (!r.rows[0]) return bad(res, 'NOT_FOUND', 'Version not found.', 404);
    res.json({ success: true, data: shapeVersion(r.rows[0]) });
  } catch (err) { next(err); }
}

// ─── POST /policies — create policy (metadata only) ──────────
export async function createPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const { category, title, description } = req.body ?? {};
    if (!category || !title) return bad(res, 'INVALID_BODY', 'category and title are required.');
    const r = await db.query(
      `INSERT INTO policies (category, title, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [String(category).trim(), String(title).trim(), description ?? null, userId]
    );
    res.status(201).json({ success: true, data: shapePolicy(r.rows[0]) });
  } catch (err) { next(err); }
}

// ─── PATCH /policies/:id — edit metadata ─────────────────────
export async function updatePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { category, title, description, isActive } = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    function add(col: string, val: unknown) {
      if (val !== undefined) { params.push(val); updates.push(`${col} = $${params.length}`); }
    }
    add('category',    category);
    add('title',       title);
    add('description', description);
    add('is_active',   isActive);
    if (updates.length === 0) return bad(res, 'NO_UPDATES', 'No fields to update.');
    params.push(req.params.id);
    const r = await db.query(
      `UPDATE policies SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!r.rows[0]) return bad(res, 'NOT_FOUND', 'Policy not found.', 404);
    res.json({ success: true, data: shapePolicy(r.rows[0]) });
  } catch (err) { next(err); }
}

// ─── POST /policies/:id/versions — upload PDF (NOT published) ──
// Stores the PDF + parses → preview tree. Admin clicks Publish separately.
export async function uploadVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    if (!req.file) return bad(res, 'NO_FILE', 'Upload the PDF under field "file".');

    const p = await db.query(`SELECT id FROM policies WHERE id = $1`, [req.params.id]);
    if (!p.rows[0]) return bad(res, 'NOT_FOUND', 'Policy not found.', 404);

    // 1. Parse the PDF
    const parsed = await parsePolicyPdf(req.file.buffer);

    // 2. Persist the PDF on disk
    const ym  = new Date().toISOString().slice(0, 7).replace('-', '/');
    const put = await storage.put(`policies/${ym}`, req.file.originalname, req.file.buffer);

    // 3. Determine next version number + create row
    const nextRes = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM policy_versions WHERE policy_id = $1`,
      [req.params.id]
    );
    const versionNumber = nextRes.rows[0].next;

    const insRes = await db.query(
      `INSERT INTO policy_versions
         (policy_id, version_number, source_filename, source_pdf_path,
          parsed_tree, raw_text, uploaded_by, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       RETURNING *`,
      [
        req.params.id, versionNumber,
        req.file.originalname, put.key,
        JSON.stringify({ tree: parsed.tree, fallback: parsed.fallback, meta: parsed.meta }),
        parsed.raw_text, userId,
      ]
    );

    logger.info(`Policy ${req.params.id} v${versionNumber} uploaded (preview, not published)`);
    res.status(201).json({
      success: true,
      data: shapeVersion(insRes.rows[0]),
      meta:  { headingCount: parsed.meta.headingCount, fallback: parsed.fallback },
      message: parsed.fallback
        ? 'No numbered headings detected — rendered as a single card. Publish if it looks right, or upload a different file.'
        : `Parsed ${parsed.meta.headingCount} sections. Preview, then publish.`,
    });
  } catch (err) { next(err); }
}

// ─── POST /policies/versions/:versionId/publish ──────────────
export async function publishVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const versionId = req.params.versionId;

    await withTransaction(async (client) => {
      const v = await client.query(`SELECT * FROM policy_versions WHERE id = $1`, [versionId]);
      const ver = v.rows[0];
      if (!ver) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (ver.is_published) throw Object.assign(new Error('ALREADY_PUBLISHED'), { status: 409 });
      // Unpublish any currently published version on this policy
      await client.query(
        `UPDATE policy_versions
            SET is_published = false
          WHERE policy_id = $1 AND is_published = true`,
        [ver.policy_id]
      );
      await client.query(
        `UPDATE policy_versions
            SET is_published = true,
                published_at = NOW(),
                published_by = $1
          WHERE id = $2`,
        [userId, versionId]
      );
    });

    res.json({ success: true, message: 'Version published.' });
  } catch (err) {
    const s = (err as { status?: number }).status;
    if (s === 404) return bad(res, 'NOT_FOUND', 'Version not found.', 404);
    if (s === 409) return bad(res, 'ALREADY_PUBLISHED', 'Version is already published.', 409);
    next(err);
  }
}

// ─── DELETE /policies/versions/:versionId ────────────────────
export async function deleteVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const versionId = req.params.versionId;
    const v = await db.query(`SELECT * FROM policy_versions WHERE id = $1`, [versionId]);
    const ver = v.rows[0];
    if (!ver) return bad(res, 'NOT_FOUND', 'Version not found.', 404);
    if (ver.is_published) return bad(res, 'CANNOT_DELETE', 'Unpublish or publish a different version first.', 409);

    await db.query(`DELETE FROM policy_versions WHERE id = $1`, [versionId]);
    if (ver.source_pdf_path) await storage.remove(ver.source_pdf_path).catch(() => {});
    res.json({ success: true, message: 'Version deleted.' });
  } catch (err) { next(err); }
}

// ─── GET /policies/versions/:versionId/pdf — auth download ───
export async function downloadVersionPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const v = await db.query(
      `SELECT source_pdf_path, source_filename FROM policy_versions WHERE id = $1`,
      [req.params.versionId]
    );
    const ver = v.rows[0];
    if (!ver || !ver.source_pdf_path) return bad(res, 'NOT_FOUND', 'PDF not found.', 404);
    const { stream, size } = await storage.read(ver.source_pdf_path);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Content-Disposition',
      `inline; filename="${(ver.source_filename ?? 'policy.pdf').replace(/"/g, '')}"`);
    stream.pipe(res);
  } catch (err) { next(err); }
}
