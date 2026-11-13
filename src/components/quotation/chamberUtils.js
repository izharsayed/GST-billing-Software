/**
 * Multi-Chamber Cold Room Engineering Utilities
 * Provides resilient 3D multi-axis geometry, custom per-room coordinate sizing,
 * deterministic door placement with egress graph validation, configurable PUF construction,
 * multi-circuit refrigeration clustering, and scoped idempotent invoice item generation.
 */

export const PUF_SPECS = {
  60: { thicknessM: 0.06, k: 0.023 },
  80: { thicknessM: 0.08, k: 0.023 },
  100: { thicknessM: 0.10, k: 0.023 },
  120: { thicknessM: 0.12, k: 0.023 },
  150: { thicknessM: 0.15, k: 0.023 },
};

export const FLOOR_CONSTRUCTION_TYPES = [
  { id: 'puf', label: 'Insulated PUF Panels (Included in PUF Panel Area)', defaultU: 0.230, includedInProcurement: true },
  { id: 'concrete_subslab', label: 'Civil Concrete Slab with Sub-Slab XPS/PUF (Excluded from Panel Procurement)', defaultU: 0.280, includedInProcurement: false },
  { id: 'uninsulated_ground', label: 'Uninsulated Concrete Floor on Ground (Excluded from Panel Procurement)', defaultU: 0.450, includedInProcurement: false },
];

export const COVERAGE_MODES = [
  { id: 'full', label: 'Full Facility Coverage Required (Default)' },
  { id: 'partial', label: 'Partial Facility Coverage Allowed' },
];

export const DOOR_OPTIONS = [
  { id: 'swing', label: 'Heavy-Duty Swing Flush Type (34" × 78" / 0.86m × 1.98m)', short: 'Swing Flush Door', widthM: 0.86, heightM: 1.98, defaultRate: 28500 },
  { id: 'sliding', label: 'Heavy-Duty Industrial Sliding Door (1.20m × 2.10m)', short: 'Industrial Sliding Door', widthM: 1.20, heightM: 2.10, defaultRate: 42000 },
  { id: 'hatch', label: 'Manual Flush Reach-In Hatch Door (0.60m × 0.60m)', short: 'Hatch Door', widthM: 0.60, heightM: 0.60, defaultRate: 16500 },
];

/**
 * Calculate psychrometric enthalpy of moist air (kJ/kg)
 * Standard ASHRAE Fundamentals formulation
 */
export function calculateAirEnthalpy(tempC, relativeHumidity = 0.5) {
  const T = Number(tempC);
  const rh = Math.max(0.01, Math.min(1.0, Number(relativeHumidity)));
  const pSat = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
  const pv = rh * pSat;
  const W = Math.max(0.0001, 0.622 * (pv / Math.max(0.1, 101.325 - pv)));
  return Math.round((1.006 * T + W * (2501.0 + 1.86 * T)) * 100) / 100;
}

/**
 * Calculate moist air density (kg/m³)
 */
export function calculateAirDensity(tempC, relativeHumidity = 0.5, pressureKpa = 101.325) {
  const T = Number(tempC);
  const Tk = T + 273.15;
  const rh = Math.max(0.01, Math.min(1.0, Number(relativeHumidity)));
  const pSat = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
  const pv = rh * pSat * 1000; // Pa
  const pDry = pressureKpa * 1000 - pv;
  const rhoDry = pDry / (287.058 * Tk);
  const rhoVapor = pv / (461.5 * Tk);
  return Math.round((rhoDry + rhoVapor) * 1000) / 1000;
}

/**
 * Calculate daily room air changes based on volume
 * ASHRAE Chapter 24 correlation: n = 70 * V^(-0.46) [day^-1]
 */
export function calculateAirChangesPerDay(volumeM3) {
  const v = Math.max(1, Number(volumeM3));
  const n = 70 * Math.pow(v, -0.46);
  return Math.max(1.5, Math.min(40.0, Math.round(n * 1000) / 1000));
}

/**
 * Gosney-Olsson Door Infiltration Formulation
 * Reference: Gosney & Olsson (1975); ASHRAE Handbook - Refrigeration, Chapter 24 Eq. 13.
 * Returns { qKw, qDailyKj, parameters, isProvisional: true }
 */
export function calculateGosneyOlssonInfiltration({
  doorwayWidthM = 1.0,
  doorwayHeightM = 2.1,
  ambientTempC = 42.0,
  ambientRh = 0.50,
  roomTempC = 2.0,
  roomRh = 0.85,
  openFrequencyPerHour = 20,
  openDurationSec = 30,
  protectionFactor = 0.60, // e.g. PVC strip curtain = 0.60
  motionFactor = 1.0,
}) {
  const Wd = Math.max(0.5, Number(doorwayWidthM));
  const Hd = Math.max(0.5, Number(doorwayHeightM));
  const Ad = Math.round(Wd * Hd * 1000) / 1000;

  const hAmb = calculateAirEnthalpy(ambientTempC, ambientRh);
  const hRoom = calculateAirEnthalpy(roomTempC, roomRh);
  const deltaH = Math.max(1.0, hAmb - hRoom);

  const rhoAmb = calculateAirDensity(ambientTempC, ambientRh);
  const rhoRoom = calculateAirDensity(roomTempC, roomRh);
  const densityRatio = Math.max(0.001, 1 - (rhoAmb / rhoRoom));

  const g = 9.81;
  const velocityTerm = Math.sqrt(g * Hd * densityRatio);

  const nOpen = Math.max(0, Number(openFrequencyPerHour));
  const tOpen = Math.max(0, Number(openDurationSec));
  const Dt = Math.min(1.0, (nOpen * tOpen) / 3600);

  const Eprotect = Math.max(0, Math.min(1.0, Number(protectionFactor)));
  const Fm = Math.max(0.5, Number(motionFactor));

  // Instantaneous rate during open period (kW)
  const qOpenKw = 0.221 * Ad * deltaH * rhoRoom * velocityTerm * Fm;
  // Average rate factoring open decimal time fraction and doorway protection (kW)
  const qAverageKw = Math.round(qOpenKw * Dt * (1 - Eprotect) * 1000) / 1000;
  // Total daily heat ingress (kJ/day)
  const qDailyKj = Math.round(qAverageKw * 86400);

  return {
    qKw: qAverageKw,
    qAverageKw,
    qDailyKj,
    qOpenKw: Math.round(qOpenKw * 100) / 100,
    doorAreaM2: Ad,
    deltaH,
    rhoAmb,
    rhoRoom,
    velocityTerm: Math.round(velocityTerm * 1000) / 1000,
    decimalTimeFraction: Math.round(Dt * 10000) / 10000,
    isProvisional: true,
    reference: 'Gosney & Olsson (1975) / ASHRAE Chapter 24 Eq. 13',
  };
}

/**
 * Translates Outer Dimensions to Clear Internal Usable Dimensions via PUF Thickness
 */
