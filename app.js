const http = require('http');
const cors = require('cors');
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config()

const localHostName = process.env.LOCAL_HOST_NAME
const externalIp = process.env.EXTERNAL_IP
const frontendPort = process.env.FRONTEND_PORT
const backendPort = process.env.BACKEND_PORT
const uePort = process.env.UE_PORT
const localFrontendUrl = `http://${localHostName}:${frontendPort}`
const localBackendUrl = `http://${localHostName}:${backendPort}`
const localUeUrl = `http://${localHostName}:${uePort}`
const externalFrontendUrl = `http://${externalIp}:${frontendPort}`
const externalBackendUrl = `http://${externalIp}:${backendPort}`
const externalUeUrl = `http://${externalIp}:${uePort}`



app.use(cors({
    origin: [externalFrontendUrl, externalBackendUrl, externalUeUrl, localFrontendUrl, localBackendUrl,localUeUrl],
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
      const pythonResponse = await fetch(`${serverBackendUrl}/api/answer`, {
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
    const response = await fetch(`${serverBackendUrl}/api/upload`, {
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

app.get('/', (req, res) => res.sendFile(__dirname + '/public/mainpage.html'));
app.get('/signup.html', (req, res) => res.sendFile(__dirname + '/public/signup.html'));
app.get('/login.html', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/my-account.html', (req, res) => res.sendFile(__dirname + '/public/my-account.html'));
app.get('/quiz.html', (req, res) => res.sendFile(__dirname + '/public/quiz.html'));
app.get('/service.html', (req, res) => res.sendFile(__dirname + '/public/service.html'));


const server = http.createServer(app);
server.listen(parseInt(frontendPort), () => {
  console.log(`Server running on ${localFrontendUrl}`);
});
