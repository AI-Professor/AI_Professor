import { initializeVoiceRecognition } from "./voice-ui.js";
import { loadNavbar } from "./navbar.js";
import { loadFooter } from "./footer.js";
import { setupTokenRefresh } from './token-utils.js';
import { saveLectureTranscript, getLectureHistory } from './lecture-utils.js';

// Initialize global variables and config
let ENV;
let localBackendUrl;
let autoScrollChat = true;
let autoScrollLecture = true;
let activeSession = null;
window.pixelStreamingApp = null;

// Elements will be initialized after DOM is loaded
let videoElement;
let connectButton;
let msgHistory;
let statusMessageBox;
let lectureTranscriptContainer;
let lectureTranscript;
let lectureButton;
let topicInput;
let fileInput;
let sendButton;
let voiceButton;
let fileUploadButton;
let existingId;

// Initialize the application after DOM content is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("DOM content loaded, initializing application...");
    
    // Load configuration
    ENV = await (await fetch("/api.json")).json();
    const externalIp = ENV.EXTERNAL_IP
    const backendPort = ENV.BACKEND_PORT
    localBackendUrl = `http://${externalIp}:${backendPort}`
    
    console.log("Configuration loaded");
    
    // Load navbar and footer
    await Promise.all([
      loadNavbar(),
      loadFooter()
    ]);
    console.log("Navbar and footer loaded");

    const refreshInterval = setupTokenRefresh(localBackendUrl);

    window.tokenRefreshInterval = refreshInterval;
    
    // Initialize UI elements
    initializeUIElements();
    
    // Add event listeners
    addEventListeners();
    
    // Check for existing session
    await checkExistingSession();

    
    const sessionMonitorInterval = startSessionMonitoring();
    
    // Store the interval ID to clear it if needed
    window.sessionMonitorInterval = sessionMonitorInterval;
    
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
  msgHistory = document.getElementById('msgHistory');
  statusMessageBox = document.getElementById('status-message-box');
  lectureTranscriptContainer = document.querySelector('.lecture-transcript-container');
  lectureTranscript = document.getElementById('lecture-transcript');
  lectureButton = document.getElementById('lecture-button');
  topicInput = document.getElementById('topic-input');
  fileInput = document.getElementById('fileInput');
  sendButton = document.getElementById('send-button');
  voiceButton = document.getElementById('voice-input-btn');
  fileUploadButton = document.getElementById('upload-files-btn')
  
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

function addEventListeners() {
  // Connect button
  if (connectButton) {
    connectButton.removeEventListener('click', handleConnect); 
    connectButton.addEventListener('click', modifiedHandleConnect);
  }
  
  if (lectureButton) {
    lectureButton.addEventListener('click', handleLecture);
  }
  
  if (voiceButton) {
    voiceButton.addEventListener('click', handleVoiceInput);
  }
  
  if (sendButton) {
    sendButton.addEventListener('click', handleSendMessage);
  }
  
  if (fileUploadButton && fileInput) {
    fileUploadButton.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent default link behavior
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
    existingId = showLastingStatusMessage('💡 You have an existing session. Click Connect to resume.', 'info');
  } else {
    if (connectButton) connectButton.disabled = false;
  }
}

function clearSessionUI() {
  // Clear chat messages
  if (msgHistory) {
    msgHistory.innerHTML = '';
  }
  
  // Clear lecture transcript
  if (lectureTranscript) {
    lectureTranscript.innerHTML = '';
  }
  
  // Clear text input if any
  const textInput = document.getElementById('text-input');
  if (textInput) {
    textInput.value = '';
    // Reset the height if using auto-resize
    textInput.style.height = 'auto';
  }
  
  // Clear topic input if any
  if (topicInput) {
    topicInput.value = '';
  }
  
  // Reset file input if any
  if (fileInput) {
    fileInput.value = null;
  }
  
  console.log("Cleared all UI elements related to the session");
}

