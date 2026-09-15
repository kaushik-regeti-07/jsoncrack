const XLSX = require('xlsx');

['transaction.xlsx', 'document.xlsx'].forEach(file => {
  console.log('\n===', file, '===');
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  console.log('Sheets:', wb.SheetNames);
  console.log('Columns:', Object.keys(data[0]));
  console.log('First 5 rows:');
  data.slice(0, 5).forEach(r => {
    const row = {};
    Object.keys(r).forEach(k => {
      row[k] = typeof r[k] === 'string' ? r[k].substring(0, 120) : r[k];
    });
    console.log(JSON.stringify(row));
  });
});
