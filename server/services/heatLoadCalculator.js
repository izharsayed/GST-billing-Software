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
  // 1. Dimensions, Chambers & Volume (supports flat inputs or nested inputs.dimensions)
  const dims = inputs.dimensions || {};
  const unit = (inputs.unit || dims.unit) === 'm' ? 'm' : 'ft';
  let lengthM, widthM, heightM, lengthFt, widthFt, heightFt;

  const rawLength = inputs.length !== undefined ? inputs.length : dims.length;
  const rawWidth = inputs.width !== undefined ? inputs.width : dims.width;
  const rawHeight = inputs.height !== undefined ? inputs.height : dims.height;

  if (unit === 'm') {
    lengthM = Number(rawLength) || 12.0;
    widthM = Number(rawWidth) || 8.0;
    heightM = Number(rawHeight) || 4.5;
    lengthFt = Math.round(lengthM / 0.3048 * 10) / 10;
    widthFt = Math.round(widthM / 0.3048 * 10) / 10;
    heightFt = Math.round(heightM / 0.3048 * 10) / 10;
  } else {
    lengthFt = Number(rawLength) || 40.0;
    widthFt = Number(rawWidth) || 26.0;
    heightFt = Number(rawHeight) || 15.0;
    lengthM = Math.round(lengthFt * 0.3048 * 100) / 100;
    widthM = Math.round(widthFt * 0.3048 * 100) / 100;
    heightM = Math.round(heightFt * 0.3048 * 100) / 100;
  }

  // Multi-chamber partitioning (Option 1: Divide 1 room into N equal chambers)
  const numRooms = Math.max(1, Math.round(Number(inputs.numRooms || dims.numRooms || inputs.chambersCount || dims.chambersCount || 1)));

  const roomVolumeM3 = Math.round(lengthM * widthM * heightM * 100) / 100;
  const roomVolumeFt3 = Math.round(lengthFt * widthFt * heightFt);

  // Surface areas in m2 (Outer Envelope)
  const floorAreaM2 = Math.round(lengthM * widthM * 100) / 100;
  const ceilingAreaM2 = floorAreaM2;
  const wallsAreaM2 = Math.round(2 * (lengthM * heightM + widthM * heightM) * 100) / 100;
  const totalSurfaceAreaM2 = Math.round((wallsAreaM2 + ceilingAreaM2 + floorAreaM2) * 100) / 100;

  // Internal Partition Walls: (N - 1) walls dividing along length
  const partitionWallsCount = Math.max(0, numRooms - 1);
  const singlePartitionWallAreaM2 = Math.round(widthM * heightM * 100) / 100;
  const totalPartitionAreaM2 = Math.round(partitionWallsCount * singlePartitionWallAreaM2 * 100) / 100;
  const totalPufSurfaceAreaM2 = Math.round((totalSurfaceAreaM2 + totalPartitionAreaM2) * 100) / 100;

  // Doors: Automatically 1 door per chamber
  const totalDoors = numRooms;

  // Chamber geometry
  const chamberLengthM = Math.round((lengthM / numRooms) * 100) / 100;
  const chamberWidthM = widthM;
  const chamberHeightM = heightM;
  const chamberLengthFt = Math.round((lengthFt / numRooms) * 10) / 10;
  const chamberWidthFt = widthFt;
  const chamberHeightFt = heightFt;
  const chamberVolumeM3 = Math.round((roomVolumeM3 / numRooms) * 100) / 100;
  const chamberVolumeFt3 = Math.round(roomVolumeFt3 / numRooms);
  const chamberFloorM2 = Math.round(chamberLengthM * widthM * 100) / 100;

  // 2. Insulation (PUF)
  const pufMm = Number(inputs.pufThicknessMm) || 100;
  const pufSpec = PUF_SPECS[pufMm] || { thicknessM: pufMm / 1000, k: 0.023 };
  const uValue = Math.round((pufSpec.k / pufSpec.thicknessM) * 1000) / 1000; // W/m2·K

  // 3. Temperatures
  const ambientTempC = inputs.ambientTemp !== undefined ? Number(inputs.ambientTemp) : 42.0;
  const roomTempC = inputs.roomTemp !== undefined ? Number(inputs.roomTemp) : 2.0;
  const deltaT = Math.max(0.1, ambientTempC - roomTempC);

  // 4. Commodity Lookup & Baseline Product Properties
  const commodityId = inputs.commodityId || 'com_apple';
  let commodity = null;
  try {
    commodity = db.prepare('SELECT * FROM thermal_commodities WHERE id = ?').get(commodityId);
  } catch (_) {}

  if (!commodity) {
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
  const isChillerMode = roomTempC >= commodity.freezing_point_c;
  const productMode = isChillerMode ? 'chiller' : 'freezer';

  // 5. Operational parameters
  const safetyFactor = inputs.safetyFactor !== undefined ? Number(inputs.safetyFactor) : 0.10; // 10%
  const compressorRunHours = inputs.compressorRunHours !== undefined
    ? Number(inputs.compressorRunHours)
    : 16.0;

  // Psychrometrics for Infiltration
  const airDensity = 1.2; // kg/m3
  const hAmbient = calculateAirEnthalpy(ambientTempC, inputs.ambientRh || 0.50);
  const hRoom = calculateAirEnthalpy(roomTempC, inputs.roomRh || 0.85);
  const deltaH = Math.max(1.0, hAmbient - hRoom); // kJ/kg

  // Internal and equipment base inputs
  const lightsHours = inputs.lightsHours !== undefined ? Number(inputs.lightsHours) : 8;
  const peopleCount = inputs.peopleCount !== undefined ? Number(inputs.peopleCount) : 1;
  const peopleHours = inputs.peopleHours !== undefined ? Number(inputs.peopleHours) : 4;
  const equipmentKw = inputs.internalEquipmentKw !== undefined ? Number(inputs.internalEquipmentKw) : 0;
  const equipmentHours = inputs.internalEquipmentHours !== undefined ? Number(inputs.internalEquipmentHours) : 0;
  const fanKw = inputs.fanMotorKw !== undefined ? Number(inputs.fanMotorKw) : 0.5;
  const fanHours = inputs.fanOperatingHours !== undefined ? Number(inputs.fanOperatingHours) : 22;
  const isFreezerRoom = roomTempC <= 0;
  const defrostKw = inputs.defrostHeaterKw !== undefined
    ? Number(inputs.defrostHeaterKw)
    : (isFreezerRoom ? 3.0 : 0.0);
  const defrostHours = inputs.defrostDurationHours !== undefined
    ? Number(inputs.defrostDurationHours)
    : (isFreezerRoom ? 1.0 : 0.0);

  // --------------------------------------------------------------------------
  // 6. INDEPENDENT CHAMBER-WISE HEAT LOAD CALCULATION
  // --------------------------------------------------------------------------
  const chambers = [];
  let totalChamberQTrans = 0;
  let totalChamberQAir = 0;
  let totalChamberQProduct = 0;
  let totalChamberQInternal = 0;
  let totalChamberQEquipment = 0;
  let totalChamberKw = 0;

  for (let i = 1; i <= numRooms; i++) {
    // A. Chamber Envelope Exposure (Outer walls exposed to ambient)
    let chamberExposedAreaM2;
    if (numRooms === 1) {
      chamberExposedAreaM2 = totalSurfaceAreaM2;
    } else if (i === 1 || i === numRooms) {
      // End chambers: 1 outer end wall (W*H) + 2 side walls (L_c*H) + Floor (L_c*W) + Ceiling (L_c*W)
      chamberExposedAreaM2 = Math.round(((widthM * heightM) + 2 * (chamberLengthM * heightM) + 2 * (chamberLengthM * widthM)) * 100) / 100;
    } else {
      // Middle chambers: 0 outer end walls + 2 side walls (L_c*H) + Floor (L_c*W) + Ceiling (L_c*W)
      chamberExposedAreaM2 = Math.round((2 * (chamberLengthM * heightM) + 2 * (chamberLengthM * widthM)) * 100) / 100;
    }

    // Transmission Load for Chamber i
    const qTransChamberKj = Math.round(uValue * chamberExposedAreaM2 * deltaT * 24 * 3.6);

    // Door Infiltration Load for Chamber i (1 dedicated door per chamber)
    const chamberAirChanges = calculateAirChangesPerDay(chamberVolumeM3);
    const qAirChamberKj = Math.round(chamberVolumeM3 * chamberAirChanges * airDensity * deltaH);

    // Product Load for Chamber i (proportional mass allocation)
    const chamberMassKg = Math.round((dailyMassKg / numRooms) * 10) / 10;
    let qProductSensible1Chamber = 0;
    let qProductLatentChamber = 0;
    let qProductSensible2Chamber = 0;
    let qRespirationChamber = 0;
    let qProductChamberKj = 0;

    if (isChillerMode) {
      const sensibleDeltaT = Math.max(0, entryTempC - roomTempC);
      qProductSensible1Chamber = Math.round(chamberMassKg * commodity.cp_above * sensibleDeltaT);
      qRespirationChamber = Math.round(chamberMassKg * (commodity.respiration_rate_mw_kg || 0) * 0.0864);
      qProductChamberKj = qProductSensible1Chamber + qRespirationChamber;
    } else {
      const preFreezeDeltaT = Math.max(0, entryTempC - commodity.freezing_point_c);
      qProductSensible1Chamber = Math.round(chamberMassKg * commodity.cp_above * preFreezeDeltaT);
      qProductLatentChamber = Math.round(chamberMassKg * commodity.latent_heat);
      const subzeroDeltaT = Math.max(0, commodity.freezing_point_c - roomTempC);
      qProductSensible2Chamber = Math.round(chamberMassKg * commodity.cp_below * subzeroDeltaT);
      qProductChamberKj = qProductSensible1Chamber + qProductLatentChamber + qProductSensible2Chamber;
    }

    // Internal Loads for Chamber i
    const chamberLightsKw = inputs.lightsKw !== undefined
      ? Math.round((Number(inputs.lightsKw) / numRooms) * 100) / 100
      : Math.round((chamberFloorM2 * 0.010) * 100) / 100;
    const qLightsChamberKj = Math.round(chamberLightsKw * lightsHours * 3600);
    const chamberPeopleCount = Math.max(1, Math.round(peopleCount / numRooms));
    const qPeopleChamberKj = Math.round(chamberPeopleCount * 0.25 * peopleHours * 3600);
    const qMiscEquipmentChamberKj = Math.round((equipmentKw * equipmentHours * 3600) / numRooms);
    const qInternalChamberKj = qLightsChamberKj + qPeopleChamberKj + qMiscEquipmentChamberKj;

    // Equipment Loads for Chamber i (Dedicated Evaporator Fan + Defrost)
    const chamberFanKw = Math.max(0.2, Math.round((fanKw / numRooms) * 100) / 100);
    const qFanChamberKj = Math.round(chamberFanKw * fanHours * 3600);
    const chamberDefrostKw = Math.round((defrostKw / numRooms) * 100) / 100;
    const qDefrostChamberKj = Math.round(chamberDefrostKw * defrostHours * 0.20 * 3600);
    const qEquipmentChamberKj = qFanChamberKj + qDefrostChamberKj;

    // Total Daily Heat Load for Chamber i
    const qTotalChamberKj = qTransChamberKj + qAirChamberKj + qProductChamberKj + qInternalChamberKj + qEquipmentChamberKj;
    const chamberCapacityKw = Math.round(((qTotalChamberKj * (1 + safetyFactor)) / (compressorRunHours * 3600)) * 100) / 100;
    const chamberCapacityTr = Math.round((chamberCapacityKw / 3.517) * 100) / 100;

    // Dedicated Indoor Evaporator (ACU) Match for Chamber i
    const chamberEquip = matchDaikinEquipment({
      requiredTr: chamberCapacityTr,
      requiredKw: chamberCapacityKw,
      roomTempC,
      compressorPreference: inputs.compressorPreference || 'any',
    });

    chambers.push({
      chamberNumber: i,
      name: `Chamber ${i}`,
      dimensions: {
        lengthM: chamberLengthM,
        widthM: chamberWidthM,
        heightM: chamberHeightM,
        lengthFt: chamberLengthFt,
        widthFt: chamberWidthFt,
        heightFt: chamberHeightFt,
        volumeM3: chamberVolumeM3,
        volumeFt3: chamberVolumeFt3,
        floorAreaM2: chamberFloorM2,
        exposedAreaM2: chamberExposedAreaM2,
      },
      door: {
        count: 1,
        type: 'Heavy-Duty PUF Insulated Cold Room Swing Door',
        spec: 'Positive seal rubber wiper gasket, heated frame & emergency release',
      },
      thermalBreakdown: {
        qTransmissionKj: qTransChamberKj,
        qAirInfiltrationKj: qAirChamberKj,
        qProductKj: qProductChamberKj,
        qSensible1Kj: qProductSensible1Chamber,
        qLatentKj: qProductLatentChamber,
        qSensible2Kj: qProductSensible2Chamber,
        qRespirationKj: qRespirationChamber,
        qInternalKj: qInternalChamberKj,
        qLightsKj: qLightsChamberKj,
        qPeopleKj: qPeopleChamberKj,
        qEquipmentKj: qEquipmentChamberKj,
        qFanKj: qFanChamberKj,
        qDefrostKj: qDefrostChamberKj,
        qTotalKj: qTotalChamberKj,
      },
      capacityKw: chamberCapacityKw,
      capacityTr: chamberCapacityTr,
      capacityBtuHr: Math.round(chamberCapacityKw * 3412.14),
      evaporator: chamberEquip.evaporator,
      multiUnitAcu: chamberEquip.multiUnitAcu,
      valveRecommendations: chamberEquip.valveRecommendations,
    });

    totalChamberQTrans += qTransChamberKj;
    totalChamberQAir += qAirChamberKj;
    totalChamberQProduct += qProductChamberKj;
    totalChamberQInternal += qInternalChamberKj;
    totalChamberQEquipment += qEquipmentChamberKj;
    totalChamberKw += chamberCapacityKw;
  }

  // --------------------------------------------------------------------------
  // 7. TOTAL FACILITY AGGREGATION & CENTRAL CCU MATCHING
  // --------------------------------------------------------------------------
  const qTotalFacilityKj = totalChamberQTrans + totalChamberQAir + totalChamberQProduct + totalChamberQInternal + totalChamberQEquipment;
  const facilityCapacityKw = Math.round(totalChamberKw * 100) / 100;
  const facilityCapacityTr = Math.round((facilityCapacityKw / 3.517) * 100) / 100;
  const facilityCapacityBtuHr = Math.round(facilityCapacityKw * 3412.14);

  // Match Central Outdoor Condensing Unit (CCU) for combined load
  const centralEquipment = matchDaikinEquipment({
    requiredTr: facilityCapacityTr,
    requiredKw: facilityCapacityKw,
    roomTempC,
    compressorPreference: inputs.compressorPreference || 'any',
    brandPreference: inputs.brand || inputs.brandPreference || 'any',
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
        totalPufSurfaceAreaM2,
      },
      chambersCount: numRooms,
      numRooms,
      partitionWalls: {
        count: partitionWallsCount,
        singleWallAreaM2: singlePartitionWallAreaM2,
        totalAreaM2: totalPartitionAreaM2,
      },
      doors: {
        totalDoors,
        doorsPerChamber: 1,
        type: 'Heavy-Duty Cold Room Swing Door',
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
        airChangesPerDay: calculateAirChangesPerDay(roomVolumeM3),
      },
      internalLoads: {
        lightsKw: Math.round((floorAreaM2 * 0.010) * 100) / 100,
        lightsHours,
        peopleCount,
        peopleHours,
        equipmentKw,
        equipmentHours,
        fanKw,
        fanHours,
        defrostKw,
        defrostHours,
      },
    },
    thermalBreakdown: {
      qTransmissionKj: totalChamberQTrans,
      qProductKj: totalChamberQProduct,
      productComponents: {
        mode: productMode,
        qSensible1Kj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qSensible1Kj || 0), 0),
        qLatentKj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qLatentKj || 0), 0),
        qSensible2Kj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qSensible2Kj || 0), 0),
        qRespirationKj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qRespirationKj || 0), 0),
      },
      qAirInfiltrationKj: totalChamberQAir,
      qInternalKj: totalChamberQInternal,
      internalComponents: {
        qLightsKj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qLightsKj || 0), 0),
        qPeopleKj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qPeopleKj || 0), 0),
        qMiscEquipmentKj: Math.max(0, totalChamberQInternal - chambers.reduce((acc, c) => acc + ((c.thermalBreakdown.qLightsKj || 0) + (c.thermalBreakdown.qPeopleKj || 0)), 0)),
      },
      qEquipmentKj: totalChamberQEquipment,
      equipmentComponents: {
        qFanKj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qFanKj || 0), 0),
        qDefrostKj: chambers.reduce((acc, c) => acc + (c.thermalBreakdown.qDefrostKj || 0), 0),
      },
      qTotalKj: qTotalFacilityKj,
      breakdownPercentages: {
        transmission: Math.round((totalChamberQTrans / qTotalFacilityKj) * 1000) / 10,
        product: Math.round((totalChamberQProduct / qTotalFacilityKj) * 1000) / 10,
        airInfiltration: Math.round((totalChamberQAir / qTotalFacilityKj) * 1000) / 10,
        internal: Math.round((totalChamberQInternal / qTotalFacilityKj) * 1000) / 10,
        equipment: Math.round((totalChamberQEquipment / qTotalFacilityKj) * 1000) / 10,
      },
    },
    machineRating: {
      capacityKw: facilityCapacityKw,
      capacityTr: facilityCapacityTr,
      capacityBtuHr: facilityCapacityBtuHr,
      runHours: compressorRunHours,
      safetyFactorMultiplier: 1 + safetyFactor,
    },
    chambers,
    doors: {
      totalDoors,
      doorsPerChamber: 1,
      doorSpecification: 'Heavy-Duty PUF Insulated Cold Room Swing Door with Heater & Emergency Safety Release',
    },
    partitionWalls: {
      count: partitionWallsCount,
      singleWallAreaM2: singlePartitionWallAreaM2,
      totalAreaM2: totalPartitionAreaM2,
    },
    recommendations: centralEquipment,
  };
}

