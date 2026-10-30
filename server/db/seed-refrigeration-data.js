import { db, runInTransaction } from './index.js';

export function seedRefrigerationData() {
  console.log('[Seed] Seeding Emerson & Daikin technical catalogue data...');

  runInTransaction(() => {
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

    const daikinBrandId = upsertBrand('Daikin', 'Commercial Condensing Units & Air Cooling Units (Evaporators)', 'brd_daikin');
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
    const dkCduProdId = upsertProduct('prod_daikin_cdu', 'Daikin Commercial Condensing Unit', cduCatId, daikinBrandId, 'Set', '84189900', 'Daikin Scroll & Reciprocating Condensing Unit for Cold Rooms');
    const dkEvapProdId = upsertProduct('prod_daikin_evap', 'Daikin Air Cooling Unit (Evaporator)', evapCatId, daikinBrandId, 'Nos', '84189900', 'Daikin Indoor DX Unit Cooler with axial fans');
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
    // 8. DAIKIN COMMERCIAL CONDENSING UNITS (Medium & Low Temp)
    // From Daikin Cold Room Catalogue 2024 (DAIPL-2024/25-24/2/ColdRoom-1A)
    // ---------------------------------------------------------------
    const daikinCdus = [
      // Medium Temp (@ -5°C Te, 38°C Ambient)
      { model: 'CCMR0200ARY16', hp: 2, cap_w: 3978, comp: 'KCM511-CAL', type: 'Reciprocating', temp: 'Medium (0 to 15°C)', refr: 'R404A', liquid: '3/8"', suction: '5/8"', weight: 73, sound: 62 },
      { model: 'CCMR0300ARY16', hp: 3, cap_w: 5805, comp: 'KCM522-CAL', type: 'Reciprocating', temp: 'Medium (0 to 15°C)', refr: 'R404A', liquid: '3/8"', suction: '5/8"', weight: 76, sound: 67 },
      { model: 'CCMS0400ARY16', hp: 4, cap_w: 7805, comp: 'ZB29KQE-TFD', type: 'Scroll', temp: 'Medium (0 to 15°C)', refr: 'R404A', liquid: '1/2"', suction: '7/8"', weight: 94, sound: 71 },
      { model: 'CCMS0600ARY16', hp: 6, cap_w: 10589, comp: 'ZB45KQE-TFD', type: 'Scroll', temp: 'Medium (0 to 15°C)', refr: 'R404A', liquid: '1/2"', suction: '7/8"', weight: 107, sound: 71 },
      { model: 'CCMS0800ARY16', hp: 8, cap_w: 15000, comp: 'ZB58KQE-TFD-550', type: 'Scroll', temp: 'Medium (0 to 15°C)', refr: 'R404A', liquid: '5/8"', suction: '1-1/8"', weight: 167, sound: 73 },
      { model: 'CCMS1000ARY16', hp: 10, cap_w: 20000, comp: 'ZB76KQE-TFD-550', type: 'Scroll', temp: 'Medium (0 to 15°C)', refr: 'R404A', liquid: '5/8"', suction: '1-1/8"', weight: 167, sound: 72 },
      // Low Temp (@ -25°C Te, 38°C Ambient)
      { model: 'CCLR0200ARY16', hp: 2, cap_w: 1914, comp: 'KCM512-LAL', type: 'Reciprocating', temp: 'Low (-25 to -15°C)', refr: 'R404A', liquid: '3/8"', suction: '5/8"', weight: 78, sound: 68 },
      { model: 'CCLR0300ARY16', hp: 3, cap_w: 2510, comp: 'KCM515-LAL', type: 'Reciprocating', temp: 'Low (-25 to -15°C)', refr: 'R404A', liquid: '3/8"', suction: '5/8"', weight: 86, sound: 66 },
      { model: 'CCLS0400ARY16', hp: 4, cap_w: 3816, comp: 'ZF13K4E-TFD', type: 'Scroll', temp: 'Low (-25 to -15°C)', refr: 'R404A', liquid: '1/2"', suction: '7/8"', weight: 108, sound: 71 },
      { model: 'CCLS0600ARY16', hp: 6, cap_w: 5429, comp: 'ZF18K4E-TFD', type: 'Scroll', temp: 'Low (-25 to -15°C)', refr: 'R404A', liquid: '1/2"', suction: '7/8"', weight: 112, sound: 72 },
      { model: 'CCLS0800ARY16', hp: 8, cap_w: 6525, comp: 'ZF25KQE-TFD-550', type: 'Scroll', temp: 'Low (-25 to -15°C)', refr: 'R404A', liquid: '5/8"', suction: '1-1/8"', weight: 133, sound: 72 },
      { model: 'CCLS1000ARY16', hp: 10, cap_w: 8546, comp: 'ZF34KQE-TFD-554', type: 'Scroll', temp: 'Low (-25 to -15°C)', refr: 'R404A', liquid: '5/8"', suction: '1-1/8"', weight: 172, sound: 72 },
    ];

    for (const item of daikinCdus) {
      const capKw = Math.round((item.cap_w / 1000) * 100) / 100;
      const desc = `Daikin ${item.temp.includes('Low') ? 'Low-Temp' : 'Medium-Temp'} ${item.type} CDU ${item.hp} HP (${capKw} kW) with ${item.comp}`;
      const mid = saveModelAndPrice(
        'mod_dk_cdu_' + item.model,
        dkCduProdId, daikinBrandId, item.model,
        desc,
        capKw, 'kW', item.temp.includes('Low') ? -25 : 0, item.temp.includes('Low') ? -15 : 15,
        item.refr, '415V / 3Ph / 50Hz', 'Daikin Cold Room Catalogue 2024', '3'
      );

      insertSpec.run('sp_hp_' + mid, mid, 'horse_power', String(item.hp), 'HP');
      insertSpec.run('sp_comp_' + mid, mid, 'internal_compressor', item.comp, '');
      insertSpec.run('sp_tech_' + mid, mid, 'compressor_type', item.type, '');
      insertSpec.run('sp_cap_w_' + mid, mid, 'cooling_capacity_watts', String(item.cap_w), 'W');
      insertSpec.run('sp_liq_' + mid, mid, 'liquid_line', item.liquid, 'inch');
      insertSpec.run('sp_suc_' + mid, mid, 'suction_line', item.suction, 'inch');
      insertSpec.run('sp_snd_' + mid, mid, 'sound_level', String(item.sound), 'dBA');
      insertSpec.run('sp_wt_' + mid, mid, 'weight', String(item.weight), 'kg');
    }

    // ---------------------------------------------------------------
    // 9. DAIKIN AIR COOLING UNITS (Evaporators)
    // ---------------------------------------------------------------
    const daikinEvaps = [
      // Medium Temp
      { model: 'CRE1M400ASV16', cap_kw: 4.31, temp: 'Medium (0 to 15°C)', airflow: 2350, fans: '350mm x 1', weight: 35 },
      { model: 'CRE2M600ASV16', cap_kw: 6.55, temp: 'Medium (0 to 15°C)', airflow: 4700, fans: '350mm x 2', weight: 52 },
      { model: 'CRE2M800ASV16', cap_kw: 8.94, temp: 'Medium (0 to 15°C)', airflow: 4700, fans: '350mm x 2', weight: 61 },
      { model: 'CRE3M980ASV16', cap_kw: 10.92, temp: 'Medium (0 to 15°C)', airflow: 7050, fans: '350mm x 3', weight: 67 },
      { model: 'CRE3M1400ASV16', cap_kw: 15.75, temp: 'Medium (0 to 15°C)', airflow: 7050, fans: '350mm x 3', weight: 78 },
      { model: 'CRE2M1700ASY16', cap_kw: 18.70, temp: 'Medium (0 to 15°C)', airflow: 17150, fans: '550mm x 2', weight: 119 },
      { model: 'CRE2M2200ASY16', cap_kw: 25.10, temp: 'Medium (0 to 15°C)', airflow: 16700, fans: '550mm x 2', weight: 140 },
      { model: 'CRE2M2800ASY16', cap_kw: 31.20, temp: 'Medium (0 to 15°C)', airflow: 16200, fans: '550mm x 2', weight: 155 },
      // Low Temp
      { model: 'CRE1L200ASV16', cap_kw: 1.99, temp: 'Low (-25 to 5°C)', airflow: 2350, fans: '350mm x 1', weight: 35 },
      { model: 'CRE2L320ASV16', cap_kw: 3.12, temp: 'Low (-25 to 5°C)', airflow: 4700, fans: '350mm x 2', weight: 52 },
      { model: 'CRE2L400ASV16', cap_kw: 3.90, temp: 'Low (-25 to 5°C)', airflow: 4700, fans: '350mm x 2', weight: 61 },
      { model: 'CRE3L480ASV16', cap_kw: 4.67, temp: 'Low (-25 to 5°C)', airflow: 7050, fans: '350mm x 3', weight: 67 },
      { model: 'CRE3L600ASV16', cap_kw: 5.83, temp: 'Low (-25 to 5°C)', airflow: 7050, fans: '350mm x 3', weight: 78 },
      { model: 'CRE2L0900ASY16', cap_kw: 9.00, temp: 'Low (-25 to 5°C)', airflow: 17375, fans: '550mm x 2', weight: 119 },
      { model: 'CRE2L1400ASY16', cap_kw: 13.50, temp: 'Low (-25 to 5°C)', airflow: 16975, fans: '550mm x 2', weight: 140 },
      { model: 'CRE2L1800ASY16', cap_kw: 18.00, temp: 'Low (-25 to 5°C)', airflow: 16550, fans: '550mm x 2', weight: 155 },
    ];

    for (const item of daikinEvaps) {
      const mid = saveModelAndPrice(
        'mod_dk_evap_' + item.model,
        dkEvapProdId, daikinBrandId, item.model,
        `Daikin DX Evaporator Unit (${item.cap_kw} kW)`,
        item.cap_kw, 'kW', item.temp.includes('Low') ? -25 : 0, item.temp.includes('Low') ? 5 : 15,
        'R404A', '230V/1Ph / 415V/3Ph', 'Daikin Cold Room Catalogue 2024', '5'
      );

      insertSpec.run('sp_airflow_' + mid, mid, 'air_flow_m3h', String(item.airflow), 'm3/h');
      insertSpec.run('sp_fans_' + mid, mid, 'fan_specs', item.fans, '');
      insertSpec.run('sp_wt_' + mid, mid, 'weight', String(item.weight), 'kg');
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
