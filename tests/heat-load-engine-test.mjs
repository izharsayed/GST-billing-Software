import { calculateHeatLoad, getThermalCommodities, calculateAirEnthalpy, calculateAirChangesPerDay } from '../server/services/heatLoadCalculator.js';

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

console.log('--- TEST SUITE 1: Thermodynamic Helper Functions ---');
const hAmb = calculateAirEnthalpy(42.0, 0.5);
assert(hAmb > 90 && hAmb < 125, `Ambient enthalpy at 42°C is in realistic range (~106 kJ/kg): actual = ${hAmb.toFixed(2)}`);

const hRoom = calculateAirEnthalpy(2.0, 0.85);
assert(hRoom > 8 && hRoom < 18, `Cold room enthalpy at 2°C is in realistic range (~11 kJ/kg): actual = ${hRoom.toFixed(2)}`);

const airChanges = calculateAirChangesPerDay(432);
assert(airChanges > 3.5 && airChanges < 5.5, `Air changes for 432 m3 volume (~4.31 changes/day): actual = ${airChanges}`);

console.log('\n--- TEST SUITE 2: Thermal Commodities Database ---');
const commodities = getThermalCommodities();
assert(commodities.length >= 16, `Loaded ${commodities.length} commodities (expected at least 16)`);
const apple = commodities.find(c => c.name.includes('Apple'));
assert(apple && apple.cp_above === 3.64 && apple.respiration_rate_mw_kg === 12.0, 'Apple (Seb) properties match ASHRAE table');
const chicken = commodities.find(c => c.name.includes('Chicken'));
assert(chicken && chicken.freezing_point_c === -2.8 && chicken.latent_heat === 247, 'Frozen Chicken properties match ASHRAE table');

