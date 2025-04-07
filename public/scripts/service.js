import { initializeVoiceRecognition } from "./voice-ui.js";
import { loadNavbar } from "./navbar.js";
import { loadFooter } from "./footer.js";

// Initialize global variables and config
let ENV;
let localBackendUrl;
let closed = false;
let autoScrollChat = true;
let autoScrollLecture = true;
let activeSession = null;
window.pixelStreamingApp = null;

// Elements will be initialized after DOM is loaded
let videoElement;
let connectButton;
let disconnectButton;
let msgHistory;
let statusMessageBox;
let lectureTranscriptContainer;
let lectureTranscript;
let lectureButton;
let topicInput;
let fileUploadTrigger;
let fileInput;
let uploadedFilesList;
let sendButton;
let voiceButton;

// Initialize the application after DOM content is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("DOM content loaded, initializing application...");
    
    // Load configuration
    ENV = await (await fetch("/api.json")).json();
    const serverHostName = ENV.SERVER_HOST_NAME;
    const serverFrontendPort = ENV.SERVER_FRONTEND_PORT;
    const serverBackendPort = ENV.SERVER_BACKEND_PORT;
    const serverUePort = ENV.SERVER_UE_PORT;
    const serverFrontendUrl = `http://${serverHostName}:${serverFrontendPort}`;
    const serverBackendUrl = `http://${serverHostName}:${serverBackendPort}`;
    const serverUeUrl = `ws://${serverHostName}:${serverUePort}`;
    const localHostName = ENV.LOCAL_HOST_NAME;
    const localFrontendPort = ENV.LOCAL_FRONTEND_PORT;
    const localBackendPort = ENV.LOCAL_BACKEND_PORT;
    const localUePort = ENV.LOCAL_UE_PORT;
    const localFrontendUrl = `http://${localHostName}:${localFrontendPort}`;
    localBackendUrl = `http://${localHostName}:${localBackendPort}`;
    const localUeUrl = `ws://${localHostName}:${localUePort}`;
    
    console.log("Configuration loaded");
    
    // Load navbar and footer
    await Promise.all([
      loadNavbar(),
      loadFooter()
    ]);
    console.log("Navbar and footer loaded");
    
    // Initialize UI elements
    initializeUIElements();
    
    // Add event listeners
    addEventListeners();
    
    // Add clear chat button
    addClearChatButton();
    
    // Check for existing session
    await checkExistingSession();
    
    console.log("Application initialized successfully");
  } catch (error) {
    console.error("Error initializing application:", error);
    alert("Failed to initialize application. Please refresh the page and try again.");
  }
});

// Initialize UI elements
function initializeUIElements() {
  videoElement = document.getElementById('pixelStreamVideo');
  connectButton = document.getElementById('connect-button');
  disconnectButton = document.getElementById('disconnect-button');
  msgHistory = document.getElementById('msgHistory');
  statusMessageBox = document.getElementById('status-message-box');
  lectureTranscriptContainer = document.querySelector('.lecture-transcript-container');
  lectureTranscript = document.getElementById('lecture-transcript');
  lectureButton = document.getElementById('lecture-button');
  topicInput = document.getElementById('topic-input');
  fileUploadTrigger = document.getElementById('file-upload-trigger');
  fileInput = document.getElementById('fileInput');
  uploadedFilesList = document.getElementById('uploaded-files-list');
  sendButton = document.getElementById('send-button');
  voiceButton = document.getElementById('voice-input-btn');
  
  // Initialize text input auto-resize
  const textInput = document.getElementById('text-input');
  if (textInput) {
    textInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  }
  
  // Initialize auto-scroll listeners
  if (msgHistory) {
    msgHistory.addEventListener('scroll', () => {
      const threshold = 50;
      const isAtBottom = msgHistory.scrollTop + msgHistory.clientHeight >= msgHistory.scrollHeight - threshold;
      autoScrollChat = isAtBottom;
    });
  }
  
  if (lectureTranscriptContainer) {
    lectureTranscriptContainer.addEventListener('scroll', () => {
      const threshold = 50;
      const isAtBottom = lectureTranscriptContainer.scrollTop + lectureTranscriptContainer.clientHeight >= lectureTranscriptContainer.scrollHeight - threshold;
      autoScrollLecture = isAtBottom;
    });
  }
}