export function calculateClearInternalDimensions({
  lengthM,
  widthM,
  heightM,
  numRoomsL = 1,
  numRoomsW = 1,
  numRoomsH = 1,
  pufThicknessMm = 100,
  floorConstruction = 'puf',
}) {
  const tPuf = (Number(pufThicknessMm) || 100) / 1000;
  const hasFloorPuf = floorConstruction === 'puf';

  const clearLengthTotal = Math.max(0.5, lengthM - 2 * tPuf - (numRoomsL - 1) * tPuf);
  const clearWidthTotal = Math.max(0.5, widthM - 2 * tPuf - (numRoomsW - 1) * tPuf);
  const clearHeightTotal = Math.max(0.5, heightM - (hasFloorPuf ? 2 : 1) * tPuf - (numRoomsH - 1) * tPuf);

  const clearLengthM = Math.round((clearLengthTotal / numRoomsL) * 1000) / 1000;
  const clearWidthM = Math.round((clearWidthTotal / numRoomsW) * 1000) / 1000;
  const clearHeightM = Math.round((clearHeightTotal / numRoomsH) * 1000) / 1000;
  const usableVolumeM3 = Math.round(clearLengthM * clearWidthM * clearHeightM * 100) / 100;

  return {
    tPuf,
    clearLengthM,
    clearWidthM,
    clearHeightM,
    usableVolumeM3,
  };
}

/**
 * Standard Multi-Axis Geometry Generator
 * Generates valid rectangular bounding boxes for 1D, 2D composite factor grids,
 * and 2D prime proportional equal-volume bay partitions.
 */
