import { db, runInTransaction } from './index.js';

export function seedRefrigerationData() {
  console.log('[Seed] Seeding Emerson technical catalogue data...');

  runInTransaction(() => {
    // 0. Clean up any leftover Daikin models, specs, and products
    db.prepare(`
      DELETE FROM model_specifications WHERE model_id IN (
        SELECT id FROM product_models WHERE brand_id = 'brd_daikin' OR model_number LIKE 'CCM%' OR model_number LIKE 'CCL%' OR model_number LIKE 'CRE%' OR id LIKE 'mod_dk_%'
      )
    `).run();
    db.prepare(`
      DELETE FROM product_prices WHERE model_id IN (
        SELECT id FROM product_models WHERE brand_id = 'brd_daikin' OR model_number LIKE 'CCM%' OR model_number LIKE 'CCL%' OR model_number LIKE 'CRE%' OR id LIKE 'mod_dk_%'
      )
    `).run();
    db.prepare(`
      DELETE FROM product_models WHERE brand_id = 'brd_daikin' OR model_number LIKE 'CCM%' OR model_number LIKE 'CCL%' OR model_number LIKE 'CRE%' OR id LIKE 'mod_dk_%'
    `).run();
    db.prepare("DELETE FROM products WHERE id IN ('prod_daikin_cdu', 'prod_daikin_evap')").run();
    db.prepare("DELETE FROM brands WHERE id = 'brd_daikin' OR name = 'Daikin'").run();

    // 1. Brands
    const upsertBrand = (name, desc, defaultId) => {
      let b = db.prepare('SELECT id FROM brands WHERE name = ?').get(name);
      if (!b) {
        db.prepare('INSERT INTO brands (id, name, description, is_active) VALUES (?, ?, ?, 1)').run(defaultId, name, desc);
        return defaultId;
      }
      db.prepare('UPDATE brands SET description = ? WHERE id = ?').run(desc, b.id);
      return b.id;
    };

    const emersonBrandId = upsertBrand('Emerson', 'Hermetic Reciprocating & Copeland Scroll Condensing Units', 'brd_emerson');
    const dixellBrandId = upsertBrand('Dixell', 'Digital Electronic Controllers (XR02CX, XR06CX, XR30CX, XR70CX)', 'brd_dixell');

    // 2. Categories
    const upsertCategory = (name, desc, defaultId) => {
      let c = db.prepare('SELECT id FROM product_categories WHERE name = ?').get(name);
      if (!c) {
        db.prepare('INSERT INTO product_categories (id, name, description, is_active) VALUES (?, ?, ?, 1)').run(defaultId, name, desc);
        return defaultId;
      }
      db.prepare('UPDATE product_categories SET description = ? WHERE id = ?').run(desc, c.id);
      return c.id;
    };

    const cduCatId = upsertCategory('Condensing Units (Outdoor)', 'Outdoor air-cooled condensing units for chiller & freezer cold rooms', 'cat_cdu');
    const evapCatId = upsertCategory('Air Cooling Units (Evaporators)', 'Indoor DX unit coolers / evaporators for medium & low temperature', 'cat_evap');
    const expValveCatId = upsertCategory('Expansion Valves & Orifices', 'Thermostatic expansion valves (TIE-HW, TIE-SW) and interchangeable orifices', 'cat_exp_valves');
    const solValveCatId = upsertCategory('Solenoid Valves & Coils', 'Refrigerant solenoid valves (200RB series) and ASC3 electrical coils', 'cat_sol_valves');
    const ctrlCatId = upsertCategory('Digital Temperature Controllers', 'Dixell microprocessor controllers with defrost and optional BMS/RS485', 'cat_controllers');
    const bmcCatId = upsertCategory('Bulk Milk Chillers', 'Direct expansion milk cooling systems with agitator and condensing units', 'cat_bmc');

    // 3. Base Products
    const upsertProduct = (id, name, catId, brandId, unit, hsn, desc) => {
      let p = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
      if (!p) {
        db.prepare(`
          INSERT INTO products (id, name, category_id, brand_id, unit, hsn_sac, tax_percent, product_type, track_inventory, min_reorder_qty, description)
          VALUES (?, ?, ?, ?, ?, ?, 18.0, 'goods', 1, 2, ?)
        `).run(id, name, catId, brandId, unit, hsn, desc);
        return id;
      }
      db.prepare(`
        UPDATE products SET name = ?, category_id = ?, brand_id = ?, unit = ?, hsn_sac = ?, description = ?
        WHERE id = ?
      `).run(name, catId, brandId, unit, hsn, desc, id);
      return id;
    };

    const emCduProdId = upsertProduct('prod_emerson_cdu', 'Emerson Cold Room Condensing Unit', cduCatId, emersonBrandId, 'Set', '84189900', 'Emerson Air-Cooled Condensing Unit for Chiller & Freezer Rooms');
    const commEvapProdId = upsertProduct('prod_comm_evap', 'Commercial Air Cooling Unit (Evaporator)', evapCatId, emersonBrandId, 'Nos', '84189900', 'Indoor DX Unit Cooler with axial fans');
    const bmcProdId = upsertProduct('prod_emerson_bmc', 'Emerson Bulk Milk Chiller Unit', bmcCatId, emersonBrandId, 'Set', '84186990', 'Dedicated BMC refrigeration unit with agitator control');

    const insertPrice = db.prepare(`
      INSERT INTO product_prices (id, product_id, model_id, purchase_cost, selling_price, min_selling_price)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET selling_price = excluded.selling_price
    `);

    const insertSpec = db.prepare(`
      INSERT INTO model_specifications (id, model_id, spec_key, spec_value, unit)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(model_id, spec_key) DO UPDATE SET spec_value = excluded.spec_value
    `);

    // Helper to reliably insert/update model + price without FK collisions
    const saveModelAndPrice = (id, prodId, brandId, modelNum, desc, cap, unit, tMin, tMax, refr, volt, catRef, catPage) => {
      const existing = db.prepare('SELECT id FROM product_models WHERE brand_id = ? AND model_number = ?').get(brandId, modelNum);
      const actualId = existing ? existing.id : id;
      if (!existing) {
        db.prepare(`
          INSERT INTO product_models (
            id, product_id, brand_id, model_number, description,
            capacity, capacity_unit, temp_range_min, temp_range_max,
            refrigerant, voltage_phase, catalogue_ref, catalogue_page, verification_status, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 1)
        `).run(actualId, prodId, brandId, modelNum, desc, cap, unit, tMin, tMax, refr, volt, catRef, catPage);
      } else {
        db.prepare(`
          UPDATE product_models SET
            product_id = ?, description = ?, capacity = ?, capacity_unit = ?, temp_range_min = ?, temp_range_max = ?,
            refrigerant = ?, voltage_phase = ?, catalogue_ref = ?, catalogue_page = ?
          WHERE id = ?
        `).run(prodId, desc, cap, unit, tMin, tMax, refr, volt, catRef, catPage, actualId);
      }
      insertPrice.run('prc_' + actualId, prodId, actualId, 0, 0, 0);
      return actualId;
    };

    // ---------------------------------------------------------------
    // 4. EMERSON READY RECKONER 1: Chiller (+4°C, R22, Recip)
    // ---------------------------------------------------------------
    const emersonRr1 = [
      { model: 'KHJ513PQE', cap: 2.4, size_m: '1.8*3.0*2.4', size_ft: '6*10*8', vol_m3: 13.6, vol_ft3: 480, load_kw: 2.2, valve: 'TIE-HW', orifice: 'TIO-001', sol: '200RB 2T3T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR522PQE', cap: 3.5, size_m: '2.4*3.7*2.4', size_ft: '8*12*8', vol_m3: 21.8, vol_ft3: 768, load_kw: 3.0, valve: 'TIE-HW', orifice: 'TIO-001', sol: '200RB 2T3T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR530PQE', cap: 4.6, size_m: '4.3*4.3*2.4', size_ft: '14*14*8', vol_m3: 44.4, vol_ft3: 1568, load_kw: 5.1, valve: 'TIE-HW', orifice: 'TIO-002', sol: '200RB 2T3T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR536PQE', cap: 5.8, size_m: '4.3*4.9*2.4', size_ft: '14*16*8', vol_m3: 50.8, vol_ft3: 1792, load_kw: 6.0, valve: 'TIE-HW', orifice: 'TIO-002', sol: '200RB 2T3T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR542PQE', cap: 6.6, size_m: '4.9*4.9*2.4', size_ft: '16*16*8', vol_m3: 58.0, vol_ft3: 2048, load_kw: 7.1, valve: 'TIE-HW', orifice: 'TIO-003', sol: '200RB 3T4T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR553PQE', cap: 9.4, size_m: '4.9*6.1*2.4', size_ft: '16*20*8', vol_m3: 72.5, vol_ft3: 2560, load_kw: 7.7, valve: 'TIE-HW', orifice: 'TIO-003', sol: '200RB 3T4T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR562PQE', cap: 10.8, size_m: '6.1*7.3*2.4', size_ft: '20*24*8', vol_m3: 108.8, vol_ft3: 3840, load_kw: 10.6, valve: 'TIE-HW', orifice: 'TIO-004', sol: '200RB 3T4T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
      { model: 'KHR572PQE', cap: 11.7, size_m: '6.1*7.9*2.4', size_ft: '20*26*8', vol_m3: 117.8, vol_ft3: 4160, load_kw: 11.5, valve: 'TIE-HW', orifice: 'TIO-004', sol: '200RB 3T4T', coil: 'ASC3 208VAC', ctrl: 'XR02CX' },
    ];

    for (const item of emersonRr1) {
      const mid = saveModelAndPrice(
        'mod_em_r22_' + item.model,
        emCduProdId, emersonBrandId, item.model,
        `Emerson Hermetic Reciprocating CDU for Chiller (${item.cap} kW @ +4°C)`,
        item.cap, 'kW', 2.0, 8.0, 'R22', '415V / 3Ph / 50Hz',
        'Emerson Ready Reckoner 1', '1'
      );

      insertSpec.run('sp_sz_m_' + mid, mid, 'room_size_m', item.size_m, 'm');
      insertSpec.run('sp_sz_ft_' + mid, mid, 'room_size_ft', item.size_ft, 'ft');
      insertSpec.run('sp_vol_ft3_' + mid, mid, 'room_volume_ft3', String(item.vol_ft3), 'ft3');
      insertSpec.run('sp_load_kw_' + mid, mid, 'cooling_load_kw', String(item.load_kw), 'kW');
      insertSpec.run('sp_valve_' + mid, mid, 'expansion_valve', item.valve, '');
      insertSpec.run('sp_orifice_' + mid, mid, 'expansion_orifice', item.orifice, '');
      insertSpec.run('sp_sol_' + mid, mid, 'solenoid_valve', item.sol, '');
      insertSpec.run('sp_ctrl_' + mid, mid, 'controller', item.ctrl, '');
    }

    // ---------------------------------------------------------------
    // 4b. EMERSON READY RECKONER 2: Chiller (+4°C, R404A, Recip)
    // ---------------------------------------------------------------
    const emersonRr2 = [
      { model: 'KFJ461PQL', cap: 2.1, size_ft: '6*10*8', vol_ft3: 480, load_kw: 2.2, valve: 'TIE-SW', orifice: 'TIO-001', sol: '200RB 2T3T' },
      { model: 'KHM511PQL', cap: 3.7, size_ft: '8*12*8', vol_ft3: 768, load_kw: 3.0, valve: 'TIE-SW', orifice: 'TIO-002', sol: '200RB 2T3T' },
      { model: 'KHM514PQL', cap: 5.0, size_ft: '14*14*8', vol_ft3: 1568, load_kw: 5.1, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'KHM519PQL', cap: 6.0, size_ft: '14*16*8', vol_ft3: 1792, load_kw: 6.0, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'KHM522PQL', cap: 6.8, size_ft: '16*16*8', vol_ft3: 2048, load_kw: 7.1, valve: 'TIE-SW', orifice: 'TIO-004', sol: '200RB 3T4T' },
      { model: 'KHM511PQL * 2', cap: 7.4, size_ft: '16*20*8', vol_ft3: 2560, load_kw: 7.7, valve: 'TIE-SW * 2', orifice: 'TIO-002 * 2', sol: '200RB 2T3T * 2' },
      { model: 'KHM514PQL * 2', cap: 10.0, size_ft: '20*20*8', vol_ft3: 3200, load_kw: 9.1, valve: 'TIE-SW * 2', orifice: 'TIO-003 * 2', sol: '200RB 2T3T * 2' },
      { model: 'KHM519PQL * 2', cap: 12.0, size_ft: '20*26*8', vol_ft3: 4160, load_kw: 11.5, valve: 'TIE-SW * 2', orifice: 'TIO-003 * 2', sol: '200RB 2T3T * 2' },
      { model: 'KHM522PQL * 2', cap: 13.6, size_ft: '20*32*8', vol_ft3: 5120, load_kw: 13.8, valve: 'TIE-SW * 2', orifice: 'TIO-004 * 2', sol: '200RB 3T4T * 2' },
    ];

    for (const item of emersonRr2) {
      const mid = saveModelAndPrice(
        'mod_em_r404a_recip_' + item.model.replace(/[^a-zA-Z0-9]/g, '_'),
        emCduProdId, emersonBrandId, item.model,
        `Emerson Hermetic Reciprocating CDU for Chiller (${item.cap} kW @ +4°C, R404A)`,
        item.cap, 'kW', 2.0, 8.0, 'R404A', '415V / 3Ph / 50Hz',
        'Emerson Ready Reckoner 2', '2'
      );

      insertSpec.run('sp_sz_ft_' + mid, mid, 'room_size_ft', item.size_ft, 'ft');
      insertSpec.run('sp_vol_ft3_' + mid, mid, 'room_volume_ft3', String(item.vol_ft3), 'ft3');
      insertSpec.run('sp_load_kw_' + mid, mid, 'cooling_load_kw', String(item.load_kw), 'kW');
      insertSpec.run('sp_valve_' + mid, mid, 'expansion_valve', item.valve, '');
      insertSpec.run('sp_orifice_' + mid, mid, 'expansion_orifice', item.orifice, '');
      insertSpec.run('sp_sol_' + mid, mid, 'solenoid_valve', item.sol, '');
      insertSpec.run('sp_ctrl_' + mid, mid, 'controller', 'XR02CX', '');
    }

    // ---------------------------------------------------------------
    // 5. EMERSON READY RECKONER 3: Chiller (+4°C, R404A, Scroll)
    // ---------------------------------------------------------------
    const emersonRr3 = [
      { model: 'KHZ515PQL', cap: 3.8, size_ft: '8*12*8', vol_ft3: 768, load_kw: 3.0, valve: 'TIE-SW', orifice: 'TIO-002', sol: '200RB 2T3T' },
      { model: 'KHZ519PQL', cap: 4.9, size_ft: '14*14*8', vol_ft3: 1568, load_kw: 5.1, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'KHZ521PQL', cap: 6.2, size_ft: '14*16*8', vol_ft3: 1792, load_kw: 6.0, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'KHZ526PQL', cap: 7.0, size_ft: '16*16*8', vol_ft3: 2048, load_kw: 7.1, valve: 'TIE-SW', orifice: 'TIO-004', sol: '200RB 3T4T' },
      { model: 'KHZ529PQL', cap: 8.2, size_ft: '16*20*8', vol_ft3: 2560, load_kw: 7.7, valve: 'TIE-SW', orifice: 'TIO-004', sol: '200RB 3T4T' },
      { model: 'KHZ538PQL', cap: 10.3, size_ft: '20*20*8', vol_ft3: 3200, load_kw: 9.1, valve: 'TIE-SW', orifice: 'TIO-005', sol: '200RB 3T4T' },
      { model: 'KHZ545PQL', cap: 12.0, size_ft: '20*26*8', vol_ft3: 4160, load_kw: 11.5, valve: 'TIE-SW', orifice: 'TIO-005', sol: '200RB 3T4T' },
      { model: 'KHZ548PQL', cap: 13.6, size_ft: '20*32*8', vol_ft3: 5120, load_kw: 13.8, valve: 'TIE-SW', orifice: 'TIO-006', sol: '200RB 3T4T' },
      { model: 'KHZ566PQL', cap: 17.8, size_ft: '24*24*12', vol_ft3: 6912, load_kw: 17.3, valve: 'TCLE 150-SW', orifice: 'X22440-B6B', sol: '200RB 6T5T' },
      { model: 'KHZ576PQL', cap: 20.7, size_ft: '24*28*12', vol_ft3: 8064, load_kw: 19.9, valve: 'TCLE 150-SW', orifice: 'X22440-B6B', sol: '200RB 6T5T' },
      { model: 'KHZ595PAL', cap: 24.0, size_ft: '24*34*12', vol_ft3: 9792, load_kw: 24.5, valve: 'TCLE 150-SW', orifice: 'X22440-B7B', sol: '200RB 6T5T' },
      { model: 'KHZ611PAL', cap: 31.9, size_ft: '34*40*12', vol_ft3: 16320, load_kw: 31.6, valve: 'TCLE 150-SW', orifice: 'X22440-B8B', sol: '200RB 7T7T' },
    ];

    for (const item of emersonRr3) {
      const mid = saveModelAndPrice(
        'mod_em_scroll_' + item.model,
        emCduProdId, emersonBrandId, item.model,
        `Emerson Copeland Scroll CDU for Chiller (${item.cap} kW @ +4°C)`,
        item.cap, 'kW', 2.0, 8.0, 'R404A', '415V / 3Ph / 50Hz',
        'Emerson Ready Reckoner 3', '3'
      );

      insertSpec.run('sp_sz_ft_' + mid, mid, 'room_size_ft', item.size_ft, 'ft');
      insertSpec.run('sp_vol_ft3_' + mid, mid, 'room_volume_ft3', String(item.vol_ft3), 'ft3');
      insertSpec.run('sp_load_kw_' + mid, mid, 'cooling_load_kw', String(item.load_kw), 'kW');
      insertSpec.run('sp_valve_' + mid, mid, 'expansion_valve', item.valve, '');
      insertSpec.run('sp_orifice_' + mid, mid, 'expansion_orifice', item.orifice, '');
      insertSpec.run('sp_sol_' + mid, mid, 'solenoid_valve', item.sol, '');
    }

    // ---------------------------------------------------------------
    // 6. EMERSON READY RECKONER 4: Freezer (-20°C, R404A, ZXL Scroll)
    // ---------------------------------------------------------------
    const emersonRr4 = [
      { model: 'ZXL020E', cap: 2.0, size_ft: '6*6*8', vol_ft3: 288, load_kw: 1.7, valve: 'TIE-SW', orifice: 'TIO-002', sol: '200RB 2T3T' },
      { model: 'ZXL025E', cap: 2.7, size_ft: '8*10*8', vol_ft3: 640, load_kw: 2.7, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'ZXL030E', cap: 3.0, size_ft: '10*10*8', vol_ft3: 800, load_kw: 2.9, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'ZXL035E', cap: 4.2, size_ft: '12*14*8', vol_ft3: 1344, load_kw: 3.8, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'ZXL040E', cap: 4.9, size_ft: '12*20*8', vol_ft3: 1920, load_kw: 4.9, valve: 'TIE-SW', orifice: 'TIO-004', sol: '200RB 2T3T' },
      { model: 'ZXL050E', cap: 5.7, size_ft: '14*20*8', vol_ft3: 2240, load_kw: 5.8, valve: 'TIE-SW', orifice: 'TIO-004', sol: '200RB 2T3T' },
      { model: 'ZXL060E', cap: 6.8, size_ft: '18*20*8', vol_ft3: 2880, load_kw: 6.9, valve: 'TIE-SW', orifice: 'TIO-005', sol: '200RB 3T4T' },
      { model: 'ZXL075E', cap: 7.6, size_ft: '20*20*8', vol_ft3: 3200, load_kw: 7.5, valve: 'TIE-SW', orifice: 'TIO-005', sol: '200RB 3T4T' },
      // Dual Units
      { model: 'ZXL035E * 2', cap: 8.4, size_ft: '20*24*8', vol_ft3: 3840, load_kw: 8.5, valve: 'TIE-SW * 2', orifice: 'TIO-003 * 2', sol: '200RB 2T3T * 2' },
      { model: 'ZXL040E * 2', cap: 9.8, size_ft: '24*24*8', vol_ft3: 4608, load_kw: 9.9, valve: 'TIE-SW * 2', orifice: 'TIO-004 * 2', sol: '200RB 2T3T * 2' },
      { model: 'ZXL050E * 2', cap: 11.4, size_ft: '20*32*8', vol_ft3: 5120, load_kw: 11.3, valve: 'TIE-SW * 2', orifice: 'TIO-004 * 2', sol: '200RB 2T3T * 2' },
      { model: 'ZXL060E * 2', cap: 13.6, size_ft: '20*40*8', vol_ft3: 6400, load_kw: 13.5, valve: 'TIE-SW * 2', orifice: 'TIO-005 * 2', sol: '200RB 3T4T * 2' },
      { model: 'ZXL075E * 2', cap: 15.2, size_ft: '24*40*8', vol_ft3: 7680, load_kw: 15.4, valve: 'TIE-SW * 2', orifice: 'TIO-005 * 2', sol: '200RB 3T4T * 2' },
    ];

    for (const item of emersonRr4) {
      const mid = saveModelAndPrice(
        'mod_em_zxl_' + item.model.replace(/[^a-zA-Z0-9]/g, '_'),
        emCduProdId, emersonBrandId, item.model,
        `Emerson Copeland ZXL Scroll CDU for Freezer (${item.cap} kW @ -20°C)`,
        item.cap, 'kW', -25.0, -18.0, 'R404A', '415V / 3Ph / 50Hz',
        'Emerson Ready Reckoner 4', '4'
      );

      insertSpec.run('sp_sz_ft_' + mid, mid, 'room_size_ft', item.size_ft, 'ft');
      insertSpec.run('sp_vol_ft3_' + mid, mid, 'room_volume_ft3', String(item.vol_ft3), 'ft3');
      insertSpec.run('sp_load_kw_' + mid, mid, 'cooling_load_kw', String(item.load_kw), 'kW');
      insertSpec.run('sp_valve_' + mid, mid, 'expansion_valve', item.valve, '');
      insertSpec.run('sp_orifice_' + mid, mid, 'expansion_orifice', item.orifice, '');
      insertSpec.run('sp_ctrl_' + mid, mid, 'controller', 'XR06CX', '');
    }

    // ---------------------------------------------------------------
    // 6b. EMERSON READY RECKONER 5: Freezer (-20°C, R404A, Recip CDU)
    // ---------------------------------------------------------------
    const emersonRr5 = [
      { model: 'KHM475LQL', cap: 1.6, size_ft: '6*4*8', vol_ft3: 192, load_kw: 1.5, valve: 'TIE-SW', orifice: 'TIO-002', sol: '200RB 2T3T' },
      { model: 'KHM515LQL', cap: 2.8, size_ft: '8*10*8', vol_ft3: 640, load_kw: 2.7, valve: 'TIE-SW', orifice: 'TIO-003', sol: '200RB 2T3T' },
      { model: 'KHM515LQL * 2', cap: 5.6, size_ft: '14*16*8', vol_ft3: 1792, load_kw: 4.8, valve: 'TIE-SW * 2', orifice: 'TIO-003 * 2', sol: '200RB 2T3T * 2' },
      { model: 'KHM515LQL * 2 (Large)', cap: 5.6, size_ft: '14*20*8', vol_ft3: 2240, load_kw: 5.8, valve: 'TIE-SW * 2', orifice: 'TIO-003 * 2', sol: '200RB 2T3T * 2' },
    ];

    for (const item of emersonRr5) {
      const mid = saveModelAndPrice(
        'mod_em_recip_freezer_' + item.model.replace(/[^a-zA-Z0-9]/g, '_'),
        emCduProdId, emersonBrandId, item.model,
        `Emerson Hermetic Reciprocating CDU for Freezer (${item.cap} kW @ -20°C, R404A)`,
        item.cap, 'kW', -25.0, -18.0, 'R404A', '415V / 3Ph / 50Hz',
        'Emerson Ready Reckoner 5', '5'
      );

      insertSpec.run('sp_sz_ft_' + mid, mid, 'room_size_ft', item.size_ft, 'ft');
      insertSpec.run('sp_vol_ft3_' + mid, mid, 'room_volume_ft3', String(item.vol_ft3), 'ft3');
      insertSpec.run('sp_load_kw_' + mid, mid, 'cooling_load_kw', String(item.load_kw), 'kW');
      insertSpec.run('sp_valve_' + mid, mid, 'expansion_valve', item.valve, '');
      insertSpec.run('sp_orifice_' + mid, mid, 'expansion_orifice', item.orifice, '');
      insertSpec.run('sp_ctrl_' + mid, mid, 'controller', 'XR06CX', '');
    }

    // ---------------------------------------------------------------
    // 7. EMERSON READY RECKONER 6: Bulk Milk Chillers
    // ---------------------------------------------------------------
    const emersonBmc = [
      { liters: 500, cap_kw: 3.0, r22: 'KHR522MQE-BX/DX', r404a: 'KHZ515MQL-BX/DX' },
      { liters: 1000, cap_kw: 5.9, r22: 'KHR536MQE-BX/DX', r404a: 'KHZ521MQL-BX/DX' },
      { liters: 2000, cap_kw: 11.8, r22: 'KHR536MQE-BX/DX *2 Nos', r404a: 'KHZ521MQL-BX/DX *2Nos' },
      { liters: 3000, cap_kw: 17.8, r22: 'KHR553MQE-DX *2Nos', r404a: 'KHZ538MQL-DX *2Nos' },
      { liters: 4000, cap_kw: 23.2, r22: 'KHR572MAE-DX *2Nos', r404a: 'KHZ545MAL-DX *2Nos' },
      { liters: 5000, cap_kw: 29.6, r22: '---', r404a: 'KHZ548MAL-DX *2Nos' },
    ];

    for (const item of emersonBmc) {
      if (item.r404a && item.r404a !== '---') {
        const mid = saveModelAndPrice(
          'mod_bmc_r404a_' + item.liters + 'L',
          bmcProdId, emersonBrandId, item.r404a,
          `Bulk Milk Chiller Unit for ${item.liters} Liters (${item.cap_kw} kW, R404A)`,
          item.cap_kw, 'kW', 2.0, 4.0, 'R404A', '415V / 3Ph / 50Hz',
          'Emerson Ready Reckoner 6', '6'
        );
        insertSpec.run('sp_liters_' + mid, mid, 'milk_volume_liters', String(item.liters), 'L');
      }
      if (item.r22 && item.r22 !== '---') {
        const mid = saveModelAndPrice(
          'mod_bmc_r22_' + item.liters + 'L',
          bmcProdId, emersonBrandId, item.r22,
          `Bulk Milk Chiller Unit for ${item.liters} Liters (${item.cap_kw} kW, R22)`,
          item.cap_kw, 'kW', 2.0, 4.0, 'R22', '415V / 3Ph / 50Hz',
          'Emerson Ready Reckoner 6', '6'
        );
        insertSpec.run('sp_liters_' + mid, mid, 'milk_volume_liters', String(item.liters), 'L');
      }
    }

    // ---------------------------------------------------------------
    // 8. COMMERCIAL AIR COOLING UNITS (DX Evaporators / ACU)
    // ---------------------------------------------------------------
    const commEvaps = [
      // High / Medium Temp Chiller Evaporators (0°C to +10°C)
      { model: 'EM-ACU-040M', cap_kw: 4.0, temp: 'Medium Temp (+2°C to +10°C)', t_min: 0, t_max: 10, airflow: 2350, fans: '350mm × 1 Fan', defrost: 'Air / Electric Defrost', weight: 35 },
      { model: 'EM-ACU-080M', cap_kw: 8.0, temp: 'Medium Temp (0°C to +10°C)', t_min: 0, t_max: 10, airflow: 4700, fans: '350mm × 2 Fans', defrost: 'Electric / Air Defrost', weight: 58 },
      { model: 'EM-ACU-120M', cap_kw: 12.0, temp: 'Medium Temp (-5°C to +5°C)', t_min: -5, t_max: 5, airflow: 8500, fans: '400mm × 2 Fans', defrost: 'Electric Defrost Standard', weight: 85 },
      { model: 'EM-ACU-180M', cap_kw: 18.0, temp: 'Medium Temp (-5°C to +5°C)', t_min: -5, t_max: 5, airflow: 14200, fans: '500mm × 2 Fans', defrost: 'Electric Defrost Standard', weight: 120 },
      { model: 'EM-ACU-250M', cap_kw: 25.0, temp: 'Medium Temp (-5°C to +5°C)', t_min: -5, t_max: 5, airflow: 18500, fans: '500mm × 3 Fans', defrost: 'Electric Defrost Standard', weight: 165 },
      // Low Temp Freezer Evaporators (-18°C to -25°C)
      { model: 'EM-ACU-030L', cap_kw: 3.0, temp: 'Low Temp Freezer (-18°C to -25°C)', t_min: -25, t_max: -18, airflow: 2800, fans: '350mm × 1 Fan', defrost: 'Electric Defrost Elements Built-in', weight: 48 },
      { model: 'EM-ACU-060L', cap_kw: 6.0, temp: 'Low Temp Freezer (-18°C to -25°C)', t_min: -25, t_max: -18, airflow: 6800, fans: '450mm × 2 Fans', defrost: 'Electric Defrost Elements Built-in', weight: 75 },
      { model: 'EM-ACU-100L', cap_kw: 10.0, temp: 'Deep Freeze (-20°C to -30°C)', t_min: -30, t_max: -20, airflow: 11000, fans: '450mm × 3 Fans', defrost: 'Heavy-Duty Electric Defrost', weight: 115 },
      { model: 'EM-ACU-150L', cap_kw: 15.0, temp: 'Deep Freeze (-20°C to -30°C)', t_min: -30, t_max: -20, airflow: 15500, fans: '500mm × 3 Fans', defrost: 'Heavy-Duty Electric Defrost', weight: 155 },
      { model: 'EM-ACU-200L', cap_kw: 20.0, temp: 'Deep Freeze (-20°C to -30°C)', t_min: -30, t_max: -20, airflow: 21000, fans: '500mm × 4 Fans', defrost: 'Heavy-Duty Electric Defrost', weight: 195 },
    ];

    for (const item of commEvaps) {
      const mid = saveModelAndPrice(
        'mod_acu_' + item.model,
        commEvapProdId, emersonBrandId, item.model,
        `Commercial DX Air Cooling Evaporator (${item.cap_kw} kW) - ${item.defrost}`,
        item.cap_kw, 'kW', item.t_min, item.t_max,
        'R404A / R22', '230V/1Ph / 415V/3Ph', 'Commercial Refrigeration Spec', '1'
      );

      insertSpec.run('sp_airflow_' + mid, mid, 'air_flow_m3h', String(item.airflow), 'm3/h');
      insertSpec.run('sp_fans_' + mid, mid, 'fan_specs', item.fans, '');
      insertSpec.run('sp_defrost_' + mid, mid, 'defrost_type', item.defrost, '');
      insertSpec.run('sp_wt_' + mid, mid, 'weight', String(item.weight), 'kg');
    }

    // ---------------------------------------------------------------
    // 9.5 ASHRAE / USDA THERMAL PROPERTIES DATABASE (16 COMMODITIES)
    // ---------------------------------------------------------------
    const thermalCommodities = [
      { id: 'com_apple', name: 'Apple (Seb)', category: 'Fruits', min_t: 0, max_t: 2, freeze_t: -1.5, cp_above: 3.64, latent: 280, cp_below: 1.90, resp_rate: 12.0 },
      { id: 'com_banana_green', name: 'Banana (Green/Raw)', category: 'Fruits', min_t: 13, max_t: 14, freeze_t: -0.8, cp_above: 3.35, latent: 250, cp_below: 1.76, resp_rate: 40.0 },
      { id: 'com_banana_ripe', name: 'Banana (Ripe)', category: 'Fruits', min_t: 13, max_t: 15, freeze_t: -1.5, cp_above: 3.35, latent: 250, cp_below: 1.76, resp_rate: 75.0 },
      { id: 'com_grapes', name: 'Grapes (Angoor)', category: 'Fruits', min_t: -1, max_t: 0, freeze_t: -2.0, cp_above: 3.60, latent: 275, cp_below: 1.88, resp_rate: 10.0 },
      { id: 'com_mango', name: 'Mango (Aam)', category: 'Fruits', min_t: 10, max_t: 13, freeze_t: -1.4, cp_above: 3.56, latent: 275, cp_below: 1.86, resp_rate: 50.0 },
      { id: 'com_orange', name: 'Orange / Citrus', category: 'Fruits', min_t: 4, max_t: 7, freeze_t: -1.4, cp_above: 3.77, latent: 290, cp_below: 1.95, resp_rate: 15.0 },
      { id: 'com_potato_table', name: 'Potato (Table Use)', category: 'Vegetables', min_t: 8, max_t: 10, freeze_t: -0.8, cp_above: 3.43, latent: 260, cp_below: 1.80, resp_rate: 16.0 },
      { id: 'com_potato_seed', name: 'Potato (Processing/Seed)', category: 'Vegetables', min_t: 4, max_t: 8, freeze_t: -0.8, cp_above: 3.43, latent: 260, cp_below: 1.80, resp_rate: 20.0 },
      { id: 'com_onion', name: 'Onion (Pyaz)', category: 'Vegetables', min_t: 0, max_t: 2, freeze_t: -1.2, cp_above: 3.77, latent: 295, cp_below: 1.95, resp_rate: 8.5 },
      { id: 'com_tomato', name: 'Tomato (Ripe)', category: 'Vegetables', min_t: 8, max_t: 10, freeze_t: -0.6, cp_above: 3.98, latent: 315, cp_below: 2.05, resp_rate: 28.0 },
      { id: 'com_green_peas', name: 'Green Peas (Matar)', category: 'Vegetables', min_t: 0, max_t: 1, freeze_t: -1.1, cp_above: 3.31, latent: 245, cp_below: 1.76, resp_rate: 65.0 },
      { id: 'com_fresh_milk', name: 'Whole Fresh Milk', category: 'Dairy', min_t: 2, max_t: 4, freeze_t: -0.5, cp_above: 3.93, latent: 290, cp_below: 2.00, resp_rate: 0.0 },
      { id: 'com_butter_ghee', name: 'Butter / Ghee Block', category: 'Dairy', min_t: -18, max_t: 4, freeze_t: -1.0, cp_above: 2.05, latent: 50, cp_below: 1.42, resp_rate: 0.0 },
      { id: 'com_ice_cream', name: 'Ice Cream (Hardened)', category: 'Ice Cream', min_t: -25, max_t: -23, freeze_t: -2.8, cp_above: 3.20, latent: 210, cp_below: 1.85, resp_rate: 0.0 },
      { id: 'com_frozen_chicken', name: 'Frozen Chicken', category: 'Meat & Poultry', min_t: -20, max_t: -18, freeze_t: -2.8, cp_above: 3.31, latent: 247, cp_below: 1.76, resp_rate: 0.0 },
      { id: 'com_fish', name: 'Fresh / Frozen Fish', category: 'Meat & Poultry', min_t: -22, max_t: -18, freeze_t: -2.2, cp_above: 3.60, latent: 275, cp_below: 1.88, resp_rate: 0.0 },
    ];

    const insertCommodity = db.prepare(`
      INSERT INTO thermal_commodities (
        id, name, category, storage_temp_min, storage_temp_max,
        freezing_point_c, cp_above, latent_heat, cp_below, respiration_rate_mw_kg, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        storage_temp_min = excluded.storage_temp_min,
        storage_temp_max = excluded.storage_temp_max,
        freezing_point_c = excluded.freezing_point_c,
        cp_above = excluded.cp_above,
        latent_heat = excluded.latent_heat,
        cp_below = excluded.cp_below,
        respiration_rate_mw_kg = excluded.respiration_rate_mw_kg
    `);

    for (const c of thermalCommodities) {
      insertCommodity.run(c.id, c.name, c.category, c.min_t, c.max_t, c.freeze_t, c.cp_above, c.latent, c.cp_below, c.resp_rate);
    }

    // 10. Store Service Completion Template defaults
    const serviceCertTemplate = {
      dealerTitle: 'Authorized Service Dealer for: DAIKIN AIR-CONDITIONING PVT. LTD.',
      claimCauses: ['Manufacturing', 'Installation', 'Operational', 'Others'],
      ratingQuestions: [
        'How is the behaviour of visited Engineer?',
        'What is the level of your SATISFACTION with the service provided?',
        'How clear was the explanation given by the Engineer regarding the fault and rectification?'
      ]
    };
    db.prepare(`
      INSERT INTO business_settings (key, value, updated_at)
      VALUES ('service_completion_certificate_template', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(serviceCertTemplate));
  });

  console.log('[Seed] Seeding completed successfully!');
}

// Run standalone if invoked directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedRefrigerationData();
}
