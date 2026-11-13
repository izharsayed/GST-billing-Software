import express from 'express';
import { db, runInTransaction, logAudit } from '../db/index.js';

const router = express.Router();

// Helper to format next Report Number (e.g. CSH-2026-0001)
function getNextCommissioningReportNumber() {
  const year = new Date().getFullYear();
  const prefix = `CSH-${year}-`;
  try {
    const row = db.prepare(`
      SELECT report_no FROM commissioning_reports 
      WHERE report_no LIKE ? 
      ORDER BY report_no DESC LIMIT 1
    `).get(`${prefix}%`);

    if (!row || !row.report_no) {
      return `${prefix}0001`;
    }
    const parts = row.report_no.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  } catch (_) {
    return `${prefix}0001`;
  }
}

// 1. GET ALL COMMISSIONING REPORTS (Optional filter by ?client=...)
router.get('/', (req, res) => {
  try {
    const client = req.query.client;
    let rows;
    if (client) {
      rows = db.prepare(`
        SELECT * FROM commissioning_reports 
        WHERE LOWER(customer_name) = LOWER(?) 
        ORDER BY created_at DESC
      `).all(client.trim());
    } else {
      rows = db.prepare(`
        SELECT * FROM commissioning_reports 
        ORDER BY created_at DESC
      `).all();
    }

    const reports = rows.map(r => ({
      ...r,
      units: r.units_json ? JSON.parse(r.units_json) : [],
      csh2_data: r.csh2_data_json ? JSON.parse(r.csh2_data_json) : {},
      measurement_data: r.measurement_data_json ? JSON.parse(r.measurement_data_json) : [],
    }));
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET NEXT REPORT NUMBER
router.get('/next-number', (req, res) => {
  try {
    const nextNo = getNextCommissioningReportNumber();
    res.json({ reportNo: nextNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET SINGLE REPORT BY ID
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM commissioning_reports WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Commissioning report not found' });
    }
    res.json({
      ...row,
      units: row.units_json ? JSON.parse(row.units_json) : [],
      csh2_data: row.csh2_data_json ? JSON.parse(row.csh2_data_json) : {},
      measurement_data: row.measurement_data_json ? JSON.parse(row.measurement_data_json) : [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. CREATE OR UPDATE REPORT
router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.customer_name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const reportId = data.id || `csh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const reportNo = data.report_no || getNextCommissioningReportNumber();

    runInTransaction(() => {
      db.prepare(`
        INSERT INTO commissioning_reports (
          id, report_no, invoice_no, invoice_date, customer_name, customer_id, branch, dealer_name,
          billing_address, site_address, handover_date, warranty_start, warranty_end,
          ppm1_date, ppm2_date, ppm3_date, distance_dealer,
          units_json, csh2_data_json, measurement_data_json, remarks,
          engineer_name, customer_signatory, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO UPDATE SET
          report_no = excluded.report_no,
          invoice_no = excluded.invoice_no,
          invoice_date = excluded.invoice_date,
          customer_name = excluded.customer_name,
          customer_id = excluded.customer_id,
          branch = excluded.branch,
          dealer_name = excluded.dealer_name,
          billing_address = excluded.billing_address,
          site_address = excluded.site_address,
          handover_date = excluded.handover_date,
          warranty_start = excluded.warranty_start,
          warranty_end = excluded.warranty_end,
          ppm1_date = excluded.ppm1_date,
          ppm2_date = excluded.ppm2_date,
          ppm3_date = excluded.ppm3_date,
          distance_dealer = excluded.distance_dealer,
          units_json = excluded.units_json,
          csh2_data_json = excluded.csh2_data_json,
          measurement_data_json = excluded.measurement_data_json,
          remarks = excluded.remarks,
          engineer_name = excluded.engineer_name,
          customer_signatory = excluded.customer_signatory,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        reportId,
        reportNo,
        data.invoice_no || '',
        data.invoice_date || '',
        data.customer_name,
        data.customer_id || null,
        data.branch || 'Pune',
        data.dealer_name || 'Bizz Alliance LLP',
        data.billing_address || '',
        data.site_address || '',
        data.handover_date || new Date().toISOString().split('T')[0],
        data.warranty_start || data.handover_date || new Date().toISOString().split('T')[0],
        data.warranty_end || '',
        data.ppm1_date || '',
        data.ppm2_date || '',
        data.ppm3_date || '',
        data.distance_dealer || '<60km',
        JSON.stringify(data.units || []),
        JSON.stringify(data.csh2_data || {}),
        JSON.stringify(data.measurement_data || []),
        data.remarks || '',
        data.engineer_name || '',
        data.customer_signatory || ''
      );

      logAudit('system', 'SAVE_COMMISSIONING_REPORT', 'commissioning_reports', reportId, { reportNo });
    });

    const saved = db.prepare('SELECT * FROM commissioning_reports WHERE id = ?').get(reportId);
    res.status(201).json({
      ...saved,
      units: saved.units_json ? JSON.parse(saved.units_json) : [],
      csh2_data: saved.csh2_data_json ? JSON.parse(saved.csh2_data_json) : {},
      measurement_data: saved.measurement_data_json ? JSON.parse(saved.measurement_data_json) : [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE REPORT
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM commissioning_reports WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Commissioning report not found' });
    }
    logAudit('system', 'DELETE_COMMISSIONING_REPORT', 'commissioning_reports', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