function showLastingStatusMessage(message, type = 'info', id = null) {
  if (!statusMessageBox) return null;
  
  // Generate a unique ID if none provided
  const messageId = id || `status-${Date.now()}`;
  
  // Create message element
  const msg = document.createElement('div');
  msg.className = `status-message ${type} lasting`;
  msg.id = messageId;
  msg.textContent = message;
  
  // Add a loading spinner for ongoing processes
  const spinner = document.createElement('div');
  spinner.className = 'status-spinner';
  msg.appendChild(spinner);
  
  statusMessageBox.prepend(msg);
  
  return messageId;
}

function removeLastingStatusMessage(messageId, finalMessage = null, type = 'success') {
  const msg = document.getElementById(messageId);
  if (!msg) return;
  
  if (finalMessage) {
    // Convert to a standard message with a final status
    msg.textContent = finalMessage;
    msg.className = `status-message ${type}`;
    
    // Remove the lasting class and spinner
    msg.classList.remove('lasting');
    const spinner = msg.querySelector('.status-spinner');
    if (spinner) spinner.remove();
    
    // Set a timeout to remove this message after a few seconds
    setTimeout(() => {
      if (msg && msg.parentNode) {
        msg.remove();
      }
    }, 5000);
  } else {
    // Simply remove the message
    msg.remove();
  }
}

