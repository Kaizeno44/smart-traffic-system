// migrations/run-migration.js
// Chạy migration bằng Node.js, không cần cài psql
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const fileName = process.argv[2] || '002_add_fine_columns.sql';
  const sqlFile = path.join(__dirname, fileName); 
  
  if (!fs.existsSync(sqlFile)) {
    console.error(`❌ Không tìm thấy file: ${sqlFile}`);
    process.exit(1);
  }
  
  const sql = fs.readFileSync(sqlFile, 'utf8');
  console.log(`📄 Đọc file: ${sqlFile}`);
  console.log(`📦 DATABASE_URL: ${process.env.DATABASE_URL ? '✅ có' : '❌ thiếu'}`);
  
  const client = await pool.connect();
  try {
    console.log('🚀 Đang chạy migration...');
    await client.query(sql);
    console.log('✅ Migration thành công!');
    
    // Verify
    const verify = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'violations' 
        AND column_name IN ('fine_min', 'fine_max', 'fine_text', 'legal_basis')
      ORDER BY column_name;
    `);
    
    console.log('\n📊 Cột mới trong bảng Violations:');
    verify.rows.forEach(r => {
      console.log(`  ✅ ${r.column_name} (${r.data_type}) — default: ${r.column_default}`);
    });
    
    if (verify.rows.length === 4) {
      console.log('\n🎉 Hoàn tất! Đủ 4 cột.');
    } else {
      console.log(`\n⚠️ Chỉ thấy ${verify.rows.length}/4 cột — kiểm tra lại.`);
    }
  } catch (err) {
    console.error('❌ Lỗi migration:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();