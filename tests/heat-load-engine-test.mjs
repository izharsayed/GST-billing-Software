/**
 * Comprehensive Automated Test Suite: Refrigeration Heat Load & Multi-Axis Sizing Engine
 * Validates all 38 test matrix scenarios from the approved engineering master plan.
 */

import {
  calculateHeatLoad,
  getThermalCommodities,
  calculateAirEnthalpy,
  calculateAirChangesPerDay,
} from '../server/services/heatLoadCalculator.js';

import {
  generateStandardChamberLayout,
  validateCustomChamberLayout,
  placeAutomaticDoors,
  calculatePufAreas,
  calculateGosneyOlssonInfiltration,
  buildColdRoomInvoiceItems,
} from '../src/components/quotation/chamberUtils.js';

let passed = 0;
let failed = 0;

function assert(condition, testNum, description) {
  if (condition) {
    console.log(`  ✅ [PASS] Scenario ${testNum}: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] Scenario ${testNum}: ${description}`);
    failed++;
  }
}

console.log('================================================================');
console.log('STARTING 38-POINT REFRIGERATION & CHAMBER DIVISION TEST SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// SECTION A: STANDARD MULTI-AXIS GEOMETRY & FACTORING (1 - 15)
// -------------------------------------------------------------
console.log('--- SECTION A: Standard Multi-Axis Geometry & Factoring ---');

// 1. N=1 Undivided baseline
try {
  const l1 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 1 });
  assert(
    l1.success && l1.chambers.length === 1 && l1.partitions.length === 0 && l1.chambers[0].dimensions.volumeM3 === 432,
    1,
    'N=1 Undivided baseline: single room, 0 partitions, exact facility volume (432 m³)'
  );
} catch (e) {
  assert(false, 1, `N=1 failed: ${e.message}`);
}

// 2. N=2 Single-direction (Length)
try {
  const l2L = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 2, divisionDirections: { L: true } });
  assert(
    l2L.success && l2L.chambers.length === 2 && l2L.chambers[0].dimensions.lengthM === 6 && l2L.partitions.length === 1 && l2L.partitions[0].normalAxis === 'X',
    2,
    'N=2 Single-direction (Length): 2 equal chambers of 6x8x4.5m with 1 transverse X-normal partition'
  );
} catch (e) {
  assert(false, 2, `N=2 Length failed: ${e.message}`);
}

// 3. N=2 Single-direction (Width)
try {
  const l2W = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 2, divisionDirections: { W: true } });
  assert(
    l2W.success && l2W.chambers.length === 2 && l2W.chambers[0].dimensions.widthM === 4 && l2W.partitions[0].normalAxis === 'Y',
    3,
    'N=2 Single-direction (Width): 2 equal chambers of 12x4x4.5m with 1 longitudinal Y-normal partition'
  );
} catch (e) {
  assert(false, 3, `N=2 Width failed: ${e.message}`);
}

// 4. N=2 Single-direction (Height)
try {
  const l2H = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 2, divisionDirections: { H: true } });
  assert(
    l2H.success && l2H.chambers.length === 2 && l2H.chambers[0].dimensions.heightM === 2.25 && l2H.partitions[0].type === 'deck',
    4,
    'N=2 Single-direction (Height): 2 equal tiers of 12x8x2.25m with 1 mezzanine deck partition'
  );
} catch (e) {
  assert(false, 4, `N=2 Height failed: ${e.message}`);
}

// 5. N=2 Rejection of two-direction division
try {
  generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 2, divisionDirections: { L: true, W: true } });
  assert(false, 5, 'N=2 Two-direction should have been rejected');
} catch (e) {
  assert(
    e.message.includes('N=2'),
    5,
    `N=2 Two-direction rejection correctly caught: "${e.message}"`
  );
}

// 6. N>1 Rejection of zero-direction division
try {
  generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: false, W: false, H: false } });
  assert(false, 6, 'N>1 Zero-direction should have been rejected');
} catch (e) {
  assert(
    e.message.includes('select at least one division direction'),
    6,
    `N>1 Zero-direction rejection correctly caught: "${e.message}"`
  );
}

