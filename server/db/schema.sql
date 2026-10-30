-- Schema for Refrigeration POS, Inventory, and Service Management
PRAGMA foreign_keys = ON;

-- 1. System & Settings
CREATE TABLE IF NOT EXISTS business_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users, Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_id TEXT REFERENCES roles(id),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Geography & Locations
CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  pin_codes TEXT, -- Comma-separated or JSON array of PINs
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('warehouse', 'van', 'branch', 'other')),
  assigned_user_id TEXT REFERENCES users(id), -- e.g. technician assigned to this van
  address TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  gstin TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Product Catalog & Models
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  parent_id TEXT REFERENCES product_categories(id),
  description TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES product_categories(id),
  brand_id TEXT REFERENCES brands(id),
  unit TEXT NOT NULL DEFAULT 'Pcs',
  hsn_sac TEXT,
  tax_percent REAL DEFAULT 18.0,
  product_type TEXT NOT NULL DEFAULT 'goods' CHECK(product_type IN ('goods', 'service', 'charge')),
  track_inventory INTEGER DEFAULT 1,
  min_reorder_qty REAL DEFAULT 5,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_models (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id),
  model_number TEXT NOT NULL,
  description TEXT,
  capacity REAL,
  capacity_unit TEXT, -- 'TR', 'HP', 'Watts', 'BTU/hr', etc.
  temp_range_min REAL, -- in °C
  temp_range_max REAL, -- in °C
  refrigerant TEXT, -- 'R404A', 'R134a', 'R410A', 'R22', 'R290', etc.
  voltage_phase TEXT, -- '230V / 1Ph / 50Hz' or '415V / 3Ph / 50Hz'
  catalogue_ref TEXT, -- e.g. 'Emerson Ready Reckoner 2024'
  catalogue_page TEXT,
  verification_status TEXT DEFAULT 'verified' CHECK(verification_status IN ('unverified', 'verified', 'needs_review')),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(brand_id, model_number)
);

CREATE TABLE IF NOT EXISTS model_specifications (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  spec_key TEXT NOT NULL,
  spec_value TEXT NOT NULL,
  unit TEXT,
  UNIQUE(model_id, spec_key)
);

-- 6. Prices & Additional Charges
CREATE TABLE IF NOT EXISTS product_prices (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model_id TEXT REFERENCES product_models(id) ON DELETE CASCADE,
  purchase_cost REAL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  min_selling_price REAL,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_change_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model_id TEXT REFERENCES product_models(id) ON DELETE CASCADE,
  old_cost REAL,
  new_cost REAL,
  old_price REAL,
  new_price REAL,
  changed_by TEXT,
  change_reason TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS charge_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  charge_type TEXT NOT NULL CHECK(charge_type IN ('labour', 'installation', 'transport', 'piping', 'gas_charging', 'other')),
  default_rate REAL NOT NULL DEFAULT 0,
  tax_percent REAL DEFAULT 18.0,
  hsn_sac TEXT DEFAULT '9987',
  is_active INTEGER DEFAULT 1
);