// Event Handlers
async function handleConnect() {
  try {
    // Disable the button to prevent multiple clicks
    connectButton.disabled = true;

    // Remove expired session message if present
    const expiredMsg = document.getElementById('expired-session-message');
    if (expiredMsg) expiredMsg.remove();
    
    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      alert('No access token found. Please log in.');
      connectButton.disabled = false;
      return;
    }
    
    // Clear UI elements before starting a new connection
    clearSessionUI();
    
    // Create the status div and append it to the video display instead of body
    const statusDiv = document.createElement('div');
    statusDiv.id = 'connection-status';
    statusDiv.innerText = 'Establishing connection...';
    
    // Find the video display element and append status to it
    const videoDisplay = document.querySelector('.video-display');
    if (videoDisplay) {
      videoDisplay.appendChild(statusDiv);
    }

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
          if (statusDiv && statusDiv.parentNode) {
            statusDiv.parentNode.removeChild(statusDiv);
          }
        }, 2000);
        
        connectButton.disabled = true;
        removeLastingStatusMessage(existingId, '✅ Connected to existing session successfully!', 'success');

        // Load chat history for the existing session
        await loadChatHistory();
        await loadLectureHistory();
        await loadLessonTopics();
        await loadUserFileHistory();
      } catch (error) {
        console.error('Error connecting to existing session:', error);
        removeLastingStatusMessage(existingId, `❌ Reconnect to existing session failed! ${error.message}`, 'error');
        statusDiv.innerText = 'Retrying connection...';
        
        // Add a longer delay and retry once
        await new Promise(resolve => setTimeout(resolve, 3000));
        await initializePixelStreamingForSession(existingSession);
        
        statusDiv.innerText = 'Connection established!';
        setTimeout(() => {
          if (statusDiv && statusDiv.parentNode) {
            statusDiv.parentNode.removeChild(statusDiv);
          }
        }, 2000);
        
        connectButton.disabled = true;
        showStatusMessage('✅ Connected to existing session successfully!');
        
        // Load chat history for the existing session
        await loadChatHistory();
        await loadLectureHistory();
        await loadLessonTopics();
        await loadUserFileHistory();
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
      if (statusDiv && statusDiv.parentNode) {
        statusDiv.parentNode.removeChild(statusDiv);
      }
    }, 2000);

    connectButton.disabled = true;
    showStatusMessage('✅ New connection established successfully!');
    
    // We already cleared the chat history, but let's fetch any server-side history
    await loadChatHistory();
    await loadLectureHistory();
    await loadLessonTopics();
    await loadUserFileHistory();
  } catch (error) {
    console.error('Error connecting:', error);
    // Remove status div
    const statusDiv = document.getElementById('connection-status');
    if (statusDiv && statusDiv.parentNode) {
      statusDiv.parentNode.removeChild(statusDiv);
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
        showStatusMessage('✅ Connection established successfully after retry!');
        
        // Load chat history for the new session
        await loadChatHistory();
        await loadLectureHistory();
        await loadLessonTopics();
        await loadUserFileHistory();
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

    // Show a lasting status message for the lecture generation process
    const lectureStatusId = showLastingStatusMessage('Generating lecture... This process may take a minute or two.', 'info');

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

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 400 && data.message && data.message.includes("unrelated to the content")) {
        // Handle irrelevant topic error with a more user-friendly approach
        addLectureMessage(
          `I'm sorry, but the topic "${topic}" doesn't appear to be covered in the material you've uploaded. Please try a different topic that's relevant to your content.`, 
          'ai'
        );
        // Update status message
        removeLastingStatusMessage(lectureStatusId, '⚠️ Topic not found in your materials', 'error');
      } else {
        // Handle other errors
        throw new Error(data.error || data.message || 'Failed to generate lesson!');
      }
      lectureButton.disabled = false;
      return;
    }

    // Update status message to indicate lecture is ready
    removeLastingStatusMessage(lectureStatusId, '✅ Lecture generated successfully! Now playing...', 'success');

    const lesson_script = data.script;
    const chunked_script = chunkScript(lesson_script);
    const grouped_script = groupSentences(chunked_script, 2);

    // Save the complete lecture transcript to session storage
    saveLectureTranscript(lesson_script, sessionData.user_id, sessionData.session_id);
    
    // Also save it to the backend for persistence
    try {
      await fetch(`${localBackendUrl}/api/save-lecture-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionData.session_id,
          topic: topic,
          content: lesson_script
        })
      });
    } catch (saveError) {
      console.error('Error saving lecture history to backend:', saveError);
      // Continue anyway, we have it in session storage
    }

    setTimeout(() => {
      streamScriptChunks(grouped_script);
      setTimeout(() => loadLessonTopics(), 5000);
    }, 4000);

    lectureButton.disabled = false;
  } catch (error) {
    // If there was an error, show an error message
    const lectureStatusId = document.querySelector('.status-message.lasting')?.id;
    if (lectureStatusId) {
      removeLastingStatusMessage(lectureStatusId, `❌ Lecture generation failed! Error: ${error.message}`, 'error');
    } else {
      alert(`Lesson generation failed! Error: ${error.message}`);
    }
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

  if (files.length === 0) {
    const noFileMsg = document.createElement('div');
    noFileMsg.textContent = 'No file selected.';
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
  // Common abbreviations and titles that contain periods but aren't sentence endings
  const commonAbbreviations = [
    'Mr\\.', 'Mrs\\.', 'Ms\\.', 'Dr\\.', 'Prof\\.', 'Gov\\.', 'Sen\\.', 'Rep\\.', 
    'Lt\\.', 'Col\\.', 'Gen\\.', 'Sgt\\.', 'Capt\\.', 'Cmdr\\.', 'Admin\\.', 'Adm\\.', 
    'Rev\\.', 'Ph\\.D\\.', 'M\\.D\\.', 'B\\.A\\.', 'M\\.A\\.', 'B\\.S\\.', 'M\\.S\\.',
    'Jr\\.', 'Sr\\.', 'Inc\\.', 'Ltd\\.', 'Co\\.', 'Corp\\.', 'P\\.C\\.', 'LLC\\.', 'LLP\\.',
    'Assn\\.', 'Bros\\.', 'Dept\\.', 'Est\\.', 'Univ\\.', 'Intl\\.', 'Dist\\.', 'Mt\\.',
    'St\\.', 'Ave\\.', 'Blvd\\.', 'Rd\\.', 'Ln\\.', 'Dr\\.', 'Ctr\\.', 'Ct\\.',
    'e\\.g\\.', 'i\\.e\\.', 'etc\\.', 'vs\\.', 'v\\.', 'Jan\\.', 'Feb\\.', 'Mar\\.', 
    'Apr\\.', 'Jun\\.', 'Jul\\.', 'Aug\\.', 'Sep\\.', 'Sept\\.', 'Oct\\.', 'Nov\\.', 'Dec\\.',
    'a\\.m\\.', 'p\\.m\\.', 'U\\.S\\.', 'U\\.K\\.', 'U\\.N\\.', 'E\\.U\\.', 'fig\\.', 'ca\\.',
    'i\\.e\\.', 'e\\.g\\.', 'al\\.', 'seq\\.', 'no\\.'
  ];
  
  // Create a regex pattern for all abbreviations with word boundaries
  const abbreviationsPattern = `\\b(${commonAbbreviations.join('|')})\\s+`;
  
  // Replace abbreviations with a temporary marker
  const tempMarker = "###ABBR###";
  let processedText = script;
  
  // Find all abbreviations and replace their periods with a temporary marker
  const abbreviationRegex = new RegExp(abbreviationsPattern, 'g');
  processedText = processedText.replace(abbreviationRegex, (match) => {
    return match.replace('.', tempMarker);
  });
  
  // Find numerical markers (like 1. 2. 3.) and replace them
  const numericalMarkersRegex = /(\d+)\.\s+/g;
  processedText = processedText.replace(numericalMarkersRegex, (match, number) => {
    return `${number}${tempMarker} `;
  });
  
  // Now split on actual sentence boundaries: .!? followed by space or end of line
  const sentenceRegex = /[.!?]+(?=\s|$)/g;
  const sentences = [];
  let lastIndex = 0;
  
  let match;
  while ((match = sentenceRegex.exec(processedText)) !== null) {
    // Extract the sentence including the punctuation
    let sentence = processedText.substring(lastIndex, match.index + match[0].length);
    
    // Restore abbreviation periods
    sentence = sentence.replace(new RegExp(tempMarker, 'g'), '.');
    
    sentences.push(sentence);
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text as the last sentence if there is any
  if (lastIndex < processedText.length) {
    let finalSentence = processedText.substring(lastIndex);
    finalSentence = finalSentence.replace(new RegExp(tempMarker, 'g'), '.');
    sentences.push(finalSentence);
  }
  
  // Handle case where no sentences were found (return original script)
  if (sentences.length === 0) {
    return [script];
  }
  
  return sentences;
}

function groupSentences(sentences, groupSize) {
  const groupedChunks = [];
  let buffer = [];
  
  for (let i = 0; i < sentences.length; i++) {
    buffer.push(sentences[i]);
    
    // If buffer reaches groupSize or this is the last sentence, create a group
    if (buffer.length >= groupSize || i === sentences.length - 1) {
      // Trim any extra whitespace but preserve internal spaces
      const chunk = buffer.join(" ").trim();
      if (chunk) {
        groupedChunks.push(chunk);
      }
      buffer = [];
    }
  }
  
  return groupedChunks;
}

async function streamScriptChunks(sentences) {
  // Start a session alive interval during lecture
  const keepAliveInterval = setInterval(keepSessionAlive, 30000); // Every 30 seconds
  
  try {
    for (const sentence of sentences) {
      addLectureMessage(sentence.trim(), 'ai');
      
      // Calculate delay: 60ms per character plus base delay
      const delay = sentence.length * 60 + 1000;
      
      // Keep session alive at the start of streaming
      await keepSessionAlive();
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  } finally {
    // Clear the interval when done
    clearInterval(keepAliveInterval);
    
    // One final ping
    await keepSessionAlive();
  }
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

async function loadLectureHistory() {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) return;
    
    // First try to get lecture history from the backend
    try {
      const response = await fetch(`${localBackendUrl}/api/lecture-history?session_id=${sessionData.session_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.lecture_history && Array.isArray(data.lecture_history) && data.lecture_history.length > 0) {
          // Get the most recent lecture
          const latestLecture = data.lecture_history[0];
          
          // Display it in the lecture transcript
          if (lectureTranscript) {
            // Clear existing content first
            lectureTranscript.innerHTML = '';
            
            // Add a header showing this is a previous lecture
            const headerMsg = document.createElement('div');
            headerMsg.className = 'lecture-message system';
            headerMsg.textContent = `Previous lecture on "${latestLecture.topic}" (${new Date(latestLecture.timestamp).toLocaleString()}):`;
            lectureTranscript.appendChild(headerMsg);
            
            // Add the lecture content
            addLectureMessage(latestLecture.content, 'ai');
          }
          
          return; // Successfully loaded from backend
        }
      }
    } catch (error) {
      console.error('Error loading lecture history from backend:', error);
      // Fall back to session storage
    }
    
    // If backend failed or returned no data, try session storage
    const lectureHistory = getLectureHistory(sessionData.user_id, sessionData.session_id);
    
    if (lectureHistory && lectureHistory.length > 0 && lectureTranscript) {
      // Get the most recent lecture
      const latestLecture = lectureHistory[lectureHistory.length - 1];
      
      // Clear existing content first
      lectureTranscript.innerHTML = '';
      
      // Add a header showing this is a previous lecture
      const headerMsg = document.createElement('div');
      headerMsg.className = 'lecture-message system';
      headerMsg.textContent = `Previous lecture (${new Date(latestLecture.timestamp).toLocaleString()}):`;
      lectureTranscript.appendChild(headerMsg);
      
      // Add the lecture content
      addLectureMessage(latestLecture.content, 'ai');
    }
  } catch (error) {
    console.error('Error loading lecture history:', error);
  }
}