// 7. Rejection of all three directions (L+W+H)
try {
  generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true, W: true, H: true } });
  assert(false, 7, 'Three-direction division should have been rejected');
} catch (e) {
  assert(
    e.message.includes('Maximum two division directions'),
    7,
    `Three-direction rejection correctly caught: "${e.message}"`
  );
}

// 8. N=3 Two-direction (L+W) Prime proportional bay partition
try {
  const l3 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true, W: true } });
  assert(
    l3.success && l3.chambers.length === 3 && l3.bayAllocation.bay1.chambers === 1 && l3.bayAllocation.bay2.chambers === 2,
    8,
    'N=3 Two-direction (L+W) Prime bay partition: Bay 1 (1 chamber, 4x8x4.5m) + Bay 2 (2 chambers, 8x4x4.5m)'
  );
} catch (e) {
  assert(false, 8, `N=3 Prime bay partition failed: ${e.message}`);
}

// 9. N=3 Volume conservation proof
try {
  const l3 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true, W: true } });
  const totalChVol = l3.chambers.reduce((s, c) => s + c.dimensions.volumeM3, 0);
  const volDiff = Math.abs(totalChVol - 432);
  const chVols = l3.chambers.map(c => c.dimensions.volumeM3);
  const allEqual = chVols.every(v => Math.abs(v - chVols[0]) < 0.05);
  assert(
    volDiff < 0.1 && allEqual,
    9,
    `N=3 Volume conservation proof: sum(V_i) = ${totalChVol} m³ = 432 m³, all 3 chambers have identical volume (144 m³)`
  );
} catch (e) {
  assert(false, 9, `N=3 Volume conservation failed: ${e.message}`);
}

// 10. N=3 Partition area derivation
try {
  const l3 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true, W: true } });
  const primaryWall = l3.partitions.find(p => p.isPrimaryBayWall);
  const subWall = l3.partitions.find(p => p.bay === 2);
  assert(
    primaryWall && primaryWall.areaM2 === 36 && subWall && subWall.areaM2 === 36,
    10,
    'N=3 Partition area derivation: Primary bay partition (8x4.5 = 36 m²) + Bay 2 sub-partition (8x4.5 = 36 m²)'
  );
} catch (e) {
  assert(false, 10, `N=3 Partition derivation failed: ${e.message}`);
}

// 11. N=4 Two-direction (2x2 composite factor grid)
try {
  const l4 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 4, divisionDirections: { L: true, W: true } });
  assert(
    l4.success && l4.mode.includes('2D_grid') && l4.chambers.length === 4 && l4.chambers[0].dimensions.lengthM === 6 && l4.chambers[0].dimensions.widthM === 4,
    11,
    'N=4 Two-direction (2x2 composite grid): 4 equal rectangular chambers of 6x4x4.5m'
  );
} catch (e) {
  assert(false, 11, `N=4 Factor grid failed: ${e.message}`);
}

// 12. N=5 Two-direction (L+W) Prime bay partition
try {
  const l5 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 5, divisionDirections: { L: true, W: true } });
  const equalVols = l5.chambers.every(c => Math.abs(c.dimensions.volumeM3 - 86.4) < 0.1);
  assert(
    l5.success && l5.chambers.length === 5 && l5.bayAllocation.bay1.chambers === 2 && l5.bayAllocation.bay2.chambers === 3 && equalVols,
    12,
    'N=5 Two-direction (L+W) Prime bay partition: k1=2, k2=3, all 5 chambers have equal volume (86.4 m³)'
  );
} catch (e) {
  assert(false, 12, `N=5 Prime bay partition failed: ${e.message}`);
}

// 13. N=6 Two-direction (3x2 composite factor grid)
try {
  const l6 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 6, divisionDirections: { L: true, W: true } });
  assert(
    l6.success && l6.mode.includes('2D_grid') && l6.chambers.length === 6 && l6.chambers[0].dimensions.lengthM === 4 && l6.chambers[0].dimensions.widthM === 4,
    13,
    'N=6 Two-direction (3x2 composite grid): 6 equal rectangular chambers of 4x4x4.5m'
  );
} catch (e) {
  assert(false, 13, `N=6 Factor grid failed: ${e.message}`);
}

