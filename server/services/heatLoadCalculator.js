import { db } from '../db/index.js';

/**
 * Standard ASHRAE / USDA Refrigeration Heat Load Calculation Engine
 * and Daikin Commercial Refrigeration Equipment Matcher.
 */

// PUF panel thickness lookup (mm -> meters) and conductivity (W/m·K)
export const PUF_SPECS = {
  60: { thicknessM: 0.06, k: 0.023 },
  100: { thicknessM: 0.10, k: 0.023 },
  120: { thicknessM: 0.12, k: 0.023 },
  150: { thicknessM: 0.15, k: 0.023 },
};

/**
 * Calculate psychrometric enthalpy of moist air (kJ/kg)
 * Standard ASHRAE Fundamentals formulation
 */
export function calculateAirEnthalpy(tempC, relativeHumidity = 0.5) {
  const T = Number(tempC);
  const rh = Math.max(0.01, Math.min(1.0, Number(relativeHumidity)));
  // Saturation vapor pressure over liquid water (Tetens formula, kPa)
  const pSat = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
  const pv = rh * pSat;
  // Humidity ratio W (kg moisture / kg dry air), atmospheric pressure 101.325 kPa
  const W = Math.max(0.0001, 0.622 * (pv / Math.max(0.1, 101.325 - pv)));
  // Moist air specific enthalpy (kJ/kg of dry air)
  const h = 1.006 * T + W * (2501.0 + 1.86 * T);
  return h;
}

/**
 * Calculate recommended daily room air changes based on room volume
 * ASHRAE standard correlation: n = 70 * V^(-0.46)
 */
export function calculateAirChangesPerDay(volumeM3) {
  const v = Math.max(1, Number(volumeM3));
  const n = 70 * Math.pow(v, -0.46);
  return Math.max(1.5, Math.min(40.0, Math.round(n * 100) / 100));
}

/**
 * Retrieve all available commodities from the thermal_commodities table
 */
export function getThermalCommodities() {
  try {
    return db.prepare(`
      SELECT * FROM thermal_commodities WHERE is_active = 1 ORDER BY category ASC, name ASC
    `).all();
  } catch (err) {
    console.error('Error fetching thermal commodities:', err);
    return [];
  }
}

/**
 * Main Refrigeration Heat Load Calculation Function
 */
