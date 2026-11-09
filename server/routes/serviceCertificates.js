import express from 'express';
import { db, runInTransaction, logAudit } from '../db/index.js';

const router = express.Router();

// Helper to format next Request Number (e.g. SR-2026-0001)
function getNextServiceRequestNumber() {
  const year = new Date().getFullYear();
  const prefix = `SR-${year}-`;
  try {
    const row = db.prepare(`
      SELECT request_no FROM service_certificates 
      WHERE request_no LIKE ? 
      ORDER BY request_no DESC LIMIT 1
    `).get(`${prefix}%`);

    if (!row || !row.request_no) {
      return `${prefix}0001`;
    }
    const parts = row.request_no.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  } catch (_) {
    return `${prefix}0001`;
  }
}

// 1. GET ALL CERTIFICATES (Optional filter by ?client=...)
router.get('/', (req, res) => {
  try {
    const client = req.query.client;
    let rows;
    if (client) {
      rows = db.prepare(`
        SELECT * FROM service_certificates 
        WHERE LOWER(customer_name) = LOWER(?) 
        ORDER BY created_at DESC
      `).all(client.trim());
    } else {
      rows = db.prepare(`
        SELECT * FROM service_certificates 
        ORDER BY created_at DESC
      `).all();
    }

    const certificates = rows.map(r => ({
      ...r,
      parts_used: r.parts_used_json ? JSON.parse(r.parts_used_json) : [],
    }));
    res.json(certificates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET NEXT SERVICE REQUEST NUMBER
router.get('/next-number', (req, res) => {
  try {
    const nextNo = getNextServiceRequestNumber();
    res.json({ requestNo: nextNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET SINGLE CERTIFICATE BY ID
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM service_certificates WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Service certificate not found' });
    }
    const cert = {
      ...row,
      parts_used: row.parts_used_json ? JSON.parse(row.parts_used_json) : [],
    };
    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. CREATE OR UPDATE CERTIFICATE
router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.customer_name || !data.customer_name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const certId = data.id || ('cert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    const requestNo = data.request_no && data.request_no.trim() ? data.request_no.trim() : getNextServiceRequestNumber();

    const partsJson = JSON.stringify(data.parts_used || []);

    runInTransaction(() => {
      db.prepare(`
        INSERT INTO service_certificates (
          id, request_no, customer_name, customer_id, site_id, site_name, site_address,
          engineer_name, installation_date, warranty_status, amc_status,
          complaint_date_time, rectification_date_time,
          outdoor_model_no, outdoor_serial_no, indoor_model_no, indoor_serial_no,
          cause_of_claim, problem_reported, root_cause_analysis, correction_work,
          parts_used_json, refrigerant_required, refrigerant_type, refrigerant_qty,
          rating_behaviour, rating_satisfaction, rating_explanation,
          customer_remarks, dealer_name, status, invoice_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          request_no = excluded.request_no,
          customer_name = excluded.customer_name,
          customer_id = excluded.customer_id,
          site_id = excluded.site_id,
          site_name = excluded.site_name,
          site_address = excluded.site_address,
          engineer_name = excluded.engineer_name,
          installation_date = excluded.installation_date,
          warranty_status = excluded.warranty_status,
          amc_status = excluded.amc_status,
          complaint_date_time = excluded.complaint_date_time,
          rectification_date_time = excluded.rectification_date_time,
          outdoor_model_no = excluded.outdoor_model_no,
          outdoor_serial_no = excluded.outdoor_serial_no,
          indoor_model_no = excluded.indoor_model_no,
          indoor_serial_no = excluded.indoor_serial_no,
          cause_of_claim = excluded.cause_of_claim,
          problem_reported = excluded.problem_reported,
          root_cause_analysis = excluded.root_cause_analysis,
          correction_work = excluded.correction_work,
          parts_used_json = excluded.parts_used_json,
          refrigerant_required = excluded.refrigerant_required,
          refrigerant_type = excluded.refrigerant_type,
          refrigerant_qty = excluded.refrigerant_qty,
          rating_behaviour = excluded.rating_behaviour,
          rating_satisfaction = excluded.rating_satisfaction,
          rating_explanation = excluded.rating_explanation,
          customer_remarks = excluded.customer_remarks,
          dealer_name = excluded.dealer_name,
          status = excluded.status,
          invoice_id = excluded.invoice_id
      `).run(
        certId,
        requestNo,
        data.customer_name.trim(),
        data.customer_id || null,
        data.site_id || null,
        data.site_name || null,
        data.site_address || '',
        data.engineer_name || '',
        data.installation_date || '',
        data.warranty_status || 'No',
        data.amc_status || 'No',
        data.complaint_date_time || '',
        data.rectification_date_time || '',
        data.outdoor_model_no || '',
        data.outdoor_serial_no || '',
        data.indoor_model_no || '',
        data.indoor_serial_no || '',
        data.cause_of_claim || 'Operational',
        data.problem_reported || '',
        data.root_cause_analysis || '',
        data.correction_work || '',
        partsJson,
        data.refrigerant_required || 'No',
        data.refrigerant_type || '',
        data.refrigerant_qty || '',
        Number(data.rating_behaviour) || 5,
        Number(data.rating_satisfaction) || 5,
        Number(data.rating_explanation) || 5,
        data.customer_remarks || '',
        data.dealer_name || 'DAIKIN AIR-CONDITIONING PVT. LTD.',
        data.status || 'completed',
        data.invoice_id || null
      );

      logAudit('system', 'SAVE_SERVICE_CERTIFICATE', 'service_certificates', certId, { requestNo });
    });

    const saved = db.prepare('SELECT * FROM service_certificates WHERE id = ?').get(certId);
    res.status(201).json({
      ...saved,
      parts_used: saved.parts_used_json ? JSON.parse(saved.parts_used_json) : [],
    });
  } catch (err) {
    console.error('Failed to save service certificate:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE CERTIFICATE
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM service_certificates WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Service certificate not found' });
    }
    logAudit('system', 'DELETE_SERVICE_CERTIFICATE', 'service_certificates', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