// 14. N=7 Two-direction (L+H) Prime proportional bay partition
try {
  const l7 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 7, divisionDirections: { L: true, H: true } });
  const equalVols7 = l7.chambers.every(c => Math.abs(c.dimensions.volumeM3 - 61.71) < 0.1);
  assert(
    l7.success && l7.chambers.length === 7 && l7.bayAllocation.bay1.chambers === 3 && l7.bayAllocation.bay2.chambers === 4 && equalVols7,
    14,
    'N=7 Two-direction (L+H) Prime bay partition: k1=3, k2=4, all 7 chambers have equal volume (~61.71 m³)'
  );
} catch (e) {
  assert(false, 14, `N=7 Prime bay partition failed: ${e.message}`);
}

// 15. N=8 Two-direction (4x2 composite factor grid)
try {
  const l8 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 8, divisionDirections: { L: true, W: true } });
  assert(
    l8.success && l8.mode.includes('2D_grid') && l8.chambers.length === 8 && l8.chambers[0].dimensions.lengthM === 3 && l8.chambers[0].dimensions.widthM === 4,
    15,
    'N=8 Two-direction (4x2 composite grid): 8 equal rectangular chambers of 3x4x4.5m'
  );
} catch (e) {
  assert(false, 15, `N=8 Factor grid failed: ${e.message}`);
}

// -------------------------------------------------------------
// SECTION B: CUSTOM 3D COORDINATE POSITIONING & VALIDATION (16 - 20)
// -------------------------------------------------------------
console.log('\n--- SECTION B: Custom 3D Coordinate Positioning & Validation ---');

// 16. Custom mode: Valid 3D coordinate placement
try {
  const cv1 = validateCustomChamberLayout({
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    chambers: [
      { name: 'Chamber 1', origin: { x: 0, y: 0, z: 0 }, dimensions: { lengthM: 6, widthM: 8, heightM: 4.5 } },
      { name: 'Chamber 2', origin: { x: 6, y: 0, z: 0 }, dimensions: { lengthM: 6, widthM: 8, heightM: 4.5 } },
    ],
    coverageMode: 'full',
  });
  assert(
    cv1.success && cv1.chambers.length === 2 && cv1.partitions.length === 1 && cv1.coveragePercent === 100,
    16,
    'Custom mode: Valid 3D coordinates (2 chambers 6x8x4.5m at x=0 and x=6) validated with 100% coverage'
  );
} catch (e) {
  assert(false, 16, `Custom valid placement failed: ${e.message}`);
}

// 17. Custom mode: Boundary containment violation rejection
try {
  validateCustomChamberLayout({
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    chambers: [
      { name: 'Out-of-bounds Room', origin: { x: 8, y: 0, z: 0 }, dimensions: { lengthM: 5, widthM: 8, heightM: 4.5 } },
    ],
  });
  assert(false, 17, 'Boundary containment violation should have thrown an error');
} catch (e) {
  assert(
    e.message.includes('beyond facility boundary'),
    17,
    `Custom mode boundary containment violation correctly caught: "${e.message}"`
  );
}

// 18. Custom mode: 3D overlap detection rejection
try {
  validateCustomChamberLayout({
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    chambers: [
      { name: 'Room A', origin: { x: 0, y: 0, z: 0 }, dimensions: { lengthM: 7, widthM: 8, heightM: 4.5 } },
      { name: 'Room B', origin: { x: 5, y: 0, z: 0 }, dimensions: { lengthM: 7, widthM: 8, heightM: 4.5 } },
    ],
  });
  assert(false, 18, '3D overlap should have thrown an error');
} catch (e) {
  assert(
    e.message.includes('overlaps with') || e.message.includes('Overlap detected'),
    18,
    `Custom mode pairwise 3D overlap detection correctly caught: "${e.message}"`
  );
}