async function loadLessonTopics() {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) return;
    
    // Get the dropdown and quiz button elements
    const lessonSelect = document.getElementById('lesson-select');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const noLessonsMessage = document.getElementById('no-lessons-message');
    
    if (!lessonSelect || !startQuizBtn || !noLessonsMessage) return;
    
    // Clear existing options
    lessonSelect.innerHTML = '<option value="" disabled selected>Select a lesson</option>';
    
    // Fetch lesson topics from the backend
    const response = await fetch(`${localBackendUrl}/api/lesson-topics?session_id=${sessionData.session_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch lesson topics: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.topics && Array.isArray(data.topics) && data.topics.length > 0) {
      // Hide the no lessons message
      noLessonsMessage.style.display = 'none';
      lessonSelect.style.display = 'block';
      
      // Add options for each topic
      data.topics.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic.topic.toLowerCase().replace(/\s+/g, '_'); // Convert to snake_case for value
        option.textContent = topic.topic;
        option.dataset.id = topic.id; // Store the file ID as a data attribute
        lessonSelect.appendChild(option);
      });
      
      // Enable the dropdown
      lessonSelect.disabled = false;
      
      // Add event listener to the dropdown
      lessonSelect.addEventListener('change', function() {
        if (this.value) {
          // Enable the quiz button
          startQuizBtn.classList.remove('disabled');
          startQuizBtn.href = `/quiz.html?topic=${encodeURIComponent(this.value)}&session_id=${sessionData.session_id}`;
        } else {
          // Disable the quiz button
          startQuizBtn.classList.add('disabled');
          startQuizBtn.href = '#';
        }
      });
      
      // Initially disable the quiz button
      startQuizBtn.classList.add('disabled');
      startQuizBtn.href = '#';
    } else {
      // Show the no lessons message
      noLessonsMessage.style.display = 'block';
      lessonSelect.style.display = 'none';
      startQuizBtn.classList.add('disabled');
      startQuizBtn.href = '#';
    }
  } catch (error) {
    console.error('Error loading lesson topics:', error);
    
    // Show the no lessons message as a fallback
    const noLessonsMessage = document.getElementById('no-lessons-message');
    const lessonSelect = document.getElementById('lesson-select');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    
    if (noLessonsMessage && lessonSelect && startQuizBtn) {
      noLessonsMessage.style.display = 'block';
      noLessonsMessage.textContent = 'Error loading lessons. Please try again later.';
      lessonSelect.style.display = 'none';
      startQuizBtn.classList.add('disabled');
      startQuizBtn.href = '#';
    }
  }
}

async function loadUserFileHistory() {
  try {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) return;
    
    // Get DOM elements
    const fileSelect = document.getElementById('file-select');
    const uploadBtn = document.getElementById('upload-files-btn');
    const useFileBtn = document.getElementById('use-file-btn');
    const noFilesMessage = document.getElementById('no-files-message');
    
    if (!fileSelect || !uploadBtn || !useFileBtn || !noFilesMessage) return;
    
    // Clear existing options
    fileSelect.innerHTML = '<option value="" disabled selected>Select a file</option> <option value="upload_new">Upload New File</option>';
    
    // Fetch user's file history from the backend
    const response = await fetch(`${localBackendUrl}/api/user-file-history`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file history: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.files && Array.isArray(data.files) && data.files.length > 0) {
      // Hide the no files message
      noFilesMessage.style.display = 'none';
      fileSelect.style.display = 'block';
      
      // Add options for each file
      data.files.forEach(file => {
        const option = document.createElement('option');
        option.value = file.id;
        option.textContent = file.name;
        
        // Add file details as data attributes if available
        if (file.file) {
          option.dataset.fileName = file.file.name;
          option.dataset.fileSize = file.file.size;
          option.dataset.fileModified = file.file.last_modified;
        }
        
        fileSelect.appendChild(option);
      });
      
      // Enable the dropdown
      fileSelect.disabled = false;
      
      // Add event listener to the dropdown
      fileSelect.addEventListener('change', function() {
        if (this.value != 'upload_new') {
          // Show the "Use this file" button and hide the "Upload" button
          useFileBtn.classList.remove('hidden');
          uploadBtn.classList.add('hidden');
        } else {
          // Show the "Upload" button and hide the "Use this file" button
          useFileBtn.classList.add('hidden');
          uploadBtn.classList.remove('hidden');
        }
      });
      
      // Set up the "Use this file" button
      useFileBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const selectedFileId = fileSelect.value.toLowerCase();
        if (!selectedFileId) return;
        
        // Show loading state
        useFileBtn.textContent = 'Loading...';
        useFileBtn.style.backgroundColor = '#cccccc';
        useFileBtn.style.pointerEvents = 'none';
        
        // Call the API to load the knowledge graph
        try {
          const response = await fetch(`${localBackendUrl}/api/use-knowledge-graph`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              session_id: sessionData.session_id,
              knowledge_graph_id: selectedFileId
            })
          });
          
          if (!response.ok) {
            throw new Error(`Failed to load knowledge graph: ${response.status}`);
          }
          
          const result = await response.json();
          
          // Show success message
          showStatusMessage(`✅ ${result.message}`, 'success');
          
          // Reset button state
          useFileBtn.textContent = 'Use';
          useFileBtn.style.backgroundColor = '';
          useFileBtn.style.pointerEvents = '';
          
          // Also refresh lesson topics since we might have a new knowledge graph
          await loadLessonTopics();
          
        } catch (error) {
          console.error('Error using knowledge graph:', error);
          
          // Show error message
          showStatusMessage(`❌ Failed to load file: ${error.message}`, 'error');
          
          // Reset button state
          useFileBtn.textContent = 'Use';
          useFileBtn.style.backgroundColor = '';
          useFileBtn.style.pointerEvents = '';
        }
      });
      
      // Initially keep the upload button visible and use file button hidden
      useFileBtn.classList.add('hidden');
      uploadBtn.classList.remove('hidden');
      
    } else {
      // Show the no files message
      noFilesMessage.style.display = 'block';
      fileSelect.style.display = 'none';
      useFileBtn.classList.add('hidden');
      uploadBtn.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading file history:', error);
    
    // Show the no files message as a fallback
    const noFilesMessage = document.getElementById('no-files-message');
    const fileSelect = document.getElementById('file-select');
    const useFileBtn = document.getElementById('use-file-btn');
    const uploadBtn = document.getElementById('upload-files-btn');
    
    if (noFilesMessage && fileSelect && useFileBtn && uploadBtn) {
      noFilesMessage.style.display = 'block';
      noFilesMessage.textContent = 'Error loading files. Please try again later.';
      fileSelect.style.display = 'none';
      useFileBtn.classList.add('hidden');
      uploadBtn.classList.remove('hidden');
    }
  }
}

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

    // Show a lasting status message for the upload process
    const uploadStatusId = showLastingStatusMessage('Uploading files... This may take a while depending on file size.', 'info');

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

    // Remove the lasting message and show a success message
    removeLastingStatusMessage(uploadStatusId, '✅ Upload successful! Your files are now processed and ready for use.', 'success');

    await loadUserFileHistory();
      
  } catch (error) {
    // If there was an error, show an error message
    const uploadStatusId = document.querySelector('.status-message.lasting')?.id;
    if (uploadStatusId) {
      removeLastingStatusMessage(uploadStatusId, `❌ Upload failed! ${error.message}`, 'error');
    } else {
      alert(`Upload failed! ${error.message}`);
    }
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
        
        // Also load chat history, lecture history, and uploaded files for the existing session
        await loadChatHistory();
        await loadLectureHistory();
        await loadLessonTopics();
        await loadUserFileHistory();
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

async function keepSessionAlive() {
  try {
    const sessionData = getSessionData();
    if (!sessionData || !sessionData.session_id) return;
    
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    
    // Ping the session status endpoint to update activity timestamp
    const response = await fetch(`${localBackendUrl}/api/session-status?session_id=${sessionData.session_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const data = await response.json();
      // If session not found, it might have expired
      if (response.status === 404 || (data && data.detail === "Session not found")) {
        handleExpiredSession();
        return;
      }
    }
    
    console.log("Session activity updated");
  } catch (error) {
    console.error("Error keeping session alive:", error);
    // Check if error indicates session expiration
    if (error.message.includes("Session not found") || error.message.includes("Not authorized")) {
      handleExpiredSession();
    }
  }
}

