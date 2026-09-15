"""
flatten_to_sqlite.py
====================
Step-by-step script to:
  1. Connect to PostgreSQL and fetch records from all 3 tables
  2. Flatten / explode the nested JSON in message_content using pandas
  3. Store the flattened data into a local SQLite database for business querying

Requirements:
  pip install pandas psycopg2-binary sqlalchemy python-dotenv
"""

import os
import json
import sqlite3
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

# ────────────
# STEP 1: Load database credentials from .env
# ─────────────────────────────────────────────
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), 'server', '.env'))

DB_HOST     = os.getenv('DB_HOST')
DB_PORT     = os.getenv('DB_PORT', '5432')
DB_NAME     = os.getenv('DB_NAME')
DB_USER     = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD', '').strip('"')   # remove surrounding quotes if any

SQLITE_PATH = os.path.join(os.path.dirname(__file__), 'business_data.db')

# ─────────────────────────────────────────────
# STEP 2: Connect to PostgreSQL via SQLAlchemy
# ─────────────────────────────────────────────
pg_url = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
pg_engine = create_engine(pg_url, connect_args={"sslmode": "require"})

# ─────────────────────────────────────────────
# STEP 3: Define the 3 source tables
# ─────────────────────────────────────────────
SOURCES = [
    {
        "name":       "customer",
        "table":      "otb_datastore1_data.ds_customer_message_inbound",
        "sqlite_tbl": "customer_flat"
    },
    {
        "name":       "transaction",
        "table":      "otb_datastore1_data.ds_transaction_message_inbound",
        "sqlite_tbl": "transaction_flat"
    },
    {
        "name":       "document",
        "table":      "otb_datastore1_data.ds_document_message_inbound",
        "sqlite_tbl": "document_flat"
    },
]

# ─────────────────────────────────────────────
# STEP 4: Helper — flatten one JSON object
# ─────────────────────────────────────────────
def flatten_json(obj, parent_key='', sep='.'):
    """
    Recursively flattens a nested dict/list into a single-level dict.
    Example:
      {"header": {"id": "abc"}}  →  {"header.id": "abc"}
    """
    items = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, (dict, list)):
                items.update(flatten_json(v, new_key, sep=sep))
            else:
                items[new_key] = v
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            new_key = f"{parent_key}{sep}{i}" if parent_key else str(i)
            if isinstance(v, (dict, list)):
                items.update(flatten_json(v, new_key, sep=sep))
            else:
                items[new_key] = v
    else:
        items[parent_key] = obj
    return items


# ─────────────────────────────────────────────
# STEP 5: Connect to SQLite
# ─────────────────────────────────────────────
sqlite_conn = sqlite3.connect(SQLITE_PATH)
print(f"✅ SQLite database ready at: {SQLITE_PATH}\n")


