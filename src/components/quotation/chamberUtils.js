/**
 * Multi-Chamber Cold Room Engineering Utilities
 * Provides resilient normalization, chamber breakdown, automatic doors,
 * and invoice/quotation line item generation.
 */

export const PUF_SPECS = {
  60: { thicknessM: 0.06, k: 0.023 },
  100: { thicknessM: 0.10, k: 0.023 },
  120: { thicknessM: 0.12, k: 0.023 },
  150: { thicknessM: 0.15, k: 0.023 },
};

export const DOOR_OPTIONS = [
  { id: 'swing', label: 'Heavy-Duty Swing Flush Type (34" × 78")', short: 'Swing Flush Door', defaultRate: 28500 },
  { id: 'sliding', label: 'Heavy-Duty Industrial Overlap / Sliding Door (1200mm × 2100mm)', short: 'Industrial Sliding Door', defaultRate: 42000 },
  { id: 'hatch', label: 'Manual Flush Hatch Door / Reach-in Window (600mm × 600mm)', short: 'Hatch Door', defaultRate: 16500 },
];

export function calculateAirEnthalpy(tempC, relativeHumidity = 0.5) {
  const T = Number(tempC);
  const rh = Math.max(0.01, Math.min(1.0, Number(relativeHumidity)));
  const pSat = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
  const pv = rh * pSat;
  const W = Math.max(0.0001, 0.622 * (pv / Math.max(0.1, 101.325 - pv)));
  return 1.006 * T + W * (2501.0 + 1.86 * T);
}

export function calculateAirChangesPerDay(volumeM3) {
  const v = Math.max(1, Number(volumeM3));
  const n = 70 * Math.pow(v, -0.46);
  return Math.max(1.5, Math.min(40.0, Math.round(n * 100) / 100));
}

/**
 * Normalizes and guarantees that result has a complete chambers array,
 * partition wall metrics, automatic doors, and equipment matching.
 */
