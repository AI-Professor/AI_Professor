import { loadNavbar } from "./navbar.js";
import { loadFooter } from "./footer.js";

// --- MOCK MODE SUPPORT ---
const MOCK_QUIZ = window.MOCK_QUIZ || false;

// Quiz State
const quizState = {
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: [],
    score: 0
};

// Expose quiz state and UI functions for mock preview
window.quizState = quizState;
window.showScreen = showScreen;
window.loadQuestion = loadQuestion;
window.updatePagination = updatePagination;
window.initScoreboard = initScoreboard;
window.updateScoreboard = updateScoreboard;

// DOM Elements
const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultsScreen = document.getElementById('results-screen');

const startButton = document.getElementById('start-quiz');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const restartButton = document.getElementById('restart-button');

const questionNumber = document.getElementById('question-number');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const feedback = document.getElementById('feedback');
const pagination = document.getElementById('pagination');

const resultsScore = document.getElementById('results-score');
const resultsMessage = document.getElementById('results-message');

// Scoreboard Elements
const scoreText = document.getElementById('score-text');
const gaugeNeedle = document.getElementById('gauge-needle');
const questionButtons = document.getElementById('question-buttons');

// Show a specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Generate Questions from API
async function generateQuiz() {
    try {
        const response = await fetch(`${localBackendUrl}/api/generate-quiz`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
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
        alert('Failed to generate quiz. Please try again.');
        showScreen('start-screen');
    }
}

// Clear Quiz from Backend
async function clearQuiz() {
    try {
        const response = await fetch('/api/clear-quiz', {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        console.log('Quiz cleared successfully');
    } catch (error) {
        console.error('Error clearing quiz:', error);
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
    const question = quizState.questions[index];
    
    if (!question) return;
    
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
    prevButton.disabled = index === 0;
    nextButton.textContent = index === quizState.questions.length - 1 ? 'Finish' : 'Next';
}

// Select an option
function selectOption(optionIndex) {
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
    const isCorrect = optionIndex === question.answer;
    feedback.textContent = isCorrect ? 
        'Correct! Good job!' : 
        `Incorrect. The correct answer is: ${question.options[question.answer]}`;
    feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    feedback.style.display = 'block';
    
    // Update pagination
    updatePagination();
    
    // Update scoreboard
    updateScoreboard();
}

// Update pagination
function updatePagination() {
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
}

// Show results
function showResults() {
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
    
    showScreen('results-screen');
}

if (!MOCK_QUIZ) {
    // Only run backend-dependent code if not in mock mode

    const ENV = await (await fetch("/api.json")).json();
    const localHostName = ENV.LOCAL_HOST_NAME
    const localBackendPort = ENV.LOCAL_BACKEND_PORT
    const localBackendUrl = `http://${localHostName}:${localBackendPort}`

    document.addEventListener('DOMContentLoaded', loadNavbar());
    document.addEventListener('DOMContentLoaded', loadFooter());

    // Event Listeners
    startButton.addEventListener('click', () => {
        showScreen('loading-screen');
        setTimeout(() => {
            generateQuiz();
        }, 1000); // Simulate loading time
    });

    restartButton.addEventListener('click', async () => {
        showScreen('loading-screen');
        // Clear the quiz from backend
        await clearQuiz();
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
} else {
    // In mock mode, just load navbar/footer without backend
    document.addEventListener('DOMContentLoaded', loadNavbar());
    document.addEventListener('DOMContentLoaded', loadFooter());

    // Disable backend-dependent event listeners
    startButton.addEventListener('click', () => {});
    restartButton.addEventListener('click', () => {});
}

// Navigation buttons (these are UI only, safe in mock mode)
prevButton.addEventListener('click', () => {
    if (quizState.currentQuestionIndex > 0) {
        quizState.currentQuestionIndex--;
        loadQuestion(quizState.currentQuestionIndex);
        updatePagination();
        updateScoreboard();
    }
});

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
