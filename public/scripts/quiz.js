// Debug version of quiz.js with error handling
console.log("Quiz.js starting to load");

// Try/catch around the entire script
try {
  // First load the JSON configuration
  let ENV;
  
  
  // Immediately-invoked async function to load configuration
  (async function loadConfig() {
    try {
      const response = await fetch("/api.json");
      if (!response.ok) {
        throw new Error(`Failed to load API config: ${response.status} ${response.statusText}`);
      }
      ENV = await response.json();
      console.log("API config loaded successfully");
      
      // Only proceed with initialization after config is loaded
      initializePage();
    } catch (configError) {
      console.error("Error loading API configuration:", configError);
      document.body.innerHTML = '<div style="color:red;padding:20px;">Error loading application configuration. Please refresh the page or contact support.</div>';
    }
  })();

  // Main initialization function that runs after config is loaded
  function initializePage() {
    try {
      console.log("Initializing quiz page");
      const externalIp = ENV.EXTERNAL_IP
      const backendPort = ENV.BACKEND_PORT
      const localBackendUrl = `http://${externalIp}:${backendPort}`
      console.log("Backend URL:", localBackendUrl);

      // Quiz State
      const quizState = {
        questions: [],
        currentQuestionIndex: 0,
        userAnswers: [],
        score: 0,
        sessionId: null
      };

      // Try to safely get DOM elements with error handling
      function getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
          console.warn(`Element with ID '${id}' not found in the DOM`);
        }
        return element;
      }

      // DOM Elements - with null checks
      const startScreen = getElement('start-screen');
      const loadingScreen = getElement('loading-screen');
      const quizScreen = getElement('quiz-screen');
      const resultsScreen = getElement('results-screen');

      const startButton = getElement('start-quiz');
      const prevButton = getElement('prev-button');
      const nextButton = getElement('next-button');
      const restartButton = getElement('restart-button');
      const returnButton = getElement('return-button')

      const questionNumber = getElement('question-number');
      const questionText = getElement('question-text');
      const optionsContainer = getElement('options-container');
      const feedback = getElement('feedback');
      const pagination = getElement('pagination');

      const resultsScore = getElement('results-score');
      const resultsMessage = getElement('results-message');

      // Scoreboard Elements
      const scoreText = getElement('score-text');
      const gaugeNeedle = getElement('gauge-needle');
      const questionButtons = getElement('question-buttons');

      // Verify that required elements exist
      if (!startScreen || !loadingScreen || !quizScreen || !resultsScreen) {
        throw new Error("Required screen elements not found in the DOM");
      }

      // Function to get session data
      function getSessionData() {
        try {
          const sessionData = sessionStorage.getItem('aiProfessorSession');
          if (sessionData) {
            return JSON.parse(sessionData);
          }
          return null;
        } catch (error) {
          console.error('Error parsing session data:', error);
          return null;
        }
      }

      // Show different message types - with null checks
      function showReadyMessage() {
        if (!startScreen || !startButton) return;
        
        clearMessages();
        const messageElement = document.createElement('p');
        messageElement.textContent = 'Ready to test your knowledge? Start the quiz!';
        messageElement.className = 'quiz-ready-message';
        
        startScreen.insertBefore(messageElement, startButton);
      }

      function showWarningMessage(message) {
        if (!startScreen || !startButton) return;
        
        clearMessages();
        const warningElement = document.createElement('p');
        warningElement.textContent = message;
        warningElement.className = 'quiz-warning-message';
        warningElement.style.color = 'red';
        
        startScreen.insertBefore(warningElement, startButton);
      }

      function showInfoMessage(message) {
        if (!startScreen || !startButton) return;
        
        const infoElement = document.createElement('p');
        infoElement.textContent = message;
        infoElement.className = 'quiz-info-message';
        infoElement.style.color = 'blue';
        infoElement.style.fontStyle = 'italic';
        
        if (!document.querySelector('.quiz-info-message')) {
          startScreen.insertBefore(infoElement, startButton);
        }
      }

      function showLoginMessage() {
        if (!startScreen || !startButton) return;
        
        clearMessages();
        const loginElement = document.createElement('p');
        loginElement.textContent = 'Please log in to access the quiz.';
        loginElement.className = 'quiz-login-message';
        loginElement.style.color = 'red';
        
        const loginLink = document.createElement('a');
        loginLink.href = '/login.html';
        loginLink.textContent = 'Go to login page';
        loginLink.className = 'quiz-login-link';
        loginLink.style.display = 'block';
        loginLink.style.marginTop = '10px';
        
        startScreen.insertBefore(loginElement, startButton);
        startScreen.insertBefore(loginLink, startButton);
        
        if (startButton) startButton.disabled = true;
      }

      function clearMessages() {
        if (!startScreen) return;
        
        document.querySelectorAll('.quiz-ready-message, .quiz-warning-message, .quiz-login-message, .quiz-login-link, .quiz-info-message').forEach(el => {
          el.remove();
        });
      }

      // Initialize quiz
      async function initQuiz() {
        console.log("Initializing quiz and checking for active session...");
        
        // Check for existing session
        const sessionData = getSessionData();
        console.log("Session data from storage:", sessionData);
        
        if (sessionData && sessionData.session_id) {
          console.log("Found session:", sessionData.session_id);
          quizState.sessionId = sessionData.session_id;
          
          // Verify session is still active on server
          try {
            const token = sessionStorage.getItem('accessToken');
            if (!token) {
              console.log("No access token found");
              showLoginMessage();
              return;
            }
            
            const response = await fetch(`${localBackendUrl}/api/session-status?session_id=${sessionData.session_id}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            console.log("Session status response status:", response.status);
            
            if (response.ok) {
              const data = await response.json();
              console.log("Session status response data:", data);
              
              // Session exists - check if knowledge database exists, regardless of UE status
              if (data.has_knowledge_db) {
                // Knowledge DB exists, we can enable the quiz
                showReadyMessage();
                if (startButton) startButton.disabled = false;
                
                // Display UE status if relevant
                if (!data.ue_instance_running) {
                  showInfoMessage("Note: UE instance is paused, but your quiz can still work with the session data.");
                }
              } else {
                // Knowledge DB doesn't exist
                showWarningMessage("Session found, but no content has been uploaded. Please upload content before starting a quiz.");
                if (startButton) startButton.disabled = true;
              }
            } else if (response.status === 401) {
              // Authentication error
              console.log("Authentication error");
              showLoginMessage();
            } else if (response.status === 404) {
              // Session not found
              console.log("Session not found");
              showWarningMessage("No active session found. Please connect first.");
              if (startButton) startButton.disabled = true;
              sessionStorage.removeItem('aiProfessorSession');
            } else {
              // Other error
              let errorText = "Unknown error";
              try {
                errorText = await response.text();
              } catch (e) {
                console.error("Error reading response text:", e);
              }
              console.error("Session status error:", response.status, errorText);
              showWarningMessage("Error checking session status. Please try again.");
              if (startButton) startButton.disabled = true;
            }
          } catch (error) {
            console.error('Error checking session:', error);
            showWarningMessage("Error checking session. Please return to the service page.");
            if (startButton) startButton.disabled = true;
          }
        } else {
          console.log("No session found in storage");
          // No active session
          showWarningMessage("No active session found. Please connect and upload content before starting a quiz.");
          if (startButton) startButton.disabled = true;
        }
      }

      // Show a specific screen
      function showScreen(screenId) {
        try {
          document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
          });
          const screenElement = document.getElementById(screenId);
          if (screenElement) {
            screenElement.classList.add('active');
          } else {
            console.warn(`Screen element with ID '${screenId}' not found`);
          }
        } catch (error) {
          console.error("Error showing screen:", error);
        }
      }

      // Generate Questions from API
      async function generateQuiz() {
        try {
          const token = sessionStorage.getItem('accessToken');
          if (!token) {
            alert('No access token found. Please log in.');
            showScreen('start-screen');
            return;
          }
          
          if (!quizState.sessionId) {
            alert('No active session found. Please connect first.');
            showScreen('start-screen');
            return;
          }
          
          // Get topic from URL parameter
          const topic = getUrlParameter('topic');
          
          // Build the request URL
          let apiUrl = `${localBackendUrl}/api/generate-quiz?session_id=${quizState.sessionId}`;
          
          // Add topic parameter if available
          if (topic) {
            apiUrl += `&topic=${encodeURIComponent(topic)}`;
            
            // Update the quiz title with the topic
            const quizTitle = document.querySelector('.screen#start-screen h2');
            if (quizTitle) {
              const formattedTopic = topic.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              quizTitle.textContent = `${formattedTopic} Quiz`;
            }
          }
          
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!response.ok) {
            if (response.status === 401) {
              alert('Your session has expired. Please log in again.');
              sessionStorage.removeItem('accessToken');
              window.location.href = '/login.html';
              return;
            }
            
            let errorMessage = `HTTP error! Status: ${response.status}`;
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } catch (e) {
              console.error("Error parsing error response:", e);
            }
            throw new Error(errorMessage);
          }
          
          const data = await response.json();
          
          if (data && Array.isArray(data) && data.length > 0) {
            quizState.questions = data;
            quizState.currentQuestionIndex = 0;
            quizState.userAnswers = new Array(data.length).fill(null);
            quizState.score = 0;
            
            loadQuestion(0);
            updatePagination();
            initScoreboard();
            updateScoreboard();
            showScreen('quiz-screen');
          } else {
            throw new Error('No questions received from the server');
          }
        } catch (error) {
          console.error('Error generating quiz:', error);
          alert('Failed to generate quiz: ' + error.message);
          showScreen('start-screen');
        }
      }

    // Initialize Scoreboard
    function initScoreboard() {
      // Initialize score text
      scoreText.textContent = `0/0`;

      // Initialize gauge needle at starting position
      updateGaugeNeedle(0);
      
      // Create question buttons
      questionButtons.innerHTML = '';
      quizState.questions.forEach((_, index) => {
          const button = document.createElement('button');
          button.className = 'question-button unanswered';
          button.textContent = index + 1;
          
          button.addEventListener('click', () => {
              quizState.currentQuestionIndex = index;
              loadQuestion(index);
              updatePagination();
              updateScoreboard();
          });
          
          questionButtons.appendChild(button);
      });
    }
    
      // Update Scoreboard
    function updateScoreboard() {
      // Count answered questions
      const answered = quizState.userAnswers.filter(ans => ans !== null).length;
      // Update score text: #correct/#answered (if none answered, show 0/0)
      scoreText.textContent = answered === 0
          ? `0/0`
          : `${quizState.score}/${answered}`;

      // Update gauge needle position
      const scorePercentage = answered > 0
          ? quizState.score / answered
          : 0;
      updateGaugeNeedle(scorePercentage);

      // Update question buttons
      const buttons = questionButtons.querySelectorAll('.question-button');
      buttons.forEach((button, index) => {
          // Remove all classes except 'question-button'
          button.className = 'question-button';

          // Add appropriate class based on answer status
          if (quizState.userAnswers[index] === null) {
              button.classList.add('unanswered');
          } else {
              const isCorrect = quizState.userAnswers[index] === quizState.questions[index].answer;
              button.classList.add(isCorrect ? 'correct' : 'incorrect');
          }

          // Highlight current question
          if (index === quizState.currentQuestionIndex) {
              button.classList.add('active');
          }
      });
    }

    // Update Gauge Needle Position
    function updateGaugeNeedle(scorePercentage) {
      // Calculate angle based on score percentage (0 to 1)
      // 0% = 180 degrees (pointing left), 100% = 0 degrees (pointing right)
      // FIX: Make 0% left, 100% right (clockwise)
      const angle = 180 * (1 - scorePercentage);

      // Calculate endpoint coordinates for the needle
      const length = 80; // Length of needle
      const centerX = 100;
      const centerY = 110;
      const radians = angle * (Math.PI / 180);
      const endX = centerX + Math.cos(radians) * length;
      const endY = centerY - Math.sin(radians) * length;

      // Update needle line
      gaugeNeedle.setAttribute('x1', centerX);
      gaugeNeedle.setAttribute('y1', centerY);
      gaugeNeedle.setAttribute('x2', endX);
      gaugeNeedle.setAttribute('y2', endY);
    }

      // Load a question by index
      function loadQuestion(index) {
        try {
          if (!questionNumber || !questionText || !optionsContainer || !feedback) {
            console.error("Required question elements not found");
            return;
          }
          
          const question = quizState.questions[index];
          
          if (!question) {
            console.warn("Question not found at index", index);
            return;
          }
          
          questionNumber.textContent = `Question ${index + 1}:`;
          questionText.textContent = question.question;
          
          // Clear options
          optionsContainer.innerHTML = '';
          
          // Add options
          question.options.forEach((option, optionIndex) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'option';
            optionElement.textContent = option;
            optionElement.dataset.option = optionIndex;
            
            // If user has already answered this question
            if (quizState.userAnswers[index] !== null) {
              if (quizState.userAnswers[index] === optionIndex) {
                optionElement.classList.add('selected');
                
                if (optionIndex === question.answer) {
                  optionElement.classList.add('correct');
                } else {
                  optionElement.classList.add('incorrect');
                }
              } else if (optionIndex === question.answer) {
                optionElement.classList.add('correct');
              }
            }
            
            optionElement.addEventListener('click', () => selectOption(optionIndex));
            
            optionsContainer.appendChild(optionElement);
          });
          
          // Show/hide feedback if needed
          if (quizState.userAnswers[index] !== null) {
            const isCorrect = quizState.userAnswers[index] === question.answer;
            feedback.textContent = isCorrect ? 
              'Correct! Good job!' : 
              `Incorrect. The correct answer is: ${question.options[question.answer]}`;
            feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
            feedback.style.display = 'block';
          } else {
            feedback.style.display = 'none';
          }
          
          // Update navigation buttons
          if (prevButton) prevButton.disabled = index === 0;
          if (nextButton) nextButton.textContent = index === quizState.questions.length - 1 ? 'Finish' : 'Next';
        } catch (error) {
          console.error("Error loading question:", error);
        }
      }

      

      // Select an option
      function selectOption(optionIndex) {
        try {
          const currentIndex = quizState.currentQuestionIndex;
          const question = quizState.questions[currentIndex];
          
          // If already answered, don't allow changing
          if (quizState.userAnswers[currentIndex] !== null) return;
          
          quizState.userAnswers[currentIndex] = optionIndex;
          
          // Update score
          if (optionIndex === question.answer) {
            quizState.score++;
          }
          
          // Mark options
          const options = document.querySelectorAll('.option');
          options.forEach((option, index) => {
            if (index === optionIndex) {
              option.classList.add('selected');
              if (index === question.answer) {
                option.classList.add('correct');
              } else {
                option.classList.add('incorrect');
              }
            } else if (index === question.answer) {
              option.classList.add('correct');
            }
          });
          
          // Show feedback
          if (feedback) {
            const isCorrect = optionIndex === question.answer;
            feedback.textContent = isCorrect ? 
              'Correct! Good job!' : 
              `Incorrect. The correct answer is: ${question.options[question.answer]}`;
            feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
            feedback.style.display = 'block';
          }
          
          // Update pagination
          updatePagination();

          // Update scoreboard
          updateScoreboard();
        } catch (error) {
          console.error("Error selecting option:", error);
        }
      }

      // Update pagination
      function updatePagination() {
        try {
          if (!pagination) {
            console.warn("Pagination element not found");
            return;
          }
          
          pagination.innerHTML = '';
          
          quizState.questions.forEach((_, index) => {
            const pageItem = document.createElement('div');
            pageItem.className = 'page-item';
            if (index === quizState.currentQuestionIndex) {
              pageItem.classList.add('active');
            }
            
            // If question is answered, add a visual cue
            if (quizState.userAnswers[index] !== null) {
              const isCorrect = quizState.userAnswers[index] === quizState.questions[index].answer;
              pageItem.style.backgroundColor = isCorrect ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';
            }
            
            pageItem.textContent = index + 1;
            pageItem.addEventListener('click', () => {
              quizState.currentQuestionIndex = index;
              loadQuestion(index);
              updatePagination();
              updateScoreboard();
            });
            
            pagination.appendChild(pageItem);
          });
        } catch (error) {
          console.error("Error updating pagination:", error);
        }
      }

      // Show results
      function showResults() {
        try {
          if (!resultsScore || !resultsMessage) {
            console.warn("Results elements not found");
            return;
          }
          
          resultsScore.textContent = `${quizState.score}/${quizState.questions.length}`;
          
          // Calculate percentage
          const percentage = (quizState.score / quizState.questions.length) * 100;
          
          if (percentage >= 90) {
            resultsMessage.textContent = "Excellent! You have mastered the material.";
          } else if (percentage >= 70) {
            resultsMessage.textContent = "Good job! You have a solid understanding of the concepts.";
          } else if (percentage >= 50) {
            resultsMessage.textContent = "You're on the right track, but might need to review some concepts.";
          } else {
            resultsMessage.textContent = "You should review the material more thoroughly before trying again.";
          }
          
          // Get the return button (if it exists)
          const returnButton = document.getElementById('return-button');
          if (returnButton) {
            // If we came from a specific topic, make sure the button knows where to return to
            const session_id = getUrlParameter('session_id');
            if (session_id) {
              returnButton.onclick = () => {
                window.location.href = `/service.html`;
              };
            }
          }
          
          showScreen('results-screen');
        } catch (error) {
          console.error("Error showing results:", error);
        }
      }

      function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
      }

      // Set up event listeners when DOM is fully loaded
      function setupEventListeners() {
        try {
          console.log("Setting up event listeners");
          
          // First import and load the navbar and footer
          import('./navbar.js').then(module => {
            const { loadNavbar } = module;
            loadNavbar();
            console.log("Navbar loaded");
          }).catch(error => {
            console.error("Error loading navbar:", error);
          });
          
          import('./footer.js').then(module => {
            const { loadFooter } = module;
            loadFooter();
            console.log("Footer loaded");
          }).catch(error => {
            console.error("Error loading footer:", error);
          });
          
          // Start button listener
          if (startButton) {
            startButton.addEventListener('click', () => {
              showScreen('loading-screen');
              setTimeout(() => {
                generateQuiz();
              }, 1000); // Simulate loading time
            });
            console.log("Start button event listener added");
          } else {
            console.warn("Start button not found");
          }
          
          // Navigation button listeners
          if (prevButton) {
            prevButton.addEventListener('click', () => {
              if (quizState.currentQuestionIndex > 0) {
                quizState.currentQuestionIndex--;
                loadQuestion(quizState.currentQuestionIndex);
                updatePagination();
                updateScoreboard();
      }
            });
            console.log("Previous button event listener added");
          }
          
          if (nextButton) {
            nextButton.addEventListener('click', () => {
              if (quizState.currentQuestionIndex < quizState.questions.length - 1) {
                quizState.currentQuestionIndex++;
                loadQuestion(quizState.currentQuestionIndex);
                updatePagination();
                updateScoreboard();
              } else {
                showResults();
              }
            });
            console.log("Next button event listener added");
          }
          
          if (restartButton) {
            restartButton.addEventListener('click', async () => {
              showScreen('loading-screen');
              
              // Reset state
              quizState.questions = [];
              quizState.currentQuestionIndex = 0;
              quizState.userAnswers = [];
              quizState.score = 0;
              
              // Go back to start screen
              setTimeout(() => {
                showScreen('start-screen');
              }, 1000);
            });
            console.log("Restart button event listener added");
          }

          if (returnButton) {
            returnButton.addEventListener('click', async () => {              
              // Reset state
              quizState.questions = [];
              quizState.currentQuestionIndex = 0;
              quizState.userAnswers = [];
              quizState.score = 0;
              
              window.location.href = '/service.html';
            });
            console.log("Return button event listener added");
          }
          
          // Initialize the quiz
          initQuiz();
          console.log("Quiz initialization started");
        } catch (error) {
          console.error("Error setting up event listeners:", error);
        }
      }

      // Wait for DOM content to be loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEventListeners);
        console.log("Added DOMContentLoaded event listener");
      } else {
        // DOM already loaded, run setup immediately
        setupEventListeners();
        console.log("DOM already loaded, running setup immediately");
      }
    } catch (initError) {
      console.error("Error in initialization:", initError);
      document.body.innerHTML = `<div style="color:red;padding:20px;">Error initializing application: ${initError.message}</div>`;
    }
  }
} catch (globalError) {
  console.error("Global error in quiz.js:", globalError);
  // Try to show error on the page
  try {
    document.body.innerHTML = `<div style="color:red;padding:20px;">A critical error occurred: ${globalError.message}</div>`;
  } catch (e) {
    // Cannot modify the page, last resort
    alert("A critical error occurred: " + globalError.message);
  }
}