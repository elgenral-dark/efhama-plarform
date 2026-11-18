const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { open, tx } = require('../server/db');

// Create test database in temp folder
const tmpDir = path.join(__dirname, 'tmp-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

try {
  const db = open(tmpDir);
  console.log('Database opened successfully');

  // Verify subscription_requests table exists
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subscription_requests'").get();
  assert(tableCheck, 'subscription_requests table should exist');
  console.log('✓ subscription_requests table exists');

  // Test inserting request
  const ins = db.prepare(`INSERT INTO subscription_requests(student_name, student_email, student_phone, amount, currency, method, reference, plan_duration_months, status, created_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .run('طارق عمر', 'tarek@example.com', '01012345678', 199.5, 'EGP', 'فودافون كاش', 'TRX-101', 12, new Date().toISOString(), 'تحويل كاش');
  const reqId = Number(ins.lastInsertRowid);
  assert(reqId > 0, 'Insert should succeed and return row id');
  console.log('✓ Inserted subscription request with ID:', reqId);

  // Test querying request
  const row = db.prepare('SELECT * FROM subscription_requests WHERE id=?').get(reqId);
  assert.strictEqual(row.student_name, 'طارق عمر');
  assert.strictEqual(row.status, 'pending');
  assert.strictEqual(row.amount, 199.5);
  console.log('✓ Query returned matching request row');

  // Test approval logic
  tx(db, () => {
    // 1. Create or activate student
    const stIns = db.prepare("INSERT INTO students(name, email, phone, status, sub_status, sub_start, sub_end, created_at) VALUES (?, ?, ?, 'active', 'active', ?, ?, ?)")
      .run(row.student_name, row.student_email, row.student_phone, '2026-11-15', '2027-11-15', new Date().toISOString());
    const studentId = Number(stIns.lastInsertRowid);

    // 2. Add verified payment
    db.prepare('INSERT INTO payments(student_id, amount, currency, reference, paid_at, verified) VALUES (?, ?, ?, ?, ?, 1)')
      .run(studentId, row.amount, row.currency, row.reference, new Date().toISOString());

    // 3. Mark request approved
    db.prepare("UPDATE subscription_requests SET status='approved', reviewed_at=?, reviewed_by=?, student_id=? WHERE id=?")
      .run(new Date().toISOString(), 'admin', studentId, reqId);
  });

  const approvedRow = db.prepare('SELECT * FROM subscription_requests WHERE id=?').get(reqId);
  assert.strictEqual(approvedRow.status, 'approved');
  assert(approvedRow.student_id > 0);
  assert.strictEqual(approvedRow.reviewed_by, 'admin');
  console.log('✓ Approval logic updated request status');

  const studentRow = db.prepare('SELECT * FROM students WHERE id=?').get(approvedRow.student_id);
  assert.strictEqual(studentRow.sub_status, 'active');
  assert.strictEqual(studentRow.sub_start, '2026-11-15');
  assert.strictEqual(studentRow.sub_end, '2027-11-15');
  console.log('✓ Student was created with active subscription');

  const payRow = db.prepare('SELECT * FROM payments WHERE student_id=?').get(approvedRow.student_id);
  assert.strictEqual(payRow.verified, 1);
  assert.strictEqual(payRow.amount, 199.5);
  console.log('✓ Payment was recorded and verified');

  // Test rejection logic with second request
  const ins2 = db.prepare(`INSERT INTO subscription_requests(student_name, student_email, student_phone, amount, currency, method, reference, plan_duration_months, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run('محمود علي', 'mahmoud@example.com', '01099998888', 199.5, 'EGP', 'فودافون كاش', 'TRX-102', 12, new Date().toISOString());
  const req2Id = Number(ins2.lastInsertRowid);

  db.prepare("UPDATE subscription_requests SET status='rejected', rejection_reason=?, reviewed_at=?, reviewed_by=? WHERE id=?")
    .run('لم يتم استلام المبلغ على فودافون كاش', new Date().toISOString(), 'admin', req2Id);

  const rejectedRow = db.prepare('SELECT * FROM subscription_requests WHERE id=?').get(req2Id);
  assert.strictEqual(rejectedRow.status, 'rejected');
  assert.strictEqual(rejectedRow.rejection_reason, 'لم يتم استلام المبلغ على فودافون كاش');
  assert.strictEqual(rejectedRow.reviewed_by, 'admin');
  console.log('✓ Rejection logic updated request with reason');

  console.log('\nALL DATABASE TESTS PASSED SUCCESSFULLY! 🎉');
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {}
}