export function calculateHeatLoad(inputs = {}) {
  // 1. Dimensions & Volume
  const unit = inputs.unit === 'm' ? 'm' : 'ft';
  let lengthM, widthM, heightM, lengthFt, widthFt, heightFt;

  if (unit === 'm') {
    lengthM = Number(inputs.length) || 12.0;
    widthM = Number(inputs.width) || 8.0;
    heightM = Number(inputs.height) || 4.5;
    lengthFt = Math.round(lengthM / 0.3048 * 10) / 10;
    widthFt = Math.round(widthM / 0.3048 * 10) / 10;
    heightFt = Math.round(heightM / 0.3048 * 10) / 10;
  } else {
    lengthFt = Number(inputs.length) || 40.0;
    widthFt = Number(inputs.width) || 26.0;
    heightFt = Number(inputs.height) || 15.0;
    lengthM = Math.round(lengthFt * 0.3048 * 100) / 100;
    widthM = Math.round(widthFt * 0.3048 * 100) / 100;
    heightM = Math.round(heightFt * 0.3048 * 100) / 100;
  }

  const roomVolumeM3 = Math.round(lengthM * widthM * heightM * 100) / 100;
  const roomVolumeFt3 = Math.round(lengthFt * widthFt * heightFt);

  // Surface areas in m2
  const floorAreaM2 = Math.round(lengthM * widthM * 100) / 100;
  const ceilingAreaM2 = floorAreaM2;
  const wallsAreaM2 = Math.round(2 * (lengthM * heightM + widthM * heightM) * 100) / 100;
  const totalSurfaceAreaM2 = Math.round((wallsAreaM2 + ceilingAreaM2 + floorAreaM2) * 100) / 100;

  // 2. Insulation (PUF)
  const pufMm = Number(inputs.pufThicknessMm) || 100;
  const pufSpec = PUF_SPECS[pufMm] || { thicknessM: pufMm / 1000, k: 0.023 };
  const uValue = Math.round((pufSpec.k / pufSpec.thicknessM) * 1000) / 1000; // W/m2·K

  // 3. Temperatures
  const ambientTempC = inputs.ambientTemp !== undefined ? Number(inputs.ambientTemp) : 42.0;
  const roomTempC = inputs.roomTemp !== undefined ? Number(inputs.roomTemp) : 2.0;
  const deltaT = Math.max(0.1, ambientTempC - roomTempC);

  // 4. Transmission Heat Load (Q_transmission)
  // Qtrans = U * Area * deltaT * 24 * 3.6 (kJ/day)
  const qTransKj = Math.round(uValue * totalSurfaceAreaM2 * deltaT * 24 * 3.6);

  // 5. Commodity Lookup & Product Cooling Load (Q_product)
  const commodityId = inputs.commodityId || 'com_apple';
  let commodity = null;
  try {
    commodity = db.prepare('SELECT * FROM thermal_commodities WHERE id = ?').get(commodityId);
  } catch (_) {}

  if (!commodity) {
    // Fallback default (Apple)
    commodity = {
      id: 'com_apple',
      name: 'Apple (Seb)',
      category: 'Fruits',
      storage_temp_min: 0,
      storage_temp_max: 2,
      freezing_point_c: -1.5,
      cp_above: 3.64,
      latent_heat: 280,
      cp_below: 1.90,
      respiration_rate_mw_kg: 12.0,
    };
  }

  const dailyMassKg = Number(inputs.dailyMassKg) || 8000;
  const entryTempC = inputs.entryTemp !== undefined ? Number(inputs.entryTemp) : 28.0;

  let qProductSensible1 = 0;
  let qProductLatent = 0;
  let qProductSensible2 = 0;
  let qRespiration = 0;
  let qProductKj = 0;
  let productMode = 'chiller';

  if (roomTempC >= commodity.freezing_point_c) {
    // Chiller Mode: Sensible cooling above freezing + Respiration
    productMode = 'chiller';
    const sensibleDeltaT = Math.max(0, entryTempC - roomTempC);
    qProductSensible1 = Math.round(dailyMassKg * commodity.cp_above * sensibleDeltaT);
    qRespiration = Math.round(dailyMassKg * (commodity.respiration_rate_mw_kg || 0) * 0.0864);
    qProductKj = qProductSensible1 + qRespiration;
  } else {
    // Freezer Mode: Sensible pull-down to freeze point + Latent fusion + Subzero sensible cooling
    productMode = 'freezer';
    const preFreezeDeltaT = Math.max(0, entryTempC - commodity.freezing_point_c);
    qProductSensible1 = Math.round(dailyMassKg * commodity.cp_above * preFreezeDeltaT);
    qProductLatent = Math.round(dailyMassKg * commodity.latent_heat);
    const subzeroDeltaT = Math.max(0, commodity.freezing_point_c - roomTempC);
    qProductSensible2 = Math.round(dailyMassKg * commodity.cp_below * subzeroDeltaT);
    qRespiration = 0; // Frozen biological products do not respire
    qProductKj = qProductSensible1 + qProductLatent + qProductSensible2;
  }

  // 6. Air Infiltration Load (Q_air)
  const airChangesPerDay = Number(inputs.airChangesPerDay) || calculateAirChangesPerDay(roomVolumeM3);
  const airDensity = 1.2; // kg/m3
  const hAmbient = calculateAirEnthalpy(ambientTempC, inputs.ambientRh || 0.50);
  const hRoom = calculateAirEnthalpy(roomTempC, inputs.roomRh || 0.85);
  const deltaH = Math.max(1.0, hAmbient - hRoom); // kJ/kg
  const qAirKj = Math.round(roomVolumeM3 * airChangesPerDay * airDensity * deltaH);

  // 7. Internal Heat Load (Q_internal)
  // Lighting: default 10 W/m2 of floor area for operating hours
  const lightsKw = inputs.lightsKw !== undefined
    ? Number(inputs.lightsKw)
    : Math.round((floorAreaM2 * 0.010) * 100) / 100;
  const lightsHours = inputs.lightsHours !== undefined ? Number(inputs.lightsHours) : 8;
  const qLightsKj = Math.round(lightsKw * lightsHours * 3600);

  // Occupants: 0.25 kW per person
  const peopleCount = inputs.peopleCount !== undefined ? Number(inputs.peopleCount) : 1;
  const peopleHours = inputs.peopleHours !== undefined ? Number(inputs.peopleHours) : 4;
  const qPeopleKj = Math.round(peopleCount * 0.25 * peopleHours * 3600);

  // Equipment (forklifts, tools): kW * hours
  const equipmentKw = inputs.internalEquipmentKw !== undefined ? Number(inputs.internalEquipmentKw) : 0;
  const equipmentHours = inputs.internalEquipmentHours !== undefined ? Number(inputs.internalEquipmentHours) : 0;
  const qMiscEquipmentKj = Math.round(equipmentKw * equipmentHours * 3600);

  const qInternalKj = qLightsKj + qPeopleKj + qMiscEquipmentKj;

  // 8. Evaporator Equipment Load (Q_equipment)
  // Fan motor dissipation: ~0.5 kW default for standard DX units running 22 hours
  const fanKw = inputs.fanMotorKw !== undefined ? Number(inputs.fanMotorKw) : 0.5;
  const fanHours = inputs.fanOperatingHours !== undefined ? Number(inputs.fanOperatingHours) : 22;
  const qFanKj = Math.round(fanKw * fanHours * 3600);

  // Defrost heater: 20% enters the cold space
  const isFreezerRoom = roomTempC <= 0;
  const defrostKw = inputs.defrostHeaterKw !== undefined
    ? Number(inputs.defrostHeaterKw)
    : (isFreezerRoom ? 3.0 : 0.0);
  const defrostHours = inputs.defrostDurationHours !== undefined
    ? Number(inputs.defrostDurationHours)
    : (isFreezerRoom ? 1.0 : 0.0);
  const qDefrostKj = Math.round(defrostKw * defrostHours * 0.20 * 3600);

  const qEquipmentKj = qFanKj + qDefrostKj;

  // 9. Total Daily Thermal Load & Machinery Sizing
  const qTotalKj = qTransKj + qProductKj + qAirKj + qInternalKj + qEquipmentKj;

  const safetyFactor = inputs.safetyFactor !== undefined ? Number(inputs.safetyFactor) : 0.10; // 10%
  const compressorRunHours = inputs.compressorRunHours !== undefined
    ? Number(inputs.compressorRunHours)
    : 16.0;

  // Capacity (kW) = [ Qtotal * (1 + Safety_Factor) ] / (Compressor_Run_Hours * 3600)
  const capacityKw = Math.round((qTotalKj * (1 + safetyFactor) / (compressorRunHours * 3600)) * 100) / 100;
  const capacityTr = Math.round((capacityKw / 3.517) * 100) / 100;
  const capacityBtuHr = Math.round(capacityKw * 3412.14);

  // 10. Daikin Commercial Equipment Matching Algorithm
  const matchedEquipment = matchDaikinEquipment({
    requiredTr: capacityTr,
    requiredKw: capacityKw,
    roomTempC,
    compressorPreference: inputs.compressorPreference || 'any',
  });

  return {
    inputs: {
      dimensions: {
        lengthM, widthM, heightM,
        lengthFt, widthFt, heightFt,
        volumeM3: roomVolumeM3,
        volumeFt3: roomVolumeFt3,
        surfaceAreaM2: totalSurfaceAreaM2,
        floorAreaM2,
      },
      puf: {
        thicknessMm: pufMm,
        kValue: pufSpec.k,
        uValue,
      },
      temperatures: {
        ambientTempC,
        roomTempC,
        deltaT,
        entryTempC,
      },
      commodity: {
        id: commodity.id,
        name: commodity.name,
        category: commodity.category,
        storageTempRange: `${commodity.storage_temp_min}°C to ${commodity.storage_temp_max}°C`,
        freezingPointC: commodity.freezing_point_c,
        cpAbove: commodity.cp_above,
        latentHeat: commodity.latent_heat,
        cpBelow: commodity.cp_below,
        respirationRateMwKg: commodity.respiration_rate_mw_kg,
        dailyMassKg,
      },
      operational: {
        compressorRunHours,
        safetyFactorPercent: safetyFactor * 100,
        airChangesPerDay,
      },
      internalLoads: {
        lightsKw, lightsHours,
        peopleCount, peopleHours,
        equipmentKw, equipmentHours,
        fanKw, fanHours,
        defrostKw, defrostHours,
      },
    },
    thermalBreakdown: {
      qTransmissionKj: qTransKj,
      qProductKj,
      productComponents: {
        mode: productMode,
        qSensible1Kj: qProductSensible1,
        qLatentKj: qProductLatent,
        qSensible2Kj: qProductSensible2,
        qRespirationKj: qRespiration,
      },
      qAirInfiltrationKj: qAirKj,
      qInternalKj,
      internalComponents: {
        qLightsKj,
        qPeopleKj,
        qMiscEquipmentKj,
      },
      qEquipmentKj,
      equipmentComponents: {
        qFanKj,
        qDefrostKj,
      },
      qTotalKj,
      breakdownPercentages: {
        transmission: Math.round((qTransKj / qTotalKj) * 1000) / 10,
        product: Math.round((qProductKj / qTotalKj) * 1000) / 10,
        airInfiltration: Math.round((qAirKj / qTotalKj) * 1000) / 10,
        internal: Math.round((qInternalKj / qTotalKj) * 1000) / 10,
        equipment: Math.round((qEquipmentKj / qTotalKj) * 1000) / 10,
      },
    },
    machineRating: {
      capacityKw,
      capacityTr,
      capacityBtuHr,
      runHours: compressorRunHours,
      safetyFactorMultiplier: 1 + safetyFactor,
    },
    recommendations: matchedEquipment,
  };
}

