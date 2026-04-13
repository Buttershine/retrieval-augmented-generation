const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

// Create a test file
const testFile = 'test_doc.txt';
fs.writeFileSync(testFile, 'This is a test document for RAG system ingestion.');

// Create form data with file
const form = new FormData();
form.append('files', fs.createReadStream(testFile));

// Send POST request
const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/ingest',
  method: 'POST',
  headers: form.getHeaders()
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('Response Body:');
    console.log(JSON.stringify(JSON.parse(data), null, 2));
    
    // Clean up
    fs.unlinkSync(testFile);
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
  fs.unlinkSync(testFile);
  process.exit(1);
});

form.pipe(req);
