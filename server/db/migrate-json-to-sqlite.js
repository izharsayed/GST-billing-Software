import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, runInTransaction } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

export function migrateJsonToSqlite() {
  const summary = {
    profiles: 0,
    products: 0,
    clients: 0,
    bills: 0,
    purchases: 0,
    skipped: false,
    errors: [],
  };

  // Check if migration has already been executed
  const checkMigration = db.prepare("SELECT value FROM business_settings WHERE key = 'sqlite_migrated_at'").get();
  if (checkMigration) {
    summary.skipped = true;
    return summary;
  }

  console.log('[Migration] Starting JSON -> SQLite migration...');

  runInTransaction(() => {
    // 1. Migrate profile.json
    const profilePath = path.join(DATA_DIR, 'profile.json');
    if (fs.existsSync(profilePath)) {
      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        db.prepare(`
          INSERT INTO business_settings (key, value, updated_at)
          VALUES ('business_profile', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(JSON.stringify(profile));
        summary.profiles++;
      } catch (err) {
        summary.errors.push(`profile.json: ${err.message}`);
      }
    }

    // 2. Migrate Clients -> Customers & Customer Sites
    const clientsDir = path.join(DATA_DIR, 'clients');
    if (fs.existsSync(clientsDir)) {
      const clientFiles = fs.readdirSync(clientsDir).filter(f => f.endsWith('.json'));
      const insertCustomer = db.prepare(`
        INSERT INTO customers (id, name, company_name, phone, email, gstin, pan, billing_address, state, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, gstin = excluded.gstin
      `);
      const insertSite = db.prepare(`
        INSERT INTO customer_sites (id, customer_id, site_name, address, state, pin_code, contact_person, phone, is_active)
        VALUES (?, ?, 'Primary Site', ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO NOTHING
      `);

      for (const file of clientFiles) {
        try {
          const client = JSON.parse(fs.readFileSync(path.join(clientsDir, file), 'utf-8'));
          const id = client.id || file.replace('.json', '');
          insertCustomer.run(
            id,
            client.name || 'Unnamed Client',
            client.companyName || client.name || '',
            client.phone || '',
            client.email || '',
            client.gstin || '',
            client.pan || '',
            client.address || '',
            client.state || '',
            client.notes || ''
          );
          insertSite.run(
            'site_' + id,
            id,
            client.address || '',
            client.state || '',
            client.pin || '',
            client.name || '',
            client.phone || ''
          );
          summary.clients++;
        } catch (err) {
          summary.errors.push(`client ${file}: ${err.message}`);
        }
      }
    }

    // 3. Migrate Products -> Products, Prices & Inventory Balances
    const productsDir = path.join(DATA_DIR, 'products');
    if (fs.existsSync(productsDir)) {
      const productFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));
      const insertProduct = db.prepare(`
        INSERT INTO products (id, sku, name, unit, hsn_sac, tax_percent, product_type, track_inventory, min_reorder_qty, description, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 'goods', 1, 5, ?, 1)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, tax_percent = excluded.tax_percent
      `);
      const insertPrice = db.prepare(`
        INSERT INTO product_prices (id, product_id, purchase_cost, selling_price)
        VALUES (?, ?, ?, ?)
      `);
      const insertBalance = db.prepare(`
        INSERT INTO inventory_balances (id, warehouse_id, product_id, quantity, updated_at)
        VALUES (?, 'wh_main', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = excluded.quantity
      `);

      for (const file of productFiles) {
        try {
          const prod = JSON.parse(fs.readFileSync(path.join(productsDir, file), 'utf-8'));
          const id = prod.id || file.replace('.json', '');
          const purchaseCost = Number(prod.purchasePrice) || 0;
          const sellingPrice = Number(prod.sellingPrice ?? prod.rate ?? 0);
          const stockQty = Number(prod.stock) || 0;

          insertProduct.run(
            id,
            prod.sku || '',
            prod.name || 'Unnamed Product',
            prod.unit || 'Pcs',
            prod.hsn || '',
            Number(prod.taxPercent) || 0,
            prod.description || ''
          );

          insertPrice.run('prc_' + id, id, purchaseCost, sellingPrice);
          insertBalance.run('bal_wh_main_' + id, id, stockQty);
          summary.products++;
        } catch (err) {
          summary.errors.push(`product ${file}: ${err.message}`);
        }
      }
    }

    // 4. Migrate Bills -> Sales & Sale Items
    const billsDir = path.join(DATA_DIR, 'bills');
    if (fs.existsSync(billsDir)) {
      const billFiles = fs.readdirSync(billsDir).filter(f => f.endsWith('.json'));
      const insertSale = db.prepare(`
        INSERT INTO sales (
          id, invoice_number, invoice_type, invoice_date, due_date, customer_id,
          status, currency, subtotal, discount_amount, tax_amount, total_amount,
          paid_amount, warehouse_id, notes, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wh_main', ?, ?)
        ON CONFLICT(id) DO UPDATE SET raw_json = excluded.raw_json, status = excluded.status
      `);
      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, product_id, description, hsn_sac, quantity, unit,
          unit_price, discount_percent, tax_percent, tax_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const file of billFiles) {
        try {
          const bill = JSON.parse(fs.readFileSync(path.join(billsDir, file), 'utf-8'));
          const id = bill.id || bill.invoiceNumber || file.replace('.json', '');
          const items = bill.data?.items || bill.items || [];
          const totals = bill.data?.totals || {};
          const client = bill.data?.client || {};

          let customerId = null;
          if (client.name) {
            // Find or create customer
            const existing = db.prepare('SELECT id FROM customers WHERE name = ?').get(client.name);
            if (existing) {
              customerId = existing.id;
            } else {
              customerId = 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
              db.prepare(`
                INSERT INTO customers (id, name, gstin, billing_address, state, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
              `).run(customerId, client.name, client.gstin || '', client.address || '', client.state || '');
            }
          }

          insertSale.run(
            id,
            bill.invoiceNumber || id,
            bill.invoiceType || 'tax_invoice',
            bill.invoiceDate || new Date().toISOString().split('T')[0],
            bill.data?.details?.dueDate || bill.invoiceDate || null,
            customerId,
            bill.status || 'unpaid',
            bill.currency || 'INR',
            Number(totals.subtotal) || 0,
            Number(totals.totalDiscount) || 0,
            Number(bill.totalTaxAmount ?? totals.totalTax ?? 0),
            Number(bill.totalAmount ?? totals.grandTotal ?? 0),
            Number(bill.paidAmount) || 0,
            bill.data?.terms || bill.terms || '',
            JSON.stringify(bill) // Complete backward compatibility guarantee
          );

          // Insert items
          for (let i = 0; i < items.length; i++) {
            const itm = items[i];
            insertSaleItem.run(
              'item_' + id + '_' + i,
              id,
              itm.productId || null,
              itm.name || itm.description || 'Item',
              itm.hsn || '',
              Number(itm.quantity) || 1,
              itm.unit || 'Nos',
              Number(itm.rate ?? itm.unitPrice ?? 0),
              Number(itm.discount) || 0,
              Number(itm.taxPercent) || 0,
              Number(itm.taxAmount) || 0,
              Number(itm.total ?? itm.amount ?? 0)
            );
          }
          summary.bills++;
        } catch (err) {
          summary.errors.push(`bill ${file}: ${err.message}`);
        }
      }
    }

    // 5. Record that migration succeeded
    db.prepare(`
      INSERT INTO business_settings (key, value, updated_at)
      VALUES ('sqlite_migrated_at', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = CURRENT_TIMESTAMP
    `).run();
  });

  console.log('[Migration] Migration complete:', summary);
  return summary;
}

// Run standalone if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = migrateJsonToSqlite();
  console.log('Result:', JSON.stringify(result, null, 2));
}
