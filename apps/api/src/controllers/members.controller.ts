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
  if (typeof v === 'object' && 'text' in (v as unknown as Record<string, unknown>)) {
    return String((v as { text: string }).text).trim() || null;
  }
  if (typeof v === 'object' && 'result' in (v as unknown as Record<string, unknown>)) {
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
    await workbook.xlsx.load(req.file.buffer as any);
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
      // Deduplicate distinctDepts by normalized code to avoid "ON CONFLICT DO UPDATE cannot affect row a second time"
      const uniqueDeptsByCode = new Map<string, string>();
      for (const name of distinctDepts) {
        const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20) || 'DEPT';
        if (!uniqueDeptsByCode.has(code)) {
          uniqueDeptsByCode.set(code, name);
        }
      }

      const deptArray = Array.from(uniqueDeptsByCode.entries());
      const deptBatchSize = 100;
      for (let i = 0; i < deptArray.length; i += deptBatchSize) {
        const batch = deptArray.slice(i, i + deptBatchSize);
        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;
        for (const [code, name] of batch) {
          placeholders.push(`($${paramIdx++}, $${paramIdx++})`);
          values.push(name, code);
        }
        const queryText = `
          INSERT INTO departments (name, code)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
          RETURNING id, code
        `;
        const resDepts = await client.query(queryText, values);
        for (const row of resDepts.rows) {
          for (const name of distinctDepts) {
            const nameCode = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20) || 'DEPT';
            if (nameCode === row.code) {
              deptIdByName.set(name, row.id);
            }
          }
        }
      }
    });

    // Deduplicate rowsToImport by employee_code, keeping the last occurrence (matching sequential overwrite behavior)
    const uniqueEmployeesMap = new Map<string, typeof rowsToImport[0]>();
    for (const r of rowsToImport) {
      uniqueEmployeesMap.set(r.code as string, r);
    }
    const deduplicatedRowsToImport = Array.from(uniqueEmployeesMap.values());

    let inserted = 0, updated = 0;
    const batchSize = 100;
    await withTransaction(async (client) => {
      for (let i = 0; i < deduplicatedRowsToImport.length; i += batchSize) {
        const batch = deduplicatedRowsToImport.slice(i, i + batchSize);
        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;
        
        for (const r of batch) {
          const deptId = r.department ? deptIdByName.get(r.department as string) ?? null : null;
          const p: string[] = [];
          for (let k = 0; k < 16; k++) {
            p.push(`$${paramIdx++}`);
          }
          placeholders.push(`(${p.join(',')}, true, false)`);
          
          values.push(
            r.code, r.email, r.firstName, r.lastName, r.fullName, r.designation, deptId,
            r.l1, r.l2, r.l3, r.noOfApprovers, r.group,
            r.mobile, r.gender, r.hod, r.cxo
          );
        }
        
        const queryText = `
          INSERT INTO employees (
            employee_code, email, first_name, last_name, name, designation, department_id,
            l1_email, l2_email, l3_email, no_of_approvers, group_label,
            phone, gender, hod_email, cxo_email, is_active, onboarding_complete
          ) VALUES ${placeholders.join(', ')}
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
          RETURNING (xmax = 0) AS was_inserted
        `;
        
        const res2 = await client.query(queryText, values);
        for (const row of res2.rows) {
          if (row.was_inserted) inserted++; else updated++;
        }
      }
    });

    // Seed default annual budget (₹24L) for each department that doesn't have one yet
    const fy = currentFiscalYear();
    await withTransaction(async (client) => {
      const uniqueDeptIds = Array.from(new Set(deptIdByName.values()));
      const budgetBatchSize = 100;
      for (let i = 0; i < uniqueDeptIds.length; i += budgetBatchSize) {
        const batch = uniqueDeptIds.slice(i, i + budgetBatchSize);
        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;
        for (const deptId of batch) {
          placeholders.push(`($${paramIdx++}, $${paramIdx++}, 2400000)`);
          values.push(deptId, fy);
        }
        const queryText = `
          INSERT INTO department_budgets (department_id, fiscal_year, allocated_annual)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (department_id, fiscal_year) DO NOTHING
        `;
        await client.query(queryText, values);
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
