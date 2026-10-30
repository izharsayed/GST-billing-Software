import { db } from '../db/index.js';

/**
 * Cold Room Sizing & Model Recommendation Engine
 * Based strictly on Emerson Ready Reckoner tables & Daikin Cold Room Catalogue 2024.
 */

export function recommendColdRoomEquipment({
  application = 'chiller', // 'chiller' | 'freezer' | 'bmc'
  length = 10,
  width = 12,
  height = 8,
  unit = 'ft', // 'ft' | 'm'
  targetTemp = null, // in °C
  ambientTemp = 43, // in °C
  refrigerant = 'R404A', // 'R404A' | 'R22'
  compressorType = 'scroll', // 'scroll' | 'reciprocating' | 'any'
  brand = 'any', // 'Emerson' | 'Daikin' | 'any'
  dailyMilkLiters = 1000, // For BMC
}) {
  // Convert dimensions to both ft and m
  let l_ft, w_ft, h_ft, l_m, w_m, h_m;
  if (unit === 'm') {
    l_m = Number(length);
    w_m = Number(width);
    h_m = Number(height);
    l_ft = Math.round(l_m / 0.3048 * 10) / 10;
    w_ft = Math.round(w_m / 0.3048 * 10) / 10;
    h_ft = Math.round(h_m / 0.3048 * 10) / 10;
  } else {
    l_ft = Number(length);
    w_ft = Number(width);
    h_ft = Number(height);
    l_m = Math.round(l_ft * 0.3048 * 10) / 10;
    w_m = Math.round(w_ft * 0.3048 * 10) / 10;
    h_m = Math.round(h_ft * 0.3048 * 10) / 10;
  }

  const vol_ft3 = Math.round(l_ft * w_ft * h_ft);
  const vol_m3 = Math.round(l_m * w_m * h_m * 10) / 10;

  const result = {
    inputs: {
      application,
      dimensions_ft: `${l_ft} x ${w_ft} x ${h_ft} ft`,
      dimensions_m: `${l_m} x ${w_m} x ${h_m} m`,
      volume_ft3: vol_ft3,
      volume_m3: vol_m3,
      targetTemp: targetTemp !== null ? targetTemp : (application === 'freezer' ? -20 : (application === 'bmc' ? 4 : 4)),
      ambientTemp,
      refrigerant,
      compressorType,
      brand,
    },
    requiresTechnicalReview: false,
    reviewReason: null,
    estimatedLoadKw: 0,
    recommendations: {
      cdu: null,
      evaporator: null,
      expansionValve: null,
      orifice: null,
      solenoidValve: null,
      solenoidCoil: null,
      controller: null,
    },
    catalogueSource: '',
    cataloguePage: '',
    designAssumptions: [],
    compatibleComponents: [],
  };

  // -------------------------------------------------------------
  // 1. BULK MILK CHILLER (BMC)
  // -------------------------------------------------------------
  if (application === 'bmc') {
    result.catalogueSource = 'Emerson Ready Reckoner 6';
    result.cataloguePage = '6';
    result.designAssumptions = [
      'Design is based on -1°C evaporating temp & 43°C ambient',
      'Fresh milk entering at +34°C, pull down to +4°C in 3.0 hours',
      '2 batches per day considered',
      'Selection based on 5K evaporator TD',
    ];

    const liters = Number(dailyMilkLiters);
    // Find closest BMC model in DB
    const models = db.prepare(`
      SELECT m.*, b.name as brand_name, p.name as product_name,
             prc.selling_price, prc.purchase_cost
      FROM product_models m
      JOIN brands b ON m.brand_id = b.id
      JOIN products p ON m.product_id = p.id
      LEFT JOIN product_prices prc ON m.id = prc.model_id
      WHERE m.catalogue_ref LIKE '%Reckoner 6%'
      ORDER BY m.capacity ASC
    `).all();

    let matched = null;
    if (liters <= 600) matched = models.find(m => m.model_number.includes('515'));
    else if (liters <= 1200) matched = models.find(m => m.model_number.includes('521'));
    else if (liters <= 2200) matched = models.find(m => m.model_number.includes('521') && m.model_number.includes('*2'));
    else if (liters <= 3200) matched = models.find(m => m.model_number.includes('538'));
    else if (liters <= 4200) matched = models.find(m => m.model_number.includes('545'));
    else if (liters <= 5500) matched = models.find(m => m.model_number.includes('548'));
    else {
      result.requiresTechnicalReview = true;
      result.reviewReason = `Daily milk load (${liters} L) exceeds standard catalogue limit of 5000 Liters.`;
      matched = models[models.length - 1];
    }

    if (matched) {
      result.estimatedLoadKw = matched.capacity;
      result.recommendations.cdu = matched;
      result.recommendations.controller = { model: 'Dixell XR02CX / XR30CX' };
    }
  }

  // -------------------------------------------------------------
  // 2. CHILLER COLD ROOM (+2°C to +8°C, default +4°C)
  // -------------------------------------------------------------
  if (application === 'chiller') {
    result.designAssumptions = [
      'Design is based on 43°C ambient condition',
      '80mm PUF panels considered for walls & ceiling',
      'Fresh product entering temp +30°C, 10% daily turnover',
      'Product pull down time 12 hours, 10% safety factor',
      'Capacity based on 20 hour compressor run time',
      'Selection based on 5K evaporator TD to maintain 90% RH',
    ];

    // Check bounds
    if (vol_ft3 < 200 || vol_ft3 > 25000) {
      result.requiresTechnicalReview = true;
      result.reviewReason = `Room volume (${vol_ft3} cu.ft / ${vol_m3} m³) is outside standard pre-calculated catalogue limits (480 - 16,320 cu.ft). Custom refrigeration engineering calculation recommended.`;
    }

    if (brand === 'Daikin' && compressorType !== 'reciprocating') {
      // DAIKIN SELECTION
      result.catalogueSource = 'Daikin Cold Room Catalogue 2024';
      result.cataloguePage = '3 & 5';

      // Estimate load: approx 0.07 kW per m3 or look up based on volume
      const estKw = Math.max(2.5, Math.min(32, Math.round(vol_m3 * 0.08 * 10) / 10));
      result.estimatedLoadKw = estKw;

      // Find matching Daikin CDU
      const cdu = db.prepare(`
        SELECT m.*, b.name as brand_name, p.name as product_name,
               prc.selling_price, prc.purchase_cost
        FROM product_models m
        JOIN brands b ON m.brand_id = b.id
        JOIN products p ON m.product_id = p.id
        LEFT JOIN product_prices prc ON m.id = prc.model_id
        WHERE b.name = 'Daikin' AND m.temp_range_min >= 0
        ORDER BY ABS((m.capacity * 2.5) - ?) ASC
        LIMIT 1
      `).get(estKw);

      // Find matching Daikin Evaporator
      const evap = db.prepare(`
        SELECT m.*, b.name as brand_name, p.name as product_name,
               prc.selling_price, prc.purchase_cost
        FROM product_models m
        JOIN brands b ON m.brand_id = b.id
        JOIN products p ON m.product_id = p.id
        LEFT JOIN product_prices prc ON m.id = prc.model_id
        WHERE b.name = 'Daikin' AND p.name LIKE '%Evaporator%' AND m.temp_range_min >= 0
        ORDER BY ABS(m.capacity - ?) ASC
        LIMIT 1
      `).get(estKw);

      result.recommendations.cdu = cdu;
      result.recommendations.evaporator = evap;
      result.recommendations.controller = { model: 'Dixell XR02CX' };
    } else {
      // EMERSON SELECTION
    // Choose table: Reckoner 3 (Scroll R404A) if scroll/R404A, else Reckoner 1 (R22) or Reckoner 2 (R404A recip)
    let catRef = 'Ready Reckoner 3';
    let catPage = '3';
    if (refrigerant === 'R22') {
      catRef = 'Ready Reckoner 1';
      catPage = '1';
    } else if (compressorType === 'reciprocating') {
      catRef = 'Ready Reckoner 2';
      catPage = '2';
    }

    result.catalogueSource = `Emerson ${catRef}`;
    result.cataloguePage = catPage;

    // Fetch models for this catalogue ref
    const emModels = db.prepare(`
      SELECT m.*, b.name as brand_name, p.name as product_name,
             prc.selling_price, prc.purchase_cost
      FROM product_models m
      JOIN brands b ON m.brand_id = b.id
      JOIN products p ON m.product_id = p.id
      LEFT JOIN product_prices prc ON m.id = prc.model_id
      WHERE m.catalogue_ref LIKE ?
      ORDER BY m.capacity ASC
    `).all(`%${catRef}%`);

    // Match closest volume specification
    let bestModel = emModels[0];
    let minDiff = Infinity;

    for (const m of emModels) {
      const volSpec = db.prepare(`
        SELECT spec_value FROM model_specifications
        WHERE model_id = ? AND spec_key = 'room_volume_ft3'
      `).get(m.id);

      if (volSpec) {
        const specVol = Number(volSpec.spec_value);
        const diff = Math.abs(specVol - vol_ft3);
        if (diff < minDiff) {
          minDiff = diff;
          bestModel = m;
        }
      }
    }

    if (bestModel) {
      result.estimatedLoadKw = bestModel.capacity;
      result.recommendations.cdu = bestModel;

      // Fetch matched expansion valve, orifice, solenoid, controller from specs
      const specs = db.prepare(`
        SELECT spec_key, spec_value FROM model_specifications WHERE model_id = ?
      `).all(bestModel.id);

      const specMap = Object.fromEntries(specs.map(s => [s.spec_key, s.spec_value]));
      result.recommendations.expansionValve = specMap.expansion_valve || 'TIE-SW';
      result.recommendations.orifice = specMap.expansion_orifice || 'TIO-002';
      result.recommendations.solenoidValve = specMap.solenoid_valve || '200RB 2T3T';
      result.recommendations.solenoidCoil = 'ASC3 208VAC';
      result.recommendations.controller = { model: specMap.controller || 'Dixell XR02CX', bms: 'XR30CX' };

      // Match compatible Daikin Evaporator
      const evap = db.prepare(`
        SELECT m.*, b.name as brand_name, p.name as product_name,
               prc.selling_price, prc.purchase_cost
        FROM product_models m
        JOIN brands b ON m.brand_id = b.id
        JOIN products p ON m.product_id = p.id
        LEFT JOIN product_prices prc ON m.id = prc.model_id
        WHERE p.name LIKE '%Evaporator%' AND m.temp_range_min >= 0
        ORDER BY ABS(m.capacity - ?) ASC
        LIMIT 1
      `).get(bestModel.capacity);

      result.recommendations.evaporator = evap;
    }
  }
}

  // -------------------------------------------------------------
  // 3. FREEZER COLD ROOM (-18°C to -25°C, default -20°C)
  // -------------------------------------------------------------
  if (application === 'freezer') {
    result.designAssumptions = [
      'Design is based on 43°C ambient condition',
      '100mm PUF panels considered for walls & ceiling',
      'Frozen product entering temp -15°C, 100% storage capacity turn over',
      'Product pull down time 12 hours, 10% safety factor',
      'Capacity based on 18 hour compressor run time',
      'Selection based on 5K evaporator TD',
    ];

    if (vol_ft3 < 150 || vol_ft3 > 12000) {
      result.requiresTechnicalReview = true;
      result.reviewReason = `Freezer room volume (${vol_ft3} cu.ft) is outside standard catalogue tables (288 - 7,680 cu.ft). Custom calculation required.`;
    }

    result.catalogueSource = 'Emerson Ready Reckoner 4 (ZXL Scroll)';
    result.cataloguePage = '4';

    const zxlModels = db.prepare(`
      SELECT m.*, b.name as brand_name, p.name as product_name,
             prc.selling_price, prc.purchase_cost
      FROM product_models m
      JOIN brands b ON m.brand_id = b.id
      JOIN products p ON m.product_id = p.id
      LEFT JOIN product_prices prc ON m.id = prc.model_id
      WHERE m.catalogue_ref LIKE '%Reckoner 4%'
      ORDER BY m.capacity ASC
    `).all();

    let bestModel = zxlModels[0];
    let minDiff = Infinity;

    for (const m of zxlModels) {
      const volSpec = db.prepare(`
        SELECT spec_value FROM model_specifications
        WHERE model_id = ? AND spec_key = 'room_volume_ft3'
      `).get(m.id);

      if (volSpec) {
        const specVol = Number(volSpec.spec_value);
        const diff = Math.abs(specVol - vol_ft3);
        if (diff < minDiff) {
          minDiff = diff;
          bestModel = m;
        }
      }
    }

    if (bestModel) {
      result.estimatedLoadKw = bestModel.capacity;
      result.recommendations.cdu = bestModel;

      const specs = db.prepare(`
        SELECT spec_key, spec_value FROM model_specifications WHERE model_id = ?
      `).all(bestModel.id);

      const specMap = Object.fromEntries(specs.map(s => [s.spec_key, s.spec_value]));
      result.recommendations.expansionValve = specMap.expansion_valve || 'TIE-SW';
      result.recommendations.orifice = specMap.expansion_orifice || 'TIO-003';
      result.recommendations.solenoidValve = specMap.solenoid_valve || '200RB 2T3T';
      result.recommendations.solenoidCoil = 'ASC3 208VAC';
      result.recommendations.controller = { model: 'Dixell XR06CX', bms: 'XR70CX' };

      // Match Low Temp Evaporator (Daikin CRE...L...)
      const evap = db.prepare(`
        SELECT m.*, b.name as brand_name, p.name as product_name,
               prc.selling_price, prc.purchase_cost
        FROM product_models m
        JOIN brands b ON m.brand_id = b.id
        JOIN products p ON m.product_id = p.id
        LEFT JOIN product_prices prc ON m.id = prc.model_id
        WHERE p.name LIKE '%Evaporator%' AND m.temp_range_min < 0
        ORDER BY ABS(m.capacity - ?) ASC
        LIMIT 1
      `).get(bestModel.capacity);

      result.recommendations.evaporator = evap;
    }
  }

  // -------------------------------------------------------------
  // 4. ATTACH ALL AVAILABLE CANDIDATE COMPRESSORS ACROSS ALL BRANDS
  // -------------------------------------------------------------
  const targetKw = result.estimatedLoadKw || 3.5;
  const isFreezer = application === 'freezer';
  const tempMin = isFreezer ? -35 : -5;
  const tempMax = isFreezer ? -15 : 15;

  try {
    const candidateCdus = db.prepare(`
      SELECT m.*, b.name as brand_name, p.name as product_name,
             prc.selling_price, prc.purchase_cost
      FROM product_models m
      JOIN brands b ON m.brand_id = b.id
      JOIN products p ON m.product_id = p.id
      LEFT JOIN product_prices prc ON m.id = prc.model_id
      WHERE (p.category_id = 'cat_cdu' OR p.name LIKE '%Condensing Unit%' OR p.name LIKE '%CDU%' OR m.model_number LIKE '%ZX%' OR m.model_number LIKE '%KH%')
        AND (
          (m.temp_range_min IS NULL AND m.temp_range_max IS NULL)
          OR (m.temp_range_min <= ? AND m.temp_range_max >= ?)
        )
      ORDER BY ABS(COALESCE(m.capacity, 0) - ?) ASC, m.capacity ASC
      LIMIT 30
    `).all(tempMax, tempMin, targetKw);

    result.availableCompressors = candidateCdus;
    if (result.recommendations) {
      result.recommendations.availableCompressors = candidateCdus;
      if (!result.recommendations.cdu && candidateCdus.length > 0) {
        result.recommendations.cdu = candidateCdus[0];
      }
    }
  } catch (err) {
    console.error('Error fetching candidate compressors:', err.message);
  }

  return result;
}
