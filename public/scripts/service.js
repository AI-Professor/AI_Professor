import { initializeVoiceRecognition } from "./voice-ui.js";
import { loadNavbar } from "./navbar.js";
import { loadFooter } from "./footer.js";

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

document.addEventListener('DOMContentLoaded', loadNavbar());
document.addEventListener('DOMContentLoaded', loadFooter());
document.addEventListener('DOMContentLoaded', addClearChatButton);

let closed = false;
let autoScrollChat = true;
let autoScrollLecture = true;
let activeSession = null;
window.pixelStreamingApp = null;


const videoElement = document.getElementById('pixelStreamVideo');

const statusMessageBox = document.getElementById('status-message-box');
function showStatusMessage(message, type = 'info') {
  const msg = document.createElement('div');
  msg.className = `status-message ${type}`;
  msg.textContent = message;

  statusMessageBox.prepend(msg); // Most recent message on top

  // Optionally auto-remove after X seconds
  setTimeout(() => {
    msg.remove();
  }, 5000);
}

// Function to store session data in localStorage
function saveSessionData(sessionData) {
  sessionStorage.setItem('aiProfessorSession', JSON.stringify(sessionData));
  activeSession = sessionData;
}
// Function to retrieve session data from localStorage
function getSessionData() {
  const sessionData = sessionStorage.getItem('aiProfessorSession');
  if (sessionData) {
    activeSession = JSON.parse(sessionData);
    return activeSession;
  }
  return null;
}
// Function to clear session data
function clearSessionData() {
  sessionStorage.removeItem('aiProfessorSession');
  activeSession = null;
}
// Check for existing session on page load
document.addEventListener('DOMContentLoaded', () => {
  const savedSession = getSessionData();
  if (savedSession) {
    // Optionally, verify if the session is still active on the server
    checkSessionStatus(savedSession.session_id);
  }
});
// Function to check if a stored session is still active
async function checkSessionStatus(sessionId) {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;

    const response = await fetch(`${localBackendUrl}/api/user-sessions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      clearSessionData();
      return;
    }

    const data = await response.json();
    const isActive = data.sessions.some(session => session.session_id === sessionId);
    
    if (!isActive) {
      clearSessionData();
    } else {
      // Session is still active, update the UI to reflect this
      updateUIForActiveSession();
    }
  } catch (error) {
    console.error('Error checking session status:', error);
    // In case of error, don't clear the session
  }
}
// Function to update UI for active session
function updateUIForActiveSession() {
  if (activeSession) {
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    showStatusMessage('✅ You have an active session running!');
  } else {
    connectButton.disabled = false;
    disconnectButton.disabled = true;
  }
}

//The following section of functions will serve connect button clicked event. These functions are meant to create a live stream, establish a WebRTC connection with the platform, and submit network information to initialize connection. These steps are crucial to our implementation to Real-Time Q&A feature. Detailed explanation can be find on "https://docs.d-id.com/reference/talks-streams-overview".
const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  try {
    // Disable the button to prevent multiple clicks
    connectButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      connectButton.disabled = false;
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

    // Check if we already have an active session
    const existingSession = getSessionData();
    if (existingSession) {
      statusDiv.innerText = 'Using existing session...';
      
      // Wait for UE instance to be ready
      await waitForUEInstance(existingSession.session_id, 5, 1000);
      
      // Initialize PixelStreaming with the existing session details
      try {
        await initializePixelStreamingForSession(existingSession);
        
        statusDiv.innerText = 'Connection established!';
        setTimeout(() => {
          if (document.body.contains(statusDiv)) {
            document.body.removeChild(statusDiv);
          }
        }, 2000);
        
        connectButton.disabled = true;
        disconnectButton.disabled = false;
        showStatusMessage('✅ Connected to existing session successfully!');
        
        // Load chat history for the existing session
        await loadChatHistory();
      } catch (error) {
        console.error('Error connecting to existing session:', error);
        statusDiv.innerText = 'Retrying connection...';
        
        // Add a longer delay and retry once
        await new Promise(resolve => setTimeout(resolve, 3000));
        await initializePixelStreamingForSession(existingSession);
        
        statusDiv.innerText = 'Connection established!';
        setTimeout(() => {
          if (document.body.contains(statusDiv)) {
            document.body.removeChild(statusDiv);
          }
        }, 2000);
        
        connectButton.disabled = true;
        disconnectButton.disabled = false;
        showStatusMessage('✅ Connected to existing session successfully!');
        
        // Load chat history for the existing session
        await loadChatHistory();
      }
      return;
    }

    // Send a POST request to the /api/connect endpoint
    statusDiv.innerText = 'Creating new session...';
    const response = await fetch(`${localBackendUrl}/api/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Check if the request was successful
    if (!response.ok) {
      throw new Error('Failed to connect');
    }

    const data = await response.json();
    
    // Save the session data
    saveSessionData(data);
    
    // Update status message
    statusDiv.innerText = 'Waiting for UE instance to start...';
    
    // Wait for the UE instance to be ready before attempting to connect
    await waitForUEInstance(data.session_id, 10, 2000); // Check 10 times with 2 second delays
    
    // Try to initialize PixelStreaming with the new session details
    try {
      statusDiv.innerText = 'Connecting to UE instance...';
      await initializePixelStreamingForSession(data);
    } catch (error) {
      console.error('First connection attempt failed, retrying:', error);
      statusDiv.innerText = 'Retrying connection...';
      
      // Wait a bit longer and try again
      await new Promise(resolve => setTimeout(resolve, 5000));
      await initializePixelStreamingForSession(data);
    }
    
    statusDiv.innerText = 'Connection established!';
    setTimeout(() => {
      if (document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
    }, 2000);

    // Enable the disconnect button
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    showStatusMessage('✅ New connection established successfully!');
    
    // Clear any previous chat history
    await loadChatHistory();
    
  } catch (error) {
    console.error('Error connecting:', error);
    // Remove status div
    const statusDiv = document.getElementById('connection-status');
    if (statusDiv && document.body.contains(statusDiv)) {
      document.body.removeChild(statusDiv);
    }
    
    // Even though we got an error, the connection might still be happening in the background
    // Let's not alert immediately, but instead show a message and wait
    showStatusMessage('🔄 Connection in progress, please wait...');
    
    // Wait a bit to see if the connection establishes itself
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // If we have a session data saved, it means the backend part worked
    // Let's try one more time to connect to the UE instance
    const sessionData = getSessionData();
    if (sessionData) {
      try {
        // Try one more time with an additional wait
        await waitForUEInstance(sessionData.session_id, 5, 1000);
        await initializePixelStreamingForSession(sessionData);
        
        // If we get here, the connection was successful
        connectButton.disabled = true;
        disconnectButton.disabled = false;
        showStatusMessage('✅ Connection established successfully after retry!');
        
        // Load chat history for the new session
        await loadChatHistory();
        return;
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        // Now we can alert that it failed
        alert('Connecting to stream failed after multiple attempts. Please try again later.');
      }
    } else {
      alert('Connecting to stream failed! Please try again later.');
    }
    
    connectButton.disabled = false;
  }
};
async function initializePixelStreamingForSession(sessionData) {
  const epic = window["epicgames-frontend"];
  if (!epic) {
    throw new Error('epicgames-frontend is not loaded. Make sure player.js is included.');
  }

  console.log('Initializing PixelStreaming for session:', sessionData);
  
  // Use the specific signaling server URL for this session
  const signalingUrl = `ws://${localHostName}:${sessionData.websocket_port}`;
  console.log('Using signaling server URL:', signalingUrl);
  
  // Enhanced WebRTC configuration
  const webRtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { 
        urls: `turn:${localHostName}:19303`,
        username: 'pixelstreaming',
        credential: 'pixelstreaming'
      }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'balanced',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 0,
    offerExtmapAllowMixed: true
  };

  const config = new epic.Config({ 
    useUrlParams: false,
    initialSettings: {
      SignallingServerUrl: signalingUrl,
      StreamerId: sessionData.streamer_id,
      PlayerConnectedResponse: "PixelStreamingPlayerId"
    },
    webRtcConfiguration: webRtcConfig
  });

  console.log('PixelStreaming config:', config);
  window.pixelStreamingApp = new epic.PixelStreaming(config);

  // Create a promise that will resolve when the connection is established
  const connectionPromise = new Promise((resolve, reject) => {
    // Set a timeout for the connection
    const connectionTimeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 20000); // 20 second timeout
    
    // Setup event listeners
    window.pixelStreamingApp.addEventListener('webRtcConnecting', () => {
      console.log('WebRTC connecting...');
    });

    window.pixelStreamingApp.addEventListener('webRtcConnected', () => {
      console.log('WebRTC connected successfully!');
      clearTimeout(connectionTimeout);
      
      // Wait 3 seconds after connection to check for the stream
      setTimeout(() => {
        attachVideoStream();
        resolve(); // Resolve the promise when connected
      }, 3000);
    });
    
    window.pixelStreamingApp.addEventListener('streamingStarted', () => {
      console.log('Streaming started!');
      window.pixelStreamingApp.dispatchEvent(new Event('videoInitialized'));
    });

    window.pixelStreamingApp.addEventListener('videoInitialized', () => {
      console.log('Video initialized event received - stream should be ready');
      setTimeout(attachVideoStream, 1000); // Wait 1 second after video is initialized
    });

    window.pixelStreamingApp.addEventListener('webRtcFailed', (event) => {
      console.error('WebRTC connection failed:', event);
      
      // Try reconnecting with TURN only if regular connection fails
      if (window.pixelStreamingApp._webRtcController && window.pixelStreamingApp._webRtcController.peerConnection) {
        console.log('Attempting reconnection with TURN only...');
        window.pixelStreamingApp._webRtcController.peerConnection.iceTransportPolicy = 'relay';
        window.pixelStreamingApp.reconnect();
      } else {
        clearTimeout(connectionTimeout);
        reject(new Error('WebRTC connection failed'));
      }
    });

    window.pixelStreamingApp.addEventListener('webRtcInitialized', () => {
      console.log('WebRTC initialized');
    });

    // Add a specific event listener for track added
    window.pixelStreamingApp.addEventListener('trackAdded', (event) => {
      console.log('Track added:', event.detail.kind);
      if (event.detail.kind === 'video') {
        // Dispatch our custom event when video track is added
        window.pixelStreamingApp.dispatchEvent(new Event('videoInitialized'));
      }
    });
  });

  // Style setup
  const style = new epic.PixelStreamingApplicationStyle();
  style.applyStyleSheet();

  const app = new epic.Application({
    stream: window.pixelStreamingApp,
    onColorModeChanged: (mode) => style.setColorMode(mode)
  });

  // Connect to the signaling server and wait for the connection to establish
  await window.pixelStreamingApp.connect();
  
  // Start monitoring ICE connection state
  monitorIceConnectionState();
  
  // Set a final fallback timer for video attachment
  setTimeout(attachVideoStream, 5000);
  
  // Wait for the connection to be established
  return connectionPromise;
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
function attachVideoStream() {
  console.log('Attempting to attach video stream...');
  
  if (!window.pixelStreamingApp) {
    console.error('PixelStreamingApp not initialized');
    return;
  }
  
  // Check if we can access the video controller
  if (!window.pixelStreamingApp._webRtcController) {
    console.log('WebRTC controller not ready yet, will retry later');
    return;
  }
  
  // Check if video player is available
  const videoPlayer = window.pixelStreamingApp._webRtcController.videoPlayer;
  if (!videoPlayer || !videoPlayer.videoElement) {
    console.log('Video player not ready yet, will retry later');
    return;
  }
  
  // Check if the source stream is available
  const pixelStreamingVideo = videoPlayer.videoElement;
  console.log('PixelStreaming video element found:', pixelStreamingVideo);
  
  if (!pixelStreamingVideo.srcObject) {
    console.log('No srcObject in PixelStreaming video element yet, will retry later');
    
    // Try to find the stream from peer connection directly
    try {
      const peerConnection = window.pixelStreamingApp._webRtcController.peerConnection;
      if (peerConnection) {
        const receivers = peerConnection.getReceivers();
        if (receivers && receivers.length > 0) {
          console.log('Found receivers in peer connection:', receivers.length);
          
          // Create a new MediaStream from the tracks
          const newStream = new MediaStream();
          receivers.forEach(receiver => {
            if (receiver.track) {
              console.log('Adding track to new stream:', receiver.track.kind);
              newStream.addTrack(receiver.track);
            }
          });
          
          // If we have tracks, set this stream
          if (newStream.getTracks().length > 0) {
            videoElement.srcObject = newStream;
            videoElement.play().catch(e => console.error('Play failed:', e));
            return;
          }
        }
      }
    } catch (e) {
      console.error('Error trying to get stream from peer connection:', e);
    }
    
    return;
  }
  
  console.log('PixelStreaming source stream found:', pixelStreamingVideo.srcObject);
  
  // Get tracks from the stream
  const tracks = pixelStreamingVideo.srcObject.getTracks();
  console.log('Stream tracks:', tracks.length);
  
  if (tracks.length === 0) {
    console.log('No tracks in stream yet, will retry later');
    return;
  }
  
  // Create a new MediaStream and add all tracks
  const newStream = new MediaStream();
  tracks.forEach(track => {
    console.log('Adding track to new stream:', track.kind, track.readyState);
    newStream.addTrack(track);
  });
  
  // Attach to our video element
  videoElement.srcObject = newStream;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.muted = false; // Ensure audio is not muted
  
  // Make sure video element is visible
  videoElement.style.display = 'block';
  videoElement.style.width = '100%';
  videoElement.style.height = '100%';
  
  // Force play
  videoElement.play()
    .then(() => console.log('Video playback started successfully'));
}
async function checkUEInstanceStatus(sessionId) {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return false;
    
    const response = await fetch(`${localBackendUrl}/api/session-status?session_id=${sessionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.ue_instance_running;
  } catch (error) {
    console.error('Error checking UE instance status:', error);
    return false;
  }
}
// Function to wait for UE instance to be ready
async function waitForUEInstance(sessionId, maxAttempts = 10, delayMs = 1000) {
  showStatusMessage('⏳ Waiting for UE instance to start...');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isReady = await checkUEInstanceStatus(sessionId);
    
    if (isReady) {
      showStatusMessage('✅ UE instance is ready!');
      return true;
    }
    
    showStatusMessage(`⏳ Waiting for UE instance... (${attempt + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  showStatusMessage('⚠️ UE instance may not be fully ready, attempting connection anyway.');
  return false;
}
const lectureTranscriptContainer = document.querySelector('.lecture-transcript-container');
const lectureTranscript = document.getElementById('lecture-transcript');
const lectureButton = document.getElementById('lecture-button');
const topicInput = document.getElementById('topic-input');
lectureButton.onclick = async () => {
  try {
    lectureButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      lectureButton.disabled = false;
      return;
    }

    // Get the current session
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) {
      alert('No active session found. Please connect first.');
      lectureButton.disabled = false;
      return;
    }

    const topic = topicInput.value.trim();
    if (!topic) {
      alert('Please enter a topic.');
      lectureButton.disabled = false;
      return;
    }

    addLectureMessage(`You asked for: ${topic}`, 'user');

    const response = await fetch(`${localBackendUrl}/api/lecture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        topic: topic,
        session_id: sessionData.session_id
       })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate lesson!');
    }

    const data = await response.json();

    showStatusMessage('✅ Lesson generated successully!');

    const lesson_script = data.script;
    const chunked_script = chunkScript(lesson_script);
    const grouped_script = groupSentences(chunked_script, 2);

    setTimeout(() => {
      streamScriptChunks(grouped_script);
    }, 4000);

    lectureButton.disabled = false;
  } catch (error) {
    alert(`Lesson generation failed! Lecture Error: ${error.message}`);
    lectureButton.disabled = false;
  }
};
function addLectureMessage(messageText, sender = 'ai') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `lecture-message ${sender}`;
  msgDiv.textContent = messageText;

  lectureTranscript.appendChild(msgDiv);

  if (autoScrollLecture) {
    lectureTranscriptContainer.scrollTop = lectureTranscriptContainer.scrollHeight;
  }
}
function chunkScript(script) {
  // Split on periods, exclamation marks, and question marks followed by a space or end of line
  return script.match(/[^.!?]+[.!?]+(\s|$)/g) || [script];
}
function groupSentences(sentences, groupSize) {
  /**
   * Groups sentences into larger chunks to reduce TTS latency.
   */
  const groupedChunks = [];
  let buffer = [];

  for (let i = 0; i < sentences.length; i++) {
    buffer.push(sentences[i]);

    if (buffer.length >= groupSize) {
      groupedChunks.push(buffer.join(" "));
      buffer = [];
    }
  }

  // Add any remaining sentences in the buffer
  if (buffer.length > 0) {
    groupedChunks.push(buffer.join(" "));
  }

  return groupedChunks;
}
async function streamScriptChunks(sentences) {
  for (const sentence of sentences) {
    addLectureMessage(sentence.trim(), 'ai');
    
    // Calculate delay: 50ms per character (adjustable)
    const delay = sentence.length * 60 + 1000;
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
lectureTranscriptContainer.addEventListener('scroll', () => {
  const threshold = 50; // px from bottom to reactivate auto-scroll
  const isAtBottom = lectureTranscriptContainer.scrollTop + lectureTranscriptContainer.clientHeight >= lectureTranscriptContainer.scrollHeight - threshold;
  
  autoScrollLecture = isAtBottom;
});

//The following section of functions will serve to record an user's voice input, send it to backend through API calls in main.py to process, and get our GPT-4 model's answer back from backend and create a stream talk that can be seen and listend on our frontend Real-Time interaction.
const voiceButton = document.getElementById('voice-input-btn');
voiceButton.onclick = async () => {
  try {
      voiceButton.disabled = true;

      const token = sessionStorage.getItem('accessToken');
      if (!token) {
        alert('No access token found. Please log in.');
        voiceButton.disabled = false;
        return;
      }

      // Get the current session
      const sessionData = getSessionData();
      if (!sessionData || !sessionData.session_id) {
        alert('No active session found. Please connect first.');
        voiceButton.disabled = false;
        return;
      }

      const userQuestion = await initializeVoiceRecognition();
      
      addChatMessage(userQuestion, 'user');
      
      const backendResponse = await fetch(`${localBackendUrl}/api/answer`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({ 
            question: userQuestion,
            session_id: sessionData.session_id 
          })
      }).catch(error => {
        throw new Error(`Network error: ${error.message}`);
      });
      
      if (!backendResponse.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      
      const data = await backendResponse.json();

      addChatMessage(data.text, 'ai');
      showStatusMessage('✅ voice input successful!');
      
      voiceButton.disabled = false;
  } catch (error) {
      voiceButton.disabled = false;
      alert(`Processing error: ${error.message}`, true);
  }
};
document.getElementById('text-input').addEventListener('input', function() {
  this.style.height = 'auto'; // Reset the height
  this.style.height = (this.scrollHeight) + 'px'; // Set the height to the scroll height
});
const sendButton = document.getElementById('send-button');
sendButton.onclick = async () => {
  try {
    sendButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      sendButton.diabled = false;
      return;
    }

    // Get the current session
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) {
      alert('No active session found. Please connect first.');
      sendButton.disabled = false;
      return;
    }

    const question = document.getElementById('text-input').value.trim();
    if (!question) {
      alert('Please enter a question.', true);
      sendButton.diabled = false;
      return;
    }

    document.getElementById('text-input').value = '';

    addChatMessage(question, 'user');

    const response = await fetch(`${localBackendUrl}/api/answer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        question: question,
        session_id: sessionData.session_id 
      })
    }).catch(error => {
      throw new Error(`Network error: ${error.message}`);
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    addChatMessage(data.text, 'ai');
    showStatusMessage('✅ Text input successful!');

    sendButton.disabled = false;
  } catch (error) {
    document.getElementById('text-input').value = '';
    sendButton.disabled = false;
    alert(`Processing error: ${error.message}`, true);
  }
}
const msgHistory = document.getElementById('msgHistory');
async function loadChatHistory() {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) return;
    
    const response = await fetch(`${localBackendUrl}/api/chat-history?session_id=${sessionData.session_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    
    if (data.chat_history && Array.isArray(data.chat_history)) {
      // Clear existing messages
      msgHistory.innerHTML = '';
      
      // Add each message to the UI
      data.chat_history.forEach(entry => {
        if (entry.input) addChatMessage(entry.input, 'user');
        if (entry.response) addChatMessage(entry.response, 'ai');
      });
      
      // Scroll to bottom
      if (autoScrollChat) {
        msgHistory.scrollTop = msgHistory.scrollHeight;
      }
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
}
// Add a function to clear chat history
async function clearChatHistory() {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) return;
    
    const response = await fetch(`${localBackendUrl}/api/chat-history?session_id=${sessionData.session_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to clear chat history');
    }
    
    // Clear the UI
    msgHistory.innerHTML = '';
    showStatusMessage('✅ Chat history cleared successfully!');
  } catch (error) {
    console.error('Error clearing chat history:', error);
    showStatusMessage('❌ Failed to clear chat history');
  }
}
function addChatMessage(text, sender = 'ai') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;

  const avatarContainer = document.createElement('div');
  const avatar = document.createElement('div');

  avatarContainer.className = 'avatar-container';
  avatar.className = 'avatar';
  avatar.textContent = sender === 'ai' ? 'AI' : 'U';

  avatarContainer.appendChild(avatar);

  const chatBubble = document.createElement('div');
  chatBubble.className = 'chat-bubble';
  chatBubble.textContent = text;

  msgDiv.appendChild(avatarContainer);
  msgDiv.appendChild(chatBubble);

  msgHistory.appendChild(msgDiv);

  requestAnimationFrame(() => {
    if (autoScrollChat) {
      msgHistory.scrollTop = msgHistory.scrollHeight;
    }
  });
}
// Add a clear chat history button to the UI
function addClearChatButton() {
  const chatContainer = document.querySelector('.chat-container');
  if (!chatContainer) return;
  
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'chat-controls';
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'flex-end';
  buttonContainer.style.padding = '10px';
  
  const clearButton = document.createElement('button');
  clearButton.textContent = 'Clear Chat';
  clearButton.className = 'btn';
  clearButton.onclick = clearChatHistory;
  
  buttonContainer.appendChild(clearButton);
  
  // Insert before the message history
  chatContainer.insertBefore(buttonContainer, msgHistory);
}
msgHistory.addEventListener('scroll', () => {
  const threshold = 50; // px from bottom to reactivate auto-scroll
  const isAtBottom = msgHistory.scrollTop + msgHistory.clientHeight >= msgHistory.scrollHeight - threshold;
  
  autoScrollChat = isAtBottom;
});