/**
 * Match Daikin Outdoor Condensing Unit (CCU) and Indoor Air Cooling Unit (ACU)
 */
export function matchDaikinEquipment({ requiredTr, requiredKw, roomTempC, compressorPreference = 'any' }) {
  const isFreezer = roomTempC < 0;
  const ccuPrefix = isFreezer ? 'CCL' : 'CCM';

  // Fetch Daikin condensing units matching category
  let ccuQuery = `
    SELECT m.*, b.name as brand_name, p.name as product_name,
           prc.selling_price, prc.purchase_cost
    FROM product_models m
    JOIN brands b ON m.brand_id = b.id
    JOIN products p ON m.product_id = p.id
    LEFT JOIN product_prices prc ON m.id = prc.model_id
    WHERE b.name = 'Daikin' AND m.model_number LIKE ?
  `;
  const queryParams = [`%${ccuPrefix}%`];

  if (compressorPreference === 'scroll') {
    ccuQuery += " AND m.model_number LIKE '%CCLS%' OR m.model_number LIKE '%CCMS%'";
  } else if (compressorPreference === 'reciprocating') {
    ccuQuery += " AND m.model_number LIKE '%CCLR%' OR m.model_number LIKE '%CCMR%'";
  }

  let ccuModels = [];
  try {
    ccuModels = db.prepare(ccuQuery).all(...queryParams);
  } catch (err) {
    console.error('Error fetching Daikin CCUs:', err);
  }

  // Parse specifications into model objects
  const enrichedCcus = ccuModels.map(m => {
    let specs = [];
    try {
      specs = db.prepare('SELECT spec_key, spec_value FROM model_specifications WHERE model_id = ?').all(m.id);
    } catch (_) {}
    const specMap = Object.fromEntries(specs.map(s => [s.spec_key, s.spec_value]));
    const nomTr = Number(specMap.nominal_tr) || Math.round((m.capacity / 3.517) * 100) / 100;
    return {
      ...m,
      nominal_tr: nomTr,
      cooling_capacity_watts: Number(specMap.cooling_capacity_watts) || (m.capacity * 1000),
      power_input_watts: Number(specMap.power_input_watts) || 0,
      air_flow_m3h: Number(specMap.air_flow_m3h) || 0,
      compressor_type: specMap.compressor_type || (m.model_number.includes('S') ? 'Scroll' : 'Reciprocating'),
      horse_power: Number(specMap.horse_power) || 0,
    };
  }).sort((a, b) => a.nominal_tr - b.nominal_tr);

  // Find lowest nominal_tr >= requiredTr
  let selectedCcu = enrichedCcus.find(c => c.nominal_tr >= requiredTr);
  let multiUnitCcu = null;

  if (!selectedCcu && enrichedCcus.length > 0) {
    // Exceeds single largest unit capacity -> calculate multi-unit combination
    const maxUnit = enrichedCcus[enrichedCcus.length - 1];
    const unitCount = Math.ceil(requiredTr / maxUnit.nominal_tr);
    multiUnitCcu = {
      unit: maxUnit,
      count: unitCount,
      totalCapacityTr: Math.round(maxUnit.nominal_tr * unitCount * 100) / 100,
      totalCapacityKw: Math.round(maxUnit.capacity * unitCount * 100) / 100,
      note: `Total load of ${requiredTr} TR exceeds maximum single unit (${maxUnit.nominal_tr} TR). Recommended: ${unitCount} × ${maxUnit.model_number}`,
    };
    selectedCcu = maxUnit; // default representative unit
  }

  // Fetch Daikin indoor evaporators (ACU)
  let evapQuery = `
    SELECT m.*, b.name as brand_name, p.name as product_name,
           prc.selling_price, prc.purchase_cost
    FROM product_models m
    JOIN brands b ON m.brand_id = b.id
    JOIN products p ON m.product_id = p.id
    LEFT JOIN product_prices prc ON m.id = prc.model_id
    WHERE b.name = 'Daikin' AND p.name LIKE '%Evaporator%'
  `;
  let evapModels = [];
  try {
    evapModels = db.prepare(evapQuery).all();
  } catch (err) {
    console.error('Error fetching Daikin Evaporators:', err);
  }

  const enrichedEvaps = evapModels.map(m => {
    let specs = [];
    try {
      specs = db.prepare('SELECT spec_key, spec_value FROM model_specifications WHERE model_id = ?').all(m.id);
    } catch (_) {}
    const specMap = Object.fromEntries(specs.map(s => [s.spec_key, s.spec_value]));
    return {
      ...m,
      capacity_kw: m.capacity,
      air_flow_m3h: Number(specMap.air_flow_m3h) || 0,
      fan_configuration: specMap.fan_specs || '',
      defrost_type: specMap.defrost_type || '',
    };
  }).sort((a, b) => a.capacity_kw - b.capacity_kw);

  // Filter ACUs by temperature suitability
  // If freezer (<= 0°C), prefer models suitable for subzero (CREZM or CRE1L/CRE2L/CRE3L)
  // If medium (> 0°C), prefer models suitable for chiller (CREHM or CRE1M/CRE2M/CRE3M)
  const tempAppropriateEvaps = enrichedEvaps.filter(e => {
    if (isFreezer) {
      return e.temp_range_min <= -15 || e.model_number.includes('ZM') || e.model_number.includes('L');
    } else {
      return e.temp_range_max >= 0 || e.model_number.includes('HM') || e.model_number.includes('M');
    }
  });

  const targetAcukw = requiredKw;
  let selectedAcu = tempAppropriateEvaps.find(e => e.capacity_kw >= targetAcukw)
    || enrichedEvaps.find(e => e.capacity_kw >= targetAcukw);
  let multiUnitAcu = null;

  if (!selectedAcu && tempAppropriateEvaps.length > 0) {
    const maxAcu = tempAppropriateEvaps[tempAppropriateEvaps.length - 1];
    const acuCount = Math.ceil(targetAcukw / maxAcu.capacity_kw);
    multiUnitAcu = {
      unit: maxAcu,
      count: acuCount,
      totalCapacityKw: Math.round(maxAcu.capacity_kw * acuCount * 100) / 100,
      note: `Cooling load of ${targetAcukw} kW exceeds single unit (${maxAcu.capacity_kw} kW). Recommended: ${acuCount} × ${maxAcu.model_number}`,
    };
    selectedAcu = maxAcu;
  }

  return {
    ccu: selectedCcu || null,
    multiUnitCcu,
    evaporator: selectedAcu || null,
    multiUnitAcu,
    allCandidateCcus: enrichedCcus,
    allCandidateEvaps: enrichedEvaps,
    valveRecommendations: {
      expansionValve: isFreezer ? 'TIE-HW (MOP)' : 'TIE-SW',
      orifice: requiredTr <= 2 ? 'TIO-001' : (requiredTr <= 4 ? 'TIO-002' : 'TIO-003'),
      solenoidValve: requiredTr <= 3 ? '200RB 2T3T' : '200RB 3T3T',
      solenoidCoil: 'ASC3 208-240VAC 50Hz',
      controller: isFreezer ? 'Dixell XR06CX (Defrost + Fan Control)' : 'Dixell XR02CX',
    },
  };
}
