import express from 'express';
import { db, runInTransaction, logAudit } from '../db/index.js';

const router = express.Router();

// ==========================================
// 1. PRODUCT CATEGORIES
// ==========================================
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM product_categories ORDER BY name ASC').all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', (req, res) => {
  try {
    const { id, name, parent_id, description, is_active = 1 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    const catId = id || 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    db.prepare(`
      INSERT INTO product_categories (id, name, parent_id, description, is_active)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        parent_id = excluded.parent_id,
        description = excluded.description,
        is_active = excluded.is_active
    `).run(catId, name.trim(), parent_id || null, description || '', is_active ? 1 : 0);

    logAudit('admin', 'save', 'product_category', catId, { name });
    res.json({ success: true, id: catId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    // Check if in use by products
    const inUse = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(id).count;
    if (inUse > 0) {
      return res.status(400).json({ error: `Cannot delete: Category is linked to ${inUse} product(s). Archive or reassign them first.` });
    }
    db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
    logAudit('admin', 'delete', 'product_category', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. BRANDS / MANUFACTURERS
// ==========================================
router.get('/brands', (req, res) => {
  try {
    const brands = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands', (req, res) => {
  try {
    const { id, name, description, is_active = 1 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Brand name is required' });
    }
    const brandId = id || 'brd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    db.prepare(`
      INSERT INTO brands (id, name, description, is_active)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        is_active = excluded.is_active
    `).run(brandId, name.trim(), description || '', is_active ? 1 : 0);

    logAudit('admin', 'save', 'brand', brandId, { name });
    res.json({ success: true, id: brandId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/brands/:id', (req, res) => {
  try {
    const { id } = req.params;
    const inUse = db.prepare('SELECT COUNT(*) as count FROM products WHERE brand_id = ?').get(id).count;
    if (inUse > 0) {
      return res.status(400).json({ error: `Cannot delete: Brand is linked to ${inUse} product(s).` });
    }
    db.prepare('DELETE FROM brands WHERE id = ?').run(id);
    logAudit('admin', 'delete', 'brand', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. PRODUCT MODELS & TECHNICAL SPECS
// ==========================================
router.get('/models', (req, res) => {
  try {
    const { product_id } = req.query;
    let sql = `
      SELECT m.*, b.name as brand_name, p.name as product_name,
             prc.purchase_cost, prc.selling_price, prc.min_selling_price
      FROM product_models m
      LEFT JOIN brands b ON m.brand_id = b.id
      LEFT JOIN products p ON m.product_id = p.id
      LEFT JOIN product_prices prc ON m.id = prc.model_id
    `;
    const params = [];
    if (product_id) {
      sql += ' WHERE m.product_id = ? ';
      params.push(product_id);
    }
    sql += ' ORDER BY m.model_number ASC';

    const models = db.prepare(sql).all(...params);
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/models', (req, res) => {
  try {
    const {
      id, product_id, brand_id, model_number, description,
      capacity, capacity_unit, temp_range_min, temp_range_max,
      refrigerant, voltage_phase, catalogue_ref, catalogue_page,
      verification_status = 'verified', is_active = 1,
      purchase_cost = 0, selling_price = 0, min_selling_price = null,
      specs = {}
    } = req.body;

    if (!product_id) return res.status(400).json({ error: 'Product ID is required' });
    if (!model_number || !model_number.trim()) return res.status(400).json({ error: 'Model number is required' });

    const modelId = id || 'mod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    runInTransaction(() => {
      db.prepare(`
        INSERT INTO product_models (
          id, product_id, brand_id, model_number, description,
          capacity, capacity_unit, temp_range_min, temp_range_max,
          refrigerant, voltage_phase, catalogue_ref, catalogue_page,
          verification_status, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          brand_id = excluded.brand_id,
          model_number = excluded.model_number,
          description = excluded.description,
          capacity = excluded.capacity,
          capacity_unit = excluded.capacity_unit,
          temp_range_min = excluded.temp_range_min,
          temp_range_max = excluded.temp_range_max,
          refrigerant = excluded.refrigerant,
          voltage_phase = excluded.voltage_phase,
          catalogue_ref = excluded.catalogue_ref,
          catalogue_page = excluded.catalogue_page,
          verification_status = excluded.verification_status,
          is_active = excluded.is_active
      `).run(
        modelId, product_id, brand_id || null, model_number.trim(), description || '',
        capacity !== undefined && capacity !== '' ? Number(capacity) : null,
        capacity_unit || null,
        temp_range_min !== undefined && temp_range_min !== '' ? Number(temp_range_min) : null,
        temp_range_max !== undefined && temp_range_max !== '' ? Number(temp_range_max) : null,
        refrigerant || null, voltage_phase || null, catalogue_ref || null, catalogue_page || null,
        verification_status, is_active ? 1 : 0
      );

      // Manage price
      const existingPrice = db.prepare('SELECT * FROM product_prices WHERE model_id = ?').get(modelId);
      const newCost = Number(purchase_cost) || 0;
      const newPrice = Number(selling_price) || 0;
      const newMin = min_selling_price ? Number(min_selling_price) : null;

      if (existingPrice) {
        if (existingPrice.purchase_cost !== newCost || existingPrice.selling_price !== newPrice) {
          // Log price change
          db.prepare(`
            INSERT INTO price_change_history (id, product_id, model_id, old_cost, new_cost, old_price, new_price, changed_by, change_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'Model Price Update')
          `).run('pch_' + Date.now(), product_id, modelId, existingPrice.purchase_cost, newCost, existingPrice.selling_price, newPrice);
        }
        db.prepare(`
          UPDATE product_prices
          SET purchase_cost = ?, selling_price = ?, min_selling_price = ?
          WHERE model_id = ?
        `).run(newCost, newPrice, newMin, modelId);
      } else {
        db.prepare(`
          INSERT INTO product_prices (id, product_id, model_id, purchase_cost, selling_price, min_selling_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('prc_' + modelId, product_id, modelId, newCost, newPrice, newMin);
      }

      // Save additional dynamic specs if provided
      if (typeof specs === 'object' && specs !== null) {
        const insertSpec = db.prepare(`
          INSERT INTO model_specifications (id, model_id, spec_key, spec_value, unit)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(model_id, spec_key) DO UPDATE SET spec_value = excluded.spec_value, unit = excluded.unit
        `);
        for (const [key, val] of Object.entries(specs)) {
          if (val !== undefined && val !== null && String(val).trim()) {
            insertSpec.run('spec_' + modelId + '_' + key, modelId, key, String(val).trim(), '');
          }
        }
      }
    });

    logAudit('admin', 'save', 'product_model', modelId, { model_number });
    res.json({ success: true, id: modelId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/models/:id', (req, res) => {
  try {
    const { id } = req.params;
    // Check if referenced in installed equipment or sales
    const eqCount = db.prepare('SELECT COUNT(*) as count FROM installed_equipment WHERE model_id = ?').get(id).count;
    if (eqCount > 0) {
      return res.status(400).json({ error: `Cannot delete: Model is linked to ${eqCount} installed equipment record(s). Deactivate it instead.` });
    }
    db.prepare('DELETE FROM product_models WHERE id = ?').run(id);
    logAudit('admin', 'delete', 'product_model', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. WAREHOUSES & VAN LOCATIONS
// ==========================================
router.get('/warehouses', (req, res) => {
  try {
    const warehouses = db.prepare(`
      SELECT w.*, u.full_name as assigned_user_name
      FROM warehouses w
      LEFT JOIN users u ON w.assigned_user_id = u.id
      ORDER BY w.type ASC, w.name ASC
    `).all();
    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/warehouses', (req, res) => {
  try {
    const { id, code, name, type = 'warehouse', assigned_user_id, address, is_active = 1 } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'Warehouse code is required (e.g. WH-1, VAN-01)' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Warehouse name is required' });

    const whId = id || 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    db.prepare(`
      INSERT INTO warehouses (id, code, name, type, assigned_user_id, address, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        name = excluded.name,
        type = excluded.type,
        assigned_user_id = excluded.assigned_user_id,
        address = excluded.address,
        is_active = excluded.is_active
    `).run(whId, code.trim().toUpperCase(), name.trim(), type, assigned_user_id || null, address || '', is_active ? 1 : 0);

    logAudit('admin', 'save', 'warehouse', whId, { code, name, type });
    res.json({ success: true, id: whId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. CHARGE ITEMS (Labour, Transport, etc.)
// ==========================================
router.get('/charges', (req, res) => {
  try {
    const charges = db.prepare('SELECT * FROM charge_items ORDER BY name ASC').all();
    res.json(charges);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/charges', (req, res) => {
  try {
    const { id, name, charge_type = 'labour', default_rate = 0, tax_percent = 18.0, hsn_sac = '9987', is_active = 1 } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Charge name is required' });

    const chargeId = id || 'chg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    db.prepare(`
      INSERT INTO charge_items (id, name, charge_type, default_rate, tax_percent, hsn_sac, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        charge_type = excluded.charge_type,
        default_rate = excluded.default_rate,
        tax_percent = excluded.tax_percent,
        hsn_sac = excluded.hsn_sac,
        is_active = excluded.is_active
    `).run(chargeId, name.trim(), charge_type, Number(default_rate) || 0, Number(tax_percent) || 0, hsn_sac || '9987', is_active ? 1 : 0);

    logAudit('admin', 'save', 'charge_item', chargeId, { name, default_rate });
    res.json({ success: true, id: chargeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. PRICE AUDIT LOG
// ==========================================
router.get('/price-history', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT pch.*, p.name as product_name, m.model_number
      FROM price_change_history pch
      JOIN products p ON pch.product_id = p.id
      LEFT JOIN product_models m ON pch.model_id = m.id
      ORDER BY pch.changed_at DESC
      LIMIT 100
    `).all();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