//The following section of functions will serve disconnect button clicked. It will disconnect the live stream we created and cut off peer connection
const disconnectButton = document.getElementById('disconnect-button');
disconnectButton.onclick = async () => {
  try {
    // Disable the button to prevent multiple clicks
    disconnectButton.disabled = true;
    
    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      disconnectButton.disabled = false;
      return;
    }

    // Get the current session
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) {
      console.error('No active session found');
      disconnectButton.disabled = false;
      return;
    }

    // Send a DELETE request to the /api/disconnect endpoint
    const response = await fetch(`${localBackendUrl}/api/disconnect`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionData.session_id
      })
    });

    // Check if the request was successful
    if (!response.ok) {
      throw new Error('Failed to disconnect');
    }

    const data = await response.json();
    console.log('Disconnected successfully:', data);

    // Disconnect the WebRTC connection
    if (window.pixelStreamingApp) {
      await window.pixelStreamingApp.disconnect();
    }
    closed = true;

    // Clear the session data
    clearSessionData();

    // Update UI
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    showStatusMessage('✅ Disconnected from stream successfully!');
    
    // Clear the video element
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement.style.display = 'none';
    }
  } catch (error) {
    console.error('Error disconnecting:', error);
    alert('Disconnect failed: ' + error.message);
    disconnectButton.disabled = false;
  }
};