export function generateStandardChamberLayout({
  lengthM = 12.0,
  widthM = 8.0,
  heightM = 4.5,
  numRooms = 1,
  divisionDirections = { L: false, W: false, H: false },
  pufThicknessMm = 100,
  floorConstruction = 'puf',
}) {
  const N = Math.max(1, Math.round(Number(numRooms)));
  const L = Math.round(Number(lengthM) * 100) / 100;
  const W = Math.round(Number(widthM) * 100) / 100;
  const H = Math.round(Number(heightM) * 100) / 100;
  const facilityVolumeM3 = Math.round(L * W * H * 100) / 100;

  // Normalize directions input (supports array ['L', 'W'] or object { L: true, W: true })
  let activeDirs = [];
  if (Array.isArray(divisionDirections)) {
    activeDirs = [...new Set(divisionDirections.map(d => String(d).toUpperCase()))].filter(d => ['L', 'W', 'H'].includes(d));
  } else if (typeof divisionDirections === 'object' && divisionDirections !== null) {
    if (divisionDirections.L || divisionDirections.divideL) activeDirs.push('L');
    if (divisionDirections.W || divisionDirections.divideW) activeDirs.push('W');
    if (divisionDirections.H || divisionDirections.divideH) activeDirs.push('H');
  }

  // VALIDATION CHECKS
  if (N === 1) {
    // Single room undivided
    const clear = calculateClearInternalDimensions({
      lengthM: L, widthM: W, heightM: H, numRoomsL: 1, numRoomsW: 1, numRoomsH: 1,
      pufThicknessMm, floorConstruction,
    });
    return {
      success: true,
      numRooms: 1,
      mode: 'single',
      chambers: [{
        chamberNumber: 1,
        name: 'Chamber 1',
        origin: { x: 0, y: 0, z: 0 },
        dimensions: { lengthM: L, widthM: W, heightM: H, volumeM3: facilityVolumeM3 },
        clearDimensions: clear,
        door: null, // to be populated by placeAutomaticDoors
      }],
      partitions: [],
      outerEnvelope: { lengthM: L, widthM: W, heightM: H, volumeM3: facilityVolumeM3 },
    };
  }

  if (activeDirs.length === 0) {
    throw new Error(`Please select at least one division direction (Length, Width, or Height) to partition the cold room into ${N} chambers.`);
  }

  if (activeDirs.length > 2) {
    throw new Error('Maximum two division directions can be combined simultaneously. Slicing across all three directions is disallowed.');
  }

  if (N === 2 && activeDirs.length === 2) {
    throw new Error('Slicing into N=2 axis-aligned rectangular chambers can only divide 1 spatial direction. For 2-direction division, set N ≥ 3.');
  }

  const chambers = [];
  const partitions = [];

  // CASE 1: Exactly 1 Direction Selected
  if (activeDirs.length === 1) {
    const dir = activeDirs[0];
    const nL = dir === 'L' ? N : 1;
    const nW = dir === 'W' ? N : 1;
    const nH = dir === 'H' ? N : 1;

    const dL = Math.round((L / nL) * 1000) / 1000;
    const dW = Math.round((W / nW) * 1000) / 1000;
    const dH = Math.round((H / nH) * 1000) / 1000;
    const chVol = Math.round((facilityVolumeM3 / N) * 100) / 100;

    const clear = calculateClearInternalDimensions({
      lengthM: L, widthM: W, heightM: H, numRoomsL: nL, numRoomsW: nW, numRoomsH: nH,
      pufThicknessMm, floorConstruction,
    });

    for (let i = 0; i < N; i++) {
      const x = dir === 'L' ? Math.round(i * dL * 1000) / 1000 : 0;
      const y = dir === 'W' ? Math.round(i * dW * 1000) / 1000 : 0;
      const z = dir === 'H' ? Math.round(i * dH * 1000) / 1000 : 0;

      chambers.push({
        chamberNumber: i + 1,
        name: `Chamber ${i + 1}`,
        origin: { x, y, z },
        dimensions: { lengthM: dL, widthM: dW, heightM: dH, volumeM3: chVol },
        clearDimensions: clear,
        door: null,
      });

      if (i > 0) {
        if (dir === 'L') {
          partitions.push({
            type: 'transverse',
            normalAxis: 'X',
            position: x,
            spanY: [0, W],
            spanZ: [0, H],
            areaM2: Math.round(W * H * 100) / 100,
            between: [i, i + 1],
          });
        } else if (dir === 'W') {
          partitions.push({
            type: 'longitudinal',
            normalAxis: 'Y',
            position: y,
            spanX: [0, L],
            spanZ: [0, H],
            areaM2: Math.round(L * H * 100) / 100,
            between: [i, i + 1],
          });
        } else if (dir === 'H') {
          partitions.push({
            type: 'deck',
            normalAxis: 'Z',
            position: z,
            spanX: [0, L],
            spanY: [0, W],
            areaM2: Math.round(L * W * 100) / 100,
            between: [i, i + 1],
          });
        }
      }
    }

    return {
      success: true,
      numRooms: N,
      mode: '1D',
      activeDirections: activeDirs,
      chambers,
      partitions,
      outerEnvelope: { lengthM: L, widthM: W, heightM: H, volumeM3: facilityVolumeM3 },
    };
  }

  // CASE 2: Exactly 2 Directions Selected
  const dir1 = activeDirs[0];
  const dir2 = activeDirs[1];

  // Helper: map dimension character to value
  const getDim = (d) => (d === 'L' ? L : d === 'W' ? W : H);
  const D1 = getDim(dir1);
  const D2 = getDim(dir2);
  const dir3 = ['L', 'W', 'H'].find(d => !activeDirs.includes(d));
  const D3 = getDim(dir3);

  // Check if N factors into integers n1, n2 >= 2
  const factorPairs = [];
  for (let f = 2; f <= Math.floor(Math.sqrt(N)); f++) {
    if (N % f === 0) {
      factorPairs.push([f, N / f]);
      if (f !== N / f) factorPairs.push([N / f, f]);
    }
  }

  const isCompositeFactorable = factorPairs.length > 0;

  if (isCompositeFactorable) {
    // Pick factor pair minimizing aspect ratio distortion |(D1/n1) / (D2/n2) - 1|
    let bestPair = factorPairs[0];
    let minDiff = Infinity;
    for (const [n1, n2] of factorPairs) {
      const aspect = (D1 / n1) / (D2 / n2);
      const diff = Math.abs(aspect - 1);
      if (diff < minDiff) {
        minDiff = diff;
        bestPair = [n1, n2];
      }
    }

    const [n1, n2] = bestPair;
    const d1 = Math.round((D1 / n1) * 1000) / 1000;
    const d2 = Math.round((D2 / n2) * 1000) / 1000;
    const chVol = Math.round((facilityVolumeM3 / N) * 100) / 100;

    let chIdx = 1;
    for (let u = 0; u < n1; u++) {
      for (let v = 0; v < n2; v++) {
        const p1 = Math.round(u * d1 * 1000) / 1000;
        const p2 = Math.round(v * d2 * 1000) / 1000;

        const axisMap = { L: 'x', W: 'y', H: 'z' };
        const origin = { x: 0, y: 0, z: 0 };
        const dims = {};

        origin[axisMap[dir1]] = p1;
        origin[axisMap[dir2]] = p2;
        origin[axisMap[dir3]] = 0;
        origin.l = origin.x;
        origin.w = origin.y;
        origin.h = origin.z;

        dims[dir1 === 'L' ? 'lengthM' : dir1 === 'W' ? 'widthM' : 'heightM'] = d1;
        dims[dir2 === 'L' ? 'lengthM' : dir2 === 'W' ? 'widthM' : 'heightM'] = d2;
        dims[dir3 === 'L' ? 'lengthM' : dir3 === 'W' ? 'widthM' : 'heightM'] = D3;
        dims.volumeM3 = chVol;

        const clear = calculateClearInternalDimensions({
          lengthM: dims.lengthM, widthM: dims.widthM, heightM: dims.heightM,
          numRoomsL: 1, numRoomsW: 1, numRoomsH: 1,
          pufThicknessMm, floorConstruction,
        });

        chambers.push({
          chamberNumber: chIdx++,
          name: `Chamber ${chIdx - 1}`,
          origin,
          dimensions: dims,
          clearDimensions: clear,
          door: null,
        });
      }
    }

    // Generate continuous grid partition walls
    // Partitions normal to dir1: (n1 - 1) walls
    for (let u = 1; u < n1; u++) {
      const pos = Math.round(u * d1 * 1000) / 1000;
      partitions.push({
        type: dir1 === 'L' ? 'transverse' : dir1 === 'W' ? 'longitudinal' : 'deck',
        normalAxis: dir1 === 'L' ? 'X' : dir1 === 'W' ? 'Y' : 'Z',
        position: pos,
        areaM2: Math.round(D2 * D3 * 100) / 100,
        continuous: true,
      });
    }
    // Partitions normal to dir2: (n2 - 1) walls
    for (let v = 1; v < n2; v++) {
      const pos = Math.round(v * d2 * 1000) / 1000;
      partitions.push({
        type: dir2 === 'L' ? 'transverse' : dir2 === 'W' ? 'longitudinal' : 'deck',
        normalAxis: dir2 === 'L' ? 'X' : dir2 === 'W' ? 'Y' : 'Z',
        position: pos,
        areaM2: Math.round(D1 * D3 * 100) / 100,
        continuous: true,
      });
    }

    return {
      success: true,
      numRooms: N,
      mode: '2D_grid',
      activeDirections: activeDirs,
      gridFactors: { [dir1]: n1, [dir2]: n2 },
      chambers,
      partitions,
      outerEnvelope: { lengthM: L, widthM: W, heightM: H, volumeM3: facilityVolumeM3 },
    };
  }

  // Non-Factorable / Prime Numbers (N=3, 5, 7) via Proportional Equal-Volume Bay Partition
  const k1 = Math.floor(N / 2);
  const k2 = Math.ceil(N / 2);

  const D1_Bay1 = Math.round((D1 * (k1 / N)) * 1000) / 1000;
  const D1_Bay2 = Math.round((D1 - D1_Bay1) * 1000) / 1000;

  const d2_Bay1 = Math.round((D2 / k1) * 1000) / 1000;
  const d2_Bay2 = Math.round((D2 / k2) * 1000) / 1000;
  const chVol = Math.round((facilityVolumeM3 / N) * 100) / 100;

  let chIdx = 1;

  const axisMap = { L: 'x', W: 'y', H: 'z' };

  // Bay 1 Chambers (k1 count)
  for (let v = 0; v < k1; v++) {
    const origin = { x: 0, y: 0, z: 0 };
    const dims = {};

    origin[axisMap[dir1]] = 0;
    origin[axisMap[dir2]] = Math.round(v * d2_Bay1 * 1000) / 1000;
    origin[axisMap[dir3]] = 0;
    origin.l = origin.x;
    origin.w = origin.y;
    origin.h = origin.z;

    dims[dir1 === 'L' ? 'lengthM' : dir1 === 'W' ? 'widthM' : 'heightM'] = D1_Bay1;
    dims[dir2 === 'L' ? 'lengthM' : dir2 === 'W' ? 'widthM' : 'heightM'] = d2_Bay1;
    dims[dir3 === 'L' ? 'lengthM' : dir3 === 'W' ? 'widthM' : 'heightM'] = D3;
    dims.volumeM3 = chVol;

    const clear = calculateClearInternalDimensions({
      lengthM: dims.lengthM, widthM: dims.widthM, heightM: dims.heightM,
      numRoomsL: 1, numRoomsW: 1, numRoomsH: 1,
      pufThicknessMm, floorConstruction,
    });

    chambers.push({
      chamberNumber: chIdx++,
      name: `Chamber ${chIdx - 1}`,
      bay: 1,
      origin,
      dimensions: dims,
      clearDimensions: clear,
      door: null,
    });
  }

  // Bay 2 Chambers (k2 count)
  for (let v = 0; v < k2; v++) {
    const origin = { x: 0, y: 0, z: 0 };
    const dims = {};

    origin[axisMap[dir1]] = D1_Bay1;
    origin[axisMap[dir2]] = Math.round(v * d2_Bay2 * 1000) / 1000;
    origin[axisMap[dir3]] = 0;
    origin.l = origin.x;
    origin.w = origin.y;
    origin.h = origin.z;

    dims[dir1 === 'L' ? 'lengthM' : dir1 === 'W' ? 'widthM' : 'heightM'] = D1_Bay2;
    dims[dir2 === 'L' ? 'lengthM' : dir2 === 'W' ? 'widthM' : 'heightM'] = d2_Bay2;
    dims[dir3 === 'L' ? 'lengthM' : dir3 === 'W' ? 'widthM' : 'heightM'] = D3;
    dims.volumeM3 = chVol;

    const clear = calculateClearInternalDimensions({
      lengthM: dims.lengthM, widthM: dims.widthM, heightM: dims.heightM,
      numRoomsL: 1, numRoomsW: 1, numRoomsH: 1,
      pufThicknessMm, floorConstruction,
    });

    chambers.push({
      chamberNumber: chIdx++,
      name: `Chamber ${chIdx - 1}`,
      bay: 2,
      origin,
      dimensions: dims,
      clearDimensions: clear,
      door: null,
    });
  }

  // Partitions for Proportional Bay:
  // 1. Primary dividing wall between Bay 1 and Bay 2:
  partitions.push({
    type: dir1 === 'L' ? 'transverse' : dir1 === 'W' ? 'longitudinal' : 'deck',
    normalAxis: dir1 === 'L' ? 'X' : dir1 === 'W' ? 'Y' : 'Z',
    position: D1_Bay1,
    areaM2: Math.round(D2 * D3 * 100) / 100,
    spanD2: [0, D2],
    spanD3: [0, D3],
    isPrimaryBayWall: true,
  });

  // 2. Sub-partitions inside Bay 1 (k1 - 1 walls):
  for (let v = 1; v < k1; v++) {
    partitions.push({
      type: dir2 === 'L' ? 'transverse' : dir2 === 'W' ? 'longitudinal' : 'deck',
      normalAxis: dir2 === 'L' ? 'X' : dir2 === 'W' ? 'Y' : 'Z',
      position: Math.round(v * d2_Bay1 * 1000) / 1000,
      areaM2: Math.round(D1_Bay1 * D3 * 100) / 100,
      bay: 1,
    });
  }

  // 3. Sub-partitions inside Bay 2 (k2 - 1 walls):
  for (let v = 1; v < k2; v++) {
    partitions.push({
      type: dir2 === 'L' ? 'transverse' : dir2 === 'W' ? 'longitudinal' : 'deck',
      normalAxis: dir2 === 'L' ? 'X' : dir2 === 'W' ? 'Y' : 'Z',
      position: Math.round(v * d2_Bay2 * 1000) / 1000,
      areaM2: Math.round(D1_Bay2 * D3 * 100) / 100,
      bay: 2,
    });
  }

  return {
    success: true,
    numRooms: N,
    mode: '2D_prime_proportional_bay',
    activeDirections: activeDirs,
    bayAllocation: { bay1: { chambers: k1, spanD1: D1_Bay1 }, bay2: { chambers: k2, spanD1: D1_Bay2 } },
    chambers,
    partitions,
    outerEnvelope: { lengthM: L, widthM: W, heightM: H, volumeM3: facilityVolumeM3 },
  };
}

