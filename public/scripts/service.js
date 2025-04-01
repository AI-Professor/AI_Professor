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

let closed = false;
let autoScrollChat = true;
let autoScrollLecture = true;
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

    // Initialize PixelStreaming
    initializePixelStreaming();
    
    // IMPORTANT: Add event listeners for connection events BEFORE connecting
    // This ensures we handle the video setup at the right time
    if (window.pixelStreamingApp) {
      // Add a dedicated event listener for when the stream is actually ready
      window.pixelStreamingApp.addEventListener('videoInitialized', () => {
        console.log('Video initialized event received - stream should be ready');
        setTimeout(attachVideoStream, 1000); // Wait 1 second after video is initialized
      });
      
      window.pixelStreamingApp.addEventListener('webRtcConnected', () => {
        console.log('WebRTC connected - waiting for video stream...');
        // Wait 3 seconds after connection to check for the stream
        setTimeout(attachVideoStream, 3000);
      });
    }

    const connectionTimeout = 20000; // 20 seconds
    const connectionPromise = window.pixelStreamingApp.connect();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), connectionTimeout);
    });

    await Promise.race([connectionPromise, timeoutPromise]);
    
    // Add ICE connection state monitoring - for debugging only, not for attaching video
    monitorIceConnectionState();

    statusDiv.innerText = 'Connection established!';
    setTimeout(() => {
      if (document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
    }, 2000);

    // Enable the button again
    connectButton.disabled = false;
    showStatusMessage('✅ Connecting to stream successfully!');
    
    // Set a final fallback timer for 5 seconds after connection attempt
    setTimeout(attachVideoStream, 5000);
    
  } catch (error) {
    console.error('Error connecting:', error);
    alert('Connecting to stream failed!');
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
  const signalingUrl = `ws://34.125.65.245:8085`;
  console.log('Using signaling server URL:', signalingUrl);
  
  // Enhanced WebRTC configuration that matches the successful connection
  const webRtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { 
        urls: 'turn:34.125.65.245:19303',
        username: 'pixelstreaming',  // Add credentials if required
        credential: 'pixelstreaming'
      }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'balanced',  // Changed from max-bundle to balanced
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 0,    // Match the successful configuration
    offerExtmapAllowMixed: true
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

  // ===== EVENT LISTENERS =====
  // Connecting events
  window.pixelStreamingApp.addEventListener('webRtcConnecting', () => {
    console.log('WebRTC connecting...');
  });

  window.pixelStreamingApp.addEventListener('webRtcConnected', () => {
    console.log('WebRTC connected successfully!');
    // Don't try to access the video stream here - it may not be ready yet
  });
  
  // Add a custom event for video initialization that we can listen for
  window.pixelStreamingApp.addEventListener('streamingStarted', () => {
    console.log('Streaming started!');
    window.pixelStreamingApp.dispatchEvent(new Event('videoInitialized'));
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

  // ===== STYLE AND UI =====
  // These lines may not be necessary for your app since you have your own UI
  // Comment them out if they cause issues
  const style = new epic.PixelStreamingApplicationStyle();
  style.applyStyleSheet();

  const app = new epic.Application({
    stream: window.pixelStreamingApp,
    onColorModeChanged: (mode) => style.setColorMode(mode)
  });

  // Decide if you want to append this to your document or not
  // document.body.appendChild(app.rootElement);
  
  // This event helps us know when video tracks are added
  window.pixelStreamingApp.addEventListener('trackAdded', (event) => {
    console.log('Track added:', event.detail.kind);
    if (event.detail.kind === 'video') {
      // Dispatch our custom event when video track is added
      window.pixelStreamingApp.dispatchEvent(new Event('videoInitialized'));
    }
  });
  
  return window.pixelStreamingApp;
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ topic: topic })
    });

    if (!response.ok) throw new Error('Failed to generate lesson!');

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
        return;
      }

      const userQuestion = await initializeVoiceRecognition();
      
      addChatMessage(userQuestion, 'user');
      
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
      return;
    }

    const question = document.getElementById('text-input').value.trim();
    if (!question) {
      alert('Please enter a question.', true);
      return;
    }

    document.getElementById('text-input').value = '';

    addChatMessage(question, 'user');

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
  
  // Replace $...$ with \(...\) for inline math
  text = text.replace(/\$([^\$]+)\$/g, '\\($1\\)');
  // Replace $$...$$ with \[...\] for display math
  text = text.replace(/\$\$([^\$]+)\$\$/g, '\\[$1\\]');
  
  chatBubble.textContent = text;

  msgDiv.appendChild(avatarContainer);
  msgDiv.appendChild(chatBubble);

  msgHistory.appendChild(msgDiv);

  // Render LaTeX in the new message
  renderMathInElement(chatBubble, {
    delimiters: [
      {left: "\\(", right: "\\)", display: false},
      {left: "\\[", right: "\\]", display: true}
    ],
    throwOnError: false
  });

  requestAnimationFrame(() => {
    if (autoScrollChat) {
      msgHistory.scrollTop = msgHistory.scrollHeight;
    }
  });
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
    showStatusMessage('✅ Disconnecting to stream successully!');
  } catch (error) {
    console.error('Error connecting:', error);
    alert('Disconnect failed!');
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

  const fileInput = document.getElementById('fileInput');
  const files = Array.from(fileInput.files);
  
  if (files.length === 0) {
      alert('Please select files first!');
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

      showStatusMessage('✅ Upload successul!');
      
  } catch (error) {
      alert(`Upload failed! ${error.message}`)
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