console.log('\n--- TEST SUITE 3: Specification Sample Scenario (Apples Chiller) ---');
// From PDF: 12.0 x 8.0 x 4.5m, 100mm PUF, 42°C amb, +2°C room, 8,000 kg Apples @ 28°C inflow, 16h run, 10% SF
const appleResult = calculateHeatLoad({
  length: 12.0,
  width: 8.0,
  height: 4.5,
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

const b = appleResult.thermalBreakdown;
console.log(`  Transmission: ${b.qTransmissionKj} kJ/day`);
console.log(`  Product:      ${b.qProductKj} kJ/day (Sensible: ${b.productComponents.qSensible1Kj}, Resp: ${b.productComponents.qRespirationKj})`);
console.log(`  Infiltration: ${b.qAirInfiltrationKj} kJ/day`);
console.log(`  Internal:     ${b.qInternalKj} kJ/day`);
console.log(`  Equipment:    ${b.qEquipmentKj} kJ/day`);
console.log(`  Total:        ${b.qTotalKj} kJ/day`);
console.log(`  Rating:       ${appleResult.machineRating.capacityKw} kW / ${appleResult.machineRating.capacityTr} TR`);

assert(b.qTransmissionKj >= 290000 && b.qTransmissionKj <= 300000, `Transmission load is ~295,695 kJ/day: ${b.qTransmissionKj}`);
assert(b.productComponents.qSensible1Kj === 757120, `Product sensible load is 757,120 kJ/day: ${b.productComponents.qSensible1Kj}`);
assert(b.productComponents.qRespirationKj === 8294, `Apple respiration load is ~8,294 kJ/day: ${b.productComponents.qRespirationKj}`);
assert(b.qTotalKj > 1200000 && b.qTotalKj < 1500000, `Total daily load is in expected ~1.34M kJ range: ${b.qTotalKj}`);
assert(appleResult.machineRating.capacityKw > 22 && appleResult.machineRating.capacityKw < 28, `Machine capacity kW is in range (22 - 28 kW): ${appleResult.machineRating.capacityKw} kW`);
assert(appleResult.machineRating.capacityTr > 6 && appleResult.machineRating.capacityTr < 8, `Machine capacity TR is in range (6 - 8 TR): ${appleResult.machineRating.capacityTr} TR`);

console.log('\n--- TEST SUITE 4: Freezer Mode Calculation (Frozen Chicken) ---');
// 6.0 x 5.0 x 3.5m room, 150mm PUF, -20°C room, 40°C amb, 4,000 kg Chicken @ 25°C entry
const freezerResult = calculateHeatLoad({
  length: 6.0,
  width: 5.0,
  height: 3.5,
  unit: 'm',
  pufThicknessMm: 150,
  ambientTemp: 40.0,
  roomTemp: -20.0,
  commodityId: 'com_frozen_chicken',
  dailyMassKg: 4000,
  entryTemp: 25.0,
  compressorRunHours: 18.0,
  safetyFactor: 0.10,
});

const fb = freezerResult.thermalBreakdown;
assert(fb.productComponents.mode === 'freezer', 'Branching correctly identified as freezer mode');
assert(fb.productComponents.qSensible1Kj > 0, `Pre-freeze sensible heat > 0: ${fb.productComponents.qSensible1Kj}`);
assert(fb.productComponents.qLatentKj === 4000 * 247, `Latent heat of fusion = 4000 * 247 = ${4000 * 247}: actual = ${fb.productComponents.qLatentKj}`);
assert(fb.productComponents.qSensible2Kj > 0, `Subzero sensible heat > 0: ${fb.productComponents.qSensible2Kj}`);
assert(fb.productComponents.qRespirationKj === 0, 'Frozen goods respiration is 0');
assert(freezerResult.machineRating.capacityTr > 0, `Freezer capacity TR derived: ${freezerResult.machineRating.capacityTr} TR`);

console.log('\n--- TEST SUITE 5: Emerson Commercial Equipment Matching ---');
// Test chiller matching with medium temp load
const medMatch = calculateHeatLoad({
  length: 7.0,
  width: 5.0,
  height: 3.5,
  unit: 'm',
  pufThicknessMm: 100,
  ambientTemp: 40.0,
  roomTemp: 2.0,
  commodityId: 'com_apple',
  dailyMassKg: 3500,
  entryTemp: 25.0,
});

assert(medMatch.recommendations.ccu !== null, 'Emerson CCU matched for medium temp');
console.log(`  Matched Medium CCU: ${medMatch.recommendations.ccu.model_number} (${medMatch.recommendations.ccu.nominal_tr} TR)`);
assert(medMatch.recommendations.ccu.brand_name === 'Emerson', 'Matched CCU brand is Emerson');
assert(medMatch.recommendations.evaporator !== null, 'Commercial DX ACU matched');
console.log(`  Matched Medium ACU: ${medMatch.recommendations.evaporator.model_number} (${medMatch.recommendations.evaporator.capacity_kw} kW)`);

// Test freezer matching with low temp load
const ltMatch = calculateHeatLoad({
  length: 4.0,
  width: 4.0,
  height: 3.0,
  unit: 'm',
  pufThicknessMm: 120,
  ambientTemp: 40.0,
  roomTemp: -20.0,
  commodityId: 'com_frozen_chicken',
  dailyMassKg: 1500,
  entryTemp: 25.0,
});

assert(ltMatch.recommendations.ccu !== null, 'Emerson CCU matched for low temp freezer');
console.log(`  Matched Freezer CCU: ${ltMatch.recommendations.ccu.model_number} (${ltMatch.recommendations.ccu.nominal_tr} TR)`);
assert(ltMatch.recommendations.ccu.brand_name === 'Emerson', 'Matched Freezer CCU brand is Emerson');
assert(ltMatch.recommendations.evaporator !== null, 'Commercial Freezer ACU matched');
console.log(`  Matched Freezer ACU: ${ltMatch.recommendations.evaporator.model_number} (${ltMatch.recommendations.evaporator.capacity_kw} kW)`);

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