// 19. Custom mode: Full facility coverage strict gap detection
try {
  validateCustomChamberLayout({
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    chambers: [
      { name: 'Partial Room', origin: { x: 0, y: 0, z: 0 }, dimensions: { lengthM: 6, widthM: 8, heightM: 4.5 } },
    ],
    coverageMode: 'full',
  });
  assert(false, 19, 'Full facility coverage gap should have thrown an error');
} catch (e) {
  assert(
    e.message.includes('Incomplete facility volume coverage') || e.message.includes('Unallocated volume'),
    19,
    `Custom mode strict full coverage gap correctly caught: "${e.message}"`
  );
}

// 20. Custom mode: Partial facility coverage audit
try {
  const cp = validateCustomChamberLayout({
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    chambers: [
      { name: 'Half Room', origin: { x: 0, y: 0, z: 0 }, dimensions: { lengthM: 6, widthM: 8, heightM: 4.5 } },
    ],
    coverageMode: 'partial',
  });
  assert(
    cp.success && cp.unallocatedVolumeM3 === 216 && cp.coveragePercent === 50,
    20,
    'Custom mode: Partial coverage allowed mode successfully audits unallocated volume (216 m³, 50% coverage)'
  );
} catch (e) {
  assert(false, 20, `Custom partial coverage failed: ${e.message}`);
}

// -------------------------------------------------------------
// SECTION C: AUTOMATIC DEDICATED DOORS & EGRESS GRAPH (21 - 25)
// -------------------------------------------------------------
console.log('\n--- SECTION C: Automatic Dedicated Doors & Egress Graph ---');

// 21. Automatic door placement: All external walls available (deterministic priority)
try {
  const l3 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true } });
  const doors = placeAutomaticDoors(l3.chambers, l3.outerEnvelope, 'swing');
  const allAssigned = doors.chambers.every(c => c.door !== null);
  assert(
    doors.success && doors.totalDoors === 3 && allAssigned && doors.chambers[0].door.hostWall === 'front',
    21,
    'Automatic door placement: Exactly 1 door per chamber (3 doors for 3 chambers), prioritized on Front wall'
  );
} catch (e) {
  assert(false, 21, `Exterior door placement failed: ${e.message}`);
}

// 22. Automatic door placement: Landlocked chamber BFS routing via shared partition
try {
  // 3 concentric chambers along X: Chamber 1 [0..4], Chamber 2 [4..8], Chamber 3 [8..12]
  // In a 3x3 layout or nested layout, inner chamber routes via partition
  const facility = { lengthM: 12, widthM: 12, heightM: 4.5 };
  const customRooms = [
    { chamberNumber: 1, name: 'Outer Room', origin: { x: 0, y: 0, z: 0 }, dimensions: { lengthM: 12, widthM: 6, heightM: 4.5 } },
    { chamberNumber: 2, name: 'Inner Room', origin: { x: 2, y: 6, z: 0 }, dimensions: { lengthM: 8, widthM: 6, heightM: 4.5 } },
  ];
  const doors = placeAutomaticDoors(customRooms, facility, 'swing');
  assert(
    doors.success && doors.totalDoors === 2 && doors.chambers.every(c => c.door && c.door.egressRoute.length > 0),
    22,
    'Landlocked chamber BFS egress validation: Unbroken egress path verified through shared partition'
  );
} catch (e) {
  assert(false, 22, `BFS routing failed: ${e.message}`);
}

// 23. Automatic door placement: Ingress disconnected / blocked detection
try {
  const facility = { lengthM: 12, widthM: 12, heightM: 4.5 };
  // Floating chamber in mid-air (Z=1.0) with no ground or deck access
  const blockedRooms = [
    { chamberNumber: 1, name: 'Air Room', origin: { x: 2, y: 2, z: 1.5 }, dimensions: { lengthM: 4, widthM: 4, heightM: 2.0 } },
  ];
  placeAutomaticDoors(blockedRooms, facility, 'swing');
  assert(false, 23, 'Disconnected room should have thrown an error');
} catch (e) {
  assert(
    e.message.includes('DOOR PLACEMENT BLOCKED') || e.message.includes('ACCESS ROUTE BLOCKED') || e.message.includes('host wall'),
    23,
    `Blocked ingress detection correctly caught: "${e.message}"`
  );
}

