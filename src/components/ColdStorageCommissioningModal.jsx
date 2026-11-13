import React, { useState, useEffect, useRef } from 'react';
import {
  X, Printer, Save, FileText, CheckCircle2, AlertTriangle,
  Plus, Trash2, ArrowLeft, RefreshCw, Eye, ShieldCheck, Download
} from 'lucide-react';
import { saveCommissioningReport, getNextCommissioningReportNumber } from '../store';
import { toast } from './Toast';

// Helper to calculate date offsets in ISO format (YYYY-MM-DD)
const addMonthsToDate = (dateStr, months) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
};

const addYearsToDate = (dateStr, years) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1); // e.g. 15/01/2026 to 14/01/2027
  return d.toISOString().split('T')[0];
};

// Default Sample 4-Chamber Units (Instakart Pune Daikin Installation)
export const DEFAULT_COMMISSIONING_UNITS = [
  {
    srNo: 1,
    chamberName: 'Deep Freezer Chamber 1',
    evaporatorMakeModel: 'CRE2L1400ASV16',
    evaporatorSerialNo: '0000259',
    condenserMakeModel: 'CCLS0400ARY16',
    condenserSerialNo: '0000640',
    roomSize: 'As per Layout',
    roomTemp: '-20'
  },
  {
    srNo: 2,
    chamberName: 'Deep Freezer Chamber 2',
    evaporatorMakeModel: 'CRE2L1400ASV16',
    evaporatorSerialNo: '0000256',
    condenserMakeModel: 'CCLS0400ARY16',
    condenserSerialNo: '0000644',
    roomSize: 'As per Layout',
    roomTemp: '-20'
  },
  {
    srNo: 3,
    chamberName: 'Chiller Room (Dairy & Fresh)',
    evaporatorMakeModel: 'CRE2M600ASV16',
    evaporatorSerialNo: '0001292',
    condenserMakeModel: 'CCMR0300ARY16',
    condenserSerialNo: '0001952',
    roomSize: 'As per Layout',
    roomTemp: '+02'
  },
  {
    srNo: 4,
    chamberName: 'Ante / Staging / Packing Room',
    evaporatorMakeModel: 'CRE2M600ASV16',
    evaporatorSerialNo: '0001293',
    condenserMakeModel: 'CCMR0300ARY16',
    condenserSerialNo: '0001950',
    roomSize: 'As per Layout',
    roomTemp: '+15'
  }
];

export const DEFAULT_MEASUREMENT_ITEMS = [
  { srNo: 1, description: 'Copper Pipe (Chiller)', sizes: '5/8, 3/8', quantity: '22.8', uom: 'Rmt', remark: '' },
  { srNo: 2, description: 'Copper Pipe (Freezer)', sizes: '6/8, 1/2', quantity: '59.0', uom: 'Rmt', remark: '' },
  { srNo: 3, description: 'Copper Pipe (Ambient / Ante)', sizes: '5/8, 3/8', quantity: '30.5', uom: 'Rmt', remark: '' },
  { srNo: 4, description: 'Power Cable (Outdoor Mains)', sizes: '4 Core', quantity: '44.0', uom: 'Rmt', remark: '' },
  { srNo: 5, description: 'Control / Fan Cable', sizes: '3 Core', quantity: '98.0', uom: 'Rmt', remark: '' },
  { srNo: 6, description: 'Condensate Drain Pipe', sizes: 'Hard PVC', quantity: '23.0', uom: 'Rmt', remark: '' },
  { srNo: 7, description: 'Outdoor CCU Equipment Stand', sizes: 'Fabricated MS', quantity: '4', uom: 'Nos', remark: 'Elevated base' },
  { srNo: 8, description: 'Refrigerant Gas (R404A / R407F)', sizes: 'Cylinder', quantity: '64', uom: 'Kgs', remark: '16 Kg × 4 systems' },
  { srNo: 9, description: 'PVC Strip Curtains (Polar Grade)', sizes: 'Doorway', quantity: '3', uom: 'Sets', remark: 'Infiltration control' },
  { srNo: 10, description: 'Air Curtains (High Velocity)', sizes: 'Doorway', quantity: '3', uom: 'Nos', remark: 'Air barrier' },
  { srNo: 11, description: 'Cold Room Safety Hooter / Panic Alarm', sizes: 'Audio/Visual', quantity: '1', uom: 'Nos', remark: 'Man-trapped alarm' },
  { srNo: 12, description: 'Ceasing Patti (Trims & Flashings)', sizes: 'GI/PPGI', quantity: 'Lot', uom: 'Lot', remark: 'Hygienic coving' },
];

