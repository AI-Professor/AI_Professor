import { initializeVoiceRecognition } from "./voice-ui.js";
import { loadNavbar } from "./navbar.js";

const ENV = await (await fetch("/api.json")).json();
const serverHostName = ENV.SERVER_HOST_NAME
const serverFrontendPort = ENV.SERVER_FRONTEND_PORT
const serverBackendPort = ENV.SERVER_BACKEND_PORT
const serverUePort = ENV.SERVER_UE_PORT
const serverFrontendUrl = `http://${serverHostName}:${serverFrontendPort}`
const serverBackendUrl = `http://${serverHostName}:${serverBackendPort}`
const serverUeUrl = `ws://${serverHostName}:${serverUePort}`
const localHostName = ENV.LOCAL_HOST_NAME
const localFrontendPort = ENV.LOCAL_FRONTEND_PORT
const localBackendPort = ENV.LOCAL_BACKEND_PORT
const localUePort = ENV.LOCAL_UE_PORT
const localFrontendUrl = `http://${localHostName}:${localFrontendPort}`
const localBackendUrl = `http://${localHostName}:${localBackendPort}`
const localUeUrl = `ws://${localHostName}:${localUePort}`

let closed = false;
window.pixelStreamingApp = null;

const videoElement = document.getElementById('pixelStreamVideo');