//The following section of functions will serve upload function. It will take required form of input files and send it to our backend through API calls in main.py to process. It will initialize our knowledge graph based on given input
const fileUploadTrigger = document.getElementById('file-upload-trigger');
const fileInput = document.getElementById('fileInput');
const uploadedFilesList = document.getElementById('uploaded-files-list');
fileUploadTrigger.addEventListener('click', () => {
  fileInput.click();
});
fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files);

  // Clear previous file list (optional: keep history if you want)
  uploadedFilesList.innerHTML = '';

  if (files.length === 0) {
    const noFileMsg = document.createElement('div');
    noFileMsg.textContent = 'No file selected.';
    uploadedFilesList.appendChild(noFileMsg);
    return;
  }

  // Display selected files in the new container
  files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'uploaded-file-item';

    const fileIcon = document.createElement('div');
    fileIcon.className = 'uploaded-file-icon';
    fileIcon.textContent = '📄'; // You can add file-type icons here

    const fileName = document.createElement('div');
    fileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;

    fileItem.appendChild(fileIcon);
    fileItem.appendChild(fileName);

    uploadedFilesList.appendChild(fileItem);
  });

  await upload();
});
async function upload(){
  const token = sessionStorage.getItem('accessToken');
  if (!token) {
    alert('No access token found. Please log in.');
    return;
  }

  // Get the current session
  const sessionData = getSessionData();
  if (!sessionData || !sessionData.session_id) {
    alert('No active session found. Please connect first.');
    return;
  }

  const fileInput = document.getElementById('fileInput');
  const files = Array.from(fileInput.files);
  
  if (files.length === 0) {
      alert('Please select files first!');
      return;
  }

  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  
  // Add the session_id to the form data
  formData.append('session_id', sessionData.session_id);

  try {
      showStatusMessage('Uploading files...');
      const response = await fetch(`${localBackendUrl}/api/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed');
      
      await checkSystemStatus();

      showStatusMessage('✅ Upload successful!');
      
  } catch (error) {
      alert(`Upload failed! ${error.message}`)
  }
};
async function checkSystemStatus() {
  try {
      const token = sessionStorage.getItem('accessToken');
      if (!token) return;
      
      const sessionData = getSessionData();
      if (!sessionData || !sessionData.session_id) return;
      
      const response = await fetch(`${localBackendUrl}/api/user-sessions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      const session = data.sessions.find(s => s.session_id === sessionData.session_id);
      
      if (session && session.has_knowledge_db) {
          showStatusMessage('System ready with your content');
      }
  } catch (error) {
      console.error('Status check failed:', error);
  }
}
  
window.addEventListener('beforeunload', async (e) => {
  // Check if we have an active session
  const sessionData = getSessionData();
  if (!closed && sessionData && sessionData.session_id) {
    try {
      const token = sessionStorage.getItem('accessToken');
      if (token) {
        // Create a "keepalive" fetch to ensure it completes even as the page is unloading
        navigator.sendBeacon(
          `${localBackendUrl}/api/disconnect`,
          JSON.stringify({
            session_id: sessionData.session_id
          })
        );
      }
      
      if (window.pixelStreamingApp) {
        await window.pixelStreamingApp.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting on unload:', error);
    }
  }
});