// Function to handle expired sessions
function handleExpiredSession() {
  console.log("Session expired or terminated");
  
  // Clear existing session data
  clearSessionData();
  
  // Clear all UI elements
  clearSessionUI();
  
  // Display persistent message
  const persistentMsg = document.createElement('div');
  persistentMsg.id = 'expired-session-message';
  persistentMsg.className = 'status-message error persistent';
  persistentMsg.textContent = 'Your session has expired. Please press Connect to start a new session.';
  persistentMsg.style.backgroundColor = '#f44336';
  persistentMsg.style.color = 'white';
  persistentMsg.style.padding = '10px';
  persistentMsg.style.borderRadius = '5px';
  persistentMsg.style.margin = '10px 0';
  persistentMsg.style.textAlign = 'center';
  persistentMsg.style.position = 'sticky';
  persistentMsg.style.top = '0';
  persistentMsg.style.zIndex = '1000';
  
  // Add to status message box
  if (statusMessageBox) {
    // Remove any existing expired session messages
    const existingMsg = document.getElementById('expired-session-message');
    if (existingMsg) existingMsg.remove();
    
    statusMessageBox.prepend(persistentMsg);
  }
  
  // Reset UI
  if (connectButton) connectButton.disabled = false;
  
  // Clear video display
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement.style.display = 'none';
  }
  
  // If WebRTC is connected, disconnect it
  if (window.pixelStreamingApp) {
    try {
      window.pixelStreamingApp.disconnect();
    } catch (error) {
      console.error("Error disconnecting WebRTC:", error);
    }
  }
}

