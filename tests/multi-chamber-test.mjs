import { calculateHeatLoad } from '../server/services/heatLoadCalculator.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- TEST SUITE: Multi-Chamber Partitioning Engine (3 Chambers Scenario) ---');
// User specification example:
// Length: 12.0m, Width: 8.0m, Height: 4.5m, Rooms: 3
// PUF: 100mm, Ambient: 42°C, Room: 2°C, Apples 8000kg, 16h run, 10% SF
const result = calculateHeatLoad({
  length: 12.0,
  width: 8.0,
  height: 4.5,
  numRooms: 3,
  unit: 'm',
  pufThicknessMm: 100,
  ambientTemp: 42.0,
  roomTemp: 2.0,
  commodityId: 'com_apple',
  dailyMassKg: 8000,
  entryTemp: 28.0,
  compressorRunHours: 16.0,
  safetyFactor: 0.10,
});

// 1. Geometry and Chamber Dimensions
assert(result.inputs.numRooms === 3, 'numRooms is 3');
assert(result.chambers.length === 3, 'chambers array has length 3');

const c1 = result.chambers[0];
const c2 = result.chambers[1];
const c3 = result.chambers[2];

assert(c1.dimensions.lengthM === 4.0, `Chamber 1 length is 4m: ${c1.dimensions.lengthM}`);
assert(c1.dimensions.widthM === 8.0, `Chamber 1 width is 8m: ${c1.dimensions.widthM}`);
assert(c1.dimensions.heightM === 4.5, `Chamber 1 height is 4.5m: ${c1.dimensions.heightM}`);
assert(c1.dimensions.volumeM3 === 144.0, `Chamber 1 volume is 144 m3: ${c1.dimensions.volumeM3}`);

assert(c2.dimensions.lengthM === 4.0, `Chamber 2 length is 4m: ${c2.dimensions.lengthM}`);
assert(c2.dimensions.volumeM3 === 144.0, `Chamber 2 volume is 144 m3: ${c2.dimensions.volumeM3}`);

assert(result.inputs.dimensions.volumeM3 === 432.0, `Combined facility volume is 432 m3: ${result.inputs.dimensions.volumeM3}`);

// 2. Partition Walls Calculation
assert(result.partitionWalls.count === 2, `Partition walls count is (3 - 1) = 2: ${result.partitionWalls.count}`);
assert(result.partitionWalls.singleWallAreaM2 === 36.0, `Single partition wall area is 8 * 4.5 = 36 m2: ${result.partitionWalls.singleWallAreaM2}`);
assert(result.partitionWalls.totalAreaM2 === 72.0, `Total partition wall area is 2 * 36 = 72 m2: ${result.partitionWalls.totalAreaM2}`);
assert(result.inputs.dimensions.totalPufSurfaceAreaM2 === 444.0, `Total PUF panel area (372 + 72) = 444 m2: ${result.inputs.dimensions.totalPufSurfaceAreaM2}`);

// 3. Automatic Door Generation
assert(result.doors.totalDoors === 3, `Total doors is 3 (1 per chamber): ${result.doors.totalDoors}`);
assert(c1.door.count === 1, 'Chamber 1 has 1 dedicated door');
assert(c2.door.count === 1, 'Chamber 2 has 1 dedicated door');
assert(c3.door.count === 1, 'Chamber 3 has 1 dedicated door');

// 4. Independent Chamber Heat Loads
console.log(`\n  Chamber 1 Load: ${c1.capacityKw} kW / ${c1.capacityTr} TR (Trans: ${c1.thermalBreakdown.qTransmissionKj} kJ)`);
console.log(`  Chamber 2 Load: ${c2.capacityKw} kW / ${c2.capacityTr} TR (Trans: ${c2.thermalBreakdown.qTransmissionKj} kJ)`);
console.log(`  Chamber 3 Load: ${c3.capacityKw} kW / ${c3.capacityTr} TR (Trans: ${c3.thermalBreakdown.qTransmissionKj} kJ)`);
console.log(`  Total Facility Load: ${result.machineRating.capacityKw} kW / ${result.machineRating.capacityTr} TR`);

// Middle chamber (Chamber 2) has less exterior exposure than End chambers (Chamber 1 and 3)
assert(c1.dimensions.exposedAreaM2 === 136.0, `Chamber 1 (End) outer exposed area is 136 m2: ${c1.dimensions.exposedAreaM2}`);
assert(c2.dimensions.exposedAreaM2 === 100.0, `Chamber 2 (Middle) outer exposed area is 100 m2: ${c2.dimensions.exposedAreaM2}`);
assert(c3.dimensions.exposedAreaM2 === 136.0, `Chamber 3 (End) outer exposed area is 136 m2: ${c3.dimensions.exposedAreaM2}`);

// Sum of exposed areas across chambers equals the facility external envelope!
assert(c1.dimensions.exposedAreaM2 + c2.dimensions.exposedAreaM2 + c3.dimensions.exposedAreaM2 === 372.0, 'Sum of chamber exposed areas = outer envelope (372 m2)');

// Transmission loads reflect this physics:
assert(c1.thermalBreakdown.qTransmissionKj > c2.thermalBreakdown.qTransmissionKj, 'Chamber 1 transmission > Chamber 2 transmission (End vs Middle)');
assert(c1.capacityKw > c2.capacityKw, 'Chamber 1 capacity > Chamber 2 capacity');

// 5. Equipment Matching
assert(c1.evaporator !== null, `Chamber 1 has matched indoor evaporator: ${c1.evaporator?.model_number}`);
assert(c2.evaporator !== null, `Chamber 2 has matched indoor evaporator: ${c2.evaporator?.model_number}`);
assert(c3.evaporator !== null, `Chamber 3 has matched indoor evaporator: ${c3.evaporator?.model_number}`);
assert(result.recommendations.ccu !== null, `Central outdoor CCU is matched: ${result.recommendations.ccu?.model_number} (${result.recommendations.ccu?.nominal_tr} TR)`);

console.log('\n========================================');
console.log(`MULTI-CHAMBER RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================');
if (failed > 0) process.exit(1);