-- 7. Customers & Multi-Sites
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  pan TEXT,
  billing_address TEXT,
  state TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  phone TEXT,
  email TEXT,
  is_primary INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_sites (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  address TEXT,
  area_id TEXT REFERENCES areas(id),
  state TEXT,
  pin_code TEXT,
  contact_person TEXT,
  phone TEXT,
  access_notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Installed Equipment & Service
CREATE TABLE IF NOT EXISTS installed_equipment (
  id TEXT PRIMARY KEY,
  equipment_code TEXT UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  site_id TEXT NOT NULL REFERENCES customer_sites(id),
  product_id TEXT REFERENCES products(id),
  model_id TEXT REFERENCES product_models(id),
  serial_number TEXT,
  installation_date DATE,
  commissioned_by TEXT,
  sale_id TEXT, -- original invoice reference
  warranty_start DATE,
  warranty_end DATE,
  amc_status TEXT DEFAULT 'none' CHECK(amc_status IN ('none', 'active', 'expired')),
  amc_expiry DATE,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'relocated', 'decommissioned')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Multi-Location Inventory & Stock Ledger
CREATE TABLE IF NOT EXISTS inventory_balances (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('opening', 'purchase', 'sale', 'credit_note_return', 'transfer', 'service_consumption', 'adjustment', 'write_off')),
  product_id TEXT NOT NULL REFERENCES products(id),
  from_warehouse_id TEXT REFERENCES warehouses(id),
  to_warehouse_id TEXT REFERENCES warehouses(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pcs',
  reference_type TEXT, -- 'sale', 'purchase', 'service_visit', 'transfer'
  reference_id TEXT,
  user_id TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Sales, Invoices & Payments (with raw_json backwards-compatibility)
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'tax_invoice',
  invoice_date DATE NOT NULL,
  due_date DATE,
  customer_id TEXT REFERENCES customers(id),
  site_id TEXT REFERENCES customer_sites(id),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('draft', 'unpaid', 'partial', 'paid', 'cancelled')),
  currency TEXT DEFAULT 'INR',
  subtotal REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  warehouse_id TEXT REFERENCES warehouses(id),
  notes TEXT,
  raw_json TEXT, -- Full JSON payload to guarantee 100% legacy compatibility
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  model_id TEXT REFERENCES product_models(id),
  description TEXT NOT NULL,
  hsn_sac TEXT,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pcs',
  unit_price REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  tax_percent REAL DEFAULT 18.0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount REAL NOT NULL,
  payment_mode TEXT DEFAULT 'Bank Transfer',
  reference_number TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_models_product ON product_models(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_sites_customer ON customer_sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_installed_equipment_site ON installed_equipment(site_id);
CREATE INDEX IF NOT EXISTS idx_installed_equipment_serial ON installed_equipment(serial_number);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_lookup ON inventory_balances(warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(invoice_date);


-- 12. Technical Quotations & Cold-Room Sizing
CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  quotation_number TEXT UNIQUE NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  site_id TEXT REFERENCES customer_sites(id),
  quotation_date DATE NOT NULL,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'sent', 'accepted', 'rejected', 'converted')),
  converted_sale_id TEXT REFERENCES sales(id),
  currency TEXT DEFAULT 'INR',
  equipment_subtotal REAL DEFAULT 0,
  charges_subtotal REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  terms TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_technical_inputs (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  application_type TEXT NOT NULL, -- 'chiller', 'freezer', 'bmc', 'custom'
  length_ft REAL,
  width_ft REAL,
  height_ft REAL,
  volume_ft3 REAL,
  length_m REAL,
  width_m REAL,
  height_m REAL,
  volume_m3 REAL,
  target_temp_c REAL,
  ambient_temp_c REAL DEFAULT 43.0,
  insulation_puf_mm REAL DEFAULT 80,
  refrigerant_preference TEXT DEFAULT 'R404A',
  compressor_type TEXT DEFAULT 'scroll',
  daily_milk_liters REAL,
  batches INTEGER,
  calculated_load_kw REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS quotation_model_recommendations (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  cdu_model_id TEXT REFERENCES product_models(id),
  evap_model_id TEXT REFERENCES product_models(id),
  expansion_valve TEXT,
  expansion_orifice TEXT,
  solenoid_valve TEXT,
  solenoid_coil TEXT,
  controller_model TEXT,
  catalogue_ref TEXT,
  catalogue_page TEXT,
  selection_notes TEXT,
  is_overridden INTEGER DEFAULT 0,
  override_reason TEXT
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  model_id TEXT REFERENCES product_models(id),
  item_type TEXT DEFAULT 'equipment' CHECK(item_type IN ('equipment', 'component', 'accessory', 'labour', 'installation', 'transport', 'charge')),
  description TEXT NOT NULL,
  hsn_sac TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'Set',
  unit_price REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  tax_percent REAL DEFAULT 18.0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