export function normalizeChamberResult(result, form = {}) {
  if (!result) return null;

  const numRooms = Math.max(1, Math.round(Number(form.numRooms || result.inputs?.numRooms || result.inputs?.chambersCount || 1)));
  const unit = form.unit || result.inputs?.dimensions?.lengthFt !== undefined ? form.unit || 'm' : 'm';
  const isM = unit === 'm';

  // Extract base dimensions in meters
  let lengthM = Number(result.inputs?.dimensions?.lengthM);
  let widthM = Number(result.inputs?.dimensions?.widthM);
  let heightM = Number(result.inputs?.dimensions?.heightM);

  if (!lengthM || !widthM || !heightM) {
    const l = Number(form.length) || 12;
    const w = Number(form.width) || 8;
    const h = Number(form.height) || 4.5;
    lengthM = isM ? l : Math.round(l * 0.3048 * 100) / 100;
    widthM = isM ? w : Math.round(w * 0.3048 * 100) / 100;
    heightM = isM ? h : Math.round(h * 0.3048 * 100) / 100;
  }

  const roomVolumeM3 = Math.round(lengthM * widthM * heightM * 100) / 100;
  const outerWallsM2 = Math.round(2 * (lengthM * heightM + widthM * heightM) * 100) / 100;
  const floorM2 = Math.round(lengthM * widthM * 100) / 100;
  const outerSurfaceAreaM2 = Math.round((outerWallsM2 + 2 * floorM2) * 100) / 100;

  // Partition walls
  const partitionWallsCount = Math.max(0, numRooms - 1);
  const singlePartitionWallAreaM2 = Math.round(widthM * heightM * 100) / 100;
  const totalPartitionAreaM2 = Math.round(partitionWallsCount * singlePartitionWallAreaM2 * 100) / 100;
  const totalPufSurfaceAreaM2 = Math.round((outerSurfaceAreaM2 + totalPartitionAreaM2) * 100) / 100;

  // Doors
  const totalDoors = numRooms;

  // If server already returned chambers of correct length, preserve and enrich
  if (Array.isArray(result.chambers) && result.chambers.length === numRooms) {
    return {
      ...result,
      inputs: {
        ...result.inputs,
        numRooms,
        chambersCount: numRooms,
        dimensions: {
          ...result.inputs?.dimensions,
          totalPufSurfaceAreaM2,
        },
      },
      doors: {
        totalDoors,
        doorsPerChamber: 1,
        type: 'Heavy-Duty Cold Room Swing Door',
        doorSpecification: 'Heavy-Duty PUF Insulated Cold Room Swing Door with Heater & Emergency Safety Release',
      },
      partitionWalls: {
        count: partitionWallsCount,
        singleWallAreaM2: singlePartitionWallAreaM2,
        totalAreaM2: totalPartitionAreaM2,
      },
    };
  }

  // Otherwise, construct independent chambers dynamically from data
  const chamberLengthM = Math.round((lengthM / numRooms) * 100) / 100;
  const chamberWidthM = widthM;
  const chamberHeightM = heightM;
  const chamberVolumeM3 = Math.round((roomVolumeM3 / numRooms) * 100) / 100;
  const chamberFloorM2 = Math.round(chamberLengthM * widthM * 100) / 100;

  const pufMm = Number(form.pufThicknessMm || result.inputs?.puf?.thicknessMm || 100);
  const pufSpec = PUF_SPECS[pufMm] || { thicknessM: pufMm / 1000, k: 0.023 };
  const uValue = Math.round((pufSpec.k / pufSpec.thicknessM) * 1000) / 1000;

  const ambientTempC = Number(form.ambientTemp ?? result.inputs?.temperatures?.ambientTempC ?? 42);
  const roomTempC = Number(form.roomTemp ?? result.inputs?.temperatures?.roomTempC ?? 2);
  const deltaT = Math.max(0.1, ambientTempC - roomTempC);

  const compressorRunHours = Number(form.compressorRunHours ?? result.inputs?.operational?.compressorRunHours ?? 16);
  const safetyFactor = Number(form.safetyFactor ?? 0.10);

  const airDensity = 1.2;
  const hAmbient = calculateAirEnthalpy(ambientTempC, 0.50);
  const hRoom = calculateAirEnthalpy(roomTempC, 0.85);
  const deltaH = Math.max(1.0, hAmbient - hRoom);

  const dailyMassKg = Number(form.dailyMassKg ?? result.inputs?.commodity?.dailyMassKg ?? 8000);
  const baseProductKj = result.thermalBreakdown?.qProductKj || 765414;
  const baseInternalKj = result.thermalBreakdown?.qInternalKj || 31248;
  const baseEquipmentKj = result.thermalBreakdown?.qEquipmentKj || 39600;

  // Available candidate evaporators from Daikin catalog
  const allCandidateEvaps = result.recommendations?.allCandidateEvaps || [];
  const defaultEvap = result.recommendations?.evaporator || null;

  const chambers = [];
  let totalKw = 0;

  for (let i = 1; i <= numRooms; i++) {
    // Envelope exposed area
    let chamberExposedAreaM2;
    if (numRooms === 1) {
      chamberExposedAreaM2 = outerSurfaceAreaM2;
    } else if (i === 1 || i === numRooms) {
      chamberExposedAreaM2 = Math.round(((widthM * heightM) + 2 * (chamberLengthM * heightM) + 2 * (chamberLengthM * widthM)) * 100) / 100;
    } else {
      chamberExposedAreaM2 = Math.round((2 * (chamberLengthM * heightM) + 2 * (chamberLengthM * widthM)) * 100) / 100;
    }

    const qTransChamberKj = Math.round(uValue * chamberExposedAreaM2 * deltaT * 24 * 3.6);
    const chamberAirChanges = calculateAirChangesPerDay(chamberVolumeM3);
    const qAirChamberKj = Math.round(chamberVolumeM3 * chamberAirChanges * airDensity * deltaH);
    const qProductChamberKj = Math.round(baseProductKj / numRooms);
    const qInternalChamberKj = Math.round(baseInternalKj / numRooms);
    const qEquipmentChamberKj = Math.round(baseEquipmentKj / numRooms);
    const qTotalChamberKj = qTransChamberKj + qAirChamberKj + qProductChamberKj + qInternalChamberKj + qEquipmentChamberKj;

    const chamberCapacityKw = Math.round(((qTotalChamberKj * (1 + safetyFactor)) / (compressorRunHours * 3600)) * 100) / 100;
    const chamberCapacityTr = Math.round((chamberCapacityKw / 3.517) * 100) / 100;

    // Match dedicated indoor evaporator from catalogue
    let matchedEvap = allCandidateEvaps.find(e => (e.capacity_kw || e.capacity) >= chamberCapacityKw);
    if (!matchedEvap) matchedEvap = defaultEvap;

    chambers.push({
      chamberNumber: i,
      name: `Chamber ${i}`,
      dimensions: {
        lengthM: chamberLengthM,
        widthM: chamberWidthM,
        heightM: chamberHeightM,
        lengthFt: Math.round(chamberLengthM / 0.3048 * 10) / 10,
        widthFt: Math.round(chamberWidthM / 0.3048 * 10) / 10,
        heightFt: Math.round(chamberHeightM / 0.3048 * 10) / 10,
        volumeM3: chamberVolumeM3,
        volumeFt3: Math.round(chamberVolumeM3 * 35.3147),
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
        qInternalKj: qInternalChamberKj,
        qEquipmentKj: qEquipmentChamberKj,
        qTotalKj: qTotalChamberKj,
      },
      capacityKw: chamberCapacityKw,
      capacityTr: chamberCapacityTr,
      capacityBtuHr: Math.round(chamberCapacityKw * 3412.14),
      evaporator: matchedEvap,
      valveRecommendations: result.recommendations?.valveRecommendations || {
        expansionValve: 'TIE-SW',
        orifice: 'TIO-002',
        solenoidValve: '200RB 2T3T',
        controller: 'Dixell XR02CX',
      },
    });

    totalKw += chamberCapacityKw;
  }

  const facilityCapacityKw = Math.round(totalKw * 100) / 100;
  const facilityCapacityTr = Math.round((facilityCapacityKw / 3.517) * 100) / 100;

  return {
    ...result,
    inputs: {
      ...result.inputs,
      numRooms,
      chambersCount: numRooms,
      dimensions: {
        ...result.inputs?.dimensions,
        lengthM,
        widthM,
        heightM,
        volumeM3: roomVolumeM3,
        surfaceAreaM2: outerSurfaceAreaM2,
        totalPufSurfaceAreaM2,
      },
    },
    machineRating: {
      ...result.machineRating,
      capacityKw: facilityCapacityKw,
      capacityTr: facilityCapacityTr,
      capacityBtuHr: Math.round(facilityCapacityKw * 3412.14),
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
  };
}

/**
 * Builds the complete list of invoice line items and technical specifications metadata
 * following the exact approved structure.
 */
export function buildColdRoomInvoiceItems({
  result,
  form = {},
  customRates = {},
  selectedLines = {},
  activeCcu = null,
  activeEvap = null,
}) {
  const normResult = normalizeChamberResult(result, form);
  const itemsToInsert = [];

  const numRooms = normResult.inputs?.numRooms || 1;
  const isMultiChamber = numRooms > 1;
  const chambers = normResult.chambers || [];
  const rec = normResult.recommendations || {};
  const ccu = activeCcu || rec.ccu;
  const evap = activeEvap || rec.evaporator;
  const pufMm = normResult.inputs?.puf?.thicknessMm || 100;
  const totalPufArea = normResult.inputs?.dimensions?.totalPufSurfaceAreaM2 || normResult.inputs?.dimensions?.surfaceAreaM2 || 0;
  const outerEnvelopeArea = normResult.inputs?.dimensions?.surfaceAreaM2 || 0;
  const partitionArea = normResult.partitionWalls?.totalAreaM2 || 0;
  const partitionCount = normResult.partitionWalls?.count || 0;

  // 1. Dedicated Indoor Evaporators for Each Chamber
  if (selectedLines.evaporator !== false) {
    if (isMultiChamber && chambers.length > 0) {
      chambers.forEach(ch => {
        const chEvap = ch.evaporator || evap;
        itemsToInsert.push({
          name: `${ch.name} – Daikin ${chEvap?.model_number || 'DX Evaporator'} Air Cooling Unit (${ch.dimensions.lengthM}m × ${ch.dimensions.widthM}m × ${ch.dimensions.heightM}m, ${ch.dimensions.volumeM3} m³ - ${ch.capacityTr} TR / ${ch.capacityKw} kW)`,
          hsn: '84189900',
          quantity: 1,
          unit: 'Nos',
          rate: Number(customRates.evaporator) || Number(chEvap?.selling_price) || 0,
          taxPercent: 18,
          discount: 0,
          product_id: chEvap?.product_id,
          model_id: chEvap?.id,
        });
      });
    } else {
      itemsToInsert.push({
        name: `Daikin ${evap?.model_number || 'DX Evaporator'} Air Cooling Unit (${evap?.capacity_kw || normResult.machineRating.capacityKw} kW) - Auto Defrost`,
        hsn: '84189900',
        quantity: 1,
        unit: 'Nos',
        rate: Number(customRates.evaporator) || Number(evap?.selling_price) || 0,
        taxPercent: 18,
        discount: 0,
        product_id: evap?.product_id,
        model_id: evap?.id,
      });
    }
  }

  // 2. Central Outdoor Condensing Unit (Combined Capacity)
  if (selectedLines.cdu !== false && ccu) {
    if (rec.multiUnitCcu) {
      const mu = rec.multiUnitCcu;
      itemsToInsert.push({
        name: `Central Daikin ${mu.unit.model_number} Outdoor Condensing Unit (${mu.unit.nominal_tr} TR each, ${mu.count} Sets = ${mu.totalCapacityTr} TR)${isMultiChamber ? ` (Central Combined - ${numRooms} Chambers)` : ''}`,
        hsn: '84189900',
        quantity: mu.count,
        unit: 'Set',
        rate: Number(customRates.cdu) || Number(mu.unit.selling_price) || 0,
        taxPercent: 18,
        discount: 0,
        product_id: mu.unit.product_id,
        model_id: mu.unit.id,
      });
    } else {
      itemsToInsert.push({
        name: `Central Daikin ${ccu.model_number} Outdoor Condensing Unit (${ccu.nominal_tr || ccu.capacity} TR @ ${normResult.inputs?.temperatures?.roomTempC}°C)${isMultiChamber ? ` (Central Combined - ${numRooms} Chambers)` : ''}`,
        hsn: '84189900',
        quantity: 1,
        unit: 'Set',
        rate: Number(customRates.cdu) || Number(ccu.selling_price) || 0,
        taxPercent: 18,
        discount: 0,
        product_id: ccu.product_id,
        model_id: ccu.id,
      });
    }
  }

  // 3. Cold Room Doors (Automatic 1 per Chamber)
  const selectedDoorOption = DOOR_OPTIONS.find(d => d.id === form.doorType) || DOOR_OPTIONS[0];
  const doorLabel = form.doorSpec || selectedDoorOption.label;
  const doorRate = Number(customRates.doors) || selectedDoorOption.defaultRate;

  if (selectedLines.doors !== false) {
    itemsToInsert.push({
      name: `${doorLabel} (with Positive Seal Gasket, Frame Heater & Safety Release Knob)${isMultiChamber ? ` - 1 Door per Chamber (${numRooms} Chambers)` : ''}`,
      hsn: '73083000',
      quantity: numRooms,
      unit: 'Nos',
      rate: doorRate,
      taxPercent: 18,
      discount: 0,
    });
  }

  // 4. Refrigeration Kits (1 Set per Chamber)
  if (selectedLines.kit !== false) {
    const vr = rec.valveRecommendations || {};
    itemsToInsert.push({
      name: `Daikin Cold-Room Refrigeration Kit (${vr.expansionValve || 'TXV'} + ${vr.orifice || 'Orifice'} + ${vr.solenoidValve || 'Solenoid'} + ${vr.controller || 'Dixell Controller'})${isMultiChamber ? ` - 1 Set per Chamber (${numRooms} Chambers)` : ''}`,
      hsn: '84189900',
      quantity: numRooms,
      unit: 'Set',
      rate: Number(customRates.kit) || 14500,
      taxPercent: 18,
      discount: 0,
    });
  }

  // 5. PUF Insulated Sandwich Panels (Includes Partition Walls)
  if (selectedLines.puf !== false) {
    const defaultPufRate = pufMm === 60 ? 1350 : (pufMm === 100 ? 1550 : (pufMm === 120 ? 1850 : 2150));
    itemsToInsert.push({
      name: `PUF Insulated Sandwich Panels (${pufMm}mm, k=0.023) - ${totalPufArea} sq.m${isMultiChamber ? ` (Includes ${outerEnvelopeArea} sq.m Outer Envelope + ${partitionCount} Partition Walls: ${partitionArea} sq.m)` : ' (Outer Thermal Envelope)'}`,
      hsn: '94069090',
      quantity: totalPufArea,
      unit: 'sq.m',
      rate: Number(customRates.puf) || defaultPufRate,
      taxPercent: 18,
      discount: 0,
    });
  }

  // 6. Installation, Copper Piping, Pressure Testing & Commissioning
  if (selectedLines.installation !== false) {
    const defaultInstallRate = isMultiChamber ? 18000 + (numRooms - 1) * 8000 : 18000;
    itemsToInsert.push({
      name: `Cold-Room Installation, ${isMultiChamber ? 'Multi-Chamber Refrigerant Piping' : 'Refrigerant Copper Piping'}, Pressure Testing & Commissioning`,
      hsn: '9987',
      quantity: 1,
      unit: 'Job',
      rate: Number(customRates.installation) || defaultInstallRate,
      taxPercent: 18,
      discount: 0,
    });
  }

  // Technical Specs Object with full metadata for Invoice, PDF, and Proposal views
  const technicalSpecs = {
    calculationEngine: 'ASHRAE / USDA Refrigeration Heat Load Engine (Daikin Commercial)',
    application: (normResult.inputs?.temperatures?.roomTempC ?? 2) <= 0 ? 'freezer' : 'chiller',
    length: form.length || normResult.inputs?.dimensions?.lengthM,
    width: form.width || normResult.inputs?.dimensions?.widthM,
    height: form.height || normResult.inputs?.dimensions?.heightM,
    unit: form.unit || 'm',
    volume: normResult.inputs?.dimensions?.volumeM3,
    estimatedLoadKw: normResult.machineRating?.capacityKw,
    capacityTr: normResult.machineRating?.capacityTr,
    ambientTemp: normResult.inputs?.temperatures?.ambientTempC,
    targetTemp: normResult.inputs?.temperatures?.roomTempC,
    dimensions: normResult.inputs?.dimensions,
    numRooms,
    chambersCount: numRooms,
    chambers: normResult.chambers,
    doors: {
      totalDoors: numRooms,
      doorType: form.doorType || 'swing',
      doorSpec: doorLabel,
      doorsPerChamber: 1,
    },
    doorType: form.doorType || 'swing',
    door_spec: isMultiChamber
      ? `${numRooms} Nos. ${doorLabel} (1 per Chamber)`
      : `1 No. ${doorLabel}`,
    sheetMaterial: form.sheetMaterial || '0.5 mm PPGI (Inner & Outer)',
    partitionWalls: normResult.partitionWalls,
    totalPufSurfaceAreaM2: totalPufArea,
    surfaceAreaM2: outerEnvelopeArea,
    puf: normResult.inputs?.puf,
    temperatures: normResult.inputs?.temperatures,
    commodity: normResult.inputs?.commodity,
    brandPreference: form.brand || 'Daikin',
    compressorTechnology: form.compressorPreference || 'any',
    refrigerant: form.refrigerant || 'R404A',
    thermalBreakdown: normResult.thermalBreakdown,
    machineRating: normResult.machineRating,
    recommendations: normResult.recommendations,
    cdu: ccu,
    evaporator: evap,
    calculatedAt: new Date().toISOString(),
  };

  return { itemsToInsert, technicalSpecs, normResult };
}
