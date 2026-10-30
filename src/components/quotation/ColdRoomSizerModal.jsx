import React, { useState, useEffect, useMemo } from 'react';
import { X, Calculator, CheckCircle2, AlertTriangle, Layers, Plus, Loader2, Filter } from 'lucide-react';
import { calculateColdRoom } from '../../store';
import { formatCurrency } from '../../utils';
import { toast } from '../Toast';

export default function ColdRoomSizerModal({ isOpen, onClose, onInsert, initialSpecs = null }) {
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

  const [calculating, setCalculating] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
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

  useEffect(() => {
    if (isOpen) {
      if (initialSpecs) {
        setCalcForm(prev => ({
          ...prev,
          application: initialSpecs.application || 'chiller',
          length: initialSpecs.length || 10,
          width: initialSpecs.width || 12,
          height: initialSpecs.height || 8,
          unit: initialSpecs.unit || 'ft',
          ambientTemp: initialSpecs.ambientTemp || 43,
          refrigerant: initialSpecs.refrigerant || 'R404A',
          compressorType: initialSpecs.compressorType || 'scroll',
          brand: initialSpecs.brand || 'any',
          dailyMilkLiters: initialSpecs.dailyMilkLiters || 1000,
        }));
      }
    }
  }, [isOpen, initialSpecs]);

  if (!isOpen) return null;

  const handleCalculate = async (e) => {
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
    } catch {
      toast('Failed to calculate cold-room equipment match', 'error');
    } finally {
      setCalculating(false);
    }
  };

  // Available compressors filtered by brand if user chooses
  const allAvailableCompressors = recommendation?.availableCompressors || [];
  const uniqueBrands = ['all', ...new Set(allAvailableCompressors.map(c => c.brand_name).filter(Boolean))];

  const filteredCompressors = cduBrandFilter === 'all'
    ? allAvailableCompressors
    : allAvailableCompressors.filter(c => c.brand_name === cduBrandFilter);

  const activeCdu = allAvailableCompressors.find(c => c.id === selectedCduId)
    || recommendation?.recommendations?.cdu
    || filteredCompressors[0]
    || null;

  const handleSelectCdu = (cduId) => {
    setSelectedCduId(cduId);
    const chosen = allAvailableCompressors.find(c => c.id === cduId);
    if (chosen) {
      setCustomRates(prev => ({
        ...prev,
        cdu: chosen.selling_price || 0,
      }));
    }
  };

  const handleApplyToInvoice = () => {
    if (!recommendation) {
      toast('Please run "Calculate & Match Equipment" first.', 'error');
      return;
    }

    const itemsToInsert = [];
    const rec = recommendation.recommendations || {};

    // 1. Condensing Unit (uses selected compressor)
    if (selectedLines.cdu && activeCdu) {
      itemsToInsert.push({
        name: `${activeCdu.brand_name || 'Emerson'} ${activeCdu.model_number} Condensing Unit (${activeCdu.capacity} kW @ ${recommendation.inputs?.targetTemp || 4}°C)`,
        hsn: '84189900',
        quantity: 1,
        unit: 'Set',
        rate: Number(customRates.cdu) || Number(activeCdu.selling_price) || 0,
        taxPercent: 18,
        discount: 0,
        product_id: activeCdu.product_id,
        model_id: activeCdu.id,
      });
    }

    // 2. Evaporator
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

    // 3. Refrigeration Kit & Controller
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

    if (itemsToInsert.length === 0) {
      toast('Please select at least one item line to insert.', 'error');
      return;
    }

    // Technical specifications snapshot
    const technicalSpecs = {
      application: calcForm.application,
      length: calcForm.length,
      width: calcForm.width,
      height: calcForm.height,
      unit: calcForm.unit,
      volume: recommendation.inputs?.volume_ft3 || recommendation.inputs?.volume_m3 || (calcForm.length * calcForm.width * calcForm.height),
      ambientTemp: calcForm.ambientTemp,
      targetTemp: recommendation.inputs?.targetTemp || (calcForm.application === 'freezer' ? -20 : calcForm.application === 'bmc' ? 4 : 4),
      estimatedLoadKw: recommendation.estimatedLoadKw,
      cdu: activeCdu,
      evaporator: rec.evaporator,
      expansionValve: rec.expansionValve,
      orifice: rec.orifice,
      solenoidValve: rec.solenoidValve,
      controller: rec.controller,
      catalogueSource: activeCdu?.catalogue_ref || recommendation.catalogueSource,
      cataloguePage: activeCdu?.catalogue_page || recommendation.cataloguePage,
      calculatedAt: new Date().toISOString(),
    };

    onInsert(itemsToInsert, technicalSpecs);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '840px', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex justify-between items-center mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.4rem' }}>❄️</span>
            <div>
              <h3 className="section-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                Cold-Room Sizing & Equipment Selection
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Catalogue-backed engineering matcher with multiple compressor brand options
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
        </div>

        {/* Form Inputs */}
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
            onClick={handleCalculate}
            disabled={calculating}
          >
            {calculating ? <Loader2 size={18} className="animate-spin" /> : <Calculator size={18} />}
            {calculating ? 'Matching Catalogue Models...' : 'Calculate & Match Equipment'}
          </button>
        </div>

        {/* Results Card */}
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

            {/* MULTIPLE COMPRESSOR BRANDS / MODELS SELECTOR */}
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

                  {/* Brand Filter Pill */}
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
                  value={activeCdu?.id || ''}
                  onChange={e => handleSelectCdu(e.target.value)}
                >
                  {filteredCompressors.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.brand_name || 'CDU'}] {c.model_number} ({c.capacity} kW) — ₹{c.selling_price || 0} {c.voltage_phase ? `[${c.voltage_phase}]` : ''} {c.catalogue_ref ? `(${c.catalogue_ref})` : ''}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                  <span>Chosen: <strong>{activeCdu?.brand_name} {activeCdu?.model_number}</strong> ({activeCdu?.capacity} kW)</span>
                  <span>Catalogue: {activeCdu?.catalogue_ref || 'Standard Catalog'}</span>
                </div>
              </div>
            )}

            <div style={{ fontSize: '0.82rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div><strong>Selected CDU:</strong> {activeCdu?.brand_name || 'Emerson'} {activeCdu?.model_number} ({activeCdu?.capacity} kW)</div>
              <div><strong>Matched Evaporator:</strong> {recommendation.recommendations?.evaporator?.brand_name || 'Daikin'} {recommendation.recommendations?.evaporator?.model_number}</div>
              <div><strong>Digital Controller:</strong> {recommendation.recommendations?.controller?.model || 'Dixell XR02CX'}</div>
              <div><strong>Expansion Valve:</strong> {recommendation.recommendations?.expansionValve || 'TIE-SW'}</div>
            </div>

            {/* Checkbox Line Items to Insert */}
            <div style={{ borderTop: '1px solid rgba(37, 99, 235, 0.2)', paddingTop: '0.75rem' }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                Select Lines to Insert into Invoice:
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {/* 1. CDU */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedLines.cdu}
                      onChange={e => setSelectedLines(p => ({ ...p, cdu: e.target.checked }))}
                    />
                    <span>{activeCdu?.brand_name || 'Emerson'} {activeCdu?.model_number} Condensing Unit ({activeCdu?.capacity} kW)</span>
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

                {/* 2. Evaporator */}
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

                {/* 3. Kit */}
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

                {/* 4. Installation */}
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
            disabled={!recommendation}
          >
            Insert into Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
