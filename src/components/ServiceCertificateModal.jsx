import React, { useState, useEffect } from 'react';
import { X, Printer, FileText, CheckCircle2, AlertCircle, Plus, Trash2, Star, Zap, Wrench } from 'lucide-react';
import { getNextServiceRequestNumber, saveServiceCertificate } from '../store';
import { toast } from './Toast';

export default function ServiceCertificateModal({
  isOpen,
  onClose,
  client,
  equipment = null,
  existingCertificate = null,
  onConvertToInvoice = null,
  onSaved = null
}) {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    request_no: '',
    customer_name: '',
    customer_id: '',
    site_id: '',
    site_name: '',
    site_address: '',
    engineer_name: '',
    installation_date: '',
    warranty_status: 'No',
    amc_status: 'No',
    complaint_date_time: '',
    rectification_date_time: '',
    outdoor_model_no: '',
    outdoor_serial_no: '',
    indoor_model_no: '',
    indoor_serial_no: '',
    cause_of_claim: 'Operational',
    problem_reported: '',
    root_cause_analysis: '',
    correction_work: '',
    parts_used: [],
    refrigerant_required: 'No',
    refrigerant_type: 'R404A',
    refrigerant_qty: '',
    rating_behaviour: 5,
    rating_satisfaction: 5,
    rating_explanation: 5,
    customer_remarks: '',
    dealer_name: 'DAIKIN AIR-CONDITIONING PVT. LTD.',
    labor_charge: 0
  });

  // Initialize or Auto-Fill Form
  useEffect(() => {
    if (existingCertificate) {
      setFormData({
        ...existingCertificate,
        parts_used: existingCertificate.parts_used || [],
        labor_charge: existingCertificate.labor_charge || 0
      });
      return;
    }

    const todayDate = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().slice(0, 5);
    const defaultDateTime = `${todayDate} ${nowTime}`;

    // Auto-fill from Client & Equipment
    let isAmcActive = 'No';
    if (client?.amcExpiry) {
      isAmcActive = client.amcExpiry >= todayDate ? 'Yes' : 'No';
    } else if (equipment?.amcExpiry) {
      isAmcActive = equipment.amcExpiry >= todayDate ? 'Yes' : 'No';
    }

    let isWarrantyActive = 'No';
    if (equipment?.warrantyUntil) {
      const w = String(equipment.warrantyUntil).toLowerCase();
      isWarrantyActive = !w.includes('expire') ? 'Yes' : 'No';
    }

    // Default Site Address
    let initialSiteAddress = '';
    let initialSiteName = '';
    let initialSiteId = '';

    if (equipment?.siteName) {
      initialSiteName = equipment.siteName;
      initialSiteAddress = equipment.siteDetails
        ? [equipment.siteDetails.address, equipment.siteDetails.city, equipment.siteDetails.state, equipment.siteDetails.pin].filter(Boolean).join(', ')
        : (client?.address ? [client.address, client.city, client.state, client.pin].filter(Boolean).join(', ') : '');
    } else if (client?.sites && client.sites.length > 0) {
      const firstSite = client.sites[0];
      initialSiteId = firstSite.id || '';
      initialSiteName = firstSite.siteName || '';
      initialSiteAddress = [firstSite.address, firstSite.city, firstSite.state, firstSite.pin].filter(Boolean).join(', ');
    } else if (client?.address) {
      initialSiteAddress = [client.address, client.city, client.state, client.pin].filter(Boolean).join(', ');
    }

    // Equipment models
    let outModel = '';
    let outSerial = '';
    let inModel = '';
    let inSerial = '';

    if (equipment) {
      const desc = (equipment.description || equipment.modelNumber || '').toLowerCase();
      if (desc.includes('evap') || desc.includes('indoor') || desc.includes('cooler')) {
        inModel = equipment.modelNumber || '';
        inSerial = equipment.serialNumber || '';
      } else {
        outModel = equipment.modelNumber || '';
        outSerial = equipment.serialNumber || '';
      }
    }

    // Fetch next sequential request number
    getNextServiceRequestNumber()
      .then(res => {
        setFormData(prev => ({
          ...prev,
          request_no: res.requestNo || `SR-${new Date().getFullYear()}-0001`,
          customer_name: client?.name || '',
          customer_id: client?.id || '',
          site_id: initialSiteId,
          site_name: initialSiteName,
          site_address: initialSiteAddress,
          installation_date: equipment?.installationDate || todayDate,
          warranty_status: isWarrantyActive,
          amc_status: isAmcActive,
          complaint_date_time: defaultDateTime,
          rectification_date_time: defaultDateTime,
          outdoor_model_no: outModel,
          outdoor_serial_no: outSerial,
          indoor_model_no: inModel,
          indoor_serial_no: inSerial,
          engineer_name: 'Lead Service Engineer',
          parts_used: []
        }));
      })
      .catch(() => {
        setFormData(prev => ({
          ...prev,
          request_no: `SR-${new Date().getFullYear()}-0001`,
          customer_name: client?.name || '',
          site_address: initialSiteAddress
        }));
      });
  }, [client, equipment, existingCertificate]);

  // Handle Site Selection Change
  const handleSiteChange = (siteId) => {
    if (!client?.sites) return;
    const site = client.sites.find(s => s.id === siteId);
    if (site) {
      const fullAddr = [site.address, site.city, site.state, site.pin].filter(Boolean).join(', ');
      setFormData(prev => ({
        ...prev,
        site_id: site.id,
        site_name: site.siteName,
        site_address: fullAddr
      }));
    }
  };

  // Handle Equipment Quick Select
  const handleEquipmentSelect = (eqId) => {
    if (!client?.equipment) return;
    const eq = client.equipment.find(e => e.id === eqId);
    if (!eq) return;

    const desc = (eq.description || eq.modelNumber || '').toLowerCase();
    const isIndoor = desc.includes('evap') || desc.includes('indoor') || desc.includes('cooler');

    let siteAddr = formData.site_address;
    let siteName = formData.site_name;
    let siteId = formData.site_id;
    if (eq.siteId && client?.sites) {
      const matchedSite = client.sites.find(s => s.id === eq.siteId);
      if (matchedSite) {
        siteId = matchedSite.id;
        siteName = matchedSite.siteName;
        siteAddr = [matchedSite.address, matchedSite.city, matchedSite.state, matchedSite.pin].filter(Boolean).join(', ');
      }
    } else if (eq.siteName) {
      siteName = eq.siteName;
    }

    let wActive = 'No';
    if (eq.warrantyUntil) {
      const w = String(eq.warrantyUntil).toLowerCase();
      wActive = !w.includes('expire') ? 'Yes' : 'No';
    }

    let aActive = 'No';
    if (eq.amcExpiry) {
      aActive = eq.amcExpiry >= new Date().toISOString().split('T')[0] ? 'Yes' : 'No';
    } else if (client?.amcExpiry) {
      aActive = client.amcExpiry >= new Date().toISOString().split('T')[0] ? 'Yes' : 'No';
    }

    setFormData(prev => ({
      ...prev,
      outdoor_model_no: !isIndoor ? (eq.modelNumber || '') : prev.outdoor_model_no,
      outdoor_serial_no: !isIndoor ? (eq.serialNumber || '') : prev.outdoor_serial_no,
      indoor_model_no: isIndoor ? (eq.modelNumber || '') : prev.indoor_model_no,
      indoor_serial_no: isIndoor ? (eq.serialNumber || '') : prev.indoor_serial_no,
      installation_date: eq.installationDate || prev.installation_date,
      warranty_status: wActive,
      amc_status: aActive,
      site_id: siteId,
      site_name: siteName,
      site_address: siteAddr
    }));
  };

  // Add Part / Consumable row
  const addPartRow = () => {
    setFormData(prev => ({
      ...prev,
      parts_used: [
        ...prev.parts_used,
        { id: Date.now().toString(), description: '', qty: 1, unitPrice: 0, partNo: '' }
      ]
    }));
  };

  // Update Part row
  const updatePartRow = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.parts_used];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, parts_used: updated };
    });
  };

  // Remove Part row
  const removePartRow = (index) => {
    setFormData(prev => ({
      ...prev,
      parts_used: prev.parts_used.filter((_, i) => i !== index)
    }));
  };

  // Save Certificate
  const handleSave = async () => {
    if (!formData.customer_name.trim()) {
      toast('Customer name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const saved = await saveServiceCertificate(formData);
      toast(`Service Certificate ${saved.request_no} saved successfully!`, 'success');
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      toast(`Failed to save certificate: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Convert to GST Invoice Draft
  const handleConvertToInvoice = () => {
    if (!onConvertToInvoice) return;

    const items = [];

    // 1. Add parts used
    (formData.parts_used || []).forEach(p => {
      if (p.description && p.description.trim()) {
        items.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
          name: p.description,
          hsn: p.partNo || '8418',
          quantity: Number(p.qty) || 1,
          unit: 'Pcs',
          rate: Number(p.unitPrice) || 0,
          discount: 0,
          discountType: 'fixed',
          discountBase: 'net',
          taxPercent: 18,
          cessPercent: 0,
          description: `Used during Service Request #${formData.request_no}`
        });
      }
    });

    // 2. Add Refrigerant Gas if required
    if (formData.refrigerant_required === 'Yes' && formData.refrigerant_qty) {
      items.push({
        id: Date.now().toString() + 'gas',
        name: `Refrigerant Gas Charging (${formData.refrigerant_type})`,
        hsn: '3824',
        quantity: Number(formData.refrigerant_qty) || 1,
        unit: 'Kg',
        rate: 850,
        discount: 0,
        discountType: 'fixed',
        discountBase: 'net',
        taxPercent: 18,
        cessPercent: 0,
        description: `Gas top-up for Model: ${formData.outdoor_model_no || formData.indoor_model_no || 'Refrigeration System'}`
      });
    }

    // 3. Add Service / Labor Charge
    const labor = Number(formData.labor_charge) || 0;
    items.push({
      id: Date.now().toString() + 'srv',
      name: `Refrigeration Service & Repair Charges (${formData.request_no})`,
      hsn: '9987',
      quantity: 1,
      unit: 'Job',
      rate: labor,
      discount: 0,
      discountType: 'fixed',
      discountBase: 'net',
      taxPercent: 18,
      cessPercent: 0,
      description: `Service completed by ${formData.engineer_name || 'Engineer'}. Rectification: ${formData.correction_work || 'Routine service'}`
    });

    const draft = {
      client: {
        name: client?.name || formData.customer_name,
        contactPerson: client?.contactPerson || '',
        address: client?.address || formData.site_address,
        city: client?.city || '',
        state: client?.state || 'Maharashtra',
        pin: client?.pin || '',
        gstin: client?.gstin || '',
        email: client?.email || '',
        phone: client?.phone || '',
        country: client?.country || 'India',
        isSEZ: !!client?.isSEZ
      },
      details: {
        shipToSameAsBilling: true,
        shippingAddress: formData.site_address || client?.address || '',
        shippingCity: client?.city || '',
        shippingState: client?.state || 'Maharashtra',
        shippingPin: client?.pin || '',
        placeOfSupply: client?.state || 'Maharashtra',
        notes: `Service Completion Certificate #${formData.request_no} dated ${formData.rectification_date_time || new Date().toISOString().split('T')[0]}`
      },
      items
    };

    onClose();
    onConvertToInvoice(draft);
    toast(`Pre-filled GST Invoice for Service #${formData.request_no}`, 'success');
  };

  // Print Certificate Handler
  const handlePrint = () => {
    window.print();
  };

  const renderStars = (rating, onChange) => {
    return (
      <div style={{ display: 'flex', gap: '3px' }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: star <= rating ? '#f59e0b' : '#cbd5e1'
            }}
          >
            <Star size={16} fill={star <= rating ? '#f59e0b' : 'none'} />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="glass-panel"
        style={{
          width: '95%',
          maxWidth: '920px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          background: 'var(--card-bg, #ffffff)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, #1e3a8a, #0284c7)',
          color: '#ffffff'
        }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Wrench size={20} /> SERVICE COMPLETION CERTIFICATE
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', opacity: 0.9 }}>
              Authorized Service Dealer for: <strong>{formData.dealer_name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body / Daikin Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }} className="service-cert-print-area">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .service-cert-print-area, .service-cert-print-area * { visibility: visible !important; }
              .service-cert-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
              }
              .no-print { display: none !important; }
            }
            .cert-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
            .cert-table td, .cert-table th { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; }
            .cert-header { background: #f1f5f9; font-weight: 700; }
            .cert-label { font-weight: 600; color: #334155; font-size: 0.78rem; margin-bottom: 2px; }
          `}</style>

          <table className="cert-table">
            <tbody>
              {/* Header Banner */}
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan="2" style={{ textAlign: 'center', padding: '10px' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>
                    SERVICE COMPLETION CERTIFICATE
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0369a1', marginTop: '2px' }}>
                    Authorized Service Dealer for: {formData.dealer_name}
                  </div>
                </td>
              </tr>

              {/* Request No & Engineer */}
              <tr>
                <td style={{ width: '50%' }}>
                  <div className="cert-label">Service Request No:</div>
                  <input
                    type="text"
                    value={formData.request_no}
                    onChange={(e) => setFormData({ ...formData, request_no: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', fontWeight: 700, color: '#1e40af' }}
                  />
                </td>
                <td style={{ width: '50%' }}>
                  <div className="cert-label">Engineer Name:</div>
                  <input
                    type="text"
                    value={formData.engineer_name}
                    onChange={(e) => setFormData({ ...formData, engineer_name: e.target.value })}
                    placeholder="Enter visiting engineer name"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
              </tr>

              {/* Customer Name */}
              <tr>
                <td colSpan="2">
                  <div className="cert-label">Customer Name:</div>
                  <input
                    type="text"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', fontWeight: 600 }}
                  />
                </td>
              </tr>

              {/* Site Address */}
              <tr>
                <td colSpan="2">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div className="cert-label">Site Address:</div>
                    {client?.sites && client.sites.length > 0 && (
                      <div className="no-print" style={{ fontSize: '0.74rem' }}>
                        <span>Quick Select Site: </span>
                        <select
                          value={formData.site_id}
                          onChange={(e) => handleSiteChange(e.target.value)}
                          style={{ padding: '2px 4px', fontSize: '0.74rem' }}
                        >
                          <option value="">-- Choose Registered Site --</option>
                          {client.sites.map(s => (
                            <option key={s.id} value={s.id}>{s.siteName} ({s.city || 'Site'})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={formData.site_address}
                    onChange={(e) => setFormData({ ...formData, site_address: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
              </tr>

              {/* Installation Date, Warranty, AMC */}
              <tr>
                <td>
                  <div className="cert-label">Date of Installation:</div>
                  <input
                    type="date"
                    value={formData.installation_date}
                    onChange={(e) => setFormData({ ...formData, installation_date: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '2rem' }}>
                    <div>
                      <div className="cert-label">Warranty:</div>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: 3 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="warranty_status"
                            checked={formData.warranty_status === 'Yes'}
                            onChange={() => setFormData({ ...formData, warranty_status: 'Yes' })}
                          /> Yes
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="warranty_status"
                            checked={formData.warranty_status === 'No'}
                            onChange={() => setFormData({ ...formData, warranty_status: 'No' })}
                          /> No
                        </label>
                      </div>
                    </div>
                    <div>
                      <div className="cert-label">AMC Contract:</div>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: 3 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="amc_status"
                            checked={formData.amc_status === 'Yes'}
                            onChange={() => setFormData({ ...formData, amc_status: 'Yes' })}
                          /> Yes
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="amc_status"
                            checked={formData.amc_status === 'No'}
                            onChange={() => setFormData({ ...formData, amc_status: 'No' })}
                          /> No
                        </label>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>

              {/* Complaint & Rectification Timestamps */}
              <tr>
                <td>
                  <div className="cert-label">Complaint Date and Time:</div>
                  <input
                    type="text"
                    value={formData.complaint_date_time}
                    onChange={(e) => setFormData({ ...formData, complaint_date_time: e.target.value })}
                    placeholder="DD-MM-YYYY HH:MM"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
                <td>
                  <div className="cert-label">Rectification Date & Time:</div>
                  <input
                    type="text"
                    value={formData.rectification_date_time}
                    onChange={(e) => setFormData({ ...formData, rectification_date_time: e.target.value })}
                    placeholder="DD-MM-YYYY HH:MM"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
              </tr>

              {/* Outdoor & Indoor Units */}
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan="2">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>Refrigeration Machinery Details:</span>
                    {client?.equipment && client.equipment.length > 0 && (
                      <div className="no-print" style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: '#0284c7' }}>⚡ Auto-Fill from Installed Machinery:</span>
                        <select
                          onChange={(e) => handleEquipmentSelect(e.target.value)}
                          style={{ padding: '2px 6px', fontSize: '0.76rem', fontWeight: 600, borderColor: '#7dd3fc', borderRadius: 4, background: '#fff' }}
                        >
                          <option value="">-- Choose Installed Machine --</option>
                          {client.equipment.map(eq => (
                            <option key={eq.id} value={eq.id}>
                              {eq.modelNumber || 'Refrig Machine'} (S/N: {eq.serialNumber || 'N/A'}{eq.siteName ? ` @ ${eq.siteName}` : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              <tr style={{ background: '#f1f5f9' }}>
                <td style={{ fontWeight: 700, color: '#1e3a8a' }}>Outdoor Unit:</td>
                <td style={{ fontWeight: 700, color: '#0369a1' }}>Indoor Unit:</td>
              </tr>
              <tr>
                <td>
                  <div className="cert-label">Model No:</div>
                  <input
                    type="text"
                    value={formData.outdoor_model_no}
                    onChange={(e) => setFormData({ ...formData, outdoor_model_no: e.target.value })}
                    placeholder="e.g. ZEAS / Scroll Condensing Unit"
                    style={{ width: '100%', padding: '4px 6px', marginBottom: 4 }}
                  />
                  <div className="cert-label">Serial No:</div>
                  <input
                    type="text"
                    value={formData.outdoor_serial_no}
                    onChange={(e) => setFormData({ ...formData, outdoor_serial_no: e.target.value })}
                    placeholder="Outdoor S/N"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
                <td>
                  <div className="cert-label">Model No:</div>
                  <input
                    type="text"
                    value={formData.indoor_model_no}
                    onChange={(e) => setFormData({ ...formData, indoor_model_no: e.target.value })}
                    placeholder="e.g. DX Evaporator Unit"
                    style={{ width: '100%', padding: '4px 6px', marginBottom: 4 }}
                  />
                  <div className="cert-label">Serial No:</div>
                  <input
                    type="text"
                    value={formData.indoor_serial_no}
                    onChange={(e) => setFormData({ ...formData, indoor_serial_no: e.target.value })}
                    placeholder="Indoor S/N"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
              </tr>

              {/* Cause of Claim */}
              <tr>
                <td colSpan="2">
                  <div className="cert-label">Cause of Claim:</div>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: 4 }}>
                    {['Manufacturing', 'Installation', 'Operational', 'Others'].map((cause, idx) => (
                      <label key={cause} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="cause_of_claim"
                          checked={formData.cause_of_claim === cause}
                          onChange={() => setFormData({ ...formData, cause_of_claim: cause })}
                        />
                        <span>{idx + 1}. {cause}</span>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>

              {/* Problem Reported & Observation */}
              <tr>
                <td>
                  <div className="cert-label">Problem Reported by Customer:</div>
                  <textarea
                    rows={3}
                    value={formData.problem_reported}
                    onChange={(e) => setFormData({ ...formData, problem_reported: e.target.value })}
                    placeholder="e.g. Room not achieving setpoint, high discharge temp error, fan noise"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
                <td>
                  <div className="cert-label">Observation / Root Cause Analysis:</div>
                  <textarea
                    rows={3}
                    value={formData.root_cause_analysis}
                    onChange={(e) => setFormData({ ...formData, root_cause_analysis: e.target.value })}
                    placeholder="e.g. Suction pressure low, expansion valve orifice partially clogged, low gas"
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
              </tr>

              {/* Correction Work Carried Out */}
              <tr>
                <td colSpan="2">
                  <div className="cert-label">Correction Work Carried out:</div>
                  <textarea
                    rows={3}
                    value={formData.correction_work}
                    onChange={(e) => setFormData({ ...formData, correction_work: e.target.value })}
                    placeholder="e.g. Cleaned coil and filter, cleared orifice, brazed flare leak, pressure tested with nitrogen, pulled vacuum to 500 microns and recharged refrigerant."
                    style={{ width: '100%', padding: '4px 6px' }}
                  />
                </td>
              </tr>

              {/* Parts & Consumables Used */}
              <tr>
                <td colSpan="2">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div className="cert-label">Parts / Consumables Used:</div>
                    <button
                      type="button"
                      onClick={addPartRow}
                      className="no-print btn btn-secondary"
                      style={{ fontSize: '0.72rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <Plus size={13} /> Add Part
                    </button>
                  </div>
                  {formData.parts_used.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>
                      No replacement parts used (Labor & inspection only).
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', fontSize: '0.74rem' }}>
                          <th style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'left' }}>#</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'left' }}>Part Description</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'center', width: 60 }}>Qty</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'right', width: 90 }}>Rate (₹)</th>
                          <th style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'right', width: 100 }}>Total</th>
                          <th className="no-print" style={{ border: '1px solid #cbd5e1', width: 30 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.parts_used.map((part, pIdx) => {
                          const total = (Number(part.qty) || 0) * (Number(part.unitPrice) || 0);
                          return (
                            <tr key={part.id || pIdx} style={{ fontSize: '0.78rem' }}>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 6px' }}>{pIdx + 1})</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 6px' }}>
                                <input
                                  type="text"
                                  value={part.description}
                                  onChange={(e) => updatePartRow(pIdx, 'description', e.target.value)}
                                  placeholder="e.g. Expansion Valve TIE-SW / Contactor 25A"
                                  style={{ width: '100%', padding: '2px 4px', border: '1px solid #e2e8f0' }}
                                />
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  value={part.qty}
                                  min="1"
                                  onChange={(e) => updatePartRow(pIdx, 'qty', e.target.value)}
                                  style={{ width: '100%', textAlign: 'center', padding: '2px' }}
                                />
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'right' }}>
                                <input
                                  type="number"
                                  value={part.unitPrice}
                                  onChange={(e) => updatePartRow(pIdx, 'unitPrice', e.target.value)}
                                  style={{ width: '100%', textAlign: 'right', padding: '2px' }}
                                />
                              </td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>
                                ₹{total.toFixed(2)}
                              </td>
                              <td className="no-print" style={{ border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => removePartRow(pIdx)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>

              {/* Refrigerant Requirement */}
              <tr>
                <td colSpan="2">
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cert-label" style={{ margin: 0 }}>Requirement of Refrigerant:</span>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="refrigerant_required"
                          checked={formData.refrigerant_required === 'Yes'}
                          onChange={() => setFormData({ ...formData, refrigerant_required: 'Yes' })}
                        /> Yes
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="refrigerant_required"
                          checked={formData.refrigerant_required === 'No'}
                          onChange={() => setFormData({ ...formData, refrigerant_required: 'No' })}
                        /> No
                      </label>
                    </div>

                    {formData.refrigerant_required === 'Yes' && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="cert-label" style={{ margin: 0 }}>REFRIGERANT TYPE:</span>
                          <select
                            value={formData.refrigerant_type}
                            onChange={(e) => setFormData({ ...formData, refrigerant_type: e.target.value })}
                            style={{ padding: '2px 6px', fontWeight: 600 }}
                          >
                            <option value="R404A">R404A</option>
                            <option value="R22">R22</option>
                            <option value="R134a">R134a</option>
                            <option value="R410A">R410A</option>
                            <option value="R32">R32</option>
                            <option value="R407C">R407C</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="cert-label" style={{ margin: 0 }}>QUANTITY:</span>
                          <input
                            type="text"
                            value={formData.refrigerant_qty}
                            onChange={(e) => setFormData({ ...formData, refrigerant_qty: e.target.value })}
                            placeholder="e.g. 2.5"
                            style={{ width: 60, padding: '2px 4px', textAlign: 'center' }}
                          />
                          <span>Kg</span>
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>

              {/* Signatures & Rating Block */}
              <tr>
                <td style={{ width: '50%', height: 110 }}>
                  <div className="cert-label">Authorised Dealers Signature & STAMP:</div>
                  <div style={{ marginTop: '2.5rem', borderTop: '1px dashed #94a3b8', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                    <span>Dealer Signature & STAMP</span>
                    <span>Date: <strong>{new Date().toISOString().split('T')[0]}</strong></span>
                  </div>
                </td>
                <td style={{ width: '50%' }}>
                  <div className="cert-label">Customer Impression about Service:</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 6 }}>
                    (Please rate on scale of 1 poor, 2, 3, 4 & 5 excellent)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.76rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>• How is behaviour of visited engineer?</span>
                      {renderStars(formData.rating_behaviour, (val) => setFormData({ ...formData, rating_behaviour: val }))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>• What is the level of your SATISFACTION?</span>
                      {renderStars(formData.rating_satisfaction, (val) => setFormData({ ...formData, rating_satisfaction: val }))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>• How is the explanation by Engineer?</span>
                      {renderStars(formData.rating_explanation, (val) => setFormData({ ...formData, rating_explanation: val }))}
                    </div>
                  </div>
                </td>
              </tr>

              {/* Customer Remarks */}
              <tr>
                <td colSpan="2" style={{ height: 90 }}>
                  <div className="cert-label">Customers Remarks:</div>
                  <input
                    type="text"
                    value={formData.customer_remarks}
                    onChange={(e) => setFormData({ ...formData, customer_remarks: e.target.value })}
                    placeholder="Customer feedback / sign-off notes"
                    style={{ width: '100%', padding: '4px 6px', marginBottom: '1.5rem' }}
                  />
                  <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                    <span>Customer Signature & STAMP</span>
                    <span>Date: <strong>{new Date().toISOString().split('T')[0]}</strong></span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Modal Actions Footer */}
        <div className="no-print" style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          background: 'var(--bg-secondary, #f8fafc)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Labor / Service Charge (for invoice):</span>
            <input
              type="number"
              value={formData.labor_charge}
              onChange={(e) => setFormData({ ...formData, labor_charge: e.target.value })}
              placeholder="Labor ₹"
              style={{ width: 90, padding: '3px 6px', fontSize: '0.82rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrint}
              title="Print standard Daikin Service Completion Certificate"
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Printer size={15} /> Print Certificate
            </button>

            {onConvertToInvoice && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleConvertToInvoice}
                title="1-click convert used parts & service charge into a GST Invoice"
                style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: 4, color: '#0284c7', borderColor: '#7dd3fc' }}
              >
                <Zap size={15} /> Convert to GST Invoice
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
              style={{ fontSize: '0.82rem', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
            >
              <CheckCircle2 size={15} /> {loading ? 'Saving...' : 'Save Certificate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
