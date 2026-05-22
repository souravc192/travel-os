import { Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import db, { withTransaction } from '../config/db';
import { logger } from '../config/logger';

// ─── Column header normalisation ──────────────────────────────
// The Excel sheet has these headers (case/space tolerant):
//   Official Email Id | First Name | Last Name | Full Name | Employee Id |
//   Designation | Department | L1 Approver | L2 Approver | L3 Approver |
//   No. of approvers | Group | Mobile Number | Gender | HOD | CXO
// Two columns are duplicated in the source ("Official Email Id" and "First Name");
// we keep the first occurrence of each.
const NORMALISED = {
  EMAIL:        ['official email id', 'email', 'email id'],
  FIRST_NAME:   ['first name'],
  LAST_NAME:    ['last name'],
  FULL_NAME:    ['full name', 'name'],
  EMP_CODE:     ['employee id', 'employee code', 'pwid'],
  DESIGNATION:  ['designation'],
  DEPARTMENT:   ['department'],
  L1:           ['l1 approver', 'l1'],
  L2:           ['l2 approver', 'l2'],
  L3:           ['l3 approver', 'l3'],
  NO_APPROVERS: ['no. of approvers', 'no of approvers', 'number of approvers'],
  GROUP:        ['group'],
  MOBILE:       ['mobile number', 'mobile', 'phone'],
  GENDER:       ['gender'],
  HOD:          ['hod'],
  CXO:          ['cxo'],
} as const;

type FieldKey = keyof typeof NORMALISED;

function buildHeaderIndex(headerRow: ExcelJS.Row): Partial<Record<FieldKey, number>> {
  const idx: Partial<Record<FieldKey, number>> = {};
  const cells: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cells[col] = String(cell.value ?? '').trim().toLowerCase();
  });
  for (const [key, aliases] of Object.entries(NORMALISED) as [FieldKey, readonly string[]][]) {
    for (let col = 1; col < cells.length; col++) {
      if (idx[key] !== undefined) break; // first match wins (handles duplicates)
      if (aliases.includes(cells[col])) idx[key] = col;
    }
  }
  return idx;
}

function getCell(row: ExcelJS.Row, col: number | undefined): string | null {
  if (!col) return null;
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
    return String((v as { text: string }).text).trim() || null;
  }
  if (typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
    return String((v as { result: unknown }).result ?? '').trim() || null;
  }
  return String(v).trim() || null;
}