/**
 * Custom Per-Room 3D Coordinate Validator & Partition Extractor
 */
export function validateCustomChamberLayout({
  facility = { lengthM: 12.0, widthM: 8.0, heightM: 4.5 },
  chambers = [],
  coverageMode = 'full',
  pufThicknessMm = 100,
  floorConstruction = 'puf',
}) {
  const L = Number(facility.lengthM) || 12.0;
  const W = Number(facility.widthM) || 8.0;
  const H = Number(facility.heightM) || 4.5;
  const facilityVolumeM3 = Math.round(L * W * H * 100) / 100;

  if (!Array.isArray(chambers) || chambers.length === 0) {
    throw new Error('Custom per-room mode requires at least one chamber definition.');
  }

  const validatedChambers = [];
  let totalChamberVolumeM3 = 0;

  for (let i = 0; i < chambers.length; i++) {
    const ch = chambers[i];
    const num = i + 1;
    const l = Number(ch.dimensions?.lengthM ?? ch.lengthM);
    const w = Number(ch.dimensions?.widthM ?? ch.widthM);
    const h = Number(ch.dimensions?.heightM ?? ch.heightM);

    if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
      throw new Error(`Chamber ${num} has invalid dimensions. Length, Width, and Height must be positive non-zero numbers.`);
    }

    const x = Number(ch.origin?.x ?? ch.x ?? 0);
    const y = Number(ch.origin?.y ?? ch.y ?? 0);
    const z = Number(ch.origin?.z ?? ch.z ?? 0);

    if (isNaN(x) || isNaN(y) || isNaN(z) || x < 0 || y < 0 || z < 0) {
      throw new Error(`Chamber ${num} has invalid origin coordinates. Origins must be non-negative numbers.`);
    }

    // Boundary Containment check
    if (x + l > L + 0.001) {
      throw new Error(`Chamber ${num} extends beyond facility boundary along Length [X: ${(x + l).toFixed(2)}m > ${L}m].`);
    }
    if (y + w > W + 0.001) {
      throw new Error(`Chamber ${num} extends beyond facility boundary along Width [Y: ${(y + w).toFixed(2)}m > ${W}m].`);
    }
    if (z + h > H + 0.001) {
      throw new Error(`Chamber ${num} extends beyond facility boundary along Height [Z: ${(z + h).toFixed(2)}m > ${H}m].`);
    }

    const vol = Math.round(l * w * h * 100) / 100;
    totalChamberVolumeM3 += vol;

    const clear = calculateClearInternalDimensions({
      lengthM: l, widthM: w, heightM: h,
      numRoomsL: 1, numRoomsW: 1, numRoomsH: 1,
      pufThicknessMm, floorConstruction,
    });

    validatedChambers.push({
      chamberNumber: num,
      name: ch.name || `Chamber ${num}`,
      origin: { x, y, z },
      dimensions: { lengthM: l, widthM: w, heightM: h, volumeM3: vol },
      clearDimensions: clear,
      roomTempC: Number(ch.roomTempC ?? 2.0),
      door: ch.door || null,
    });
  }

  // Pairwise 3D Overlap Detection
  for (let i = 0; i < validatedChambers.length; i++) {
    for (let j = i + 1; j < validatedChambers.length; j++) {
      const a = validatedChambers[i];
      const b = validatedChambers[j];

      const overlapX = Math.max(0, Math.min(a.origin.x + a.dimensions.lengthM, b.origin.x + b.dimensions.lengthM) - Math.max(a.origin.x, b.origin.x));
      const overlapY = Math.max(0, Math.min(a.origin.y + a.dimensions.widthM, b.origin.y + b.dimensions.widthM) - Math.max(a.origin.y, b.origin.y));
      const overlapZ = Math.max(0, Math.min(a.origin.z + a.dimensions.heightM, b.origin.z + b.dimensions.heightM) - Math.max(a.origin.z, b.origin.z));

      if (overlapX > 0.001 && overlapY > 0.001 && overlapZ > 0.001) {
        const overlapVol = Math.round(overlapX * overlapY * overlapZ * 100) / 100;
        throw new Error(`Overlap detected between Chamber ${a.chamberNumber} and Chamber ${b.chamberNumber} (overlapping volume: ${overlapVol} m³).`);
      }
    }
  }

  totalChamberVolumeM3 = Math.round(totalChamberVolumeM3 * 100) / 100;
  const unallocatedVolumeM3 = Math.max(0, Math.round((facilityVolumeM3 - totalChamberVolumeM3) * 100) / 100);

  // Coverage check
  if (coverageMode === 'full') {
    if (Math.abs(facilityVolumeM3 - totalChamberVolumeM3) > 0.01) {
      throw new Error(`Unallocated volume of ${unallocatedVolumeM3} m³ detected. Full Facility Coverage required. Please adjust chamber spans to completely fill ${facilityVolumeM3} m³ or switch to Partial Facility Coverage.`);
    }
  }

  // Extract shared partitions between adjacent chambers
  const partitions = [];
  for (let i = 0; i < validatedChambers.length; i++) {
    for (let j = i + 1; j < validatedChambers.length; j++) {
      const a = validatedChambers[i];
      const b = validatedChambers[j];

      // Check touching on X face
      if (Math.abs((a.origin.x + a.dimensions.lengthM) - b.origin.x) < 0.001 || Math.abs((b.origin.x + b.dimensions.lengthM) - a.origin.x) < 0.001) {
        const spanY = Math.max(0, Math.min(a.origin.y + a.dimensions.widthM, b.origin.y + b.dimensions.widthM) - Math.max(a.origin.y, b.origin.y));
        const spanZ = Math.max(0, Math.min(a.origin.z + a.dimensions.heightM, b.origin.z + b.dimensions.heightM) - Math.max(a.origin.z, b.origin.z));
        if (spanY > 0.001 && spanZ > 0.001) {
          partitions.push({
            type: 'transverse',
            normalAxis: 'X',
            position: Math.abs((a.origin.x + a.dimensions.lengthM) - b.origin.x) < 0.001 ? b.origin.x : a.origin.x,
            areaM2: Math.round(spanY * spanZ * 100) / 100,
            chambers: [a.chamberNumber, b.chamberNumber],
          });
        }
      }

      // Check touching on Y face
      if (Math.abs((a.origin.y + a.dimensions.widthM) - b.origin.y) < 0.001 || Math.abs((b.origin.y + b.dimensions.widthM) - a.origin.y) < 0.001) {
        const spanX = Math.max(0, Math.min(a.origin.x + a.dimensions.lengthM, b.origin.x + b.dimensions.lengthM) - Math.max(a.origin.x, b.origin.x));
        const spanZ = Math.max(0, Math.min(a.origin.z + a.dimensions.heightM, b.origin.z + b.dimensions.heightM) - Math.max(a.origin.z, b.origin.z));
        if (spanX > 0.001 && spanZ > 0.001) {
          partitions.push({
            type: 'longitudinal',
            normalAxis: 'Y',
            position: Math.abs((a.origin.y + a.dimensions.widthM) - b.origin.y) < 0.001 ? b.origin.y : a.origin.y,
            areaM2: Math.round(spanX * spanZ * 100) / 100,
            chambers: [a.chamberNumber, b.chamberNumber],
          });
        }
      }

      // Check touching on Z face
      if (Math.abs((a.origin.z + a.dimensions.heightM) - b.origin.z) < 0.001 || Math.abs((b.origin.z + b.dimensions.heightM) - a.origin.z) < 0.001) {
        const spanX = Math.max(0, Math.min(a.origin.x + a.dimensions.lengthM, b.origin.x + b.dimensions.lengthM) - Math.max(a.origin.x, b.origin.x));
        const spanY = Math.max(0, Math.min(a.origin.y + a.dimensions.widthM, b.origin.y + b.dimensions.widthM) - Math.max(a.origin.y, b.origin.y));
        if (spanX > 0.001 && spanY > 0.001) {
          partitions.push({
            type: 'deck',
            normalAxis: 'Z',
            position: Math.abs((a.origin.z + a.dimensions.heightM) - b.origin.z) < 0.001 ? b.origin.z : a.origin.z,
            areaM2: Math.round(spanX * spanY * 100) / 100,
            chambers: [a.chamberNumber, b.chamberNumber],
          });
        }
      }
    }
  }

  const coveragePercent = Math.round((totalChamberVolumeM3 / facilityVolumeM3) * 100);

  return {
    success: true,
    mode: 'custom',
    coverageMode,
    facilityVolumeM3,
    totalChamberVolumeM3,
    unallocatedVolumeM3,
    coveragePercent,
    chambers: validatedChambers,
    partitions,
    outerEnvelope: { lengthM: L, widthM: W, heightM: H, volumeM3: facilityVolumeM3 },
  };
}