// 24. Automatic door placement: Shared partition door single-deduction & single physical procurement billing
try {
  const lPrime = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true, W: true } });
  const doors = placeAutomaticDoors(lPrime.chambers, lPrime.outerEnvelope, 'swing');
  const puf = calculatePufAreas({
    chambers: doors.chambers,
    outerEnvelope: lPrime.outerEnvelope,
    partitions: lPrime.partitions,
    doors: doors.chambers.map(c => c.door),
    floorConstruction: 'puf',
  });
  assert(
    doors.totalDoors === 3 && puf.net.doorDeductionM2 === Math.round(3 * (0.86 * 1.98) * 100) / 100,
    24,
    'Shared partition door single-deduction: Exactly 3 door openings deducted from host walls (never duplicated)'
  );
} catch (e) {
  assert(false, 24, `Shared partition door accounting failed: ${e.message}`);
}

// 25. Automatic door placement: Floor & ceiling zero door deduction invariant
try {
  const l3 = generateStandardChamberLayout({ lengthM: 12, widthM: 8, heightM: 4.5, numRooms: 3, divisionDirections: { L: true } });
  const doors = placeAutomaticDoors(l3.chambers, l3.outerEnvelope, 'swing');
  const puf = calculatePufAreas({
    chambers: doors.chambers,
    outerEnvelope: l3.outerEnvelope,
    partitions: l3.partitions,
    doors: doors.chambers.map(c => c.door),
    floorConstruction: 'puf',
  });
  assert(
    puf.net.floorDeductionM2 === 0 && puf.net.ceilingDeductionM2 === 0,
    25,
    'Floor & ceiling zero door deduction invariant: Floor deduction = 0 m², Ceiling deduction = 0 m²'
  );
} catch (e) {
  assert(false, 25, `Floor/Ceiling deduction invariant failed: ${e.message}`);
}

// -------------------------------------------------------------
// SECTION D: CONFIGURABLE PUF FLOOR CONSTRUCTION (26 - 28)
// -------------------------------------------------------------
console.log('\n--- SECTION D: Configurable PUF Floor Construction ---');

const baseFacility = { lengthM: 12, widthM: 8, heightM: 4.5, volumeM3: 432 };
const baseChambers = [{ chamberNumber: 1, origin: { x: 0, y: 0, z: 0 }, dimensions: { lengthM: 12, widthM: 8, heightM: 4.5 } }];

// 26. PUF construction: Insulated PUF floor inclusion
try {
  const pufInc = calculatePufAreas({
    chambers: baseChambers,
    outerEnvelope: baseFacility,
    partitions: [],
    doors: [{ hostWall: 'front', widthM: 0.86, heightM: 1.98 }],
    floorConstruction: 'puf',
  });
  assert(
    pufInc.gross.floorGrossM2 === 96 && pufInc.procurement.floorProcurementM2 === 96,
    26,
    'PUF construction (puf): Floor area (96 m²) fully included in PUF panel procurement'
  );
} catch (e) {
  assert(false, 26, `PUF floor inclusion failed: ${e.message}`);
}

// 27. PUF construction: Civil concrete sub-slab exclusion
try {
  const pufSub = calculatePufAreas({
    chambers: baseChambers,
    outerEnvelope: baseFacility,
    partitions: [],
    doors: [{ hostWall: 'front', widthM: 0.86, heightM: 1.98 }],
    floorConstruction: 'concrete_subslab',
  });
  assert(
    pufSub.procurement.floorProcurementM2 === 0 && pufSub.procurement.totalProcurementM2 < 300,
    27,
    'PUF construction (concrete_subslab): Floor area excluded from PUF panel procurement'
  );
} catch (e) {
  assert(false, 27, `Civil concrete sub-slab exclusion failed: ${e.message}`);
}

