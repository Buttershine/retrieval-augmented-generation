const FormData = require('form-data');
const fs = require('fs');
const http = require('http');

const testFile = 'test_doc.txt';

// Upload document
const form = new FormData();
form.append('files', fs.createReadStream(testFile));

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/ingest',
  method: 'POST',
  headers: form.getHeaders()
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Upload Response Status:', res.statusCode);
    console.log('Upload Response:', JSON.stringify(JSON.parse(data), null, 2));

    // Now check documents endpoint
    const docsReq = http.request({
      hostname: 'localhost',
      port: 8000,
      path: '/documents',
      method: 'GET'
    }, (docsRes) => {
      let docsData = '';
      docsRes.on('data', (chunk) => docsData += chunk);
      docsRes.on('end', () => {
        console.log('\nDocuments Response Status:', docsRes.statusCode);
        console.log('Documents Response:', JSON.stringify(JSON.parse(docsData), null, 2));
        console.log('\n✅ Document uploaded and registered. Now stop server, restart, and check persistence.');
        process.exit(0);
      });
    });

    docsReq.on('error', (error) => {
      console.error('Documents request error:', error);
      process.exit(1);
    });

    docsReq.end();
  });
});

req.on('error', (error) => {
  console.error('Upload error:', error);
  process.exit(1);
});

form.pipe(req);