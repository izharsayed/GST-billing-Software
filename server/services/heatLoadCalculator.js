import { db } from '../db/index.js';
import {
  PUF_SPECS,
  FLOOR_CONSTRUCTION_TYPES,
  COVERAGE_MODES,
  DOOR_OPTIONS,
  calculateAirEnthalpy,
  calculateAirDensity,
  calculateAirChangesPerDay,
  calculateGosneyOlssonInfiltration,
  calculateClearInternalDimensions,
  generateStandardChamberLayout,
  validateCustomChamberLayout,
  placeAutomaticDoors,
  calculatePufAreas,
} from '../../src/components/quotation/chamberUtils.js';

export {
  PUF_SPECS,
  calculateAirEnthalpy,
  calculateAirDensity,
  calculateAirChangesPerDay,
  calculateGosneyOlssonInfiltration,
};

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
 * Supports Standard Multi-Axis Slicing (1D, 2D grid, 2D prime proportional bay)
 * and Custom Per-Room 3D Coordinate Mode.
 */
export function calculateHeatLoad(inputs = {}) {
  // 1. Dimensions, Chambers & Volume
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

  const numRooms = Math.max(1, Math.round(Number(inputs.numRooms || dims.numRooms || inputs.chambersCount || dims.chambersCount || 1)));
  const isCustomMode = inputs.isCustomMode === true || inputs.mode === 'custom' || inputs.divisionMode === 'custom' || (Array.isArray(inputs.customChambers) && inputs.customChambers.length > 0);
  const coverageMode = inputs.coverageMode || 'full';
  const divisionDirections = inputs.divisionDirections || { L: true, W: false, H: false };
  const pufMm = Number(inputs.pufThicknessMm) || 100;
  const floorConstruction = inputs.floorConstruction || 'puf';
  const doorOptionId = inputs.doorType || 'swing';

  // 2. Generate or Validate Geometry Layout
  let layout;
  if (isCustomMode && Array.isArray(inputs.customChambers) && inputs.customChambers.length > 0) {
    layout = validateCustomChamberLayout({
      facility: { lengthM, widthM, heightM },
      chambers: inputs.customChambers,
      coverageMode,
      pufThicknessMm: pufMm,
      floorConstruction,
    });
  } else {
    layout = generateStandardChamberLayout({
      lengthM,
      widthM,
      heightM,
      numRooms,
      divisionDirections,
      pufThicknessMm: pufMm,
      floorConstruction,
    });
  }

  // 3. Place Automatic Doors with Access Route Validation
  const doorPlacements = placeAutomaticDoors({
    chambers: layout.chambers,
    facility: { lengthM, widthM, heightM },
    customDoors: inputs.customDoors || [],
    doorOptionId,
  });

  // 4. Calculate PUF Areas with Host-Specific Door Deductions
  const pufAreas = calculatePufAreas({
    facility: { lengthM, widthM, heightM },
    chambers: layout.chambers,
    partitions: layout.partitions,
    doors: doorPlacements.doors,
    floorConstruction,
    pufThicknessMm: pufMm,
    wastageAllowancePct: inputs.wastageAllowancePct,
  });

  // 5. Insulation U-Values
  const pufSpec = PUF_SPECS[pufMm] || { thicknessM: pufMm / 1000, k: 0.023 };
  const uValueWall = Math.round((pufSpec.k / pufSpec.thicknessM) * 1000) / 1000; // W/m2·K
  const floorConfig = FLOOR_CONSTRUCTION_TYPES.find(f => f.id === floorConstruction) || FLOOR_CONSTRUCTION_TYPES[0];
  const uValueFloor = floorConfig.defaultU;

  // 6. Temperatures & Commodity
  const ambientTempC = inputs.ambientTemp !== undefined ? Number(inputs.ambientTemp) : 42.0;
  const roomTempC = inputs.roomTemp !== undefined ? Number(inputs.roomTemp) : 2.0;
  const groundTempC = inputs.groundTemp !== undefined ? Number(inputs.groundTemp) : 22.0;

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
  const safetyFactor = inputs.safetyFactor !== undefined ? Number(inputs.safetyFactor) : 0.10;
  const compressorRunHours = inputs.compressorRunHours !== undefined ? Number(inputs.compressorRunHours) : 16.0;

  // Psychrometrics
  const ambientRh = Number(inputs.ambientRh) || 0.50;
  const roomRh = Number(inputs.roomRh) || 0.85;
  const airDensity = calculateAirDensity(roomTempC, roomRh);
  const hAmbient = calculateAirEnthalpy(ambientTempC, ambientRh);
  const hRoom = calculateAirEnthalpy(roomTempC, roomRh);
  const deltaH = Math.max(1.0, hAmbient - hRoom);

  const lightsHours = inputs.lightsHours !== undefined ? Number(inputs.lightsHours) : 8;
  const peopleCount = inputs.peopleCount !== undefined ? Number(inputs.peopleCount) : 1;
  const peopleHours = inputs.peopleHours !== undefined ? Number(inputs.peopleHours) : 4;
  const fanKw = inputs.fanMotorKw !== undefined ? Number(inputs.fanMotorKw) : 0.5;
  const fanHours = inputs.fanOperatingHours !== undefined ? Number(inputs.fanOperatingHours) : 22;

  // 7. Independent Chamber Calculations
  const chambers = [];
  let totalFacilityKw = 0;
  let totalQTrans = 0;
  let totalQAir = 0;
  let totalQProduct = 0;
  let totalQInternal = 0;
  let totalQEquip = 0;

  const chamberCount = layout.chambers.length;

  for (let i = 0; i < chamberCount; i++) {
    const ch = layout.chambers[i];
    const chNum = ch.chamberNumber;
    const chRoomTemp = Number(ch.roomTempC ?? roomTempC);
    const chIsFreezer = chRoomTemp < commodity.freezing_point_c;
    const deltaT_amb = Math.max(0.1, ambientTempC - chRoomTemp);
    const deltaT_ground = Math.max(0.1, groundTempC - chRoomTemp);

    // Geometry spans
    const lM = ch.dimensions.lengthM;
    const wM = ch.dimensions.widthM;
    const hM = ch.dimensions.heightM;
    const volM3 = ch.dimensions.volumeM3;
    const clearVolM3 = ch.clearDimensions?.usableVolumeM3 || volM3;
    const floorM2 = Math.round(lM * wM * 100) / 100;
    const ceilingM2 = floorM2;

    // Transmission: exterior exposed walls
    // Calculate wall area exposed to exterior boundary
    let extWallAreaM2 = 0;
    if (Math.abs(ch.origin.x) < 0.001) extWallAreaM2 += wM * hM; // Left wall
    if (Math.abs((ch.origin.x + lM) - lengthM) < 0.001) extWallAreaM2 += wM * hM; // Right wall
    if (Math.abs(ch.origin.y) < 0.001) extWallAreaM2 += lM * hM; // Front wall
    if (Math.abs((ch.origin.y + wM) - widthM) < 0.001) extWallAreaM2 += lM * hM; // Back wall
    extWallAreaM2 = Math.round(extWallAreaM2 * 100) / 100;

    const qTransWallsKj = Math.round(uValueWall * extWallAreaM2 * deltaT_amb * 24 * 3.6);
    const qTransCeilingKj = Math.round(uValueWall * ceilingM2 * deltaT_amb * 24 * 3.6);
    const qTransFloorKj = Math.round(uValueFloor * floorM2 * deltaT_ground * 24 * 3.6);
    let qTransChamberKj = qTransWallsKj + qTransCeilingKj + qTransFloorKj;

    // Shared partition heat flux if neighbor has different temperature
    let qPartitionFluxKj = 0;
    layout.partitions.forEach(p => {
      if (p.chambers?.includes(chNum)) {
        const otherNum = p.chambers.find(cn => cn !== chNum);
        const otherCh = layout.chambers.find(c => c.chamberNumber === otherNum);
        if (otherCh) {
          const otherTemp = Number(otherCh.roomTempC ?? roomTempC);
          const deltaT_part = otherTemp - chRoomTemp;
          // Flux added to colder room (deltaT_part > 0), deducted from warmer (deltaT_part < 0)
          const flux = Math.round(uValueWall * p.areaM2 * deltaT_part * 24 * 3.6);
          qPartitionFluxKj += flux;
        }
      }
    });
    qTransChamberKj += qPartitionFluxKj;

    // Door Infiltration
    let qAirChamberKj = 0;
    const door = ch.door || doorPlacements.doors.find(d => d.chamberNumber === chNum);
    const detailed = inputs.doorUsageInputs?.[chNum] || (inputs.openFrequencyPerHour ? inputs : null);

    if (detailed && detailed.openFrequencyPerHour > 0) {
      // Gosney-Olsson Detailed Model
      const go = calculateGosneyOlssonInfiltration({
        doorwayWidthM: door?.widthM || 1.0,
        doorwayHeightM: door?.heightM || 2.1,
        ambientTempC,
        ambientRh,
        roomTempC: chRoomTemp,
        roomRh,
        openFrequencyPerHour: detailed.openFrequencyPerHour,
        openDurationSec: detailed.openDurationSec || 30,
        protectionFactor: detailed.protectionFactor || 0.60,
      });
      qAirChamberKj = go.qDailyKj;
    } else {
      // Default ASHRAE Chapter 24 ACH Model
      const ach = calculateAirChangesPerDay(clearVolM3);
      qAirChamberKj = Math.round(clearVolM3 * ach * airDensity * deltaH);
    }

    // Product Load (proportional to volume unless chamber mass specified)
    const chMassKg = Number(inputs.chamberMassKg?.[chNum] || (dailyMassKg / chamberCount));
    let qProductSensible1 = 0;
    let qProductLatent = 0;
    let qProductSensible2 = 0;
    let qRespiration = 0;
    let qProductChamberKj = 0;

    if (!chIsFreezer) {
      const sensibleDeltaT = Math.max(0, entryTempC - chRoomTemp);
      qProductSensible1 = Math.round(chMassKg * commodity.cp_above * sensibleDeltaT);
      qRespiration = Math.round(chMassKg * (commodity.respiration_rate_mw_kg || 0) * 0.0864);
      qProductChamberKj = qProductSensible1 + qRespiration;
    } else {
      const preFreezeDeltaT = Math.max(0, entryTempC - commodity.freezing_point_c);
      qProductSensible1 = Math.round(chMassKg * commodity.cp_above * preFreezeDeltaT);
      qProductLatent = Math.round(chMassKg * commodity.latent_heat);
      const subzeroDeltaT = Math.max(0, commodity.freezing_point_c - chRoomTemp);
      qProductSensible2 = Math.round(chMassKg * commodity.cp_below * subzeroDeltaT);
      qProductChamberKj = qProductSensible1 + qProductLatent + qProductSensible2;
    }

    // Internal & Equipment
    const lightsKw = Math.round((floorM2 * 0.010) * 100) / 100;
    const qLightsKj = Math.round(lightsKw * lightsHours * 3600);
    const chPeople = Math.max(1, Math.round(peopleCount / chamberCount));
    const qPeopleKj = Math.round(chPeople * 0.25 * peopleHours * 3600);
    const qInternalKj = qLightsKj + qPeopleKj;

    const chFanKw = Math.max(0.2, Math.round((fanKw / chamberCount) * 100) / 100);
    const qFanKj = Math.round(chFanKw * fanHours * 3600);
    const chDefrostKw = chIsFreezer ? 3.0 : 0.0;
    const qDefrostKj = Math.round(chDefrostKw * (chIsFreezer ? 1.0 : 0.0) * 0.20 * 3600);
    const qEquipKj = qFanKj + qDefrostKj;

    // Total Chamber Load
    const qTotalChamberKj = qTransChamberKj + qAirChamberKj + qProductChamberKj + qInternalKj + qEquipKj;
    const chamberCapKw = Math.round(((qTotalChamberKj * (1 + safetyFactor)) / (compressorRunHours * 3600)) * 100) / 100;
    const chamberCapTr = Math.round((chamberCapKw / 3.517) * 100) / 100;

    // Dedicated Evaporator Match
    const equipMatch = matchCommercialEquipment({
      requiredTr: chamberCapTr,
      requiredKw: chamberCapKw,
      roomTempC: chRoomTemp,
      compressorPreference: inputs.compressorPreference || 'any',
      brandPreference: inputs.brandPreference || 'any',
    });

    chambers.push({
      chamberNumber: chNum,
      name: ch.name || `Chamber ${chNum}`,
      origin: ch.origin,
      dimensions: {
        lengthM: lM,
        widthM: wM,
        heightM: hM,
        lengthFt: Math.round(lM / 0.3048 * 10) / 10,
        widthFt: Math.round(wM / 0.3048 * 10) / 10,
        heightFt: Math.round(hM / 0.3048 * 10) / 10,
        volumeM3: volM3,
        floorAreaM2: floorM2,
        exposedAreaM2: extWallAreaM2 + ceilingM2 + floorM2,
      },
      clearDimensions: ch.clearDimensions,
      door,
      roomTempC: chRoomTemp,
      assignedCircuit: chIsFreezer ? 'LT_Freezer_Circuit' : 'MT_Chiller_Circuit',
      thermalBreakdown: {
        qTransmissionKj: qTransChamberKj,
        qPartitionKj: qPartitionFluxKj,
        qAirInfiltrationKj: qAirChamberKj,
        qProductKj: qProductChamberKj,
        qInternalKj,
        qEquipmentKj: qEquipKj,
        qTotalKj: qTotalChamberKj,
      },
      capacityKw: chamberCapKw,
      capacityTr: chamberCapTr,
      capacityBtuHr: Math.round(chamberCapKw * 3412.14),
      evaporator: equipMatch.evaporator,
      multiUnitAcu: equipMatch.multiUnitAcu,
      valveRecommendations: equipMatch.valveRecommendations,
    });

    totalQTrans += qTransChamberKj;
    totalQAir += qAirChamberKj;
    totalQProduct += qProductChamberKj;
    totalQInternal += qInternalKj;
    totalQEquip += qEquipKj;
    totalFacilityKw += chamberCapKw;
  }

  const facilityKw = Math.round(totalFacilityKw * 100) / 100;
  const facilityTr = Math.round((facilityKw / 3.517) * 100) / 100;
  const totalDailyHeatLoadKj = totalQTrans + totalQAir + totalQProduct + totalQInternal + totalQEquip;

  // 8. Refrigeration Circuit Allocation & Central Equipment Matching
  const circuits = [];
  const mtChambers = chambers.filter(c => c.assignedCircuit === 'MT_Chiller_Circuit');
  const ltChambers = chambers.filter(c => c.assignedCircuit === 'LT_Freezer_Circuit');

  if (mtChambers.length > 0) {
    const mtKw = Math.round(mtChambers.reduce((acc, c) => acc + c.capacityKw, 0) * 100) / 100;
    const mtTr = Math.round((mtKw / 3.517) * 100) / 100;
    const mtEquip = matchCommercialEquipment({
      requiredTr: mtTr,
      requiredKw: mtKw,
      roomTempC: 2.0,
      compressorPreference: inputs.compressorPreference || 'any',
      brandPreference: inputs.brandPreference || 'any',
    });
    circuits.push({
      id: 'circuit_mt',
      circuitId: 'circuit_MT',
      name: 'Medium-Temperature (MT) Circuit',
      designSstC: -7.0,
      targetTempC: 2.0,
      chambers: mtChambers.map(c => c.chamberNumber),
      totalKw: mtKw,
      totalTr: mtTr,
      ccu: mtEquip.ccu,
      multiUnitCcu: mtEquip.multiUnitCcu,
      unverifiedCatalogData: mtEquip.unverifiedCatalogData || false,
    });
  }

  if (ltChambers.length > 0) {
    const ltKw = Math.round(ltChambers.reduce((acc, c) => acc + c.capacityKw, 0) * 100) / 100;
    const ltTr = Math.round((ltKw / 3.517) * 100) / 100;
    const ltEquip = matchCommercialEquipment({
      requiredTr: ltTr,
      requiredKw: ltKw,
      roomTempC: -20.0,
      compressorPreference: inputs.compressorPreference || 'any',
      brandPreference: inputs.brandPreference || 'any',
    });
    circuits.push({
      id: 'circuit_lt',
      circuitId: 'circuit_LT',
      name: 'Low-Temperature (LT) Circuit',
      designSstC: -28.0,
      targetTempC: -20.0,
      chambers: ltChambers.map(c => c.chamberNumber),
      totalKw: ltKw,
      totalTr: ltTr,
      ccu: ltEquip.ccu,
      multiUnitCcu: ltEquip.multiUnitCcu,
      unverifiedCatalogData: ltEquip.unverifiedCatalogData || false,
    });
  }

  if (circuits.length === 1) {
    circuits[0].circuitId = 'single_central';
  }

  // Central equipment fallback
  const centralEquip = matchCommercialEquipment({
    requiredTr: facilityTr,
    requiredKw: facilityKw,
    roomTempC,
    compressorPreference: inputs.compressorPreference || 'any',
    brandPreference: inputs.brandPreference || 'any',
  });

  return {
    inputs: {
      ...inputs,
      numRooms: chamberCount,
      chambersCount: chamberCount,
      divisionDirections,
      floorConstruction,
      pufThicknessMm: pufMm,
      dimensions: {
        lengthM,
        widthM,
        heightM,
        lengthFt,
        widthFt,
        heightFt,
        volumeM3: layout.outerEnvelope.volumeM3,
        surfaceAreaM2: pufAreas.gross.envelopeM2,
        totalPufSurfaceAreaM2: pufAreas.procurement.procurementAreaM2,
        netInstalledAreaM2: pufAreas.net.totalNetInstalledM2,
      },
      temperatures: { ambientTempC, roomTempC, groundTempC },
      commodity,
      puf: { thicknessMm: pufMm, uValue: uValueWall },
    },
    thermalBreakdown: {
      qTransmissionKj: totalQTrans,
      qProductKj: totalQProduct,
      qAirInfiltrationKj: totalQAir,
      qInternalKj: totalQInternal,
      qEquipmentKj: totalQEquip,
      qTotalKj: totalDailyHeatLoadKj,
      infiltrationParameters: {
        model: inputs.infiltrationModel || (inputs.openFrequencyPerHour ? 'gosney_olsson' : 'ashrae'),
      },
    },
    machineRating: {
      capacityKw: facilityKw,
      capacityTr: facilityTr,
      capacityBtuHr: Math.round(facilityKw * 3412.14),
      compressorRunHours,
      safetyFactor,
    },
    chambers,
    circuits,
    doors: {
      totalDoors: doorPlacements.totalDoors,
      doorsPerChamber: 1,
      placements: doorPlacements.doors,
    },
    partitionWalls: {
      count: layout.partitions.length,
      totalAreaM2: pufAreas.gross.partitionsM2,
      partitions: layout.partitions,
    },
    pufAreas,
    catalogVerificationStatus: 'unverified',
    recommendations: {
      ccu: circuits[0]?.ccu || centralEquip.ccu,
      multiUnitCcu: circuits[0]?.multiUnitCcu || centralEquip.multiUnitCcu,
      evaporator: chambers[0]?.evaporator || centralEquip.evaporator,
      allCandidateEvaps: centralEquip.allCandidateEvaps || [],
      valveRecommendations: centralEquip.valveRecommendations,
      circuits,
      unverified: true,
      catalogVerificationStatus: 'unverified',
    },
  };
}