// Modify the handleConnect function to clear any expired session message
function modifiedHandleConnect() {
  // Remove expired session message if present
  const expiredMsg = document.getElementById('expired-session-message');
  if (expiredMsg) expiredMsg.remove();
  
  // Continue with normal connect logic
  return handleConnect();
}

// Initialize PixelStreaming for a session
async function initializePixelStreamingForSession(sessionData) {
  const epic = window["epicgames-frontend"];
  if (!epic) {
    throw new Error('epicgames-frontend is not loaded. Make sure player.js is included.');
  }

  console.log('Initializing PixelStreaming for session:', sessionData);
  
  // Use the specific signaling server URL for this session
  const signalingUrl = `ws://34.125.125.158:${sessionData.websocket_port}`;
  console.log('Using signaling server URL:', signalingUrl);
  
  // Enhanced WebRTC configuration
  const webRtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { 
        urls: `turn:${ENV.EXTERNAL_IP}:19303`,
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

// Add a periodic session check to the page that runs every minute
function startSessionMonitoring() {
  // Check once immediately
  checkSessionStatus();
  
  // Then set up regular interval
  return setInterval(checkSessionStatus, 60000); // Every minute
}

// Function to check session status
async function checkSessionStatus() {
  const sessionData = getSessionData();
  if (!sessionData || !sessionData.session_id) return;
  
  try {
    const result = await checkUEInstanceStatus(sessionData.session_id);
    
    // If session check fails, handle as expired
    if (result === false) {
      handleExpiredSession();
    }
  } catch (error) {
    console.error("Error checking session status:", error);
    // If there's an error checking status, assume session might be expired
    handleExpiredSession();
  }
}