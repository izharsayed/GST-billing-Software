import { useState, useEffect, useRef, useMemo } from 'react';
import { Users, Search, FileText, ChevronDown, ChevronUp, Trash2, X, MessageCircle, Mail, Plus, Edit3, Copy, Upload, Download, Wrench, MapPin, Zap, Paperclip, Eye, Folder, Image, File, Printer } from 'lucide-react';
import HelpButton from './HelpButton';
import { getAllClients, getAllBills, deleteClient, saveClient, deleteBill, saveBill, getProfile, deleteReceipt, applyStockChanges, trashSavedPdf, getAllServiceCertificates, getAllCommissioningReports } from '../store';
import ServiceCertificateModal from './ServiceCertificateModal';
import ColdStorageCommissioningModal from './ColdStorageCommissioningModal';
import TechnoCommercialProposalModal from './quotation/TechnoCommercialProposalModal';
import PrintPreviewModal from './PrintPreviewModal';
import { formatCurrency, INVOICE_TYPES, markPaidPatch, markUnpaidPatch, salesSign, countsAsSales, isCancelledBill, amountDue, localToday, parseLocalDate, appliedStock, stockDelta } from '../utils';
import { getPrintSettings } from '../utils/printSettings';
import { openWhatsAppShare } from '../utils/share';
import { confirmAction } from './ConfirmModal';
import { toast } from './Toast';

// v1.10.31 — UI-C3: Shared helper to resolve the user's accent color as an
// RGB tuple usable with jsPDF setFillColor / setDrawColor. Falls back to the
// legacy blue (#1e40af = rgb(30, 64, 175)) when the user hasn't customised.
function getAccentRGB() {
  try {
    const ps = getPrintSettings();
    if (ps.userColorsEnabled && ps.pdfAccent) {
      const hex = String(ps.pdfAccent).replace('#', '');
      if (/^[0-9a-f]{6}$/i.test(hex)) {
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      }
    }
  } catch { /* ignore — fall through to default */ }
  return [30, 64, 175];
}
import ClientModal from './ClientModal';

const STATUS_COLORS = {
  unpaid: { label: 'Unpaid', color: '#f59e0b', bg: '#fffbeb' },
  partial: { label: 'Partial', color: '#8b5cf6', bg: '#f5f3ff' },
  paid: { label: 'Paid', color: '#059669', bg: '#ecfdf5' },
  overdue: { label: 'Overdue', color: '#dc2626', bg: '#fef2f2' },
  // v1.10.74 - shown (read-only) on cancelled bills. Cancel / undo from the
  // Dashboard, which also puts the stock back.
  cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
};