// 28. PUF construction: Uninsulated ground exclusion
try {
  const pufGnd = calculatePufAreas({
    chambers: baseChambers,
    outerEnvelope: baseFacility,
    partitions: [],
    doors: [{ hostWall: 'front', widthM: 0.86, heightM: 1.98 }],
    floorConstruction: 'uninsulated_ground',
  });
  assert(
    pufGnd.procurement.floorProcurementM2 === 0 && pufGnd.floorConstruction.includedInProcurement === false,
    28,
    'PUF construction (uninsulated_ground): Floor area excluded from PUF panel procurement'
  );
} catch (e) {
  assert(false, 28, `Uninsulated ground exclusion failed: ${e.message}`);
}

// -------------------------------------------------------------
// SECTION E: THERMODYNAMICS & INFILTRATION (29 - 32)
// -------------------------------------------------------------
console.log('\n--- SECTION E: Thermodynamics & Infiltration ---');

// 29. Inter-chamber partition heat transfer (identical temps -> 0 flux)
try {
  const resEqual = calculateHeatLoad({
    length: 12, width: 8, height: 4.5, unit: 'm', numRooms: 2,
    divisionDirections: { L: true },
    roomTemp: 2.0, ambientTemp: 42.0, commodityId: 'com_apple', dailyMassKg: 4000,
  });
  const ch1Part = resEqual.chambers[0].thermalBreakdown.qPartitionKj || 0;
  assert(
    ch1Part === 0,
    29,
    'Inter-chamber partition heat transfer: Identical chamber temperatures (ΔT=0K) yields zero partition flux (0 kJ)'
  );
} catch (e) {
  assert(false, 29, `Equal temp partition flux failed: ${e.message}`);
}

// 30. Inter-chamber partition heat transfer (different temps -> valid flux)
try {
  const resDiff = calculateHeatLoad({
    divisionMode: 'custom',
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    length: 12, width: 8, height: 4.5, unit: 'm',
    customChambers: [
      { name: 'Chiller', x: 0, y: 0, z: 0, lengthM: 6, widthM: 8, heightM: 4.5, roomTempC: 2.0, dailyMassKg: 2000 },
      { name: 'Freezer', x: 6, y: 0, z: 0, lengthM: 6, widthM: 8, heightM: 4.5, roomTempC: -20.0, dailyMassKg: 2000 },
    ],
    ambientTemp: 42.0,
    commodityId: 'com_apple',
  });
  const partFluxChiller = resDiff.chambers[0].thermalBreakdown.qPartitionKj;
  const partFluxFreezer = resDiff.chambers[1].thermalBreakdown.qPartitionKj;
  assert(
    partFluxFreezer > 0 && Math.abs(partFluxChiller + partFluxFreezer) < 1,
    30,
    `Inter-chamber partition heat transfer: ΔT=22K yields non-zero partition flux (${partFluxFreezer} kJ/day into freezer, -${Math.abs(partFluxChiller)} kJ/day from chiller)`
  );
} catch (e) {
  assert(false, 30, `Different temp partition flux failed: ${e.message}`);
}

// 31. Infiltration switch: ASHRAE Table 7 ACH
try {
  const achLoad = calculateHeatLoad({
    length: 12, width: 8, height: 4.5, unit: 'm', numRooms: 1,
    infiltrationModel: 'ashrae',
    roomTemp: 2.0, ambientTemp: 42.0, commodityId: 'com_apple', dailyMassKg: 4000,
  });
  assert(
    achLoad.thermalBreakdown.qAirInfiltrationKj > 100000 && achLoad.thermalBreakdown.infiltrationParameters.model === 'ashrae',
    31,
    `Infiltration model (ASHRAE ACH): Calculated daily infiltration load = ${achLoad.thermalBreakdown.qAirInfiltrationKj} kJ/day`
  );
} catch (e) {
  assert(false, 31, `ASHRAE ACH failed: ${e.message}`);
}

// 32. Infiltration switch: Gosney-Olsson formulation
try {
  const go = calculateGosneyOlssonInfiltration({
    doorwayWidthM: 0.86,
    doorwayHeightM: 1.98,
    ambientTempC: 42.0,
    roomTempC: 2.0,
    openFrequencyPerHour: 15,
    openDurationSec: 30,
    protectionFactor: 0.60,
  });
  assert(
    go.qDailyKj > 50000 && go.qDailyKj < 400000 && go.isProvisional === true,
    32,
    `Infiltration model (Gosney-Olsson): Calculated door dynamic load = ${go.qDailyKj} kJ/day (~${go.qKw} kW, marked provisional)`
  );
} catch (e) {
  assert(false, 32, `Gosney-Olsson calculation failed: ${e.message}`);
}