// Add all event listeners
function addEventListeners() {
  // Connect button
  if (connectButton) {
    connectButton.addEventListener('click', handleConnect);
  }
  
  // Disconnect button
  if (disconnectButton) {
    disconnectButton.addEventListener('click', handleDisconnect);
  }
  
  // Lecture button
  if (lectureButton) {
    lectureButton.addEventListener('click', handleLecture);
  }
  
  // Voice input button
  if (voiceButton) {
    voiceButton.addEventListener('click', handleVoiceInput);
  }
  
  // Send button
  if (sendButton) {
    sendButton.addEventListener('click', handleSendMessage);
  }
  
  // File upload
  if (fileUploadTrigger && fileInput) {
    fileUploadTrigger.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', handleFileChange);
  }
  
  // Replace beforeunload handler
  window.removeEventListener('beforeunload', window.beforeUnloadHandler);
  window.beforeUnloadHandler = handleBeforeUnload;
  window.addEventListener('beforeunload', window.beforeUnloadHandler);
}

// Session management functions
function saveSessionData(sessionData) {
  if (!sessionData) return;
  sessionStorage.setItem('aiProfessorSession', JSON.stringify(sessionData));
  console.log("Session data saved to storage:", sessionData);
  activeSession = sessionData;
}

function getSessionData() {
  const sessionData = sessionStorage.getItem('aiProfessorSession');
  if (sessionData) {
    try {
      activeSession = JSON.parse(sessionData);
      return activeSession;
    } catch (error) {
      console.error('Error parsing session data:', error);
    }
  }
  return null;
}

function clearSessionData() {
  sessionStorage.removeItem('aiProfessorSession');
  activeSession = null;
}

// UI Helper functions
function showStatusMessage(message, type = 'info') {
  if (!statusMessageBox) return;
  
  const msg = document.createElement('div');
  msg.className = `status-message ${type}`;
  msg.textContent = message;

  statusMessageBox.prepend(msg);

  setTimeout(() => {
    if (msg && msg.parentNode) {
      msg.remove();
    }
  }, 5000);
}

function updateUIForActiveSession() {
  if (activeSession) {
    if (connectButton) connectButton.disabled = false;
    if (disconnectButton) disconnectButton.disabled = true;
    showStatusMessage('💡 You have an existing session. Click Connect to resume.');
  } else {
    if (connectButton) connectButton.disabled = false;
    if (disconnectButton) disconnectButton.disabled = true;
  }
}

// Event Handlers
async function handleConnect() {
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
}

async function handleDisconnect() {
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

    // Only disconnect WebRTC connection - don't terminate or pause anything on the server
    if (window.pixelStreamingApp) {
      try {
        await window.pixelStreamingApp.disconnect();
        console.log('WebRTC disconnected successfully');
      } catch (pixelError) {
        console.warn('Error disconnecting WebRTC:', pixelError);
      }
    }
    closed = true;

    // Mark the WebRTC connection as disconnected but keep session data
    if (sessionData) {
      sessionData.webrtc_connected = false;
      saveSessionData(sessionData);
    }

    // Update UI
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    showStatusMessage('✅ Disconnected from WebRTC. Session data preserved!');
    
    // Clear the video element
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement.style.display = 'none';
    }
  } catch (error) {
    console.error('Error in disconnect process:', error);
    alert('Disconnect process encountered an error: ' + error.message);
    disconnectButton.disabled = false;
  }
}

async function handleLecture() {
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

    showStatusMessage('✅ Lesson generated successfully!');

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
}

async function handleVoiceInput() {
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
      const errorText = await backendResponse.text();
      throw new Error(`API Error ${backendResponse.status}: ${errorText}`);
    }
    
    const data = await backendResponse.json();

    addChatMessage(data.text, 'ai');
    showStatusMessage('✅ Voice input successful!');
    
    voiceButton.disabled = false;
  } catch (error) {
    voiceButton.disabled = false;
    alert(`Processing error: ${error.message}`, true);
  }
}

async function handleSendMessage() {
  try {
    sendButton.disabled = true;

    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      sendButton.disabled = false;
      return;
    }

    // Get the current session
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) {
      alert('No active session found. Please connect first.');
      sendButton.disabled = false;
      return;
    }

    const textInput = document.getElementById('text-input');
    const question = textInput.value.trim();
    if (!question) {
      alert('Please enter a question.');
      sendButton.disabled = false;
      return;
    }

    textInput.value = '';

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
    const textInput = document.getElementById('text-input');
    if (textInput) textInput.value = '';
    sendButton.disabled = false;
    alert(`Processing error: ${error.message}`);
  }
}

