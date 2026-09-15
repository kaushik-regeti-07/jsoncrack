import React, { useState, useEffect, useRef, useCallback } from 'react';
import scbLogo from './scb.png';
import './App.css';
import JsonCrackViewer from './JsonCrackViewer';

const SOURCES = [
  { key: 'customer',    label: '\u{1F464} Customer',    icon: '\u{1F464}', apiPath: '/api/customer' },
  { key: 'transaction', label: '\u{1F4B3} Transaction',  icon: '\u{1F4B3}', apiPath: '/api/transaction' },
  { key: 'document',    label: '\u{1F4C4} Document',     icon: '\u{1F4C4}', apiPath: '/api/document' },
];

const SQL_SUB_TYPES = [
  { key: 'customer',    label: '\u{1F464} Customer',    icon: '\u{1F464}' },
  { key: 'transaction', label: '\u{1F4B3} Transaction',  icon: '\u{1F4B3}' },
  { key: 'document',    label: '\u{1F4C4} Document',     icon: '\u{1F4C4}' },
];

function App() {
  const [activeSection, setActiveSection] = useState(null);
  const [rowsMap, setRowsMap] = useState({ customer: [], transaction: [], document: [] });
  const [loadingMap, setLoadingMap] = useState({ customer: false, transaction: false, document: false });
  const [apiErrorMap, setApiErrorMap] = useState({ customer: null, transaction: null, document: null });
  const [selectedMessageId, setSelectedMessageId] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [jsonData, setJsonData] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // SQL Viewer state
  const [sqlPanelOpen, setSqlPanelOpen] = useState(false);
  const [sqlType, setSqlType] = useState(null);
  const [sqlMessageIds, setSqlMessageIds] = useState([]);
  const [sqlSelectedId, setSqlSelectedId] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlFlatRows, setSqlFlatRows] = useState([]);
  const [sqlFlatColumns, setSqlFlatColumns] = useState([]);
  const [sqlFlatWarning, setSqlFlatWarning] = useState('');
  const [sqlDropdownOpen, setSqlDropdownOpen] = useState(false);
  const [sqlIdsLoading, setSqlIdsLoading] = useState(false);
  const [sqlFlatLoading, setSqlFlatLoading] = useState(false);
  const [sqlIdsError, setSqlIdsError] = useState('');
  const [sqlFlatError, setSqlFlatError] = useState('');
  const sqlDropdownRef = useRef(null);
  const sqlPollRef = useRef(null);

  // Data Explorer state
  const [explorerType, setExplorerType] = useState(null);
  const [explorerColumns, setExplorerColumns] = useState([]);
  const [explorerColumnsLoading, setExplorerColumnsLoading] = useState(false);
  const [explorerColumnsWarning, setExplorerColumnsWarning] = useState('');
  const [explorerTop10, setExplorerTop10] = useState([]);
  const [explorerTop10Cols, setExplorerTop10Cols] = useState([]);
  const [explorerTop10Loading, setExplorerTop10Loading] = useState(false);
  const [explorerTop10Warning, setExplorerTop10Warning] = useState('');
  const [explorerTop10Error, setExplorerTop10Error] = useState('');
  const [explorerSql, setExplorerSql] = useState('');
  const [explorerQueryRows, setExplorerQueryRows] = useState([]);
  const [explorerQueryCols, setExplorerQueryCols] = useState([]);
  const [explorerQueryLoading, setExplorerQueryLoading] = useState(false);
  const [explorerQueryError, setExplorerQueryError] = useState('');
  const [explorerQueryRan, setExplorerQueryRan] = useState(false);
  const [sidebarSlid, setSidebarSlid] = useState(false); // true = metadata panel shown
  const [dragOverSql, setDragOverSql] = useState(false); // drag-over highlight for SQL textarea
  const [copiedCell, setCopiedCell] = useState(null); // tracks which cell was just copied
  const [hoveredCell, setHoveredCell] = useState(null); // tracks which cell is hovered
    const [hoveredHeader, setHoveredHeader] = useState(null); // tracks which header is hovered
    const [copiedHeader, setCopiedHeader] = useState(null); // tracks which header is just copied

  const copyToClipboard = (text, onSuccess) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {});
      return;
    }

    // Fallback for insecure contexts or older browsers.
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      if (document.execCommand('copy')) {
        onSuccess();
      }
    } catch (e) {
      // Intentionally ignore fallback errors.
    } finally {
      document.body.removeChild(textArea);
    }
  };

  // Fetch records from the API for a given source key
  const fetchRecords = (key) => {
    const src = SOURCES.find(s => s.key === key);
    if (!src) return;
    setLoadingMap(prev => ({ ...prev, [key]: true }));
    setApiErrorMap(prev => ({ ...prev, [key]: null }));
    fetch(src.apiPath)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Unknown server error');
        setRowsMap(prev => ({ ...prev, [key]: json.data }));
      })
      .catch(err => {
        setApiErrorMap(prev => ({ ...prev, [key]: err.message }));
      })
      .finally(() => {
        setLoadingMap(prev => ({ ...prev, [key]: false }));
      });
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (sqlDropdownRef.current && !sqlDropdownRef.current.contains(e.target)) {
        setSqlDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // SQL Viewer helpers
  const fetchSqlIds = useCallback((type) => {
    if (!type) return;
    setSqlIdsLoading(true);
    setSqlIdsError('');
    fetch(`/api/sql/ids/${type}`)
      .then(res => { if (!res.ok) throw new Error(`Server returned ${res.status}`); return res.json(); })
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Unknown error');
        setSqlMessageIds(json.data);
      })
      .catch(err => setSqlIdsError(err.message))
      .finally(() => setSqlIdsLoading(false));
  }, []);

  // Data Explorer helpers
  const fetchExplorerColumns = useCallback((type) => {
    setExplorerColumnsLoading(true);
    setExplorerColumnsWarning('');
    fetch(`/api/explorer/columns/${type}`)
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Error');
        setExplorerColumns(json.columns || []);
        setExplorerColumnsWarning(json.warning || '');
      })
      .catch(() => setExplorerColumns([]))
      .finally(() => setExplorerColumnsLoading(false));
  }, []);

  const fetchExplorerTop10 = useCallback((type) => {
    setExplorerTop10Loading(true);
    setExplorerTop10Warning('');
    setExplorerTop10Error('');
    fetch(`/api/explorer/top10/${type}`)
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Error');
        setExplorerTop10(json.data || []);
        setExplorerTop10Cols(json.columns || []);
        setExplorerTop10Warning(json.warning || '');
      })
      .catch(err => setExplorerTop10Error(err.message))
      .finally(() => setExplorerTop10Loading(false));
  }, []);

  const handleExplorerRunQuery = () => {
    if (!explorerSql.trim()) return;
    setExplorerQueryLoading(true);
    setExplorerQueryError('');
    setExplorerQueryRows([]);
    setExplorerQueryCols([]);
    setExplorerQueryRan(false);
    fetch('/api/explorer/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: explorerSql })
    })
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Query failed');
        setExplorerQueryRows(json.data || []);
        setExplorerQueryCols(json.columns || []);
        setExplorerQueryRan(true);
      })
      .catch(err => { setExplorerQueryError(err.message); setExplorerQueryRan(true); })
      .finally(() => setExplorerQueryLoading(false));
  };

  const handleExplorerTypeSelect = (type) => {
    setExplorerType(type);
    setSidebarSlid(true);
    setExplorerColumns([]);
    setExplorerTop10([]);
    setExplorerTop10Cols([]);
    setExplorerSql('');
    setExplorerQueryRows([]);
    setExplorerQueryCols([]);
    setExplorerQueryRan(false);
    setExplorerQueryError('');
    fetchExplorerColumns(type);
    fetchExplorerTop10(type);
  };

  const handleExplorerBack = () => {
    setSidebarSlid(false);
    setExplorerType(null);
    setExplorerColumns([]);
    setExplorerTop10([]);
    setExplorerTop10Cols([]);
    setExplorerSql('');
    setExplorerQueryRows([]);
    setExplorerQueryCols([]);
    setExplorerQueryRan(false);
    setExplorerQueryError('');
  };

  // Auto-refresh poll every 30s when a sql type is selected
  useEffect(() => {
    if (!sqlType) return;
    fetchSqlIds(sqlType);
    if (sqlPollRef.current) clearInterval(sqlPollRef.current);
    sqlPollRef.current = setInterval(() => fetchSqlIds(sqlType), 30000);
    return () => clearInterval(sqlPollRef.current);
  }, [sqlType, fetchSqlIds]);

  const handleSqlSubType = (type) => {
    setSqlType(type);
    setSqlSelectedId('');
    setSqlQuery('');
    setSqlFlatRows([]);
    setSqlFlatColumns([]);
    setSqlFlatWarning('');
    setSqlFlatError('');
    setSqlDropdownOpen(false);
  };

  const handleSqlSelectId = (row) => {
    const msgId = row.message_id;
    setSqlSelectedId(msgId);
    setSqlDropdownOpen(false);
    setSqlFlatRows([]);
    setSqlFlatColumns([]);
    setSqlFlatWarning('');
    setSqlFlatError('');

    // Fetch SQL query text
    fetch(`/api/sql/query/${sqlType}/${encodeURIComponent(msgId)}`)
      .then(res => res.json())
      .then(json => { if (json.success) setSqlQuery(json.query); })
      .catch(() => {});

    // Fetch flat table rows
    setSqlFlatLoading(true);
    fetch(`/api/sql/flat/${sqlType}/${encodeURIComponent(msgId)}`)
      .then(res => { if (!res.ok) throw new Error(`Server returned ${res.status}`); return res.json(); })
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Unknown error');
        setSqlFlatRows(json.data || []);
        setSqlFlatColumns(json.columns || []);
        setSqlFlatWarning(json.warning || '');
      })
      .catch(err => setSqlFlatError(err.message))
      .finally(() => setSqlFlatLoading(false));
  };

  const handleSqlPanelToggle = () => {
    const opening = !sqlPanelOpen;
    setSqlPanelOpen(opening);
    if (opening) {
      setActiveSection(null);
      setSelectedMessageId('');
      setShowViewer(false);
      // reset explorer
      setSidebarSlid(false);
      setExplorerType(null);
      setExplorerColumns([]);
      setExplorerTop10([]);
      setExplorerTop10Cols([]);
      setExplorerSql('');
      setExplorerQueryRows([]);
      setExplorerQueryCols([]);
      setExplorerQueryRan(false);
    } else {
      setSqlType(null);
      setSqlSelectedId('');
      setSqlQuery('');
      setSqlFlatRows([]);
      setSqlFlatColumns([]);
      setSqlMessageIds([]);
      if (sqlPollRef.current) clearInterval(sqlPollRef.current);
      setSidebarSlid(false);
      setExplorerType(null);
    }
  };

  const handleSourceButton = (key) => {
    setActiveSection(key);
    setSqlPanelOpen(false);
    setSqlType(null);
    setSqlSelectedId('');
    setSqlQuery('');
    setSqlFlatRows([]);
    setSqlFlatColumns([]);
    setSqlMessageIds([]);
    if (sqlPollRef.current) clearInterval(sqlPollRef.current);
    setSelectedMessageId('');
    setError('');
    setShowViewer(false);
    fetchRecords(key);
  };

  const handleSelectMessageId = (row) => {
    setSelectedMessageId(row.message_id);
    setDropdownOpen(false);
    setError('');
    setLoading(true);
    try {
      const parsed = typeof row.message_content === 'string'
        ? JSON.parse(row.message_content)
        : row.message_content;
      setJsonData(parsed);
      setShowViewer(true);
    } catch (e) {
      setError('message_content is not valid JSON for this record.');
      setJsonData(null);
      setShowViewer(false);
    }
    setLoading(false);
  };

  const handleCloseViewer = () => {
    setShowViewer(false);
  };

  const activeSource = SOURCES.find(s => s.key === activeSection);
  const activeRows = activeSection ? rowsMap[activeSection] : [];

  return (
    <div className="App" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>

      {/* Header */}
      <header style={{
        padding: '14px 32px',
        background: '#0a3055',
        boxShadow: '0 2px 12px rgba(10,48,85,0.30)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        zIndex: 10,
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <img src={scbLogo} alt="Standard Chartered" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
        <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.25)', margin: '0 4px' }} />
        <div>
          <h1 style={{ color: '#ffffff', fontWeight: 'bold', margin: 0, fontSize: 24, lineHeight: 1.2 }}>
            OneTB JSON Cracker
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: 0 }}>
            Select a data source to explore JSON visually
          </p>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Left Sidebar — slides between main nav and metadata panel */}
        <aside style={{
          width: 320,
          minWidth: 320,
          maxWidth: 320,
          background: 'rgba(255,255,255,0.92)',
          borderRight: '1px solid rgba(10,48,85,0.12)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '2px 0 12px rgba(10,48,85,0.07)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
          position: 'relative',
          flexShrink: 0
        }}>
          {/* Slide wrapper */}
          <div style={{
            display: 'flex',
            width: 640,
            minWidth: 640,
            height: '100%',
            transform: sidebarSlid ? 'translateX(-320px)' : 'translateX(0)',
            transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'
          }}>

            {/* Panel 1: Main Nav */}
            <div style={{ width: 320, minWidth: 320, flexShrink: 0, padding: '32px 16px 24px 16px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              <p style={{ color: '#999', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px 4px' }}>
                Data Sources
              </p>

              {SOURCES.map(src => {
                const isActive = activeSection === src.key;
                return (
                  <button
                    key={src.key}
                    onClick={() => handleSourceButton(src.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '13px 16px', borderRadius: 12,
                      border: isActive ? '2px solid #0a3055' : '2px solid transparent',
                      background: isActive ? 'linear-gradient(90deg, #0a3055 0%, #1a5fa8 100%)' : 'rgba(10,48,85,0.06)',
                      color: isActive ? '#fff' : '#555',
                      fontWeight: 700, fontSize: 15, cursor: 'pointer',
                      width: '100%', boxSizing: 'border-box', textAlign: 'left', transition: 'all 0.18s',
                      boxShadow: isActive ? '0 2px 8px rgba(10,48,85,0.15)' : 'none', letterSpacing: 0.3,
                      outline: 'none'
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(10,48,85,0.13)'; e.currentTarget.style.color = '#0a3055'; } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(10,48,85,0.06)'; e.currentTarget.style.color = '#555'; } }}
                  >
                    <span style={{ fontSize: 20 }}>{src.icon}</span>
                    {src.label.replace(src.icon, '').trim()}
                  </button>
                );
              })}

              <div style={{ margin: '8px 0', borderTop: '1.5px dashed rgba(10,48,85,0.15)', width: '100%' }} />

              {/* Data Explorer button */}
              <button
                onClick={handleSqlPanelToggle}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '13px 16px', borderRadius: 12,
                  border: sqlPanelOpen ? '2px solid #0a3055' : '2px solid transparent',
                  background: sqlPanelOpen ? 'linear-gradient(90deg, #0a3055 0%, #1a5fa8 100%)' : 'rgba(10,48,85,0.06)',
                  color: sqlPanelOpen ? '#fff' : '#555',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  width: '100%', boxSizing: 'border-box', textAlign: 'left', transition: 'all 0.18s',
                  boxShadow: sqlPanelOpen ? '0 2px 8px rgba(10,48,85,0.15)' : 'none', letterSpacing: 0.3,
                  outline: 'none'
                }}
                onMouseEnter={e => { if (!sqlPanelOpen) { e.currentTarget.style.background = 'rgba(10,48,85,0.13)'; e.currentTarget.style.color = '#0a3055'; } }}
                onMouseLeave={e => { if (!sqlPanelOpen) { e.currentTarget.style.background = 'rgba(10,48,85,0.06)'; e.currentTarget.style.color = '#555'; } }}
              >
                <span style={{ fontSize: 20 }}>&#128451;</span>
                Data Explorer
              </button>

              {/* Radio buttons for source type — shown when Data Explorer is open */}
              {sqlPanelOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12 }}>
                  <p style={{ color: '#999', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', margin: '4px 0 6px 4px' }}>
                    Select Source Type
                  </p>
                  {SQL_SUB_TYPES.map(t => (
                    <label
                      key={t.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 10,
                        cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        color: explorerType === t.key ? '#0a3055' : '#555',
                        background: explorerType === t.key ? '#e8f0fb' : 'transparent',
                        border: 'none', outline: 'none', transition: 'all 0.15s'
                      }}
                    >
                      <input
                        type="radio"
                        name="sqlSubType"
                        value={t.key}
                        checked={explorerType === t.key}
                        onChange={() => handleExplorerTypeSelect(t.key)}
                        style={{ accentColor: '#0a3055', width: 16, height: 16, cursor: 'pointer', flexShrink: 0, outline: 'none' }}
                      />
                      <span style={{ fontSize: 18 }}>{t.icon}</span>
                      {t.label.replace(t.icon, '').trim()}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Panel 2: Metadata (Column Names) Sidebar */}
            <div style={{ width: 320, minWidth: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {/* Header */}
              <div style={{ padding: '20px 20px 12px 20px', borderBottom: '1px solid rgba(10,48,85,0.1)', background: '#f5f7fa' }}>
                <button
                  onClick={handleExplorerBack}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#0a3055', fontWeight: 700, fontSize: 13, padding: '4px 0', marginBottom: 10
                  }}
                >
                  ← Back
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>
                    {SQL_SUB_TYPES.find(t => t.key === explorerType)?.icon}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0a3055', fontSize: 14 }}>
                      {explorerType ? explorerType.charAt(0).toUpperCase() + explorerType.slice(1) : ''}_flat
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>Schema / Columns</div>
                  </div>
                </div>
              </div>

              {/* Column list */}
              <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
                {explorerColumnsLoading && (
                  <div style={{ color: '#0a3055', fontSize: 13, padding: '8px 0' }}>Loading columns...</div>
                )}
                {explorerColumnsWarning && (
                  <div style={{ color: '#b45309', fontSize: 12, padding: '8px 0' }}>{explorerColumnsWarning}</div>
                )}
                {!explorerColumnsLoading && explorerColumns.length === 0 && !explorerColumnsWarning && (
                  <div style={{ color: '#aaa', fontSize: 13 }}>No columns found.</div>
                )}
                {explorerColumns.length > 0 && (
                  <div style={{ marginBottom: 8, fontSize: 11, color: '#0a3055', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⠿</span> Drag a column → SQL Executor to auto-fill query
                  </div>
                )}
                {explorerColumns.map((col, i) => (
                  <div
                    key={col.name}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', `col:${col.name}`);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title={`Drag "${col.name}" to SQL Executor`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 10px', borderRadius: 7,
                      background: i % 2 === 0 ? '#f5f7fa' : '#fff',
                      marginBottom: 3, cursor: 'grab',
                      userSelect: 'none'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0 }}>⠿</span>
                      <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12, color: '#0a3055', fontWeight: 600, wordBreak: 'break-all' }}>
                        {col.name}
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {col.type || 'TEXT'}
                    </span>
                  </div>
                ))}
                {explorerColumns.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#aaa' }}>
                    {explorerColumns.length} column(s)
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Right Content */}
        <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 40px', overflowY: 'auto' }}>

          {/* Welcome / landing page */}
          {!activeSection && !sqlPanelOpen && (
            <div style={{ width: '100%', maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 28 }}>

              <div style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 4px 20px rgba(118,75,162,0.10)',
                padding: '32px 36px',
                borderLeft: '5px solid #0a3055'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 28 }}>&#128269;</span>
                  <h2 style={{ margin: 0, color: '#0a3055', fontSize: 22, fontWeight: 700 }}>About the Application</h2>
                </div>
                <p style={{ margin: '0 0 12px 0', color: '#444', fontSize: 15, lineHeight: 1.75 }}>
                  <strong>JSON Crack Viewer</strong> is a modern web tool designed to help users visually explore and understand inbound JSON messages from different business sources (<em>Customer, Transaction, Document</em>).
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#555', fontSize: 14, lineHeight: 2 }}>
                  <li>Connects to a backend database and fetches the latest records for each source.</li>
                  <li>Users can select a data source, pick a message ID, and instantly view the message content as a beautiful, interactive tree, code, or graph.</li>
                  <li>Makes it easy to navigate complex JSON structures, search for details, and analyze message data without technical barriers.</li>
                  <li><strong>Features include:</strong> sidebar navigation, dropdown selection, multiple visualization modes, and a user-friendly interface.</li>
                  <li>Benefits
                    <ul>
                      <li>Visual Data Exploration</li>
                      <li>Development Acceleration</li>
                      <li>Testing &amp; QA Enhancement</li>
                      <li>Data Analysis Efficiency</li>
                    </ul>
                  </li>
                </ul>
              </div>

              <div style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 4px 20px rgba(118,75,162,0.10)',
                padding: '32px 36px',
                borderLeft: '5px solid #0a3055'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <span style={{ fontSize: 28 }}>&#9881;&#65039;</span>
                  <h2 style={{ margin: 0, color: '#0a3055', fontSize: 22, fontWeight: 700 }}>How it Works</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {[
                    { step: '1', icon: '&#128072;', title: 'Select a Data Source', desc: 'Click one of the buttons on the left sidebar \u2014 Customer, Transaction, or Document.' },
                    { step: '2', icon: '&#128317;', title: 'Pick a Message ID',    desc: 'Choose a Message ID from the dropdown to view the latest inbound messages.' },
                    { step: '3', icon: '&#128064;', title: 'Explore the JSON',     desc: 'See the message content visualized as a tree, code, or graph. Expand/collapse nodes, drag to reposition, and switch views.' }
                  ].map(item => (
                    <div key={item.step} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                      <div style={{
                        minWidth: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0a3055 0%, #1a5fa8 100%)',
                        color: '#fff', fontWeight: 800, fontSize: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 3px 10px rgba(10,48,85,0.25)', flexShrink: 0
                      }}>{item.step}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#333', marginBottom: 4 }}
                          dangerouslySetInnerHTML={{ __html: item.icon + ' ' + item.title }} />
                        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* How it Works — Data Explorer */}
              <div style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 4px 20px rgba(118,75,162,0.10)',
                padding: '32px 36px',
                borderLeft: '5px solid #1a5fa8'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <span style={{ fontSize: 28 }}>&#128451;</span>
                  <h2 style={{ margin: 0, color: '#0a3055', fontSize: 22, fontWeight: 700 }}>How it Works — Data Explorer</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {[
                    { step: '1', icon: '&#128451;', title: 'Open Data Explorer', desc: 'Click the Data Explorer button in the left sidebar to switch to the explorer mode.' },
                    { step: '2', icon: '&#128202;', title: 'Select a Source Type', desc: 'Choose Customer, Transaction, or Document from the sidebar radio buttons. The top 10 latest flattened records will load instantly.' },
                    { step: '3', icon: '&#9998;&#65039;', title: 'Browse & Copy Data', desc: 'Hover over any cell or column header to reveal a Copy button. Click it to copy the full value to your clipboard — even if it is too long to display.' },
                    { step: '4', icon: '&#129458;', title: 'Drag to SQL Executor', desc: 'Drag any cell value from the table, any column name from the sidebar, or any message ID — and drop it into the SQL Query Executor below to auto-fill a WHERE query.' },
                    { step: '5', icon: '&#9654;&#65039;', title: 'Run SQL Queries', desc: 'Write or edit your SELECT query in the SQL editor and press Run Query (or Ctrl+Enter) to execute it against the flattened SQLite database.' }
                  ].map(item => (
                    <div key={item.step} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                      <div style={{
                        minWidth: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1a5fa8 0%, #0a3055 100%)',
                        color: '#fff', fontWeight: 800, fontSize: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 3px 10px rgba(10,48,85,0.25)', flexShrink: 0
                      }}>{item.step}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#333', marginBottom: 4 }}
                          dangerouslySetInnerHTML={{ __html: item.icon + ' ' + item.title }} />
                        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* JSON Crack source panel */}
          {activeSection && activeSource && (
            <div style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 4px 24px rgba(0,0,0,0.09)',
              padding: '36px 40px',
              textAlign: 'left',
              width: '100%',
              maxWidth: 600
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <h2 style={{ margin: 0, color: '#0a3055', fontSize: 22 }}>
                  {activeSource.label} Records
                </h2>
                <button
                  onClick={() => fetchRecords(activeSection)}
                  disabled={loadingMap[activeSection]}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8,
                    border: '1.5px solid #0a3055',
                    background: loadingMap[activeSection] ? '#e8f0fb' : '#fff',
                    color: '#0a3055', fontWeight: 600, fontSize: 13,
                    cursor: loadingMap[activeSection] ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {loadingMap[activeSection] ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {apiErrorMap[activeSection] && (
                <div style={{ color: '#d32f2f', background: '#fff3f3', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 }}>
                  Failed to load records: {apiErrorMap[activeSection]}
                </div>
              )}

              <label style={{ fontWeight: 600, color: '#444', fontSize: 15, display: 'block', marginBottom: 8 }}>
                Select Message ID (Top 10 Latest):
              </label>

              <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 20 }}>
                <div
                  onClick={() => !loadingMap[activeSection] && setDropdownOpen(o => !o)}
                  style={{
                    border: '2px solid',
                    borderColor: dropdownOpen ? '#0a3055' : '#c3cfe2',
                    borderRadius: 10,
                    padding: '12px 16px',
                    cursor: loadingMap[activeSection] ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#fafbff',
                    fontSize: 14,
                    fontFamily: 'Consolas, Monaco, monospace',
                    color: selectedMessageId ? '#333' : '#aaa',
                    transition: 'border-color 0.2s',
                    opacity: loadingMap[activeSection] ? 0.6 : 1
                  }}
                >
                  <span>{loadingMap[activeSection] ? 'Fetching records...' : (selectedMessageId || '-- Select a Message ID --')}</span>
                  <span style={{ fontSize: 12, color: '#0a3055' }}>{dropdownOpen ? '\u25B2' : '\u25BC'}</span>
                </div>

                {dropdownOpen && (
                  <div style={{
                    position: 'absolute', top: '110%', left: 0, right: 0,
                    background: '#fff', border: '1.5px solid #c3cfe2',
                    borderRadius: 10, zIndex: 100,
                    boxShadow: '0 8px 24px rgba(10,48,85,0.18)', overflow: 'hidden'
                  }}>
                    {activeRows.length === 0 && (
                      <div style={{ padding: '14px 16px', color: '#aaa', fontSize: 14 }}>
                        {apiErrorMap[activeSection] ? 'Could not load records' : 'No records found'}
                      </div>
                    )}
                    {activeRows.map((row, idx) => (
                      <div
                        key={row.message_id}
                        onClick={() => handleSelectMessageId(row)}
                        style={{
                          padding: '13px 16px', cursor: 'pointer', fontSize: 13,
                          fontFamily: 'Consolas, Monaco, monospace',
                          borderBottom: idx < activeRows.length - 1 ? '1px solid #f0f0f0' : 'none',
                          background: selectedMessageId === row.message_id ? '#e8f0fb' : '#fff',
                          color: '#333', transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8f0fb'}
                        onMouseLeave={e => e.currentTarget.style.background = selectedMessageId === row.message_id ? '#e8f0fb' : '#fff'}
                      >
                        <span style={{ color: '#0a3055', fontWeight: 700 }}>#{idx + 1}</span>
                        {'  '}{row.message_id}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div style={{ color: '#d32f2f', background: '#fff3f3', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 14 }}>
                  {error}
                </div>
              )}
              {loading && <div style={{ color: '#0a3055', fontSize: 14 }}>Loading...</div>}
              {selectedMessageId && !error && (
                <div style={{ marginTop: 8, padding: '10px 16px', background: '#e8f0fb', borderRadius: 8, fontSize: 13, color: '#555' }}>
                  Message ID: <span style={{ fontFamily: 'monospace', color: '#0a3055' }}>{selectedMessageId}</span>
                  <br /><span style={{ fontSize: 12 }}>JSON Viewer opened automatically.</span>
                </div>
              )}
            </div>
          )}

          {/* Data Explorer Panel */}
          {sqlPanelOpen && (
            <div style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Prompt: select a source */}
              {!explorerType && (
                <div style={{
                  background: '#fff', borderRadius: 16,
                  boxShadow: '0 4px 20px rgba(10,48,85,0.10)',
                  padding: '28px 36px', borderLeft: '5px solid #0a3055'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 28 }}>&#128451;</span>
                    <h2 style={{ margin: 0, color: '#0a3055', fontSize: 22, fontWeight: 700 }}>Data Explorer</h2>
                  </div>
                  <p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>
                    Select a source type from the sidebar to explore the flattened table and run SQL queries.
                  </p>
                </div>
              )}

              {explorerType && (
                <>
                  {/* Top 10 Records Table */}
                  <div style={{
                    background: '#fff', borderRadius: 16,
                    boxShadow: '0 4px 16px rgba(10,48,85,0.08)',
                    padding: '28px 36px', borderLeft: '5px solid #0a3055'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <span style={{ fontSize: 22 }}>&#128202;</span>
                      <h3 style={{ margin: 0, color: '#0a3055', fontSize: 18, fontWeight: 700 }}>
                        {explorerType}_flat — Top 10 Latest Records
                      </h3>
                      {explorerTop10Loading && (
                        <span style={{ marginLeft: 'auto', color: '#0a3055', fontSize: 13 }}>Loading...</span>
                      )}
                      {!explorerTop10Loading && explorerTop10.length > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>⠿</span> Drag a <strong style={{ color: '#0a3055' }}>_message_id</strong> cell → SQL Executor
                        </span>
                      )}
                    </div>

                    {explorerTop10Error && (
                      <div style={{ color: '#d32f2f', background: '#fff3f3', borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontSize: 13 }}>
                        {explorerTop10Error}
                      </div>
                    )}
                    {explorerTop10Warning && (
                      <div style={{ color: '#b45309', background: '#fffbeb', borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontSize: 13, border: '1px solid #fde68a' }}>
                        {explorerTop10Warning}
                      </div>
                    )}
                    {!explorerTop10Loading && !explorerTop10Error && explorerTop10.length === 0 && !explorerTop10Warning && (
                      <div style={{ color: '#aaa', fontSize: 14 }}>
                        No data found. Run <code>flatten_to_sqlite.py</code> to populate the table.
                      </div>
                    )}
                    {explorerTop10.length > 0 && (
                      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e8f0fb' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'Consolas, Monaco, monospace', minWidth: 600 }}>
                          <thead>
                            <tr style={{ background: '#0a3055' }}>
                              {explorerTop10Cols.map(col => {
                                const isHovered = hoveredHeader === col;
                                const isCopied = copiedHeader === col;
                                return (
                                  <th
                                    key={col}
                                    title={col}
                                    onMouseEnter={() => setHoveredHeader(col)}
                                    onMouseLeave={() => setHoveredHeader(null)}
                                    style={{
                                      position: 'relative',
                                      padding: '10px 14px', color: '#fff', fontWeight: 700,
                                      textAlign: 'left', whiteSpace: 'nowrap', fontSize: 11,
                                      letterSpacing: 0.3, borderRight: '1px solid rgba(255,255,255,0.12)'
                                    }}
                                  >
                                    {col.length > 22 ? col.slice(0, 20) + '…' : col}
                                    {isHovered && (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          copyToClipboard(col, () => {
                                            setCopiedHeader(col);
                                            setTimeout(() => setCopiedHeader(null), 1500);
                                          });
                                        }}
                                        title="Copy column name"
                                        style={{
                                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                          padding: '2px 7px', borderRadius: 6, border: 'none',
                                          background: isCopied ? '#22c55e' : '#0a3055',
                                          color: '#fff', fontSize: 10, fontWeight: 700,
                                          cursor: 'pointer', zIndex: 10,
                                          boxShadow: '0 2px 8px rgba(10,48,85,0.25)',
                                          whiteSpace: 'nowrap', letterSpacing: 0.5,
                                          transition: 'background 0.2s'
                                        }}
                                      >
                                        {isCopied ? '✓ Copied' : 'Copy'}
                                      </button>
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {explorerTop10.map((row, rIdx) => (
                              <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#fafbff' : '#fff' }}>
                                {explorerTop10Cols.map(col => {
                                  const isMsgId = col === '_message_id';
                                  const cellVal = row[col] != null ? String(row[col]) : null;
                                  const cellKey = `${rIdx}-${col}`;
                                  const isHovered = hoveredCell === cellKey;
                                  const isCopied = copiedCell === cellKey;
                                  return (
                                    <td
                                      key={col}
                                      title={cellVal || ''}
                                      draggable={cellVal != null}
                                      onDragStart={cellVal != null ? e => {
                                        // message_id uses old format for backward compat; others use cell: prefix
                                        const payload = isMsgId ? cellVal : `cell:${col}:${cellVal}`;
                                        e.dataTransfer.setData('text/plain', payload);
                                        e.dataTransfer.effectAllowed = 'copy';
                                      } : undefined}
                                      onMouseEnter={() => setHoveredCell(cellKey)}
                                      onMouseLeave={() => setHoveredCell(null)}
                                      style={{
                                        position: 'relative',
                                        padding: '9px 14px', borderBottom: '1px solid #e8f0fb',
                                        borderRight: '1px solid #f0f4fa',
                                        whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                                        cursor: cellVal != null ? 'grab' : 'default',
                                        background: isHovered ? '#eef4ff' : (isMsgId ? 'rgba(10,48,85,0.04)' : undefined),
                                        fontWeight: isMsgId ? 700 : undefined,
                                        color: isMsgId ? '#0a3055' : '#444',
                                        transition: 'background 0.15s'
                                      }}
                                    >
                                      {cellVal != null ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          {isHovered && (
                                            <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0 }} title="Drag to SQL Executor">⠿</span>
                                          )}
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isMsgId ? 700 : undefined, color: isMsgId ? '#0a3055' : undefined }}>{cellVal}</span>
                                        </span>
                                      ) : <span style={{ color: '#ccc' }}>null</span>}
                                      {isHovered && cellVal != null && (
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            copyToClipboard(cellVal, () => {
                                              setCopiedCell(cellKey);
                                              setTimeout(() => setCopiedCell(null), 1500);
                                            });
                                          }}
                                          title="Copy full value"
                                          style={{
                                            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                            padding: '2px 7px', borderRadius: 6, border: 'none',
                                            background: isCopied ? '#22c55e' : '#0a3055',
                                            color: '#fff', fontSize: 10, fontWeight: 700,
                                            cursor: 'pointer', zIndex: 10,
                                            boxShadow: '0 2px 8px rgba(10,48,85,0.25)',
                                            whiteSpace: 'nowrap', letterSpacing: 0.5,
                                            transition: 'background 0.2s'
                                          }}
                                        >
                                          {isCopied ? '✓ Copied' : 'Copy'}
                                        </button>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ padding: '8px 14px', fontSize: 11, color: '#aaa', background: '#fafbff', borderTop: '1px solid #e8f0fb' }}>
                          Showing {explorerTop10.length} row(s) · {explorerTop10Cols.length} column(s)
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SQL Query Executor */}
                  <div style={{
                    background: '#fff', borderRadius: 16,
                    boxShadow: '0 4px 16px rgba(10,48,85,0.08)',
                    padding: '28px 36px', borderLeft: '5px solid #0a3055'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <span style={{ fontSize: 22 }}>&#9997;&#65039;</span>
                      <h3 style={{ margin: 0, color: '#0a3055', fontSize: 18, fontWeight: 700 }}>SQL Query Executor</h3>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa' }}>
                        Runs against <strong style={{ color: '#0a3055' }}>{explorerType}_flat</strong> in SQLite
                      </span>
                    </div>

                    {/* Drop hint */}
                    <div style={{
                      marginBottom: 8, fontSize: 12, color: '#0a3055',
                      display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.7
                    }}>
                      <span><span style={{ marginRight: 6 }}>⠿</span>Drag any <strong>_message_id</strong> from the table → auto-fills WHERE by message ID</span>
                      <span><span style={{ marginRight: 6 }}>⠿</span>Drag any <strong>cell value</strong> from the table → auto-fills WHERE by that column &amp; value</span>
                      <span><span style={{ marginRight: 6 }}>⠿</span>Drag any <strong>column name</strong> from the sidebar → auto-fills WHERE by that column</span>
                    </div>

                    <textarea
                      value={explorerSql}
                      onChange={e => setExplorerSql(e.target.value)}
                      rows={6}
                      placeholder={`Write your SQL Query here...\n\nExample:\nSELECT * FROM ${explorerType}_flat LIMIT 20;`}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        fontSize: 14, lineHeight: 1.7,
                        padding: '16px 18px', borderRadius: 10,
                        border: dragOverSql ? '2px solid #1a5fa8' : '2px solid #c3cfe2',
                        boxShadow: dragOverSql ? '0 0 0 3px rgba(10,48,85,0.18)' : 'none',
                        background: dragOverSql ? '#1a2a3a' : '#1e1e2e', color: '#cdd6f4',
                        resize: 'vertical', outline: 'none',
                        letterSpacing: 0.2, whiteSpace: 'pre',
                        transition: 'border 0.15s, box-shadow 0.15s, background 0.15s'
                      }}
                      onKeyDown={e => {
                        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleExplorerRunQuery(); }
                      }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverSql(true); }}
                      onDragLeave={() => setDragOverSql(false)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverSql(false);
                        const dropped = e.dataTransfer.getData('text/plain');
                        if (!dropped || !explorerType) return;
                        if (dropped.startsWith('col:')) {
                          // Column name dragged from sidebar
                          const colName = dropped.slice(4);
                          const query = `SELECT *\nFROM ${explorerType}_flat\nWHERE "${colName}" = '';`;
                          setExplorerSql(query);
                        } else if (dropped.startsWith('cell:')) {
                          // Any cell dragged from table (col:value)
                          const parts = dropped.slice(5).split(':');
                          const colName = parts[0];
                          const colVal = parts.slice(1).join(':'); // handle values that contain colons
                          const query = `SELECT *\nFROM ${explorerType}_flat\nWHERE "${colName}" = '${colVal}';`;
                          setExplorerSql(query);
                        } else {
                          // message_id dragged from table (plain value, backward compat)
                          const query = `SELECT *\nFROM ${explorerType}_flat\nWHERE _message_id = '${dropped}';`;
                          setExplorerSql(query);
                        }
                        setExplorerQueryRan(false);
                        setExplorerQueryRows([]);
                        setExplorerQueryCols([]);
                        setExplorerQueryError('');
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <span style={{ fontSize: 12, color: '#aaa' }}>
                        Only SELECT queries allowed. Press <kbd style={{ background: '#f0f4fa', border: '1px solid #c3cfe2', borderRadius: 4, padding: '1px 5px', fontSize: 11 }}>Ctrl+Enter</kbd> to run.
                      </span>
                      <button
                        onClick={handleExplorerRunQuery}
                        disabled={explorerQueryLoading || !explorerSql.trim()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '9px 22px', borderRadius: 10,
                          border: 'none', cursor: explorerQueryLoading || !explorerSql.trim() ? 'not-allowed' : 'pointer',
                          background: explorerQueryLoading || !explorerSql.trim()
                            ? 'rgba(10,48,85,0.15)'
                            : 'linear-gradient(90deg, #0a3055 0%, #1a5fa8 100%)',
                          color: explorerQueryLoading || !explorerSql.trim() ? '#aaa' : '#fff',
                          fontWeight: 700, fontSize: 14,
                          boxShadow: explorerSql.trim() && !explorerQueryLoading ? '0 3px 10px rgba(10,48,85,0.25)' : 'none',
                          transition: 'all 0.18s'
                        }}
                      >
                        {explorerQueryLoading ? '⏳ Running...' : '▶ Run Query'}
                      </button>
                    </div>

                    {/* Query Results */}
                    {explorerQueryRan && (
                      <div style={{ marginTop: 24 }}>
                        {explorerQueryError && (
                          <div style={{ color: '#d32f2f', background: '#fff3f3', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                            ⚠️ {explorerQueryError}
                          </div>
                        )}
                        {!explorerQueryError && explorerQueryRows.length === 0 && (
                          <div style={{ color: '#aaa', fontSize: 14, padding: '8px 0' }}>Query ran successfully — no rows returned.</div>
                        )}
                        {!explorerQueryError && explorerQueryRows.length > 0 && (
                          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e8f0fb' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'Consolas, Monaco, monospace', minWidth: 400 }}>
                              <thead>
                                <tr style={{ background: '#0a3055' }}>
                                  {explorerQueryCols.map(col => {
                                    const isHovered = hoveredHeader === col;
                                    const isCopied = copiedHeader === col;
                                    return (
                                      <th
                                        key={col}
                                        title={col}
                                        onMouseEnter={() => setHoveredHeader(col)}
                                        onMouseLeave={() => setHoveredHeader(null)}
                                        style={{
                                          position: 'relative',
                                          padding: '10px 14px', color: '#fff', fontWeight: 700,
                                          textAlign: 'left', whiteSpace: 'nowrap', fontSize: 11,
                                          letterSpacing: 0.3, borderRight: '1px solid rgba(255,255,255,0.12)'
                                        }}
                                      >
                                        {col.length > 22 ? col.slice(0, 20) + '…' : col}
                                        {isHovered && (
                                          <button
                                            onClick={e => {
                                              e.stopPropagation();
                                              copyToClipboard(col, () => {
                                                setCopiedHeader(col);
                                                setTimeout(() => setCopiedHeader(null), 1500);
                                              });
                                            }}
                                            title="Copy column name"
                                            style={{
                                              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                              padding: '2px 7px', borderRadius: 6, border: 'none',
                                              background: isCopied ? '#22c55e' : '#0a3055',
                                              color: '#fff', fontSize: 10, fontWeight: 700,
                                              cursor: 'pointer', zIndex: 10,
                                              boxShadow: '0 2px 8px rgba(10,48,85,0.25)',
                                              whiteSpace: 'nowrap', letterSpacing: 0.5,
                                              transition: 'background 0.2s'
                                            }}
                                          >
                                            {isCopied ? '✓ Copied' : 'Copy'}
                                          </button>
                                        )}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {explorerQueryRows.map((row, rIdx) => (
                                  <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#fafbff' : '#fff' }}>
                                    {explorerQueryCols.map(col => {
                                      const qCellKey = `q-${rIdx}-${col}`;
                                      const qCellVal = row[col] != null ? String(row[col]) : null;
                                      const qIsHovered = hoveredCell === qCellKey;
                                      const qIsCopied = copiedCell === qCellKey;
                                      return (
                                        <td
                                          key={col}
                                          title={qCellVal || ''}
                                          onMouseEnter={() => setHoveredCell(qCellKey)}
                                          onMouseLeave={() => setHoveredCell(null)}
                                          style={{
                                            position: 'relative',
                                            padding: '9px 14px', borderBottom: '1px solid #e8f0fb',
                                            borderRight: '1px solid #f0f4fa', color: '#444',
                                            whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                                            background: qIsHovered ? '#eef4ff' : undefined,
                                            transition: 'background 0.15s'
                                          }}
                                        >
                                          {qCellVal != null ? qCellVal : <span style={{ color: '#ccc' }}>null</span>}
                                          {qIsHovered && qCellVal != null && (
                                            <button
                                              onClick={e => {
                                                e.stopPropagation();
                                                copyToClipboard(qCellVal, () => {
                                                  setCopiedCell(qCellKey);
                                                  setTimeout(() => setCopiedCell(null), 1500);
                                                });
                                              }}
                                              title="Copy full value"
                                              style={{
                                                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                                padding: '2px 7px', borderRadius: 6, border: 'none',
                                                background: qIsCopied ? '#22c55e' : '#0a3055',
                                                color: '#fff', fontSize: 10, fontWeight: 700,
                                                cursor: 'pointer', zIndex: 10,
                                                boxShadow: '0 2px 8px rgba(10,48,85,0.25)',
                                                whiteSpace: 'nowrap', letterSpacing: 0.5,
                                                transition: 'background 0.2s'
                                              }}
                                            >
                                              {qIsCopied ? '✓ Copied' : 'Copy'}
                                            </button>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ padding: '8px 14px', fontSize: 11, color: '#aaa', background: '#fafbff', borderTop: '1px solid #e8f0fb' }}>
                              {explorerQueryRows.length} row(s) · {explorerQueryCols.length} column(s)
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* JSON Crack Viewer Modal */}
      {showViewer && (
        <JsonCrackViewer jsonData={jsonData} onClose={handleCloseViewer} />
      )}
    </div>
  );
}

export default App;