//The following section of functions will serve connect button clicked event. These functions are meant to create a live stream, establish a WebRTC connection with the platform, and submit network information to initialize connection. These steps are crucial to our implementation to Real-Time Q&A feature. Detailed explanation can be find on "https://docs.d-id.com/reference/talks-streams-overview".
const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  try {
    // Disable the button to prevent multiple clicks
    connectButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      return;
    }
    const statusDiv = document.createElement('div');
    statusDiv.id = 'connection-status';
    statusDiv.innerText = 'Establishing connection...';
    statusDiv.style.position = 'absolute';
    statusDiv.style.top = '50%';
    statusDiv.style.left = '50%';
    statusDiv.style.transform = 'translate(-50%, -50%)';
    statusDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    statusDiv.style.color = 'white';
    statusDiv.style.padding = '20px';
    statusDiv.style.borderRadius = '5px';
    statusDiv.style.zIndex = '1000';
    document.body.appendChild(statusDiv);

    // Send a POST request to the /api/connect endpoint
    const response = await fetch(`${localBackendUrl}/api/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check if the request was successful
    if (!response.ok) {
      throw new Error('Failed to connect');
    }

    const data = await response.json();
    console.log('Connection successful:', data);

    initializePixelStreaming();
    const connectionTimeout = 20000; // 20 seconds
    const connectionPromise = window.pixelStreamingApp.connect();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), connectionTimeout);
    });

    await Promise.race([connectionPromise, timeoutPromise]);
    
    // Add ICE connection state monitoring
    monitorIceConnectionState();

    statusDiv.innerText = 'Connection established!';
    setTimeout(() => {
      if (document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
    }, 2000);

    // Optionally, enable the button again or update UI
    connectButton.disabled = false;
    alert('Connection successful!');
    forceVideoRefresh();
  } catch (error) {
    console.error('Error connecting:', error);
    alert('Connection failed!');
    connectButton.disabled = false;
  }
};
function initializePixelStreaming() {
  const epic = window["epicgames-frontend"];
  if (!epic) {
    console.error('epicgames-frontend is not loaded. Make sure player.js is included.');
    return;
  }

  console.log('Initializing PixelStreaming with enhanced WebRTC config...');
  
  // Use the exact signaling server URL that works
  const signalingUrl = `ws://${localHostName}:8085`;
  console.log('Using signaling server URL:', signalingUrl);
  
  // Enhanced WebRTC configuration that matches the successful connection
  const webRtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { 
        urls: 'turn:170.140.151.5:19303',
        username: 'pixelstreaming',  // Add credentials if required
        credential: 'pixelstreaming'
      }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'balanced',  // Changed from max-bundle to balanced
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 0,    // Match the successful configuration
    offerExtmapAllowMixed: true,
    offerToReceiveAudio: true, // Make sure this is true
    offerToReceiveVideo: true
  };

  const config = new epic.Config({ 
    useUrlParams: false,  // Disable URL params to ensure our settings are used
    initialSettings: {
      SignallingServerUrl: signalingUrl,
      StreamerId: "DefaultStreamer",
      PlayerConnectedResponse: "PixelStreamingPlayerId"
    },
    webRtcConfiguration: webRtcConfig
  });

  console.log('PixelStreaming config:', config);
  window.pixelStreamingApp = new epic.PixelStreaming(config);

  // Add connection event listeners
  window.pixelStreamingApp.addEventListener('webRtcConnecting', () => {
    console.log('WebRTC connecting...');
  });

  window.pixelStreamingApp.addEventListener('webRtcConnected', () => {
    console.log('WebRTC connected successfully!');
  });
  

  window.pixelStreamingApp.addEventListener('webRtcFailed', (event) => {
    console.error('WebRTC connection failed:', event);
    // Try reconnecting with TURN only if regular connection fails
    if (window.pixelStreamingApp._webRtcController && window.pixelStreamingApp._webRtcController.peerConnection) {
      console.log('Attempting reconnection with TURN only...');
      window.pixelStreamingApp._webRtcController.peerConnection.iceTransportPolicy = 'relay';
      window.pixelStreamingApp.reconnect();
    }
  });

  window.pixelStreamingApp.addEventListener('webRtcInitialized', () => {
    console.log('WebRTC initialized');
  });

  // Style and Application UI
  const style = new epic.PixelStreamingApplicationStyle();
  style.applyStyleSheet();

  const app = new epic.Application({
    stream: window.pixelStreamingApp,
    onColorModeChanged: (mode) => style.setColorMode(mode)
  });

  document.body.appendChild(app.rootElement);
}
function monitorIceConnectionState() {
  if (!window.pixelStreamingApp) {
    console.error('PixelStreaming not initialized');
    return;
  }

  console.log('Starting ICE connection monitoring...');
  
  // Wait for WebRTC controller to be initialized
  let attempts = 0;
  const maxAttempts = 100; // 10 seconds total (100ms * 100)
  
  const checkController = setInterval(() => {
    attempts++;
    
    if (attempts > maxAttempts) {
      console.error('Timed out waiting for WebRTC controller');
      clearInterval(checkController);
      return;
    }
    
    if (!window.pixelStreamingApp._webRtcController) {
      if (attempts % 10 === 0) { // Log only every 10th attempt to reduce noise
        console.log(`Waiting for WebRTC controller (attempt ${attempts}/${maxAttempts})...`);
      }
      return;
    }
    
    clearInterval(checkController);
    console.log('WebRTC controller found, checking peer connection...');
    
    // Give a little time for peer connection to be established
    setTimeout(() => {
      const peerConnection = window.pixelStreamingApp._webRtcController.peerConnection;
      if (!peerConnection) {
        console.error('PeerConnection not found - connection may have failed');
        return;
      }
      
      console.log('Initial ICE connection state:', peerConnection.iceConnectionState);
      console.log('Initial connection state:', peerConnection.connectionState);
      console.log('Initial signaling state:', peerConnection.signalingState);
      
      // Log all ICE candidates
      console.log('Local ICE candidates:', window.pixelStreamingApp._webRtcController.localICECandidates);
      
      peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('ICE connection state changed to:', peerConnection.iceConnectionState);
        
        switch (peerConnection.iceConnectionState) {
          case 'connected':
          case 'completed':
            console.log('ICE connection established successfully');
            // Log the selected candidate pair
            try {
              peerConnection.getStats().then(stats => {
                stats.forEach(report => {
                  if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    console.log('Selected candidate pair:', report);
                  }
                });
              });
            } catch (e) {
              console.error('Error getting stats:', e);
            }
            break;
          case 'failed':
            console.error('ICE connection failed - attempting reconnect');
            window.pixelStreamingApp.reconnect();
            break;
          case 'disconnected':
            console.warn('ICE connection disconnected - checking connection...');
            setTimeout(() => {
              if (peerConnection.iceConnectionState === 'disconnected') {
                window.pixelStreamingApp.reconnect();
              }
            }, 5000);
            break;
        }
      });
      
      // Monitor connection state changes
      peerConnection.addEventListener('connectionstatechange', () => {
        console.log('Connection state changed to:', peerConnection.connectionState);
      });
      
      // Monitor ICE gathering
      peerConnection.addEventListener('icegatheringstatechange', () => {
        console.log('ICE gathering state:', peerConnection.iceGatheringState);
      });
      
      // Log ICE candidates
      peerConnection.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          console.log('New ICE candidate:', event.candidate.candidate);
        }
      });
      
      // Log ICE candidate errors
      peerConnection.addEventListener('icecandidateerror', (event) => {
        console.error('ICE candidate error:', event);
      });
    }, 1000);
  }, 100);
}
function forceVideoRefresh() {
  console.log('Forcing video element refresh...');

  // Detach and Re-Attach MediaStream
  videoElement.srcObject = null;
  setTimeout(() => {
    const videoPlayer = window.pixelStreamingApp._webRtcController.videoPlayer;
    const stream = videoPlayer.videoElement.srcObject;

    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = false;

    // Force play
    videoElement.onloadeddata = () => {
      console.log('Video data loaded, forcing play...');
      videoElement.play().catch(error => console.error('Video play failed:', error));
    };

    videoElement.onplay = () => {
      console.log('Video is now playing.');
    };
  }, 500);
}

