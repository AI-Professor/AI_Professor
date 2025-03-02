import { initializeVoiceRecognition } from "./voice-ui.js";
const ENV = await (await fetch("/api.json")).json();
const serverHostName = ENV.SERVER_HOST_NAME
const serverFrontendPort = ENV.SERVER_FRONTEND_PORT
const serverBackendPort = ENV.SERVER_BACKEND_PORT
const serverUePort = ENV.SERVER_UE_PORT
const serverFrontendUrl = `http://${serverHostName}:${serverFrontendPort}`
const serverBackendUrl = `http://${serverHostName}:${serverBackendPort}`
const serverUeUrl = `ws://${serverHostName}:${serverUePort}`
const localHostName = ENV.LOCAL_HOST_NAME
const localFrontPort = ENV.LOCAL_FRONTEND_PORT
const localBackendPort = ENV.LOCAL_BACKEND_PORT
const localUePort = ENV.LOCAL_UE_PORT
const localFrontendUrl = `http://${localHostName}:${localFrontPort}`
const localBackendUrl = `http://${localHostName}:${localBackendPort}`
const localUeUrl = `ws://${localHostName}:${localUePort}`

let currentQuiz = [];
let currentQuestionIndex = 0;
let score = 0;
window.pixelStreamingApp = null;

const videoElement = document.getElementById('pixelStreamVideo');

//The following section of functions will serve connect button clicked event. These functions are meant to create a live stream, establish a WebRTC connection with the platform, and submit network information to initialize connection. These steps are crucial to our implementation to Real-Time Q&A feature. Detailed explanation can be find on "https://docs.d-id.com/reference/talks-streams-overview".
const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  try {
    // Disable the button to prevent multiple clicks
    connectButton.disabled = true;

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
    await window.pixelStreamingApp.connect();

    // Optionally, enable the button again or update UI
    connectButton.disabled = false;
    alert('Connection successful!');
    setTimeout(() => {
      forceVideoRefresh();
    }, 3000);
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

  console.log('Initializing PixelStreaming...');
  const config = new epic.Config({ useUrlParams: true});
  window.pixelStreamingApp = new epic.PixelStreaming(config);

  // Style and Application UI
  const style = new epic.PixelStreamingApplicationStyle();
  style.applyStyleSheet();

  const app = new epic.Application({
    stream: window.pixelStreamingApp,
    onColorModeChanged: (mode) => style.setColorMode(mode)
  });

  document.body.appendChild(app.rootElement);

}
// Attach Video Stream to Video Element
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
    videoElement.muted = true;

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
      alert('Question input successful!')
  } catch (error) {
      alert(`Question input failed! Processing error: ${error.message}`)
      startButton.disabled = false;
  }
};
function addChatMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.textContent = text;
  document.getElementById('msgHistory').appendChild(msgDiv);
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

//The following section of functions will serve start quiz button. It will call backend API to generate some quiz questions based on lesson script and send them back to frontend.
const quizButton = document.getElementById('start-quiz-btn');
quizButton.onclick = async () => {
  try {
    quizButton.disabled = true;

    const response = await fetch(`${localBackendUrl}/api/generate-quiz`);
    if (!response.ok) throw new Error('Failed to fetch quiz');
    
    currentQuiz = await response.json();
    
    if (!currentQuiz?.length) {
      alert('No questions available!');
      quizButton.disabled = false;
      return;
    }
    
    currentQuestionIndex = 0;
    score = 0
    showQuestion(currentQuiz[currentQuestionIndex]);
    
  } catch (error) {
    alert(`Quiz generation failed! ${error.message}`)
    quizButton.disabled = false;
  }
};
function showQuestion(question) {
  const quizContainer = document.getElementById('quiz-container');
  quizContainer.innerHTML = `
    <div class="quiz-question">
      <h3>Question ${currentQuestionIndex + 1}</h3>
      <p>${question.question}</p>
      ${question.options.map((opt, i) => `
        <button data-answer="${i}" style="color: black;">
          ${String.fromCharCode(65 + i)} ${opt}
        </button>
      `).join('')}
    </div>
  `;
}
async function handleAnswer(selectedIndex) {
  const correct = selectedIndex === currentQuiz[currentQuestionIndex].answer;
  
  // Show result
  showStatusMessage(correct ? "Correct! 🎉" : "Incorrect ❌", !correct);
  if (correct){
    score += 1
  }
  
  // Next question
  currentQuestionIndex++;
  if(currentQuestionIndex < currentQuiz.length) {
    showQuestion(currentQuiz[currentQuestionIndex]);
  } else {
    showStatusMessage("Quiz completed! Well done!", false);
    showStatusMessage(`Final Score: ${score}/${currentQuiz.length}`, false);
    quizButton.disabled = false;
  }
}
document.getElementById('quiz-container').addEventListener('click', function(event) {
  if (event.target.closest('button[data-answer]')) {
    const selectedIndex = parseInt(event.target.getAttribute('data-answer'));
    handleAnswer(selectedIndex);
  }
});

//These two functions are constantly used by state changing event to check status of our frontend UI .
function showStatusMessage(message, isError = false) {
  const statusDiv = document.createElement('div');
  statusDiv.className = `status-msg ${isError ? 'error' : 'info'}`;
  statusDiv.textContent = message;
  document.getElementById('msgHistory').prepend(statusDiv);
}
