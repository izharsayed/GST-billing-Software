import React, { useState, useEffect } from 'react';
import {
  Layers, Tag, Cpu, DollarSign, Truck, History, Plus, Edit2, Trash2, CheckCircle2,
  AlertCircle, Search, RefreshCw, X
} from 'lucide-react';
import {
  getCategories, saveCategory, deleteCategory,
  getBrands, saveBrand, deleteBrand,
  getProductModels, saveProductModel, deleteProductModel,
  getAllProducts, getWarehouses, saveWarehouse,
  getChargeItems, saveChargeItem, getPriceHistory
} from '../../store';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';

export default function MastersView() {
  const [tab, setTab] = useState('models'); // 'models' | 'categories' | 'brands' | 'warehouses' | 'charges' | 'history'
  const [loading, setLoading] = useState(false);

  // Data states
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [models, setModels] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [charges, setCharges] = useState([]);
  const [history, setHistory] = useState([]);

  // Search & filter
  const [search, setSearch] = useState('');

  // Modals / forms
  const [editModal, setEditModal] = useState(null); // { type, data }

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cats, brds, prods, mods, whs, chgs, hist] = await Promise.all([
        getCategories().catch(() => []),
        getBrands().catch(() => []),
        getAllProducts().catch(() => []),
        getProductModels().catch(() => []),
        getWarehouses().catch(() => []),
        getChargeItems().catch(() => []),
        getPriceHistory().catch(() => []),
      ]);
      setCategories(cats);
      setBrands(brds);
      setProducts(prods);
      setModels(mods);
      setWarehouses(whs);
      setCharges(chgs);
      setHistory(hist);
    } catch {
      toast('Failed to load masters', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ----------------------------------------------------
  // SUB-HANDLERS
  // ----------------------------------------------------
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      id: editModal?.data?.id || undefined,
      name: fd.get('name'),
      description: fd.get('description'),
    };
    try {
      await saveCategory(data);
      toast('Category saved successfully', 'success');
      setEditModal(null);
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveBrand = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      id: editModal?.data?.id || undefined,
      name: fd.get('name'),
      description: fd.get('description'),
    };
    try {
      await saveBrand(data);
      toast('Brand saved successfully', 'success');
      setEditModal(null);
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveModel = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      id: editModal?.data?.id || undefined,
      product_id: fd.get('product_id'),
      brand_id: fd.get('brand_id') || null,
      model_number: fd.get('model_number'),
      capacity: fd.get('capacity'),
      capacity_unit: fd.get('capacity_unit'),
      temp_range_min: fd.get('temp_range_min'),
      temp_range_max: fd.get('temp_range_max'),
      refrigerant: fd.get('refrigerant'),
      voltage_phase: fd.get('voltage_phase'),
      catalogue_ref: fd.get('catalogue_ref'),
      catalogue_page: fd.get('catalogue_page'),
      purchase_cost: fd.get('purchase_cost'),
      selling_price: fd.get('selling_price'),
      min_selling_price: fd.get('min_selling_price') || null,
      description: fd.get('description'),
    };
    try {
      await saveProductModel(data);
      toast('Model saved successfully', 'success');
      setEditModal(null);
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveWarehouse = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      id: editModal?.data?.id || undefined,
      code: fd.get('code'),
      name: fd.get('name'),
      type: fd.get('type'),
      address: fd.get('address'),
    };
    try {
      await saveWarehouse(data);
      toast('Location saved successfully', 'success');
      setEditModal(null);
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveCharge = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      id: editModal?.data?.id || undefined,
      name: fd.get('name'),
      charge_type: fd.get('charge_type'),
      default_rate: fd.get('default_rate'),
      tax_percent: fd.get('tax_percent'),
      hsn_sac: fd.get('hsn_sac'),
    };
    try {
      await saveChargeItem(data);
      toast('Charge rule saved successfully', 'success');
      setEditModal(null);
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Cpu className="text-primary" /> Refrigeration Masters & Engineering Config
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Central administration for models, technical specifications, multi-tier pricing, warehouses, and technician vans.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadAll} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {[
          { id: 'models', label: 'Models & Technical Data', icon: Cpu, count: models.length },
          { id: 'categories', label: 'Product Categories', icon: Layers, count: categories.length },
          { id: 'brands', label: 'Brands / Makers', icon: Tag, count: brands.length },
          { id: 'warehouses', label: 'Warehouses & Vans', icon: Truck, count: warehouses.length },
          { id: 'charges', label: 'Service Charges & Labour', icon: DollarSign, count: charges.length },
          { id: 'history', label: 'Price Change Audit', icon: History, count: history.length },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.75rem 1.1rem',
                background: active ? 'var(--bg-secondary)' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                fontSize: '0.9rem'
              }}
            >
              <Icon size={16} />
              {t.label}
              <span style={{ fontSize: '0.75rem', background: 'var(--border)', padding: '2px 6px', borderRadius: 10 }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34, width: '100%' }}
          />
        </div>

        {tab !== 'history' && (
          <button
            className="btn btn-primary"
            onClick={() => setEditModal({ type: tab, data: null })}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={16} /> Add {tab === 'models' ? 'Model' : tab === 'categories' ? 'Category' : tab === 'brands' ? 'Brand' : tab === 'warehouses' ? 'Location / Van' : 'Charge Rule'}
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB 1: PRODUCT MODELS */}
      {/* ---------------------------------------------------- */}
      {tab === 'models' && (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Model #</th>
                <th style={{ padding: '0.75rem' }}>Product / Brand</th>
                <th style={{ padding: '0.75rem' }}>Capacity</th>
                <th style={{ padding: '0.75rem' }}>Temp Range</th>
                <th style={{ padding: '0.75rem' }}>Refrigerant</th>
                <th style={{ padding: '0.75rem' }}>Electrical</th>
                <th style={{ padding: '0.75rem' }}>Purchase Cost</th>
                <th style={{ padding: '0.75rem' }}>Selling Price</th>
                <th style={{ padding: '0.75rem' }}>Catalogue Ref</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No product models found. Click "+ Add Model" to create technical models and catalogue references.
                  </td>
                </tr>
              ) : (
                models
                  .filter(m => (m.model_number || '').toLowerCase().includes(search.toLowerCase()) || (m.brand_name || '').toLowerCase().includes(search.toLowerCase()))
                  .map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{m.model_number}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontWeight: 500 }}>{m.product_name || 'Generic'}</span>
                        {m.brand_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.brand_name}</div>}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {m.capacity ? `${m.capacity} ${m.capacity_unit || 'TR'}` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {m.temp_range_min !== null && m.temp_range_max !== null ? `${m.temp_range_min}°C to ${m.temp_range_max}°C` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {m.refrigerant ? <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>{m.refrigerant}</span> : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{m.voltage_phase || '-'}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>₹{m.purchase_cost || 0}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: '#16a34a' }}>₹{m.selling_price || 0}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {m.catalogue_ref ? `${m.catalogue_ref} (p.${m.catalogue_page || '1'})` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setEditModal({ type: 'models', data: m })} title="Edit">
                          <Edit2 size={15} />
                        </button>
                        &nbsp;
                        <button
                          className="icon-btn text-danger"
                          onClick={() => {
                            confirmAction('Delete this model?', async () => {
                              try {
                                await deleteProductModel(m.id);
                                toast('Model deleted', 'info');
                                loadAll();
                              } catch (e) {
                                toast(e.message, 'error');
                              }
                            });
                          }}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: CATEGORIES */}
      {/* ---------------------------------------------------- */}
      {tab === 'categories' && (
        <div className="glass-panel">
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Category Name</th>
                <th style={{ padding: '0.75rem' }}>Description</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No product categories configured yet.
                  </td>
                </tr>
              ) : (
                categories
                  .filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()))
                  .map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{c.description || '-'}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setEditModal({ type: 'categories', data: c })}>
                          <Edit2 size={15} />
                        </button>
                        &nbsp;
                        <button
                          className="icon-btn text-danger"
                          onClick={() => {
                            confirmAction(`Delete category "${c.name}"?`, async () => {
                              try {
                                await deleteCategory(c.id);
                                toast('Category deleted', 'info');
                                loadAll();
                              } catch (e) {
                                toast(e.message, 'error');
                              }
                            });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: BRANDS */}
      {/* ---------------------------------------------------- */}
      {tab === 'brands' && (
        <div className="glass-panel">
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Brand / Maker Name</th>
                <th style={{ padding: '0.75rem' }}>Description / Specialization</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No brands configured yet.
                  </td>
                </tr>
              ) : (
                brands
                  .filter(b => (b.name || '').toLowerCase().includes(search.toLowerCase()))
                  .map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{b.name}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{b.description || '-'}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setEditModal({ type: 'brands', data: b })}>
                          <Edit2 size={15} />
                        </button>
                        &nbsp;
                        <button
                          className="icon-btn text-danger"
                          onClick={() => {
                            confirmAction(`Delete brand "${b.name}"?`, async () => {
                              try {
                                await deleteBrand(b.id);
                                toast('Brand deleted', 'info');
                                loadAll();
                              } catch (e) {
                                toast(e.message, 'error');
                              }
                            });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 4: WAREHOUSES & VANS */}
      {/* ---------------------------------------------------- */}
      {tab === 'warehouses' && (
        <div className="glass-panel">
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Location Code</th>
                <th style={{ padding: '0.75rem' }}>Name</th>
                <th style={{ padding: '0.75rem' }}>Type</th>
                <th style={{ padding: '0.75rem' }}>Assigned Technician / Driver</th>
                <th style={{ padding: '0.75rem' }}>Address / Route</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map(w => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 700 }}>{w.code}</td>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{w.name}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600,
                      background: w.type === 'van' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                      color: w.type === 'van' ? '#ca8a04' : '#2563eb'
                    }}>
                      {w.type === 'van' ? 'Technician Van Stock' : w.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>{w.assigned_user_name || '-'}</td>
                  <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{w.address || '-'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <button className="icon-btn" onClick={() => setEditModal({ type: 'warehouses', data: w })}>
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 5: CHARGES & LABOUR */}
      {/* ---------------------------------------------------- */}
      {tab === 'charges' && (
        <div className="glass-panel">
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Charge Name</th>
                <th style={{ padding: '0.75rem' }}>Category</th>
                <th style={{ padding: '0.75rem' }}>Default Rate (₹)</th>
                <th style={{ padding: '0.75rem' }}>GST %</th>
                <th style={{ padding: '0.75rem' }}>SAC Code</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {charges.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No service charge rules configured yet.
                  </td>
                </tr>
              ) : (
                charges.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{c.charge_type}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>₹{c.default_rate}</td>
                    <td style={{ padding: '0.75rem' }}>{c.tax_percent}%</td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{c.hsn_sac || '-'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button className="icon-btn" onClick={() => setEditModal({ type: 'charges', data: c })}>
                        <Edit2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 6: PRICE CHANGE AUDIT */}
      {/* ---------------------------------------------------- */}
      {tab === 'history' && (
        <div className="glass-panel">
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Date & Time</th>
                <th style={{ padding: '0.75rem' }}>Product / Model</th>
                <th style={{ padding: '0.75rem' }}>Purchase Cost (Old → New)</th>
                <th style={{ padding: '0.75rem' }}>Selling Price (Old → New)</th>
                <th style={{ padding: '0.75rem' }}>Changed By</th>
                <th style={{ padding: '0.75rem' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No price changes logged yet. Every cost or price update is automatically recorded here.
                  </td>
                </tr>
              ) : (
                history.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{h.changed_at}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                      {h.product_name} {h.model_number ? `(${h.model_number})` : ''}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      ₹{h.old_cost || 0} → <span style={{ fontWeight: 600 }}>₹{h.new_cost}</span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      ₹{h.old_price || 0} → <span style={{ fontWeight: 600, color: '#16a34a' }}>₹{h.new_price}</span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>{h.changed_by || 'Admin'}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{h.change_reason || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: EDIT / CREATE */}
      {/* ---------------------------------------------------- */}
      {editModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)',
            width: '100%', maxWidth: editModal.type === 'models' ? 700 : 500, maxHeight: '90vh', overflowY: 'auto',
            padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {editModal.data ? 'Edit' : 'Add New'} {editModal.type === 'models' ? 'Model' : editModal.type === 'categories' ? 'Category' : editModal.type === 'brands' ? 'Brand' : editModal.type === 'warehouses' ? 'Warehouse / Van' : 'Charge Item'}
              </h2>
              <button className="icon-btn" onClick={() => setEditModal(null)}>
                <X size={18} />
              </button>
            </div>

            {/* FORM: CATEGORIES */}
            {editModal.type === 'categories' && (
              <form onSubmit={handleSaveCategory}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Category Name *</label>
                  <input type="text" name="name" defaultValue={editModal.data?.name || ''} className="form-input" style={{ width: '100%' }} required />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Description</label>
                  <textarea name="description" defaultValue={editModal.data?.description || ''} className="form-input" style={{ width: '100%', height: 70 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Category</button>
                </div>
              </form>
            )}

            {/* FORM: BRANDS */}
            {editModal.type === 'brands' && (
              <form onSubmit={handleSaveBrand}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Brand / Maker Name *</label>
                  <input type="text" name="name" defaultValue={editModal.data?.name || ''} className="form-input" style={{ width: '100%' }} required />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Description</label>
                  <textarea name="description" defaultValue={editModal.data?.description || ''} className="form-input" style={{ width: '100%', height: 70 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Brand</button>
                </div>
              </form>
            )}

            {/* FORM: MODELS */}
            {editModal.type === 'models' && (
              <form onSubmit={handleSaveModel}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Base Product *</label>
                    <select name="product_id" defaultValue={editModal.data?.product_id || (products[0]?.id || '')} className="form-input" style={{ width: '100%' }} required>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.unit || 'Nos'})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Brand / Manufacturer</label>
                    <select name="brand_id" defaultValue={editModal.data?.brand_id || ''} className="form-input" style={{ width: '100%' }}>
                      <option value="">-- No Brand / Generic --</option>
                      {brands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Model Number / Name *</label>
                  <input type="text" name="model_number" defaultValue={editModal.data?.model_number || ''} className="form-input" placeholder="e.g. ZB15KQE-TFD / CR-300" style={{ width: '100%' }} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Capacity</label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <input type="number" step="any" name="capacity" defaultValue={editModal.data?.capacity ?? ''} className="form-input" placeholder="e.g. 2.5" style={{ flex: 1 }} />
                      <select name="capacity_unit" defaultValue={editModal.data?.capacity_unit || 'TR'} className="form-input" style={{ width: 85 }}>
                        <option value="TR">TR</option>
                        <option value="HP">HP</option>
                        <option value="Watts">Watts</option>
                        <option value="BTU/hr">BTU/hr</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Refrigerant</label>
                    <input type="text" name="refrigerant" defaultValue={editModal.data?.refrigerant || ''} className="form-input" placeholder="e.g. R404A, R134a, R22" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Temp Range (°C)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="number" step="any" name="temp_range_min" defaultValue={editModal.data?.temp_range_min ?? ''} className="form-input" placeholder="Min (e.g. -25)" style={{ width: '50%' }} />
                      <span>to</span>
                      <input type="number" step="any" name="temp_range_max" defaultValue={editModal.data?.temp_range_max ?? ''} className="form-input" placeholder="Max (e.g. -18)" style={{ width: '50%' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Voltage / Phase</label>
                    <input type="text" name="voltage_phase" defaultValue={editModal.data?.voltage_phase || ''} className="form-input" placeholder="e.g. 415V / 3Ph / 50Hz" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Purchase Cost (₹)</label>
                    <input type="number" step="any" name="purchase_cost" defaultValue={editModal.data?.purchase_cost ?? 0} className="form-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Default Selling Price (₹) *</label>
                    <input type="number" step="any" name="selling_price" defaultValue={editModal.data?.selling_price ?? 0} className="form-input" style={{ width: '100%' }} required />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Catalogue Document Reference</label>
                    <input type="text" name="catalogue_ref" defaultValue={editModal.data?.catalogue_ref || ''} className="form-input" placeholder="e.g. Emerson Ready Reckoner 2024" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Page #</label>
                    <input type="text" name="catalogue_page" defaultValue={editModal.data?.catalogue_page || ''} className="form-input" placeholder="e.g. 14" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Description / Application Notes</label>
                  <textarea name="description" defaultValue={editModal.data?.description || ''} className="form-input" style={{ width: '100%', height: 60 }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Model</button>
                </div>
              </form>
            )}

            {/* FORM: WAREHOUSES & VANS */}
            {editModal.type === 'warehouses' && (
              <form onSubmit={handleSaveWarehouse}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Location Code *</label>
                    <input type="text" name="code" defaultValue={editModal.data?.code || ''} className="form-input" placeholder="e.g. VAN-02" style={{ width: '100%' }} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Location Name *</label>
                    <input type="text" name="name" defaultValue={editModal.data?.name || ''} className="form-input" placeholder="e.g. Service Van #2 (North)" style={{ width: '100%' }} required />
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Location Type</label>
                  <select name="type" defaultValue={editModal.data?.type || 'van'} className="form-input" style={{ width: '100%' }}>
                    <option value="van">Field Service Engineer Van</option>
                    <option value="warehouse">Central Warehouse</option>
                    <option value="branch">Branch / Workshop Location</option>
                  </select>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Address / Coverage Area</label>
                  <textarea name="address" defaultValue={editModal.data?.address || ''} className="form-input" style={{ width: '100%', height: 60 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Location</button>
                </div>
              </form>
            )}

            {/* FORM: CHARGES */}
            {editModal.type === 'charges' && (
              <form onSubmit={handleSaveCharge}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Charge Name *</label>
                  <input type="text" name="name" defaultValue={editModal.data?.name || ''} className="form-input" placeholder="e.g. Compressor Replacement Labour" style={{ width: '100%' }} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Category</label>
                    <select name="charge_type" defaultValue={editModal.data?.charge_type || 'labour'} className="form-input" style={{ width: '100%' }}>
                      <option value="labour">Labour / Service Charge</option>
                      <option value="installation">Installation & Commissioning</option>
                      <option value="transport">Transport & Freight</option>
                      <option value="piping">Copper Piping & Insulation</option>
                      <option value="gas_charging">Refrigerant Gas Charging</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Default Rate (₹)</label>
                    <input type="number" step="any" name="default_rate" defaultValue={editModal.data?.default_rate ?? 0} className="form-input" style={{ width: '100%' }} required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>GST %</label>
                    <input type="number" step="any" name="tax_percent" defaultValue={editModal.data?.tax_percent ?? 18} className="form-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>SAC Code</label>
                    <input type="text" name="hsn_sac" defaultValue={editModal.data?.hsn_sac || '9987'} className="form-input" style={{ width: '100%' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Charge</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