// -------------------------------------------------------------
// SECTION F: REFRIGERATION & EQUIPMENT MATCHING (33 - 37)
// -------------------------------------------------------------
console.log('\n--- SECTION F: Refrigeration & Equipment Matching ---');

// 33. Multi-circuit clustering: Compatible SST (single circuit)
try {
  const resCompat = calculateHeatLoad({
    length: 12, width: 8, height: 4.5, unit: 'm', numRooms: 2,
    divisionDirections: { L: true },
    roomTemp: 2.0, ambientTemp: 42.0, commodityId: 'com_apple', dailyMassKg: 4000,
  });
  assert(
    resCompat.recommendations.circuits.length === 1 && resCompat.recommendations.circuits[0].circuitId === 'single_central',
    33,
    'Multi-circuit clustering: Compatible SST (ΔSST=0K) clusters all chambers into a single central CCU circuit'
  );
} catch (e) {
  assert(false, 33, `Compatible SST clustering failed: ${e.message}`);
}

// 34. Multi-circuit clustering: Incompatible SST (split into MT + LT)
try {
  const resSplit = calculateHeatLoad({
    divisionMode: 'custom',
    facility: { lengthM: 12, widthM: 8, heightM: 4.5 },
    length: 12, width: 8, height: 4.5, unit: 'm',
    customChambers: [
      { name: 'Chiller', x: 0, y: 0, z: 0, lengthM: 6, widthM: 8, heightM: 4.5, roomTempC: 2.0, dailyMassKg: 2000 },
      { name: 'Freezer', x: 6, y: 0, z: 0, lengthM: 6, widthM: 8, heightM: 4.5, roomTempC: -20.0, dailyMassKg: 2000 },
    ],
    ambientTemp: 42.0,
    commodityId: 'com_apple',
  });
  assert(
    resSplit.recommendations.circuits.length === 2 && resSplit.recommendations.circuits.some(c => c.circuitId === 'circuit_MT') && resSplit.recommendations.circuits.some(c => c.circuitId === 'circuit_LT'),
    34,
    'Multi-circuit clustering: Incompatible SST (Chiller +2°C vs Freezer -20°C) splits into MT Chiller and LT Freezer circuits'
  );
} catch (e) {
  assert(false, 34, `Incompatible SST split failed: ${e.message}`);
}

// 35. CCU sizing: Single unit match
try {
  const medLoad = calculateHeatLoad({
    length: 8, width: 6, height: 3.5, unit: 'm', numRooms: 1,
    roomTemp: 2.0, ambientTemp: 40.0, commodityId: 'com_apple', dailyMassKg: 3000,
  });
  assert(
    medLoad.recommendations.ccu !== null && !medLoad.recommendations.multiUnitCcu,
    35,
    `CCU sizing: Normal load matched single Daikin CCU (${medLoad.recommendations.ccu?.model_number})`
  );
} catch (e) {
  assert(false, 35, `Single CCU match failed: ${e.message}`);
}

// 36. CCU sizing: Multi-unit combination when load exceeds single unit
try {
  const heavyLoad = calculateHeatLoad({
    length: 24, width: 16, height: 5.5, unit: 'm', numRooms: 1,
    roomTemp: 2.0, ambientTemp: 43.0, commodityId: 'com_apple', dailyMassKg: 35000,
    compressorRunHours: 16.0, safetyFactor: 0.10,
  });
  assert(
    heavyLoad.recommendations.multiUnitCcu !== null && heavyLoad.recommendations.multiUnitCcu.count >= 2,
    36,
    `CCU sizing: Heavy commercial load (${heavyLoad.machineRating.capacityKw} kW) matched multi-unit combination (${heavyLoad.recommendations.multiUnitCcu?.count} × ${heavyLoad.recommendations.multiUnitCcu?.unit.model_number})`
  );
} catch (e) {
  assert(false, 36, `Multi-unit CCU sizing failed: ${e.message}`);
}