/**
 * Deterministic Door Placer with Graph Egress Route Validator
 * Supports both options object: { chambers, facility, doorType }
 * and positional parameters: (chambers, facility, doorType)
 */
export function placeAutomaticDoors(arg1, arg2, arg3) {
  let chambers = [];
  let facility = { lengthM: 12.0, widthM: 8.0, heightM: 4.5 };
  let customDoors = [];
  let doorOptionId = 'swing';

  if (Array.isArray(arg1)) {
    chambers = arg1;
    facility = arg2?.outerEnvelope || arg2 || facility;
    if (typeof arg3 === 'string') {
      doorOptionId = arg3;
    } else if (arg3 && typeof arg3 === 'object') {
      doorOptionId = arg3.doorOptionId || arg3.doorType || 'swing';
      customDoors = Array.isArray(arg3.customDoors) ? arg3.customDoors : [];
    }
  } else if (arg1 && typeof arg1 === 'object') {
    chambers = arg1.chambers || [];
    facility = arg1.facility || arg1.outerEnvelope || facility;
    customDoors = arg1.customDoors || [];
    doorOptionId = arg1.doorOptionId || arg1.doorType || 'swing';
  }
  const L = Number(facility.lengthM) || 12.0;
  const W = Number(facility.widthM) || 8.0;
  const H = Number(facility.heightM) || 4.5;

  const defaultDoorOption = DOOR_OPTIONS.find(d => d.id === doorOptionId) || DOOR_OPTIONS[0];
  const placedDoors = [];
  const wallPlacements = { front: [], back: [], left: [], right: [], partitions: [] };

  // Adjacency graph for egress reachability
  const egressGraph = { exterior: [] };
  chambers.forEach(c => { egressGraph[c.chamberNumber] = []; });

  for (let i = 0; i < chambers.length; i++) {
    const ch = chambers[i];
    const chNum = ch.chamberNumber;

    const ox = Number(ch.origin?.x ?? ch.origin?.l ?? 0);
    const oy = Number(ch.origin?.y ?? ch.origin?.w ?? 0);
    const oz = Number(ch.origin?.z ?? ch.origin?.h ?? 0);

    // Check custom door assignment if provided
    const custom = customDoors.find(cd => cd.chamberNumber === chNum);
    const doorW = Number(custom?.widthM || defaultDoorOption.widthM);
    const doorH = Number(custom?.heightM || defaultDoorOption.heightM);

    let hostWall = custom?.hostWall || null;
    let doorOrigin = null;

    if (!hostWall) {
      // Deterministic Priority 1: External Walls
      // Priority 1A: Front wall (Y = 0)
      if (Math.abs(oy) < 0.001) {
        hostWall = 'front';
        doorOrigin = {
          x: Math.round((ox + (ch.dimensions.lengthM - doorW) / 2) * 100) / 100,
          y: 0,
          z: oz,
        };
      } else if (Math.abs(ox) < 0.001) {
        // Priority 1B: Left end wall (X = 0)
        hostWall = 'left';
        doorOrigin = {
          x: 0,
          y: Math.round((oy + (ch.dimensions.widthM - doorW) / 2) * 100) / 100,
          z: oz,
        };
      } else if (Math.abs((ox + ch.dimensions.lengthM) - L) < 0.001) {
        // Priority 1C: Right end wall (X = L)
        hostWall = 'right';
        doorOrigin = {
          x: L,
          y: Math.round((oy + (ch.dimensions.widthM - doorW) / 2) * 100) / 100,
          z: oz,
        };
      } else if (Math.abs((oy + ch.dimensions.widthM) - W) < 0.001) {
        // Priority 1D: Back wall (Y = W)
        hostWall = 'back';
        doorOrigin = {
          x: Math.round((ox + (ch.dimensions.lengthM - doorW) / 2) * 100) / 100,
          y: W,
          z: oz,
        };
      } else {
        // Landlocked Chamber: search touching partitions
        hostWall = 'partition';
        // find adjacent chamber touching on Y or X
        const neighbor = chambers.find(other => {
          if (other.chamberNumber === chNum) return false;
          const otherX = Number(other.origin?.x ?? other.origin?.l ?? 0);
          const otherY = Number(other.origin?.y ?? other.origin?.w ?? 0);
          const touchY = Math.abs(oy - (otherY + other.dimensions.widthM)) < 0.001;
          const touchX = Math.abs(ox - (otherX + other.dimensions.lengthM)) < 0.001;
          return touchY || touchX;
        });

        if (neighbor) {
          hostWall = `partition_with_chamber_${neighbor.chamberNumber}`;
          doorOrigin = {
            x: ox,
            y: oy,
            z: oz,
            connectedChamber: neighbor.chamberNumber,
          };
        } else {
          throw new Error(`DOOR PLACEMENT BLOCKED: Chamber ${chNum} has no external wall contact and adjacent partition walls lack sufficient clear width. Modify chamber layout or add an access corridor.`);
        }
      }
    }

    // Clearance and bounds validation
    const hostSpan = (hostWall === 'front' || hostWall === 'back') ? ch.dimensions.lengthM : ch.dimensions.widthM;
    if (hostSpan < doorW + 0.40 && hostWall !== 'partition') {
      throw new Error(`Host wall span on Chamber ${chNum} (${hostSpan}m) is insufficient for door width (${doorW}m) with required 200mm structural frame margins.`);
    }

    const doorData = {
      chamberNumber: chNum,
      doorType: custom?.doorType || defaultDoorOption.id,
      doorLabel: custom?.doorLabel || defaultDoorOption.label,
      widthM: doorW,
      heightM: doorH,
      areaM2: Math.round(doorW * doorH * 1000) / 1000,
      hostWall,
      origin: doorOrigin || { x: ox, y: oy, z: oz },
      isExternal: ['front', 'back', 'left', 'right'].includes(hostWall),
    };

    placedDoors.push(doorData);
    ch.door = doorData;

    // Track in egress graph
    if (doorData.isExternal) {
      egressGraph[chNum].push('exterior');
      egressGraph.exterior.push(chNum);
    } else if (doorOrigin?.connectedChamber) {
      egressGraph[chNum].push(doorOrigin.connectedChamber);
      egressGraph[doorOrigin.connectedChamber].push(chNum);
    }
  }

  // BFS Reachability Check: Ensure every chamber has an unbroken route to 'exterior'
  for (const ch of chambers) {
    const visited = new Set();
    const queue = [[ch.chamberNumber]];
    let egressRoute = null;

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];
      if (curr === 'exterior') {
        egressRoute = path;
        break;
      }
      visited.add(curr);
      const neighbors = egressGraph[curr] || [];
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push([...path, n]);
      }
    }

    if (!egressRoute) {
      throw new Error(`ACCESS ROUTE BLOCKED: Chamber ${ch.chamberNumber} has no unbroken egress path to the building exterior. A shared partition door alone without a continuous exit route is invalid.`);
    }

    if (ch.door) {
      ch.door.egressRoute = egressRoute;
    }
  }

  return {
    success: true,
    totalDoors: placedDoors.length,
    doors: placedDoors,
    chambers,
  };
}

