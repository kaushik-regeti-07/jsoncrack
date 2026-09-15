const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const initSqlJs = require('sql.js');
require('dotenv').config();

const SQLITE_PATH = path.join(__dirname, '..', 'business_data.db');

let SQL = null;
const sqlJsReady = initSqlJs().then(s => { SQL = s; });

function openSqliteDb() {
  if (!SQL) throw new Error('sql.js not initialized yet');
  if (!fs.existsSync(SQLITE_PATH)) throw new Error('business_data.db not found. Run flatten_to_sqlite.py first.');
  return new SQL.Database(fs.readFileSync(SQLITE_PATH));
}

function sqlAll(db, query, params) {
  const stmt = db.prepare(query);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function sqlGet(db, query, params) {
  const stmt = db.prepare(query);
  if (params) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

const SQL_TEMPLATES = {
  customer:    (msgId) => `SELECT *\nFROM customer_flat\nWHERE _message_id = '${msgId}';`,
  transaction: (msgId) => `SELECT *\nFROM transaction_flat\nWHERE _message_id = '${msgId}';`,
  document:    (msgId) => `SELECT *\nFROM document_flat\nWHERE _message_id = '${msgId}';`,
};

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/customer', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT message_id, message_content, created_dttm, process_status, source_system
      FROM otb_datastore1_data.ds_customer_message_inbound
      WHERE message_id IS NOT NULL AND message_content IS NOT NULL
      ORDER BY created_dttm DESC LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/transaction', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT message_id, message_content, created_dttm, process_status, source_system
      FROM otb_datastore1_data.ds_transaction_message_inbound
      WHERE message_id IS NOT NULL AND message_content IS NOT NULL
      ORDER BY created_dttm DESC LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/document', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT message_id, message_content, created_dttm, process_status, source_system
      FROM otb_datastore1_data.ds_document_message_inbound
      WHERE message_id IS NOT NULL AND message_content IS NOT NULL
      ORDER BY created_dttm DESC LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

const PG_TABLES = {
  customer:    'otb_datastore1_data.ds_customer_message_inbound',
  transaction: 'otb_datastore1_data.ds_transaction_message_inbound',
  document:    'otb_datastore1_data.ds_document_message_inbound',
};

const FLAT_TABLES = {
  customer:    'customer_flat',
  transaction: 'transaction_flat',
  document:    'document_flat',
};

app.get('/api/sql/ids/:type', async (req, res) => {
  const { type } = req.params;
  const pgTable = PG_TABLES[type];
  if (!pgTable) return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
  try {
    const result = await pool.query(`
      SELECT message_id, created_dttm FROM ${pgTable}
      WHERE message_id IS NOT NULL ORDER BY created_dttm DESC LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/sql/query/:type/:messageId', (req, res) => {
  const { type, messageId } = req.params;
  if (!SQL_TEMPLATES[type]) return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
  res.json({ success: true, query: SQL_TEMPLATES[type](messageId) });
});

app.get('/api/sql/flat/:type/:messageId', async (req, res) => {
  const { type, messageId } = req.params;
  const flatTable = FLAT_TABLES[type];
  if (!flatTable) return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
  try {
    await sqlJsReady;
    const db = openSqliteDb();
    const tableExists = sqlGet(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=$name`, { $name: flatTable });
    if (!tableExists) { db.close(); return res.json({ success: true, data: [], columns: [], warning: `Table '${flatTable}' not found. Run flatten_to_sqlite.py first.` }); }
    const rows = sqlAll(db, `SELECT * FROM "${flatTable}" WHERE _message_id = $id LIMIT 100`, { $id: messageId });
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    db.close();
    res.json({ success: true, data: rows, columns });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/explorer/columns/:type', async (req, res) => {
  const { type } = req.params;
  const flatTable = FLAT_TABLES[type];
  if (!flatTable) return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
  try {
    await sqlJsReady;
    const db = openSqliteDb();
    const tableExists = sqlGet(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=$name`, { $name: flatTable });
    if (!tableExists) { db.close(); return res.json({ success: true, columns: [], warning: `Table '${flatTable}' not found. Run flatten_to_sqlite.py first.` }); }
    const info = sqlAll(db, `PRAGMA table_info("${flatTable}")`);
    db.close();
    res.json({ success: true, columns: info.map(c => ({ name: c.name, type: c.type })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/explorer/top10/:type', async (req, res) => {
  const { type } = req.params;
  const flatTable = FLAT_TABLES[type];
  if (!flatTable) return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
  try {
    await sqlJsReady;
    const db = openSqliteDb();
    const tableExists = sqlGet(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=$name`, { $name: flatTable });
    if (!tableExists) { db.close(); return res.json({ success: true, data: [], columns: [], warning: `Table '${flatTable}' not found. Run flatten_to_sqlite.py first.` }); }
    const rows = sqlAll(db, `SELECT * FROM "${flatTable}" ORDER BY rowid DESC LIMIT 10`);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    db.close();
    res.json({ success: true, data: rows, columns });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/explorer/query', async (req, res) => {
  const { sql } = req.body;
  if (!sql || !sql.trim()) return res.status(400).json({ success: false, error: 'No SQL query provided.' });
  if (!sql.trim().toUpperCase().startsWith('SELECT')) return res.status(400).json({ success: false, error: 'Only SELECT queries are allowed.' });
  try {
    await sqlJsReady;
    const db = openSqliteDb();
    const rows = sqlAll(db, sql);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    db.close();
    res.json({ success: true, data: rows, columns, rowCount: rows.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '..', 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
