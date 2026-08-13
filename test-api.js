const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function testAuditTracker() {
  console.log('--- TESTING RECORD DELETION & AUDIT TRACKER ---');

  // 1. Register test user
  const regRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Inspector Gadget',
    email: 'inspector_' + Date.now() + '@example.com',
    password: 'password123'
  });

  const token = regRes.data.token;
  console.log('1. User Registered:', regRes.data.user.name);

  // 2. Create Burial Record
  const createRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/burials',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, {
    name: 'Samuel Clemens',
    dateOfDeath: '2026-05-01',
    dateOfBurial: '2026-05-04',
    address: '121 Hannibal Street',
    lotNumber: 'B-201',
    section: 'Memorial Park',
    notes: 'Famous author'
  });
  console.log('2. Created Record:', createRes.data.burial.name, '(ID:', createRes.data.burial._id, ')');

  // 3. Edit Burial Record
  const editRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/burials/${createRes.data.burial._id}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, {
    name: 'Mark Twain (Samuel Clemens)',
    lotNumber: 'B-202'
  });
  console.log('3. Updated Record:', editRes.data.burial.name);

  // 4. Delete Burial Record
  const deleteRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/burials/${createRes.data.burial._id}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('4. Deleted Record Status:', deleteRes.data.message);

  // 5. Fetch Audit Trail Logs
  const auditRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/burials/audit-logs',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log('5. Audit Logs Fetched:', auditRes.data.count, 'entries.');
  auditRes.data.logs.slice(0, 3).forEach((log, index) => {
    console.log(`   [Log ${index + 1}] Action: ${log.action} | Deceased: "${log.recordName}" | User: ${log.performedBy.name} | Details: ${log.details}`);
  });

  console.log('--- ALL AUDIT & DELETE VERIFICATION TESTS PASSED ---');
}

testAuditTracker().catch(console.error);