/**
 * PUF Area Calculator with Host-Specific Door Deductions & Floor Configuration
 */
export function calculatePufAreas({
  facility,
  outerEnvelope,
  chambers = [],
  partitions = [],
  doors = [],
  floorConstruction = 'puf',
  pufThicknessMm = 100,
  wastageAllowancePct = null,
}) {
  const env = facility || outerEnvelope || { lengthM: 12.0, widthM: 8.0, heightM: 4.5 };
  const L = Number(env.lengthM) || 12.0;
  const W = Number(env.widthM) || 8.0;
  const H = Number(env.heightM) || 4.5;

  const extWallsGrossM2 = Math.round(2 * (L * H + W * H) * 100) / 100;
  const floorGrossM2 = Math.round(L * W * 100) / 100;
  const ceilingGrossM2 = floorGrossM2;

  // Floor panel inclusion based on floor construction
  const isFloorPuf = floorConstruction === 'puf';
  const billableFloorGrossM2 = isFloorPuf ? floorGrossM2 : 0;

  // External envelope gross
  const envelopeGrossM2 = Math.round((extWallsGrossM2 + ceilingGrossM2 + billableFloorGrossM2) * 100) / 100;

  // Shared internal partitions gross (counted strictly once)
  let partitionsGrossM2 = 0;
  partitions.forEach(p => {
    partitionsGrossM2 += Number(p.areaM2 || 0);
  });
  partitionsGrossM2 = Math.round(partitionsGrossM2 * 100) / 100;

  const totalGrossPanelAreaM2 = Math.round((envelopeGrossM2 + partitionsGrossM2) * 100) / 100;

  // Host-Specific Door Cutout Deductions
  let extDoorDeductionsM2 = 0;
  let partitionDoorDeductionsM2 = 0;

  (doors || []).filter(Boolean).forEach(d => {
    const dArea = Number(d.areaM2 || (d.widthM * d.heightM) || 1.70);
    if (d.isExternal) {
      extDoorDeductionsM2 += dArea;
    } else {
      partitionDoorDeductionsM2 += dArea;
    }
  });

  extDoorDeductionsM2 = Math.round(extDoorDeductionsM2 * 100) / 100;
  partitionDoorDeductionsM2 = Math.round(partitionDoorDeductionsM2 * 100) / 100;
  const totalDoorDeductionsM2 = Math.round((extDoorDeductionsM2 + partitionDoorDeductionsM2) * 100) / 100;

  // Net installed thermal surface areas
  const extWallsNetM2 = Math.max(0, Math.round((extWallsGrossM2 - extDoorDeductionsM2) * 100) / 100);
  const partitionsNetM2 = Math.max(0, Math.round((partitionsGrossM2 - partitionDoorDeductionsM2) * 100) / 100);
  // Zero deductions on floor and ceiling!
  const floorNetM2 = billableFloorGrossM2;
  const ceilingNetM2 = ceilingGrossM2;

  const netInstalledAreaM2 = Math.round((extWallsNetM2 + partitionsNetM2 + floorNetM2 + ceilingNetM2) * 100) / 100;

  // Procurement Wastage Allowance
  const defaultWastagePct = partitions.some(p => p.type === 'deck') || partitions.length > 2 ? 5.0 : 3.0;
  const wastagePct = wastageAllowancePct !== null ? Number(wastageAllowancePct) : defaultWastagePct;
  const procurementAreaM2 = Math.round(totalGrossPanelAreaM2 * (1 + wastagePct / 100) * 10) / 10;

  return {
    gross: {
      extWallsM2: extWallsGrossM2,
      floorM2: billableFloorGrossM2,
      floorGrossM2,
      ceilingM2: ceilingGrossM2,
      envelopeM2: envelopeGrossM2,
      partitionsM2: partitionsGrossM2,
      totalGrossM2: totalGrossPanelAreaM2,
    },
    deductions: {
      extDoorsM2: extDoorDeductionsM2,
      partitionDoorsM2: partitionDoorDeductionsM2,
      floorDeductionM2: 0, // strictly zero
      ceilingDeductionM2: 0, // strictly zero
      doorDeductionM2: totalDoorDeductionsM2,
      totalDeductionsM2: totalDoorDeductionsM2,
    },
    net: {
      extWallsNetM2,
      partitionsNetM2,
      floorNetM2,
      ceilingNetM2,
      floorDeductionM2: 0,
      ceilingDeductionM2: 0,
      doorDeductionM2: totalDoorDeductionsM2,
      totalNetInstalledM2: netInstalledAreaM2,
    },
    procurement: {
      totalGrossPanelAreaM2,
      floorProcurementM2: billableFloorGrossM2,
      wastagePct,
      procurementAreaM2,
      totalProcurementM2: procurementAreaM2,
      pufThicknessMm: Number(pufThicknessMm) || 100,
    },
    floorConstruction: {
      id: floorConstruction,
      includedInProcurement: isFloorPuf,
    },
  };
}

