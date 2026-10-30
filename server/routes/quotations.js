import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, runInTransaction, logAudit } from '../db/index.js';
import { recommendColdRoomEquipment } from '../services/coldRoomEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BILLS_DIR = path.join(DATA_DIR, 'bills');

if (!fs.existsSync(BILLS_DIR)) {
  fs.mkdirSync(BILLS_DIR, { recursive: true });
}

function safeFileName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

const router = express.Router();

// ==========================================
// 1. CALCULATE / RECOMMEND EQUIPMENT
// ==========================================
router.post('/calculate', (req, res) => {
  try {
    const recommendation = recommendColdRoomEquipment(req.body);
    res.json(recommendation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. GET ALL QUOTATIONS
// ==========================================
router.get('/', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT q.*, c.name as customer_name, c.company_name, c.phone as customer_phone,
             s.site_name, s.address as site_address
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN customer_sites s ON q.site_id = s.id
      ORDER BY q.quotation_date DESC, q.created_at DESC
    `).all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. GET SINGLE QUOTATION DETAIL
// ==========================================
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const quotation = db.prepare(`
      SELECT q.*, c.name as customer_name, c.company_name, c.phone as customer_phone, c.gstin as customer_gstin,
             s.site_name, s.address as site_address, s.contact_person as site_contact
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN customer_sites s ON q.site_id = s.id
      WHERE q.id = ?
    `).get(id);

    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id ASC').all(id);
    const techInputs = db.prepare('SELECT * FROM quotation_technical_inputs WHERE quotation_id = ?').get(id);
    const modelRec = db.prepare('SELECT * FROM quotation_model_recommendations WHERE quotation_id = ?').get(id);

    res.json({
      ...quotation,
      items,
      technicalInputs: techInputs || null,
      modelRecommendation: modelRec || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. CREATE / UPDATE QUOTATION
// ==========================================
router.post('/', (req, res) => {
  try {
    const {
      id, quotation_number, customer_id, site_id, quotation_date, valid_until,
      status = 'draft', currency = 'INR', equipment_subtotal = 0, charges_subtotal = 0,
      discount_amount = 0, tax_amount = 0, total_amount = 0, terms,
      items = [], technicalInputs = null, modelRecommendation = null
    } = req.body;

    const qDate = quotation_date || new Date().toISOString().split('T')[0];
    const qNumber = quotation_number || ('QUO-' + Date.now().toString().slice(-6));
    const qId = id || ('quo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));

    runInTransaction(() => {
      // 0. Ensure customer and site exist or are null (prevents foreign key errors)
      let resolvedCustomerId = null;
      if (customer_id) {
        const existingCust = db.prepare('SELECT id FROM customers WHERE id = ?').get(customer_id);
        if (existingCust) {
          resolvedCustomerId = existingCust.id;
        } else {
          const byName = db.prepare('SELECT id FROM customers WHERE name = ?').get(customer_id);
          if (byName) {
            resolvedCustomerId = byName.id;
          } else {
            const newCustId = 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            db.prepare(`
              INSERT INTO customers (id, name, created_at, updated_at)
              VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(newCustId, customer_id);
            resolvedCustomerId = newCustId;
          }
        }
      }

      let resolvedSiteId = null;
      if (site_id) {
        const existingSite = db.prepare('SELECT id FROM customer_sites WHERE id = ?').get(site_id);
        if (existingSite) {
          resolvedSiteId = existingSite.id;
        } else if (resolvedCustomerId) {
          const newSiteId = 'site_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          db.prepare(`
            INSERT INTO customer_sites (id, customer_id, site_name, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `).run(newSiteId, resolvedCustomerId, site_id);
          resolvedSiteId = newSiteId;
        }
      }

      // 1. Insert/Update Quotation
      db.prepare(`
        INSERT INTO quotations (
          id, quotation_number, customer_id, site_id, quotation_date, valid_until,
          status, currency, equipment_subtotal, charges_subtotal, discount_amount,
          tax_amount, total_amount, terms, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          customer_id = excluded.customer_id,
          site_id = excluded.site_id,
          quotation_date = excluded.quotation_date,
          valid_until = excluded.valid_until,
          status = excluded.status,
          currency = excluded.currency,
          equipment_subtotal = excluded.equipment_subtotal,
          charges_subtotal = excluded.charges_subtotal,
          discount_amount = excluded.discount_amount,
          tax_amount = excluded.tax_amount,
          total_amount = excluded.total_amount,
          terms = excluded.terms,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        qId, qNumber, resolvedCustomerId, resolvedSiteId, qDate, valid_until || null,
        status, currency, Number(equipment_subtotal) || 0, Number(charges_subtotal) || 0,
        Number(discount_amount) || 0, Number(tax_amount) || 0, Number(total_amount) || 0,
        terms || ''
      );

      // 2. Delete and re-insert line items
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(qId);
      const insertItem = db.prepare(`
        INSERT INTO quotation_items (
          id, quotation_id, product_id, model_id, item_type, description,
          hsn_sac, quantity, unit, unit_price, discount_percent, tax_percent,
          tax_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < items.length; i++) {
        const itm = items[i];
        insertItem.run(
          `qitem_${qId}_${i}`, qId, itm.product_id || null, itm.model_id || null,
          itm.item_type || 'equipment', itm.description || 'Item', itm.hsn_sac || '',
          Number(itm.quantity) || 1, itm.unit || 'Set', Number(itm.unit_price) || 0,
          Number(itm.discount_percent) || 0, Number(itm.tax_percent) || 18.0,
          Number(itm.tax_amount) || 0, Number(itm.total_amount) || 0
        );
      }

      // 3. Technical inputs
      if (technicalInputs) {
        db.prepare('DELETE FROM quotation_technical_inputs WHERE quotation_id = ?').run(qId);
        db.prepare(`
          INSERT INTO quotation_technical_inputs (
            id, quotation_id, application_type, length_ft, width_ft, height_ft,
            volume_ft3, length_m, width_m, height_m, volume_m3, target_temp_c,
            ambient_temp_c, insulation_puf_mm, refrigerant_preference, compressor_type,
            daily_milk_liters, batches, calculated_load_kw, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'tech_' + qId, qId, technicalInputs.application || 'chiller',
          technicalInputs.length_ft || null, technicalInputs.width_ft || null, technicalInputs.height_ft || null,
          technicalInputs.volume_ft3 || null, technicalInputs.length_m || null, technicalInputs.width_m || null,
          technicalInputs.height_m || null, technicalInputs.volume_m3 || null,
          technicalInputs.targetTemp !== undefined ? Number(technicalInputs.targetTemp) : null,
          Number(technicalInputs.ambientTemp) || 43.0, Number(technicalInputs.insulation_puf_mm) || 80,
          technicalInputs.refrigerant || 'R404A', technicalInputs.compressorType || 'scroll',
          technicalInputs.dailyMilkLiters ? Number(technicalInputs.dailyMilkLiters) : null,
          technicalInputs.batches ? Number(technicalInputs.batches) : null,
          technicalInputs.estimatedLoadKw ? Number(technicalInputs.estimatedLoadKw) : null,
          technicalInputs.notes || ''
        );
      }

      // 4. Model recommendations
      if (modelRecommendation) {
        db.prepare('DELETE FROM quotation_model_recommendations WHERE quotation_id = ?').run(qId);
        db.prepare(`
          INSERT INTO quotation_model_recommendations (
            id, quotation_id, cdu_model_id, evap_model_id, expansion_valve,
            expansion_orifice, solenoid_valve, solenoid_coil, controller_model,
            catalogue_ref, catalogue_page, selection_notes, is_overridden, override_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'rec_' + qId, qId,
          modelRecommendation.cdu_model_id || null,
          modelRecommendation.evap_model_id || null,
          modelRecommendation.expansionValve || null,
          modelRecommendation.orifice || null,
          modelRecommendation.solenoidValve || null,
          modelRecommendation.solenoidCoil || null,
          modelRecommendation.controller?.model || modelRecommendation.controller || null,
          modelRecommendation.catalogueSource || null,
          modelRecommendation.cataloguePage || null,
          modelRecommendation.selectionNotes || null,
          modelRecommendation.is_overridden ? 1 : 0,
          modelRecommendation.override_reason || null
        );
      }
    });

    logAudit('admin', 'save', 'quotation', qId, { quotation_number: qNumber, total_amount });
    res.json({ success: true, id: qId, quotation_number: qNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. CONVERT QUOTATION TO TAX INVOICE
// ==========================================
router.post('/:id/convert-to-invoice', (req, res) => {
  try {
    const { id } = req.params;
    const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    if (quotation.status === 'converted') {
      return res.status(400).json({ error: 'Quotation has already been converted to an invoice.' });
    }

    const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(id);
    const customer = quotation.customer_id
      ? db.prepare('SELECT * FROM customers WHERE id = ?').get(quotation.customer_id)
      : null;

    const saleId = 'INV-' + Date.now().toString().slice(-6);

    // Prepare bill JSON compatible with legacy billing views
    const billData = {
      id: saleId,
      clientName: customer?.name || 'Customer',
      invoiceNumber: saleId,
      invoiceDate: new Date().toISOString().split('T')[0],
      invoiceType: 'tax_invoice',
      currency: quotation.currency || 'INR',
      totalAmount: quotation.total_amount,
      totalTaxAmount: quotation.tax_amount,
      status: 'unpaid',
      paidAmount: 0,
      payments: [],
      data: {
        client: {
          name: customer?.name || '',
          companyName: customer?.company_name || '',
          address: customer?.billing_address || '',
          state: customer?.state || '',
          gstin: customer?.gstin || '',
          phone: customer?.phone || '',
          email: customer?.email || ''
        },
        items: items.map(itm => ({
          name: itm.description,
          hsn: itm.hsn_sac || '',
          qty: itm.quantity,
          unit: itm.unit || 'Set',
          rate: itm.unit_price,
          discount: itm.discount_percent || 0,
          gst: itm.tax_percent || 18,
          amount: itm.total_amount
        })),
        terms: quotation.terms || '',
        quotationRef: quotation.quotation_number
      }
    };

    runInTransaction(() => {
      // 1. Create Sale (Invoice)
      db.prepare(`
        INSERT INTO sales (
          id, invoice_number, invoice_type, invoice_date, customer_id, site_id,
          status, currency, subtotal, discount_amount, tax_amount, total_amount,
          paid_amount, warehouse_id, notes, raw_json
        ) VALUES (?, ?, 'tax_invoice', CURRENT_DATE, ?, ?, 'unpaid', ?, ?, ?, ?, ?, 0, 'wh_main', ?, ?)
      `).run(
        saleId, saleId, quotation.customer_id, quotation.site_id,
        quotation.currency, (quotation.equipment_subtotal + quotation.charges_subtotal),
        quotation.discount_amount, quotation.tax_amount, quotation.total_amount,
        `Converted from Quotation #${quotation.quotation_number}`,
        JSON.stringify(billData)
      );

      // 2. Insert items
      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, product_id, model_id, description, hsn_sac, quantity,
          unit, unit_price, discount_percent, tax_percent, tax_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < items.length; i++) {
        const itm = items[i];
        insertSaleItem.run(
          `sitem_${saleId}_${i}`, saleId, itm.product_id, itm.model_id,
          itm.description, itm.hsn_sac, itm.quantity, itm.unit, itm.unit_price,
          itm.discount_percent, itm.tax_percent, itm.tax_amount, itm.total_amount
        );
      }

      // 3. Mark quotation as converted
      db.prepare(`
        UPDATE quotations
        SET status = 'converted', converted_sale_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(saleId, id);

      // 4. Write bill to data/bills/ for instant backwards-compatibility
      const billFilePath = path.join(BILLS_DIR, safeFileName(saleId) + '.json');
      fs.writeFileSync(billFilePath, JSON.stringify(billData, null, 2), 'utf8');
    });

    logAudit('admin', 'convert', 'quotation', id, { converted_to: saleId });
    res.json({ success: true, saleId, invoiceNumber: saleId, billId: saleId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
