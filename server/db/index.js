import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'refrigeration.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database instance
export const db = new Database(DB_PATH, {
  // verbose: process.env.NODE_ENV === 'development' ? console.log : null,
});

// Enforce WAL mode and foreign key constraints
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schemaSql);

// Seed basic system roles and default warehouse if not present
const seedDefaults = () => {
  const roleCount = db.prepare('SELECT COUNT(*) as count FROM roles').get().count;
  if (roleCount === 0) {
    const insertRole = db.prepare('INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, ?, 1)');
    const roles = [
      ['admin', 'Administrator', 'Full system access and master configuration'],
      ['sales', 'Salesperson', 'Quotation and invoice generation'],
      ['inventory', 'Inventory Manager', 'Warehouse stock management and purchase bills'],
      ['service_mgr', 'Service Manager', 'Service dispatch, scheduling, and warranty tracking'],
      ['engineer', 'Field Service Engineer', 'Technician access for service visits and van stock consumption'],
      ['accountant', 'Accountant', 'GST returns, customer ledgers, and financial reports'],
    ];
    for (const [id, name, desc] of roles) {
      insertRole.run(id, name, desc);
    }
  }

  const whCount = db.prepare('SELECT COUNT(*) as count FROM warehouses').get().count;
  if (whCount === 0) {
    db.prepare(`
      INSERT INTO warehouses (id, code, name, type, address, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run('wh_main', 'MAIN-WH', 'Main Central Warehouse', 'warehouse', 'Central Facility');
  }
};

seedDefaults();

/**
 * Execute a function within an immediate SQLite transaction.
 * Guarantees ACID guarantees across multiple table writes.
 */
export function runInTransaction(fn) {
  const execute = db.transaction(fn);
  return execute.immediate();
}

/**
 * Audit log helper
 */
export function logAudit(userId, action, entityType, entityId, details) {
  try {
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId || 'system',
      action,
      entityType,
      entityId ? String(entityId) : null,
      details ? JSON.stringify(details) : null
    );
  } catch (err) {
    console.error('Failed to log audit event:', err.message);
  }
}

export default db;
