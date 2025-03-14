import { loadNavbar } from "./navbar.js";

const ENV = await (await fetch("/api.json")).json();
const localHostName = ENV.LOCAL_HOST_NAME
const localBackendPort = ENV.LOCAL_BACKEND_PORT
const localBackendUrl = `http://${localHostName}:${localBackendPort}`

// Quiz State
const quizState = {
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: [],
    score: 0
};

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

// Event Listeners
startButton.addEventListener('click', () => {
    showScreen('loading-screen');
    setTimeout(() => {
        generateQuiz();
    }, 1000); // Simulate loading time
});

prevButton.addEventListener('click', () => {
    if (quizState.currentQuestionIndex > 0) {
        quizState.currentQuestionIndex--;
        loadQuestion(quizState.currentQuestionIndex);
        updatePagination();
    }
});

nextButton.addEventListener('click', () => {
    if (quizState.currentQuestionIndex < quizState.questions.length - 1) {
        quizState.currentQuestionIndex++;
        loadQuestion(quizState.currentQuestionIndex);
        updatePagination();
    } else {
        showResults();
    }
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

document.addEventListener('DOMContentLoaded', loadNavbar());