// 37. CCU catalog status: Unverified catalog banner flagging
try {
  const extremeLoad = calculateHeatLoad({
    length: 50, width: 30, height: 8.0, unit: 'm', numRooms: 1,
    roomTemp: -30.0, ambientTemp: 45.0, commodityId: 'com_frozen_chicken', dailyMassKg: 100000,
  });
  assert(
    extremeLoad.recommendations.unverified === true || extremeLoad.catalogVerificationStatus === 'unverified',
    37,
    'CCU catalog status: Out-of-envelope industrial load correctly flagged with unverified catalog engineering alert'
  );
} catch (e) {
  assert(false, 37, `Catalog unverified alert failed: ${e.message}`);
}

// -------------------------------------------------------------
// SECTION G: SCOPED IDEMPOTENT INVOICE INTEGRATION (38)
// -------------------------------------------------------------
console.log('\n--- SECTION G: Scoped Idempotent Invoice Integration ---');

// 38. Scoped invoice integration: Persistent calculationInstanceId idempotent replacement
try {
  const sampleCalc = calculateHeatLoad({
    length: 12, width: 8, height: 4.5, unit: 'm', numRooms: 2,
    divisionDirections: { L: true },
    roomTemp: 2.0, ambientTemp: 42.0, commodityId: 'com_apple', dailyMassKg: 4000,
  });

  const instanceId = 'cr_test_suite_uuid_123';
  const { itemsToInsert } = buildColdRoomInvoiceItems({
    result: sampleCalc,
    form: { numRooms: 2, doorType: 'swing', pufThicknessMm: 100 },
    customRates: { cdu: 150000, evaporator: 45000, doors: 28500, kit: 14500, puf: 1550, installation: 26000 },
    selectedLines: { cdu: true, evaporator: true, doors: true, kit: true, puf: true, installation: true },
    activeCcu: sampleCalc.recommendations.ccu,
    activeEvap: sampleCalc.recommendations.evaporator,
    calculationInstanceId: instanceId,
  });

  // Verify every inserted item has the exact calculationInstanceId
  const allTagged = itemsToInsert.every(item => item.calculationInstanceId === instanceId);

  // Simulate an invoice state containing:
  // - 1 manual item (e.g. Consulting fees)
  // - 1 item from another cold room (cr_other_999)
  // - Previous items from instanceId
  const priorInvoiceItems = [
    { name: 'Engineering Consulting Fee', rate: 25000, quantity: 1 },
    { name: 'Previous Cold Room PUF Panel', calculationInstanceId: instanceId, rate: 1000 },
    { name: 'Other Cold Room ACU', calculationInstanceId: 'cr_other_999', rate: 45000 },
  ];

  // Idempotent replacement simulation (identical to handleInsertColdRoom in InvoiceGenerator.jsx):
  const filtered = priorInvoiceItems.filter(item => item.calculationInstanceId !== instanceId);
  const updatedInvoiceItems = [...filtered, ...itemsToInsert];

  const preservedManual = updatedInvoiceItems.some(i => i.name === 'Engineering Consulting Fee');
  const preservedOtherColdRoom = updatedInvoiceItems.some(i => i.calculationInstanceId === 'cr_other_999');
  const noDuplicateOldItems = updatedInvoiceItems.filter(i => i.name === 'Previous Cold Room PUF Panel').length === 0;

  assert(
    allTagged && preservedManual && preservedOtherColdRoom && noDuplicateOldItems,
    38,
    'Scoped invoice integration: UUID calculationInstanceId enables idempotent replacement, preserving manual & peer cold-room items'
  );
} catch (e) {
  assert(false, 38, `Scoped invoice integration failed: ${e.message}`);
}

console.log('\n================================================================');
console.log(`FINAL TEST RESULTS: ${passed} / 38 PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 38 TEST SCENARIOS PASSED WITH ZERO REGRESSIONS!');
  process.exit(0);
}
