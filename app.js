const http = require('http');
const cors = require('cors');
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config()
const hostName = process.env.HOST_NAME
const frontPort = process.env.FRONTEND_PORT
const backendPort = process.env.BACKEND_PORT
const frontendUrl = `${hostName}:${frontPort}`
const backendUrl = `${hostName}:${backendPort}`

app.use(cors({
    origin: [frontendUrl, backendUrl, `${hostName}`],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from correct locations
app.use('/', express.static(__dirname));

// Add Python API proxy endpoint
app.post('/python-api/process-question', async (req, res) => {
    try {
      const pythonResponse = await fetch(`${backendUrl}/api/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });
      const data = await pythonResponse.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Python API connection failed' });
    }
  });

app.post('/python-api/upload-files', upload.any(), async (req, res) => {
  try {
    const form = new FormData();
    
    // Add files to form data
    req.files.forEach(file => {
        form.append('file', file.buffer, {
            filename: file.name,
            contentType: file.type
        });
    });

    // Forward to Python backend
    const response = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
    }

    const result = await response.json();
    res.json(result);

} catch (error) {
    res.status(500).json({ 
        error: 'File upload failed: ' + error.message 
    });
}
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index-agents.html'));

const server = http.createServer(app);
server.listen(parseInt(frontPort), () => {
  console.log(`Server running on ${frontendUrl}`);
});
