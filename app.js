const http = require('http');
const cors = require('cors');
const express = require('express');
const port = 3000;

const app = express();

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5001'],
    methods: ['GET', 'POST'],
    credentials: true
  }));

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from correct locations
app.use('/', express.static(__dirname));
app.use('/d-id-assets', express.static('src/avatar/streaming'));

// Add Python API proxy endpoint
app.post('/python-api/process-question', async (req, res) => {
    try {
      const pythonResponse = await fetch('http://localhost:5001/api/answer', {
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

  app.post('/python-api/generate-audio-response', async (req, res) => {
      try {
        const audioResponse = await fetch('http://localhost:5001/api/audio-answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(req.body)
        });
        const data = await audioResponse.json();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: 'Python API connection failed'});
      }
  });

  app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
  app.get('/agents', (req, res) => res.sendFile(__dirname + '/public/index-agents.html'));
  
  const server = http.createServer(app);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