// ─── POST /members/import ─────────────────────────────────────
export async function importMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Upload an .xlsx file under field "file".' } });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      res.status(400).json({ success: false, error: { code: 'NO_SHEET', message: 'Workbook has no sheets.' } });
      return;
    }

    const idx = buildHeaderIndex(sheet.getRow(1));
    if (!idx.EMP_CODE || !idx.EMAIL || !idx.FULL_NAME) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_HEADERS',
          message: 'Missing required columns. Need at least: Employee Id, Official Email Id, Full Name.',
        },
      });
      return;
    }

    // Collect distinct department names → upsert
    const distinctDepts = new Set<string>();
    const rowsToImport: Record<string, string | number | null>[] = [];
    const errors: Array<{ row: number; reason: string }> = [];

    let lastRow = 1;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => { lastRow = rowNumber; });

    for (let r = 2; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      const code = getCell(row, idx.EMP_CODE);
      if (!code) continue; // skip blank rows
      const email = getCell(row, idx.EMAIL);
      if (!email || !email.includes('@')) {
        errors.push({ row: r, reason: 'Missing or invalid email' });
        continue;
      }
      const fullName = getCell(row, idx.FULL_NAME)
        || [getCell(row, idx.FIRST_NAME), getCell(row, idx.LAST_NAME)].filter(Boolean).join(' ').trim();
      if (!fullName) {
        errors.push({ row: r, reason: 'Missing full name' });
        continue;
      }
      const dept = getCell(row, idx.DEPARTMENT);
      if (dept) distinctDepts.add(dept);

      const nApproversRaw = getCell(row, idx.NO_APPROVERS);
      const nApprovers = nApproversRaw ? Math.max(0, Math.min(3, parseInt(nApproversRaw, 10) || 0)) : 0;

      rowsToImport.push({
        code, email: email.toLowerCase(), fullName,
        firstName: getCell(row, idx.FIRST_NAME),
        lastName:  getCell(row, idx.LAST_NAME),
        designation: getCell(row, idx.DESIGNATION),
        department:  dept,
        l1: getCell(row, idx.L1)?.toLowerCase() ?? null,
        l2: getCell(row, idx.L2)?.toLowerCase() ?? null,
        l3: getCell(row, idx.L3)?.toLowerCase() ?? null,
        noOfApprovers: nApprovers,
        group:  getCell(row, idx.GROUP),
        mobile: getCell(row, idx.MOBILE),
        gender: getCell(row, idx.GENDER),
        hod:    getCell(row, idx.HOD)?.toLowerCase() ?? null,
        cxo:    getCell(row, idx.CXO)?.toLowerCase() ?? null,
      });
    }

    if (rowsToImport.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_ROWS', message: 'No importable rows found.' },
        meta: { errors },
      });
      return;
    }

    // Upsert departments + map name → uuid
    const deptIdByName = new Map<string, string>();
    await withTransaction(async (client) => {
      for (const name of distinctDepts) {
        const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20) || 'DEPT';
        const inserted = await client.query(
          `INSERT INTO departments (name, code)
           VALUES ($1, $2)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [name, code]
        );
        deptIdByName.set(name, inserted.rows[0].id);
      }
    });

    let inserted = 0, updated = 0;
    await withTransaction(async (client) => {
      for (const r of rowsToImport) {
        const deptId = r.department ? deptIdByName.get(r.department as string) ?? null : null;
        const res2 = await client.query(
          `INSERT INTO employees (
              employee_code, email, first_name, last_name, name, designation, department_id,
              l1_email, l2_email, l3_email, no_of_approvers, group_label,
              phone, gender, hod_email, cxo_email, is_active, onboarding_complete
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, true, false)
            ON CONFLICT (employee_code) DO UPDATE SET
              email           = EXCLUDED.email,
              first_name      = EXCLUDED.first_name,
              last_name       = EXCLUDED.last_name,
              name            = EXCLUDED.name,
              designation     = EXCLUDED.designation,
              department_id   = COALESCE(EXCLUDED.department_id, employees.department_id),
              l1_email        = EXCLUDED.l1_email,
              l2_email        = EXCLUDED.l2_email,
              l3_email        = EXCLUDED.l3_email,
              no_of_approvers = EXCLUDED.no_of_approvers,
              group_label     = EXCLUDED.group_label,
              phone           = COALESCE(EXCLUDED.phone, employees.phone),
              gender          = EXCLUDED.gender,
              hod_email       = EXCLUDED.hod_email,
              cxo_email       = EXCLUDED.cxo_email,
              is_active       = true
            RETURNING (xmax = 0) AS was_inserted`,
          [
            r.code, r.email, r.firstName, r.lastName, r.fullName, r.designation, deptId,
            r.l1, r.l2, r.l3, r.noOfApprovers, r.group,
            r.mobile, r.gender, r.hod, r.cxo,
          ]
        );
        if (res2.rows[0]?.was_inserted) inserted++; else updated++;
      }
    });

    // Seed default annual budget (₹24L) for each department that doesn't have one yet
    const fy = currentFiscalYear();
    await withTransaction(async (client) => {
      for (const deptId of deptIdByName.values()) {
        await client.query(
          `INSERT INTO department_budgets (department_id, fiscal_year, allocated_annual)
             VALUES ($1, $2, 2400000)
           ON CONFLICT (department_id, fiscal_year) DO NOTHING`,
          [deptId, fy]
        );
      }
    });

    logger.info(`Members import: ${inserted} new, ${updated} updated, ${errors.length} errors, ${distinctDepts.size} departments touched`);

    res.json({
      success: true,
      data: {
        totalRows: rowsToImport.length,
        inserted, updated, skipped: errors.length,
        departments: distinctDepts.size,
        errors: errors.slice(0, 50),
      },
      message: `Imported ${inserted + updated} members (${inserted} new, ${updated} updated).`,
    });
  } catch (err) { next(err); }
}

function currentFiscalYear(d: Date = new Date()): string {
  const y = d.getFullYear(), m = d.getMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