export const DEFAULT_CSH2_CHECKS = [
  { id: 'stabilizer', label: 'Voltage stabilizer', checked: false },
  { id: 'single_phase_preventer', label: 'Single phase preventer', checked: true },
  { id: 'drain_trap', label: 'Drain trap provided', checked: true },
  { id: 'crankcase_heater', label: 'Crank case heater working', checked: true },
  { id: 'drain_heater', label: 'Evaporator drain line heater working (for Freezer)', checked: true },
  { id: 'safety_controls', label: 'Safety controls tested', checked: true },
  { id: 'defrost_heater', label: 'Defrost heater working (for Freezer)', checked: true },
  { id: 'door_heater', label: 'Door heater working', checked: true },
  { id: 'door_accessories', label: 'Door accessories working', checked: true },
  { id: 'customer_order_heatload', label: 'Customer order copy with heat load', checked: true },
];

export default function ColdStorageCommissioningModal({
  isOpen,
  onClose,
  client,
  invoice,
  existingReport,
  onSaved
}) {
  const [activeTab, setActiveTab] = useState('csh1'); // 'csh1' | 'csh2' | 'measurement' | 'preview'
  const [selectedUnitIdx, setSelectedUnitIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const printRef = useRef(null);

  // Initialize form state
  const [formData, setFormData] = useState({
    id: '',
    report_no: '',
    invoice_no: '',
    invoice_date: '',
    customer_name: '',
    customer_id: '',
    branch: 'Pune',
    dealer_name: 'Bizz Alliance LLP',
    billing_address: '',
    site_address: '',
    customer_email_sales: '',
    customer_email_service: '',
    customer_email_accounts: '',
    distance_dealer: '<60km',
    handover_date: new Date().toISOString().split('T')[0],
    warranty_start: new Date().toISOString().split('T')[0],
    warranty_end: addYearsToDate(new Date().toISOString().split('T')[0], 1),
    ppm1_date: addMonthsToDate(new Date().toISOString().split('T')[0], 4),
    ppm2_date: addMonthsToDate(new Date().toISOString().split('T')[0], 8),
    ppm3_date: addMonthsToDate(new Date().toISOString().split('T')[0], 12),
    units: [...DEFAULT_COMMISSIONING_UNITS],
    csh2_data: {},
    measurement_data: [...DEFAULT_MEASUREMENT_ITEMS],
    remarks: '',
    engineer_name: 'Installation Engineer',
    customer_signatory: 'Customer Representative'
  });

  useEffect(() => {
    if (!isOpen) return;

    if (existingReport) {
      setFormData({
        ...existingReport,
        units: existingReport.units?.length > 0 ? existingReport.units : [...DEFAULT_COMMISSIONING_UNITS],
        csh2_data: existingReport.csh2_data || {},
        measurement_data: existingReport.measurement_data?.length > 0 ? existingReport.measurement_data : [...DEFAULT_MEASUREMENT_ITEMS]
      });
      return;
    }

    // Auto-generate fresh report
    const today = new Date().toISOString().split('T')[0];
    getNextCommissioningReportNumber().then(res => {
      setFormData(prev => ({
        ...prev,
        report_no: res.reportNo,
        customer_name: client?.name || invoice?.clientName || 'Instakart Services Pvt Ltd',
        customer_id: client?.id || '',
        invoice_no: invoice?.invoiceNumber || '',
        invoice_date: invoice?.invoiceDate || today,
        billing_address: client?.address || 'Warehouse Building Nos. WE-II, Renaissance Integrated Industrial Area, Village Vashere, Bhiwandi, Thane, Mumbai, Maharashtra 421302',
        site_address: client?.siteAddress || client?.shippingAddress || 'Ground floor S no.88 Hari Hareshwar Nagar Sasane Wasti Mohammadwad Pune Maharashtra-411060',
        handover_date: today,
        warranty_start: today,
        warranty_end: addYearsToDate(today, 1),
        ppm1_date: addMonthsToDate(today, 4),
        ppm2_date: addMonthsToDate(today, 8),
        ppm3_date: addMonthsToDate(today, 12),
      }));
    }).catch(() => {});
  }, [isOpen, existingReport, client, invoice]);

  if (!isOpen) return null;

  // Handover date change handler -> auto computes PPM and Warranty
  const handleHandoverDateChange = (val) => {
    setFormData(prev => ({
      ...prev,
      handover_date: val,
      warranty_start: val,
      warranty_end: addYearsToDate(val, 1),
      ppm1_date: addMonthsToDate(val, 4),
      ppm2_date: addMonthsToDate(val, 8),
      ppm3_date: addMonthsToDate(val, 12),
    }));
  };

  // Helper for current selected CSH-2 unit
  const currentUnit = formData.units[selectedUnitIdx] || formData.units[0] || {};
  const currentUnitKey = `unit_${selectedUnitIdx}`;
  const currentCsh2 = formData.csh2_data[currentUnitKey] || {
    voltage_odu: '404',
    voltage_idu: '230',
    ambient_temp: '28',
    thermostat_setting: '2',
    room_temp_order: currentUnit.roomTemp || '-20',
    actual_box_temp: currentUnit.roomTemp || '-20',
    rh_order: '',
    actual_rh: '',
    compressor_suction_psi: '50',
    compressor_discharge_psi: '240',
    compressor_rated_amps: '',
    compressor_actual_amps: '18',
    condenser_fan_amps: '4.5',
    condenser_inlet_temp: '40',
    condenser_outlet_temp: '38',
    evaporator_fan_amps: '1.0',
    defrost_frequency: '6',
    defrost_termination_temp: '8',
    defrost_fan_restart_min: '2',
    suction_pipe_size: '6/8',
    liquid_pipe_size: '3/8',
    refrigerant_pipe_length_ft: '25',
    pipe_insulation_thickness_mm: '19',
    refrigerant_qty_kg: '16',
    full_load_amps: '6.2',
    checklist: DEFAULT_CSH2_CHECKS.map(c => ({ ...c }))
  };

  const updateCurrentCsh2 = (field, val) => {
    setFormData(prev => ({
      ...prev,
      csh2_data: {
        ...prev.csh2_data,
        [currentUnitKey]: {
          ...currentCsh2,
          [field]: val
        }
      }
    }));
  };

  const toggleChecklist = (checkId) => {
    const updatedChecks = (currentCsh2.checklist || DEFAULT_CSH2_CHECKS).map(c => {
      if (c.id === checkId) return { ...c, checked: !c.checked };
      return c;
    });
    updateCurrentCsh2('checklist', updatedChecks);
  };

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await saveCommissioningReport(formData);
      toast(`Commissioning Report ${saved.report_no} saved successfully!`, 'success');
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      console.error(err);
      toast('Failed to save commissioning report: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Direct print handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '0.75rem',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--card-bg, #fff)', width: '100%', maxWidth: '1100px', height: '94vh',
        borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', border: '1px solid var(--border)'
      }}>
        {/* MODAL HEADER */}
        <div className="no-print" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1.25rem', background: '#0b2545', color: '#fff', borderBottom: '1px solid #1e3a5f'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={20} style={{ color: '#38bdf8' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.5px' }}>
                DAIKIN COLD STORAGE COMMISSIONING REPORT
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Ref No: <strong>{formData.report_no || 'CSH-NEW'}</strong> • Client: {formData.customer_name}
              </div>
            </div>
          </div>

          {/* TAB BUTTONS */}
          <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(255,255,255,0.1)', padding: '3px', borderRadius: 6 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveTab('csh1')}
              style={{
                fontSize: '0.76rem', padding: '0.35rem 0.7rem', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: activeTab === 'csh1' ? '#0284c7' : 'transparent', color: '#fff', fontWeight: activeTab === 'csh1' ? 700 : 500
              }}
            >
              📋 Form CSH-1 (Summary)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveTab('csh2')}
              style={{
                fontSize: '0.76rem', padding: '0.35rem 0.7rem', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: activeTab === 'csh2' ? '#0284c7' : 'transparent', color: '#fff', fontWeight: activeTab === 'csh2' ? 700 : 500
              }}
            >
              ⚙️ Form CSH-2 (Parameters Log)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveTab('measurement')}
              style={{
                fontSize: '0.76rem', padding: '0.35rem 0.7rem', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: activeTab === 'measurement' ? '#0284c7' : 'transparent', color: '#fff', fontWeight: activeTab === 'measurement' ? 700 : 500
              }}
            >
              📐 Measurement Sheet
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveTab('preview')}
              style={{
                fontSize: '0.76rem', padding: '0.35rem 0.7rem', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: activeTab === 'preview' ? '#059669' : 'transparent', color: '#fff', fontWeight: activeTab === 'preview' ? 700 : 500
              }}
            >
              👁️ Print Preview
            </button>
          </div>

          {/* ACTIONS */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrint}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#1e293b', color: '#fff', border: '1px solid #334155' }}
            >
              <Printer size={14} /> Print
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#0284c7', border: 'none' }}
            >
              <Save size={14} /> {isSaving ? 'Saving...' : 'Save Report'}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              style={{ color: '#94a3b8', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', background: 'var(--bg-secondary, #f8fafc)' }}>
          {/* TAB 1: FORM CSH-1 */}
          {activeTab === 'csh1' && (
            <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Top Banner / Dealer Info */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>DAIPL Branch</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={formData.branch} onChange={e => setFormData({ ...formData, branch: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Invoice No</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={formData.invoice_no} onChange={e => setFormData({ ...formData, invoice_no: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Invoice Date</label>
                    <input
                      type="date" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={formData.invoice_date} onChange={e => setFormData({ ...formData, invoice_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Distance from Dealer</label>
                    <select
                      className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={formData.distance_dealer} onChange={e => setFormData({ ...formData, distance_dealer: e.target.value })}
                    >
                      <option value="<60km">&lt; 60km</option>
                      <option value="60-200km">60-200km</option>
                      <option value=">200km">&gt; 200km</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Customer Addresses */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#0369a1', fontWeight: 700 }}>
                      1. Customer Billing Address
                    </h4>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem', marginBottom: '0.4rem', fontWeight: 700 }}
                      value={formData.customer_name} onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder="Customer / Company Name"
                    />
                    <textarea
                      rows={3} className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                      value={formData.billing_address} onChange={e => setFormData({ ...formData, billing_address: e.target.value })}
                      placeholder="Billing Address (Industrial Area, City, Pin, State)"
                    />
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#0369a1', fontWeight: 700 }}>
                      2. Installation & Site Address
                    </h4>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem', marginBottom: '0.4rem', fontWeight: 700 }}
                      value={formData.customer_name} readOnly
                    />
                    <textarea
                      rows={3} className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                      value={formData.site_address} onChange={e => setFormData({ ...formData, site_address: e.target.value })}
                      placeholder="Installation Site Address"
                    />
                  </div>
                </div>
              </div>

              {/* Handover & Warranty PPM Dates */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  {/* Handover & Warranty */}
                  <div>
                    <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: '#0f172a', fontWeight: 700 }}>
                      Handover & Comprehensive Warranty
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Date of Handing Over</label>
                        <input
                          type="date" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                          value={formData.handover_date} onChange={e => handleHandoverDateChange(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Warranty Ends On (1 Yr)</label>
                        <input
                          type="date" className="form-input" style={{ width: '100%', fontSize: '0.82rem', fontWeight: 700, color: '#059669' }}
                          value={formData.warranty_end} onChange={e => setFormData({ ...formData, warranty_end: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Due Dates of 3 Free PPM Services */}
                  <div>
                    <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: '#0f172a', fontWeight: 700 }}>
                      Due Dates of Free Preventive Maintenance (PPM)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>1st Service (4 Mo)</label>
                        <input
                          type="date" className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                          value={formData.ppm1_date} onChange={e => setFormData({ ...formData, ppm1_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>2nd Service (8 Mo)</label>
                        <input
                          type="date" className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                          value={formData.ppm2_date} onChange={e => setFormData({ ...formData, ppm2_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>3rd Service (12 Mo)</label>
                        <input
                          type="date" className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                          value={formData.ppm3_date} onChange={e => setFormData({ ...formData, ppm3_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-Chamber Equipment Table */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0b2545', fontWeight: 700 }}>
                    Refrigeration Unit & Cold Room Handover Details
                  </h4>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.74rem', padding: '0.25rem 0.6rem' }}
                      onClick={() => setFormData({ ...formData, units: [...DEFAULT_COMMISSIONING_UNITS] })}
                    >
                      Preload Sample 4-Chamber Setup
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '0.74rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => {
                        const newU = {
                          srNo: formData.units.length + 1,
                          chamberName: `Chamber ${formData.units.length + 1}`,
                          evaporatorMakeModel: 'CRE2M600ASV16',
                          evaporatorSerialNo: '',
                          condenserMakeModel: 'CCMR0300ARY16',
                          condenserSerialNo: '',
                          roomSize: 'As per Layout',
                          roomTemp: '+02'
                        };
                        setFormData({ ...formData, units: [...formData.units, newU] });
                      }}
                    >
                      <Plus size={12} /> Add Chamber
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#0b2545', color: '#fff' }}>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 40 }}>Sr</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Evaporator Make & Model</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', width: 120 }}>Evap Serial No</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Condenser Make & Model</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', width: 120 }}>Cond Serial No</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 90 }}>Room Temp</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.units.map((u, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 1 ? '#f8fafc' : '#fff' }}>
                          <td style={{ padding: '0.45rem', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.78rem' }}
                              value={u.evaporatorMakeModel}
                              onChange={e => {
                                const copy = [...formData.units];
                                copy[idx].evaporatorMakeModel = e.target.value;
                                setFormData({ ...formData, units: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace' }}
                              value={u.evaporatorSerialNo}
                              placeholder="0000000"
                              onChange={e => {
                                const copy = [...formData.units];
                                copy[idx].evaporatorSerialNo = e.target.value;
                                setFormData({ ...formData, units: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.78rem' }}
                              value={u.condenserMakeModel}
                              onChange={e => {
                                const copy = [...formData.units];
                                copy[idx].condenserMakeModel = e.target.value;
                                setFormData({ ...formData, units: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace' }}
                              value={u.condenserSerialNo}
                              placeholder="0000000"
                              onChange={e => {
                                const copy = [...formData.units];
                                copy[idx].condenserSerialNo = e.target.value;
                                setFormData({ ...formData, units: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.78rem', textAlign: 'center', fontWeight: 700 }}
                              value={u.roomTemp}
                              placeholder="-20"
                              onChange={e => {
                                const copy = [...formData.units];
                                copy[idx].roomTemp = e.target.value;
                                setFormData({ ...formData, units: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem', textAlign: 'center' }}>
                            {formData.units.length > 1 && (
                              <button
                                type="button"
                                className="icon-btn icon-btn-red"
                                style={{ padding: '2px' }}
                                onClick={() => {
                                  const copy = formData.units.filter((_, i) => i !== idx);
                                  setFormData({ ...formData, units: copy });
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks & Signatures */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Handover Remarks</label>
                    <textarea
                      rows={2} className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                      value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                      placeholder="e.g. All 4 chambers achieved setpoint temperature. Handed over to warehouse operations team."
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Authorized Dealer Entity</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem', fontWeight: 700 }}
                      value={formData.dealer_name} onChange={e => setFormData({ ...formData, dealer_name: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FORM CSH-2 (OPERATING PARAMETERS) */}
          {activeTab === 'csh2' && (
            <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Unit Sub-Selector Pills */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#fff', padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Select Unit:</span>
                {formData.units.map((u, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedUnitIdx(idx)}
                    style={{
                      padding: '0.3rem 0.75rem', fontSize: '0.78rem', borderRadius: 4, cursor: 'pointer',
                      border: '1px solid',
                      borderColor: selectedUnitIdx === idx ? '#0284c7' : '#cbd5e1',
                      background: selectedUnitIdx === idx ? '#0284c7' : '#f8fafc',
                      color: selectedUnitIdx === idx ? '#fff' : '#1e293b',
                      fontWeight: selectedUnitIdx === idx ? 700 : 500
                    }}
                  >
                    Unit #{idx + 1}: {u.condenserMakeModel} ({u.roomTemp}°C)
                  </button>
                ))}
              </div>

              {/* Operating Parameters Grid */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: '#0369a1', fontWeight: 700 }}>
                  Electrical & Thermodynamic Parameters (Unit #{selectedUnitIdx + 1})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Voltage Input (ODU - 3 Phase)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.voltage_odu} onChange={e => updateCurrentCsh2('voltage_odu', e.target.value)}
                      placeholder="404 Volt"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Voltage Input (IDU - 1 Phase)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.voltage_idu} onChange={e => updateCurrentCsh2('voltage_idu', e.target.value)}
                      placeholder="230 Volt"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Ambient During Commissioning</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.ambient_temp} onChange={e => updateCurrentCsh2('ambient_temp', e.target.value)}
                      placeholder="28 °C"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Thermostat Setting (°C)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.thermostat_setting} onChange={e => updateCurrentCsh2('thermostat_setting', e.target.value)}
                      placeholder="2 °C"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Room Temp as per order (°C)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.room_temp_order} onChange={e => updateCurrentCsh2('room_temp_order', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Actual Box Temp Achieved (°C)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem', fontWeight: 700, color: '#059669' }}
                      value={currentCsh2.actual_box_temp} onChange={e => updateCurrentCsh2('actual_box_temp', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Compressor Suction Pressure (Psig)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.compressor_suction_psi} onChange={e => updateCurrentCsh2('compressor_suction_psi', e.target.value)}
                      placeholder="50 Psig"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Compressor Discharge Pressure (Psig)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.compressor_discharge_psi} onChange={e => updateCurrentCsh2('compressor_discharge_psi', e.target.value)}
                      placeholder="240 Psig"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Compressor Actual Amps</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.compressor_actual_amps} onChange={e => updateCurrentCsh2('compressor_actual_amps', e.target.value)}
                      placeholder="18 Amps"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Full Load Amps (FLA)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.full_load_amps} onChange={e => updateCurrentCsh2('full_load_amps', e.target.value)}
                      placeholder="6.2 Amps"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Condenser Fan Motor Amps</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.condenser_fan_amps} onChange={e => updateCurrentCsh2('condenser_fan_amps', e.target.value)}
                      placeholder="4.5 Amps"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Evaporator Fan Motor Amps</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.evaporator_fan_amps} onChange={e => updateCurrentCsh2('evaporator_fan_amps', e.target.value)}
                      placeholder="1.0 Amps"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Total Refrigerant Charged Qty (Kg)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem', fontWeight: 700 }}
                      value={currentCsh2.refrigerant_qty_kg} onChange={e => updateCurrentCsh2('refrigerant_qty_kg', e.target.value)}
                      placeholder="16 Kg"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Defrost Frequency (Cycles / Day)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.defrost_frequency} onChange={e => updateCurrentCsh2('defrost_frequency', e.target.value)}
                      placeholder="6"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Defrost Termination Temp (°C)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.defrost_termination_temp} onChange={e => updateCurrentCsh2('defrost_termination_temp', e.target.value)}
                      placeholder="8 °C"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Defrost Fan Restart Delay (Min)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.82rem' }}
                      value={currentCsh2.defrost_fan_restart_min} onChange={e => updateCurrentCsh2('defrost_fan_restart_min', e.target.value)}
                      placeholder="2 Minutes"
                    />
                  </div>
                </div>
              </div>

              {/* 10-Point Technical Safety Checklist */}
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: '#0369a1', fontWeight: 700 }}>
                  10-Point Technical Safety Verification Checklist
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  {(currentCsh2.checklist || DEFAULT_CSH2_CHECKS).map(chk => (
                    <div
                      key={chk.id}
                      onClick={() => toggleChecklist(chk.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.65rem',
                        borderRadius: 6, cursor: 'pointer', border: '1px solid',
                        background: chk.checked ? '#f0fdf4' : '#fff',
                        borderColor: chk.checked ? '#86efac' : '#e2e8f0'
                      }}
                    >
                      <input type="checkbox" checked={chk.checked} onChange={() => {}} style={{ cursor: 'pointer' }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: chk.checked ? 600 : 400, color: chk.checked ? '#15803d' : '#475569' }}>
                        {chk.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MEASUREMENT SHEET */}
          {activeTab === 'measurement' && (
            <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ padding: '1rem', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#0b2545', fontWeight: 700 }}>
                      Site Material Consumption & Piping Measurement Sheet
                    </h4>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Material consumption at site as per actual installation handover
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    onClick={() => {
                      const newItm = {
                        srNo: formData.measurement_data.length + 1,
                        description: 'New Material Item',
                        sizes: '',
                        quantity: '1',
                        uom: 'Nos',
                        remark: ''
                      };
                      setFormData({ ...formData, measurement_data: [...formData.measurement_data, newItm] });
                    }}
                  >
                    <Plus size={12} /> Add Material Line
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#0b2545', color: '#fff' }}>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 45 }}>Sr.</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Item Description</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 130 }}>Sizes / Specs</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 90 }}>Quantity</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 75 }}>UOM</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', width: 160 }}>Remarks</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.measurement_data.map((m, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 1 ? '#f8fafc' : '#fff' }}>
                          <td style={{ padding: '0.45rem', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.8rem', fontWeight: 600 }}
                              value={m.description}
                              onChange={e => {
                                const copy = [...formData.measurement_data];
                                copy[idx].description = e.target.value;
                                setFormData({ ...formData, measurement_data: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.8rem', textAlign: 'center' }}
                              value={m.sizes}
                              onChange={e => {
                                const copy = [...formData.measurement_data];
                                copy[idx].sizes = e.target.value;
                                setFormData({ ...formData, measurement_data: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.8rem', textAlign: 'center', fontWeight: 700 }}
                              value={m.quantity}
                              onChange={e => {
                                const copy = [...formData.measurement_data];
                                copy[idx].quantity = e.target.value;
                                setFormData({ ...formData, measurement_data: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.8rem', textAlign: 'center' }}
                              value={m.uom}
                              onChange={e => {
                                const copy = [...formData.measurement_data];
                                copy[idx].uom = e.target.value;
                                setFormData({ ...formData, measurement_data: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem' }}>
                            <input
                              type="text" className="form-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              value={m.remark}
                              onChange={e => {
                                const copy = [...formData.measurement_data];
                                copy[idx].remark = e.target.value;
                                setFormData({ ...formData, measurement_data: copy });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.45rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="icon-btn icon-btn-red"
                              style={{ padding: '2px' }}
                              onClick={() => {
                                const copy = formData.measurement_data.filter((_, i) => i !== idx);
                                setFormData({ ...formData, measurement_data: copy });
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PRINT PREVIEW (EXACT OFFICIAL DAIKIN FORM CSH-1 & CSH-2 FORMAT) */}
          {activeTab === 'preview' && (
            <div ref={printRef} className="printable-commissioning-container" style={{ maxWidth: '820px', margin: '0 auto', background: '#fff', padding: '2rem', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', color: '#000', fontFamily: 'Arial, sans-serif' }}>
              {/* PAGE 1: FORM CSH-1 */}
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '1px', color: '#0284c7' }}>DAIKIN</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>Form CSH-1</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', marginTop: '2px' }}>
                      COLD STORAGE COMMISSIONING REPORT
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                    <div>Invoice No: <strong>{formData.invoice_no || 'N/A'}</strong></div>
                    <div>Invoice Date: <strong>{formData.invoice_date || 'N/A'}</strong></div>
                    <div>DAIPL Branch: <strong>{formData.branch}</strong></div>
                  </div>
                </div>

                {/* Billing Address Box */}
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '0.5rem', fontSize: '0.78rem' }}>
                  <tbody>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td colSpan={2} style={{ padding: '3px 6px', fontWeight: 800, borderBottom: '1px solid #000' }}>Customer Name / Address (Billing Address)</td>
                    </tr>
                    <tr>
                      <td style={{ width: '120px', padding: '4px 6px', fontWeight: 700, borderRight: '1px solid #000' }}>Name:</td>
                      <td style={{ padding: '4px 6px', fontWeight: 700 }}>{formData.customer_name}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #ccc' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 700, borderRight: '1px solid #000' }}>Address:</td>
                      <td style={{ padding: '4px 6px' }}>{formData.billing_address}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Site Address Box */}
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '0.5rem', fontSize: '0.78rem' }}>
                  <tbody>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td colSpan={2} style={{ padding: '3px 6px', fontWeight: 800, borderBottom: '1px solid #000' }}>Customer Name / Address (Installation & Site Address)</td>
                    </tr>
                    <tr>
                      <td style={{ width: '120px', padding: '4px 6px', fontWeight: 700, borderRight: '1px solid #000' }}>Name:</td>
                      <td style={{ padding: '4px 6px', fontWeight: 700 }}>{formData.customer_name}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #ccc' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 700, borderRight: '1px solid #000' }}>Address:</td>
                      <td style={{ padding: '4px 6px' }}>{formData.site_address}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Handover & Warranty PPM Box */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '0.76rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 6px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Date of Handing Over:</td>
                        <td style={{ padding: '4px 6px', borderBottom: '1px solid #000', fontWeight: 700 }}>{formData.handover_date}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 6px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Warranty Starts From:</td>
                        <td style={{ padding: '4px 6px', borderBottom: '1px solid #000', fontWeight: 700 }}>{formData.warranty_start}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 6px', borderRight: '1px solid #000' }}>Warranty Ends On:</td>
                        <td style={{ padding: '4px 6px', fontWeight: 700, color: '#059669' }}>{formData.warranty_end}</td>
                      </tr>
                    </tbody>
                  </table>

                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th colSpan={3} style={{ padding: '3px 6px', borderBottom: '1px solid #000', textAlign: 'center' }}>Due Dates of Free Preventive Maintenance Service</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #000', borderRight: '1px solid #000', fontWeight: 700 }}>1st</td>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #000', borderRight: '1px solid #000', fontWeight: 700 }}>{formData.ppm1_date}</td>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #000', fontSize: '0.7rem' }}>(4 months)</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #000', borderRight: '1px solid #000', fontWeight: 700 }}>2nd</td>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #000', borderRight: '1px solid #000', fontWeight: 700 }}>{formData.ppm2_date}</td>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #000', fontSize: '0.7rem' }}>(8 months)</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '3px 6px', borderRight: '1px solid #000', fontWeight: 700 }}>3rd</td>
                        <td style={{ padding: '3px 6px', borderRight: '1px solid #000', fontWeight: 700 }}>{formData.ppm3_date}</td>
                        <td style={{ padding: '3px 6px', fontSize: '0.7rem' }}>(12 months)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Multi-Chamber Equipment Table */}
                <div style={{ fontSize: '0.76rem', fontWeight: 700, margin: '0.4rem 0 0.2rem' }}>Refrigeration Unit & Handover Schedule:</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '0.76rem', marginBottom: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #000', padding: '4px', width: 30 }}>Sr</th>
                      <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left' }}>Evaporator Model & Make</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: 100 }}>Serial No</th>
                      <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left' }}>Condenser Model & Make</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: 100 }}>Serial No</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: 60 }}>Temp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.units.map((u, idx) => (
                      <tr key={idx}>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ border: '1px solid #000', padding: '4px', fontWeight: 600 }}>{u.evaporatorMakeModel}</td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontFamily: 'monospace' }}>{u.evaporatorSerialNo || '—'}</td>
                        <td style={{ border: '1px solid #000', padding: '4px', fontWeight: 600 }}>{u.condenserMakeModel}</td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontFamily: 'monospace' }}>{u.condenserSerialNo || '—'}</td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>{u.roomTemp}°C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signatures */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed #94a3b8' }}>
                  <div style={{ width: '220px', textAlign: 'center', border: '1px solid #000', padding: '0.6rem 0.4rem', borderRadius: 4 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>For {formData.dealer_name}</div>
                    <div style={{ height: '35px' }}></div>
                    <div style={{ fontSize: '0.7rem', borderTop: '1px solid #000', paddingTop: '2px' }}>Authorized Signatory / DAIPL Dealer</div>
                  </div>
                  <div style={{ width: '220px', textAlign: 'center', border: '1px solid #000', padding: '0.6rem 0.4rem', borderRadius: 4 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>Accepted by Customer</div>
                    <div style={{ height: '35px' }}></div>
                    <div style={{ fontSize: '0.7rem', borderTop: '1px solid #000', paddingTop: '2px' }}>Signature / Seal of Customer</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
