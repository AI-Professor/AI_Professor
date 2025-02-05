//This function allows user to have voice input. This can recognize user's voice.
export function initializeVoiceRecognition() {
  return new Promise((resolve, reject) => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      resolve(event.results[0][0].transcript);
    };

    recognition.onerror = (event) => {
      reject(event.error);
    };

    recognition.start();
  });
}