# ─────────────────────────────────────────────
# STEP 6: Process each source
# ─────────────────────────────────────────────
for src in SOURCES:
    print(f"{'─'*60}")
    print(f"📂 Processing: {src['name'].upper()}")

    # --- 6a: Fetch from PostgreSQL ---
    sql = f"""
        SELECT message_id, message_content, created_dttm, process_status, source_system
        FROM {src['table']}
        WHERE message_id IS NOT NULL
          AND message_content IS NOT NULL
        ORDER BY created_dttm DESC
        LIMIT 10
    """
    try:
        df_raw = pd.read_sql(sql, pg_engine)
        print(f"   ✅ Fetched {len(df_raw)} rows from PostgreSQL")
    except Exception as e:
        print(f"   ❌ Failed to fetch from PostgreSQL: {e}")
        continue

    if df_raw.empty:
        print(f"   ⚠️  No data found, skipping.")
        continue

    # --- 6b: Parse message_content column (JSON string or dict) ---
    def safe_parse(val):
        if isinstance(val, dict):
            return val
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return {}
        return {}

    df_raw['_parsed'] = df_raw['message_content'].apply(safe_parse)

    # --- 6c: Flatten each JSON object ---
    flattened_rows = []
    for _, row in df_raw.iterrows():
        flat = flatten_json(row['_parsed'])
        # Add metadata columns alongside the flattened JSON fields
        flat['_message_id']     = row['message_id']
        flat['_created_dttm']   = str(row['created_dttm'])
        flat['_process_status'] = row['process_status']
        flat['_source_system']  = row['source_system']
        flattened_rows.append(flat)

    df_flat = pd.DataFrame(flattened_rows)

    # Move metadata columns to the front
    meta_cols = ['_message_id', '_created_dttm', '_process_status', '_source_system']
    other_cols = [c for c in df_flat.columns if c not in meta_cols]
    df_flat = df_flat[meta_cols + other_cols]

    # ── Drop fully empty columns
    df_flat = df_flat.dropna(axis=1, how='all')

    # ── Recalculate other_cols after dropping empty ones (meta cols always kept)
    available_other_cols = [c for c in df_flat.columns if c not in meta_cols]

    # ── Rank by how many non-null values each column has (most populated first)
    non_null_counts = df_flat[available_other_cols].notna().sum().sort_values(ascending=False)

    # ── Keep top 95 most populated business columns + 4 meta = 99 total (safe for DBeaver)
    MAX_BUSINESS_COLS = 95
    top_cols = list(non_null_counts.head(MAX_BUSINESS_COLS).index)
    df_flat = df_flat[meta_cols + top_cols]

    print(f"   ✅ Flattened into {len(df_flat)} rows × {len(df_flat.columns)} columns (top {MAX_BUSINESS_COLS} most-populated fields)")

    # --- 6d: Store into SQLite ---
    df_flat.to_sql(src['sqlite_tbl'], sqlite_conn, if_exists='replace', index=False)
    print(f"   ✅ Stored in SQLite table: '{src['sqlite_tbl']}'")

    # --- 6e: Show sample columns ---
    print(f"   📋 Sample columns: {list(df_flat.columns[:8])}")

    # --- 6f: Validate by querying SQLite immediately after storing ---
    print(f"   🔍 Validating data in SQLite table '{src['sqlite_tbl']}':")
    df_check = pd.read_sql(f"SELECT * FROM {src['sqlite_tbl']} LIMIT 10", sqlite_conn)
    print(df_check[['_message_id', '_created_dttm', '_process_status', '_source_system']].to_string(index=False))
    print(f"   ✅ {len(df_check)} row(s) confirmed in SQLite\n")


# ─────────────────────────────────────────────
# STEP 7: Done — show available tables + run final queries
# ─────────────────────────────────────────────
print(f"\n{'─'*60}")
cursor = sqlite_conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
print(f"✅ SQLite tables available for querying: {tables}")

# ─────────────────────────────────────────────
# STEP 8: Run sample business queries
# ─────────────────────────────────────────────
print(f"\n{'─'*60}")
print("📊 STEP 8: Running sample business queries...\n")

for tbl in tables:
    print(f"\n{'='*60}")
    print(f"📋 Table: {tbl}  — Top 10 rows")
    print(f"{'='*60}")
    try:
        df_q = pd.read_sql(f"SELECT * FROM {tbl} LIMIT 10", sqlite_conn)
        # Show only metadata columns for readability
        show_cols = [c for c in df_q.columns if c.startswith('_')]
        if show_cols:
            print(df_q[show_cols].to_string(index=False))
        else:
            print(df_q.to_string(index=False))
        print(f"\n   ✅ {len(df_q)} rows returned")
    except Exception as e:
        print(f"   ❌ Query failed: {e}")

    print(f"\n🔢 Row count for {tbl}:")
    try:
        count = pd.read_sql(f"SELECT COUNT(*) as total FROM {tbl}", sqlite_conn)
        print(f"   Total rows: {count['total'][0]}")
    except Exception as e:
        print(f"   ❌ Count failed: {e}")

print(f"\n{'─'*60}")
print(f"🎉 Done! Open 'business_data.db' with DBeaver or DB Browser for SQLite.")
print(f"   Example SQL queries:")
print(f"   SELECT * FROM customer_flat LIMIT 10;")
print(f"   SELECT * FROM transaction_flat WHERE _process_status = 'Completed';")
print(f"   SELECT * FROM document_flat ORDER BY _created_dttm DESC LIMIT 5;")

sqlite_conn.close()
