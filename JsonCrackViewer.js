import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';


const JsonVisualGraph = ({ data }) => {
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1400, height: 800 });
  const [collapsedNodes, setCollapsedNodes] = useState(new Set());

  const toggleNode = (nodeId) => {
    setCollapsedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (!data || !svgRef.current) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;

    // Create hierarchical data
    let nodeIdCounter = 0;
    const createHierarchy = (obj, name = 'root') => {
      const id = `node-${nodeIdCounter++}`;
      const type = Array.isArray(obj) ? 'array' : obj === null ? 'null' : typeof obj;
      
      if (type === 'object' || type === 'array') {
        const entries = type === 'array' 
          ? obj.map((item, idx) => [`[${idx}]`, item])
          : Object.entries(obj);
        
        return {
          id: id,
          name: name,
          type: type,
          value: `${type === 'array' ? 'Array' : 'Object'} (${entries.length})`,
          children: entries.map(([key, val]) => createHierarchy(val, key)),
          _children: null,
          hasChildren: entries.length > 0
        };
      }
      
      return {
        id: id,
        name: name,
        type: type,
        value: String(obj),
        hasChildren: false
      };
    };

    const hierarchyData = createHierarchy(data);
    const root = d3.hierarchy(hierarchyData);
    
    // Apply collapsed state
    root.descendants().forEach(d => {
      if (collapsedNodes.has(d.data.id)) {
        d._children = d.children;
        d.children = null;
      }
    });
    
   
    const treeLayout = d3.tree()
      .size([height - 200, width - 300])
      .nodeSize([60, 250]) // More spacing like JSON Crack
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));
    
    treeLayout(root);

    // Create SVG with zoom
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(100, 100)`);

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Add reset zoom button behavior
    svg.on('dblclick.zoom', () => {
      svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity.translate(100, 100));
    });

    // Color scale - JSON Crack style
    const getNodeColor = (type) => {
      switch (type) {
        case 'object': return '#36CFC9'; // Teal
        case 'array': return '#FF7875';  // Coral Red
        case 'string': return '#95DE64'; // Light Green
        case 'number': return '#FFA940'; // Orange
        case 'boolean': return '#B37FEB'; // Purple
        case 'null': return '#8C8C8C';    // Gray
        default: return '#D9D9D9';        // Light Gray
      }
    };
    
    const getNodeBorderColor = (type) => {
      switch (type) {
        case 'object': return '#08979C';
        case 'array': return '#CF1322';
        case 'string': return '#52C41A';
        case 'number': return '#D46B08';
        case 'boolean': return '#722ED1';
        case 'null': return '#595959';
        default: return '#8C8C8C';
      }
    };

    // Draw links (horizontal) - JSON Crack smooth curves
    const link = g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = { x: d.source.y, y: d.source.x };
        const target = { x: d.target.y, y: d.target.x };
        const midX = (source.x + target.x) / 2;
        return `M${source.x},${source.y}
                C${midX},${source.y}
                 ${midX},${target.y}
                 ${target.x},${target.y}`;
      })
      .attr('fill', 'none')
      .attr('stroke', d => {
        const targetType = d.target.data.type;
        return getNodeBorderColor(targetType);
      })
      .attr('stroke-width', 2.5)
      .attr('opacity', 0.4)
      .attr('stroke-dasharray', d => d.target.data.type === 'null' ? '5,5' : '0');

    // Draw nodes
    const node = g.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer');

    // Add shadow filter for depth
    const filter = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
    const shadow = filter.append('filter')
      .attr('id', 'drop-shadow')
      .attr('height', '130%');
    shadow.append('feGaussianBlur')
      .attr('in', 'SourceAlpha')
      .attr('stdDeviation', 3);
    shadow.append('feOffset')
      .attr('dx', 2)
      .attr('dy', 2)
      .attr('result', 'offsetblur');
    shadow.append('feComponentTransfer')
      .append('feFuncA')
      .attr('type', 'linear')
      .attr('slope', 0.3);
    const feMerge = shadow.append('feMerge');
    feMerge.append('feMergeNode');
    feMerge.append('feMergeNode')
      .attr('in', 'SourceGraphic');
    
    
    node.append('rect')
      .attr('x', -80)
      .attr('y', -28)
      .attr('width', d => {
        const name = d.data.name || '';
        const value = d.data.value || '';
        const maxLen = Math.max(name.length, value.length);
        return Math.max(160, Math.min(maxLen * 8 + 40, 250));
      })
      .attr('height', 56)
      .attr('rx', 10)
      .attr('fill', d => getNodeColor(d.data.type))
      .attr('stroke', d => collapsedNodes.has(d.data.id) ? '#FFD700' : getNodeBorderColor(d.data.type))
      .attr('stroke-width', d => collapsedNodes.has(d.data.id) ? 3 : 2.5)
      .attr('filter', 'url(#drop-shadow)')
      .style('opacity', 0.95)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 4)
          .style('opacity', 1)
          .attr('transform', 'scale(1.05)');
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', d => collapsedNodes.has(d.data.id) ? 3 : 2.5)
          .style('opacity', 0.95)
          .attr('transform', 'scale(1)');
      });

    // Add expand/collapse button - JSON Crack style
    const expandButton = node.filter(d => d.data.hasChildren)
      .append('g')
      .attr('class', 'expand-button')
      .style('cursor', 'pointer')
      .on('click', function(event, d) {
        event.stopPropagation();
        toggleNode(d.data.id);
      });
    
    expandButton.append('circle')
      .attr('cx', d => {
        const name = d.data.name || '';
        const value = d.data.value || '';
        const maxLen = Math.max(name.length, value.length);
        return Math.max(160, Math.min(maxLen * 8 + 40, 250)) / 2 + 5;
      })
      .attr('cy', 0)
      .attr('r', 14)
      .attr('fill', d => collapsedNodes.has(d.data.id) ? '#1890FF' : '#52C41A')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2.5)
      .style('filter', 'url(#drop-shadow)')
      .on('mouseover', function() {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 16)
          .attr('stroke-width', 3);
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 14)
          .attr('stroke-width', 2.5);
      });

    expandButton.append('text')
      .attr('x', d => {
        const name = d.data.name || '';
        const value = d.data.value || '';
        const maxLen = Math.max(name.length, value.length);
        return Math.max(160, Math.min(maxLen * 8 + 40, 250)) / 2 + 5;
      })
      .attr('y', 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text(d => collapsedNodes.has(d.data.id) ? '+' : '−');

    // Add node labels (name) - JSON Crack style
    node.append('text')
      .attr('dy', -6)
      .attr('text-anchor', 'middle')
      .attr('fill', '#262626')
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(255,255,255,0.3)')
      .text(d => {
        const name = d.data.name || '';
        return name.length > 22 ? name.substring(0, 19) + '...' : name;
      })
      .append('title')
      .text(d => d.data.name);

    // Add node type/value - JSON Crack style
    node.append('text')
      .attr('dy', 13)
      .attr('text-anchor', 'middle')
      .attr('fill', '#595959')
      .attr('font-size', '11px')
      .attr('font-family', 'Consolas, Monaco, monospace')
      .attr('font-weight', '500')
      .style('opacity', 0.85)
      .attr('pointer-events', 'none')
      .text(d => {
        const value = d.data.value || '';
        if (d.data.type === 'string') {
          return value.length > 25 ? `"${value.substring(0, 22)}..."` : `"${value}"`;
        }
        return value.length > 25 ? value.substring(0, 22) + '...' : value;
      })
      .append('title')
      .text(d => d.data.value);

    // Add type badge in top-right corner - JSON Crack style
    const typeBadge = node.append('g')
      .attr('class', 'type-badge')
      .attr('transform', d => {
        const name = d.data.name || '';
        const value = d.data.value || '';
        const maxLen = Math.max(name.length, value.length);
        const width = Math.max(160, Math.min(maxLen * 8 + 40, 250));
        return `translate(${width / 2 - 35}, -20)`;
      });
    
    typeBadge.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', d => {
        const type = d.data.type;
        return type.length * 7 + 16;
      })
      .attr('height', 18)
      .attr('rx', 9)
      .attr('fill', d => getNodeBorderColor(d.data.type))
      .attr('opacity', 0.9);
    
    typeBadge.append('text')
      .attr('x', d => {
        const type = d.data.type;
        return (type.length * 7 + 16) / 2;
      })
      .attr('y', 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('font-family', 'monospace')
      .attr('pointer-events', 'none')
      .text(d => d.data.type.toUpperCase());

    // Add drag behavior (works for all nodes)
    const drag = d3.drag()
      .on('start', function(event, d) {
        d3.select(this).raise();
        d3.select(this).select('rect')
          .attr('stroke', '#00ff00')
          .attr('stroke-width', 3);
      })
      .on('drag', function(event, d) {
        const node = d3.select(this);
        d.y = event.x;
        d.x = event.y;
        node.attr('transform', `translate(${d.y},${d.x})`);
        
        // Update connected links
        link
          .attr('d', d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x)
          );
      })
      .on('end', function(event, d) {
        d3.select(this).select('rect')
          .attr('stroke', d => collapsedNodes.has(d.data.id) ? '#ffd700' : '#333')
          .attr('stroke-width', d => collapsedNodes.has(d.data.id) ? 3 : 2);
      });

    node.call(drag);

    // Add color legend - JSON Crack style
    const legendData = [
      { type: 'object', label: 'Object' },
      { type: 'array', label: 'Array' },
      { type: 'string', label: 'String' },
      { type: 'number', label: 'Number' },
      { type: 'boolean', label: 'Boolean' },
      { type: 'null', label: 'Null' }
    ];

    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - 140}, 20)`);

    legend.append('rect')
      .attr('x', -10)
      .attr('y', -10)
      .attr('width', 130)
      .attr('height', legendData.length * 28 + 30)
      .attr('fill', 'rgba(255, 255, 255, 0.95)')
      .attr('rx', 8)
      .attr('stroke', 'rgba(0,0,0,0.1)')
      .attr('stroke-width', 1)
      .style('filter', 'url(#drop-shadow)');

    legend.append('text')
      .attr('x', 55)
      .attr('y', 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', '#262626')
      .text('Types');

    const legendItems = legend.selectAll('.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(5, ${i * 28 + 25})`);

    legendItems.append('rect')
      .attr('width', 20)
      .attr('height', 20)
      .attr('rx', 4)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', d => getNodeBorderColor(d.type))
      .attr('stroke-width', 2);

    legendItems.append('text')
      .attr('x', 28)
      .attr('y', 14)
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', '#595959')
      .text(d => d.label);

  }, [data, dimensions, collapsedNodes]);

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      overflow: 'hidden', 
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      position: 'relative'
    }}>
      <div style={{
        position: 'absolute',
        top: 15,
        left: 15,
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '15px 18px',
        borderRadius: '12px',
        color: '#262626',
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid rgba(0,0,0,0.08)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#1890FF' }}>
          💡 Controls
        </div>
        <div style={{ lineHeight: '1.8', color: '#595959' }}>• <strong>Click ⊕/⊖</strong> expand/collapse</div>
        <div style={{ lineHeight: '1.8', color: '#595959' }}>• <strong>Drag</strong> nodes to reposition</div>
        <div style={{ lineHeight: '1.8', color: '#595959' }}>• <strong>Scroll</strong> to zoom in/out</div>
        <div style={{ lineHeight: '1.8', color: '#595959' }}>• <strong>Double-click</strong> reset view</div>
        <div style={{ marginTop: '10px', paddingTop: '10px', fontSize: '11px', color: '#8C8C8C', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <span style={{ color: '#FFD700', fontWeight: 'bold' }}>●</span> Collapsed | 
          <span style={{ color: '#52C41A', fontWeight: 'bold' }}>●</span> Expanded
        </div>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

// Custom JSON Tree Viewer Component
const JsonTreeNode = ({ data, name, depth = 0, collapsed = false }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed && depth >= 2);
  
  const handleToggle = () => setIsCollapsed(!isCollapsed);
  
  const getType = (val) => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  };
  
  const getValueColor = (val) => {
    const type = getType(val);
    switch (type) {
      case 'string': return '#a8320a';
      case 'number': return '#2e7d32';
      case 'boolean': return '#1565c0';
      case 'null': return '#1565c0';
      default: return '#333';
    }
  };
  
  const renderValue = (val, key) => {
    const type = getType(val);
    
    if (type === 'object' || type === 'array') {
      const itemCount = type === 'array' ? val.length : Object.keys(val).length;
      return (
        <div style={{ marginLeft: depth * 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '2px 0' }} onClick={handleToggle}>
            <span style={{ marginRight: '8px', color: '#555', fontSize: '12px' }}>
              {isCollapsed ? '▶' : '▼'}
            </span>
            <span style={{ color: '#1a5fa8', fontWeight: 600, marginRight: '8px' }}>{key}:</span>
            <span style={{ color: '#444', fontSize: '12px' }}>
              {type === 'array' ? `[${itemCount}]` : `{${itemCount}}`}
            </span>
          </div>
          {!isCollapsed && (
            <div style={{ marginLeft: '20px' }}>
              {type === 'array' 
                ? val.map((item, idx) => (
                    <JsonTreeNode key={idx} data={item} name={idx} depth={depth + 1} collapsed={collapsed} />
                  ))
                : Object.entries(val).map(([k, v]) => (
                    <JsonTreeNode key={k} data={v} name={k} depth={depth + 1} collapsed={collapsed} />
                  ))
              }
            </div>
          )}
        </div>
      );
    }
    
    return (
      <div style={{ marginLeft: depth * 20, padding: '2px 0' }}>
        <span style={{ color: '#1a5fa8', fontWeight: 600, marginRight: '8px' }}>{key}:</span>
        <span style={{ color: getValueColor(val) }}>
          {type === 'string' ? `"${val}"` : String(val)}
        </span>
        <span style={{ color: '#555', fontSize: '11px', marginLeft: '8px' }}>
          {type}
        </span>
      </div>
    );
  };
  
  return renderValue(data, name);
};

// ── Flatten JSON helper (dot notation)
const flattenJson = (obj, parentKey = '', sep = '.') => {
  const items = {};
  const recurse = (current, prefix) => {
    if (current === null || current === undefined) {
      items[prefix] = current;
    } else if (Array.isArray(current)) {
      if (current.length === 0) {
        items[prefix] = '[]';
      } else {
        current.forEach((val, idx) => recurse(val, `${prefix}${sep}${idx}`));
      }
    } else if (typeof current === 'object') {
      const keys = Object.keys(current);
      if (keys.length === 0) {
        items[prefix] = '{}';
      } else {
        keys.forEach(key => recurse(current[key], prefix ? `${prefix}${sep}${key}` : key));
      }
    } else {
      items[prefix] = current;
    }
  };
  recurse(obj, parentKey);
  return items;
};

const JsonCrackViewer = ({ jsonData, onClose }) => {
  const [viewMode, setViewMode] = useState('visual'); // tree, code, visual, or flatten

  if (!jsonData) {
    return null;
  }

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      padding: '20px'
    },
    modal: {
      background: 'linear-gradient(135deg, #0a3055 0%, #1a5fa8 100%)',
      borderRadius: '16px',
      width: '98%',
      height: '92%',
      maxWidth: '1800px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    header: {
      padding: '20px 30px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(10px)'
    },
    title: {
      color: '#fff',
      fontSize: '24px',
      fontWeight: 'bold',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    controls: {
      display: 'flex',
      gap: '10px',
      alignItems: 'center'
    },
    modeButton: {
      padding: '10px 18px',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '600',
      transition: 'all 0.3s ease',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      color: '#fff',
      backdropFilter: 'blur(5px)'
    },
    modeButtonActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      color: '#0a3055',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    },
    closeButton: {
      padding: '10px 20px',
      borderRadius: '8px',
      border: '1px solid rgba(255, 77, 79, 0.5)',
      backgroundColor: 'rgba(255, 77, 79, 0.9)',
      color: 'white',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '700',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 12px rgba(255, 77, 79, 0.3)'
    },
    content: {
      flex: 1,
      overflow: 'auto',
      padding: '20px',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
    },
    visualContainer: {
      width: '100%',
      height: '100%',
      overflow: 'auto',
      padding: '20px',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      borderRadius: '8px'
    },
    codeContainer: {
      width: '100%',
      height: '100%',
      overflow: 'auto'
    },
    pre: {
      margin: 0,
      padding: '20px',
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      fontSize: '14px',
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      lineHeight: '1.6',
      borderRadius: '6px',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word'
    },
    icon: {
      fontSize: '28px'
    },
    stats: {
      display: 'flex',
      gap: '30px',
      padding: '12px 30px',
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: '13px',
      fontWeight: '500'
    },
    stat: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    }
  };

  const getJsonStats = (obj) => {
    const str = JSON.stringify(obj);
    
    const countKeys = (o) => {
      let count = 0;
      for (let key in o) {
        count++;
        if (typeof o[key] === 'object' && o[key] !== null) {
          count += countKeys(o[key]);
        }
      }
      return count;
    };

    return {
      size: `${(str.length / 1024).toFixed(2)} KB`,
      keys: countKeys(obj),
      lines: str.split('\n').length
    };
  };

  const stats = getJsonStats(jsonData);

  const renderContent = () => {
    switch (viewMode) {
      case 'tree':
        return (
          <div style={{ ...styles.visualContainer, background: '#ffffff', padding: '24px 28px' }}>
            <JsonTreeNode data={jsonData} name="root" depth={0} collapsed={true} />
          </div>
        );
      
      case 'code':
        return (
          <div style={styles.codeContainer}>
            <pre style={styles.pre}>
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        );
      
      case 'visual':
        return (
          <div style={styles.visualContainer}>
            <JsonVisualGraph data={jsonData} />
          </div>
        );

      case 'flatten': {
        const flat = flattenJson(jsonData);
        const entries = Object.entries(flat);
        return (
          <div style={styles.codeContainer}>
            <div style={{
              margin: 0,
              padding: '20px',
              backgroundColor: '#1e1e1e',
              borderRadius: '6px',
              overflowX: 'auto'
            }}>
              <div style={{ marginBottom: 12, color: '#569cd6', fontFamily: 'Consolas, monospace', fontSize: 13 }}>
                {'// '}{entries.length} flattened key-value pairs
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 16px', color: '#9cdcfe', borderBottom: '1px solid #333', width: '50%' }}>Key (Path)</th>
                    <th style={{ textAlign: 'left', padding: '8px 16px', color: '#9cdcfe', borderBottom: '1px solid #333', width: '50%' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([key, value], idx) => (
                    <tr
                      key={key}
                      style={{ backgroundColor: idx % 2 === 0 ? '#1e1e1e' : '#252526' }}
                    >
                      <td style={{ padding: '6px 16px', color: '#9cdcfe', wordBreak: 'break-all', verticalAlign: 'top', borderBottom: '1px solid #2a2a2a' }}>
                        {key}
                      </td>
                      <td style={{
                        padding: '6px 16px',
                        color: typeof value === 'string' ? '#ce9178'
                          : typeof value === 'number' ? '#b5cea8'
                          : typeof value === 'boolean' ? '#569cd6'
                          : value === null ? '#808080'
                          : '#d4d4d4',
                        wordBreak: 'break-all',
                        verticalAlign: 'top',
                        borderBottom: '1px solid #2a2a2a'
                      }}>
                        {value === null ? 'null' : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            <span style={styles.icon}>🔍</span>
            JSON Expanded View
          </h2>
          <div style={styles.controls}>
            <button
              style={{
                ...styles.modeButton,
                ...(viewMode === 'visual' ? styles.modeButtonActive : {})
              }}
              onClick={() => setViewMode('visual')}
            >
              📊 Visual Graph
            </button>
            <button
              style={{
                ...styles.modeButton,
                ...(viewMode === 'tree' ? styles.modeButtonActive : {})
              }}
              onClick={() => setViewMode('tree')}
            >
              🌳 Tree View
            </button>
            <button
              style={{
                ...styles.modeButton,
                ...(viewMode === 'code' ? styles.modeButtonActive : {})
              }}
              onClick={() => setViewMode('code')}
            >
              💻 Code View
            </button>
            <button
              style={{
                ...styles.modeButton,
                ...(viewMode === 'flatten' ? styles.modeButtonActive : {}),
                ...(viewMode !== 'flatten' ? { backgroundColor: 'rgba(0,200,150,0.18)', borderColor: 'rgba(0,200,150,0.5)', color: '#00e6a0' } : { backgroundColor: '#00c896', color: '#fff', borderColor: '#00c896' })
              }}
              onClick={() => setViewMode('flatten')}
            >
              🧩 Flatten View
            </button>
            <button
              style={styles.closeButton}
              onClick={onClose}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#b71c1c'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#d32f2f'}
            >
              ✕ Close
            </button>
          </div>
        </div>
        
        <div style={styles.stats}>
          <div style={styles.stat}>
            <strong>Size:</strong> {stats.size}
          </div>
          <div style={styles.stat}>
            <strong>Keys:</strong> {stats.keys}
          </div>
          <div style={styles.stat}>
            <strong>Lines:</strong> {stats.lines}
          </div>
        </div>
        
        <div style={styles.content}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default JsonCrackViewer;