/**
 * Normalizes and guarantees that result has complete chambers array,
 * door definitions, multi-circuit allocations, and PUF areas.
 */
export function normalizeChamberResult(result, form = {}) {
  if (!result) return null;

  const numRooms = Math.max(1, Math.round(Number(form.numRooms || result.inputs?.numRooms || result.inputs?.chambersCount || 1)));
  const unit = form.unit || (result.inputs?.dimensions?.lengthFt !== undefined ? 'ft' : 'm');
  const isM = unit === 'm';

  let lengthM = Number(result.inputs?.dimensions?.lengthM);
  let widthM = Number(result.inputs?.dimensions?.widthM);
  let heightM = Number(result.inputs?.dimensions?.heightM);

  if (!lengthM || !widthM || !heightM) {
    const l = Number(form.length) || 12.0;
    const w = Number(form.width) || 8.0;
    const h = Number(form.height) || 4.5;
    lengthM = isM ? l : Math.round(l * 0.3048 * 100) / 100;
    widthM = isM ? w : Math.round(w * 0.3048 * 100) / 100;
    heightM = isM ? h : Math.round(h * 0.3048 * 100) / 100;
  }

  const pufMm = Number(form.pufThicknessMm || result.inputs?.puf?.thicknessMm || 100);
  const floorConstruction = form.floorConstruction || 'puf';
  const divisionDirections = form.divisionDirections || { L: true, W: false, H: false };

  // Generate geometry
  const layout = generateStandardChamberLayout({
    lengthM,
    widthM,
    heightM,
    numRooms,
    divisionDirections,
    pufThicknessMm: pufMm,
    floorConstruction,
  });

  // Place doors
  const doorPlacements = placeAutomaticDoors({
    chambers: layout.chambers,
    facility: { lengthM, widthM, heightM },
    doorOptionId: form.doorType || 'swing',
  });

  // Calculate PUF Areas
  const pufAreas = calculatePufAreas({
    facility: { lengthM, widthM, heightM },
    chambers: layout.chambers,
    partitions: layout.partitions,
    doors: doorPlacements.doors,
    floorConstruction,
    pufThicknessMm: pufMm,
  });

  // Populate chamber loads and equipment
  const chambers = [];
  const candidateEvaps = result.recommendations?.allCandidateEvaps || [];
  const defaultEvap = result.recommendations?.evaporator || null;
  const defaultCcu = result.recommendations?.ccu || null;

  const compressorRunHours = Number(form.compressorRunHours || result.inputs?.operational?.compressorRunHours || 16);
  const safetyFactor = Number(form.safetyFactor || 0.10);
  const ambientTempC = Number(form.ambientTemp ?? result.inputs?.temperatures?.ambientTempC ?? 42.0);
  const roomTempC = Number(form.roomTemp ?? result.inputs?.temperatures?.roomTempC ?? 2.0);

  let totalKw = 0;

  for (let i = 0; i < layout.chambers.length; i++) {
    const ch = layout.chambers[i];
    const chNum = ch.chamberNumber;

    // Proportionally derive thermal breakdown from result or calculate
    const volFraction = ch.dimensions.volumeM3 / layout.outerEnvelope.volumeM3;
    const baseTotalKj = result.thermalBreakdown?.qTotalKj || 868102;
    const qChamberKj = Math.round(baseTotalKj * volFraction);

    const capKw = Math.round(((qChamberKj * (1 + safetyFactor)) / (compressorRunHours * 3600)) * 100) / 100;
    const capTr = Math.round((capKw / 3.517) * 100) / 100;

    // Match dedicated indoor evaporator
    let matchedEvap = candidateEvaps.find(e => (e.capacity_kw || e.capacity) >= capKw);
    if (!matchedEvap) matchedEvap = defaultEvap;

    chambers.push({
      chamberNumber: chNum,
      name: ch.name,
      origin: ch.origin,
      dimensions: ch.dimensions,
      clearDimensions: ch.clearDimensions,
      door: ch.door,
      capacityKw: capKw,
      capacityTr: capTr,
      capacityBtuHr: Math.round(capKw * 3412.14),
      evaporator: matchedEvap,
      assignedCircuit: roomTempC < 0 ? 'LT_Freezer_Circuit' : 'MT_Chiller_Circuit',
      valveRecommendations: result.recommendations?.valveRecommendations || {
        expansionValve: 'TIE-SW',
        orifice: 'TIO-002',
        solenoidValve: '200RB 2T3T',
        controller: 'Dixell XR02CX',
      },
    });

    totalKw += capKw;
  }

  const facilityKw = Math.round(totalKw * 100) / 100;
  const facilityTr = Math.round((facilityKw / 3.517) * 100) / 100;

  return {
    ...result,
    inputs: {
      ...result.inputs,
      numRooms,
      chambersCount: numRooms,
      divisionDirections,
      floorConstruction,
      dimensions: {
        ...result.inputs?.dimensions,
        lengthM,
        widthM,
        heightM,
        volumeM3: layout.outerEnvelope.volumeM3,
        totalPufSurfaceAreaM2: pufAreas.procurement.procurementAreaM2,
        netInstalledAreaM2: pufAreas.net.totalNetInstalledM2,
      },
    },
    chambers,
    doors: {
      totalDoors: numRooms,
      doorsPerChamber: 1,
      doorSpecification: doorPlacements.doors[0]?.doorLabel || 'Heavy-Duty Cold Room Door',
      placements: doorPlacements.doors,
    },
    partitionWalls: {
      count: layout.partitions.length,
      totalAreaM2: pufAreas.gross.partitionsM2,
      partitions: layout.partitions,
    },
    pufAreas,
    machineRating: {
      ...result.machineRating,
      capacityKw: facilityKw,
      capacityTr: facilityTr,
      capacityBtuHr: Math.round(facilityKw * 3412.14),
    },
  };
}

