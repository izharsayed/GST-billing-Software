import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers, Tag, Cpu, IndianRupee, Truck, History, Plus, Edit2, Trash2, CheckCircle2,
  AlertCircle, Search, RefreshCw, X, ChevronLeft, ChevronRight, Copy, Check,
  Snowflake, AlertTriangle
} from 'lucide-react';
import {
  getCategories, saveCategory, deleteCategory,
  getBrands, saveBrand, deleteBrand,
  getProductModels, saveProductModel, deleteProductModel,
  getMasterProducts, getWarehouses, saveWarehouse,
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
  const [filterBrand, setFilterBrand] = useState('');
  const [filterApp, setFilterApp] = useState(''); // 'chiller' | 'freezer'
  const [filterRefrigerant, setFilterRefrigerant] = useState('');
  const [filterPrice, setFilterPrice] = useState(''); // 'zero' | 'priced'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [copiedId, setCopiedId] = useState(null);

  // Modals / forms
  const [editModal, setEditModal] = useState(null); // { type, data }

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cats, brds, prods, mods, whs, chgs, hist] = await Promise.all([
        getCategories().catch(() => []),
        getBrands().catch(() => []),
        getMasterProducts().catch(() => []),
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

  // Filter & Stats derivations
  const uniqueBrands = useMemo(() => {
    const set = new Set();
    models.forEach(m => {
      if (m.brand_name) set.add(m.brand_name);
    });
    return Array.from(set).sort();
  }, [models]);

  const uniqueRefrigerants = useMemo(() => {
    const set = new Set();
    models.forEach(m => {
      if (m.refrigerant) set.add(m.refrigerant);
    });
    return Array.from(set).sort();
  }, [models]);

  const freezerCount = useMemo(() => models.filter(m => m.temp_range_min !== null && m.temp_range_min <= -15).length, [models]);
  const chillerCount = useMemo(() => models.filter(m => m.temp_range_min !== null && m.temp_range_min > -15).length, [models]);
  const zeroPriceCount = useMemo(() => models.filter(m => !m.selling_price || Number(m.selling_price) === 0).length, [models]);

  const filteredModels = useMemo(() => {
    return models.filter(m => {
      if (search) {
        const q = search.toLowerCase();
        const matchModel = (m.model_number || '').toLowerCase().includes(q);
        const matchBrand = (m.brand_name || '').toLowerCase().includes(q);
        const matchProduct = (m.product_name || '').toLowerCase().includes(q);
        const matchCat = (m.catalogue_ref || '').toLowerCase().includes(q);
        if (!matchModel && !matchBrand && !matchProduct && !matchCat) return false;
      }
      if (filterBrand && m.brand_name !== filterBrand) return false;
      if (filterApp === 'freezer') {
        if (m.temp_range_min === null || m.temp_range_min > -15) return false;
      } else if (filterApp === 'chiller') {
        if (m.temp_range_min === null || m.temp_range_min <= -15) return false;
      } else if (filterApp === 'controller') {
        const isCtrl = (m.category_id === 'cat_controllers') ||
          (m.product_name || '').toLowerCase().includes('controller') ||
          (m.description || '').toLowerCase().includes('controller') ||
          (m.brand_name || '').toLowerCase().includes('dixell') ||
          (m.brand_name || '').toLowerCase().includes('sub-zero') ||
          (m.model_number || '').toUpperCase().startsWith('XR') ||
          (m.model_number || '').toUpperCase().startsWith('SZ') ||
          (m.model_number || '').toUpperCase().startsWith('ERC');
        if (!isCtrl) return false;
      }
      if (filterRefrigerant && m.refrigerant !== filterRefrigerant) return false;
      if (filterPrice === 'zero') {
        if (m.selling_price && Number(m.selling_price) > 0) return false;
      } else if (filterPrice === 'priced') {
        if (!m.selling_price || Number(m.selling_price) <= 0) return false;
      }
      return true;
    });
  }, [models, search, filterBrand, filterApp, filterRefrigerant, filterPrice]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterBrand, filterApp, filterRefrigerant, filterPrice, pageSize]);

  const totalPages = Math.ceil(filteredModels.length / pageSize) || 1;
  const paginatedModels = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredModels.slice(start, start + pageSize);
  }, [filteredModels, currentPage, pageSize]);

  const copyModelNumber = (text, id) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast(`Copied ${text}`, 'info');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

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

  const handleSaveCompressor = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const brandIdVal = fd.get('brand_id');
    const existingBrand = brands.find(b => b.id === brandIdVal);
    const customBrand = fd.get('brand_name_custom');

    const cduBaseProd = products.find(p => p.id === (existingBrand?.name === 'Daikin' ? 'prod_daikin_cdu' : 'prod_emerson_cdu'))
      || products.find(p => p.category_id === 'cat_cdu' || p.name?.toLowerCase().includes('condensing') || p.name?.toLowerCase().includes('compressor'))
      || products[0];

    const data = {
      id: editModal?.data?.id || undefined,
      product_id: editModal?.data?.product_id || cduBaseProd?.id || 'prod_emerson_cdu',
      brand_id: existingBrand ? existingBrand.id : null,
      brand_name: existingBrand ? existingBrand.name : (customBrand || 'Generic'),
      model_number: fd.get('model_number'),
      capacity: Number(fd.get('capacity')) || 0,
      capacity_unit: fd.get('capacity_unit') || 'kW',
      temp_range_min: fd.get('temp_range_min') !== '' ? Number(fd.get('temp_range_min')) : (fd.get('app_type') === 'freezer' ? -25 : 0),
      temp_range_max: fd.get('temp_range_max') !== '' ? Number(fd.get('temp_range_max')) : (fd.get('app_type') === 'freezer' ? -18 : 10),
      refrigerant: fd.get('refrigerant') || 'R404A',
      voltage_phase: fd.get('voltage_phase') || '415V / 3Ph / 50Hz',
      purchase_cost: Number(fd.get('purchase_cost')) || 0,
      selling_price: Number(fd.get('selling_price')) || 0,
      catalogue_ref: fd.get('catalogue_ref') || 'Custom Catalogue',
      catalogue_page: fd.get('catalogue_page') || '1',
      description: `${fd.get('compressor_type') || 'Compressor'} - ${fd.get('hp') ? fd.get('hp') + ' HP, ' : ''}${fd.get('description') || ''}`,
    };

    try {
      await saveProductModel(data);
      toast('Compressor / Condensing Unit saved successfully!', 'success');
      setEditModal(null);
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveController = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const brandIdVal = fd.get('brand_id');
    const existingBrand = brands.find(b => b.id === brandIdVal);
    const customBrand = fd.get('brand_name_custom');

    const ctrlBaseProd = products.find(p => p.category_id === 'cat_controllers' || p.id === 'prod_digital_controller' || p.name?.toLowerCase().includes('controller'))
      || products[0];

    const data = {
      id: editModal?.data?.id || undefined,
      product_id: editModal?.data?.product_id || ctrlBaseProd?.id || 'prod_digital_controller',
      category_id: 'cat_controllers',
      brand_id: existingBrand ? existingBrand.id : null,
      brand_name: existingBrand ? existingBrand.name : (customBrand || 'Dixell'),
      model_number: fd.get('model_number'),
      capacity: null,
      capacity_unit: 'NA',
      temp_range_min: fd.get('temp_range_min') !== '' ? Number(fd.get('temp_range_min')) : -40,
      temp_range_max: fd.get('temp_range_max') !== '' ? Number(fd.get('temp_range_max')) : 110,
      refrigerant: fd.get('refrigerant') || 'N/A',
      voltage_phase: fd.get('voltage_phase') || '230V / 1Ph / 50Hz',
      purchase_cost: Number(fd.get('purchase_cost')) || 0,
      selling_price: Number(fd.get('selling_price')) || 0,
      catalogue_ref: fd.get('catalogue_ref') || 'Standard Controller Catalogue',
      catalogue_page: fd.get('catalogue_page') || '1',
      description: `${fd.get('app_type_label') || 'Digital Controller'} | ${fd.get('relay_config') || 'Relay Output'} | ${fd.get('probes') || 'NTC Probes'}${fd.get('extra_notes') ? ' | ' + fd.get('extra_notes') : ''}`.trim(),
    };

    try {
      await saveProductModel(data);
      toast('Digital Temperature Controller saved successfully!', 'success');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Cpu className="text-primary" /> Refrigeration Masters & Engineering Config
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Central administration for models, technical specifications, multi-tier pricing, warehouses, and technician vans.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={loadAll}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Segmented Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        gap: '0.35rem',
        background: 'var(--bg-secondary)',
        padding: '5px',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        marginBottom: '1.25rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}>
        {[
          { id: 'models', label: 'Models & Technical Data', icon: Cpu, count: models.length },
          { id: 'categories', label: 'Product Categories', icon: Layers, count: categories.length },
          { id: 'brands', label: 'Brands / Makers', icon: Tag, count: brands.length },
          { id: 'warehouses', label: 'Warehouses & Vans', icon: Truck, count: warehouses.length },
          { id: 'charges', label: 'Service Charges & Labour', icon: IndianRupee, count: charges.length },
          { id: 'history', label: 'Price Change Audit', icon: History, count: history.length },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setSearch('');
                setFilterBrand('');
                setFilterApp('');
                setFilterRefrigerant('');
                setFilterPrice('');
                setCurrentPage(1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0.95rem',
                background: active ? 'var(--primary)' : 'transparent',
                border: 'none',
                color: active ? '#ffffff' : 'var(--text)',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                borderRadius: '7px',
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: active ? '0 2px 4px rgba(0,0,0,0.12)' : 'none'
              }}
            >
              <Icon size={15} style={{ opacity: active ? 1 : 0.75 }} />
              {t.label}
              <span style={{
                fontSize: '0.72rem',
                background: active ? 'rgba(255, 255, 255, 0.25)' : 'var(--border)',
                color: active ? '#ffffff' : 'var(--text-muted)',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 700
              }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* KPI Stats Strip (Models Tab only) */}
      {tab === 'models' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Cpu size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                Total Models
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                {models.length}
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'rgba(168, 85, 247, 0.12)', color: '#9333ea',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Tag size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                Active Brands
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                {uniqueBrands.length || brands.length}
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'rgba(14, 165, 233, 0.12)', color: '#0284c7',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Snowflake size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                Freezer Units
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0284c7' }}>
                {freezerCount}
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.12)', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                Chiller Units
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
                {chillerCount}
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: zeroPriceCount > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: zeroPriceCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.12)',
              color: zeroPriceCount > 0 ? '#d97706' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
                Needs Price Set
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: zeroPriceCount > 0 ? '#d97706' : 'var(--text)' }}>
                {zeroPriceCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Bar: Search, Filters & Action Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}>
        {/* Left Section: Search Input + 4 Filter Dropdowns in SAME ROW */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flex: '1 1 700px',
          minWidth: 0,
        }}>
          {/* Search Input with Clear button */}
          <div style={{ position: 'relative', width: 220, minWidth: 170, flexShrink: 0 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder={`Search ${tab === 'models' ? 'by model, brand, catalogue...' : tab}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: 32,
                paddingRight: search ? 28 : 10,
                width: '100%',
                fontSize: '0.85rem',
                height: 38,
                boxSizing: 'border-box'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--text-muted)'
                }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 4 Filters in the SAME ROW right next to Search bar */}
          {tab === 'models' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '0.5rem',
              flex: '1 1 auto',
              minWidth: 0,
            }}>
              {/* Brand Filter */}
              <select
                className="form-input"
                style={{
                  width: '100%',
                  minWidth: 0,
                  fontSize: '0.82rem',
                  padding: '0.42rem 1.6rem 0.42rem 0.6rem',
                  height: 38,
                  boxSizing: 'border-box',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
              >
                <option value="">All Brands ({uniqueBrands.length})</option>
                {uniqueBrands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* Application / Temp Filter */}
              <select
                className="form-input"
                style={{
                  width: '100%',
                  minWidth: 0,
                  fontSize: '0.82rem',
                  padding: '0.42rem 1.6rem 0.42rem 0.6rem',
                  height: 38,
                  boxSizing: 'border-box',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
                value={filterApp}
                onChange={(e) => setFilterApp(e.target.value)}
              >
                <option value="">All Applications</option>
                <option value="freezer">❄️ Freezer (≤ -15°C)</option>
                <option value="chiller">🟢 Chiller (&gt; -15°C)</option>
                <option value="controller">🎛️ Digital Controllers</option>
              </select>

              {/* Refrigerant Filter */}
              <select
                className="form-input"
                style={{
                  width: '100%',
                  minWidth: 0,
                  fontSize: '0.82rem',
                  padding: '0.42rem 1.6rem 0.42rem 0.6rem',
                  height: 38,
                  boxSizing: 'border-box',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
                value={filterRefrigerant}
                onChange={(e) => setFilterRefrigerant(e.target.value)}
              >
                <option value="">All Gases ({uniqueRefrigerants.length})</option>
                {uniqueRefrigerants.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {/* Price Status Filter */}
              <select
                className="form-input"
                style={{
                  width: '100%',
                  minWidth: 0,
                  fontSize: '0.82rem',
                  padding: '0.42rem 1.6rem 0.42rem 0.6rem',
                  height: 38,
                  boxSizing: 'border-box',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
                value={filterPrice}
                onChange={(e) => setFilterPrice(e.target.value)}
              >
                <option value="">All Pricing</option>
                <option value="priced">✅ Priced</option>
                <option value="zero">⚠️ Needs Price</option>
              </select>
            </div>
          )}

          {/* Reset Filters button if any active */}
          {tab === 'models' && (search || filterBrand || filterApp || filterRefrigerant || filterPrice) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch('');
                setFilterBrand('');
                setFilterApp('');
                setFilterRefrigerant('');
                setFilterPrice('');
              }}
              style={{
                fontSize: '0.8rem',
                padding: '0.42rem 0.7rem',
                height: 38,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                flexShrink: 0,
                boxSizing: 'border-box',
                whiteSpace: 'nowrap'
              }}
              title="Reset all filters"
            >
              <X size={13} /> Reset
            </button>
          )}
        </div>

        {/* Right Section: Action Buttons */}
        {tab !== 'history' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            {tab === 'models' && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setEditModal({ type: 'compressor', data: null })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    background: '#1d4ed8', fontSize: '0.85rem', padding: '0.45rem 0.85rem',
                    fontWeight: 600, height: 38, boxSizing: 'border-box',
                    boxShadow: '0 2px 4px rgba(29, 78, 216, 0.25)', whiteSpace: 'nowrap'
                  }}
                >
                  <span>❄️</span> Add Compressor / CDU
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditModal({ type: 'controller', data: null })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    fontSize: '0.85rem', padding: '0.45rem 0.85rem',
                    fontWeight: 600, height: 38, boxSizing: 'border-box',
                    whiteSpace: 'nowrap', borderColor: '#0284c7', color: '#0369a1',
                    background: 'rgba(2, 132, 199, 0.08)'
                  }}
                  title="Add Digital Temperature Controller (Dixell, Sub-Zero, Carel, Danfoss)"
                >
                  <span>🎛️</span> Add Controller
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditModal({ type: tab, data: null })}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontSize: '0.85rem', padding: '0.45rem 0.85rem',
                height: 38, boxSizing: 'border-box', whiteSpace: 'nowrap'
              }}
            >
              <Plus size={15} /> Add {tab === 'models' ? 'General Model' : tab === 'categories' ? 'Category' : tab === 'brands' ? 'Brand' : tab === 'warehouses' ? 'Location / Van' : 'Charge Rule'}
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB 1: PRODUCT MODELS */}
      {/* ---------------------------------------------------- */}
      {tab === 'models' && (
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ width: '100%', minWidth: 1050, textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 170 }}>Model #</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', minWidth: 200 }}>Product / Brand</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 105 }}>Capacity</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 160 }}>Temp Range</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 110 }}>Refrigerant</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 130 }}>Electrical</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 105, textAlign: 'right' }}>Cost</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 125, textAlign: 'right' }}>Selling Price</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', minWidth: 160 }}>Catalogue Ref</th>
                  <th style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', width: 85, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <AlertCircle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No matching models found</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Try clearing filters or search to view all models.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedModels.map(m => {
                    const isFreezer = m.temp_range_min !== null && m.temp_range_min <= -15;
                    const isCopied = copiedId === m.id;
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}>
                        {/* Model # */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
                              {m.model_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyModelNumber(m.model_number, m.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: isCopied ? '#16a34a' : 'var(--text-muted)', opacity: isCopied ? 1 : 0.6 }}
                              title="Copy model number"
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>

                        {/* Product / Brand */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <div>
                            {m.brand_name && (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.04em', color: '#2563eb', background: 'rgba(37,99,235,0.08)',
                                padding: '1px 5px', borderRadius: 3, display: 'inline-block', marginBottom: 2
                              }}>
                                {m.brand_name}
                              </span>
                            )}
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }} title={m.product_name || 'Generic'}>
                              {m.product_name || 'Generic'}
                            </div>
                          </div>
                        </td>

                        {/* Capacity */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                            {m.capacity_unit === 'NA' || m.capacity_unit === 'N/A'
                              ? (m.capacity ? `${m.capacity}` : 'NA')
                              : (m.capacity ? `${m.capacity} ${m.capacity_unit || 'kW'}` : '—')}
                          </span>
                        </td>

                        {/* Temp Range */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          {m.temp_range_min !== null && m.temp_range_max !== null ? (
                            <span style={{
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '2px 7px',
                              borderRadius: '5px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: isFreezer ? 'rgba(37, 99, 235, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                              color: isFreezer ? '#1d4ed8' : '#059669',
                              border: isFreezer ? '1px solid rgba(37, 99, 235, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                            }}>
                              <span>{isFreezer ? '❄️' : '🟢'}</span> {m.temp_range_min}°C ~ {m.temp_range_max}°C
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* Refrigerant */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          {m.refrigerant ? (
                            <span style={{
                              whiteSpace: 'nowrap',
                              background: 'rgba(14, 165, 233, 0.1)',
                              color: '#0284c7',
                              border: '1px solid rgba(14, 165, 233, 0.22)',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.78rem',
                              fontWeight: 700
                            }}>
                              {m.refrigerant}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* Electrical */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <span style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {m.voltage_phase || '—'}
                          </span>
                        </td>

                        {/* Purchase Cost */}
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right' }}>
                          <span style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {Number(m.purchase_cost) > 0 ? `₹${Number(m.purchase_cost).toLocaleString('en-IN')}` : '—'}
                          </span>
                        </td>

                        {/* Selling Price */}
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right' }}>
                          {Number(m.selling_price) > 0 ? (
                            <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#16a34a', fontSize: '0.88rem' }}>
                              ₹{Number(m.selling_price).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span style={{
                              whiteSpace: 'nowrap',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              color: '#d97706',
                              background: 'rgba(245, 158, 11, 0.1)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              Not set
                            </span>
                          )}
                        </td>

                        {/* Catalogue Ref */}
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} title={m.catalogue_ref ? `${m.catalogue_ref} (p.${m.catalogue_page || '1'})` : ''}>
                            {m.catalogue_ref ? (
                              <>
                                <span style={{ color: 'var(--text)' }}>{m.catalogue_ref}</span>
                                {m.catalogue_page && <span style={{ marginLeft: 4, opacity: 0.8 }}>(p.{m.catalogue_page})</span>}
                              </>
                            ) : '—'}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setEditModal({ type: 'models', data: m })}
                              title="Edit model"
                              style={{ padding: '4px 6px', borderRadius: '4px' }}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn text-danger"
                              onClick={() => {
                                confirmAction({
                                  title: `Delete model "${m.model_number}"?`,
                                  message: 'This will permanently remove this equipment model from your master catalog.',
                                  confirmLabel: 'Delete Model',
                                  tone: 'danger',
                                }, async () => {
                                  try {
                                    await deleteProductModel(m.id);
                                    toast('Model deleted', 'info');
                                    loadAll();
                                  } catch (e) {
                                    toast(e.message, 'error');
                                  }
                                });
                              }}
                              title="Delete model"
                              style={{ padding: '4px 6px', borderRadius: '4px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredModels.length > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Showing <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredModels.length)}</strong> of <strong>{filteredModels.length}</strong> models
                {filteredModels.length !== models.length && ` (filtered from ${models.length})`}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Rows:</span>
                  <select
                    className="form-input"
                    style={{ padding: '2px 6px', fontSize: '0.78rem', width: 'auto' }}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    style={{ padding: '3px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <span style={{ padding: '3px 8px', fontSize: '0.78rem', fontWeight: 600 }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    style={{ padding: '3px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: CATEGORIES */}
      {/* ---------------------------------------------------- */}
      {tab === 'categories' && (
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Category Name</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No product categories configured yet. Click "+ Add Category" to create one.
                  </td>
                </tr>
              ) : (
                categories
                  .filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()))
                  .map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{c.description || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setEditModal({ type: 'categories', data: c })} title="Edit">
                          <Edit2 size={14} />
                        </button>
                        &nbsp;
                        <button
                          className="icon-btn text-danger"
                          onClick={() => {
                            confirmAction({
                              title: `Delete category "${c.name}"?`,
                              message: 'Are you sure you want to delete this category?',
                              confirmLabel: 'Delete Category',
                              tone: 'danger',
                            }, async () => {
                              try {
                                await deleteCategory(c.id);
                                toast('Category deleted', 'info');
                                loadAll();
                              } catch (e) {
                                toast(e.message, 'error');
                              }
                            });
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
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
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Brand / Maker Name</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Description / Specialization</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No brands configured yet. Click "+ Add Brand" to add manufacturers.
                  </td>
                </tr>
              ) : (
                brands
                  .filter(b => (b.name || '').toLowerCase().includes(search.toLowerCase()))
                  .map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{b.name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{b.description || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setEditModal({ type: 'brands', data: b })} title="Edit">
                          <Edit2 size={14} />
                        </button>
                        &nbsp;
                        <button
                          className="icon-btn text-danger"
                          onClick={() => {
                            confirmAction({
                              title: `Delete brand "${b.name}"?`,
                              message: 'Are you sure you want to delete this brand?',
                              confirmLabel: 'Delete Brand',
                              tone: 'danger',
                            }, async () => {
                              try {
                                await deleteBrand(b.id);
                                toast('Brand deleted', 'info');
                                loadAll();
                              } catch (e) {
                                toast(e.message, 'error');
                              }
                            });
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
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
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Location Code</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Name</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Assigned Technician / Driver</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Address / Route</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map(w => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>{w.code}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{w.name}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600,
                      background: w.type === 'van' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                      color: w.type === 'van' ? '#ca8a04' : '#2563eb'
                    }}>
                      {w.type === 'van' ? 'Technician Van Stock' : w.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{w.assigned_user_name || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{w.address || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button className="icon-btn" onClick={() => setEditModal({ type: 'warehouses', data: w })} title="Edit">
                      <Edit2 size={14} />
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
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Charge Name</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Category</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Default Rate</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>GST %</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>SAC Code</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {charges.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No service charge rules configured yet.
                  </td>
                </tr>
              ) : (
                charges.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>{c.charge_type}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>₹{Number(c.default_rate).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.tax_percent}%</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{c.hsn_sac || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button className="icon-btn" onClick={() => setEditModal({ type: 'charges', data: c })} title="Edit">
                        <Edit2 size={14} />
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
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Date & Time</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Product / Model</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Cost (Old → New)</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Price (Old → New)</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Changed By</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No price changes logged yet. Every cost or price update is automatically recorded here.
                  </td>
                </tr>
              ) : (
                history.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{h.changed_at}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {h.product_name} {h.model_number ? `(${h.model_number})` : ''}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      ₹{h.old_cost || 0} → <span style={{ fontWeight: 600 }}>₹{h.new_cost}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      ₹{h.old_price || 0} → <span style={{ fontWeight: 600, color: '#16a34a' }}>₹{h.new_price}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{h.changed_by || 'Admin'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{h.change_reason || '—'}</td>
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
            width: '100%', maxWidth: editModal.type === 'models' || editModal.type === 'compressor' ? 700 : 500, maxHeight: '90vh', overflowY: 'auto',
            padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {editModal.data ? 'Edit' : 'Add New'} {editModal.type === 'models' ? 'Model' : editModal.type === 'compressor' ? 'Compressor / CDU' : editModal.type === 'controller' ? 'Digital Controller' : editModal.type === 'categories' ? 'Category' : editModal.type === 'brands' ? 'Brand' : editModal.type === 'warehouses' ? 'Warehouse / Van' : 'Charge Item'}
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

            {/* FORM: COMPRESSOR */}
            {editModal.type === 'compressor' && (
              <form onSubmit={handleSaveCompressor}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Brand / Manufacturer *
                    </label>
                    <select name="brand_id" className="form-input" style={{ width: '100%' }}>
                      {brands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                      <option value="custom">+ Other / Custom Brand</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Custom Brand Name (if not in list)
                    </label>
                    <input type="text" name="brand_name_custom" className="form-input" placeholder="e.g. Danfoss, Bitzer, Tecumseh" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Compressor Model Number *
                    </label>
                    <input type="text" name="model_number" className="form-input" placeholder="e.g. ZX076BE-TFD-451 / 4VES-10Y / MTZ50" style={{ width: '100%' }} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Compressor Technology
                    </label>
                    <select name="compressor_type" className="form-input" style={{ width: '100%' }}>
                      <option value="Scroll (High Efficiency)">Scroll (High Efficiency)</option>
                      <option value="Hermetic Reciprocating">Hermetic Reciprocating</option>
                      <option value="Semi-Hermetic Reciprocating">Semi-Hermetic Reciprocating</option>
                      <option value="Semi-Hermetic Screw">Semi-Hermetic Screw</option>
                      <option value="Rotary / Inverter">Rotary / Inverter</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Application
                    </label>
                    <select name="app_type" className="form-input" style={{ width: '100%' }}>
                      <option value="chiller">Chiller (+2°C to +8°C)</option>
                      <option value="freezer">Freezer (-18°C to -25°C)</option>
                      <option value="bmc">Milk Chiller (BMC)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Cooling Capacity (kW) *
                    </label>
                    <input type="number" step="any" name="capacity" className="form-input" placeholder="e.g. 3.8" style={{ width: '100%' }} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Motor Horsepower (HP)
                    </label>
                    <input type="number" step="any" name="hp" className="form-input" placeholder="e.g. 3.0" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Refrigerant
                    </label>
                    <select name="refrigerant" className="form-input" style={{ width: '100%' }}>
                      <option value="R404A">R404A (Eco-blend)</option>
                      <option value="R22">R22</option>
                      <option value="R134a">R134a</option>
                      <option value="R410A">R410A</option>
                      <option value="R448A/R449A">R448A / R449A</option>
                      <option value="R507">R507</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Electrical Power / Phase
                    </label>
                    <select name="voltage_phase" className="form-input" style={{ width: '100%' }}>
                      <option value="415V / 3Ph / 50Hz">415V / 3Ph / 50Hz (3-Phase)</option>
                      <option value="230V / 1Ph / 50Hz">230V / 1Ph / 50Hz (Single Phase)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Purchase Cost (₹)
                    </label>
                    <input type="number" step="any" name="purchase_cost" defaultValue={0} className="form-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Selling Price (₹) *
                    </label>
                    <input type="number" step="any" name="selling_price" defaultValue={0} className="form-input" style={{ width: '100%' }} required />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Catalogue / Source Ref
                    </label>
                    <input type="text" name="catalogue_ref" defaultValue="Custom Catalogue" className="form-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Description / Notes
                    </label>
                    <input type="text" name="description" placeholder="Acoustic enclosure, liquid receiver, etc." className="form-input" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ background: '#1d4ed8' }}>
                    Save Compressor / CDU
                  </button>
                </div>
              </form>
            )}

            {/* FORM: DIGITAL TEMPERATURE CONTROLLER */}
            {editModal.type === 'controller' && (
              <form onSubmit={handleSaveController}>
                {/* Brand Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Controller Brand / Maker *
                    </label>
                    <select
                      name="brand_id"
                      className="form-input"
                      style={{ width: '100%' }}
                      defaultValue={brands.find(b => b.name?.toLowerCase().includes('dixell'))?.id || brands[0]?.id}
                    >
                      {brands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                      <option value="custom">+ Other / Custom Brand</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Custom Brand Name (if not in list)
                    </label>
                    <input type="text" name="brand_name_custom" className="form-input" placeholder="e.g. Sub-Zero, Carel, Danfoss, Eliwell" style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Model Number & Application Mode */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Controller Model Number *
                    </label>
                    <input
                      type="text"
                      name="model_number"
                      defaultValue={editModal.data?.model_number || ''}
                      className="form-input"
                      placeholder="e.g. XR02CX-5N0C0 / XR06CX / SZ-7510P"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Application / Temperature Control Mode
                    </label>
                    <select name="app_type_label" className="form-input" style={{ width: '100%' }}>
                      <option value="Chiller Controller (Off-Cycle Defrost)">Chiller (+2°C to +8°C) — Off-Cycle Defrost</option>
                      <option value="Freezer Controller (Defrost & Fan Management)">Freezer (-18°C to -25°C) — Defrost & Fan Control</option>
                      <option value="Universal Microprocessor Controller">Universal Multi-Stage (-40°C to +50°C)</option>
                      <option value="Milk Chiller (BMC) Agitator Controller">Bulk Milk Chiller (BMC) & Agitator</option>
                      <option value="Dual Mode Heating & Cooling Controller">Dual Heating / Cooling Mode</option>
                    </select>
                  </div>
                </div>

                {/* Relay Outputs & Sensor Probes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Relay Outputs & Defrost Rating
                    </label>
                    <select name="relay_config" className="form-input" style={{ width: '100%' }}>
                      <option value="1 Relay (Compressor 20A / 8A) — Off-cycle Defrost">1 Relay (Compressor 20A / 8A) — Off-cycle</option>
                      <option value="2 Relays (Compressor 8A + Defrost 8A)">2 Relays (Compressor 8A + Defrost 8A)</option>
                      <option value="3 Relays (Compressor 8A + Defrost 8A + Evap Fan 8A)">3 Relays (Compressor + Defrost + Fan 8A)</option>
                      <option value="4 Relays (Compressor + Defrost + Fan + Alarm/Light)">4 Relays (Compressor + Defrost + Fan + Alarm)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Sensor Probe Inputs
                    </label>
                    <select name="probes" className="form-input" style={{ width: '100%' }}>
                      <option value="1 x NTC/PTC (Room Air Temperature)">1 × NTC/PTC (Room Air Temp)</option>
                      <option value="2 x NTC/PTC (Room Air + Evaporator Defrost Termination)">2 × NTC/PTC (Room Air + Defrost Termination)</option>
                      <option value="3 x NTC/PTC (Room + Defrost + Condenser/Aux)">3 × NTC/PTC (Room + Defrost + Condenser/Aux)</option>
                      <option value="PT100 / Thermocouple Input">PT100 / Thermocouple (Industrial)</option>
                    </select>
                  </div>
                </div>

                {/* Power Supply & Temperature Range */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Power Supply / Voltage
                    </label>
                    <select name="voltage_phase" defaultValue={editModal.data?.voltage_phase || '230V / 1Ph / 50Hz'} className="form-input" style={{ width: '100%' }}>
                      <option value="230V / 1Ph / 50Hz">230V AC ±10% / 50-60Hz (Standard)</option>
                      <option value="110V / 1Ph / 60Hz">110V AC / 60Hz</option>
                      <option value="12V AC/DC">12V AC/DC (Low Voltage)</option>
                      <option value="24V AC/DC">24V AC/DC (Low Voltage)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Control Temperature Range (°C)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="number" step="any" name="temp_range_min" defaultValue={editModal.data?.temp_range_min ?? -40} className="form-input" placeholder="Min" style={{ width: '50%' }} />
                      <span>to</span>
                      <input type="number" step="any" name="temp_range_max" defaultValue={editModal.data?.temp_range_max ?? 110} className="form-input" placeholder="Max" style={{ width: '50%' }} />
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Purchase Cost (₹)
                    </label>
                    <input type="number" step="any" name="purchase_cost" defaultValue={editModal.data?.purchase_cost || 0} className="form-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Selling Price (₹) *
                    </label>
                    <input type="number" step="any" name="selling_price" defaultValue={editModal.data?.selling_price || 0} className="form-input" style={{ width: '100%' }} required />
                  </div>
                </div>

                {/* Catalogue Ref & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Catalogue / Manufacturer Source Ref
                    </label>
                    <input type="text" name="catalogue_ref" defaultValue={editModal.data?.catalogue_ref || 'Digital Controller Spec Sheet'} className="form-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Features / Extra Notes
                    </label>
                    <input type="text" name="extra_notes" placeholder="e.g. RS485 Modbus, TTL port, built-in buzzer, IP65 front" className="form-input" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ background: '#0284c7' }}>
                    Save Controller
                  </button>
                </div>
              </form>
            )}

            {/* FORM: MODELS */}
            {editModal.type === 'models' && (
              <form onSubmit={handleSaveModel}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Base Product *</label>
                    <select name="product_id" defaultValue={editModal.data?.product_id || (products[0]?.id || 'prod_daikin_cdu')} className="form-input" style={{ width: '100%' }} required>
                      {products.length === 0 ? (
                        <>
                          <option value="prod_daikin_cdu">Daikin Commercial Condensing Unit (Set)</option>
                          <option value="prod_emerson_cdu">Emerson Cold Room Condensing Unit (Set)</option>
                          <option value="prod_daikin_evap">Daikin Air Cooling Unit (Evaporator) (Nos)</option>
                          <option value="prod_comm_evap">Commercial Air Cooling Unit (Evaporator) (Nos)</option>
                          <option value="prod_emerson_bmc">Emerson Bulk Milk Chiller Unit (Set)</option>
                        </>
                      ) : (
                        products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.unit || 'Nos'})</option>
                        ))
                      )}
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
                      <select name="capacity_unit" defaultValue={editModal.data?.capacity_unit === 'N/A' ? 'NA' : (editModal.data?.capacity_unit || 'TR')} className="form-input" style={{ width: 85 }}>
                        <option value="TR">TR</option>
                        <option value="kW">kW</option>
                        <option value="HP">HP</option>
                        <option value="Watts">Watts</option>
                        <option value="BTU/hr">BTU/hr</option>
                        <option value="NA">NA</option>
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
