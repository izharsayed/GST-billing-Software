import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Calculator, CheckCircle2, AlertTriangle, Layers, Plus, Loader2,
  Filter, ChevronDown, ChevronUp, Cpu, Flame, Wind, User, Settings2,
  Snowflake, Zap, Trash2, Info, Eye, ArrowRight, ShieldCheck
} from 'lucide-react';
import { calculateColdRoom, calculateHeatLoad, getThermalCommodities } from '../../store';
import { formatCurrency } from '../../utils';
import { toast } from '../Toast';
import {
  normalizeChamberResult,
  buildColdRoomInvoiceItems,
  DOOR_OPTIONS,
  FLOOR_CONSTRUCTION_TYPES,
  COVERAGE_MODES,
  generateStandardChamberLayout,
  validateCustomChamberLayout,
  placeAutomaticDoors,
} from './chamberUtils';

export default function ColdRoomSizerModal({ isOpen, onClose, onInsert, initialSpecs = null }) {
  // Sizing Mode: 'heatload' (ASHRAE / USDA Thermodynamic Engine) | 'reckoner' (Standard Volume Reckoner)
  const [sizerMode, setSizerMode] = useState('heatload');

  // -------------------------------------------------------------
  // 1. RECKONER MODE STATE (Standard Catalogue)
  // -------------------------------------------------------------
  const [calcForm, setCalcForm] = useState({
    application: 'chiller',
    length: 10,
    width: 12,
    height: 8,
    unit: 'ft',
    ambientTemp: 43,
    refrigerant: 'R404A',
    compressorType: 'scroll',
    brand: 'Daikin',
    dailyMilkLiters: 1000,
  });
  const [recommendation, setRecommendation] = useState(null);

  // -------------------------------------------------------------
  // 2. ADVANCED HEAT LOAD ENGINE STATE (ASHRAE / USDA / Daikin)
  // -------------------------------------------------------------
  const [calculationInstanceId] = useState(() => 'cr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36));
  const [commodities, setCommodities] = useState([]);
  const [heatLoadForm, setHeatLoadForm] = useState({
    unit: 'm', // 'm' | 'ft'
    length: 12.0,
    width: 8.0,
    height: 4.5,
    numRooms: 1, // Multi-chamber partition count (default 1)
    divisionMode: 'standard', // 'standard' | 'custom'
    divisionDirections: { L: true, W: false, H: false },
    floorConstruction: 'puf', // 'puf' | 'concrete_subslab' | 'uninsulated_ground'
    coverageMode: 'full', // 'full' | 'partial'
    customChambers: [
      { id: 'ch_1', name: 'Chamber 1', x: 0, y: 0, z: 0, lengthM: 6.0, widthM: 8.0, heightM: 4.5, roomTempC: 2.0, dailyMassKg: 4000 },
      { id: 'ch_2', name: 'Chamber 2', x: 6.0, y: 0, z: 0, lengthM: 6.0, widthM: 8.0, heightM: 4.5, roomTempC: 2.0, dailyMassKg: 4000 },
    ],
    pufThicknessMm: 100, // 60, 100, 120, 150
    doorType: 'swing', // 'swing' | 'sliding' | 'hatch'
    sheetMaterial: '0.5 mm PPGI (Inner & Outer)',
    ambientTemp: 42.0,
    roomTemp: 2.0,
    commodityId: 'com_apple',
    dailyMassKg: 8000,
    entryTemp: 28.0,
    compressorRunHours: 16.0,
    safetyFactor: 0.10,
    brand: 'Daikin',
    compressorPreference: 'any',
    refrigerant: 'R404A',
    infiltrationModel: 'ashrae', // 'ashrae' | 'gosney_olsson'
    openFrequencyPerHour: 15,
    openDurationSec: 30,
    protectionFactor: 0.60,
    // Optional internal loads
    lightsKw: '',
    lightsHours: 8,
    peopleCount: 1,
    peopleHours: 4,
    internalEquipmentKw: 0,
    fanMotorKw: 0.5,
    fanOperatingHours: 22,
    defrostHeaterKw: '',
    defrostDurationHours: '',
  });
  const [layoutViewMode, setLayoutViewMode] = useState('top'); // 'top' | 'side'
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [heatLoadResult, setHeatLoadResult] = useState(null);

  // Common UI state
  const [calculating, setCalculating] = useState(false);
  const [selectedCduId, setSelectedCduId] = useState(null);
  const [cduBrandFilter, setCduBrandFilter] = useState('all');

  const [selectedLines, setSelectedLines] = useState({
    cdu: true,
    evaporator: true,
    doors: true,
    kit: true,
    puf: true,
    installation: true,
  });

  const [customRates, setCustomRates] = useState({
    cdu: 0,
    evaporator: 0,
    doors: 28500,
    kit: 14500,
    puf: 1550,
    installation: 18000,
  });

  // Toggle multi-axis division direction (max 2 allowed simultaneously)
  const handleToggleDivisionDirection = (dir) => {
    setHeatLoadForm(prev => {
      const dirs = { ...(prev.divisionDirections || { L: false, W: false, H: false }) };
      const currentVal = !!dirs[dir];
      const count = (dirs.L ? 1 : 0) + (dirs.W ? 1 : 0) + (dirs.H ? 1 : 0);

      if (!currentVal && count >= 2) {
        toast('Maximum 2 division directions can be combined simultaneously. Slicing across all three directions is disallowed.', 'warning');
        return prev;
      }

      return {
        ...prev,
        divisionDirections: {
          ...dirs,
          [dir]: !currentVal,
        },
      };
    });
  };

  // Custom Chamber operations
  const handleUpdateCustomChamber = (index, field, value) => {
    setHeatLoadForm(prev => {
      const list = [...(prev.customChambers || [])];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, customChambers: list };
    });
  };

  const handleAddCustomChamber = () => {
    setHeatLoadForm(prev => {
      const list = [...(prev.customChambers || [])];
      const nextNum = list.length + 1;
      const isM = prev.unit === 'm';
      const curL = isM ? Number(prev.length) || 12 : (Number(prev.length) || 12) * 0.3048;
      const curH = isM ? Number(prev.height) || 4.5 : (Number(prev.height) || 4.5) * 0.3048;
      list.push({
        id: 'ch_' + Math.random().toString(36).substring(2, 7),
        name: `Chamber ${nextNum}`,
        x: 0,
        y: 0,
        z: 0,
        lengthM: Math.round((curL / (nextNum || 1)) * 10) / 10,
        widthM: 3.0,
        heightM: curH,
        roomTempC: 2.0,
        dailyMassKg: 2000,
      });
      return { ...prev, customChambers: list, numRooms: list.length };
    });
  };

  const handleRemoveCustomChamber = (index) => {
    setHeatLoadForm(prev => {
      const list = (prev.customChambers || []).filter((_, i) => i !== index);
      return { ...prev, customChambers: list, numRooms: Math.max(1, list.length) };
    });
  };

  // Switch to Custom Per-Room mode with automatic coordinate seeding if empty
  const handleSwitchToCustomMode = () => {
    setHeatLoadForm(prev => {
      const isM = prev.unit === 'm';
      const L = isM ? Number(prev.length) || 12 : (Number(prev.length) || 12) * 0.3048;
      const W = isM ? Number(prev.width) || 8 : (Number(prev.width) || 8) * 0.3048;
      const H = isM ? Number(prev.height) || 4.5 : (Number(prev.height) || 4.5) * 0.3048;
      const n = Math.max(2, Math.round(Number(prev.numRooms) || 2));
      const seeded = [];
      const dL = Math.round((L / n) * 1000) / 1000;
      for (let i = 0; i < n; i++) {
        seeded.push({
          id: `ch_${i + 1}`,
          name: `Chamber ${i + 1}`,
          x: Math.round(i * dL * 1000) / 1000,
          y: 0,
          z: 0,
          lengthM: dL,
          widthM: W,
          heightM: H,
          roomTempC: Number(prev.roomTemp) || 2.0,
          dailyMassKg: Math.round((Number(prev.dailyMassKg) || 8000) / n),
        });
      }
      return {
        ...prev,
        divisionMode: 'custom',
        customChambers: seeded,
        numRooms: seeded.length,
      };
    });
  };

  // Fetch commodities on mount
  useEffect(() => {
    if (isOpen) {
      getThermalCommodities()
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setCommodities(data);
          }
        })
        .catch(err => console.warn('Could not load thermal commodities:', err));

      if (initialSpecs) {
        if (initialSpecs.length && initialSpecs.width && initialSpecs.height) {
          setHeatLoadForm(p => ({
            ...p,
            length: initialSpecs.length,
            width: initialSpecs.width,
            height: initialSpecs.height,
            unit: initialSpecs.unit || 'm',
            ...(initialSpecs.brand ? { brand: initialSpecs.brand } : {}),
            ...(initialSpecs.refrigerant ? { refrigerant: initialSpecs.refrigerant } : {}),
            ...(initialSpecs.compressorPreference ? { compressorPreference: initialSpecs.compressorPreference } : {}),
          }));
          setCalcForm(p => ({
            ...p,
            length: initialSpecs.length,
            width: initialSpecs.width,
            height: initialSpecs.height,
            unit: initialSpecs.unit || 'ft',
          }));
        }
      }
    }
  }, [isOpen, initialSpecs]);

  // Commodity change handler
  const handleCommodityChange = (comId) => {
    const selected = commodities.find(c => c.id === comId);
    setHeatLoadForm(prev => {
      const next = { ...prev, commodityId: comId };
      if (selected) {
        const avg = Math.round(((selected.storage_temp_min + selected.storage_temp_max) / 2) * 10) / 10;
        next.roomTemp = avg;
      }
      return next;
    });
  };

  const selectedCommodity = commodities.find(c => c.id === heatLoadForm.commodityId) || commodities[0];

  // Live layout and geometry derivation (real-time SVG preview & validation)
  const liveChamberLayout = useMemo(() => {
    const isM = heatLoadForm.unit === 'm';
    const L = Math.round((isM ? Number(heatLoadForm.length) || 12 : (Number(heatLoadForm.length) || 12) * 0.3048) * 100) / 100;
    const W = Math.round((isM ? Number(heatLoadForm.width) || 8 : (Number(heatLoadForm.width) || 8) * 0.3048) * 100) / 100;
    const H = Math.round((isM ? Number(heatLoadForm.height) || 4.5 : (Number(heatLoadForm.height) || 4.5) * 0.3048) * 100) / 100;
    const pufMm = Number(heatLoadForm.pufThicknessMm) || 100;
    const floorConstruction = heatLoadForm.floorConstruction || 'puf';
    const doorType = heatLoadForm.doorType || 'swing';

    try {
      if (heatLoadForm.divisionMode === 'custom') {
        const facility = { lengthM: L, widthM: W, heightM: H, volumeM3: Math.round(L * W * H * 100) / 100 };
        const customRooms = (heatLoadForm.customChambers || []).map(ch => ({
          ...ch,
          origin: {
            x: isM ? Number(ch.x) || 0 : (Number(ch.x) || 0) * 0.3048,
            y: isM ? Number(ch.y) || 0 : (Number(ch.y) || 0) * 0.3048,
            z: isM ? Number(ch.z) || 0 : (Number(ch.z) || 0) * 0.3048,
          },
          dimensions: {
            lengthM: isM ? Number(ch.lengthM) || 1 : (Number(ch.lengthM) || 1) * 0.3048,
            widthM: isM ? Number(ch.widthM) || 1 : (Number(ch.widthM) || 1) * 0.3048,
            heightM: isM ? Number(ch.heightM) || 1 : (Number(ch.heightM) || 1) * 0.3048,
          },
          roomTempC: Number(ch.roomTempC ?? 2.0),
        }));

        const validation = validateCustomChamberLayout({
          facility,
          chambers: customRooms,
          coverageMode: heatLoadForm.coverageMode || 'full',
          pufThicknessMm: pufMm,
          floorConstruction,
        });

        const doors = placeAutomaticDoors(validation.chambers, facility, doorType);
        return {
          success: true,
          mode: 'custom',
          chambers: doors.chambers,
          partitions: validation.partitions,
          outerEnvelope: facility,
          doors,
          totalChamberVolumeM3: validation.totalChamberVolumeM3,
          unallocatedVolumeM3: validation.unallocatedVolumeM3,
          coveragePercent: validation.coveragePercent,
        };
      } else {
        const N = Math.max(1, Math.round(Number(heatLoadForm.numRooms) || 1));
        const layout = generateStandardChamberLayout({
          lengthM: L,
          widthM: W,
          heightM: H,
          numRooms: N,
          divisionDirections: heatLoadForm.divisionDirections || { L: true, W: false, H: false },
          pufThicknessMm: pufMm,
          floorConstruction,
        });

        const doors = placeAutomaticDoors(layout.chambers, layout.outerEnvelope, doorType);
        return {
          success: true,
          mode: layout.mode,
          chambers: doors.chambers,
          partitions: layout.partitions,
          outerEnvelope: layout.outerEnvelope,
          doors,
          activeDirections: layout.activeDirections,
          bayAllocation: layout.bayAllocation,
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err.message,
        outerEnvelope: { lengthM: L, widthM: W, heightM: H, volumeM3: Math.round(L * W * H * 100) / 100 },
      };
    }
  }, [
    heatLoadForm.unit,
    heatLoadForm.length,
    heatLoadForm.width,
    heatLoadForm.height,
    heatLoadForm.numRooms,
    heatLoadForm.divisionMode,
    heatLoadForm.divisionDirections,
    heatLoadForm.customChambers,
    heatLoadForm.coverageMode,
    heatLoadForm.pufThicknessMm,
    heatLoadForm.floorConstruction,
    heatLoadForm.doorType,
  ]);

  // Quick area and volume preview for heat load inputs
  const liveDimensions = useMemo(() => {
    const l = Number(heatLoadForm.length) || 0;
    const w = Number(heatLoadForm.width) || 0;
    const h = Number(heatLoadForm.height) || 0;
    const n = Math.max(1, Math.round(Number(heatLoadForm.numRooms) || 1));
    const isM = heatLoadForm.unit === 'm';
    const lM = isM ? l : l * 0.3048;
    const wM = isM ? w : w * 0.3048;
    const hM = isM ? h : h * 0.3048;
    const volM3 = Math.round(lM * wM * hM * 10) / 10;
    const outerAreaM2 = Math.round(2 * (lM * wM + lM * hM + wM * hM) * 10) / 10;
    const partitionCount = Math.max(0, n - 1);
    const partitionAreaM2 = Math.round(partitionCount * (wM * hM) * 10) / 10;
    const totalPufAreaM2 = Math.round((outerAreaM2 + partitionAreaM2) * 10) / 10;
    const chamberLM = Math.round((lM / n) * 10) / 10;
    const chamberVolM3 = Math.round((volM3 / n) * 10) / 10;
    return {
      volM3,
      outerAreaM2,
      areaM2: outerAreaM2,
      partitionCount,
      partitionAreaM2,
      totalPufAreaM2,
      chamberLM,
      chamberVolM3,
      numRooms: n,
      doorsCount: n,
    };
  }, [heatLoadForm.length, heatLoadForm.width, heatLoadForm.height, heatLoadForm.unit, heatLoadForm.numRooms]);

  // -------------------------------------------------------------
  // CALCULATE ACTIONS
  // -------------------------------------------------------------
  const handleCalculateHeatLoad = async (e) => {
    if (e) e.preventDefault();
    if (liveChamberLayout && !liveChamberLayout.success) {
      toast(liveChamberLayout.error || 'Please correct chamber geometry errors before calculating.', 'error');
      return;
    }
    setCalculating(true);
    try {
      const rawRes = await calculateHeatLoad(heatLoadForm);
      const res = normalizeChamberResult(rawRes, heatLoadForm);
      setHeatLoadResult(res);

      const defaultCdu = res.recommendations?.ccu || null;
      setSelectedCduId(defaultCdu?.id || null);

      const cduPrice = defaultCdu?.selling_price || 0;
      const evapPrice = res.recommendations?.evaporator?.selling_price || 0;
      const pufMm = Number(heatLoadForm.pufThicknessMm) || 100;
      const defaultPufRate = pufMm === 60 ? 1350 : (pufMm === 100 ? 1550 : (pufMm === 120 ? 1850 : 2150));
      const chamberCount = res.chambers?.length || 1;
      const defaultInstallRate = chamberCount > 1 ? 18000 + (chamberCount - 1) * 8000 : 18000;

      setCustomRates(prev => ({
        ...prev,
        cdu: cduPrice,
        evaporator: evapPrice,
        puf: defaultPufRate,
        installation: defaultInstallRate,
      }));
      toast('Heat load calculated & Daikin equipment matched!', 'success');
    } catch (err) {
      toast(err?.message || 'Failed to calculate refrigeration heat load', 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleCalculateReckoner = async (e) => {
    if (e) e.preventDefault();
    setCalculating(true);
    try {
      const res = await calculateColdRoom(calcForm);
      setRecommendation(res);

      const defaultCdu = res.recommendations?.cdu || res.availableCompressors?.[0] || null;
      setSelectedCduId(defaultCdu?.id || null);

      const cduPrice = defaultCdu?.selling_price || 0;
      const evapPrice = res.recommendations?.evaporator?.selling_price || 0;
      setCustomRates(prev => ({
        ...prev,
        cdu: cduPrice,
        evaporator: evapPrice,
      }));
      toast('Equipment matched from catalogue!', 'success');
    } catch {
      toast('Failed to calculate cold-room equipment match', 'error');
    } finally {
      setCalculating(false);
    }
  };

  // -------------------------------------------------------------
  // SELECTION HANDLERS
  // -------------------------------------------------------------
  const activeHeatLoadCcu = heatLoadResult?.recommendations?.ccu || null;
  const activeHeatLoadEvap = heatLoadResult?.recommendations?.evaporator || null;

  // Compressors for Reckoner mode
  const allAvailableCompressors = recommendation?.availableCompressors || [];
  const uniqueBrands = ['all', ...new Set(allAvailableCompressors.map(c => c.brand_name).filter(Boolean))];
  const filteredCompressors = cduBrandFilter === 'all'
    ? allAvailableCompressors
    : allAvailableCompressors.filter(c => c.brand_name === cduBrandFilter);

  const activeReckonerCdu = allAvailableCompressors.find(c => c.id === selectedCduId)
    || recommendation?.recommendations?.cdu
    || filteredCompressors[0]
    || null;

  const handleSelectReckonerCdu = (cduId) => {
    setSelectedCduId(cduId);
    const chosen = allAvailableCompressors.find(c => c.id === cduId);
    if (chosen) {
      setCustomRates(prev => ({
        ...prev,
        cdu: chosen.selling_price || 0,
      }));
    }
  };

  // -------------------------------------------------------------
  // APPLY / INSERT INTO INVOICE OR QUOTATION
  // -------------------------------------------------------------
  const handleApplyToInvoice = () => {
    if (sizerMode === 'heatload') {
      if (!heatLoadResult) {
        toast('Please run "Calculate Heat Load & Match Daikin Units" first.', 'error');
        return;
      }

      const { itemsToInsert, technicalSpecs } = buildColdRoomInvoiceItems({
        result: heatLoadResult,
        form: heatLoadForm,
        customRates,
        selectedLines,
        activeCcu: activeHeatLoadCcu,
        activeEvap: activeHeatLoadEvap,
        calculationInstanceId,
      });

      onInsert(itemsToInsert, technicalSpecs);
    } else {
      // Reckoner Mode Insert
      if (!recommendation) {
        toast('Please run "Calculate & Match Equipment" first.', 'error');
        return;
      }

      const rec = recommendation.recommendations || {};

      if (selectedLines.cdu && activeReckonerCdu) {
        itemsToInsert.push({
          name: `${activeReckonerCdu.brand_name || 'Emerson'} ${activeReckonerCdu.model_number} Condensing Unit (${activeReckonerCdu.capacity} kW @ ${recommendation.inputs?.targetTemp || 4}°C)`,
          hsn: '84189900',
          quantity: 1,
          unit: 'Set',
          rate: Number(customRates.cdu) || Number(activeReckonerCdu.selling_price) || 0,
          taxPercent: 18,
          discount: 0,
          product_id: activeReckonerCdu.product_id,
          model_id: activeReckonerCdu.id,
        });
      }

      if (selectedLines.evaporator && rec.evaporator) {
        const evap = rec.evaporator;
        itemsToInsert.push({
          name: `Daikin ${evap.model_number} Air Cooling Unit Evaporator (${evap.capacity} kW)`,
          hsn: '84189900',
          quantity: 1,
          unit: 'Set',
          rate: Number(customRates.evaporator) || Number(evap.selling_price) || 0,
          taxPercent: 18,
          discount: 0,
          product_id: evap.product_id,
          model_id: evap.id,
        });
      }

      if (selectedLines.kit) {
        const txv = rec.expansionValve || 'TIE-SW';
        const orifice = rec.orifice || 'TIO';
        const sol = rec.solenoidValve || '200RB';
        const ctrl = rec.controller?.model || rec.controller || 'Dixell XR02CX';
        itemsToInsert.push({
          name: `Refrigeration Kit: ${txv} Expansion Valve + ${orifice} Orifice + ${sol} Solenoid + ${ctrl} Controller`,
          hsn: '84189900',
          quantity: 1,
          unit: 'Set',
          rate: Number(customRates.kit) || 14500,
          taxPercent: 18,
          discount: 0,
        });
      }

      if (selectedLines.installation) {
        itemsToInsert.push({
          name: 'Cold-Room Installation, Refrigerant Copper Piping, Pressure Testing & Commissioning',
          hsn: '9987',
          quantity: 1,
          unit: 'Job',
          rate: Number(customRates.installation) || 18000,
          taxPercent: 18,
          discount: 0,
        });
      }

      const technicalSpecs = {
        application: calcForm.application,
        length: calcForm.length,
        width: calcForm.width,
        height: calcForm.height,
        unit: calcForm.unit,
        volume: recommendation.inputs?.volume_ft3 || recommendation.inputs?.volume_m3,
        ambientTemp: calcForm.ambientTemp,
        targetTemp: recommendation.inputs?.targetTemp || 4,
        estimatedLoadKw: recommendation.estimatedLoadKw,
        cdu: activeReckonerCdu,
        evaporator: rec.evaporator,
        expansionValve: rec.expansionValve,
        orifice: rec.orifice,
        solenoidValve: rec.solenoidValve,
        controller: rec.controller,
        catalogueSource: activeReckonerCdu?.catalogue_ref || recommendation.catalogueSource,
        cataloguePage: activeReckonerCdu?.catalogue_page || recommendation.cataloguePage,
        calculatedAt: new Date().toISOString(),
      };

      onInsert(itemsToInsert, technicalSpecs);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content cold-room-sizer-modal" style={{ maxWidth: '980px', maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        {/* Header */}
        <div className="flex justify-between items-center mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Snowflake size={24} style={{ color: '#0284c7', flexShrink: 0 }} />
            <div>
              <h3 className="section-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Refrigeration Heat Load &amp; Sizing Engine
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ASHRAE / USDA Thermodynamic Engine • Daikin Commercial Equipment Matcher
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
        </div>

        {/* 2-Way Mode Switcher Banner */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          background: 'var(--bg-secondary)',
          padding: '4px',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <button
            type="button"
            className={`btn ${sizerMode === 'heatload' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.82rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 600 }}
            onClick={() => setSizerMode('heatload')}
          >
            <Cpu size={15} /> Advanced Heat Load Engine (ASHRAE / Daikin)
          </button>
          <button
            type="button"
            className={`btn ${sizerMode === 'reckoner' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.82rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 600 }}
            onClick={() => setSizerMode('reckoner')}
          >
            <Zap size={15} /> Quick Volume Sizer (Emerson / Ready Reckoner)
          </button>
        </div>

        {/* ========================================================= */}
        {/* MODE A: ADVANCED HEAT LOAD CALCULATION ENGINE */}
        {/* ========================================================= */}
        {sizerMode === 'heatload' && (
          <div>
            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              padding: '1rem',
              borderRadius: '10px',
              border: '1px solid var(--border-color, #e2e8f0)',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}>

              {/* CARD 1: Chamber Geometry & PUF Insulation */}
              <div style={{
                background: 'var(--bg-primary, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Layers size={14} /> Chamber Dimensions, Multi-Axis Division &amp; PUF Construction
                  </div>
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary, #f1f5f9)', padding: '2px', borderRadius: '6px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${heatLoadForm.divisionMode === 'standard' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', height: 'auto', lineHeight: 1.2, fontWeight: 600 }}
                      onClick={() => setHeatLoadForm(p => ({ ...p, divisionMode: 'standard' }))}
                    >
                      Standard Uniform Division
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${heatLoadForm.divisionMode === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', height: 'auto', lineHeight: 1.2, fontWeight: 600 }}
                      onClick={handleSwitchToCustomMode}
                    >
                      Custom Per-Room 3D Positioning
                    </button>
                  </div>
                </div>

                {/* MODE A: STANDARD UNIFORM MULTI-AXIS DIVISION */}
                {heatLoadForm.divisionMode === 'standard' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                    {/* Left: Overall Dimensions & Division Controls */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: '0.8rem' }}>
                          Overall Facility Dimensions ({heatLoadForm.unit === 'm' ? 'Meters' : 'Feet'})
                        </label>
                        <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '6px' }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${heatLoadForm.unit === 'm' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem', height: 'auto', lineHeight: 1.2 }}
                            onClick={() => setHeatLoadForm(p => ({ ...p, unit: 'm' }))}
                          >
                            Meters (m)
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${heatLoadForm.unit === 'ft' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem', height: 'auto', lineHeight: 1.2 }}
                            onClick={() => setHeatLoadForm(p => ({ ...p, unit: 'ft' }))}
                          >
                            Feet (ft)
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                        <div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Length ({heatLoadForm.unit})</span>
                          <input
                            type="number"
                            step="0.1"
                            className="form-input"
                            style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                            title="Overall Length"
                            placeholder="L"
                            value={heatLoadForm.length}
                            onChange={e => setHeatLoadForm(p => ({ ...p, length: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Width ({heatLoadForm.unit})</span>
                          <input
                            type="number"
                            step="0.1"
                            className="form-input"
                            style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                            title="Overall Width"
                            placeholder="W"
                            value={heatLoadForm.width}
                            onChange={e => setHeatLoadForm(p => ({ ...p, width: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Height ({heatLoadForm.unit})</span>
                          <input
                            type="number"
                            step="0.1"
                            className="form-input"
                            style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                            title="Overall Height"
                            placeholder="H"
                            value={heatLoadForm.height}
                            onChange={e => setHeatLoadForm(p => ({ ...p, height: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 2 }}>Chambers (N)</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className="form-input"
                            style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem', borderColor: '#93c5fd', fontWeight: 700, color: '#0369a1' }}
                            title="Number of Chambers"
                            placeholder="1"
                            value={heatLoadForm.numRooms || 1}
                            onChange={e => setHeatLoadForm(p => ({ ...p, numRooms: Math.max(1, parseInt(e.target.value) || 1) }))}
                          />
                        </div>
                      </div>

                      {/* Division Direction Independent Checkboxes */}
                      <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b' }}>
                            Partition Directions (Select 1 or any 2 directions):
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                            Max 2 directions
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            padding: '0.3rem 0.45rem',
                            borderRadius: '4px',
                            background: heatLoadForm.divisionDirections?.L ? '#dbeafe' : '#ffffff',
                            border: heatLoadForm.divisionDirections?.L ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={!!heatLoadForm.divisionDirections?.L}
                              onChange={() => handleToggleDivisionDirection('L')}
                            />
                            <span>Divide Length (L)</span>
                          </label>

                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            padding: '0.3rem 0.45rem',
                            borderRadius: '4px',
                            background: heatLoadForm.divisionDirections?.W ? '#dbeafe' : '#ffffff',
                            border: heatLoadForm.divisionDirections?.W ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={!!heatLoadForm.divisionDirections?.W}
                              onChange={() => handleToggleDivisionDirection('W')}
                            />
                            <span>Divide Width (W)</span>
                          </label>

                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            padding: '0.3rem 0.45rem',
                            borderRadius: '4px',
                            background: heatLoadForm.divisionDirections?.H ? '#fef3c7' : '#ffffff',
                            border: heatLoadForm.divisionDirections?.H ? '1.5px solid #d97706' : '1px solid #cbd5e1',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={!!heatLoadForm.divisionDirections?.H}
                              onChange={() => handleToggleDivisionDirection('H')}
                            />
                            <span>Divide Height (H)</span>
                          </label>
                        </div>

                        {/* Validation & Advisory Messages */}
                        {(heatLoadForm.numRooms || 1) > 1 && (!heatLoadForm.divisionDirections?.L && !heatLoadForm.divisionDirections?.W && !heatLoadForm.divisionDirections?.H) && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#dc2626', background: '#fee2e2', padding: '0.3rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={13} /> Please select 1 or 2 division directions to partition the cold room into {heatLoadForm.numRooms} chambers.
                          </div>
                        )}

                        {Number(heatLoadForm.numRooms) === 2 && ((heatLoadForm.divisionDirections?.L ? 1 : 0) + (heatLoadForm.divisionDirections?.W ? 1 : 0) + (heatLoadForm.divisionDirections?.H ? 1 : 0)) === 2 && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '0.3rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={13} /> Slicing into N=2 axis-aligned rectangular chambers can only divide 1 spatial direction. For 2-direction division, set N ≥ 3.
                          </div>
                        )}

                        {heatLoadForm.divisionDirections?.H && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.71rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.3rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                            <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>
                              <strong>Height Division Active:</strong> Upper mezzanine level generated. Clear headroom shown in Side Elevation. Note: Upper tier requires structural mezzanine deck design approved by a qualified structural engineer and safety staircase/catwalk egress.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Dimensions Metrics Strip */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.72rem',
                        color: '#0369a1',
                        background: 'rgba(2, 132, 199, 0.08)',
                        padding: '0.3rem 0.55rem',
                        borderRadius: '5px',
                        marginTop: '0.45rem',
                        fontWeight: 600
                      }}>
                        <span>Facility: {liveDimensions.volM3} m³</span>
                        <span>•</span>
                        {liveDimensions.numRooms > 1 ? (
                          <>
                            <span style={{ color: '#0284c7' }}>{liveDimensions.numRooms} Chambers ({liveDimensions.chamberVolM3} m³ each)</span>
                            <span>•</span>
                            <span>Partitions: {liveChamberLayout.partitions?.length || liveDimensions.partitionCount} ({Math.round((liveChamberLayout.partitions?.reduce((s, p) => s + (p.areaM2 || 0), 0) || liveDimensions.partitionAreaM2) * 10) / 10} m²)</span>
                            <span>•</span>
                            <span>Doors: {liveDimensions.numRooms} Nos</span>
                          </>
                        ) : (
                          <>
                            <span>Envelope: {liveDimensions.areaM2} m²</span>
                            <span>•</span>
                            <span>1 Door</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: PUF Panel Thickness, Floor Construction & Door Specification */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                          PUF Panel Thickness (k = 0.023 W/m·K)
                        </label>
                        <select
                          className="form-input"
                          style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.8rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                          value={heatLoadForm.pufThicknessMm}
                          onChange={e => setHeatLoadForm(p => ({ ...p, pufThicknessMm: Number(e.target.value) }))}
                        >
                          <option value={60}>60 mm (U = 0.383 W/m²·K) — Ante-rooms &amp; Process Areas</option>
                          <option value={100}>100 mm (U = 0.230 W/m²·K) — Standard Chiller (+2°C to +8°C)</option>
                          <option value={120}>120 mm (U = 0.192 W/m²·K) — Low Temp Freezer (-18°C)</option>
                          <option value={150}>150 mm (U = 0.153 W/m²·K) — Deep Freezer (-25°C to -30°C)</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                          Floor Construction &amp; PUF Accounting
                        </label>
                        <select
                          className="form-input"
                          style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.8rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                          value={heatLoadForm.floorConstruction || 'puf'}
                          onChange={e => setHeatLoadForm(p => ({ ...p, floorConstruction: e.target.value }))}
                        >
                          {FLOOR_CONSTRUCTION_TYPES.map(fc => (
                            <option key={fc.id} value={fc.id}>{fc.label}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {heatLoadForm.floorConstruction === 'puf'
                            ? 'Floor panels included in PUF procurement.'
                            : 'Floor panels excluded from procurement (Civil slab construction).'}
                        </div>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                          Cold Room Door Specification
                        </label>
                        <select
                          className="form-input"
                          style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.8rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                          value={heatLoadForm.doorType}
                          onChange={e => {
                            const val = e.target.value;
                            const opt = DOOR_OPTIONS.find(d => d.id === val) || DOOR_OPTIONS[0];
                            setHeatLoadForm(p => ({ ...p, doorType: val }));
                            setCustomRates(p => ({ ...p, doors: opt.defaultRate }));
                          }}
                        >
                          {DOOR_OPTIONS.map(d => (
                            <option key={d.id} value={d.id}>{d.label}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.2 }}>
                          Exactly {liveDimensions.doorsCount} dedicated physical doors assigned (1 per chamber). Deducted strictly from host walls.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* MODE B: CUSTOM PER-ROOM 3D POSITIONING */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', alignItems: 'center', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Facility Bounds:</span>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                            {heatLoadForm.length}m × {heatLoadForm.width}m × {heatLoadForm.height}m ({liveDimensions.volM3} m³)
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Coverage Mode:</span>
                        <select
                          className="form-input"
                          style={{ height: '32px', fontSize: '0.75rem', width: 'auto' }}
                          value={heatLoadForm.coverageMode || 'full'}
                          onChange={e => setHeatLoadForm(p => ({ ...p, coverageMode: e.target.value }))}
                        >
                          {COVERAGE_MODES.map(cm => (
                            <option key={cm.id} value={cm.id}>{cm.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Custom Chambers Definition Table */}
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                      <table style={{ width: '100%', fontSize: '0.74rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                            <th style={{ padding: '0.4rem 0.5rem' }}>#</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Room Name</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Origin (X, Y, Z) m</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Dimensions (L × W × H) m</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Volume</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Temp (°C)</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Mass (kg/d)</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(heatLoadForm.customChambers || []).map((ch, idx) => {
                            const vol = Math.round((Number(ch.lengthM) || 0) * (Number(ch.widthM) || 0) * (Number(ch.heightM) || 0) * 10) / 10;
                            return (
                              <tr key={ch.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <input
                                    type="text"
                                    className="form-input"
                                    style={{ height: '28px', fontSize: '0.74rem', width: '110px' }}
                                    value={ch.name || `Chamber ${idx + 1}`}
                                    onChange={e => handleUpdateCustomChamber(idx, 'name', e.target.value)}
                                  />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <div style={{ display: 'flex', gap: '3px' }}>
                                    <input
                                      type="number"
                                      step="0.1"
                                      title="Origin X"
                                      placeholder="X"
                                      className="form-input"
                                      style={{ height: '28px', fontSize: '0.72rem', width: '50px' }}
                                      value={ch.x ?? 0}
                                      onChange={e => handleUpdateCustomChamber(idx, 'x', Number(e.target.value))}
                                    />
                                    <input
                                      type="number"
                                      step="0.1"
                                      title="Origin Y"
                                      placeholder="Y"
                                      className="form-input"
                                      style={{ height: '28px', fontSize: '0.72rem', width: '50px' }}
                                      value={ch.y ?? 0}
                                      onChange={e => handleUpdateCustomChamber(idx, 'y', Number(e.target.value))}
                                    />
                                    <input
                                      type="number"
                                      step="0.1"
                                      title="Origin Z"
                                      placeholder="Z"
                                      className="form-input"
                                      style={{ height: '28px', fontSize: '0.72rem', width: '50px' }}
                                      value={ch.z ?? 0}
                                      onChange={e => handleUpdateCustomChamber(idx, 'z', Number(e.target.value))}
                                    />
                                  </div>
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <div style={{ display: 'flex', gap: '3px' }}>
                                    <input
                                      type="number"
                                      step="0.1"
                                      title="Length"
                                      placeholder="L"
                                      className="form-input"
                                      style={{ height: '28px', fontSize: '0.72rem', width: '50px' }}
                                      value={ch.lengthM}
                                      onChange={e => handleUpdateCustomChamber(idx, 'lengthM', Number(e.target.value))}
                                    />
                                    <input
                                      type="number"
                                      step="0.1"
                                      title="Width"
                                      placeholder="W"
                                      className="form-input"
                                      style={{ height: '28px', fontSize: '0.72rem', width: '50px' }}
                                      value={ch.widthM}
                                      onChange={e => handleUpdateCustomChamber(idx, 'widthM', Number(e.target.value))}
                                    />
                                    <input
                                      type="number"
                                      step="0.1"
                                      title="Height"
                                      placeholder="H"
                                      className="form-input"
                                      style={{ height: '28px', fontSize: '0.72rem', width: '50px' }}
                                      value={ch.heightM}
                                      onChange={e => handleUpdateCustomChamber(idx, 'heightM', Number(e.target.value))}
                                    />
                                  </div>
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, color: '#0369a1' }}>
                                  {vol} m³
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <input
                                    type="number"
                                    step="0.5"
                                    className="form-input"
                                    style={{ height: '28px', fontSize: '0.72rem', width: '55px' }}
                                    value={ch.roomTempC ?? 2.0}
                                    onChange={e => handleUpdateCustomChamber(idx, 'roomTempC', Number(e.target.value))}
                                  />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <input
                                    type="number"
                                    step="500"
                                    className="form-input"
                                    style={{ height: '28px', fontSize: '0.72rem', width: '65px' }}
                                    value={ch.dailyMassKg ?? 2000}
                                    onChange={e => handleUpdateCustomChamber(idx, 'dailyMassKg', Number(e.target.value))}
                                  />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="icon-btn text-danger"
                                    title="Delete Chamber"
                                    disabled={(heatLoadForm.customChambers || []).length <= 1}
                                    onClick={() => handleRemoveCustomChamber(idx)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={handleAddCustomChamber}
                      >
                        <Plus size={13} /> Add Custom Chamber
                      </button>

                      {liveChamberLayout.success && (
                        <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={13} />
                          Allocated: {liveChamberLayout.totalChamberVolumeM3} m³ / {liveDimensions.volM3} m³ ({liveChamberLayout.coveragePercent}% coverage)
                          {liveChamberLayout.unallocatedVolumeM3 > 0 && ` • Unallocated: ${liveChamberLayout.unallocatedVolumeM3} m³`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2D VISUAL LAYOUT PREVIEW (Top-View Plan & Side Elevation) */}
                <div style={{ marginTop: '0.85rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Eye size={13} /> 2D Layout &amp; Door Swing Preview
                    </div>
                    <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary, #f1f5f9)', padding: '2px', borderRadius: '5px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${layoutViewMode === 'top' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '0.15rem 0.55rem', fontSize: '0.7rem', height: 'auto', lineHeight: 1.2, fontWeight: 600 }}
                        onClick={() => setLayoutViewMode('top')}
                      >
                        Plan View (X-Y)
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${layoutViewMode === 'side' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '0.15rem 0.55rem', fontSize: '0.7rem', height: 'auto', lineHeight: 1.2, fontWeight: 600 }}
                        onClick={() => setLayoutViewMode('side')}
                      >
                        Side Elevation (X-Z)
                      </button>
                    </div>
                  </div>

                  {/* SVG Canvas / Error Alert */}
                  {!liveChamberLayout.success ? (
                    <div style={{
                      background: '#fee2e2',
                      border: '1.5px solid #ef4444',
                      borderRadius: '6px',
                      padding: '0.65rem 0.85rem',
                      color: '#b91c1c',
                      fontSize: '0.76rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                      <span><strong>Geometry Layout Error:</strong> {liveChamberLayout.error}</span>
                    </div>
                  ) : (
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}>
                      {(() => {
                        const envL = Math.max(1, liveChamberLayout.outerEnvelope?.lengthM || 12);
                        const envW = Math.max(1, liveChamberLayout.outerEnvelope?.widthM || 8);
                        const envH = Math.max(1, liveChamberLayout.outerEnvelope?.heightM || 4.5);
                        const chambers = liveChamberLayout.chambers || [];
                        const svgW = 660;
                        const svgH = 240;

                        if (layoutViewMode === 'top') {
                          const scale = Math.min(520 / envL, 170 / envW);
                          const ox = (svgW - envL * scale) / 2;
                          const oy = (svgH - envW * scale) / 2;

                          return (
                            <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: '660px', display: 'block' }}>
                              {/* Background Grid / Outer Facility Envelope */}
                              <rect
                                x={ox}
                                y={oy}
                                width={envL * scale}
                                height={envW * scale}
                                fill="#ffffff"
                                stroke="#1e293b"
                                strokeWidth="3"
                                rx="4"
                              />

                              {/* Dimension text on envelope */}
                              <text x={ox + (envL * scale) / 2} y={oy - 8} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="700">
                                Overall Length: {Math.round(envL * 100) / 100}m
                              </text>
                              <text x={ox - 8} y={oy + (envW * scale) / 2} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="700" transform={`rotate(-90 ${ox - 8} ${oy + (envW * scale) / 2})`}>
                                Width: {Math.round(envW * 100) / 100}m
                              </text>

                              {/* Chambers */}
                              {chambers.map((ch, idx) => {
                                const cx = ox + (ch.origin?.x || 0) * scale;
                                const cy = oy + (ch.origin?.y || 0) * scale;
                                const cw = Math.max(2, (ch.dimensions?.lengthM || 1) * scale);
                                const chg = Math.max(2, (ch.dimensions?.widthM || 1) * scale);
                                const isFreezer = (ch.roomTempC ?? 2) < 0;
                                const fillBg = isFreezer ? '#ede9fe' : (idx % 2 === 0 ? '#e0f2fe' : '#e0f7fa');
                                const strokeColor = isFreezer ? '#7c3aed' : '#0284c7';

                                // Door marker coordinates
                                let doorX = cx + cw / 2;
                                let doorY = cy + chg;
                                if (ch.door?.hostWall === 'left') { doorX = cx; doorY = cy + chg / 2; }
                                else if (ch.door?.hostWall === 'right') { doorX = cx + cw; doorY = cy + chg / 2; }
                                else if (ch.door?.hostWall === 'back') { doorX = cx + cw / 2; doorY = cy; }

                                const lenM = Math.round((Number(ch.dimensions?.lengthM) || 0) * 100) / 100;
                                const widM = Math.round((Number(ch.dimensions?.widthM) || 0) * 100) / 100;
                                const volM = Math.round((Number(ch.dimensions?.volumeM3) || 0) * 10) / 10;
                                const tempC = Math.round((Number(ch.roomTempC) || 2) * 10) / 10;

                                let nameText = ch.name || `Chamber ${idx + 1}`;
                                let dimText = `${lenM}m × ${widM}m`;
                                let volText = `${volM} m³`;
                                let tempText = `Design: ${tempC}°C`;
                                let nameSize = 11;
                                let subSize = 8.5;

                                if (cw < 65) {
                                  nameText = `C${idx + 1}`;
                                  dimText = `${lenM}×${widM}`;
                                  volText = `${volM}m³`;
                                  tempText = `${tempC}°C`;
                                  nameSize = 8.5;
                                  subSize = 7;
                                } else if (cw < 105) {
                                  nameText = `Ch. ${idx + 1}`;
                                  dimText = `${lenM}m × ${widM}m`;
                                  volText = `${volM} m³`;
                                  tempText = `${tempC}°C`;
                                  nameSize = 9.5;
                                  subSize = 7.5;
                                } else if (cw < 140) {
                                  nameText = ch.name || `Chamber ${idx + 1}`;
                                  dimText = `${lenM}m × ${widM}m`;
                                  volText = `${volM} m³`;
                                  tempText = `${tempC}°C`;
                                  nameSize = 10.5;
                                  subSize = 8;
                                }

                                const centerY = cy + chg / 2;
                                const isCompactHeight = chg < 80;

                                return (
                                  <g key={ch.chamberNumber || idx}>
                                    <defs>
                                      <clipPath id={`top-clip-${idx}`}>
                                        <rect x={cx + 1} y={cy + 1} width={Math.max(0, cw - 2)} height={Math.max(0, chg - 2)} rx="3" />
                                      </clipPath>
                                    </defs>

                                    <rect
                                      x={cx + 1}
                                      y={cy + 1}
                                      width={cw - 2}
                                      height={chg - 2}
                                      fill={fillBg}
                                      stroke={strokeColor}
                                      strokeWidth="1.5"
                                      rx="3"
                                    />

                                    {/* Text strictly clipped inside chamber bounds */}
                                    <g clipPath={`url(#top-clip-${idx})`}>
                                      {isCompactHeight ? (
                                        <>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY - 9}
                                            textAnchor="middle"
                                            fontSize={nameSize}
                                            fontWeight="800"
                                            fill="#0f172a"
                                          >
                                            {nameText}
                                          </text>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY + 3}
                                            textAnchor="middle"
                                            fontSize={subSize}
                                            fontWeight="600"
                                            fill="#334155"
                                          >
                                            {dimText}
                                          </text>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY + 14}
                                            textAnchor="middle"
                                            fontSize={subSize}
                                            fontWeight="700"
                                            fill={isFreezer ? '#6b21a8' : '#0369a1'}
                                          >
                                            {volText} • {tempText}
                                          </text>
                                        </>
                                      ) : (
                                        <>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY - 22}
                                            textAnchor="middle"
                                            fontSize={nameSize}
                                            fontWeight="800"
                                            fill="#0f172a"
                                          >
                                            {nameText}
                                          </text>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY - 8}
                                            textAnchor="middle"
                                            fontSize={subSize}
                                            fontWeight="600"
                                            fill="#334155"
                                          >
                                            {dimText}
                                          </text>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY + 6}
                                            textAnchor="middle"
                                            fontSize={subSize}
                                            fontWeight="600"
                                            fill="#64748b"
                                          >
                                            {volText}
                                          </text>
                                          <text
                                            x={cx + cw / 2}
                                            y={centerY + 20}
                                            textAnchor="middle"
                                            fontSize={subSize}
                                            fontWeight="700"
                                            fill={isFreezer ? '#6b21a8' : '#0369a1'}
                                          >
                                            {tempText}
                                          </text>
                                        </>
                                      )}
                                    </g>

                                    {/* Dedicated Door Symbol */}
                                    <circle cx={doorX} cy={doorY} r="6" fill="#f59e0b" stroke="#78350f" strokeWidth="1" />
                                    <text x={doorX} y={doorY + 3} textAnchor="middle" fontSize="7" fontWeight="800" fill="#ffffff">
                                      D
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        } else {
                          // SIDE ELEVATION (X-Z)
                          const scale = Math.min(520 / envL, 170 / envH);
                          const ox = (svgW - envL * scale) / 2;
                          const oy = (svgH - envH * scale) / 2;

                          return (
                            <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: '660px', display: 'block' }}>
                              {/* Outer Facility Profile */}
                              <rect
                                x={ox}
                                y={oy}
                                width={envL * scale}
                                height={envH * scale}
                                fill="#ffffff"
                                stroke="#1e293b"
                                strokeWidth="3"
                                rx="4"
                              />

                              {/* Ceiling PUF & Ground Slab Indicators */}
                              <rect x={ox - 4} y={oy - 6} width={envL * scale + 8} height="6" fill="#0284c7" rx="2" />
                              <text x={ox + (envL * scale) / 2} y={oy - 9} textAnchor="middle" fontSize="9" fill="#0284c7" fontWeight="700">
                                Insulated PUF Ceiling (T = {Math.round(envH * 100) / 100}m)
                              </text>

                              <rect x={ox - 4} y={oy + envH * scale} width={envL * scale + 8} height="8" fill="#64748b" rx="2" />
                              <text x={ox + (envL * scale) / 2} y={oy + envH * scale + 18} textAnchor="middle" fontSize="9" fill="#475569" fontWeight="700">
                                Floor: {heatLoadForm.floorConstruction === 'puf' ? 'Insulated PUF Panels' : 'Civil Concrete Slab'} (Z = 0m)
                              </text>

                              {/* Chambers Elevation */}
                              {chambers.map((ch, idx) => {
                                const cx = ox + (ch.origin?.x || 0) * scale;
                                const cz = (ch.origin?.z || 0);
                                const chH = (ch.dimensions?.heightM || envH);
                                const cy = oy + (envH - (cz + chH)) * scale;
                                const cw = Math.max(2, (ch.dimensions?.lengthM || 1) * scale);
                                const chg = Math.max(2, chH * scale);
                                const isUpperTier = cz > 0;

                                const hM = Math.round((Number(chH) || 0) * 100) / 100;
                                let nameText = ch.name || `Chamber ${idx + 1}`;
                                if (isUpperTier) nameText += ' (Upper)';
                                let headroomText = `Clear Headroom: ${hM}m`;
                                let nameSize = 10;
                                let subSize = 8.5;

                                if (cw < 60) {
                                  nameText = `C${idx + 1}${isUpperTier ? ' (U)' : ''}`;
                                  headroomText = `H: ${hM}m`;
                                  nameSize = 8.5;
                                  subSize = 7;
                                } else if (cw < 95) {
                                  nameText = `Ch. ${idx + 1}${isUpperTier ? ' (Up)' : ''}`;
                                  headroomText = `Headroom: ${hM}m`;
                                  nameSize = 9.5;
                                  subSize = 7.5;
                                }

                                const centerY = cy + chg / 2;

                                return (
                                  <g key={ch.chamberNumber || idx}>
                                    <defs>
                                      <clipPath id={`side-clip-${idx}`}>
                                        <rect x={cx + 1} y={cy + 1} width={Math.max(0, cw - 2)} height={Math.max(0, chg - 2)} rx="3" />
                                      </clipPath>
                                    </defs>

                                    <rect
                                      x={cx + 1}
                                      y={cy + 1}
                                      width={cw - 2}
                                      height={chg - 2}
                                      fill={isUpperTier ? '#fef3c7' : '#e0f2fe'}
                                      stroke={isUpperTier ? '#d97706' : '#0284c7'}
                                      strokeWidth="1.5"
                                      rx="3"
                                    />

                                    <g clipPath={`url(#side-clip-${idx})`}>
                                      <text
                                        x={cx + cw / 2}
                                        y={centerY - 4}
                                        textAnchor="middle"
                                        fontSize={nameSize}
                                        fontWeight="800"
                                        fill="#0f172a"
                                      >
                                        {nameText}
                                      </text>
                                      <text
                                        x={cx + cw / 2}
                                        y={centerY + 10}
                                        textAnchor="middle"
                                        fontSize={subSize}
                                        fontWeight="600"
                                        fill="#475569"
                                      >
                                        {headroomText}
                                      </text>
                                    </g>
                                  </g>
                                );
                              })}

                              {/* Mezzanine Deck Divider if Height Divided */}
                              {liveChamberLayout.partitions?.some(p => p.type === 'deck' || p.normalAxis === 'Z') && (
                                <line
                                  x1={ox}
                                  y1={oy + (envH * scale) / 2}
                                  x2={ox + envL * scale}
                                  y2={oy + (envH * scale) / 2}
                                  stroke="#d97706"
                                  strokeWidth="3"
                                  strokeDasharray="4 2"
                                />
                              )}
                            </svg>
                          );
                        }
                      })()}
                      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <span>🟡 D = Dedicated Chamber Door</span>
                        <span>•</span>
                        <span>🟦 Blue Border = Insulated Partitions</span>
                        <span>•</span>
                        <span>Every chamber receives exactly 1 dedicated door with verified egress route.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 2: Stored Commodity & Thermal Targets */}
              <div style={{
                background: 'var(--bg-primary, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Flame size={14} /> Stored Commodity &amp; Operating Temperatures
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    Stored Commodity (ASHRAE Handbooks Database)
                  </label>
                  <select
                    className="form-input"
                    style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.83rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                    value={heatLoadForm.commodityId}
                    onChange={e => handleCommodityChange(e.target.value)}
                  >
                    {commodities.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.category}] {c.name} (Design: {c.storage_temp_min}°C to {c.storage_temp_max}°C)
                      </option>
                    ))}
                  </select>
                  {selectedCommodity && (
                    <div style={{
                      display: 'flex',
                      gap: '0.85rem',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      background: 'rgba(2, 132, 199, 0.06)',
                      border: '1px solid rgba(2, 132, 199, 0.18)',
                      borderRadius: '6px',
                      padding: '0.3rem 0.65rem',
                      marginTop: '0.4rem',
                      fontSize: '0.73rem',
                      color: '#0369a1'
                    }}>
                      <span>Freezing Point: <strong>{selectedCommodity.freezing_point_c}°C</strong></span>
                      <span>•</span>
                      <span>Specific Heat (Cp): <strong>{selectedCommodity.cp_above}</strong> kJ/kg·K</span>
                      <span>•</span>
                      <span>Respiration Heat: <strong>{selectedCommodity.respiration_rate_mw_kg || 0}</strong> mW/kg</span>
                    </div>
                  )}
                </div>

                {/* Temperatures & Product Inflow */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Daily Inflow (kg/day)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      value={heatLoadForm.dailyMassKg}
                      onChange={e => setHeatLoadForm(p => ({ ...p, dailyMassKg: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Product Entry Temp (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      value={heatLoadForm.entryTemp}
                      onChange={e => setHeatLoadForm(p => ({ ...p, entryTemp: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Ambient Max (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      value={heatLoadForm.ambientTemp}
                      onChange={e => setHeatLoadForm(p => ({ ...p, ambientTemp: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Room Design Temp (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      value={heatLoadForm.roomTemp}
                      onChange={e => setHeatLoadForm(p => ({ ...p, roomTemp: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: Machinery Sizing & Safety Parameters */}
              <div style={{
                background: 'var(--bg-primary, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Cpu size={14} /> Equipment Running Duty &amp; Safety Factors
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Compressor Run Target</label>
                    <select
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.82rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                      value={heatLoadForm.compressorRunHours}
                      onChange={e => setHeatLoadForm(p => ({ ...p, compressorRunHours: Number(e.target.value) }))}
                    >
                      <option value={16.0}>16.0 Hours / Day (Standard Cold Storage)</option>
                      <option value={18.0}>18.0 Hours / Day (Heavy Duty Pull-down)</option>
                      <option value={20.0}>20.0 Hours / Day (Continuous Process)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Safety Factor</label>
                    <select
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.82rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                      value={heatLoadForm.safetyFactor}
                      onChange={e => setHeatLoadForm(p => ({ ...p, safetyFactor: Number(e.target.value) }))}
                    >
                      <option value={0.10}>10% Allowance (Recommended)</option>
                      <option value={0.15}>15% Heavy Duty Allowance</option>
                      <option value={0.05}>5% Minimal Safety Factor</option>
                    </select>
                  </div>
                </div>

                {/* Collapsible Advanced Internal & Defrost Loads */}
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: '#0369a1',
                      padding: '0.25rem 0.55rem',
                      background: 'rgba(2, 132, 199, 0.06)',
                      borderRadius: '6px'
                    }}
                    onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                  >
                    <Settings2 size={13} />
                    <span>{showAdvancedParams ? 'Hide Internal & Equipment Loads' : 'Adjust Internal Lighting, People & Defrost Loads...'}</span>
                    {showAdvancedParams ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {showAdvancedParams && (
                    <div style={{
                      background: 'var(--bg-secondary, #f8fafc)',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      marginTop: '0.5rem',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem'
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.6rem'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Lighting (kW)</span>
                          <input
                            type="number"
                            step="0.1"
                            placeholder="Auto (10W/m²)"
                            className="form-input"
                            style={{ height: '34px', fontSize: '0.82rem' }}
                            value={heatLoadForm.lightsKw}
                            onChange={e => setHeatLoadForm(p => ({ ...p, lightsKw: e.target.value }))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Occupants (count)</span>
                          <input
                            type="number"
                            className="form-input"
                            style={{ height: '34px', fontSize: '0.82rem' }}
                            value={heatLoadForm.peopleCount}
                            onChange={e => setHeatLoadForm(p => ({ ...p, peopleCount: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Fan Motor (kW)</span>
                          <input
                            type="number"
                            step="0.1"
                            className="form-input"
                            style={{ height: '34px', fontSize: '0.82rem' }}
                            value={heatLoadForm.fanMotorKw}
                            onChange={e => setHeatLoadForm(p => ({ ...p, fanMotorKw: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Defrost Heater (kW)</span>
                          <input
                            type="number"
                            step="0.5"
                            placeholder="Auto"
                            className="form-input"
                            style={{ height: '34px', fontSize: '0.82rem' }}
                            value={heatLoadForm.defrostHeaterKw}
                            onChange={e => setHeatLoadForm(p => ({ ...p, defrostHeaterKw: e.target.value }))}
                          />
                        </div>
                      </div>

                      {/* Infiltration Model Toggle: ASHRAE ACH vs Gosney-Olsson */}
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b' }}>
                            Air Infiltration Calculation Method:
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="infilMethod"
                                checked={heatLoadForm.infiltrationModel !== 'gosney_olsson'}
                                onChange={() => setHeatLoadForm(p => ({ ...p, infiltrationModel: 'ashrae' }))}
                              />
                              ASHRAE Table 7 ACH (Standard)
                            </label>
                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="infilMethod"
                                checked={heatLoadForm.infiltrationModel === 'gosney_olsson'}
                                onChange={() => setHeatLoadForm(p => ({ ...p, infiltrationModel: 'gosney_olsson' }))}
                              />
                              Gosney-Olsson Door Dynamics (Provisional)
                            </label>
                          </div>
                        </div>

                        {heatLoadForm.infiltrationModel === 'gosney_olsson' && (
                          <div style={{
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '4px',
                            padding: '0.45rem 0.6rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '0.5rem',
                            marginTop: '0.35rem'
                          }}>
                            <div>
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 2 }}>Door Openings (/hr)</span>
                              <input
                                type="number"
                                className="form-input"
                                style={{ height: '30px', fontSize: '0.75rem' }}
                                value={heatLoadForm.openFrequencyPerHour ?? 15}
                                onChange={e => setHeatLoadForm(p => ({ ...p, openFrequencyPerHour: Number(e.target.value) }))}
                              />
                            </div>
                            <div>
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 2 }}>Open Duration (sec/door)</span>
                              <input
                                type="number"
                                className="form-input"
                                style={{ height: '30px', fontSize: '0.75rem' }}
                                value={heatLoadForm.openDurationSec ?? 30}
                                onChange={e => setHeatLoadForm(p => ({ ...p, openDurationSec: Number(e.target.value) }))}
                              />
                            </div>
                            <div>
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 2 }}>Strip Curtain Protection</span>
                              <select
                                className="form-input"
                                style={{ height: '30px', fontSize: '0.75rem' }}
                                value={heatLoadForm.protectionFactor ?? 0.60}
                                onChange={e => setHeatLoadForm(p => ({ ...p, protectionFactor: Number(e.target.value) }))}
                              >
                                <option value={0.60}>PVC Strip Curtain (0.60 / 60%)</option>
                                <option value={0.80}>Air Curtain Fan (0.80 / 80%)</option>
                                <option value={1.00}>Unprotected Open Door (1.00 / 100%)</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 4: Equipment Brand, Technology & Refrigerant Preference */}
              <div style={{
                background: 'var(--bg-primary, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Snowflake size={14} /> Equipment Brand, Technology &amp; Refrigerant
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Brand Preference</label>
                    <select
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.82rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                      value={heatLoadForm.brand}
                      onChange={e => {
                        const val = e.target.value;
                        setHeatLoadForm(p => ({ ...p, brand: val }));
                        if (val !== 'any') setCduBrandFilter(val);
                        else setCduBrandFilter('all');
                      }}
                    >
                      <option value="Daikin">Daikin (Authorized Dealer)</option>
                      <option value="Emerson">Emerson</option>
                      <option value="any">Compare All Brands</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Compressor Technology</label>
                    <select
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.82rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                      value={heatLoadForm.compressorPreference}
                      onChange={e => setHeatLoadForm(p => ({ ...p, compressorPreference: e.target.value }))}
                    >
                      <option value="any">Compare Scroll &amp; Reciprocating</option>
                      <option value="scroll">Scroll (High Efficiency)</option>
                      <option value="reciprocating">Reciprocating</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Refrigerant</label>
                    <select
                      className="form-input"
                      style={{ height: '38px', minHeight: '38px', padding: '0.35rem 2rem 0.35rem 0.65rem', fontSize: '0.82rem', lineHeight: 'normal', boxSizing: 'border-box' }}
                      value={heatLoadForm.refrigerant}
                      onChange={e => setHeatLoadForm(p => ({ ...p, refrigerant: e.target.value }))}
                    >
                      <option value="R404A">R404A (Eco-blend)</option>
                      <option value="R410A">R410A / 410</option>
                      <option value="R22">R22</option>
                      <option value="R134a">R134a</option>
                      <option value="R32">R32</option>
                      <option value="R407C">R407C</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                className="btn btn-primary w-full"
                style={{
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.28)',
                  cursor: 'pointer',
                  border: 'none',
                  color: '#ffffff'
                }}
                onClick={handleCalculateHeatLoad}
                disabled={calculating}
              >
                {calculating ? <Loader2 size={18} className="animate-spin" /> : <Calculator size={18} />}
                {calculating ? 'Running Thermodynamic Calculations...' : 'Calculate Heat Load & Match Daikin Units'}
              </button>
            </div>

            {/* RESULTS VIEW */}
            {heatLoadResult && (
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #0284c7',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem',
                boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.1)'
              }}>
                {/* Executive Capacity Metric Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
                      Required Machinery Rating ({heatLoadResult.machineRating.runHours} hrs/day @ +10% SF)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0369a1' }}>
                        {heatLoadResult.machineRating.capacityTr} TR
                      </span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                        ({heatLoadResult.machineRating.capacityKw} kW)
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {formatCurrency(heatLoadResult.machineRating.capacityBtuHr).replace('₹', '')} BTU/hr
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Daily Heat Load</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#b45309' }}>
                      {formatCurrency(heatLoadResult.thermalBreakdown.qTotalKj).replace('₹', '')} kJ/day
                    </div>
                  </div>
                </div>

                {/* Combined Facility Metrics Strip */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '0.45rem',
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                  border: '1.5px solid #0284c7',
                  borderRadius: '8px',
                  padding: '0.65rem 0.75rem',
                  marginBottom: '0.85rem',
                  textAlign: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Total Chambers</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                      {heatLoadResult.chambers?.length || 1} Rooms
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Equal Divided</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Total Doors</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                      {heatLoadResult.doors?.totalDoors || heatLoadResult.chambers?.length || 1} Nos
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Automatic 1/Room</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Partition Walls</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                      {heatLoadResult.partitionWalls?.count || 0} Walls
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      {heatLoadResult.partitionWalls?.totalAreaM2 || 0} m² Internal
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Facility Volume</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                      {heatLoadResult.inputs?.dimensions?.volumeM3 || 0} m³
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Combined Space</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Total PUF Area</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                      {heatLoadResult.inputs?.dimensions?.totalPufSurfaceAreaM2 || heatLoadResult.inputs?.dimensions?.surfaceAreaM2 || 0} m²
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Outer + Partitions</div>
                  </div>
                </div>

                {/* Thermal Breakdown Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <Layers size={11} /> Transmission
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginTop: '2px' }}>
                      {Math.round(heatLoadResult.thermalBreakdown.qTransmissionKj / 1000)}k kJ
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>
                      {heatLoadResult.thermalBreakdown.breakdownPercentages.transmission}%
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <Flame size={11} /> Product Load
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginTop: '2px' }}>
                      {Math.round(heatLoadResult.thermalBreakdown.qProductKj / 1000)}k kJ
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>
                      {heatLoadResult.thermalBreakdown.breakdownPercentages.product}%
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <Wind size={11} /> Infiltration
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginTop: '2px' }}>
                      {Math.round(heatLoadResult.thermalBreakdown.qAirInfiltrationKj / 1000)}k kJ
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>
                      {heatLoadResult.thermalBreakdown.breakdownPercentages.airInfiltration}%
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <User size={11} /> Internal
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginTop: '2px' }}>
                      {Math.round(heatLoadResult.thermalBreakdown.qInternalKj / 1000)}k kJ
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>
                      {heatLoadResult.thermalBreakdown.breakdownPercentages.internal}%
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <Cpu size={11} /> Equipment
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginTop: '2px' }}>
                      {Math.round(heatLoadResult.thermalBreakdown.qEquipmentKj / 1000)}k kJ
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 600 }}>
                      {heatLoadResult.thermalBreakdown.breakdownPercentages.equipment}%
                    </div>
                  </div>
                </div>

                {/* Central Daikin Outdoor Condensing Unit (CCU) Card */}
                <div style={{
                  background: '#ffffff',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: '1.5px solid #0284c7',
                  marginBottom: '0.85rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0369a1', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🏭</span>
                      CENTRAL DAIKIN OUTDOOR CONDENSING UNIT (CCU)
                      {(heatLoadResult.chambers?.length || 1) > 1 && ` — SIZED FOR COMBINED ${heatLoadResult.chambers.length} CHAMBERS`}
                    </span>
                    <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      Combined Duty: {heatLoadResult.machineRating.capacityTr} TR ({heatLoadResult.machineRating.capacityKw} kW)
                    </span>
                  </div>
                  {heatLoadResult.recommendations.multiUnitCcu ? (
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                        {heatLoadResult.recommendations.multiUnitCcu.count} × Daikin {heatLoadResult.recommendations.multiUnitCcu.unit.model_number}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 700, marginTop: '2px' }}>
                        Total Combined Capacity: {heatLoadResult.recommendations.multiUnitCcu.totalCapacityTr} TR ({heatLoadResult.recommendations.multiUnitCcu.totalCapacityKw} kW)
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                        {heatLoadResult.recommendations.multiUnitCcu.note}
                      </div>
                    </div>
                  ) : activeHeatLoadCcu ? (
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                        Daikin {activeHeatLoadCcu.model_number}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '3px' }}>
                        {activeHeatLoadCcu.horse_power || 4} HP • {activeHeatLoadCcu.compressor_type || 'Scroll'} Compressor • Nominal Rating: {activeHeatLoadCcu.nominal_tr} TR ({activeHeatLoadCcu.capacity} kW)
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px' }}>
                        Airflow: {activeHeatLoadCcu.air_flow_m3h} m³/h • Power Input: {activeHeatLoadCcu.power_input_watts} W • Refrigerant: {heatLoadForm.refrigerant}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>No matching CCU found in catalog</div>
                  )}
                </div>

                {/* Catalog Unverified Engineering Alert Banner */}
                {(heatLoadResult.recommendations?.unverified || heatLoadResult.catalogVerificationStatus === 'unverified') && (
                  <div style={{
                    background: '#fffbeb',
                    border: '1.5px solid #f59e0b',
                    borderRadius: '6px',
                    padding: '0.55rem 0.8rem',
                    marginBottom: '0.85rem',
                    color: '#92400e',
                    fontSize: '0.76rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, color: '#d97706' }} />
                    <span>
                      <strong>Catalog Data Unverified — Engineering Verification Required:</strong> Machinery ratings reflect estimated duty. Manufacturer rating charts and selection software must be verified prior to procurement.
                    </span>
                  </div>
                )}

                {/* Multi-Circuit Refrigeration Architecture Banner (if MT + LT split) */}
                {heatLoadResult.recommendations?.circuits?.length > 1 && (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #16a34a',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '0.85rem'
                  }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#15803d', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Cpu size={14} /> MULTI-CIRCUIT REFRIGERATION ARCHITECTURE (SST Split: MT Chiller + LT Freezer)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.74rem' }}>
                      {heatLoadResult.recommendations.circuits.map(ckt => (
                        <div key={ckt.circuitId} style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '5px', border: '1px solid #bbf7d0' }}>
                          <strong style={{ color: '#166534' }}>{ckt.name}:</strong>
                          <div>Duty: {ckt.capacityTr} TR ({ckt.capacityKw} kW) • SST: {ckt.designSstC}°C</div>
                          <div style={{ color: '#4b5563' }}>Chambers: {(ckt.chambers || []).join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Separate Result Cards for EVERY Chamber */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Layers size={15} style={{ color: '#0284c7' }} />
                      Chamber-Wise Thermal Sizing &amp; Dedicated Evaporators ({heatLoadResult.chambers?.length || 1} {heatLoadResult.chambers?.length === 1 ? 'Chamber' : 'Chambers'})
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                      1 Dedicated Evaporator + 1 Dedicated Door per Chamber
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(heatLoadResult.chambers?.length || 1, 3)}, 1fr)`,
                    gap: '0.65rem'
                  }}>
                    {(heatLoadResult.chambers || []).map(ch => (
                      <div key={ch.chamberNumber} style={{
                        background: '#ffffff',
                        border: '1.5px solid #93c5fd',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                      }}>
                        {/* Chamber Header & Dedicated Door */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>{ch.name}</span>
                          <span style={{
                            fontSize: '0.68rem',
                            background: '#dcfce7',
                            color: '#15803d',
                            border: '1px solid #86efac',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            🚪 {ch.door?.hostWall ? `Host: ${ch.door.hostWall.toUpperCase()}` : 'Dedicated Door'}
                          </span>
                        </div>

                        {/* Dimensions & Clear Volume */}
                        <div style={{ background: '#f8fafc', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
                            Size: {ch.dimensions.lengthM}m × {ch.dimensions.widthM}m × {ch.dimensions.heightM}m
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '1px' }}>
                            Gross: {ch.dimensions.volumeM3} m³ • Clear Usable: <strong>{ch.clearDimensions?.usableVolumeM3 || ch.dimensions.volumeM3} m³</strong>
                          </div>
                          {ch.door?.egressRoute && (
                            <div style={{ fontSize: '0.66rem', color: '#15803d', marginTop: '2px', fontWeight: 600 }}>
                              Route: {ch.door.egressRoute.join(' → ')} (Egress Verified)
                            </div>
                          )}
                        </div>

                        {/* Chamber Heat Load */}
                        <div style={{
                          background: '#eff6ff',
                          padding: '0.45rem 0.55rem',
                          borderRadius: '5px',
                          border: '1px solid #bfdbfe'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Chamber Heat Load:</span>
                            <strong style={{ fontSize: '0.85rem', color: '#0369a1' }}>{ch.capacityTr} TR ({ch.capacityKw} kW)</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginTop: '3px' }}>
                            <span>Trans: {Math.round(ch.thermalBreakdown.qTransmissionKj / 1000)}k kJ</span>
                            <span>Infil: {Math.round(ch.thermalBreakdown.qAirInfiltrationKj / 1000)}k kJ</span>
                            <span>Prod: {Math.round(ch.thermalBreakdown.qProductKj / 1000)}k kJ</span>
                          </div>
                        </div>

                        {/* Dedicated Indoor Daikin Evaporator */}
                        <div style={{
                          background: '#faf5ff',
                          padding: '0.45rem 0.55rem',
                          borderRadius: '5px',
                          border: '1px solid #e9d5ff'
                        }}>
                          <div style={{ fontSize: '0.68rem', color: '#6b21a8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                            Dedicated Indoor Evaporator:
                          </div>
                          {ch.evaporator ? (
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#581c87' }}>
                                ❄️ Daikin {ch.evaporator.model_number}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#7e22ce', marginTop: '1px' }}>
                                Capacity: <strong>{ch.evaporator.capacity_kw || ch.capacityKw} kW</strong> ({Math.round(((ch.evaporator.capacity_kw || ch.capacityKw)/3.517)*100)/100} TR)
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#9333ea', marginTop: '1px' }}>
                                Airflow: {ch.evaporator.air_flow_m3h || 'High CFM'} m³/h • Defrost: {ch.evaporator.defrost_type || 'Electric'}
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: '#b45309', fontWeight: 600, fontSize: '0.75rem' }}>
                              Matched DX Cooling Unit ({ch.capacityKw} kW)
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Insertion Items Checkbox & Custom Price Form */}
                <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                    Select Items to Insert into Invoice / Quotation:
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {/* Dedicated Indoor Evaporators */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.evaporator}
                          onChange={e => setSelectedLines(p => ({ ...p, evaporator: e.target.checked }))}
                        />
                        <span>
                          {heatLoadResult.chambers?.length > 1
                            ? `${heatLoadResult.chambers.length} × Dedicated Daikin Evaporators (1 Dedicated per Chamber)`
                            : `Daikin ${activeHeatLoadEvap?.model_number || 'ACU'} Air Cooling Unit`}
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹/unit</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.evaporator}
                          onChange={e => setCustomRates(p => ({ ...p, evaporator: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    {/* Central Outdoor CCU Line */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.cdu}
                          onChange={e => setSelectedLines(p => ({ ...p, cdu: e.target.checked }))}
                        />
                        <span>
                          {heatLoadResult.recommendations.multiUnitCcu
                            ? `${heatLoadResult.recommendations.multiUnitCcu.count} × Daikin ${heatLoadResult.recommendations.multiUnitCcu.unit.model_number} Condensing Unit`
                            : `Central Daikin ${activeHeatLoadCcu?.model_number || 'CCU'} Condensing Unit${heatLoadResult.chambers?.length > 1 ? ` (Central Combined - ${heatLoadResult.chambers.length} Chambers)` : ''}`}
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.cdu}
                          onChange={e => setCustomRates(p => ({ ...p, cdu: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    {/* Cold Room Doors Line (Automatic 1 per chamber) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.doors}
                          onChange={e => setSelectedLines(p => ({ ...p, doors: e.target.checked }))}
                        />
                        <span>
                          {(() => {
                            const opt = DOOR_OPTIONS.find(d => d.id === heatLoadForm.doorType) || DOOR_OPTIONS[0];
                            const doorsCount = heatLoadResult.doors?.totalDoors || heatLoadResult.chambers?.length || 1;
                            return doorsCount > 1
                              ? `${doorsCount} × ${opt.short} (1 per Chamber)`
                              : opt.label;
                          })()}
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹/door</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.doors}
                          onChange={e => setCustomRates(p => ({ ...p, doors: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    {/* Refrigeration Kits (1 per Chamber) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.kit}
                          onChange={e => setSelectedLines(p => ({ ...p, kit: e.target.checked }))}
                        />
                        <span>
                          {(heatLoadResult.chambers?.length || 1) > 1
                            ? `${heatLoadResult.chambers.length} × Daikin Cold-Room Refrigeration Kits (1 Set per Chamber)`
                            : 'Daikin Refrigeration Kit (TXV + Orifice + Solenoid + Dixell Controller)'}
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹/set</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.kit}
                          onChange={e => setCustomRates(p => ({ ...p, kit: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    {/* PUF Insulated Sandwich Panels Line */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.puf}
                          onChange={e => setSelectedLines(p => ({ ...p, puf: e.target.checked }))}
                        />
                        <span>
                          PUF Insulated Panels ({heatLoadResult.inputs?.puf?.thicknessMm || 100}mm) — {heatLoadResult.inputs?.dimensions?.totalPufSurfaceAreaM2 || heatLoadResult.inputs?.dimensions?.surfaceAreaM2 || 0} sq.m
                          {(heatLoadResult.chambers?.length || 1) > 1 && ` (Includes ${heatLoadResult.partitionWalls?.count || 0} Partition Walls)`}
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹/m²</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.puf}
                          onChange={e => setCustomRates(p => ({ ...p, puf: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    {/* Installation */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.installation}
                          onChange={e => setSelectedLines(p => ({ ...p, installation: e.target.checked }))}
                        />
                        <span>
                          Cold-Room Installation, {heatLoadResult.chambers?.length > 1 ? 'Multi-Chamber Refrigerant Piping' : 'Refrigerant Copper Piping'}, Testing & Commissioning
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.installation}
                          onChange={e => setCustomRates(p => ({ ...p, installation: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* MODE B: STANDARD READY RECKONER MODE */}
        {/* ========================================================= */}
        {sizerMode === 'reckoner' && (
          <div>
            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              {/* Application Selector */}
              <div className="form-group mb-3">
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Application / Room Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn ${calcForm.application === 'chiller' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.82rem', padding: '0.5rem' }}
                    onClick={() => setCalcForm(p => ({ ...p, application: 'chiller' }))}
                  >
                    Chiller (+2°C to +8°C)
                  </button>
                  <button
                    type="button"
                    className={`btn ${calcForm.application === 'freezer' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.82rem', padding: '0.5rem' }}
                    onClick={() => setCalcForm(p => ({ ...p, application: 'freezer' }))}
                  >
                    Freezer (-18°C to -25°C)
                  </button>
                  <button
                    type="button"
                    className={`btn ${calcForm.application === 'bmc' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.82rem', padding: '0.5rem' }}
                    onClick={() => setCalcForm(p => ({ ...p, application: 'bmc' }))}
                  >
                    Milk Chiller (BMC)
                  </button>
                </div>
              </div>

              {/* Dimensions */}
              {calcForm.application === 'bmc' ? (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="form-group">
                    <label className="form-label">Daily Milk Capacity (Liters)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={calcForm.dailyMilkLiters}
                      onChange={e => setCalcForm(p => ({ ...p, dailyMilkLiters: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ambient Rating (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={calcForm.ambientTemp}
                      onChange={e => setCalcForm(p => ({ ...p, ambientTemp: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>Room Dimensions</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${calcForm.unit === 'ft' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setCalcForm(p => ({ ...p, unit: 'ft' }))}
                      >
                        Feet (ft)
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${calcForm.unit === 'm' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setCalcForm(p => ({ ...p, unit: 'm' }))}
                      >
                        Meters (m)
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    <div>
                      <small style={{ color: 'var(--text-muted)' }}>Length ({calcForm.unit})</small>
                      <input
                        type="number"
                        className="form-input"
                        value={calcForm.length}
                        onChange={e => setCalcForm(p => ({ ...p, length: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)' }}>Width ({calcForm.unit})</small>
                      <input
                        type="number"
                        className="form-input"
                        value={calcForm.width}
                        onChange={e => setCalcForm(p => ({ ...p, width: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)' }}>Height ({calcForm.unit})</small>
                      <input
                        type="number"
                        className="form-input"
                        value={calcForm.height}
                        onChange={e => setCalcForm(p => ({ ...p, height: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Refrigerant & Compressor Specs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Brand Preference</label>
                  <select
                    className="form-input"
                    value={calcForm.brand}
                    onChange={e => setCalcForm(p => ({ ...p, brand: e.target.value }))}
                  >
                    <option value="Daikin">Daikin (Authorized Dealer)</option>
                    <option value="Emerson">Emerson</option>
                    <option value="any">Compare All Brands</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Compressor Technology</label>
                  <select
                    className="form-input"
                    value={calcForm.compressorType}
                    onChange={e => setCalcForm(p => ({ ...p, compressorType: e.target.value }))}
                  >
                    <option value="scroll">Scroll (High Efficiency)</option>
                    <option value="reciprocating">Reciprocating</option>
                    <option value="any">Any Technology</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Refrigerant</label>
                  <select
                    className="form-input"
                    value={calcForm.refrigerant}
                    onChange={e => setCalcForm(p => ({ ...p, refrigerant: e.target.value }))}
                  >
                    <option value="R404A">R404A (Eco-blend)</option>
                    <option value="R410A">R410A / 410</option>
                    <option value="R22">R22</option>
                    <option value="R134a">R134a</option>
                    <option value="R32">R32</option>
                    <option value="R407C">R407C</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Ambient (°C)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={calcForm.ambientTemp}
                    onChange={e => setCalcForm(p => ({ ...p, ambientTemp: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary w-full mt-3"
                style={{ fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                onClick={handleCalculateReckoner}
                disabled={calculating}
              >
                {calculating ? <Loader2 size={18} className="animate-spin" /> : <Calculator size={18} />}
                {calculating ? 'Matching Catalogue Models...' : 'Calculate & Match Equipment'}
              </button>
            </div>

            {/* Reckoner Results Card */}
            {recommendation && (
              <div style={{
                background: 'rgba(37, 99, 235, 0.05)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div className="flex justify-between items-center mb-2">
                  <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.95rem' }}>
                    Estimated Heat Load: {recommendation.estimatedLoadKw} kW
                  </span>
                  <span style={{ fontSize: '0.75rem', background: '#e0e7ff', color: '#3730a3', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {recommendation.catalogueSource} (p.{recommendation.cataloguePage})
                  </span>
                </div>

                {allAvailableCompressors.length > 0 && (
                  <div style={{
                    background: '#fff',
                    border: '1.5px solid #93c5fd',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '0.85rem',
                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.06)'
                  }}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1">
                        <span style={{ fontSize: '1rem' }}>⚙️</span>
                        <label style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#1e40af' }}>
                          Select Compressor / CDU Model ({filteredCompressors.length} options):
                        </label>
                      </div>

                      {uniqueBrands.length > 2 && (
                        <div className="flex items-center gap-1">
                          <Filter size={12} style={{ color: '#64748b' }} />
                          <select
                            className="form-input"
                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', height: 'auto', width: 'auto' }}
                            value={cduBrandFilter}
                            onChange={e => setCduBrandFilter(e.target.value)}
                          >
                            {uniqueBrands.map(b => (
                              <option key={b} value={b}>Brand: {b === 'all' ? 'All Brands' : b}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <select
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', border: '1px solid #3b82f6' }}
                      value={activeReckonerCdu?.id || ''}
                      onChange={e => handleSelectReckonerCdu(e.target.value)}
                    >
                      {filteredCompressors.map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.brand_name || 'CDU'}] {c.model_number} ({c.capacity} kW) — ₹{c.selling_price || 0} {c.voltage_phase ? `[${c.voltage_phase}]` : ''} {c.catalogue_ref ? `(${c.catalogue_ref})` : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                      <span>Chosen: <strong>{activeReckonerCdu?.brand_name} {activeReckonerCdu?.model_number}</strong> ({activeReckonerCdu?.capacity} kW)</span>
                      <span>Catalogue: {activeReckonerCdu?.catalogue_ref || 'Standard Catalog'}</span>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.82rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div><strong>Selected CDU:</strong> {activeReckonerCdu?.brand_name || 'Emerson'} {activeReckonerCdu?.model_number} ({activeReckonerCdu?.capacity} kW)</div>
                  <div><strong>Matched Evaporator:</strong> {recommendation.recommendations?.evaporator?.brand_name || 'Daikin'} {recommendation.recommendations?.evaporator?.model_number}</div>
                  <div><strong>Digital Controller:</strong> {recommendation.recommendations?.controller?.model || 'Dixell XR02CX'}</div>
                  <div><strong>Expansion Valve:</strong> {recommendation.recommendations?.expansionValve || 'TIE-SW'}</div>
                </div>

                {/* Line Items Checkboxes */}
                <div style={{ borderTop: '1px solid rgba(37, 99, 235, 0.2)', paddingTop: '0.75rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                    Select Lines to Insert into Invoice:
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.cdu}
                          onChange={e => setSelectedLines(p => ({ ...p, cdu: e.target.checked }))}
                        />
                        <span>{activeReckonerCdu?.brand_name || 'Emerson'} {activeReckonerCdu?.model_number} Condensing Unit ({activeReckonerCdu?.capacity} kW)</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.cdu}
                          onChange={e => setCustomRates(p => ({ ...p, cdu: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.evaporator}
                          onChange={e => setSelectedLines(p => ({ ...p, evaporator: e.target.checked }))}
                        />
                        <span>Daikin {recommendation.recommendations?.evaporator?.model_number} Air Cooling Unit</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.evaporator}
                          onChange={e => setCustomRates(p => ({ ...p, evaporator: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.kit}
                          onChange={e => setSelectedLines(p => ({ ...p, kit: e.target.checked }))}
                        />
                        <span>Refrigeration Kit (TXV + Solenoid + Dixell Controller)</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.kit}
                          onChange={e => setCustomRates(p => ({ ...p, kit: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.installation}
                          onChange={e => setSelectedLines(p => ({ ...p, installation: e.target.checked }))}
                        />
                        <span>Installation, Copper Piping & Commissioning</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}
                          value={customRates.installation}
                          onChange={e => setCustomRates(p => ({ ...p, installation: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontWeight: 600 }}
            onClick={handleApplyToInvoice}
            disabled={sizerMode === 'heatload' ? !heatLoadResult : !recommendation}
          >
            Insert into Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