/**
 * Match Emerson Outdoor Condensing Unit (CCU) and Indoor Air Cooling Unit (ACU)
 */
export function matchCommercialEquipment({ requiredTr, requiredKw, roomTempC, compressorPreference = 'any', brandPreference = 'any' }) {
  const isFreezer = roomTempC < 0;

  // Build brand condition for CDU
  let brandCcuFilter = "b.name IN ('Emerson', 'Daikin')";
  if (brandPreference === 'Daikin') {
    brandCcuFilter = "b.name = 'Daikin'";
  } else if (brandPreference === 'Emerson') {
    brandCcuFilter = "b.name = 'Emerson'";
  }

  // Fetch condensing units
  const ccuQuery = `
    SELECT m.*, b.name as brand_name, p.name as product_name,
           prc.selling_price, prc.purchase_cost
    FROM product_models m
    JOIN brands b ON m.brand_id = b.id
    JOIN products p ON m.product_id = p.id
    LEFT JOIN product_prices prc ON m.id = prc.model_id
    WHERE ${brandCcuFilter} AND (p.id = 'prod_emerson_cdu' OR p.id = 'prod_daikin_cdu' OR p.name LIKE '%Condensing%')
  `;

  let ccuModels = [];
  try {
    ccuModels = db.prepare(ccuQuery).all();
  } catch (err) {
    console.error('Error fetching CCUs:', err);
  }

  // Parse specifications into model objects
  const enrichedCcus = ccuModels.map(m => {
    let specs = [];
    try {
      specs = db.prepare('SELECT spec_key, spec_value FROM model_specifications WHERE model_id = ?').all(m.id);
    } catch (_) {}
    const specMap = Object.fromEntries(specs.map(s => [s.spec_key, s.spec_value]));
    const nomTr = Number(specMap.nominal_tr) || Math.round((m.capacity / 3.517) * 100) / 100;
    const desc = m.description || '';
    const isScroll = desc.includes('Scroll') || m.model_number.includes('ZX');
    const isRecip = desc.includes('Recip') || m.model_number.startsWith('K');

    return {
      ...m,
      nominal_tr: nomTr,
      cooling_capacity_watts: Number(specMap.cooling_capacity_watts) || Math.round(m.capacity * 1000),
      power_input_watts: Number(specMap.power_input_watts) || 0,
      air_flow_m3h: Number(specMap.air_flow_m3h) || 0,
      compressor_type: isScroll ? 'Scroll' : (isRecip ? 'Reciprocating' : (specMap.compressor_type || 'Hermetic')),
      horse_power: Number(specMap.horse_power) || Math.round(nomTr * 1.35 * 10) / 10,
    };
  }).filter(c => {
    // Temperature filtering: Chiller vs Freezer
    if (isFreezer) {
      return (c.temp_range_min !== null && c.temp_range_min <= -15) || c.description.toLowerCase().includes('freezer');
    } else {
      return (c.temp_range_max !== null && c.temp_range_max >= 0) || c.description.toLowerCase().includes('chiller');
    }
  }).filter(c => {
    // Compressor preference
    if (compressorPreference === 'scroll') return c.compressor_type === 'Scroll';
    if (compressorPreference === 'reciprocating') return c.compressor_type === 'Reciprocating';
    return true;
  }).sort((a, b) => a.nominal_tr - b.nominal_tr);

  // Find lowest nominal_tr >= requiredTr (or capacity >= requiredKw)
  let selectedCcu = enrichedCcus.find(c => c.nominal_tr >= requiredTr || c.capacity >= requiredKw);
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

  // Build brand condition for ACU / Evaporator
  let brandEvapFilter = "b.name IN ('Emerson', 'Daikin', 'Dixell')";
  if (brandPreference === 'Daikin') {
    brandEvapFilter = "b.name = 'Daikin'";
  } else if (brandPreference === 'Emerson') {
    brandEvapFilter = "b.name = 'Emerson' OR b.name = 'Dixell'";
  }

  // Fetch indoor evaporators (ACU)
  const evapQuery = `
    SELECT m.*, b.name as brand_name, p.name as product_name,
           prc.selling_price, prc.purchase_cost
    FROM product_models m
    JOIN brands b ON m.brand_id = b.id
    JOIN products p ON m.product_id = p.id
    LEFT JOIN product_prices prc ON m.id = prc.model_id
    WHERE (${brandEvapFilter}) AND (p.id = 'prod_comm_evap' OR p.id = 'prod_daikin_evap' OR p.name LIKE '%Evaporator%')
  `;
  let evapModels = [];
  try {
    evapModels = db.prepare(evapQuery).all();
  } catch (err) {
    console.error('Error fetching Evaporators:', err);
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
  const tempAppropriateEvaps = enrichedEvaps.filter(e => {
    if (isFreezer) {
      return (e.temp_range_min !== null && e.temp_range_min <= -15) || e.model_number.includes('L');
    } else {
      return (e.temp_range_max !== null && e.temp_range_max >= 0) || e.model_number.includes('M');
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

// Backward-compatibility alias
export const matchDaikinEquipment = matchCommercialEquipment;
