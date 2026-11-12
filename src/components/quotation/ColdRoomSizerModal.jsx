import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Calculator, CheckCircle2, AlertTriangle, Layers, Plus, Loader2,
  Filter, ChevronDown, ChevronUp, Cpu, Flame, Wind, User, Settings2,
  Snowflake, Zap
} from 'lucide-react';
import { calculateColdRoom, calculateHeatLoad, getThermalCommodities } from '../../store';
import { formatCurrency } from '../../utils';
import { toast } from '../Toast';

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
    brand: 'Emerson',
    dailyMilkLiters: 1000,
  });
  const [recommendation, setRecommendation] = useState(null);

  // -------------------------------------------------------------
  // 2. ADVANCED HEAT LOAD ENGINE STATE (ASHRAE / USDA / Daikin)
  // -------------------------------------------------------------
  const [commodities, setCommodities] = useState([]);
  const [heatLoadForm, setHeatLoadForm] = useState({
    unit: 'm', // 'm' | 'ft'
    length: 12.0,
    width: 8.0,
    height: 4.5,
    pufThicknessMm: 100, // 60, 100, 120, 150
    ambientTemp: 42.0,
    roomTemp: 2.0,
    commodityId: 'com_apple',
    dailyMassKg: 8000,
    entryTemp: 28.0,
    compressorRunHours: 16.0,
    safetyFactor: 0.10,
    brand: 'Emerson',
    compressorPreference: 'any',
    refrigerant: 'R404A',
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
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [heatLoadResult, setHeatLoadResult] = useState(null);

  // Common UI state
  const [calculating, setCalculating] = useState(false);
  const [selectedCduId, setSelectedCduId] = useState(null);
  const [cduBrandFilter, setCduBrandFilter] = useState('all');

  const [selectedLines, setSelectedLines] = useState({
    cdu: true,
    evaporator: true,
    kit: true,
    installation: true,
  });

  const [customRates, setCustomRates] = useState({
    cdu: 0,
    evaporator: 0,
    kit: 14500,
    installation: 18000,
  });

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

  // Quick area and volume preview for heat load inputs
  const liveDimensions = useMemo(() => {
    const l = Number(heatLoadForm.length) || 0;
    const w = Number(heatLoadForm.width) || 0;
    const h = Number(heatLoadForm.height) || 0;
    const isM = heatLoadForm.unit === 'm';
    const lM = isM ? l : l * 0.3048;
    const wM = isM ? w : w * 0.3048;
    const hM = isM ? h : h * 0.3048;
    const volM3 = Math.round(lM * wM * hM * 10) / 10;
    const areaM2 = Math.round(2 * (lM * wM + lM * hM + wM * hM) * 10) / 10;
    return { volM3, areaM2 };
  }, [heatLoadForm.length, heatLoadForm.width, heatLoadForm.height, heatLoadForm.unit]);

  // -------------------------------------------------------------
  // CALCULATE ACTIONS
  // -------------------------------------------------------------
  const handleCalculateHeatLoad = async (e) => {
    if (e) e.preventDefault();
    setCalculating(true);
    try {
      const res = await calculateHeatLoad(heatLoadForm);
      setHeatLoadResult(res);

      const defaultCdu = res.recommendations?.ccu || null;
      setSelectedCduId(defaultCdu?.id || null);

      const cduPrice = defaultCdu?.selling_price || 0;
      const evapPrice = res.recommendations?.evaporator?.selling_price || 0;
      setCustomRates(prev => ({
        ...prev,
        cdu: cduPrice,
        evaporator: evapPrice,
      }));
      toast('Heat load calculated & Emerson equipment matched!', 'success');
    } catch {
      toast('Failed to calculate refrigeration heat load', 'error');
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
    const itemsToInsert = [];

    if (sizerMode === 'heatload') {
      if (!heatLoadResult) {
        toast('Please run "Calculate Heat Load & Match Equipment" first.', 'error');
        return;
      }

      const rec = heatLoadResult.recommendations || {};
      const mr = heatLoadResult.machineRating || {};

      // 1. Condensing Unit (Single or Multi-Unit)
      if (selectedLines.cdu) {
        if (rec.multiUnitCcu) {
          const mu = rec.multiUnitCcu;
          itemsToInsert.push({
            name: `${mu.unit.brand_name || "Emerson"} ${mu.unit.model_number} Outdoor Condensing Unit (${mu.unit.nominal_tr} TR each, ${mu.count} Sets = ${mu.totalCapacityTr} TR)`,
            hsn: '84189900',
            quantity: mu.count,
            unit: 'Set',
            rate: Number(customRates.cdu) || Number(mu.unit.selling_price) || 0,
            taxPercent: 18,
            discount: 0,
            product_id: mu.unit.product_id,
            model_id: mu.unit.id,
          });
        } else if (rec.ccu) {
          const ccu = rec.ccu;
          itemsToInsert.push({
            name: `${ccu.brand_name || "Emerson"} ${ccu.model_number} Outdoor Condensing Unit (${ccu.nominal_tr || ccu.capacity} TR @ ${heatLoadResult.inputs.temperatures.roomTempC}°C)`,
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

      // 2. Indoor Evaporator Unit (ACU)
      if (selectedLines.evaporator) {
        if (rec.multiUnitAcu) {
          const muA = rec.multiUnitAcu;
          itemsToInsert.push({
            name: `${muA.unit.model_number} DX Air Cooling Unit (${muA.unit.capacity_kw} kW each, ${muA.count} Nos = ${muA.totalCapacityKw} kW)`,
            hsn: '84189900',
            quantity: muA.count,
            unit: 'Nos',
            rate: Number(customRates.evaporator) || Number(muA.unit.selling_price) || 0,
            taxPercent: 18,
            discount: 0,
            product_id: muA.unit.product_id,
            model_id: muA.unit.id,
          });
        } else if (rec.evaporator) {
          const evap = rec.evaporator;
          itemsToInsert.push({
            name: `${evap.model_number} DX Air Cooling Unit (${evap.capacity_kw || evap.capacity} kW) - ${evap.defrost_type || 'Auto Defrost'}`,
            hsn: '84189900',
            quantity: 1,
            unit: 'Nos',
            rate: Number(customRates.evaporator) || Number(evap.selling_price) || 0,
            taxPercent: 18,
            discount: 0,
            product_id: evap.product_id,
            model_id: evap.id,
          });
        }
      }

      // 3. Refrigeration Kit & Controller
      if (selectedLines.kit) {
        const vr = rec.valveRecommendations || {};
        itemsToInsert.push({
          name: `Commercial Cold-Room Refrigeration Kit (${vr.expansionValve} TXV + ${vr.orifice} Orifice + ${vr.solenoidValve} Solenoid + ${vr.controller})`,
          hsn: '84189900',
          quantity: 1,
          unit: 'Set',
          rate: Number(customRates.kit) || 14500,
          taxPercent: 18,
          discount: 0,
        });
      }

      // 4. Installation & Commissioning
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
        calculationEngine: 'ASHRAE / USDA Refrigeration Heat Load Engine (Daikin Commercial)',
        dimensions: heatLoadResult.inputs.dimensions,
        puf: heatLoadResult.inputs.puf,
        temperatures: heatLoadResult.inputs.temperatures,
        commodity: heatLoadResult.inputs.commodity,
        brandPreference: heatLoadForm.brand,
        compressorTechnology: heatLoadForm.compressorPreference,
        refrigerant: heatLoadForm.refrigerant,
        thermalBreakdown: heatLoadResult.thermalBreakdown,
        machineRating: heatLoadResult.machineRating,
        recommendations: heatLoadResult.recommendations,
        calculatedAt: new Date().toISOString(),
      };

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
          name: `${evap.model_number} Air Cooling Unit Evaporator (${evap.capacity} kW)`,
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
      <div className="modal-content" style={{ maxWidth: '980px', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex justify-between items-center mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Snowflake size={24} style={{ color: '#0284c7', flexShrink: 0 }} />
            <div>
              <h3 className="section-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Refrigeration Heat Load &amp; Sizing Engine
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ASHRAE / USDA Thermodynamic Engine • Emerson Commercial Equipment Matcher
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
            <Cpu size={15} /> Advanced Heat Load Engine (ASHRAE / Emerson)
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
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Layers size={14} /> Chamber Dimensions &amp; PUF Insulation
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '1rem', alignItems: 'start' }}>
                  {/* Left: Dimensions */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: '0.8rem' }}>
                        Dimensions ({heatLoadForm.unit === 'm' ? 'Meters' : 'Feet'})
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                      <div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Length ({heatLoadForm.unit})</span>
                        <input
                          type="number"
                          step="0.1"
                          className="form-input"
                          style={{ height: '36px' }}
                          title="Length"
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
                          style={{ height: '36px' }}
                          title="Width"
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
                          style={{ height: '36px' }}
                          title="Height"
                          placeholder="H"
                          value={heatLoadForm.height}
                          onChange={e => setHeatLoadForm(p => ({ ...p, height: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.73rem',
                      color: '#0369a1',
                      background: 'rgba(2, 132, 199, 0.08)',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '5px',
                      marginTop: '0.45rem',
                      fontWeight: 600
                    }}>
                      <span>Volume: {liveDimensions.volM3} m³</span>
                      <span>•</span>
                      <span>Surface Area: {liveDimensions.areaM2} m²</span>
                    </div>
                  </div>

                  {/* Right: PUF Panel Thickness */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                      PUF Panel Thickness (k = 0.023 W/m·K)
                    </label>
                    <select
                      className="form-input"
                      style={{ height: '36px', fontSize: '0.82rem' }}
                      value={heatLoadForm.pufThicknessMm}
                      onChange={e => setHeatLoadForm(p => ({ ...p, pufThicknessMm: Number(e.target.value) }))}
                    >
                      <option value={60}>60 mm (U = 0.383 W/m²·K) — Ante-rooms &amp; Process Areas</option>
                      <option value={100}>100 mm (U = 0.230 W/m²·K) — Standard Chiller (+2°C to +8°C)</option>
                      <option value={120}>120 mm (U = 0.192 W/m²·K) — Low Temp Freezer (-18°C)</option>
                      <option value={150}>150 mm (U = 0.153 W/m²·K) — Deep Freezer (-25°C to -30°C)</option>
                    </select>
                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.3 }}>
                      Governs heat ingress through walls and ceiling based on temperature gradient.
                    </div>
                  </div>
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
                    style={{ height: '36px', fontSize: '0.83rem' }}
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
                      style={{ height: '36px' }}
                      value={heatLoadForm.dailyMassKg}
                      onChange={e => setHeatLoadForm(p => ({ ...p, dailyMassKg: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Product Entry Temp (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '36px' }}
                      value={heatLoadForm.entryTemp}
                      onChange={e => setHeatLoadForm(p => ({ ...p, entryTemp: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Ambient Max (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '36px' }}
                      value={heatLoadForm.ambientTemp}
                      onChange={e => setHeatLoadForm(p => ({ ...p, ambientTemp: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Room Design Temp (°C)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ height: '36px' }}
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
                      style={{ height: '36px', fontSize: '0.82rem' }}
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
                      style={{ height: '36px', fontSize: '0.82rem' }}
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
                      style={{ height: '36px', fontSize: '0.82rem' }}
                      value={heatLoadForm.brand}
                      onChange={e => {
                        const val = e.target.value;
                        setHeatLoadForm(p => ({ ...p, brand: val }));
                        if (val !== 'any') setCduBrandFilter(val);
                        else setCduBrandFilter('all');
                      }}
                    >
                      <option value="Daikin">Daikin (Authorized Service Dealer)</option>
                      <option value="Emerson">Emerson Climate Technologies</option>
                      <option value="any">Compare All Brands (Daikin &amp; Emerson)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Compressor Technology</label>
                    <select
                      className="form-input"
                      style={{ height: '36px', fontSize: '0.82rem' }}
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
                      style={{ height: '36px', fontSize: '0.82rem' }}
                      value={heatLoadForm.refrigerant}
                      onChange={e => setHeatLoadForm(p => ({ ...p, refrigerant: e.target.value }))}
                    >
                      <option value="R404A">R404A (Eco-blend)</option>
                      <option value="R22">R22</option>
                      <option value="R134a">R134a</option>
                      <option value="R410A">R410A</option>
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
                {calculating ? 'Running Thermodynamic Calculations...' : 'Calculate Heat Load & Match Equipment'}
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

                {/* Daikin Matching Output Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  {/* CCU Card */}
                  <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🏭</span> Emerson Outdoor Condensing Unit (CCU)
                    </div>
                    {heatLoadResult.recommendations.multiUnitCcu ? (
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                          {heatLoadResult.recommendations.multiUnitCcu.count} × {heatLoadResult.recommendations.multiUnitCcu.unit.model_number}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                          Combined: {heatLoadResult.recommendations.multiUnitCcu.totalCapacityTr} TR ({heatLoadResult.recommendations.multiUnitCcu.totalCapacityKw} kW)
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          {heatLoadResult.recommendations.multiUnitCcu.note}
                        </div>
                      </div>
                    ) : activeHeatLoadCcu ? (
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                          {activeHeatLoadCcu.model_number}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '2px' }}>
                          {activeHeatLoadCcu.horse_power || 4} HP • {activeHeatLoadCcu.compressor_type || 'Scroll'} • {activeHeatLoadCcu.nominal_tr} TR ({activeHeatLoadCcu.capacity} kW)
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          Airflow: {activeHeatLoadCcu.air_flow_m3h} m³/h • Power: {activeHeatLoadCcu.power_input_watts} W
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>No matching CCU found</div>
                    )}
                  </div>

                  {/* ACU / Evaporator Card */}
                  <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>❄️</span> Indoor DX Evaporator (ACU)
                    </div>
                    {heatLoadResult.recommendations.multiUnitAcu ? (
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                          {heatLoadResult.recommendations.multiUnitAcu.count} × {heatLoadResult.recommendations.multiUnitAcu.unit.model_number}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                          Combined: {heatLoadResult.recommendations.multiUnitAcu.totalCapacityKw} kW
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          {heatLoadResult.recommendations.multiUnitAcu.note}
                        </div>
                      </div>
                    ) : activeHeatLoadEvap ? (
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                          {activeHeatLoadEvap.model_number}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '2px' }}>
                          Capacity: {activeHeatLoadEvap.capacity_kw || activeHeatLoadEvap.capacity} kW • Fans: {activeHeatLoadEvap.fan_configuration || 'Axial'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          Airflow: {activeHeatLoadEvap.air_flow_m3h} m³/h • Defrost: {activeHeatLoadEvap.defrost_type || 'Electric'}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>No matching ACU found</div>
                    )}
                  </div>
                </div>

                {/* Insertion Items Checkbox & Custom Price Form */}
                <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                    Select Items to Insert into Invoice / Quotation:
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {/* CCU Line */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.cdu}
                          onChange={e => setSelectedLines(p => ({ ...p, cdu: e.target.checked }))}
                        />
                        <span>
                          {heatLoadResult.recommendations.multiUnitCcu
                            ? `${heatLoadResult.recommendations.multiUnitCcu.count} × Emerson ${heatLoadResult.recommendations.multiUnitCcu.unit.model_number} Condensing Unit`
                            : `${activeHeatLoadCcu?.brand_name || "Emerson"} ${activeHeatLoadCcu?.model_number || 'CCU'} Condensing Unit`}
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

                    {/* ACU Line */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.evaporator}
                          onChange={e => setSelectedLines(p => ({ ...p, evaporator: e.target.checked }))}
                        />
                        <span>
                          {heatLoadResult.recommendations.multiUnitAcu
                            ? `${heatLoadResult.recommendations.multiUnitAcu.count} × ${heatLoadResult.recommendations.multiUnitAcu.unit.model_number} Evaporator`
                            : `${activeHeatLoadEvap?.model_number || 'ACU'} Air Cooling Unit`}
                        </span>
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

                    {/* Refrigeration Kit */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.kit}
                          onChange={e => setSelectedLines(p => ({ ...p, kit: e.target.checked }))}
                        />
                        <span>Commercial Refrigeration Kit (TXV + Orifice + Solenoid + Dixell Controller)</span>
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

                    {/* Installation */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedLines.installation}
                          onChange={e => setSelectedLines(p => ({ ...p, installation: e.target.checked }))}
                        />
                        <span>Installation, Piping, Pressure Testing & Commissioning</span>
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
                    <option value="Daikin">Daikin (Authorized Service Dealer)</option>
                    <option value="Emerson">Emerson Climate Technologies</option>
                    <option value="any">Compare All Brands (Daikin &amp; Emerson)</option>
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
                    <option value="R22">R22</option>
                    <option value="R134a">R134a</option>
                    <option value="R410A">R410A</option>
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
                        <span>{recommendation.recommendations?.evaporator?.model_number} Air Cooling Unit</span>
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