const lectureButton = document.getElementById('lecture-button');
const topicInput = document.getElementById('topic-input');
lectureButton.onclick = async () => {
  try {
    lectureButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      return;
    }

    const topic = topicInput.value.trim();
    if (!topic) {
      alert('Please enter a topic.');
      lectureButton.disabled = false;
      return;
    }

    const response = await fetch(`${localBackendUrl}/api/lecture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ topic: topic })
    });

    if (!response.ok) throw new Error('Failed to generate lesson!');

    const data = await response.json();
    console.log('Lesson generated successfully:', data);
    alert('Lesson generated successfully!');
    lectureButton.disabled = false;
  } catch (error) {
    alert(`Lesson generation failed! Lecture Error: ${error.message}`);
    lectureButton.disabled = false;
  }
};

//The following section of functions will serve to record an user's voice input, send it to backend through API calls in main.py to process, and get our GPT-4 model's answer back from backend and create a stream talk that can be seen and listend on our frontend Real-Time interaction.
const startButton = document.getElementById('start-button');
startButton.onclick = async () => {
  try {
      startButton.disabled = true;

      const token = sessionStorage.getItem('accessToken');
      if (!token) {
        alert('No access token found. Please log in.');
        return;
      }

      const userQuestion = await initializeVoiceRecognition();
      addChatMessage(`You: ${userQuestion}`, 'user');
      
      const backendResponse = await fetch(`${localBackendUrl}/api/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userQuestion })
      }).catch(error => {
        throw new Error(`Network error: ${error.message}`);
      });
      
      if (!backendResponse.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      
      const {text}= await backendResponse.json();
      addChatMessage(`AI: ${text}`, 'ai');
      
      startButton.disabled = false;
  } catch (error) {
      startButton.disabled = false;
      showStatusMessage(`❌ Processing error: ${error.message}`, true);
  }
};
document.getElementById('text-input').addEventListener('input', function() {
  this.style.height = 'auto'; // Reset the height
  this.style.height = (this.scrollHeight) + 'px'; // Set the height to the scroll height
});
const textButton = document.getElementById('text-submit-button');
textButton.onclick = async () => {
  try {
    textButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      return;
    }

    const question = document.getElementById('text-input').value;
    if (!question) {
      showStatusMessage('Please enter a question.', true);
      return;
    }

    document.getElementById('text-input').value = '';
    addChatMessage(`You: ${question}`, 'user');

    const response = await fetch(`${localBackendUrl}/api/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question: question })
    }).catch(error => {
      throw new Error(`Network error: ${error.message}`);
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    addChatMessage(`AI: ${data.text}`, 'ai');

    textButton.disabled = false;
  } catch (error) {
    document.getElementById('text-input').value = '';
    textButton.disabled = false;
    showStatusMessage(`❌ Processing error: ${error.message}`, true);
  }
}
const MAX_MESSAGES = 1;
function addChatMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.textContent = text;
  const msgHistory = document.getElementById('msgHistory');
  msgHistory.appendChild(msgDiv);

  // Remove oldest messages if the number of messages exceeds the limit
  while (msgHistory.children.length > MAX_MESSAGES) {
    msgHistory.removeChild(msgHistory.firstChild);
  }
}

//The following section of functions will serve disconnect button clicked. It will disconnect the live stream we created and cut off peer connection
const disconnectButton = document.getElementById('disconnect-button');
disconnectButton.onclick = async () => {
  try {
    // Disable the button to prevent multiple clicks
    disconnectButton.disabled = true;
    
    // Send a POST request to the /api/connect endpoint
    const response = await fetch(`${localBackendUrl}/api/disconnect`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check if the request was successful
    if (!response.ok) {
      throw new Error('Failed to disconnect');
    }

    const data = await response.json();
    console.log('Disconnected successfully:', data);

    await window.pixelStreamingApp.disconnect();
    closed = true;

    // Optionally, enable the button again or update UI
    disconnectButton.disabled = false;
    alert('Disconnected successfully!');
  } catch (error) {
    console.error('Error connecting:', error);
    alert('Disconnect failed!');
    disconnectButton.disabled = false;
  }
};

//The following section of functions will serve upload function. It will take required form of input files and send it to our backend through API calls in main.py to process. It will initialize our knowledge graph based on given input
const uploadButton = document.getElementById('upload-button');
uploadButton.onclick = async () => {
  uploadButton.disabled = true;

  const token = sessionStorage.getItem('accessToken');
  if (!token) {
    alert('No access token found. Please log in.');
    return;
  }

  const fileInput = document.getElementById('fileInput');
  const files = Array.from(fileInput.files);
  
  if (files.length === 0) {
      alert('Please select files first!');
      uploadButton.disabled = false;
      return;
  }

  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
      showStatusMessage('Uploading files...');
      const response = await fetch(`${localBackendUrl}/api/upload`, {
          method: 'POST',
          body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed');
      
      await checkSystemStatus();

      uploadButton.disabled = false;
      alert(`Upload Successful! ${result.message}`)
      
  } catch (error) {
      alert(`Upload failed! ${error.message}`)
      uploadButton.disabled = false;
  }
};
async function checkSystemStatus() {
  try {
      const response = await fetch(`${localBackendUrl}/health`);
      const status = await response.json();
      if (status.initialized) {
          showStatusMessage('System ready with latest content');
      }
  } catch (error) {
      console.error('Status check failed:', error);
  }
}

//These two functions are constantly used by state changing event to check status of our frontend UI .
function showStatusMessage(message, isError = false) {
  const statusDiv = document.createElement('div');
  statusDiv.className = `status-msg ${isError ? 'error' : 'info'}`;
  statusDiv.textContent = message;
  document.getElementById('msgHistory').prepend(statusDiv);
}

document.addEventListener('DOMContentLoaded', loadNavbar());
  
window.addEventListener('beforeunload', async () => {
  if (closed == false){
    try {
      // Send a POST request to the /api/connect endpoint
      const response = await fetch(`${localBackendUrl}/api/disconnect`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      const data = await response.json();

      
      await window.pixelStreamingApp.disconnect();
      

    } catch (error) {
      console.error('Error connecting:', error);
      disconnectButton.disabled = false;
    }
}
});