/**
 * Match Outdoor Condensing Unit (CCU) and Indoor Air Cooling Unit (ACU)
 */
export function matchCommercialEquipment({
  requiredTr,
  requiredKw,
  roomTempC,
  compressorPreference = 'any',
  brandPreference = 'any',
}) {
  const isFreezer = roomTempC < 0;

  let brandCcuFilter = "b.name IN ('Emerson', 'Daikin')";
  if (brandPreference === 'Daikin') {
    brandCcuFilter = "b.name = 'Daikin'";
  } else if (brandPreference === 'Emerson') {
    brandCcuFilter = "b.name = 'Emerson'";
  }

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
    if (isFreezer) {
      return (c.temp_range_min !== null && c.temp_range_min <= -15) || c.description.toLowerCase().includes('freezer');
    } else {
      return (c.temp_range_max !== null && c.temp_range_max >= 0) || c.description.toLowerCase().includes('chiller');
    }
  }).filter(c => {
    if (compressorPreference === 'scroll') return c.compressor_type === 'Scroll';
    if (compressorPreference === 'reciprocating') return c.compressor_type === 'Reciprocating';
    return true;
  }).sort((a, b) => a.nominal_tr - b.nominal_tr);

  let selectedCcu = enrichedCcus.find(c => c.nominal_tr >= requiredTr || c.capacity >= requiredKw);
  let multiUnitCcu = null;

  if (!selectedCcu && enrichedCcus.length > 0) {
    const maxUnit = enrichedCcus[enrichedCcus.length - 1];
    const unitCount = Math.ceil(requiredTr / maxUnit.nominal_tr);
    multiUnitCcu = {
      unit: maxUnit,
      count: unitCount,
      totalCapacityTr: Math.round(maxUnit.nominal_tr * unitCount * 100) / 100,
      totalCapacityKw: Math.round(maxUnit.capacity * unitCount * 100) / 100,
      note: `Total load of ${requiredTr} TR exceeds maximum single unit (${maxUnit.nominal_tr} TR). Recommended: ${unitCount} × ${maxUnit.model_number}`,
    };
    selectedCcu = maxUnit;
  }

  // Fetch Evaporators
  let brandEvapFilter = "b.name IN ('Emerson', 'Daikin', 'Dixell')";
  if (brandPreference === 'Daikin') {
    brandEvapFilter = "b.name = 'Daikin'";
  } else if (brandPreference === 'Emerson') {
    brandEvapFilter = "b.name = 'Emerson' OR b.name = 'Dixell'";
  }

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
    ccu: selectedCcu,
    multiUnitCcu,
    evaporator: selectedAcu,
    multiUnitAcu,
    allCandidateEvaps: enrichedEvaps,
    unverifiedCatalogData: true, // Tagged in accordance with master plan
    valveRecommendations: {
      expansionValve: isFreezer ? 'TIE-HW' : 'TIE-SW',
      orifice: 'TIO-002',
      solenoidValve: '200RB 2T3T',
      controller: isFreezer ? 'Dixell XR06CX' : 'Dixell XR02CX',
    },
  };
}