export default function ClientsView({ onEdit, onDuplicate, onNew, onConvert, onPrint }) {
  const [clients, setClients] = useState([]);
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('clients'); // 'clients' | 'equipment'
  const [expandedClient, setExpandedClient] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [modalClient, setModalClient] = useState(null);
  const [editingClientId, setEditingClientId] = useState(null);
  const [profileCountry, setProfileCountry] = useState('');
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceClient, setServiceClient] = useState(null);
  const [serviceEquipment, setServiceEquipment] = useState(null);
  const [viewingCertificate, setViewingCertificate] = useState(null);
  const [allCertificates, setAllCertificates] = useState([]);
  const [commissioningModalOpen, setCommissioningModalOpen] = useState(false);
  const [commissioningClient, setCommissioningClient] = useState(null);
  const [selectedCommissioningReport, setSelectedCommissioningReport] = useState(null);
  const [allCommissioningReports, setAllCommissioningReports] = useState([]);
  const [proposalQuotation, setProposalQuotation] = useState(null);
  const [targetBillForProposal, setTargetBillForProposal] = useState(null);
  const [clientDocTabs, setClientDocTabs] = useState({});
  const [filePreviewModal, setFilePreviewModal] = useState(null);
  const [viewBill, setViewBill] = useState(null);
  const [uploadModalClient, setUploadModalClient] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('PO');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fileCategoryFilter, setFileCategoryFilter] = useState('all');
  const fileUploadInputRef = useRef(null);

  const VAULT_CATEGORIES = [
    { id: 'all', label: 'All Files', icon: '📁' },
    { id: 'Invoice', label: 'Tax Invoices', icon: '🧾', color: '#059669', bg: '#ecfdf5' },
    { id: 'Quotation', label: 'Quotations & Proposals', icon: '📄', color: '#0284c7', bg: '#e0f2fe' },
    { id: 'Proforma', label: 'Proformas & Challans', icon: '🚚', color: '#ea580c', bg: '#ffedd5' },
    { id: 'ServiceCert', label: 'Service Certificates', icon: '🛠️', color: '#0284c7', bg: '#e0f2fe' },
    { id: 'PO', label: 'Purchase Orders', icon: '📋', color: '#15803d', bg: '#dcfce7' },
    { id: 'Drawing', label: 'Site Layout & CAD', icon: '📐', color: '#0369a1', bg: '#e0f2fe' },
    { id: 'GST', label: 'GST Certificates', icon: '📑', color: '#7c3aed', bg: '#ede9fe' },
    { id: 'Agreement', label: 'Contracts & AMC', icon: '🤝', color: '#b45309', bg: '#fef3c7' },
    { id: 'Photo', label: 'Site Survey & Photos', icon: '📸', color: '#0891b2', bg: '#cffafe' },
    { id: 'General', label: 'Other Documents', icon: '📄', color: '#475569', bg: '#f1f5f9' },
  ];

  const FILE_CATEGORIES = [
    { id: 'PO', label: 'Purchase Order (PO)', icon: '📋', color: '#15803d', bg: '#dcfce7' },
    { id: 'Drawing', label: 'Site Layout & CAD', icon: '📐', color: '#0369a1', bg: '#e0f2fe' },
    { id: 'GST', label: 'GST Certificate', icon: '📑', color: '#7c3aed', bg: '#ede9fe' },
    { id: 'Agreement', label: 'Contract / AMC', icon: '🤝', color: '#b45309', bg: '#fef3c7' },
    { id: 'Photo', label: 'Site Survey & Photos', icon: '📸', color: '#0891b2', bg: '#cffafe' },
    { id: 'General', label: 'General Document', icon: '📄', color: '#475569', bg: '#f1f5f9' },
  ];

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleDownloadFile = (file) => {
    if (!file?.dataUrl) {
      toast('File data is not available for download', 'error');
      return;
    }
    const link = document.createElement('a');
    link.href = file.dataUrl;
    link.download = file.name || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteFile = async (clientName, savedClient, fileId) => {
    const confirmed = await confirmAction({
      title: 'Delete Attached File',
      message: 'Are you sure you want to delete this attached file? This cannot be undone.',
      confirmText: 'Delete File',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const currentFiles = savedClient?.files || [];
      const updatedFiles = currentFiles.filter(f => f.id !== fileId);
      const updatedClient = {
        ...(savedClient || { name: clientName }),
        files: updatedFiles,
      };
      await saveClient(updatedClient);
      toast('File deleted successfully', 'info');
      loadData();
      if (filePreviewModal?.id === fileId) {
        setFilePreviewModal(null);
      }
    } catch (err) {
      console.error(err);
      toast('Failed to delete file', 'error');
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadFileObj) {
      toast('Please choose a file to upload', 'warning');
      return;
    }
    if (!uploadModalClient) return;

    if (uploadFileObj.size > 45 * 1024 * 1024) {
      toast('File size exceeds the 45MB limit', 'warning');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUrl = e.target.result;
          const newFile = {
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: uploadFileObj.name,
            size: uploadFileObj.size,
            type: uploadFileObj.type || 'application/octet-stream',
            category: uploadCategory || 'General',
            notes: uploadNotes.trim(),
            uploadedAt: new Date().toISOString(),
            dataUrl: dataUrl,
          };

          const targetClient = uploadModalClient.savedClient || { name: uploadModalClient.clientName };
          const updatedClient = {
            ...targetClient,
            files: [...(targetClient.files || []), newFile],
          };

          await saveClient(updatedClient);
          toast(`File "${uploadFileObj.name}" attached successfully!`, 'success');
          setUploadModalClient(null);
          setUploadFileObj(null);
          setUploadNotes('');
          setUploadCategory('PO');
          loadData();
        } catch (err) {
          console.error(err);
          toast('Failed to save attached file', 'error');
        } finally {
          setUploading(false);
        }
      };
      reader.onerror = () => {
        toast('Failed to read file from disk', 'error');
        setUploading(false);
      };
      reader.readAsDataURL(uploadFileObj);
    } catch (err) {
      console.error(err);
      toast('Error preparing file upload', 'error');
      setUploading(false);
    }
  };

  const handleOpenProposal = (bill) => {
    if (!bill) return;
    const data = bill.data || {};
    const clientObj = data.client || bill.client || clients.find(c => c.name === bill.clientName) || { name: bill.clientName };
    const items = data.items || [];
    const mappedItems = items.length > 0 ? items.map(it => ({
      description: it.name || it.description || '',
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'Nos',
      unit_price: Number(it.rate) || 0,
      total_amount: it.total != null ? Number(it.total) : ((Number(it.quantity) || 1) * (Number(it.rate) || 0)),
    })) : [
      {
        description: bill.invoiceNumber ? `Quotation ${bill.invoiceNumber}` : 'Industrial Refrigeration Equipment & Cold Room Supply',
        quantity: 1,
        unit: 'Set',
        unit_price: Number(bill.totalAmount) || 0,
        total_amount: Number(bill.totalAmount) || 0,
      }
    ];

    const technicalSpecs = data.technicalSpecs || null;

    const payload = {
      id: bill.id || data.details?.invoiceNumber || 'proposal',
      quotation_number: bill.invoiceNumber || data.details?.invoiceNumber || 'CER/CR-DRAFT',
      quotation_date: bill.invoiceDate || data.details?.invoiceDate || new Date().toISOString().split('T')[0],
      customer_name: clientObj.name || bill.clientName || 'Valued Customer',
      company_name: clientObj.companyName || '',
      customer_phone: clientObj.phone || '',
      customer_gstin: clientObj.gstin || '',
      site_name: data.details?.shippingAddress || data.details?.placeOfSupply || 'Site Facility',
      site_address: data.details?.shippingAddress || clientObj.address || '',
      site_contact: clientObj.name || '',
      equipment_subtotal: Number(data.totals?.subtotal) || Number(bill.totalAmount) || 0,
      charges_subtotal: 0,
      tax_amount: Number(data.totals?.totalTaxAmount ?? data.totals?.taxAmount ?? (data.totals?.cgst || 0) + (data.totals?.sgst || 0) + (data.totals?.igst || 0)) || (Number(bill.totalTaxAmount) || 0),
      total_amount: Number(bill.totalAmount) || Number(data.totals?.total) || 0,
      items: mappedItems,
      technicalInputs: technicalSpecs ? {
        ...technicalSpecs,
        application_type: technicalSpecs.application,
        application: technicalSpecs.application,
        target_temp_c: technicalSpecs.targetTemp !== undefined ? technicalSpecs.targetTemp : technicalSpecs.temperatures?.roomTempC,
        ambient_temp_c: technicalSpecs.ambientTemp !== undefined ? technicalSpecs.ambientTemp : technicalSpecs.temperatures?.ambientTempC,
        length_ft: technicalSpecs.dimensions?.lengthFt || (technicalSpecs.unit === 'm' ? Math.round(Number(technicalSpecs.length) * 3.28084) : (Number(technicalSpecs.length) || null)),
        width_ft: technicalSpecs.dimensions?.widthFt || (technicalSpecs.unit === 'm' ? Math.round(Number(technicalSpecs.width) * 3.28084) : (Number(technicalSpecs.width) || null)),
        height_ft: technicalSpecs.dimensions?.heightFt || (technicalSpecs.unit === 'm' ? Math.round(Number(technicalSpecs.height) * 3.28084) : (Number(technicalSpecs.height) || null)),
        length_m: technicalSpecs.dimensions?.lengthM || (technicalSpecs.unit === 'm' ? Number(technicalSpecs.length) : null),
        width_m: technicalSpecs.dimensions?.widthM || (technicalSpecs.unit === 'm' ? Number(technicalSpecs.width) : null),
        height_m: technicalSpecs.dimensions?.heightM || (technicalSpecs.unit === 'm' ? Number(technicalSpecs.height) : null),
        calculated_load_kw: technicalSpecs.estimatedLoadKw ?? technicalSpecs.machineRating?.capacityKw,
        calculated_load_tr: technicalSpecs.capacityTr ?? technicalSpecs.machineRating?.capacityTr,
        calculated_load_btu: technicalSpecs.machineRating?.capacityBtuHr,
      } : null,
      modelRecommendation: technicalSpecs ? {
        catalogue_ref: technicalSpecs.cdu?.model_number || (typeof technicalSpecs.cdu === 'string' ? technicalSpecs.cdu : ''),
        cdu: technicalSpecs.cdu,
        evaporator: technicalSpecs.evaporator,
        expansionValve: technicalSpecs.expansionValve,
        orifice: technicalSpecs.orifice,
        solenoidValve: technicalSpecs.solenoidValve,
        controller: technicalSpecs.controller,
      } : null,
      proposal_data: data.proposalData || null,
    };

    setTargetBillForProposal(bill);
    setProposalQuotation(payload);
  };

  const handleProposalSaved = async (updatedProposalData) => {
    if (targetBillForProposal) {
      try {
        const updatedBill = {
          ...targetBillForProposal,
          data: {
            ...targetBillForProposal.data,
            proposalData: updatedProposalData,
          }
        };
        await saveBill(updatedBill, { overwrite: true });
        toast('5-Page Proposal customisations saved successfully', 'success');
        loadData();
      } catch (err) {
        console.error(err);
        toast('Failed to save proposal data', 'error');
      }
    }
  };

  const renderServiceCertificatesTable = (clientCerts, clientName, savedClient, showHeader = true) => (
    <div style={{ padding: '0.85rem 1.5rem', borderTop: showHeader ? '1px solid var(--border)' : 'none', background: 'var(--bg-secondary, #f8fafc)' }}>
      {showHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: clientCerts.length > 0 ? '0.6rem' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wrench size={15} style={{ color: '#0284c7' }} />
            <span style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-color)' }}>
              Service Completion Certificates ({clientCerts.length})
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.74rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#0369a1', borderColor: '#7dd3fc', fontWeight: 600 }}
            onClick={() => openServiceModal(savedClient || { name: clientName })}
          >
            <Plus size={13} /> New Certificate
          </button>
        </div>
      )}

      {clientCerts.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: showHeader ? '0.4rem' : 0 }}>
          <table className="data-table" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Request No</th>
                <th>Equipment / Model</th>
                <th>Site / Location</th>
                <th>Engineer</th>
                <th>Problem / Correction</th>
                <th>Rating</th>
                <th className="col-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientCerts.map(cert => (
                <tr key={cert.id}>
                  <td className="text-muted">{cert.rectification_date_time?.split(' ')[0] || cert.created_at?.split('T')[0] || '—'}</td>
                  <td><span className="invoice-badge" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>{cert.request_no}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{cert.outdoor_model_no || cert.indoor_model_no || 'Refrigeration Machine'}</div>
                    {(cert.outdoor_serial_no || cert.indoor_serial_no) && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>S/N: {cert.outdoor_serial_no || cert.indoor_serial_no}</div>
                    )}
                  </td>
                  <td>{cert.site_name || (cert.site_address ? cert.site_address.slice(0, 22) + '...' : '—')}</td>
                  <td>{cert.engineer_name || '—'}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cert.correction_work || cert.problem_reported}>
                    {cert.correction_work || cert.problem_reported || '—'}
                  </td>
                  <td>
                    <span title={`Customer Rating: ${cert.rating_satisfaction || 5}/5`}>
                      {'⭐'.repeat(Math.max(1, Math.min(5, Number(cert.rating_satisfaction) || 5)))}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions" style={{ justifyContent: 'center' }}>
                      <button
                        className="icon-btn icon-btn-blue"
                        title="View / Print Certificate"
                        onClick={() => openServiceModal(savedClient || { name: clientName }, null, cert)}
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        className="icon-btn icon-btn-blue"
                        title="Convert to GST Invoice"
                        onClick={() => openServiceModal(savedClient || { name: clientName }, null, cert)}
                      >
                        <Zap size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>No service completion certificates for this client yet.</p>
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={() => openServiceModal(savedClient || { name: clientName })}
          >
            <Plus size={14} /> Create Service Certificate
          </button>
        </div>
      )}
    </div>
  );

  const renderFilesSection = (clientFiles, clientName, savedClient, showHeader = true) => {
    const files = clientFiles || [];
    const filteredFiles = fileCategoryFilter === 'all'
      ? files
      : files.filter(f => f.category === fileCategoryFilter);

    return (
      <div style={{ padding: '0.85rem 1.5rem', borderTop: showHeader ? '1px solid var(--border)' : 'none', background: 'var(--bg-secondary, #f8fafc)' }}>
        {showHeader && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: files.length > 0 ? '0.75rem' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Folder size={16} style={{ color: '#0284c7' }} />
              <span style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-color)' }}>
                Client Document Vault & Attachments ({files.length})
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.74rem', padding: '0.28rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() => {
                setUploadModalClient({ clientName, savedClient });
                setUploadCategory('PO');
                setUploadNotes('');
                setUploadFileObj(null);
              }}
            >
              <Upload size={13} /> Attach File
            </button>
          </div>
        )}

        {files.length > 0 ? (
          <>
            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                className={`btn ${fileCategoryFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.72rem', padding: '0.18rem 0.55rem', borderRadius: '15px' }}
                onClick={() => setFileCategoryFilter('all')}
              >
                All Files ({files.length})
              </button>
              {VAULT_CATEGORIES.filter(c => c.id !== 'all').map(cat => {
                const count = files.filter(f => f.category === cat.id).length;
                if (count === 0) return null;
                const active = fileCategoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.72rem', padding: '0.18rem 0.55rem', borderRadius: '15px' }}
                    onClick={() => setFileCategoryFilter(cat.id)}
                  >
                    {cat.icon} {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            {filteredFiles.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>No files match the selected category filter.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {filteredFiles.map(file => {
                  const catMeta = VAULT_CATEGORIES.find(c => c.id === file.category)
                    || FILE_CATEGORIES.find(c => c.id === file.category)
                    || { label: file.category || 'Document', icon: '📄', color: '#475569', bg: '#f1f5f9' };
                  const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
                  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || file.isGenerated;

                  return (
                    <div
                      key={file.id}
                      style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                        {isImage && file.dataUrl ? (
                          <div
                            onClick={() => setFilePreviewModal(file)}
                            style={{ width: '46px', height: '46px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: '1px solid var(--border)', background: '#f8fafc' }}
                            title="Click to preview image"
                          >
                            <img src={file.dataUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              if (file.isGenerated && file.rawBill) {
                                if (file.rawBill.data) {
                                  setViewBill(file.rawBill);
                                } else if (onPrint) {
                                  onPrint(file.rawBill);
                                } else {
                                  onEdit(file.rawBill);
                                }
                              } else if (file.isGenerated && file.rawCert) {
                                openServiceModal(savedClient || { name: clientName }, null, file.rawCert);
                              } else if (file.isGenerated && file.rawReport) {
                                openCommissioningModal(savedClient || { name: clientName }, file.rawReport);
                              } else {
                                setFilePreviewModal(file);
                              }
                            }}
                            style={{
                              width: '46px',
                              height: '46px',
                              borderRadius: '6px',
                              background: isPdf ? '#fee2e2' : catMeta.bg,
                              color: isPdf ? '#dc2626' : catMeta.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                            title="Click to preview file"
                          >
                            {isPdf ? <FileText size={22} /> : <File size={22} />}
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            onClick={() => {
                              if (file.isGenerated && file.rawBill) {
                                if (file.rawBill.data) {
                                  setViewBill(file.rawBill);
                                } else if (onPrint) {
                                  onPrint(file.rawBill);
                                } else {
                                  onEdit(file.rawBill);
                                }
                              } else if (file.isGenerated && file.rawCert) {
                                openServiceModal(savedClient || { name: clientName }, null, file.rawCert);
                              } else if (file.isGenerated && file.rawReport) {
                                openCommissioningModal(savedClient || { name: clientName }, file.rawReport);
                              } else {
                                setFilePreviewModal(file);
                              }
                            }}
                            style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                            title={file.name}
                          >
                            {file.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: catMeta.bg, color: catMeta.color }}>
                              {catMeta.icon} {catMeta.label}
                            </span>
                            {file.isGenerated ? (
                              <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#0284c7', border: '1px solid #bae6fd' }}>
                                ⚡ Auto-Stored
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {formatFileSize(file.size)}
                              </span>
                            )}
                          </div>
                          {file.notes && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.notes}>
                              💬 {file.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <span>{file.uploadedAt ? (file.uploadedAt.includes('T') ? new Date(file.uploadedAt).toLocaleDateString('en-IN') : file.uploadedAt) : 'Attached'}</span>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {file.isGenerated ? (
                            <>
                              {file.rawBill && (
                                <>
                                  {file.isProposalEligible && (
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      style={{ color: '#0369a1', background: '#e0f2fe', borderColor: '#7dd3fc', padding: '3px' }}
                                      onClick={() => handleOpenProposal(file.rawBill)}
                                      title="Open 5-Page Techno-Commercial Project Proposal"
                                      aria-label="5-Page Proposal"
                                    >
                                      <FileText size={13} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="icon-btn icon-btn-blue"
                                    style={{ padding: '3px' }}
                                    onClick={() => {
                                      if (file.rawBill.data) {
                                        setViewBill(file.rawBill);
                                      } else if (onPrint) {
                                        onPrint(file.rawBill);
                                      } else {
                                        onEdit(file.rawBill);
                                      }
                                    }}
                                    title="View Document"
                                    aria-label="View Document"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  {onPrint && (
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      style={{ padding: '3px', color: '#475569' }}
                                      onClick={() => onPrint(file.rawBill)}
                                      title="Print Document"
                                      aria-label="Print Document"
                                    >
                                      <Printer size={13} />
                                    </button>
                                  )}
                                  {onConvert && ['quotation', 'proforma', 'delivery-challan'].includes(file.rawBill.invoiceType) && !file.rawBill.convertedTo && (
                                    <button
                                      type="button"
                                      className="icon-btn icon-btn-green"
                                      style={{ padding: '3px' }}
                                      onClick={() => onConvert(file.rawBill)}
                                      title="Convert to Tax Invoice"
                                      aria-label="Convert to Tax Invoice"
                                    >
                                      <Zap size={13} />
                                    </button>
                                  )}
                                  {file.rawBill.data && (
                                    <button
                                      type="button"
                                      className="icon-btn icon-btn-blue"
                                      style={{ padding: '3px' }}
                                      onClick={() => onEdit(file.rawBill)}
                                      title="Edit Document"
                                      aria-label="Edit Document"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                  )}
                                </>
                              )}
                              {file.rawCert && (
                                <>
                                  <button
                                    type="button"
                                    className="icon-btn icon-btn-blue"
                                    style={{ padding: '3px' }}
                                    onClick={() => openServiceModal(savedClient || { name: clientName }, null, file.rawCert)}
                                    title="View / Print Certificate"
                                    aria-label="View Certificate"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn icon-btn-blue"
                                    style={{ padding: '3px' }}
                                    onClick={() => openServiceModal(savedClient || { name: clientName }, null, file.rawCert)}
                                    title="Convert to GST Invoice"
                                    aria-label="Convert to Invoice"
                                  >
                                    <Zap size={13} />
                                  </button>
                                </>
                              )}
                              {file.rawReport && (
                                <>
                                  <button
                                    type="button"
                                    className="icon-btn icon-btn-blue"
                                    style={{ padding: '3px' }}
                                    onClick={() => openCommissioningModal(savedClient || { name: clientName }, file.rawReport)}
                                    title="View / Print Commissioning Report (CSH-1, CSH-2, BOQ)"
                                    aria-label="View Commissioning Report"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    style={{ padding: '3px', color: '#0284c7' }}
                                    onClick={() => openCommissioningModal(savedClient || { name: clientName }, file.rawReport)}
                                    title="Edit Commissioning Report"
                                    aria-label="Edit Commissioning Report"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="icon-btn icon-btn-blue"
                                style={{ padding: '3px' }}
                                onClick={() => setFilePreviewModal(file)}
                                title="Preview Document"
                                aria-label="Preview Document"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-btn-green"
                                style={{ padding: '3px' }}
                                onClick={() => handleDownloadFile(file)}
                                title="Download File"
                                aria-label="Download File"
                              >
                                <Download size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-btn-red"
                                style={{ padding: '3px' }}
                                onClick={() => handleDeleteFile(clientName, savedClient, file.id)}
                                title="Delete File"
                                aria-label="Delete File"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '2rem 1.5rem', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
            <Folder size={36} style={{ color: '#94a3b8', margin: '0 auto 0.5rem' }} />
            <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.9rem', color: 'var(--text-color)' }}>No Files Attached Yet</h4>
            <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '0.85rem', maxWidth: '380px', marginInline: 'auto' }}>
              Upload customer Purchase Orders, Site Layout drawings, GST Registration certificates, AMC contracts, or site survey photos.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() => {
                setUploadModalClient({ clientName, savedClient });
                setUploadCategory('PO');
                setUploadNotes('');
                setUploadFileObj(null);
              }}
            >
              <Upload size={14} /> Attach First File
            </button>
          </div>
        )}
      </div>
    );
  };

  const openServiceModal = (clientObj, equipmentObj = null, certObj = null) => {
    setServiceClient(clientObj);
    setServiceEquipment(equipmentObj);
    setViewingCertificate(certObj);
    setServiceModalOpen(true);
  };

  const openCommissioningModal = (clientObj, reportObj = null) => {
    setCommissioningClient(clientObj);
    setSelectedCommissioningReport(reportObj);
    setCommissioningModalOpen(true);
  };

  useEffect(() => {
    getProfile().then(p => { if (p?.country) setProfileCountry(p.country); }).catch(() => {});
  }, []);

  const loadData = async () => {
    try {
      const [c, b, certs, commReports] = await Promise.all([
        getAllClients(),
        getAllBills(),
        getAllServiceCertificates().catch(() => []),
        getAllCommissioningReports().catch(() => [])
      ]);
      setAllCertificates(Array.isArray(certs) ? certs : []);
      setAllCommissioningReports(Array.isArray(commReports) ? commReports : []);
      setClients(c);
      setBills(b);
    } catch {
      toast('Failed to load data', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Client Statement PDF — feature A from v1.6.7 audit ("#1 daily ask when
  // a client disputes a bill"). Produces a single-page account statement:
  // invoice list + credit notes + payments + running balance. Reuses the
  // profile block from InvoicePreview for the seller header so the styling
  // matches the invoice PDFs the client already knows.
  const [profileForStatement, setProfileForStatement] = useState(null);
  useEffect(() => {
    getProfile().then(setProfileForStatement).catch(() => {});
  }, []);

  const generateClientStatement = async (clientName) => {
    const clientBills = getClientBills(clientName);
    if (clientBills.length === 0) {
      toast('No invoices for this client', 'warning');
      return;
    }
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const savedClient = clients.find(c => c.name === clientName) || { name: clientName };
      const stats = getClientStats(clientName);
      const pageW = 210, marginL = 15, marginR = 195, tableW = marginR - marginL; // = 180
      // Helvetica core font can't render Rupee symbol properly — use "Rs." plaintext.
      // Numbers are formatted with Indian digit grouping (2,5,000.00 style).
      const fmt = (n) => {
        const v = Number(n) || 0;
        const abs = Math.abs(v);
        const rounded = abs.toFixed(2);
        const parts = rounded.split('.');
        // Indian grouping: last 3 digits, then groups of 2
        const intPart = parts[0];
        const last3 = intPart.slice(-3);
        const rest = intPart.slice(0, -3);
        const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
        return (v < 0 ? '-' : '') + 'Rs. ' + grouped + '.' + parts[1];
      };

      // ============== HEADER BAND ==============
      doc.setFillColor(...getAccentRGB());
      doc.rect(0, 0, pageW, 22, 'F');
      doc.setTextColor(255); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text('CLIENT STATEMENT', pageW / 2, 12, { align: 'center' });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Generated ${new Date().toLocaleDateString('en-IN')}  ·  Period: All invoices`, pageW / 2, 18, { align: 'center' });
      doc.setTextColor(0);

      let y = 30;

      // ============== FROM / TO BLOCKS (side-by-side, guaranteed non-overlap) ==============
      const colL = marginL, colR = marginL + tableW / 2 + 5;   // 15 and 100
      const colWidth = tableW / 2 - 5;                          // 85 mm each column

      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100);
      doc.text('FROM', colL, y);
      doc.text('BILL TO', colR, y);
      doc.setTextColor(0);
      y += 4;

      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(doc.splitTextToSize(profileForStatement?.businessName || '', colWidth), colL, y);
      doc.text(doc.splitTextToSize(savedClient.name || clientName, colWidth), colR, y);
      y += 5;
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');

      const sellerLines = [
        profileForStatement?.address,
        [profileForStatement?.city, profileForStatement?.state, profileForStatement?.pin].filter(Boolean).join(', '),
        profileForStatement?.gstin ? `GSTIN: ${profileForStatement.gstin}` : null,
        profileForStatement?.email,
        profileForStatement?.phone ? `Ph: ${profileForStatement.phone}` : null,
      ].filter(Boolean);
      const clientLines = [
        savedClient.contactPerson || null,
        savedClient.address,
        [savedClient.city, savedClient.state, savedClient.pin].filter(Boolean).join(', '),
        savedClient.gstin ? `GSTIN: ${savedClient.gstin}` : null,
        savedClient.email,
        savedClient.phone ? `Ph: ${savedClient.phone}` : null,
      ].filter(Boolean);

      // v1.10.31 — UI-C1 fix: `splitTextToSize` returns an ARRAY of
      // wrapped sub-lines; jsPDF draws each at line-height 4mm but the
      // outer loop only advanced `dy += 4`, so a 2-line-wrapped address
      // collided with the next logical line ("Birnagar / Bhagar" bleed
      // reported in Client Statement). Now dy advances by the actual
      // rendered line count.
      let sellerDy = 0;
      sellerLines.forEach(line => {
        const wrapped = doc.splitTextToSize(line, colWidth);
        doc.text(wrapped, colL, y + sellerDy);
        sellerDy += wrapped.length * 4;
      });
      let clientDy = 0;
      clientLines.forEach(line => {
        const wrapped = doc.splitTextToSize(line, colWidth);
        doc.text(wrapped, colR, y + clientDy);
        clientDy += wrapped.length * 4;
      });
      y += Math.max(sellerDy, clientDy) + 5;

      // ============== SUMMARY STRIP ==============
      doc.setFillColor(241, 245, 249);
      doc.rect(marginL, y, tableW, 16, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginL, y, tableW, 16, 'S');

      const cellW = tableW / 4;
      const summaryCells = [
        { label: 'Invoices', value: String(stats.count) },
        { label: 'Total Billed', value: fmt(stats.total) },
        { label: 'Paid', value: fmt(stats.paid), color: [5, 150, 105] },
        { label: 'Outstanding', value: fmt(stats.unpaid), color: stats.unpaid > 0 ? [220, 38, 38] : [5, 150, 105] },
      ];
      summaryCells.forEach((cell, i) => {
        const cx = marginL + i * cellW + cellW / 2;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
        doc.text(cell.label.toUpperCase(), cx, y + 5, { align: 'center' });
        doc.setFontSize(cell.label === 'Invoices' ? 12 : 10); doc.setFont('helvetica', 'bold');
        if (cell.color) doc.setTextColor(...cell.color); else doc.setTextColor(15, 23, 42);
        doc.text(cell.value, cx, y + 12, { align: 'center' });
      });
      doc.setTextColor(0);
      y += 22;

      // ============== LEDGER TABLE (Indian Dr/Cr convention) ==============
      // Columns follow standard Indian business-statement format:
      //   Date | Particulars (invoice # + type) | Debit | Credit | Balance
      // Debit  = amount charged to the client (increases receivable)
      // Credit = payment received / credit note (decreases receivable)
      // Balance = running Dr - Cr
      //
      // v1.10.35 — Column widths widened after a report showed "Dr"
      // suffix crowding the balance number. Prior debitEnd=140 /
      // creditEnd=168 / balanceEnd=193 left only 4mm between Credit
      // and Balance text — tight when both were 5-digit rupee amounts.
      // Now the Particulars column is trimmed by 5mm and that space is
      // distributed into Debit/Credit/Balance so each has proper breathing
      // room and long "Dr/Cr" suffixes never clip the page margin.
      const col = {
        dateEnd: 40,        // Date column: 15 to 40 (25mm — dd/mm/yyyy fits at 8.5pt)
        particEnd: 100,     // Particulars: 40 to 100 (60mm)
        debitEnd: 133,      // Debit right-aligned at 133
        creditEnd: 163,     // Credit right-aligned at 163
        balanceEnd: marginR - 2, // Balance right-aligned at 193
      };

      // Header band
      doc.setFillColor(...getAccentRGB());
      doc.rect(marginL, y, tableW, 9, 'F');
      doc.setTextColor(255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Date', marginL + 2, y + 6);
      doc.text('Particulars', col.dateEnd + 2, y + 6);
      doc.text('Debit', col.debitEnd, y + 6, { align: 'right' });
      doc.text('Credit', col.creditEnd, y + 6, { align: 'right' });
      doc.text('Balance', col.balanceEnd, y + 6, { align: 'right' });
      doc.setTextColor(0);
      y += 11;

      // Opening balance row — italic + muted, above the first real row.
      doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(80);
      doc.text('Opening Balance', col.dateEnd + 2, y);
      doc.text(fmt(0), col.balanceEnd, y, { align: 'right' });
      // v1.10.35 — thin separator so the opening line reads as a
      // distinct baseline, not as a squished header extension.
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.15);
      doc.line(marginL, y + 2, marginR, y + 2);
      doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal');
      y += 7;

      // Rows
      let runningBalance = 0;
      // Sales and credit notes only, as in the summary above: quotations,
      // proformas, challans and cancelled invoices are not owed, and listing
      // them as debits gave a closing balance that disagreed with the summary.
      const sortedBills = clientBills.filter((b) => salesSign(b) !== 0)
        .sort((a, b) => parseLocalDate(a.invoiceDate) - parseLocalDate(b.invoiceDate));

      const drawHeader = () => {
        doc.setFillColor(...getAccentRGB());
        doc.rect(marginL, y, tableW, 9, 'F');
        doc.setTextColor(255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text('Date', marginL + 2, y + 6);
        doc.text('Particulars', col.dateEnd + 2, y + 6);
        doc.text('Debit', col.debitEnd, y + 6, { align: 'right' });
        doc.text('Credit', col.creditEnd, y + 6, { align: 'right' });
        doc.text('Balance', col.balanceEnd, y + 6, { align: 'right' });
        doc.setTextColor(0);
        y += 12;   // v1.10.35 — was 11; 1mm extra so text doesn't kiss the header rectangle bottom
      };

      for (let i = 0; i < sortedBills.length; i++) {
        const bill = sortedBills[i];
        const isCreditNote = bill.invoiceType === 'credit-note';
        const amount = Number(bill.totalAmount) || 0;
        const paid = Number(bill.paidAmount) || 0;
        // Compute Dr / Cr for this row
        //   Tax invoice: Dr = amount, Cr = 0
        //   Credit note: Dr = 0, Cr = amount
        //   Then if paid amount > 0 we add ANOTHER row for the payment as Cr
        const debit = isCreditNote ? 0 : amount;
        const credit = isCreditNote ? amount : 0;

        // Page break with header repeat
        if (y > 260) { doc.addPage(); y = 20; drawHeader(); }

        // v1.10.35 — Row rendering rewrite for the reported "shows data
        // in incorrect way" screenshot:
        //   - Row height increased 6mm → 7mm so descenders don't kiss
        //     the next row and the alt-shade rectangle covers the whole
        //     row cleanly.
        //   - Alt shading Y offset fixed (was y-4, showed above the row
        //     text baseline on some renders).
        //   - Empty debit/credit cells render as a light em-dash "—"
        //     instead of a hard hyphen "-", matching the app's cell-empty
        //     convention and reducing visual noise.
        //   - The " Dr" / " Cr" suffix now uses the actual sign — was
        //     always " Dr" even for credit-side balances.
        const rowH = 7;
        if (i % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(marginL, y - rowH + 2, tableW, rowH, 'F');
        }

        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42);
        // Date
        doc.text(parseLocalDate(bill.invoiceDate).toLocaleDateString('en-IN'), marginL + 2, y);
        // Particulars: invoice # + type label
        const typeLabel = INVOICE_TYPES[bill.invoiceType]?.label || bill.invoiceType || '';
        const particulars = `${bill.invoiceNumber || ''} · ${typeLabel}`;
        const particText = doc.splitTextToSize(particulars, col.particEnd - col.dateEnd - 4);
        doc.text(particText[0] || '', col.dateEnd + 2, y);
        // Debit — em-dash placeholder for empty cells.
        if (debit > 0) {
          doc.text(fmt(debit), col.debitEnd, y, { align: 'right' });
        } else {
          doc.setTextColor(180); doc.text('—', col.debitEnd, y, { align: 'right' }); doc.setTextColor(15, 23, 42);
        }
        // Credit
        if (credit > 0) {
          doc.text(fmt(credit), col.creditEnd, y, { align: 'right' });
        } else {
          doc.setTextColor(180); doc.text('—', col.creditEnd, y, { align: 'right' }); doc.setTextColor(15, 23, 42);
        }
        // Balance — sign determines Dr / Cr suffix. Red for owing (Dr),
        // green for surplus (Cr), black for balanced.
        runningBalance += debit - credit;
        const isDr = runningBalance > 0.01;
        const isCr = runningBalance < -0.01;
        if (isDr) { doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38); }
        else if (isCr) { doc.setTextColor(5, 150, 105); }
        else { doc.setTextColor(15, 23, 42); }
        const suffix = isDr ? ' Dr' : isCr ? ' Cr' : '';
        doc.text(fmt(Math.abs(runningBalance)) + suffix, col.balanceEnd, y, { align: 'right' });
        doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal');
        y += rowH;

        // Add a follow-on row for the payment if any
        if (paid > 0.01 && !isCreditNote) {
          if (y > 265) { doc.addPage(); y = 20; drawHeader(); }
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(80);
          doc.text('   Payment recd against above', col.dateEnd + 2, y);
          doc.text(fmt(paid), col.creditEnd, y, { align: 'right' });
          runningBalance -= paid;
          const isDr2 = runningBalance > 0.01;
          const isCr2 = runningBalance < -0.01;
          if (isDr2) { doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38); }
          else if (isCr2) { doc.setFont('helvetica', 'normal'); doc.setTextColor(5, 150, 105); }
          else { doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); }
          const suffix2 = isDr2 ? ' Dr' : isCr2 ? ' Cr' : '';
          doc.text(fmt(Math.abs(runningBalance)) + suffix2, col.balanceEnd, y, { align: 'right' });
          doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal');
          y += rowH;
        }
        // TDS the client deducted: settled by their TDS deposit, not owed.
        const tds = isCreditNote ? 0 : Number(bill.data?.totals?.tdsAmount) || 0;
        if (tds > 0.01) {
          if (y > 265) { doc.addPage(); y = 20; drawHeader(); }
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(80);
          doc.text('   TDS deducted by client', col.dateEnd + 2, y);
          doc.text(fmt(tds), col.creditEnd, y, { align: 'right' });
          runningBalance -= tds;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
          doc.text(fmt(Math.abs(runningBalance)) + (runningBalance > 0.01 ? ' Dr' : runningBalance < -0.01 ? ' Cr' : ''), col.balanceEnd, y, { align: 'right' });
          y += rowH;
        }
      }

      // ============== CLOSING BALANCE ==============
      // v1.10.14 — the v1.10.11 fix (label at col.debitEnd=140mm) still overlapped
      // for medium/large balances: "CLOSING BALANCE" at 11pt bold is ~33mm wide so
      // its right edge lands at ~173mm, but "Rs. X,XXX.XX Dr" at 12pt right-aligned
      // at balanceEnd (~193mm) has its left edge as far left as ~165mm for 4-digit
      // amounts. Real fix: park the label at marginL (~17mm) — 3x more breathing
      // room and it reads better as a bottom-of-page summary line anyway.
      y += 3;
      doc.setDrawColor(...getAccentRGB()); doc.setLineWidth(0.6);
      doc.line(marginL, y, marginR, y); y += 8;
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
      doc.text('CLOSING BALANCE', marginL, y);
      doc.setFontSize(12);
      if (runningBalance > 0.01) doc.setTextColor(220, 38, 38); else doc.setTextColor(5, 150, 105);
      const balanceLabel = fmt(Math.abs(runningBalance)) + (runningBalance > 0.01 ? ' Dr' : (runningBalance < -0.01 ? ' Cr' : ' Nil'));
      doc.text(balanceLabel, col.balanceEnd, y, { align: 'right' });
      doc.setTextColor(0);
      y += 10;
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(100);
      doc.text('Dr = amount receivable from client  ·  Cr = amount owed to client', marginL, y);

      // ============== SIGNATURE + FOOTER ==============
      // Signature block (right-aligned)
      y = Math.max(y + 15, 260);
      doc.setDrawColor(150); doc.line(marginR - 55, y, marginR - 2, y);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
      doc.text('Authorised Signatory', marginR - 28, y + 4, { align: 'center' });
      doc.text(profileForStatement?.businessName || '', marginR - 28, y + 8, { align: 'center' });

      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
      doc.text('Please review and confirm within 7 days. This is a computer-generated statement — no signature required.', pageW / 2, 285, { align: 'center' });
      doc.text('Generated by Free GST Billing Software', pageW / 2, 290, { align: 'center' });

      doc.save(`statement-${clientName.replace(/[^\w]+/g, '-')}-${localToday()}.pdf`);
      toast('Statement PDF generated', 'success');
    } catch (e) {
      toast('Could not generate statement PDF', 'error');
      console.error('generateClientStatement', e);
    }
  };

  // v1.10.59 — reported (#44 item 4, @sangwanmail-eng): "slow moving scroll
  // bar in many tabs, like purchase tab client tab etc."
  //
  // getClientBills() scanned EVERY bill and re-sorted, and getClientStats()
  // called it. Nothing was memoised, so the whole thing re-ran on every
  // render — including every keystroke in the search box. Worse, the client
  // sort below calls getClientStats() from inside its comparator, so a full
  // scan of all bills happened O(n log n) times per render on top of once
  // per rendered row.
  //
  // For 100 clients over 500 bills that is on the order of a third of a
  // million string lowercasings and date parses to paint one frame, which
  // is what made scrolling and typing feel sticky.
  //
  // Now: bills are grouped by client ONCE per change to `bills`, each group
  // sorted once, and per-client totals precomputed in the same pass. Lookups
  // become O(1), so rendering a row and sorting the list are both cheap.
  const billsByClient = useMemo(() => {
    const map = new Map();
    for (const b of bills) {
      const key = (b.clientName || '').toLowerCase();
      let arr = map.get(key);
      if (!arr) { arr = []; map.set(key, arr); }
      arr.push(b);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
    }
    return map;
  }, [bills]);

  const statsByClient = useMemo(() => {
    const map = new Map();
    for (const [key, cBills] of billsByClient) {
      // v1.10.74 - only real sales count; credit notes subtract; quotes,
      // challans, proformas and cancelled bills count for nothing.
      const total = cBills.reduce((s, b) => s + salesSign(b) * (b.totalAmount || 0), 0);
      // TDS clients deduct on sales: not paid to us, not owed either.
      const tds = cBills.reduce((s, b) => s + (salesSign(b) === 1 ? (Number(b.totalAmount) || 0) - amountDue(b) : 0), 0);
      const paid = cBills.reduce((s, b) => {
        if (salesSign(b) !== 1) return s;
        const fromPayments = (b.payments || []).reduce((ps, p) => ps + (Number(p.amount) || 0), 0);
        if (fromPayments > 0) return s + fromPayments;
        if (typeof b.paidAmount === 'number' && b.paidAmount > 0) return s + b.paidAmount;
        if (b.status === 'paid') return s + (b.totalAmount || 0);
        return s;
      }, 0);
      // count: the documents in these totals (sales and credit notes).
      map.set(key, { total, paid, unpaid: total - tds - paid, count: cBills.filter((b) => salesSign(b) !== 0).length });
    }
    return map;
  }, [billsByClient]);

  const EMPTY_BILLS = useMemo(() => [], []);
  const getClientBills = (clientName) =>
    billsByClient.get((clientName || '').toLowerCase()) || EMPTY_BILLS;

  const getClientStats = (clientName) =>
    statsByClient.get((clientName || '').toLowerCase())
    || { total: 0, paid: 0, unpaid: 0, count: 0 };


  // v1.10.22 — Aging analysis: bucket unpaid amounts by how long they've
  // been outstanding. Age = today − dueDate (falls back to invoiceDate
  // when a bill has no explicit due date, since most CA-billed invoices
  // don't set one but are treated as due-on-issue).
  //
  // Buckets: current (0-30 days), 31-60, 61-90, 90+. Reported: "client
  // aging / Statement of Account". Matches Vyapar / Zoho / Tally output.
  const bucketAge = (days) => {
    if (days <= 30) return 'current';
    if (days <= 60) return 'd31_60';
    if (days <= 90) return 'd61_90';
    return 'd90plus';
  };
  const getClientAging = (clientName) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
    const unpaidBills = [];
    for (const b of getClientBills(clientName)) {
      if (!countsAsSales(b)) continue; // v1.10.74 - quotes / challans / cancelled owe nothing
      const outstanding = amountDue(b) - (b.paidAmount || 0);
      if (outstanding <= 0.01) continue;
      const ref = b.data?.details?.dueDate || b.invoiceDate;
      const dueDate = ref ? parseLocalDate(ref) : today;
      const ageDays = Math.max(0, Math.floor((today - dueDate) / 86400000));
      const bucket = bucketAge(ageDays);
      buckets[bucket] += outstanding;
      buckets.total += outstanding;
      unpaidBills.push({ bill: b, ageDays, outstanding });
    }
    return { buckets, unpaidBills };
  };

  // v1.10.22 — Aging Report PDF: single-page overdue-bucket breakdown
  // (0-30, 31-60, 61-90, 90+ days) plus a per-invoice list showing
  // outstanding + age. Distinct from generateClientStatement above,
  // which is a full ledger with running balance — this is the "how
  // overdue are they?" view accountants ask for during collection calls.
  const generateAgingReport = async (clientName) => {
    try {
      const { jsPDF } = await import('jspdf');
      const { unpaidBills, buckets } = getClientAging(clientName);
      if (unpaidBills.length === 0) {
        toast(`${clientName} has no outstanding balance.`, 'info');
        return;
      }
      const profile = profileForStatement || {};
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const marginL = 15, marginR = 195;
      let y = 20;

      // Header
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('AGING REPORT', marginL, y); y += 8;
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      doc.text(profile?.businessName || 'Your Business', marginL, y); y += 5;
      if (profile?.address) { doc.text(profile.address, marginL, y); y += 5; }
      if (profile?.gstin)   { doc.text(`GSTIN: ${profile.gstin}`, marginL, y); y += 5; }
      doc.setTextColor(0);
      doc.text(`As of: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, marginR, 20, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(`Client: ${clientName}`, marginR, 26, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      y += 4;
      doc.setDrawColor(...getAccentRGB()); doc.setLineWidth(0.5);
      doc.line(marginL, y, marginR, y); y += 8;

      // Column headers
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Invoice #',   marginL,         y);
      doc.text('Date',        marginL + 40,    y);
      doc.text('Due',         marginL + 65,    y);
      doc.text('Age',         marginL + 90,    y);
      doc.text('Total',       marginL + 115,   y, { align: 'right' });
      doc.text('Outstanding', marginR,         y, { align: 'right' });
      y += 6;
      doc.setLineWidth(0.2);
      doc.line(marginL, y - 2, marginR, y - 2);

      // Rows
      doc.setFont('helvetica', 'normal');
      const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      for (const { bill, ageDays, outstanding } of unpaidBills) {
        if (y > 265) { doc.addPage(); y = 20; }
        const due = bill.data?.details?.dueDate ? new Date(bill.data.details.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
        const dt = bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
        doc.text(String(bill.invoiceNumber || '—').slice(0, 24), marginL, y);
        doc.text(dt, marginL + 40, y);
        doc.text(due, marginL + 65, y);
        doc.text(`${ageDays}d`, marginL + 90, y);
        doc.text(fmt(bill.totalAmount), marginL + 115, y, { align: 'right' });
        doc.setTextColor(ageDays > 60 ? 220 : 0, ageDays > 60 ? 38 : 0, ageDays > 60 ? 38 : 0);
        doc.text(fmt(outstanding), marginR, y, { align: 'right' });
        doc.setTextColor(0);
        y += 6;
      }

      // Aging summary
      y += 6;
      doc.setDrawColor(...getAccentRGB()); doc.setLineWidth(0.5);
      doc.line(marginL, y, marginR, y); y += 8;
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text('AGING SUMMARY', marginL, y); y += 8;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const bucketRows = [
        ['Current (0–30 days)', buckets.current],
        ['31–60 days',          buckets.d31_60],
        ['61–90 days',          buckets.d61_90],
        ['90+ days (overdue)',  buckets.d90plus],
      ];
      for (const [label, val] of bucketRows) {
        doc.text(label, marginL, y);
        doc.text(fmt(val), marginR, y, { align: 'right' });
        y += 6;
      }
      y += 2;
      doc.setDrawColor(0); doc.setLineWidth(0.3);
      doc.line(marginL, y, marginR, y); y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text('TOTAL OUTSTANDING', marginL, y);
      doc.setTextColor(220, 38, 38);
      doc.text(fmt(buckets.total), marginR, y, { align: 'right' });
      doc.setTextColor(0);

      // v1.10.74 - was named "Statement-..." like the real Statement PDF.
      const filename = `Aging-${clientName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}-${localToday()}.pdf`;
      doc.save(filename);
      toast(`Aging report for ${clientName} downloaded`, 'success');
    } catch (err) {
      console.error('generateAgingReport failed:', err);
      toast('Could not make the aging report', 'error');
    }
  };

  // Flatten all equipment across all saved clients for Asset Register & Universal Search
  const allAssets = useMemo(() => {
    return clients.flatMap(c => (c.equipment || []).map(eq => {
      const site = (c.sites || []).find(s => s.siteName === eq.siteName);
      return {
        ...eq,
        clientId: c.id,
        clientName: c.name,
        clientContactPerson: c.contactPerson,
        clientPhone: c.phone,
        clientEmail: c.email,
        siteDetails: site || null,
        fullClient: c,
      };
    }));
  }, [clients]);

  // Deep search across clients: checks name, contact person, GSTIN, city, state, address,
  // sites (siteName, city, address), and equipment (modelNumber, partNumber, serialNumber, description, capacity)
  const clientMatchesSearch = (clientName, q) => {
    if (!q) return true;
    if (clientName.toLowerCase().includes(q)) return true;
    const c = clients.find(cli => cli.name === clientName);
    if (!c) return false;
    if (c.contactPerson?.toLowerCase().includes(q)) return true;
    if (c.gstin?.toLowerCase().includes(q)) return true;
    if (c.city?.toLowerCase().includes(q)) return true;
    if (c.state?.toLowerCase().includes(q)) return true;
    if (c.address?.toLowerCase().includes(q)) return true;
    if ((c.sites || []).some(s =>
      s.siteName?.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q) ||
      s.contactPerson?.toLowerCase().includes(q)
    )) return true;
    if ((c.equipment || []).some(eq =>
      eq.modelNumber?.toLowerCase().includes(q) ||
      eq.partNumber?.toLowerCase().includes(q) ||
      eq.serialNumber?.toLowerCase().includes(q) ||
      eq.description?.toLowerCase().includes(q) ||
      eq.capacity?.toLowerCase().includes(q) ||
      eq.siteName?.toLowerCase().includes(q)
    )) return true;
    return false;
  };

  // Get all unique client names from bills (includes unsaved clients)
  const allClientNames = [...new Set([
    ...clients.map(c => c.name),
    ...bills.map(b => b.clientName).filter(Boolean)
  ])];

  const filteredClients = search.trim()
    ? allClientNames.filter(name => clientMatchesSearch(name, search.trim().toLowerCase()))
    : allClientNames;

  // Filter allAssets for the Equipment Register view
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allAssets;
    return allAssets.filter(a =>
      a.modelNumber?.toLowerCase().includes(q) ||
      a.partNumber?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.capacity?.toLowerCase().includes(q) ||
      a.siteName?.toLowerCase().includes(q) ||
      a.clientName?.toLowerCase().includes(q) ||
      a.clientContactPerson?.toLowerCase().includes(q) ||
      a.siteDetails?.city?.toLowerCase().includes(q) ||
      a.siteDetails?.address?.toLowerCase().includes(q) ||
      a.warrantyUntil?.toLowerCase().includes(q)
    );
  }, [allAssets, search]);

  const handleBillAsset = (asset) => {
    const clientData = asset.fullClient;
    const site = asset.siteDetails;
    const itemName = [asset.modelNumber, asset.description].filter(Boolean).join(' - ') +
      (asset.serialNumber ? ` (S/N: ${asset.serialNumber})` : '') +
      (asset.siteName ? ` [Site: ${asset.siteName}]` : '');

    const draft = {
      client: {
        name: clientData.name || '',
        contactPerson: clientData.contactPerson || '',
        address: clientData.address || '',
        city: clientData.city || '',
        state: clientData.state || '',
        pin: clientData.pin || '',
        gstin: clientData.gstin || '',
        email: clientData.email || '',
        phone: clientData.phone || '',
        country: clientData.country || 'India',
        isSEZ: !!clientData.isSEZ
      },
      details: {
        shipToSameAsBilling: !site,
        shippingAddress: site?.address || '',
        shippingCity: site?.city || '',
        shippingPin: site?.pin || '',
        shippingState: site?.state || '',
        placeOfSupply: site?.state || clientData.state || ''
      },
      items: [{
        id: Date.now().toString(),
        name: itemName,
        hsn: asset.partNumber || '',
        quantity: 1,
        unit: 'Set',
        rate: 0,
        discount: 0,
        discountType: 'fixed',
        discountBase: 'net',
        taxPercent: 18,
        cessPercent: 0,
        description: asset.capacity ? `Capacity: ${asset.capacity}` : ''
      }]
    };

    try {
      sessionStorage.setItem('gst_invoiceDraft', JSON.stringify(draft));
    } catch {}

    onNew(draft);
  };

  const handleViewClientLedger = (clientName) => {
    setViewMode('clients');
    setExpandedClient(clientName);
  };

  // Sort by outstanding amount
  const sortedClients = [...filteredClients].sort((a, b) => {
    const sa = getClientStats(a);
    const sb = getClientStats(b);
    return sb.unpaid - sa.unpaid;
  });

  const handleDeleteClient = async (id) => {
    if (await confirmAction({
      title: 'Remove this saved client?',
      message: 'Their existing invoices stay untouched — this only removes them from your saved clients list. You can add them again anytime.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })) {
      await deleteClient(id);
      toast('Client removed', 'success');
      loadData();
    }
  };

  const handleDeleteBill = async (id) => {
    if (await confirmAction({
      title: 'Delete this invoice?',
      message: 'The invoice will be moved to Trash for 30 days. Restore it from Settings → Backup Management → Trash bin.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })) {
      // Its stock goes back, as when an invoice is cancelled. The trashed copy
      // records what was put back, so restoring it takes exactly that out again.
      const bill = bills.find((b) => b.id === id);
      const returned = bill?.data ? appliedStock(bill) : {};
      const moves = Object.keys(returned).length > 0;
      try {
        if (moves) await saveBill({ ...bill, data: { ...bill.data, stockApplied: {}, stockReturnedOnDelete: returned } }, { overwrite: true });
        try { await deleteBill(id); }
        catch (err) { if (moves) await saveBill(bill, { overwrite: true }).catch(() => {}); throw err; }
        if (moves) await applyStockChanges(stockDelta(returned, {})).catch(() => toast('Invoice deleted, but its stock could not be put back. Check Products.', 'warning'));
        if (bill) trashSavedPdf(bill).catch(() => {});
        toast('Invoice deleted', 'success'); loadData();
      }
      catch { toast('Failed to delete', 'error'); }
    }
  };

  const changeStatus = async (bill, newStatus) => {
    const updated = { ...bill, status: newStatus };
    if (newStatus === 'paid') Object.assign(updated, markPaidPatch(bill));
    // v1.10.77 (#86) - Unpaid takes back the "Marked paid" payment, as on the Dashboard.
    if (newStatus === 'unpaid') Object.assign(updated, markUnpaidPatch(bill));
    await saveBill(updated, { overwrite: true });
    for (const p of (bill.payments || []).filter((x) => !(updated.payments || []).includes(x))) {
      if (p.id) deleteReceipt(p.id).catch(() => {});
    }
    toast(`Marked as ${STATUS_COLORS[updated.status]?.label || updated.status}`, 'info');
    loadData();
  };

  const openAddClient = (prefill) => {
    setModalClient(prefill || null);
    setEditingClientId(null);
    setShowForm(true);
  };

  const openEditClient = (client) => {
    setModalClient(client);
    setEditingClientId(client.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setModalClient(null); setEditingClientId(null); };

  const csvInputRef = useRef(null);

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast('CSV file is empty or has no data rows', 'warning'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      let imported = 0;
      // v1.10.74 - importing the same file twice made duplicates. Skip names
      // already saved (trimmed, any case), including repeats inside the file.
      let skipped = 0;
      const known = new Set(clients.map(c => (c.name || '').trim().toLowerCase()));
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
        const name = row.name || row.client || row['client name'] || '';
        if (!name) continue;
        if (known.has(name.toLowerCase())) { skipped++; continue; }
        known.add(name.toLowerCase());
        await saveClient({
          name,
          address: row.address || '',
          state: row.state || '',
          gstin: row.gstin || '',
          email: row.email || '',
          phone: row.phone || '',
        });
        imported++;
      }
      toast(`Imported ${imported} client(s)${skipped ? `, skipped ${skipped} already in your list` : ''}`, 'success');
      loadData();
    } catch {
      toast('Failed to parse CSV file', 'error');
    }
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  };

  const handleModalSave = async (formData) => {
    if (!formData.name.trim()) { toast('Client name is required', 'warning'); return; }
    try {
      const data = { ...formData };
      if (editingClientId) data.id = editingClientId;
      await saveClient(data);
      toast(editingClientId ? 'Client updated' : 'Client added', 'success');
      closeForm();
      loadData();
    } catch {
      toast('Failed to save client', 'error');
    }
  };

  const shareWhatsApp = (bill) => {
    const msg = `*Invoice ${bill.invoiceNumber}*\nAmount: ${formatCurrency(bill.totalAmount)}\nDate: ${new Date(bill.invoiceDate).toLocaleDateString('en-IN')}\nStatus: ${(bill.status || 'unpaid').toUpperCase()}`;
    openWhatsAppShare(bill.clientPhone, msg);
  };

  const shareEmail = (bill) => {
    const subject = `Invoice ${bill.invoiceNumber}`;
    const body = `Dear ${bill.clientName},\n\nPlease find the details of your invoice:\n\nInvoice No: ${bill.invoiceNumber}\nAmount: ${formatCurrency(bill.totalAmount)}\nDate: ${new Date(bill.invoiceDate).toLocaleDateString('en-IN')}\nDue: ${bill.status === 'paid' ? 'Paid' : 'Pending'}\n\nRegards`;
    // v1.10.74 - address the mail to the client when we have their email.
    const to = (clients.find(c => c.name === bill.clientName)?.email || bill.data?.client?.email || '').trim();
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div>
            <h1 className="page-title">Clients</h1>
            <p className="page-subtitle">Client-wise invoice ledger and outstanding</p>
          </div>
          <HelpButton title="Clients — how to use" doc="clients">
            <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
              <li><strong>Click a client name</strong> to see every invoice, payment, and credit note in one place.</li>
              <li><strong>Statement PDF</strong> — a full account ledger with running balance. Send it when a client disputes a bill.</li>
              <li><strong>Aging PDF</strong> — outstanding invoices bucketed by 0-30 / 31-60 / 61-90 / 90+ days. Use it for collection calls.</li>
              <li><strong>Aging strip</strong> — the same buckets inline so you can see who's slow to pay at a glance.</li>
              <li><strong>Import CSV</strong> — bulk-load clients from a spreadsheet (columns: name, address, state, gstin, email, phone). To back up clients, use Settings → Data Management → Export Backup.</li>
              <li><strong>WhatsApp / Email</strong> — quick outreach without leaving the app.</li>
            </ul>
          </HelpButton>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVImport} />
          <button className="btn btn-secondary" onClick={() => csvInputRef.current?.click()}>
            <Upload size={16} /> Import CSV
          </button>
          <button className="btn btn-secondary" onClick={() => openAddClient()}>
            <Plus size={18} /> Add Client
          </button>
          <button className="btn btn-primary" onClick={onNew}>
            <FileText size={18} /> New Invoice
          </button>
        </div>
      </div>

      {/* Add/Edit Client Modal */}
      <ClientModal show={showForm} onClose={closeForm} onSave={handleModalSave} client={modalClient} isEditing={!!editingClientId} defaultCountry={profileCountry} />

      {/* View Mode Toggle: Clients vs. Equipment Register */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn ${viewMode === 'clients' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.84rem', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
          onClick={() => setViewMode('clients')}
        >
          <Users size={16} /> Clients & Ledgers ({allClientNames.length})
        </button>
        <button
          type="button"
          className={`btn ${viewMode === 'equipment' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.84rem', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
          onClick={() => setViewMode('equipment')}
        >
          <Wrench size={16} /> Equipment & Asset Register ({allAssets.length})
        </button>
      </div>

      {/* Universal Search */}
      <div className="glass-panel p-4 mb-6">
        <div className="search-box" style={{ maxWidth: '540px' }}>
          <Search size={16} className="search-icon" />
          <input type="text"
            placeholder={viewMode === 'equipment'
              ? "Search by Model No, Part/SKU, Serial No, Site Location, or Client..."
              : "Search clients, contact person, site location, model no, part SKU..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input" />
          {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
      </div>

      {/* Equipment & Asset Register View */}
      {viewMode === 'equipment' && (
        <>
          {filteredAssets.length === 0 ? (
            <div className="glass-panel p-6">
              <div className="empty-state">
                <Wrench size={48} />
                <p>{allAssets.length === 0
                  ? "No installed equipment or models registered yet. Go to Clients, edit a client, and add machines to their registry."
                  : `No equipment or parts found matching "${search}".`}</p>
                {allAssets.length === 0 && (
                  <button className="btn btn-secondary" onClick={() => setViewMode('clients')} style={{ marginTop: '0.5rem' }}>
                    <Users size={16} /> View Clients List
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {filteredAssets.map(asset => (
                <div key={asset.id} className="glass-panel p-4" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div>
                    {/* Header: Model No + Capacity + AMC/Warranty */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <div>
                        <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--primary)' }}>
                          {asset.modelNumber || 'Unnamed Model'}
                        </div>
                        {asset.description && (
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-color)', marginTop: 2, fontWeight: 500 }}>
                            {asset.description}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {asset.capacity && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                            {asset.capacity}
                          </span>
                        )}
                        {asset.warrantyUntil && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                            🛡️ {asset.warrantyUntil}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Part SKU & Serial Number */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.4rem 0 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {asset.partNumber && (
                        <span style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
                          <strong>Part SKU:</strong> {asset.partNumber}
                        </span>
                      )}
                      {asset.serialNumber && (
                        <span style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
                          <strong>S/N:</strong> {asset.serialNumber}
                        </span>
                      )}
                    </div>

                    {/* Installed Location & Client Box */}
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '0.65rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: 3 }}>
                        <span style={{ fontSize: '0.85rem' }}>🏢</span>
                        <span>{asset.clientName}</span>
                        {asset.clientContactPerson && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.74rem' }}>
                            ({asset.clientContactPerson})
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: 2, color: '#0284c7' }} />
                        <div>
                          <strong style={{ color: 'var(--text-color)' }}>{asset.siteName || 'Main Office / Billing Address'}</strong>
                          {asset.siteDetails ? (
                            <div style={{ fontSize: '0.72rem', marginTop: 1 }}>
                              {[asset.siteDetails.address, asset.siteDetails.city, asset.siteDetails.state, asset.siteDetails.pin].filter(Boolean).join(', ')}
                            </div>
                          ) : (
                            asset.fullClient?.address && (
                              <div style={{ fontSize: '0.72rem', marginTop: 1 }}>
                                {[asset.fullClient.address, asset.fullClient.city, asset.fullClient.state, asset.fullClient.pin].filter(Boolean).join(', ')}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                      {asset.siteDetails?.contactPerson && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, paddingLeft: 18 }}>
                          Site Contact: {asset.siteDetails.contactPerson}{asset.siteDetails.phone ? ` • ${asset.siteDetails.phone}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.6rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, justifyContent: 'center', fontWeight: 600 }}
                      onClick={() => handleBillAsset(asset)}
                      title="Create new invoice with this client and machine pre-filled"
                    >
                      <Zap size={13} /> Bill This Asset
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, color: '#0369a1', borderColor: '#7dd3fc' }}
                      onClick={() => openServiceModal(asset.fullClient, asset)}
                      title="Create Daikin Service Completion Certificate for this exact machine"
                    >
                      <Wrench size={13} /> Service Report
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                      onClick={() => handleViewClientLedger(asset.clientName)}
                      title="Open client ledger and invoices"
                    >
                      Ledger
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                      onClick={() => openEditClient(asset.fullClient)}
                      title="Edit client or equipment details"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Client cards */}
      {viewMode === 'clients' && (
        <>
          {sortedClients.length === 0 ? (
        <div className="glass-panel p-6">
          <div className="empty-state">
            <Users size={48} />
            <p>No clients found.</p>
            <button className="btn btn-secondary" onClick={() => openAddClient()} style={{ marginTop: '0.5rem' }}>
              <Plus size={16} /> Add Your First Client
            </button>
          </div>
        </div>
      ) : (
        <div className="client-list">
          {sortedClients.map(clientName => {
            const stats = getClientStats(clientName);
            const savedClient = clients.find(c => c.name === clientName);
            const isExpanded = expandedClient === clientName;
            const clientBills = isExpanded ? getClientBills(clientName) : [];

            return (
              <div key={clientName} className="glass-panel mb-4" style={{ overflow: 'hidden' }}>
                {/* Client header */}
                <div className="client-card-header" onClick={() => setExpandedClient(isExpanded ? null : clientName)}>
                  <div className="client-card-info">
                    <div className="client-avatar">
                      {clientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="client-card-name">{clientName}</h3>
                      <p className="client-card-meta">
                        {stats.count} invoice{stats.count !== 1 ? 's' : ''}
                        {savedClient?.contactPerson ? ` | ${savedClient.contactPerson}` : ''}
                        {savedClient?.state ? ` | ${savedClient.state}` : ''}
                        {savedClient?.gstin ? ` | ${savedClient.gstin}` : ''}
                      </p>
                      {/* AMC, Warranty Badges & Quick Service Certificate Action */}
                      <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {savedClient?.amcExpiry && (
                          <span style={{
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span>🛡️</span>
                            <span>AMC Contract: <strong>{savedClient.amcExpiry}</strong></span>
                          </span>
                        )}
                        {(savedClient?.equipment || []).filter(eq => eq.warrantyUntil).map(eq => {
                          const val = (eq.warrantyUntil || '').toLowerCase();
                          const isExpired = val.includes('expire') && !val.includes('active');
                          return (
                            <span
                              key={eq.id}
                              style={{
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: isExpired ? '#fef2f2' : '#ecfdf5',
                                color: isExpired ? '#dc2626' : '#059669',
                                border: `1px solid ${isExpired ? '#fecaca' : '#a7f3d0'}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title={`Model: ${eq.modelNumber || 'Machine'} • S/N: ${eq.serialNumber || 'N/A'} • Site: ${eq.siteName || 'N/A'}`}
                            >
                              <span>🛡️</span>
                              <span>{eq.modelNumber ? `${eq.modelNumber}: ` : 'Warranty: '}<strong>{eq.warrantyUntil}</strong></span>
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openServiceModal(savedClient || { name: clientName });
                          }}
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                          title="Create Daikin Service Completion Certificate"
                        >
                          <Wrench size={12} />
                          <span>Service Certificate</span>
                        </button>
                      </div>
                      {search.trim() && (() => {
                        const q = search.trim().toLowerCase();
                        const matchedEq = (savedClient?.equipment || []).filter(eq =>
                          eq.modelNumber?.toLowerCase().includes(q) ||
                          eq.partNumber?.toLowerCase().includes(q) ||
                          eq.serialNumber?.toLowerCase().includes(q) ||
                          eq.description?.toLowerCase().includes(q)
                        );
                        const matchedSites = (savedClient?.sites || []).filter(s =>
                          s.siteName?.toLowerCase().includes(q) ||
                          s.city?.toLowerCase().includes(q)
                        );
                        if (matchedEq.length === 0 && matchedSites.length === 0) return null;
                        return (
                          <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.7rem' }}>
                            {matchedEq.map(eq => (
                              <span key={eq.id} style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                ⚙️ {eq.modelNumber}{eq.partNumber ? ` (${eq.partNumber})` : ''}
                              </span>
                            ))}
                            {matchedSites.map(s => (
                              <span key={s.id} style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                📍 {s.siteName}{s.city ? ` (${s.city})` : ''}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="client-card-stats">
                    <div className="client-stat">
                      <span className="client-stat-label">Total</span>
                      <span className="client-stat-value">{formatCurrency(stats.total)}</span>
                    </div>
                    <div className="client-stat">
                      <span className="client-stat-label">Paid</span>
                      <span className="client-stat-value" style={{ color: '#059669' }}>{formatCurrency(stats.paid)}</span>
                    </div>
                    <div className="client-stat">
                      {/* v1.10.23 — surface overpayment explicitly (was
                          hidden as "Outstanding: ₹0" when paid > total). */}
                      <span className="client-stat-label">
                        {stats.unpaid < -0.005 ? 'Overpaid' : 'Outstanding'}
                      </span>
                      <span className="client-stat-value" style={{ color: stats.unpaid > 0.005 ? '#dc2626' : (stats.unpaid < -0.005 ? '#0369a1' : '#059669') }}>
                        {formatCurrency(Math.abs(stats.unpaid))}
                      </span>
                    </div>
                    <div style={{ marginLeft: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {isExpanded ? 'Hide' : 'View'} {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Expanded: invoice list */}
                {isExpanded && (
                  <div className="client-invoices">
                    {/* Action bar (right-aligned) — Statement + Aging PDFs. */}
                    <div style={{ padding: '0.5rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => generateClientStatement(clientName)}
                        title="Account statement: every invoice, credit note, payment, and running balance in one PDF">
                        <Download size={14} /> Statement PDF
                      </button>
                      {/* v1.10.22 — Aging breakdown (0-30 / 31-60 / 61-90 / 90+). */}
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => generateAgingReport(clientName)}
                        title="Aging report: outstanding invoices bucketed by how overdue they are">
                        <Download size={14} /> Aging PDF
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', color: '#0369a1', borderColor: '#7dd3fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={() => openServiceModal(savedClient || { name: clientName })}
                        title="Create Daikin Service Completion Certificate">
                        <Wrench size={14} /> Service Certificate
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', color: '#0284c7', borderColor: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={() => openCommissioningModal(savedClient || { name: clientName })}
                        title="Create Cold Storage Commissioning Report (Forms CSH-1, CSH-2 & Measurement Sheet)">
                        <FileText size={14} /> Commissioning Report
                      </button>
                    </div>

                    {/* v1.10.22 — Aging summary strip: shows the four
                        buckets inline so users get the answer without
                        having to open the PDF. */}
                    {(() => {
                      const { buckets } = getClientAging(clientName);
                      if (buckets.total <= 0.01) return null;
                      const fmt = (n) => formatCurrency(n, 'INR');
                      const cells = [
                        { label: 'Current', val: buckets.current, color: '#059669' },
                        { label: '31-60d',  val: buckets.d31_60,   color: '#d97706' },
                        { label: '61-90d',  val: buckets.d61_90,   color: '#ea580c' },
                        { label: '90+ d',   val: buckets.d90plus,  color: '#dc2626' },
                      ];
                      return (
                        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Aging:</span>
                          {cells.map(c => (
                            <span key={c.label} style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{c.label}</span>
                              <strong style={{ color: c.val > 0 ? c.color : 'var(--text-muted)' }}>{fmt(c.val)}</strong>
                            </span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Client details */}
                    {savedClient && (savedClient.address || savedClient.city || savedClient.email || savedClient.phone || savedClient.contactPerson) && (
                      <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {savedClient.contactPerson && <span style={{ fontWeight: 600 }}>{savedClient.contactPerson}</span>}
                        {(savedClient.address || savedClient.city || savedClient.pin) && (
                          <span>{[savedClient.address, savedClient.city, savedClient.pin].filter(Boolean).join(', ')}</span>
                        )}
                        {savedClient.email && <span>{savedClient.email}</span>}
                        {savedClient.phone && <span>{savedClient.phone}</span>}
                      </div>
                    )}
                    {/* Project Sites list */}
                    {savedClient?.sites?.length > 0 && (
                      <div style={{ padding: '0.5rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.68rem' }}>📍 Project Sites:</span>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          {savedClient.sites.map(site => (
                            <span key={site.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.2rem 0.5rem' }}>
                              <strong>{site.siteName}</strong>{site.city ? ` — ${site.city}` : ''}{site.state ? `, ${site.state}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Installed Equipment & Models list */}
                    {savedClient?.equipment?.length > 0 && (
                      <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            ⚙️ Installed Equipment & Models ({savedClient.equipment.length}):
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem' }}>
                          {savedClient.equipment.map(eq => (
                            <div key={eq.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{eq.modelNumber}</span>
                                {eq.capacity && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3 }}>{eq.capacity}</span>}
                              </div>
                              {eq.description && <div style={{ fontSize: '0.75rem', marginBottom: 2 }}>{eq.description}</div>}
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                {eq.partNumber && <span>Part: {eq.partNumber}</span>}
                                {eq.serialNumber && <span>S/N: {eq.serialNumber}</span>}
                                {eq.siteName && <span>📍 {eq.siteName}</span>}
                                {eq.warrantyUntil && <span>AMC/Warr: {eq.warrantyUntil}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Document Classification & Tabs Bar */}
                    {(() => {
                      const activeTab = clientDocTabs[clientName] || 'all';
                      const setActiveTab = (tab) => setClientDocTabs(prev => ({ ...prev, [clientName]: tab }));

                      const taxInvoices = clientBills.filter(b => b.invoiceType === 'tax-invoice' || b.invoiceType === 'bill-of-supply' || !b.invoiceType);
                      const quotations = clientBills.filter(b => b.invoiceType === 'quotation');
                      const proformasAndChallans = clientBills.filter(b => ['proforma', 'delivery-challan', 'credit-note'].includes(b.invoiceType));

                      const clientCerts = (allCertificates || []).filter(cert => {
                        if (savedClient?.id && cert.customer_id && cert.customer_id === savedClient.id) return true;
                        return (cert.customer_name || '').trim().toLowerCase() === clientName.trim().toLowerCase();
                      });

                      const clientFiles = savedClient?.files || [];

                      const vaultItems = [
                        ...clientBills.map(bill => {
                          const isQuote = bill.invoiceType === 'quotation';
                          const isProforma = bill.invoiceType === 'proforma';
                          const isChallan = bill.invoiceType === 'delivery-challan';
                          const isCreditNote = bill.invoiceType === 'credit-note';

                          let category = 'Invoice';
                          let typeLabel = 'Tax Invoice';
                          let icon = '🧾';
                          let badgeColor = '#059669';
                          let badgeBg = '#ecfdf5';

                          if (isQuote) {
                            category = 'Quotation';
                            typeLabel = 'Quotation & Proposal';
                            icon = '📄';
                            badgeColor = '#0284c7';
                            badgeBg = '#e0f2fe';
                          } else if (isProforma) {
                            category = 'Proforma';
                            typeLabel = 'Proforma Invoice';
                            icon = '🚚';
                            badgeColor = '#ea580c';
                            badgeBg = '#ffedd5';
                          } else if (isChallan) {
                            category = 'Proforma';
                            typeLabel = 'Delivery Challan';
                            icon = '📦';
                            badgeColor = '#0891b2';
                            badgeBg = '#cffafe';
                          } else if (isCreditNote) {
                            category = 'Invoice';
                            typeLabel = 'Credit Note';
                            icon = '💳';
                            badgeColor = '#dc2626';
                            badgeBg = '#fee2e2';
                          }

                          return {
                            id: 'doc_' + bill.id,
                            billId: bill.id,
                            isGenerated: true,
                            rawBill: bill,
                            name: `${typeLabel} - ${bill.invoiceNumber || 'Draft'}.pdf`,
                            category: category,
                            categoryLabel: typeLabel,
                            icon: icon,
                            badgeColor,
                            badgeBg,
                            size: null,
                            uploadedAt: bill.invoiceDate,
                            notes: `Total: ${formatCurrency(bill.totalAmount, bill.currency || 'INR')} • Status: ${(bill.status || 'unpaid').toUpperCase()}`,
                            isProposalEligible: isQuote || isProforma,
                          };
                        }),
                        ...clientCerts.map(cert => ({
                          id: 'cert_' + cert.id,
                          certId: cert.id,
                          isGenerated: true,
                          isCert: true,
                          rawCert: cert,
                          name: `Service Certificate - ${cert.request_no || 'Draft'}.pdf`,
                          category: 'ServiceCert',
                          categoryLabel: 'Service Certificate',
                          icon: '🛠️',
                          badgeColor: '#0284c7',
                          badgeBg: '#e0f2fe',
                          size: null,
                          uploadedAt: cert.rectification_date_time?.split(' ')[0] || cert.created_at?.split('T')[0] || '',
                          notes: `${cert.outdoor_model_no || cert.indoor_model_no || 'Refrigeration Machine'} • Site: ${cert.site_name || 'N/A'}`,
                        })),
                        ...(allCommissioningReports || []).filter(rep => {
                          if (savedClient?.id && rep.customer_id && rep.customer_id === savedClient.id) return true;
                          return (rep.customer_name || '').trim().toLowerCase() === clientName.trim().toLowerCase();
                        }).map(rep => ({
                          id: 'comm_' + rep.id,
                          cshId: rep.id,
                          isGenerated: true,
                          isCommissioning: true,
                          rawReport: rep,
                          name: `Commissioning Report - ${rep.report_no || 'CSH'}.pdf`,
                          category: 'ServiceCert',
                          categoryLabel: 'Commissioning (CSH-1/2)',
                          icon: '❄️',
                          badgeColor: '#0284c7',
                          badgeBg: '#e0f2fe',
                          size: null,
                          uploadedAt: rep.handover_date || (rep.created_at?.split('T')[0] || ''),
                          notes: `Site: ${rep.site_address?.slice(0, 30) || 'Site'} • Handover: ${rep.handover_date || 'N/A'} • Warranty: ${rep.warranty_end || 'N/A'}`,
                        })),
                        ...clientFiles.map(f => ({
                          ...f,
                          isGenerated: false,
                        }))
                      ];

                      let displayedBills = clientBills;
                      if (activeTab === 'invoices') displayedBills = taxInvoices;
                      else if (activeTab === 'quotations') displayedBills = quotations;
                      else if (activeTab === 'proformas') displayedBills = proformasAndChallans;

                      return (
                        <>
                          <div style={{
                            padding: '0.7rem 1.5rem',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--bg-secondary, #f8fafc)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.6rem'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '20px',
                                  fontWeight: activeTab === 'all' ? 700 : 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => setActiveTab('all')}
                              >
                                All Documents ({clientBills.length + clientCerts.length + clientFiles.length})
                              </button>
                              <button
                                type="button"
                                className={`btn ${activeTab === 'invoices' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '20px',
                                  fontWeight: activeTab === 'invoices' ? 700 : 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => setActiveTab('invoices')}
                              >
                                🧾 Tax Invoices ({taxInvoices.length})
                              </button>
                              <button
                                type="button"
                                className={`btn ${activeTab === 'quotations' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '20px',
                                  fontWeight: activeTab === 'quotations' ? 700 : 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => setActiveTab('quotations')}
                              >
                                📄 Quotations & Proposals ({quotations.length})
                              </button>
                              <button
                                type="button"
                                className={`btn ${activeTab === 'proformas' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '20px',
                                  fontWeight: activeTab === 'proformas' ? 700 : 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => setActiveTab('proformas')}
                              >
                                🚚 Proforma & Challans ({proformasAndChallans.length})
                              </button>
                              <button
                                type="button"
                                className={`btn ${activeTab === 'service' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '20px',
                                  fontWeight: activeTab === 'service' ? 700 : 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => setActiveTab('service')}
                              >
                                🛠️ Service Certificates ({clientCerts.length})
                              </button>
                              <button
                                type="button"
                                className={`btn ${activeTab === 'files' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '20px',
                                  fontWeight: activeTab === 'files' ? 700 : 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => setActiveTab('files')}
                              >
                                📁 Files & Vault ({vaultItems.length})
                              </button>
                            </div>

                            <div>
                              {activeTab === 'files' ? (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  onClick={() => {
                                    setUploadModalClient({ clientName, savedClient });
                                    setUploadCategory('PO');
                                    setUploadNotes('');
                                    setUploadFileObj(null);
                                  }}
                                >
                                  <Upload size={13} /> Attach File
                                </button>
                              ) : activeTab === 'quotations' ? (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  onClick={() => onNew({ invoiceType: 'quotation', client: savedClient || { name: clientName } })}
                                >
                                  <Plus size={13} /> New Quotation
                                </button>
                              ) : activeTab === 'proformas' ? (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  onClick={() => onNew({ invoiceType: 'proforma', client: savedClient || { name: clientName } })}
                                >
                                  <Plus size={13} /> New Proforma
                                </button>
                              ) : activeTab === 'service' ? (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  onClick={() => openServiceModal(savedClient || { name: clientName })}
                                >
                                  <Plus size={13} /> New Certificate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  onClick={() => onNew({ invoiceType: 'tax-invoice', client: savedClient || { name: clientName } })}
                                >
                                  <Plus size={13} /> New Tax Invoice
                                </button>
                              )}
                            </div>
                          </div>

                          {activeTab === 'service' ? (
                            renderServiceCertificatesTable(clientCerts, clientName, savedClient, false)
                          ) : activeTab === 'files' ? (
                            renderFilesSection(vaultItems, clientName, savedClient, false)
                          ) : (
                            <>
                              {displayedBills.length === 0 ? (
                                <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
                                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                    {activeTab === 'quotations'
                                      ? 'No quotations or project proposals for this client yet.'
                                      : activeTab === 'proformas'
                                      ? 'No proforma invoices or delivery challans for this client yet.'
                                      : activeTab === 'invoices'
                                      ? 'No tax invoices for this client yet.'
                                      : 'No documents for this client yet.'}
                                  </p>
                                  <button
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                    onClick={() => {
                                      if (activeTab === 'quotations') onNew({ invoiceType: 'quotation', client: savedClient || { name: clientName } });
                                      else if (activeTab === 'proformas') onNew({ invoiceType: 'proforma', client: savedClient || { name: clientName } });
                                      else onNew({ invoiceType: 'tax-invoice', client: savedClient || { name: clientName } });
                                    }}
                                  >
                                    <Plus size={14} />
                                    {activeTab === 'quotations'
                                      ? 'Create Quotation'
                                      : activeTab === 'proformas'
                                      ? 'Create Proforma'
                                      : activeTab === 'invoices'
                                      ? 'Create Tax Invoice'
                                      : 'Create Document'}
                                  </button>
                                </div>
                              ) : (
                                <div className="table-scroll">
                                  <table className="data-table" style={{ marginBottom: 0, minWidth: '750px' }}>
                                    <thead>
                                      <tr>
                                        <th>Date</th>
                                        <th>Document No.</th>
                                        <th>Type</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                        <th>Status</th>
                                        <th className="col-center">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {displayedBills.map(bill => {
                                        const status = bill.status || 'unpaid';
                                        const sc = STATUS_COLORS[status] || STATUS_COLORS.unpaid;
                                        const cancelled = isCancelledBill(bill);
                                        const isOverdue = status !== 'paid' && !cancelled && bill.data?.details?.dueDate && new Date(bill.data.details.dueDate) < new Date();
                                        const isProposalEligible = ['quotation', 'proforma'].includes(bill.invoiceType);
                                        return (
                                          <tr key={bill.id} className={isOverdue ? 'row-overdue' : ''}>
                                            <td className="text-muted">{new Date(bill.invoiceDate).toLocaleDateString('en-IN')}</td>
                                            <td>
                                              <span className="invoice-badge">{bill.invoiceNumber}</span>
                                              {bill.convertedTo && (
                                                <span style={{ marginLeft: 6, fontSize: '0.68rem', color: '#059669', background: '#ecfdf5', padding: '1px 5px', borderRadius: 3, border: '1px solid #a7f3d0' }}>
                                                  Converted → {bill.convertedTo}
                                                </span>
                                              )}
                                            </td>
                                            <td><span className="type-badge">{(INVOICE_TYPES[bill.invoiceType || 'tax-invoice'])?.label}</span></td>
                                            <td className="font-bold" style={{ textAlign: 'right' }}>{formatCurrency(bill.totalAmount, bill.currency || bill.data?.invoiceOptions?.currency || 'INR')}</td>
                                            <td>
                                              <select className="status-select" value={isOverdue && status !== 'overdue' ? 'overdue' : status}
                                                style={{ background: sc.bg, color: sc.color, borderColor: sc.color + '44', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid', cursor: 'pointer', fontWeight: 600 }}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => changeStatus(bill, e.target.value)}
                                                disabled={cancelled}
                                                title={cancelled ? 'Undo the cancel from the Dashboard' : undefined}>
                                                {Object.entries(STATUS_COLORS).filter(([key]) => cancelled || key !== 'cancelled').map(([key, val]) => (
                                                  <option key={key} value={key}>{val.label}</option>
                                                ))}
                                              </select>
                                            </td>
                                            <td>
                                              <div className="table-actions">
                                                {/* View Document Modal */}
                                                {bill.data && (
                                                  <button
                                                    type="button"
                                                    className="icon-btn icon-btn-blue"
                                                    onClick={() => setViewBill(bill)}
                                                    title="View Document"
                                                    aria-label="View Document"
                                                  >
                                                    <Eye size={14} />
                                                  </button>
                                                )}
                                                {/* 5-Page Techno-Commercial Project Proposal */}
                                                {isProposalEligible && (
                                                  <button
                                                    className="icon-btn"
                                                    style={{ color: '#0369a1', background: '#e0f2fe', borderColor: '#7dd3fc' }}
                                                    onClick={() => handleOpenProposal(bill)}
                                                    title="View / Print 5-Page Techno-Commercial Project Proposal"
                                                    aria-label="5-Page Proposal"
                                                  >
                                                    <FileText size={14} />
                                                  </button>
                                                )}
                                                {/* Print Document */}
                                                {onPrint && (
                                                  <button
                                                    type="button"
                                                    className="icon-btn"
                                                    style={{ color: '#475569' }}
                                                    onClick={() => onPrint(bill)}
                                                    title="Print Document"
                                                    aria-label="Print Document"
                                                  >
                                                    <Printer size={14} />
                                                  </button>
                                                )}
                                                {/* Convert to Tax Invoice */}
                                                {onConvert && ['quotation', 'proforma', 'delivery-challan'].includes(bill.invoiceType) && !bill.convertedTo && (
                                                  <button className="icon-btn icon-btn-green" onClick={() => onConvert(bill)} title="Convert to Tax Invoice" aria-label="Convert to Tax Invoice">
                                                    <Zap size={14} />
                                                  </button>
                                                )}
                                                {bill.data && (
                                                  <button className="icon-btn icon-btn-blue" onClick={() => onEdit(bill)} title="Edit Document" aria-label="Edit Document">
                                                    <Edit3 size={14} />
                                                  </button>
                                                )}
                                                <button className="icon-btn icon-btn-blue" onClick={() => onDuplicate(bill)} title="Duplicate Document" aria-label="Duplicate Document">
                                                  <Copy size={14} />
                                                </button>
                                                <button className="icon-btn icon-btn-green" onClick={() => shareWhatsApp(bill)} title="WhatsApp" aria-label="WhatsApp">
                                                  <MessageCircle size={14} />
                                                </button>
                                                <button className="icon-btn icon-btn-blue" onClick={() => shareEmail(bill)} title="Email" aria-label="Email">
                                                  <Mail size={14} />
                                                </button>
                                                <button className="icon-btn icon-btn-red" onClick={() => handleDeleteBill(bill.id)} title="Delete Document" aria-label="Delete Document">
                                                  <Trash2 size={14} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* In 'all' tab, also display service completion certificates below the bills table */}
                              {activeTab === 'all' && clientCerts.length > 0 && (
                                renderServiceCertificatesTable(clientCerts, clientName, savedClient, true)
                              )}

                              {/* In 'all' tab, also display files and attachments below service certificates */}
                              {activeTab === 'all' && vaultItems.length > 0 && (
                                renderFilesSection(vaultItems, clientName, savedClient, true)
                              )}
                            </>
                          )}
                        </>
                      );
                    })()}
                    <div className="client-actions-bar" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                      {savedClient ? (
                        <>
                          <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => openEditClient(savedClient)}>
                            <Edit3 size={13} /> Edit Client
                          </button>
                          <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', color: '#dc2626', borderColor: '#fecaca' }} onClick={() => handleDeleteClient(savedClient.id)}>
                            <Trash2 size={13} /> Delete Client
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => openAddClient({ name: clientName })}>
                          <Plus size={13} /> Save as Client
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Service Certificate Modal */}
      {serviceModalOpen && (
        <ServiceCertificateModal
          isOpen={serviceModalOpen}
          onClose={() => {
            setServiceModalOpen(false);
            setServiceClient(null);
            setServiceEquipment(null);
            setViewingCertificate(null);
          }}
          client={serviceClient}
          equipment={serviceEquipment}
          existingCertificate={viewingCertificate}
          onConvertToInvoice={(draft) => onNew(draft)}
          onSaved={() => loadData()}
        />
      )}

      {/* Cold Storage Commissioning Report Modal (CSH-1, CSH-2 & Measurement Sheet) */}
      {commissioningModalOpen && (
        <ColdStorageCommissioningModal
          isOpen={commissioningModalOpen}
          onClose={() => {
            setCommissioningModalOpen(false);
            setCommissioningClient(null);
            setSelectedCommissioningReport(null);
          }}
          client={commissioningClient}
          existingReport={selectedCommissioningReport}
          profile={profileForStatement || {}}
          onSaved={() => loadData()}
        />
      )}

      {/* 5-Page Techno-Commercial Project Proposal Modal */}
      {proposalQuotation && (
        <TechnoCommercialProposalModal
          isOpen={!!proposalQuotation}
          onClose={() => {
            setProposalQuotation(null);
            setTargetBillForProposal(null);
          }}
          quotation={proposalQuotation}
          profile={profileForStatement || {}}
          onProposalSaved={handleProposalSaved}
        />
      )}

      {/* Client File Preview Modal */}
      {filePreviewModal && (
        <div className="modal-overlay" onClick={() => setFilePreviewModal(null)} style={{ zIndex: 1100 }}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: filePreviewModal.type === 'application/pdf' ? '920px' : '780px',
              width: '95%',
              padding: 0,
              borderRadius: '8px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <FileText size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={filePreviewModal.name}>
                    {filePreviewModal.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {formatFileSize(filePreviewModal.size)} • {filePreviewModal.category || 'General'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '0.28rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleDownloadFile(filePreviewModal)}
                >
                  <Download size={13} /> Download
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setFilePreviewModal(null)}
                  title="Close Preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
              {filePreviewModal.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(filePreviewModal.name) ? (
                <img
                  src={filePreviewModal.dataUrl}
                  alt={filePreviewModal.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '4px' }}
                />
              ) : filePreviewModal.type === 'application/pdf' || /\.pdf$/i.test(filePreviewModal.name) ? (
                <iframe
                  src={filePreviewModal.dataUrl}
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '4px' }}
                  title={filePreviewModal.name}
                />
              ) : (
                <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                  <File size={48} style={{ color: 'var(--primary)', margin: '0 auto 1rem' }} />
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>{filePreviewModal.name}</h3>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem', maxWidth: '400px', marginInline: 'auto' }}>
                    This file format cannot be rendered inline inside the browser. Click below to download and view it with your default desktop program.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto' }}
                    onClick={() => handleDownloadFile(filePreviewModal)}
                  >
                    <Download size={15} /> Download {formatFileSize(filePreviewModal.size)}
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {filePreviewModal.notes && (
              <div style={{ padding: '0.6rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                <strong>Notes:</strong> {filePreviewModal.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attach File Modal */}
      {uploadModalClient && (
        <div className="modal-overlay" onClick={() => !uploading && setUploadModalClient(null)} style={{ zIndex: 1100 }}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '520px', width: '95%', padding: '1.25rem', borderRadius: '8px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontSize: '1rem' }}>
                  Attach Document to {uploadModalClient.clientName}
                </h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => !uploading && setUploadModalClient(null)}
                disabled={uploading}
              >
                <X size={16} />
              </button>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  setUploadFileObj(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileUploadInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border, #cbd5e1)',
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: uploadFileObj ? '#f0fdf4' : 'var(--bg-secondary, #f8fafc)',
                transition: 'all 0.2s',
                marginBottom: '1rem'
              }}
            >
              <input
                type="file"
                ref={fileUploadInputRef}
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadFileObj(e.target.files[0]);
                  }
                }}
              />
              {uploadFileObj ? (
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>✅</div>
                  <div style={{ fontWeight: 700, color: '#15803d', fontSize: '0.88rem' }}>{uploadFileObj.name}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {formatFileSize(uploadFileObj.size)} • Click to choose a different file
                  </div>
                </div>
              ) : (
                <div>
                  <Upload size={28} style={{ color: 'var(--primary)', margin: '0 auto 0.4rem' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-color)' }}>
                    Click to select or drag & drop file here
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Supports PDFs, CAD Drawings (.dwg), Images, POs, Contracts (up to 45 MB)
                  </div>
                </div>
              )}
            </div>

            {/* Category Selection */}
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Document Category
              </label>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value)}
                className="form-control"
                style={{ fontSize: '0.82rem', width: '100%' }}
              >
                {FILE_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes / Description */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Notes / Remarks <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span>
              </label>
              <input
                type="text"
                value={uploadNotes}
                onChange={e => setUploadNotes(e.target.value)}
                placeholder="e.g. Revision 2 site layout, customer signed PO #8821"
                className="form-control"
                style={{ fontSize: '0.82rem', width: '100%' }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUploadModalClient(null)}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveUpload}
                disabled={!uploadFileObj || uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {uploading ? (
                  <>Uploading & Attaching...</>
                ) : (
                  <>
                    <Upload size={14} /> Attach File
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document View / Print Preview Modal */}
      {viewBill?.data && (
        <PrintPreviewModal
          isOpen
          onClose={() => setViewBill(null)}
          onPrint={() => (onPrint ? onPrint(viewBill) : onEdit(viewBill))}
          cancelled={isCancelledBill(viewBill)}
          profile={viewBill.data.profile || profileForStatement}
          client={viewBill.data.client || {}}
          details={viewBill.data.details || {}}
          items={viewBill.data.items || []}
          totals={viewBill.data.totals || {}}
          invoiceType={viewBill.invoiceType || viewBill.data.invoiceType || 'tax-invoice'}
          customTerms={viewBill.data.customTerms}
          customNotes={viewBill.data.customNotes}
          extraSections={viewBill.data.extraSections || []}
          invoiceOptions={viewBill.data.invoiceOptions || {}}
        />
      )}
    </div>
  );
}