/**
 * Builds invoice line items with persistent UUID instance identity,
 * circuit-aware hardware kits, and zero duplicate lines on update.
 */
export function buildColdRoomInvoiceItems({
  result,
  form = {},
  customRates = {},
  selectedLines = {},
  calculationInstanceId = null,
  activeCcu = null,
  activeEvap = null,
}) {
  const normResult = normalizeChamberResult(result, form);
  const itemsToInsert = [];

  // Scoped calculation instance ID
  const instanceId = calculationInstanceId || `cr_inst_${Date.now()}`;
  const numRooms = normResult.chambers?.length || 1;
  const isMultiChamber = numRooms > 1;
  const chambers = normResult.chambers || [];
  const rec = normResult.recommendations || {};
  const ccu = activeCcu || rec.ccu;
  const evap = activeEvap || rec.evaporator;
  const pufMm = normResult.inputs?.puf?.thicknessMm || 100;
  const procurementArea = normResult.pufAreas?.procurement?.procurementAreaM2 || normResult.inputs?.dimensions?.totalPufSurfaceAreaM2 || 0;

  // 1. Dedicated Indoor Evaporators for Each Chamber
  if (selectedLines.evaporator !== false) {
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
        source: 'cold_room_sizer',
        calculationInstanceId: instanceId,
        componentType: 'evaporator',
        chamberIndex: ch.chamberNumber,
      });
    });
  }

  // 2. Central Outdoor Condensing Units (Circuit-Aware)
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
        source: 'cold_room_sizer',
        calculationInstanceId: instanceId,
        componentType: 'condensing_unit',
      });
    } else {
      itemsToInsert.push({
        name: `Central Daikin ${ccu.model_number} Outdoor Condensing Unit (${ccu.nominal_tr || ccu.capacity} TR @ ${normResult.inputs?.temperatures?.roomTempC ?? 2}°C)${isMultiChamber ? ` (Central Combined - ${numRooms} Chambers)` : ''}`,
        hsn: '84189900',
        quantity: 1,
        unit: 'Set',
        rate: Number(customRates.cdu) || Number(ccu.selling_price) || 0,
        taxPercent: 18,
        discount: 0,
        product_id: ccu.product_id,
        model_id: ccu.id,
        source: 'cold_room_sizer',
        calculationInstanceId: instanceId,
        componentType: 'condensing_unit',
      });
    }
  }

  // 3. Cold Room Doors (Exactly 1 Physical Door Procured per Chamber)
  if (selectedLines.doors !== false) {
    const selectedDoorOption = DOOR_OPTIONS.find(d => d.id === form.doorType) || DOOR_OPTIONS[0];
    const doorLabel = form.doorSpec || selectedDoorOption.label;
    const doorRate = Number(customRates.doors) || selectedDoorOption.defaultRate;

    itemsToInsert.push({
      name: `${doorLabel} (with Positive Seal Gasket, Frame Heater & Safety Release Knob) - Exactly 1 Door per Chamber (${numRooms} Chambers)`,
      hsn: '73083000',
      quantity: numRooms,
      unit: 'Nos',
      rate: doorRate,
      taxPercent: 18,
      discount: 0,
      source: 'cold_room_sizer',
      calculationInstanceId: instanceId,
      componentType: 'door',
    });
  }

  // 4. Refrigeration Kits (1 Set per Evaporator)
  if (selectedLines.kit !== false) {
    const vr = rec.valveRecommendations || {};
    itemsToInsert.push({
      name: `Daikin Cold-Room Refrigeration Kit (${vr.expansionValve || 'TXV'} + ${vr.orifice || 'Orifice'} + ${vr.solenoidValve || 'Solenoid'} + ${vr.controller || 'Dixell Controller'}) - 1 Set per Chamber (${numRooms} Chambers)`,
      hsn: '84189900',
      quantity: numRooms,
      unit: 'Set',
      rate: Number(customRates.kit) || 14500,
      taxPercent: 18,
      discount: 0,
      source: 'cold_room_sizer',
      calculationInstanceId: instanceId,
      componentType: 'refrigeration_kit',
    });
  }

  // 5. PUF Insulated Sandwich Panels (Includes External Envelope + Partitions + Decks + Wastage)
  if (selectedLines.puf !== false) {
    const defaultPufRate = pufMm === 60 ? 1350 : (pufMm === 100 ? 1550 : (pufMm === 120 ? 1850 : 2150));
    itemsToInsert.push({
      name: `PUF Insulated Sandwich Panels (${pufMm}mm, k=0.023) - ${procurementArea} sq.m Procurement Quantity (Net Installed: ${normResult.pufAreas?.net?.totalNetInstalledM2 || procurementArea} sq.m, includes partitions & decks)`,
      hsn: '94069090',
      quantity: procurementArea,
      unit: 'sq.m',
      rate: Number(customRates.puf) || defaultPufRate,
      taxPercent: 18,
      discount: 0,
      source: 'cold_room_sizer',
      calculationInstanceId: instanceId,
      componentType: 'puf_panel',
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
      source: 'cold_room_sizer',
      calculationInstanceId: instanceId,
      componentType: 'services',
    });
  }

  const technicalSpecs = {
    calculationInstanceId: instanceId,
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
    doors: normResult.doors,
    doorType: form.doorType || 'swing',
    partitionWalls: normResult.partitionWalls,
    pufAreas: normResult.pufAreas,
    totalPufSurfaceAreaM2: procurementArea,
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

  return { itemsToInsert, technicalSpecs, normResult, calculationInstanceId: instanceId };
}