async function handleFileChange() {
  const files = Array.from(fileInput.files);

  // Clear previous file list
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
    fileIcon.textContent = '📄';

    const fileName = document.createElement('div');
    fileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;

    fileItem.appendChild(fileIcon);
    fileItem.appendChild(fileName);

    uploadedFilesList.appendChild(fileItem);
  });

  await upload();
}

function handleBeforeUnload(e) {
  // Only disconnect WebRTC if needed, but keep the session alive on server
  try {
    if (window.pixelStreamingApp) {
      window.pixelStreamingApp.disconnect();
    }
  } catch (error) {
    console.error('Error disconnecting WebRTC on unload:', error);
  }
}

// Chat and lecture functions
function addChatMessage(text, sender = 'ai') {
  if (!msgHistory) return;
  
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
    if (autoScrollChat && msgHistory) {
      msgHistory.scrollTop = msgHistory.scrollHeight;
    }
  });
}

function addLectureMessage(messageText, sender = 'ai') {
  if (!lectureTranscript) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `lecture-message ${sender}`;
  msgDiv.textContent = messageText;

  lectureTranscript.appendChild(msgDiv);

  if (autoScrollLecture && lectureTranscriptContainer) {
    lectureTranscriptContainer.scrollTop = lectureTranscriptContainer.scrollHeight;
  }
}

function chunkScript(script) {
  // Split on periods, exclamation marks, and question marks followed by a space or end of line
  return script.match(/[^.!?]+[.!?]+(\s|$)/g) || [script];
}

function groupSentences(sentences, groupSize) {
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
    
    // Calculate delay: 60ms per character plus base delay
    const delay = sentence.length * 60 + 1000;
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Add a clear chat history button
function addClearChatButton() {
  const chatContainer = document.querySelector('.chat-container');
  if (!chatContainer || !msgHistory) return;
  
  // Check if the button already exists
  if (document.querySelector('.chat-controls')) return;
  
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

// Fetch and display chat history
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
    
    if (data.chat_history && Array.isArray(data.chat_history) && msgHistory) {
      // Clear existing messages
      msgHistory.innerHTML = '';
      
      // Add each message to the UI
      data.chat_history.forEach(entry => {
        if (entry.input) addChatMessage(entry.input, 'user');
        if (entry.response) addChatMessage(entry.response, 'ai');
      });
      
      // Scroll to bottom
      if (autoScrollChat && msgHistory) {
        msgHistory.scrollTop = msgHistory.scrollHeight;
      }
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
}

// Clear chat history
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
    if (msgHistory) {
      msgHistory.innerHTML = '';
    }
    showStatusMessage('✅ Chat history cleared successfully!');
  } catch (error) {
    console.error('Error clearing chat history:', error);
    showStatusMessage('❌ Failed to clear chat history');
  }
}

// Upload files to the backend
async function upload() {
  try {
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

    const files = Array.from(fileInput.files);
    
    if (files.length === 0) {
      alert('Please select files first!');
      return;
    }

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    // Add the session_id to the form data
    formData.append('session_id', sessionData.session_id);

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
    alert(`Upload failed! ${error.message}`);
  }
}

// Check system status
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

// Check for existing session when page loads
async function checkExistingSession() {
  try {
    const sessionData = getSessionData();
    if (sessionData && sessionData.session_id) {
      const token = sessionStorage.getItem('accessToken');
      if (!token) return;
      
      // Check if the session is still valid on the server
      const response = await fetch(`${localBackendUrl}/api/session-status?session_id=${sessionData.session_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        // Session exists - update UI to reflect this
        updateUIForActiveSession();
        showStatusMessage('💡 You have an existing session. Click Connect to resume.');
      }
    }
  } catch (error) {
    console.error('Error checking session on page load:', error);
  }
}

// Check UE instance status
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

// Wait for UE instance to be ready
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

// Initialize PixelStreaming for a session
async function initializePixelStreamingForSession(sessionData) {
  const epic = window["epicgames-frontend"];
  if (!epic) {
    throw new Error('epicgames-frontend is not loaded. Make sure player.js is included.');
  }

  console.log('Initializing PixelStreaming for session:', sessionData);
  
  // Use the specific signaling server URL for this session
  const signalingUrl = `ws://${ENV.LOCAL_HOST_NAME}:${sessionData.websocket_port}`;
  console.log('Using signaling server URL:', signalingUrl);
  
  // Enhanced WebRTC configuration
  const webRtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { 
        urls: `turn:${ENV.LOCAL_HOST_NAME}:19303`,
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

// Monitor ICE connection state
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

// Attach video stream to the video element
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
    .then(() => console.log('Video playback started successfully'))
    .catch(err => console.error('Error starting video playback:', err));
}