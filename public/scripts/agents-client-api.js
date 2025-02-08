'use strict';
//This is the javascript files for our index-agents.html frontend UI

//We will fetch our D-ID API key from frontend environment file api.json
const DID_API = await (await fetch("/api.json")).json();
const API_BASE = `${DID_API.url}/talks/streams`;
import { initializeVoiceRecognition } from "./voice-ui.js";

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

//Initialize global variables
let peerConnection;
let pcDataChannel;
let streamId;
let sessionId;
let sessionClientAnswer;

let statsIntervalId;
let lastBytesReceived;
let videoIsPlaying = false;
let streamVideoOpacity = 0;

let currentQuiz = [];
let currentQuestionIndex = 0;
let score = 0;

const stream_warmup = true;
let isStreamReady = !stream_warmup;

//Initialize interactive global variables from frontend HTML
const idleVideoElement = document.getElementById('idle-video-element');
const streamVideoElement = document.getElementById('stream-video-element');
idleVideoElement.setAttribute('playsinline', '');
streamVideoElement.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');
const streamingStatusLabel = document.getElementById('streaming-status-label');
const streamEventLabel = document.getElementById('stream-event-label');

const presenterInputByService = {
  talks: {
    source_url: 'https://i.ibb.co/h1D26ggv/avatar.png',
  },
  clips: {
    presenter_id: 'v2_public_alex@qcvo4gupoy',
    driver_id: 'e3nbserss8',
  },
};

//The following section of functions will serve connect button clicked event. These functions are meant to create a live stream, establish a WebRTC connection with the platform, and submit network information to initialize connection. These steps are crucial to our implementation to Real-Time Q&A feature. Detailed explanation can be find on "https://docs.d-id.com/reference/talks-streams-overview".
const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }

  stopAllStreams();
  closePC();

  /**
   * Set 'stream_warmup' to 'true' in the payload to initiate idle streaming at the beginning of the connection, addressing jittering issues.
   * The idle streaming process is transparent to the user and is concealed by triggering a 'stream/ready' event on the data channel,
   * indicating that idle streaming has concluded and the stream channel is ready for use.
   */
  const sessionResponse = await fetchWithRetry(`${DID_API.url}/${DID_API.service}/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...presenterInputByService[DID_API.service], stream_warmup,source_url: "https://i.ibb.co/h1D26ggv/avatar.png" }),
  });

  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;

  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  const sdpResponse = await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
};
function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  } else {
    // For the initial 2 sec idle stream at the beginning of the connection, we utilize a null ice candidate.
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
  if (peerConnection.connectionState === 'connected') {
    playIdleVideo()
    /**
     * A fallback mechanism: if the 'stream/ready' event isn't received within 5 seconds after asking for stream warmup,
     * it updates the UI to indicate that the system is ready to start streaming data.
     */
    setTimeout(() => {
      if (!isStreamReady) {
        console.log('forcing stream/ready');
        isStreamReady = true;
        streamEventLabel.innerText = 'ready';
        streamEventLabel.className = 'streamEvent-ready';
      }
    }, 5000);
  }
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}
function onVideoStatusChange(videoIsPlaying, stream) {
  let status;

  if (videoIsPlaying) {
    status = 'streaming';
    streamVideoOpacity = isStreamReady ? 1 : 0;
    setStreamVideoElement(stream);
  } else {
    status = 'empty';
    streamVideoOpacity = 0;
  }

  streamVideoElement.style.opacity = streamVideoOpacity;
  idleVideoElement.style.opacity = 1 - streamVideoOpacity;

  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = 'streamingState-' + status;
}
function onStreamEvent(message) {
  /**
   * This function handles stream events received on the data channel.
   * The 'stream/ready' event received on the data channel signals the end of the 2sec idle streaming.
   * Upon receiving the 'ready' event, we can display the streamed video if one is available on the stream channel.
   * Until the 'ready' event is received, we hide any streamed video.
   * Additionally, this function processes events for stream start, completion, and errors. Other data events are disregarded.
   */

  if (pcDataChannel.readyState === 'open') {
    let status;
    const [event, _] = message.data.split(':');

    switch (event) {
      case 'stream/started':
        status = 'started';
        break;
      case 'stream/done':
        status = 'done';
        break;
      case 'stream/ready':
        status = 'ready';
        break;
      case 'stream/error':
        status = 'error';
        break;
      default:
        status = 'dont-care';
        break;
    }

    // Set stream ready after a short delay, adjusting for potential timing differences between data and stream channels
    if (status === 'ready') {
      setTimeout(() => {
        console.log('stream/ready');
        isStreamReady = true;
        streamEventLabel.innerText = 'ready';
        streamEventLabel.className = 'streamEvent-ready';
      }, 1000);
    } else {
      console.log(event);
      streamEventLabel.innerText = status === 'dont-care' ? event : status;
      streamEventLabel.className = 'streamEvent-' + status;
    }
  }
}
function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no video is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks (or clips) endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}
async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
    pcDataChannel.addEventListener('message', onStreamEvent, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  return sessionClientAnswer;
}
function setStreamVideoElement(stream) {
  if (!stream) return;

  streamVideoElement.srcObject = stream;
  streamVideoElement.loop = false;
  streamVideoElement.mute = !isStreamReady;

  // safari hotfix
  if (streamVideoElement.paused) {
    streamVideoElement
      .play()
      .then((_) => { })
      .catch((e) => { });
  }
}
function playIdleVideo() {
  idleVideoElement.src = DID_API.service == 'clips' ? '/public/assets/idle/Henry_Idle_Video.mp4' : '/public/assets/idle/Henry_Idle_Video.mp4';
}

//The following section of functions will serve to record an user's voice input, send it to backend through API calls in main.py to process, and get our GPT-4 model's answer back from backend and create a stream talk that can be seen and listend on our frontend Real-Time interaction.
const startButton = document.getElementById('start-button');
startButton.onclick = async () => {
  try {
      const userQuestion = await initializeVoiceRecognition();
      addChatMessage(`You: ${userQuestion}`, 'user');
      
      const backendResponse = await fetch('http://localhost:5001/api/answer', {
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
      
      const { text, audio } = await backendResponse.json();
      addChatMessage(`AI: ${text}`, 'ai');
      
      await handleUserInput("apple");
  } catch (error) {
      showStatusMessage(`❌ Processing error: ${error.message}`, true);
  }
};
async function handleUserInput(text) {
  // Generate audio from TTS service
  try {
      const backendResponse = await fetch('http://localhost:5001/api/audio-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
    }).catch(error => {
      throw new Error(`Network error: ${error.message}`);
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      throw new Error(`API Error ${backendResponse.status}: ${errorText}`);
    }
    const {audio_url} = await backendResponse.json();

    await fetchWithRetry(`${API_BASE}/${streamId}`, {
      method: 'POST',
      headers: {
          Authorization : `Basic ${DID_API.key}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          script: {
              type: 'audio',
              audio_url: audio_url
          },
          ...(DID_API.service === 'clips' && {
            background: {
              color: '#FFFFFF',
            },
          }),
          config: {
            stitch: true,
          },
          session_id: sessionId,
      })
  });
  } catch (error) {
    showStatusMessage(`❌ Processing error: ${error.message}`, true);
}
}
function addChatMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.textContent = text;
  document.getElementById('msgHistory').appendChild(msgDiv);
}

