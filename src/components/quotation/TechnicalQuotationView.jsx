import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator, CheckCircle2, AlertTriangle, FileText, ArrowRight,
  Plus, Trash2, Printer, RefreshCw, Eye, X, BookOpen, Layers,
  Cpu, Flame, Wind, User, Settings2, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import {
  calculateColdRoom, calculateHeatLoad, getThermalCommodities,
  getQuotations, getQuotationById, saveQuotation,
  convertQuotationToInvoice, getAllClients, getChargeItems, getProfile
} from '../../store';
import { formatCurrency } from '../../utils';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import TechnoCommercialProposalModal from './TechnoCommercialProposalModal';

export default function TechnicalQuotationView({ onNavigateToInvoice }) {
  const [tab, setTab] = useState('new'); // 'new' | 'list'
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // References
  const [clients, setClients] = useState([]);
  const [chargeRules, setChargeRules] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [profile, setProfile] = useState({});

  // Mode: 'heatload' (ASHRAE / USDA Engine) | 'reckoner' (Standard Volume Sizing)
  const [sizerMode, setSizerMode] = useState('heatload');

  // Advanced Heat Load Form State (ASHRAE / USDA / Daikin)
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
  const [heatLoadResult, setHeatLoadResult] = useState(null);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

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

  // Reckoner Form State
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

  // Sizing Engine Output State
  const [recommendation, setRecommendation] = useState(null);
  const [selectedCduId, setSelectedCduId] = useState(null);
  const [cduBrandFilter, setCduBrandFilter] = useState('all');

  // Quotation Form State
  const [customerId, setCustomerId] = useState('');
  const [siteName, setSiteName] = useState('Main Facility');
  const [items, setItems] = useState([]);
  const [terms, setTerms] = useState(
    '1. 50% advance along with confirmed purchase order.\n2. Balance against delivery and commissioning.\n3. Warranty: 12 months for compressor from date of commissioning.\n4. Delivery within 2-3 weeks from receipt of advance.'
  );

  // Preview Modal
  const [viewQuotation, setViewQuotation] = useState(null);
  const [proposalQuotation, setProposalQuotation] = useState(null);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [cls, chgs, qts, prf, coms] = await Promise.all([
        getAllClients().catch(() => []),
        getChargeItems().catch(() => []),
        getQuotations().catch(() => []),
        getProfile().catch(() => ({})),
        getThermalCommodities().catch(() => []),
      ]);
      setClients(cls);
      setChargeRules(chgs);
      setQuotations(qts);
      setProfile(prf);
      if (Array.isArray(coms) && coms.length > 0) setCommodities(coms);
      if (cls.length > 0 && !customerId) setCustomerId(cls[0].id);
    } catch {
      toast('Failed to load quotation data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // -----------------------------------------------------------
  // RUN CALCULATORS
  // -----------------------------------------------------------
  const handleCalculateHeatLoad = async (e) => {
    if (e) e.preventDefault();
    setCalculating(true);
    try {
      const res = await calculateHeatLoad(heatLoadForm);
      setHeatLoadResult(res);

      const rec = res.recommendations || {};
      const newItems = [];

      // 1. Daikin Condensing Unit (CCU)
      if (rec.multiUnitCcu) {
        const mu = rec.multiUnitCcu;
        const price = Number(mu.unit.selling_price) || 0;
        newItems.push({
          product_id: mu.unit.product_id,
          model_id: mu.unit.id,
          item_type: 'equipment',
          description: `${mu.unit.brand_name || "Emerson"} ${mu.unit.model_number} Outdoor Condensing Unit (${mu.unit.nominal_tr} TR each, ${mu.count} Sets = ${mu.totalCapacityTr} TR)`,
          hsn_sac: '84189900',
          quantity: mu.count,
          unit: 'Set',
          unit_price: price,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: price * mu.count * 0.18,
          total_amount: price * mu.count * 1.18,
        });
      } else if (rec.ccu) {
        const ccu = rec.ccu;
        const price = Number(ccu.selling_price) || 0;
        newItems.push({
          product_id: ccu.product_id,
          model_id: ccu.id,
          item_type: 'equipment',
          description: `${ccu.brand_name || "Emerson"} ${ccu.model_number} Outdoor Condensing Unit (${ccu.nominal_tr} TR / ${ccu.capacity} kW @ ${res.inputs.temperatures.roomTempC}°C)`,
          hsn_sac: '84189900',
          quantity: 1,
          unit: 'Set',
          unit_price: price,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: price * 0.18,
          total_amount: price * 1.18,
        });
      }

      // 2. Daikin Air Cooling Unit (ACU)
      if (rec.multiUnitAcu) {
        const muA = rec.multiUnitAcu;
        const price = Number(muA.unit.selling_price) || 0;
        newItems.push({
          product_id: muA.unit.product_id,
          model_id: muA.unit.id,
          item_type: 'equipment',
          description: `${muA.unit.model_number} DX Air Cooling Unit (${muA.unit.capacity_kw} kW each, ${muA.count} Nos = ${muA.totalCapacityKw} kW)`,
          hsn_sac: '84189900',
          quantity: muA.count,
          unit: 'Nos',
          unit_price: price,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: price * muA.count * 0.18,
          total_amount: price * muA.count * 1.18,
        });
      } else if (rec.evaporator) {
        const evap = rec.evaporator;
        const price = Number(evap.selling_price) || 0;
        newItems.push({
          product_id: evap.product_id,
          model_id: evap.id,
          item_type: 'equipment',
          description: `${evap.model_number} DX Air Cooling Unit Evaporator (${evap.capacity_kw} kW) - ${evap.defrost_type}`,
          hsn_sac: '84189900',
          quantity: 1,
          unit: 'Nos',
          unit_price: price,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: price * 0.18,
          total_amount: price * 1.18,
        });
      }

      // 3. Refrigeration Kit & Controller
      const vr = rec.valveRecommendations || {};
      newItems.push({
        item_type: 'component',
        description: `Commercial Refrigeration Kit: ${vr.expansionValve} Expansion Valve + ${vr.orifice} Orifice + ${vr.solenoidValve} Solenoid + ${vr.controller}`,
        hsn_sac: '84189900',
        quantity: 1,
        unit: 'Set',
        unit_price: 14500,
        discount_percent: 0,
        tax_percent: 18.0,
        tax_amount: 14500 * 0.18,
        total_amount: 14500 * 1.18,
      });

      // 4. Installation & Commissioning
      newItems.push({
        item_type: 'installation',
        description: 'Complete Site Installation, Refrigerant Copper Piping, Pressure Testing & Commissioning',
        hsn_sac: '9987',
        quantity: 1,
        unit: 'Job',
        unit_price: 18000,
        discount_percent: 0,
        tax_percent: 18.0,
        tax_amount: 18000 * 0.18,
        total_amount: 18000 * 1.18,
      });

      setItems(newItems);
      toast('Heat load calculated & Emerson equipment added to quotation!', 'success');
    } catch {
      toast('Failed to calculate refrigeration heat load', 'error');
    } finally {
      setCalculating(false);
    }
  };
  // Switch CDU model from dropdown
  const handleSwitchCdu = (cduId) => {
    setSelectedCduId(cduId);
    const chosen = (recommendation?.availableCompressors || []).find(c => c.id === cduId);
    if (!chosen) return;
    setItems(prev => prev.map(item => {
      if (item.item_type === 'equipment' && item.hsn_sac === '84189900' && !item.description?.includes('Evaporator')) {
        const price = Number(chosen.selling_price) || 0;
        const tax = price * 0.18;
        return {
          ...item,
          product_id: chosen.product_id,
          model_id: chosen.id,
          description: `${chosen.brand_name || 'Emerson'} ${chosen.model_number} Condensing Unit (${chosen.capacity} ${chosen.capacity_unit || 'kW'} @ ${recommendation?.inputs?.targetTemp || 4}°C)`,
          unit_price: price,
          tax_amount: tax,
          total_amount: price + tax,
        };
      }
      return item;
    }));
  };

  const handleCalculate = async (e) => {
    if (e) e.preventDefault();
    setCalculating(true);
    try {
      const res = await calculateColdRoom(calcForm);
      setRecommendation(res);
      setSelectedCduId(res.recommendations?.cdu?.id || res.availableCompressors?.[0]?.id || null);

      // Auto-populate line items from recommendation
      const newItems = [];
      if (res.recommendations?.cdu) {
        const cdu = res.recommendations.cdu;
        newItems.push({
          product_id: cdu.product_id,
          model_id: cdu.id,
          item_type: 'equipment',
          description: `${cdu.brand_name || 'Emerson'} ${cdu.model_number} Condensing Unit (${cdu.capacity} ${cdu.capacity_unit || 'kW'} @ ${res.inputs.targetTemp}°C)`,
          hsn_sac: '84189900',
          quantity: 1,
          unit: 'Set',
          unit_price: cdu.selling_price || 0,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: 0,
          total_amount: cdu.selling_price || 0,
        });
      }

      if (res.recommendations?.evaporator) {
        const evap = res.recommendations.evaporator;
        newItems.push({
          product_id: evap.product_id,
          model_id: evap.id,
          item_type: 'equipment',
          description: `${evap.model_number} Air Cooling Unit Evaporator (${evap.capacity} kW)`,
          hsn_sac: '84189900',
          quantity: 1,
          unit: 'Nos',
          unit_price: evap.selling_price || 0,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: 0,
          total_amount: evap.selling_price || 0,
        });
      }

      if (res.recommendations?.expansionValve) {
        newItems.push({
          item_type: 'component',
          description: `Thermostatic Expansion Valve (${res.recommendations.expansionValve}) with Orifice ${res.recommendations.orifice || ''}`,
          hsn_sac: '84818030',
          quantity: 1,
          unit: 'Nos',
          unit_price: 3500,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: 0,
          total_amount: 3500,
        });
      }

      if (res.recommendations?.solenoidValve) {
        newItems.push({
          item_type: 'component',
          description: `Refrigerant Solenoid Valve (${res.recommendations.solenoidValve}) with Coil (${res.recommendations.solenoidCoil || '208V'})`,
          hsn_sac: '84818030',
          quantity: 1,
          unit: 'Nos',
          unit_price: 2800,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: 0,
          total_amount: 2800,
        });
      }

      if (res.recommendations?.controller) {
        newItems.push({
          item_type: 'component',
          description: `Dixell Digital Microprocessor Controller (${res.recommendations.controller.model})`,
          hsn_sac: '90321090',
          quantity: 1,
          unit: 'Nos',
          unit_price: 4200,
          discount_percent: 0,
          tax_percent: 18.0,
          tax_amount: 0,
          total_amount: 4200,
        });
      }

      setItems(newItems);
      toast('Technical sizing calculated successfully', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCalculating(false);
    }
  };

  // Add extra charge item
  const handleAddCharge = (ruleId) => {
    const rule = chargeRules.find(r => r.id === ruleId);
    if (!rule) return;
    setItems(prev => [
      ...prev,
      {
        item_type: 'charge',
        description: rule.name,
        hsn_sac: rule.hsn_sac || '9987',
        quantity: 1,
        unit: 'Job',
        unit_price: rule.default_rate || 0,
        discount_percent: 0,
        tax_percent: rule.tax_percent || 18.0,
        tax_amount: 0,
        total_amount: rule.default_rate || 0,
      }
    ]);
  };

  // Update item field
  const updateItem = (index, field, val) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      // Recalc total
      const qty = Number(copy[index].quantity) || 1;
      const price = Number(copy[index].unit_price) || 0;
      const disc = Number(copy[index].discount_percent) || 0;
      const base = qty * price * (1 - disc / 100);
      copy[index].total_amount = Math.round(base * 100) / 100;
      return copy;
    });
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Calculation totals
  const subtotal = items.reduce((sum, itm) => sum + (Number(itm.total_amount) || 0), 0);
  const taxAmount = Math.round(subtotal * 0.18 * 100) / 100;
  const grandTotal = subtotal + taxAmount;

  // -----------------------------------------------------------
  // SAVE QUOTATION
  // -----------------------------------------------------------
  const handleSaveQuotation = async (status = 'draft') => {
    if (!customerId) {
      toast('Please select a customer for this quotation', 'warning');
      return;
    }
    if (items.length === 0) {
      toast('Please calculate sizing or add at least one line item', 'warning');
      return;
    }

    const payload = {
      customer_id: customerId,
      quotation_date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status,
      currency: 'INR',
      equipment_subtotal: subtotal,
      charges_subtotal: 0,
      discount_amount: 0,
      tax_amount: taxAmount,
      total_amount: grandTotal,
      terms,
      items,
      technicalInputs: sizerMode === 'heatload' && heatLoadResult ? {
        calculationEngine: 'ASHRAE / USDA Refrigeration Heat Load Engine (Daikin Commercial)',
        application: heatLoadResult.inputs.temperatures.roomTempC < 0 ? 'freezer' : 'chiller',
        length_ft: heatLoadResult.inputs.dimensions.lengthFt,
        width_ft: heatLoadResult.inputs.dimensions.widthFt,
        height_ft: heatLoadResult.inputs.dimensions.heightFt,
        length_m: heatLoadResult.inputs.dimensions.lengthM,
        width_m: heatLoadResult.inputs.dimensions.widthM,
        height_m: heatLoadResult.inputs.dimensions.heightM,
        volume_ft3: heatLoadResult.inputs.dimensions.volumeFt3,
        volume_m3: heatLoadResult.inputs.dimensions.volumeM3,
        targetTemp: heatLoadResult.inputs.temperatures.roomTempC,
        ambientTemp: heatLoadResult.inputs.temperatures.ambientTempC,
        commodity: heatLoadResult.inputs.commodity,
        puf: heatLoadResult.inputs.puf,
        thermalBreakdown: heatLoadResult.thermalBreakdown,
        machineRating: heatLoadResult.machineRating,
        calculated_load_kw: heatLoadResult.machineRating.capacityKw,
        calculated_load_tr: heatLoadResult.machineRating.capacityTr,
        calculated_load_btu: heatLoadResult.machineRating.capacityBtuHr,
      } : (recommendation?.inputs ? {
        application: calcForm.application,
        length_ft: calcForm.length,
        width_ft: calcForm.width,
        height_ft: calcForm.height,
        volume_ft3: recommendation.inputs.volume_ft3,
        volume_m3: recommendation.inputs.volume_m3,
        targetTemp: recommendation.inputs.targetTemp,
        ambientTemp: calcForm.ambientTemp,
        refrigerant: calcForm.refrigerant,
        compressorType: calcForm.compressorType,
        dailyMilkLiters: calcForm.dailyMilkLiters,
        estimatedLoadKw: recommendation.estimatedLoadKw,
        notes: recommendation.reviewReason || '',
      } : null),
      modelRecommendation: sizerMode === 'heatload' && heatLoadResult ? {
        cdu_model_id: heatLoadResult.recommendations?.ccu?.id,
        evap_model_id: heatLoadResult.recommendations?.evaporator?.id,
        expansionValve: heatLoadResult.recommendations?.valveRecommendations?.expansionValve,
        orifice: heatLoadResult.recommendations?.valveRecommendations?.orifice,
        solenoidValve: heatLoadResult.recommendations?.valveRecommendations?.solenoidValve,
        solenoidCoil: heatLoadResult.recommendations?.valveRecommendations?.solenoidCoil,
        controller: heatLoadResult.recommendations?.valveRecommendations?.controller,
        catalogueSource: 'Daikin Commercial Refrigeration Engine',
        cataloguePage: '4 & 5',
        selectionNotes: `ASHRAE Heat Load: ${heatLoadResult.thermalBreakdown.qTotalKj} kJ/day (${heatLoadResult.machineRating.capacityTr} TR)`,
      } : (recommendation?.recommendations ? {
        cdu_model_id: recommendation.recommendations.cdu?.id,
        evap_model_id: recommendation.recommendations.evaporator?.id,
        expansionValve: recommendation.recommendations.expansionValve,
        orifice: recommendation.recommendations.orifice,
        solenoidValve: recommendation.recommendations.solenoidValve,
        solenoidCoil: recommendation.recommendations.solenoidCoil,
        controller: recommendation.recommendations.controller?.model,
        catalogueSource: recommendation.catalogueSource,
        cataloguePage: recommendation.cataloguePage,
        selectionNotes: recommendation.designAssumptions?.join('; '),
      } : null),
    };

    try {
      const res = await saveQuotation(payload);
      toast(`Quotation #${res.quotation_number} saved successfully!`, 'success');
      loadInitialData();
      setTab('list');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // Convert to Invoice
  const handleConvert = async (quotationId) => {
    confirmAction({
      title: 'Convert to Tax Invoice?',
      message: 'This will convert the technical quotation into an active Tax Invoice without having to re-enter line items.',
      confirmLabel: 'Convert to Invoice',
    }, async () => {
      try {
        const res = await convertQuotationToInvoice(quotationId);
        toast(`Quotation converted to Invoice #${res.invoiceNumber}!`, 'success');
        loadInitialData();
        if (onNavigateToInvoice) onNavigateToInvoice(res.saleId);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  };

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Calculator className="text-primary" /> Technical Sizing & Quotation Generator
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Catalogue-backed cold-room calculations (Emerson Ready Reckoner & Daikin 2024), equipment pairing, and customer quotations.
          </p>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('new')}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
              background: tab === 'new' ? 'var(--primary)' : 'transparent', color: tab === 'new' ? '#fff' : 'var(--text)'
            }}
          >
            + New Technical Sizing
          </button>
          <button
            onClick={() => setTab('list')}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
              background: tab === 'list' ? 'var(--primary)' : 'transparent', color: tab === 'list' ? '#fff' : 'var(--text)'
            }}
          >
            Quotation Register ({quotations.length})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: SIZING CALCULATOR & QUOTATION BUILDER */}
      {/* ------------------------------------------------------------- */}
      {tab === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* LEFT: SIZING INPUTS */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} className="text-primary" /> 1. Cold Room Sizing & Equipment Selection
            </h2>

            {/* 2-Way Mode Switcher Banner */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.4rem',
              background: 'var(--bg-secondary)',
              padding: '4px',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <button
                type="button"
                className={`btn ${sizerMode === 'heatload' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                onClick={() => setSizerMode('heatload')}
              >
                <Cpu size={14} /> 🔬 Heat Load (ASHRAE)
              </button>
              <button
                type="button"
                className={`btn ${sizerMode === 'reckoner' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.8rem', padding: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600 }}
                onClick={() => setSizerMode('reckoner')}
              >
                <Layers size={14} /> ⚡ Volume Sizer (Emerson)
              </button>
            </div>

            {/* MODE A: ASHRAE / DAIKIN THERMODYNAMIC ENGINE */}
            {sizerMode === 'heatload' && (
              <form onSubmit={handleCalculateHeatLoad}>
                {/* Dimensions */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>External Dimensions</label>
                    <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', padding: 2, borderRadius: 4 }}>
                      <button
                        type="button"
                        onClick={() => setHeatLoadForm(prev => ({ ...prev, unit: 'm' }))}
                        style={{
                          padding: '1px 6px', border: 'none', borderRadius: 3, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                          background: heatLoadForm.unit === 'm' ? 'var(--primary)' : 'transparent', color: heatLoadForm.unit === 'm' ? '#fff' : 'var(--text)'
                        }}
                      >
                        Meters (m)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeatLoadForm(prev => ({ ...prev, unit: 'ft' }))}
                        style={{
                          padding: '1px 6px', border: 'none', borderRadius: 3, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                          background: heatLoadForm.unit === 'ft' ? 'var(--primary)' : 'transparent', color: heatLoadForm.unit === 'ft' ? '#fff' : 'var(--text)'
                        }}
                      >
                        Feet (ft)
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Length ({heatLoadForm.unit})</span>
                      <input
                        type="number" step="any" className="form-input" value={heatLoadForm.length}
                        onChange={e => setHeatLoadForm(prev => ({ ...prev, length: Number(e.target.value) }))}
                        style={{ width: '100%' }} required
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Width ({heatLoadForm.unit})</span>
                      <input
                        type="number" step="any" className="form-input" value={heatLoadForm.width}
                        onChange={e => setHeatLoadForm(prev => ({ ...prev, width: Number(e.target.value) }))}
                        style={{ width: '100%' }} required
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Height ({heatLoadForm.unit})</span>
                      <input
                        type="number" step="any" className="form-input" value={heatLoadForm.height}
                        onChange={e => setHeatLoadForm(prev => ({ ...prev, height: Number(e.target.value) }))}
                        style={{ width: '100%' }} required
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Volume: <strong>{liveDimensions.volM3} m³</strong> • Surface Area: <strong>{liveDimensions.areaM2} m²</strong>
                  </div>
                </div>

                {/* PUF Panel Thickness */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                    PUF Insulation (k = 0.023 W/m·K)
                  </label>
                  <select
                    className="form-input"
                    value={heatLoadForm.pufThicknessMm}
                    onChange={e => setHeatLoadForm(prev => ({ ...prev, pufThicknessMm: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  >
                    <option value={60}>60 mm (U = 0.383 W/m²·K) — Process Areas (+10°C to +15°C)</option>
                    <option value={100}>100 mm (U = 0.230 W/m²·K) — Standard Chiller (+2°C to +8°C)</option>
                    <option value={120}>120 mm (U = 0.192 W/m²·K) — Low Temp Freezer (-18°C)</option>
                    <option value={150}>150 mm (U = 0.153 W/m²·K) — Deep Freezer (-25°C)</option>
                  </select>
                </div>

                {/* Commodity Selection */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                    Stored Commodity (16 ASHRAE Handbooks)
                  </label>
                  <select
                    className="form-input"
                    value={heatLoadForm.commodityId}
                    onChange={e => handleCommodityChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {commodities.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.category}] {c.name} ({c.storage_temp_min}°C to {c.storage_temp_max}°C)
                      </option>
                    ))}
                  </select>
                  {selectedCommodity && (
                    <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: '2px' }}>
                      Freeze Point: <strong>{selectedCommodity.freezing_point_c}°C</strong> | Cp: <strong>{selectedCommodity.cp_above}</strong> kJ/kg·K | Resp: <strong>{selectedCommodity.respiration_rate_mw_kg || 0}</strong> mW/kg
                    </div>
                  )}
                </div>

                {/* Daily Inflow & Temperatures */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Daily Inflow (kg/day)</label>
                    <input
                      type="number" className="form-input" value={heatLoadForm.dailyMassKg}
                      onChange={e => setHeatLoadForm(prev => ({ ...prev, dailyMassKg: Number(e.target.value) }))}
                      style={{ width: '100%' }} required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Inflow Temp (°C)</label>
                    <input
                      type="number" className="form-input" value={heatLoadForm.entryTemp}
                      onChange={e => setHeatLoadForm(prev => ({ ...prev, entryTemp: Number(e.target.value) }))}
                      style={{ width: '100%' }} required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Design Ambient (°C)</label>
                    <input
                      type="number" className="form-input" value={heatLoadForm.ambientTemp}
                      onChange={e => setHeatLoadForm(prev => ({ ...prev, ambientTemp: Number(e.target.value) }))}
                      style={{ width: '100%' }} required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Room Design Temp (°C)</label>
                    <input
                      type="number" className="form-input" value={heatLoadForm.roomTemp}
                      onChange={e => setHeatLoadForm(prev => ({ ...prev, roomTemp: Number(e.target.value) }))}
                      style={{ width: '100%' }} required
                    />
                  </div>
                </div>

                {/* Compressor Run Hours & Preferences */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Compressor Run Target</label>
                    <select
                      className="form-input"
                      value={heatLoadForm.compressorRunHours}
                      onChange={e => setHeatLoadForm(prev => ({ ...prev, compressorRunHours: Number(e.target.value) }))}
                      style={{ width: '100%' }}
                    >
                      <option value={16.0}>16.0 Hours / Day</option>
                      <option value={18.0}>18.0 Hours / Day</option>
                      <option value={20.0}>20.0 Hours / Day</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Safety Factor</label>
                    <select
                      className="form-input"
                      value={heatLoadForm.safetyFactor}
                      onChange={e => setHeatLoadForm(prev => ({ ...prev, safetyFactor: Number(e.target.value) }))}
                      style={{ width: '100%' }}
                    >
                      <option value={0.10}>10% Allowance</option>
                      <option value={0.15}>15% Heavy Duty</option>
                    </select>
                  </div>
                </div>

                {/* Collapsible Advanced Loads */}
                <div style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', padding: '0.15rem 0' }}
                    onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                  >
                    <Settings2 size={12} />
                    {showAdvancedParams ? 'Hide Internal/Defrost Loads' : 'Adjust Internal Lighting, People & Defrost...'}
                    {showAdvancedParams ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {showAdvancedParams && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.6rem', borderRadius: 6, marginTop: '0.3rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.72rem' }}>
                      <div>
                        <span>Lighting (kW):</span>
                        <input
                          type="number" step="0.1" placeholder="Auto" className="form-input"
                          value={heatLoadForm.lightsKw} onChange={e => setHeatLoadForm(p => ({ ...p, lightsKw: e.target.value }))}
                        />
                      </div>
                      <div>
                        <span>People Count:</span>
                        <input
                          type="number" className="form-input"
                          value={heatLoadForm.peopleCount} onChange={e => setHeatLoadForm(p => ({ ...p, peopleCount: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Equipment Brand, Technology & Refrigerant Preference */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Brand Preference</label>
                    <select
                      className="form-input"
                      value={heatLoadForm.brand}
                      onChange={e => setHeatLoadForm(p => ({ ...p, brand: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="Daikin">Daikin (Authorized Service Dealer)</option>
                      <option value="Emerson">Emerson Climate Technologies</option>
                      <option value="any">Compare All Brands (Daikin &amp; Emerson)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Compressor Technology</label>
                    <select
                      className="form-input"
                      value={heatLoadForm.compressorPreference}
                      onChange={e => setHeatLoadForm(p => ({ ...p, compressorPreference: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="any">Compare Scroll &amp; Reciprocating</option>
                      <option value="scroll">Scroll (High Efficiency)</option>
                      <option value="reciprocating">Reciprocating</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Refrigerant</label>
                    <select
                      className="form-input"
                      value={heatLoadForm.refrigerant}
                      onChange={e => setHeatLoadForm(p => ({ ...p, refrigerant: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="R404A">R404A (Eco-blend)</option>
                      <option value="R22">R22</option>
                      <option value="R134a">R134a</option>
                      <option value="R410A">R410A</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={calculating} style={{ width: '100%', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}>
                  {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                  {calculating ? 'Calculating Thermodynamic Loads...' : (heatLoadForm.brand === 'Daikin' ? 'Calculate Heat Load & Match Daikin Units' : `Calculate Heat Load & Match ${heatLoadForm.brand === 'any' ? 'Equipment' : heatLoadForm.brand} Units`)}
                </button>
              </form>
            )}

            {/* HEAT LOAD ENGINE RESULTS VIEW */}
            {sizerMode === 'heatload' && heatLoadResult && (
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: 10, border: '1.5px solid #0284c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Required Machine Capacity</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0369a1' }}>
                        {heatLoadResult.machineRating.capacityTr} TR
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                        ({heatLoadResult.machineRating.capacityKw} kW)
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Total Daily Heat Load</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#b45309' }}>
                      {formatCurrency(heatLoadResult.thermalBreakdown.qTotalKj).replace('₹', '')} kJ/day
                    </div>
                  </div>
                </div>

                {/* Thermal breakdown pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.3rem', marginBottom: '0.8rem', textAlign: 'center', fontSize: '0.7rem' }}>
                  <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Trans</div>
                    <div style={{ fontWeight: 700 }}>{heatLoadResult.thermalBreakdown.breakdownPercentages.transmission}%</div>
                  </div>
                  <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Product</div>
                    <div style={{ fontWeight: 700 }}>{heatLoadResult.thermalBreakdown.breakdownPercentages.product}%</div>
                  </div>
                  <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Infil</div>
                    <div style={{ fontWeight: 700 }}>{heatLoadResult.thermalBreakdown.breakdownPercentages.airInfiltration}%</div>
                  </div>
                  <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Internal</div>
                    <div style={{ fontWeight: 700 }}>{heatLoadResult.thermalBreakdown.breakdownPercentages.internal}%</div>
                  </div>
                  <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Equip</div>
                    <div style={{ fontWeight: 700 }}>{heatLoadResult.thermalBreakdown.breakdownPercentages.equipment}%</div>
                  </div>
                </div>

                {/* Daikin Matched Models */}
                <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 6, border: '1px solid #93c5fd', fontSize: '0.82rem', lineHeight: 1.6 }}>
                  <div>
                    <strong>Outdoor CCU: </strong>
                    {heatLoadResult.recommendations.multiUnitCcu ? (
                      <span style={{ color: '#b45309', fontWeight: 700 }}>
                        {heatLoadResult.recommendations.multiUnitCcu.count} × Emerson {heatLoadResult.recommendations.multiUnitCcu.unit.model_number} ({heatLoadResult.recommendations.multiUnitCcu.totalCapacityTr} TR)
                      </span>
                    ) : (
                      <span style={{ color: '#0369a1', fontWeight: 700 }}>
                        Emerson {heatLoadResult.recommendations.ccu?.model_number} ({heatLoadResult.recommendations.ccu?.nominal_tr} TR)
                      </span>
                    )}
                  </div>
                  <div>
                    <strong>Indoor ACU: </strong>
                    {heatLoadResult.recommendations.multiUnitAcu ? (
                      <span style={{ color: '#b45309', fontWeight: 700 }}>
                        {heatLoadResult.recommendations.multiUnitAcu.count} × {heatLoadResult.recommendations.multiUnitAcu.unit.model_number} ({heatLoadResult.recommendations.multiUnitAcu.totalCapacityKw} kW)
                      </span>
                    ) : (
                      <span style={{ color: '#0369a1', fontWeight: 700 }}>
                        {heatLoadResult.recommendations.evaporator?.model_number} ({heatLoadResult.recommendations.evaporator?.capacity_kw} kW)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                    * Kit: {heatLoadResult.recommendations.valveRecommendations?.expansionValve} TXV + {heatLoadResult.recommendations.valveRecommendations?.orifice} + {heatLoadResult.recommendations.valveRecommendations?.solenoidValve} + {heatLoadResult.recommendations.valveRecommendations?.controller}
                  </div>
                </div>
              </div>
            )}

            {/* MODE B: STANDARD READY RECKONER */}
            {sizerMode === 'reckoner' && (
              <form onSubmit={handleCalculate}>
                {/* Application type */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Application / Room Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    {[
                      { id: 'chiller', label: 'Chiller (+4°C)', desc: 'Fruits, Veg, Dairy' },
                      { id: 'freezer', label: 'Freezer (-20°C)', desc: 'Meat, Ice Cream' },
                      { id: 'bmc', label: 'Milk Chiller (BMC)', desc: 'Dairy Bulk Tank' },
                    ].map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setCalcForm(prev => ({ ...prev, application: a.id }))}
                        style={{
                          padding: '8px 10px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
                          border: calcForm.application === a.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: calcForm.application === a.id ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* BMC Milk Volume or Room Dimensions */}
                {calcForm.application === 'bmc' ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Daily Milk Capacity (Liters)</label>
                    <select
                      className="form-input"
                      value={calcForm.dailyMilkLiters}
                      onChange={e => setCalcForm(prev => ({ ...prev, dailyMilkLiters: Number(e.target.value) }))}
                      style={{ width: '100%' }}
                    >
                      <option value={500}>500 Liters (2 Batches x 250 L)</option>
                      <option value={1000}>1000 Liters (2 Batches x 500 L)</option>
                      <option value={2000}>2000 Liters (2 Batches x 1000 L)</option>
                      <option value={3000}>3000 Liters (2 Batches x 1500 L)</option>
                      <option value={4000}>4000 Liters (2 Batches x 2000 L)</option>
                      <option value={5000}>5000 Liters (2 Batches x 2500 L)</option>
                    </select>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>External Room Dimensions</label>
                      <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-secondary)', padding: 2, borderRadius: 6 }}>
                        <button
                          type="button"
                          onClick={() => setCalcForm(prev => ({ ...prev, unit: 'ft' }))}
                          style={{
                            padding: '2px 8px', border: 'none', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                            background: calcForm.unit === 'ft' ? 'var(--primary)' : 'transparent', color: calcForm.unit === 'ft' ? '#fff' : 'var(--text)'
                          }}
                        >
                          Feet (ft)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalcForm(prev => ({ ...prev, unit: 'm' }))}
                          style={{
                            padding: '2px 8px', border: 'none', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                            background: calcForm.unit === 'm' ? 'var(--primary)' : 'transparent', color: calcForm.unit === 'm' ? '#fff' : 'var(--text)'
                          }}
                        >
                          Meters (m)
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Length ({calcForm.unit})</span>
                        <input
                          type="number" step="any" className="form-input" value={calcForm.length}
                          onChange={e => setCalcForm(prev => ({ ...prev, length: e.target.value }))}
                          style={{ width: '100%' }} required
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Width ({calcForm.unit})</span>
                        <input
                          type="number" step="any" className="form-input" value={calcForm.width}
                          onChange={e => setCalcForm(prev => ({ ...prev, width: e.target.value }))}
                          style={{ width: '100%' }} required
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Height ({calcForm.unit})</span>
                        <input
                          type="number" step="any" className="form-input" value={calcForm.height}
                          onChange={e => setCalcForm(prev => ({ ...prev, height: e.target.value }))}
                          style={{ width: '100%' }} required
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Technical Constraints */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Refrigerant</label>
                    <select
                      className="form-input"
                      value={calcForm.refrigerant}
                      onChange={e => setCalcForm(prev => ({ ...prev, refrigerant: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="R404A">R404A (Standard Eco-blend)</option>
                      <option value="R22">R22 (Legacy / HCFC)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Compressor Technology</label>
                    <select
                      className="form-input"
                      value={calcForm.compressorType}
                      onChange={e => setCalcForm(prev => ({ ...prev, compressorType: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="scroll">Scroll (High Efficiency)</option>
                      <option value="reciprocating">Reciprocating (Standard)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Brand Preference</label>
                    <select
                      className="form-input"
                      value={calcForm.brand}
                      onChange={e => setCalcForm(prev => ({ ...prev, brand: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="Daikin">Daikin (Authorized Service Dealer)</option>
                      <option value="Emerson">Emerson Climate Technologies</option>
                      <option value="any">Compare All (Daikin &amp; Emerson)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Design Ambient (°C)</label>
                    <input
                      type="number" className="form-input" value={calcForm.ambientTemp}
                      onChange={e => setCalcForm(prev => ({ ...prev, ambientTemp: e.target.value }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={calculating} style={{ width: '100%', padding: '10px' }}>
                  {calculating ? 'Calculating Catalogue Tables...' : 'Calculate & Match Equipment'}
                </button>
              </form>
            )}

            {/* SIZING DECISION OUTPUT CARD FOR RECKONER */}
            {sizerMode === 'reckoner' && recommendation && (
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 size={16} /> Verified Catalogue Recommendation
                  </h3>
                  <span style={{ fontSize: '0.75rem', background: 'var(--primary)', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                    {recommendation.catalogueSource}
                  </span>
                </div>

                {recommendation.requiresTechnicalReview && (
                  <div style={{ padding: '0.6rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, marginBottom: '0.75rem', fontSize: '0.8rem', color: '#dc2626', display: 'flex', gap: '0.4rem' }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <div>{recommendation.reviewReason}</div>
                  </div>
                )}

                <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Room Volume: </span>
                    <strong>{recommendation.inputs.volume_ft3} cu.ft ({recommendation.inputs.volume_m3} m³)</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Cooling Duty: </span>
                    <strong>{recommendation.estimatedLoadKw} kW</strong>
                  </div>
                </div>

                {/* MULTIPLE COMPRESSOR SELECTOR */}
                {recommendation.availableCompressors && recommendation.availableCompressors.length > 0 && (() => {
                  const allComps = recommendation.availableCompressors || [];
                  const brandsList = ['all', ...new Set(allComps.map(c => c.brand_name).filter(Boolean))];
                  const filtered = cduBrandFilter === 'all' ? allComps : allComps.filter(c => c.brand_name === cduBrandFilter);
                  return (
                    <div style={{
                      background: 'var(--bg-primary)',
                      border: '1.5px solid #93c5fd',
                      borderRadius: '6px',
                      padding: '0.65rem 0.8rem',
                      marginBottom: '0.8rem'
                    }}>
                      <div className="flex justify-between items-center mb-1">
                        <label style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#1d4ed8' }}>
                          ⚙️ Choose Compressor / CDU Model ({filtered.length} options):
                        </label>
                        {brandsList.length > 2 && (
                          <select
                            className="form-input"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.72rem', height: 'auto', width: 'auto' }}
                            value={cduBrandFilter}
                            onChange={e => setCduBrandFilter(e.target.value)}
                          >
                            {brandsList.map(b => (
                              <option key={b} value={b}>{b === 'all' ? 'All Brands' : b}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <select
                        className="form-input"
                        style={{ width: '100%', fontSize: '0.82rem', fontWeight: 600, border: '1px solid #3b82f6' }}
                        value={selectedCduId || recommendation.recommendations?.cdu?.id || ''}
                        onChange={e => handleSwitchCdu(e.target.value)}
                      >
                        {filtered.map(c => (
                          <option key={c.id} value={c.id}>
                            [{c.brand_name || 'CDU'}] {c.model_number} ({c.capacity} kW) — ₹{c.selling_price || 0} {c.catalogue_ref ? `(${c.catalogue_ref})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
                  <div><strong>Outdoor CDU:</strong> {recommendation.recommendations.cdu ? `${recommendation.recommendations.cdu.brand_name} ${recommendation.recommendations.cdu.model_number}` : 'Custom sizing required'}</div>
                  {recommendation.recommendations.evaporator && (
                    <div><strong>Indoor Unit:</strong> {recommendation.recommendations.evaporator.brand_name} {recommendation.recommendations.evaporator.model_number}</div>
                  )}
                  {recommendation.recommendations.expansionValve && (
                    <div><strong>Expansion Valve:</strong> {recommendation.recommendations.expansionValve} (Orifice {recommendation.recommendations.orifice})</div>
                  )}
                  {recommendation.recommendations.solenoidValve && (
                    <div><strong>Solenoid Valve:</strong> {recommendation.recommendations.solenoidValve} ({recommendation.recommendations.solenoidCoil})</div>
                  )}
                  {recommendation.recommendations.controller && (
                    <div><strong>Controller:</strong> {recommendation.recommendations.controller.model}</div>
                  )}
                </div>

                <div style={{ marginTop: '0.8rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  * Assumptions: 43°C ambient, 80/100mm PUF, 5K evaporator TD (Emerson / Daikin verified data).
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: QUOTATION LINE ITEMS & PRICING */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} className="text-primary" /> 2. Quotation Line Items & Commercials
            </h2>

            {/* Customer selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Customer / Client *</label>
                <select
                  className="form-input"
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- Select Customer --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.companyName ? `(${c.companyName})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Site / Location</label>
                <input
                  type="text" className="form-input" value={siteName}
                  onChange={e => setSiteName(e.target.value)} placeholder="e.g. Pune Cold Storage"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Items Table */}
            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.5rem' }}>Description</th>
                    <th style={{ padding: '0.5rem', width: 60 }}>Qty</th>
                    <th style={{ padding: '0.5rem', width: 95 }}>Rate (₹)</th>
                    <th style={{ padding: '0.5rem', width: 95, textAlign: 'right' }}>Total (₹)</th>
                    <th style={{ padding: '0.5rem', width: 35 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No items added yet. Click "Calculate & Match Equipment" on the left or add service charges below.
                      </td>
                    </tr>
                  ) : (
                    items.map((itm, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="text" className="form-input" value={itm.description}
                            onChange={e => updateItem(idx, 'description', e.target.value)}
                            style={{ width: '100%', fontSize: '0.82rem' }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="number" step="any" className="form-input" value={itm.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            style={{ width: '100%', fontSize: '0.82rem' }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input
                            type="number" step="any" className="form-input" value={itm.unit_price}
                            onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                            style={{ width: '100%', fontSize: '0.82rem' }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                          ₹{itm.total_amount}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <button className="icon-btn text-danger" onClick={() => removeItem(idx)}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick Add Charge Buttons */}
            {chargeRules.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  + Quick Add Service / Installation Charge:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {chargeRules.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleAddCharge(c.id)}
                      style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                    >
                      + {c.name} (₹{c.default_rate})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Summary */}
            <div style={{ background: 'var(--bg-secondary)', padding: '0.9rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Taxable Subtotal:</span>
                <strong>₹{subtotal.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Estimated GST (18%):</span>
                <span>₹{taxAmount.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: '0.5rem', color: '#16a34a' }}>
                <span>Grand Total:</span>
                <span>₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Terms */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Terms & Conditions</label>
              <textarea
                className="form-input"
                value={terms}
                onChange={e => setTerms(e.target.value)}
                style={{ width: '100%', height: 75, fontSize: '0.8rem' }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const selectedCust = clients.find(c => c.id === customerId);
                    const mockQuotation = {
                      id: 'draft_preview',
                      quotation_number: 'CER/CR-DRAFT',
                      quotation_date: new Date().toISOString().split('T')[0],
                      customer_name: selectedCust?.name || 'Valued Customer',
                      company_name: selectedCust?.company_name || '',
                      customer_phone: selectedCust?.phone || '',
                      customer_gstin: selectedCust?.gstin || '',
                      site_name: siteName || 'Main Facility',
                      site_address: selectedCust?.address || siteName || '',
                      site_contact: selectedCust?.name || '',
                      equipment_subtotal: subtotal,
                      charges_subtotal: 0,
                      tax_amount: taxAmount,
                      total_amount: grandTotal,
                      items,
                      technicalInputs: sizerMode === 'heatload' && heatLoadResult ? {
                        calculationEngine: 'ASHRAE / USDA Refrigeration Heat Load Engine (Daikin Commercial)',
                        application: heatLoadResult.inputs.temperatures.roomTempC < 0 ? 'freezer' : 'chiller',
                        length_ft: heatLoadResult.inputs.dimensions.lengthFt,
                        width_ft: heatLoadResult.inputs.dimensions.widthFt,
                        height_ft: heatLoadResult.inputs.dimensions.heightFt,
                        length_m: heatLoadResult.inputs.dimensions.lengthM,
                        width_m: heatLoadResult.inputs.dimensions.widthM,
                        height_m: heatLoadResult.inputs.dimensions.heightM,
                        volume_ft3: heatLoadResult.inputs.dimensions.volumeFt3,
                        volume_m3: heatLoadResult.inputs.dimensions.volumeM3,
                        targetTemp: heatLoadResult.inputs.temperatures.roomTempC,
                        ambientTemp: heatLoadResult.inputs.temperatures.ambientTempC,
                        commodity: heatLoadResult.inputs.commodity,
                        puf: heatLoadResult.inputs.puf,
                        thermalBreakdown: heatLoadResult.thermalBreakdown,
                        machineRating: heatLoadResult.machineRating,
                        calculated_load_kw: heatLoadResult.machineRating.capacityKw,
                        calculated_load_tr: heatLoadResult.machineRating.capacityTr,
                        calculated_load_btu: heatLoadResult.machineRating.capacityBtuHr,
                      } : (recommendation?.inputs ? {
                        application: calcForm.application,
                        length_ft: calcForm.length,
                        width_ft: calcForm.width,
                        height_ft: calcForm.height,
                        volume_ft3: recommendation.inputs.volume_ft3,
                        volume_m3: recommendation.inputs.volume_m3,
                        targetTemp: recommendation.inputs.targetTemp,
                        ambientTemp: calcForm.ambientTemp,
                        refrigerant_preference: calcForm.refrigerant,
                        compressor_type: calcForm.compressorType,
                        calculated_load_kw: recommendation.estimatedLoadKw,
                      } : {
                        application: calcForm.application,
                        length_ft: calcForm.length,
                        width_ft: calcForm.width,
                        height_ft: calcForm.height,
                        ambient_temp_c: calcForm.ambientTemp,
                        refrigerant_preference: calcForm.refrigerant,
                      }),
                      modelRecommendation: sizerMode === 'heatload' && heatLoadResult ? {
                        catalogue_ref: heatLoadResult.equipmentRecommendation?.ccu?.modelNumber
                          ? `${heatLoadResult.equipmentRecommendation.ccu.modelNumber} (${heatLoadResult.equipmentRecommendation.ccu.nominal_tr} TR)`
                          : 'Emerson CCU',
                        evaporator_model: heatLoadResult.equipmentRecommendation?.acu?.modelNumber
                          ? `${heatLoadResult.equipmentRecommendation.acu.modelNumber} (${heatLoadResult.equipmentRecommendation.acu.capacity_kw} kW)`
                          : 'Commercial ACU',
                      } : (recommendation?.recommendations ? {
                        catalogue_ref: recommendation.recommendations.cdu ? `${recommendation.recommendations.cdu.brand_name || 'Daikin'} ${recommendation.recommendations.cdu.model_number}` : '',
                      } : null)
                    };
                    setProposalQuotation(mockQuotation);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 600 }}
                  title="Preview 5-Page Techno-Commercial Project Proposal (Cool Era Style)"
                >
                  <FileText size={15} /> Preview 5-Page Proposal
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleSaveQuotation('draft')}
              >
                Save as Draft
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSaveQuotation('approved')}
              >
                Save & Approve Quotation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: QUOTATION REGISTER / LIST */}
      {/* ------------------------------------------------------------- */}
      {tab === 'list' && (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Quotation #</th>
                <th style={{ padding: '0.75rem' }}>Customer / Company</th>
                <th style={{ padding: '0.75rem' }}>Date</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Amount</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No technical quotations created yet. Click "+ New Technical Sizing" to generate your first quotation.
                  </td>
                </tr>
              ) : (
                quotations.map(q => (
                  <tr key={q.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{q.quotation_number}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 600 }}>{q.customer_name || 'Generic Customer'}</div>
                      {q.company_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.company_name}</div>}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{q.quotation_date}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                        background: q.status === 'converted' ? 'rgba(34, 197, 94, 0.15)' : q.status === 'approved' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                        color: q.status === 'converted' ? '#16a34a' : q.status === 'approved' ? '#2563eb' : '#ca8a04'
                      }}>
                        {q.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                      ₹{q.total_amount?.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          const full = await getQuotationById(q.id);
                          setViewQuotation(full);
                        }}
                        style={{ padding: '4px 8px', fontSize: '0.8rem', marginRight: '0.4rem' }}
                        title="Quick 1-Page Quotation"
                      >
                        <Eye size={13} /> View
                      </button>

                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          const full = await getQuotationById(q.id);
                          setProposalQuotation(full);
                        }}
                        style={{
                          padding: '4px 8px', fontSize: '0.8rem', marginRight: '0.4rem',
                          color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 600
                        }}
                        title="Detailed 5-Page Techno-Commercial Project Proposal (Cool Era Style)"
                      >
                        <FileText size={13} /> 5-Page Proposal
                      </button>

                      {q.status !== 'converted' && (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleConvert(q.id)}
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        >
                          Convert to Invoice <ArrowRight size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: PRINT PREVIEW / TECHNICAL QUOTATION DOCUMENT */}
      {/* ------------------------------------------------------------- */}
      {viewQuotation && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
          <div style={{
            background: '#fff', color: '#1e293b', borderRadius: 12, width: '100%', maxWidth: 850, maxHeight: '90vh',
            overflowY: 'auto', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            {/* Modal Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                Quotation Preview — #{viewQuotation.quotation_number}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const q = viewQuotation;
                    setViewQuotation(null);
                    setProposalQuotation(q);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: '#0284c7', borderColor: '#0284c7', fontSize: '0.82rem', padding: '6px 12px'
                  }}
                  title="Switch to Full 5-Page Proposal with all 4 Annexures"
                >
                  <FileText size={14} /> 5-Page Proposal (Cool Era Style)
                </button>
                <button className="btn btn-secondary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Printer size={15} /> Print
                </button>
                <button className="icon-btn" onClick={() => setViewQuotation(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* DOCUMENT BODY */}
            <div id="printable-quotation" style={{ fontFamily: 'Segoe UI, sans-serif' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0284c7', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#0369a1', fontWeight: 800 }}>
                    {profile.businessName || 'REFRIGERATION SOLUTIONS & SERVICES'}
                  </h1>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Authorized Dealer: Daikin Air-Conditioning & Emerson Climate Technologies
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    {profile.address} {profile.city} {profile.state} | GSTIN: {profile.gstin || 'Unregistered'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>TECHNICAL QUOTATION</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>#{viewQuotation.quotation_number}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Date: {viewQuotation.quotation_date}</div>
                </div>
              </div>

              {/* To Customer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem', fontSize: '0.88rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '0.2rem' }}>QUOTATION FOR:</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{viewQuotation.customer_name}</div>
                  {viewQuotation.company_name && <div>{viewQuotation.company_name}</div>}
                  <div>Phone: {viewQuotation.customer_phone || '-'}</div>
                  <div>GSTIN: {viewQuotation.customer_gstin || 'N/A'}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '0.2rem' }}>SITE / FACILITY LOCATION:</div>
                  <div style={{ fontWeight: 600 }}>{viewQuotation.site_name || 'Primary Site'}</div>
                  <div>{viewQuotation.site_address || 'Facility Address on File'}</div>
                  <div>Contact Person: {viewQuotation.site_contact || '-'}</div>
                </div>
              </div>

              {/* Technical Specifications Summary Box */}
              {viewQuotation.technicalInputs && (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '0.8rem', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
                  <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Engineered Design Basis ({viewQuotation.modelRecommendation?.catalogue_ref || 'Catalogue Standards'})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    <div>Room Dimensions: <strong>{viewQuotation.technicalInputs.length_ft} x {viewQuotation.technicalInputs.width_ft} x {viewQuotation.technicalInputs.height_ft} ft</strong></div>
                    <div>Total Volume: <strong>{viewQuotation.technicalInputs.volume_ft3} cu.ft ({viewQuotation.technicalInputs.volume_m3} m³)</strong></div>
                    <div>Target Temp: <strong>{viewQuotation.technicalInputs.target_temp_c}°C</strong></div>
                    <div>Design Ambient: <strong>{viewQuotation.technicalInputs.ambient_temp_c}°C</strong></div>
                    <div>Refrigerant: <strong>{viewQuotation.technicalInputs.refrigerant_preference}</strong></div>
                    <div>Estimated Duty: <strong>{viewQuotation.technicalInputs.calculated_load_kw} kW</strong></div>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#0284c7', color: '#fff', textAlign: 'left' }}>
                    <th style={{ padding: '0.6rem' }}>#</th>
                    <th style={{ padding: '0.6rem' }}>Item Description</th>
                    <th style={{ padding: '0.6rem', width: 60 }}>Qty</th>
                    <th style={{ padding: '0.6rem', width: 100, textAlign: 'right' }}>Unit Rate (₹)</th>
                    <th style={{ padding: '0.6rem', width: 100, textAlign: 'right' }}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {viewQuotation.items?.map((itm, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.6rem', color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '0.6rem', fontWeight: 500 }}>{itm.description}</td>
                      <td style={{ padding: '0.6rem' }}>{itm.quantity} {itm.unit}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>₹{Number(itm.unit_price).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 600 }}>₹{Number(itm.total_amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                <div style={{ width: 280, fontSize: '0.9rem', lineHeight: 1.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal:</span>
                    <strong>₹{(viewQuotation.equipment_subtotal + viewQuotation.charges_subtotal).toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>GST (18%):</span>
                    <span>₹{viewQuotation.tax_amount?.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, borderTop: '2px solid #0f172a', paddingTop: '0.3rem', color: '#0369a1' }}>
                    <span>Total (INR):</span>
                    <span>₹{viewQuotation.total_amount?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Terms & Signatures */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', fontSize: '0.8rem' }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Terms & Conditions:</div>
                  <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', color: '#475569' }}>
                    {viewQuotation.terms}
                  </pre>
                </div>
                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                  <div style={{ borderBottom: '1px solid #94a3b8', height: 40 }}></div>
                  <div style={{ fontWeight: 600, marginTop: '0.4rem' }}>Authorized Signatory</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>For {profile.businessName || 'Refrigeration Dealer'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: 5-PAGE TECHNO-COMMERCIAL PROPOSAL (COOL ERA STYLE) */}
      {/* ------------------------------------------------------------- */}
      {proposalQuotation && (
        <TechnoCommercialProposalModal
          isOpen={!!proposalQuotation}
          onClose={() => setProposalQuotation(null)}
          quotation={proposalQuotation}
          profile={profile}
          onProposalSaved={(updatedProposalData) => {
            setProposalQuotation(prev => ({
              ...prev,
              proposal_data: updatedProposalData
            }));
            loadInitialData();
          }}
        />
      )}
    </div>
  );
}