//The following section of functions will serve destroy button clicked. It will destroy the live stream we created and cut off peer connection
const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};
function stopAllStreams() {
  if (streamVideoElement.srcObject) {
    console.log('stopping video streams');
    streamVideoElement.srcObject.getTracks().forEach((track) => track.stop());
    streamVideoElement.srcObject = null;
    streamVideoOpacity = 0;
  }
}
function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  pc.removeEventListener('onmessage', onStreamEvent, true);

  clearInterval(statsIntervalId);
  isStreamReady = !stream_warmup;
  streamVideoOpacity = 0;
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  streamEventLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

//The following section of functions will serve upload function. It will take required form of input files and send it to our backend through API calls in main.py to process. It will initialize our knowledge graph based on given input
const uploadButton = document.getElementById('upload-button');
uploadButton.onclick = async () => {
  const fileInput = document.getElementById('fileInput');
  const files = Array.from(fileInput.files);
  
  if (files.length === 0) {
      showStatusMessage('Please select files first', true);
      return;
  }

  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
      showStatusMessage('Uploading files...');
      const response = await fetch('http://localhost:5001/api/upload', {
          method: 'POST',
          body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed');
      
      showStatusMessage(result.message);
      await checkSystemStatus();
      
  } catch (error) {
      showStatusMessage(`Upload failed: ${error.message}`, true);
  }
};
async function checkSystemStatus() {
  try {
      const response = await fetch('http://localhost:5001/health');
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
    const response = await fetch('http://localhost:5001/api/generate-quiz');
    if (!response.ok) throw new Error('Failed to fetch quiz');
    
    currentQuiz = await response.json();
    
    if (!currentQuiz?.length) {
      showStatusMessage('No questions available!', true);
      return;
    }
    
    currentQuestionIndex = 0;
    score = 0
    showQuestion(currentQuiz[currentQuestionIndex]);
    
  } catch (error) {
    showStatusMessage(`Quiz Error: ${error.message}`, true);
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
  }
}
document.getElementById('quiz-container').addEventListener('click', function(event) {
  if (event.target.closest('button[data-answer]')) {
    const selectedIndex = parseInt(event.target.getAttribute('data-answer'));
    handleAnswer(selectedIndex);
  }
});

//This function will serve clear quiz button. It will call backend API to cleanup quiz questions database table and recycle memory for future use.
const clearQuizButton = document.getElementById('clear-quiz-btn');
clearQuizButton.onclick = async () => {
  try {
    showStatusMessage('Clearing quiz database...');
    
    const response = await fetch('http://localhost:5001/api/clear-quiz', {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || 'Failed to clear quiz');
    }

    const result = await response.json();
    showStatusMessage(result.message);
    currentQuiz = []; // Reset current quiz
    
  } catch (error) {
    showStatusMessage(`Clear Error: ${error.message}`, true);
  }
};

//These two functions are constantly used by state changing event to check status of our frontend UI .
function showStatusMessage(message, isError = false) {
  const statusDiv = document.createElement('div');
  statusDiv.className = `status-msg ${isError ? 'error' : 'info'}`;
  statusDiv.textContent = message;
  document.getElementById('msgHistory').prepend(statusDiv);
}
async function fetchWithRetry(url, options, retries = 3) {
  try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
  } catch (error) {
      if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchWithRetry(url, options, retries - 1);
      }
      throw error;
  }
}

//Final clean up after everything is done.
window.addEventListener('beforeunload', async () => {
  if (currentStreamId) {
      await fetch(`${API_BASE}/${currentStreamId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Basic ${DID_CONFIG.key}` }
      });
  }
});
