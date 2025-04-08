export async function loadNavbar() {
  const container = document.getElementById('navbar-container');
  const response = await fetch('/public/navbar.html');
  const navbarHTML = await response.text();
  container.innerHTML = navbarHTML;

  setupNavbarUserState(); // Automatically setup user state after navbar is loaded
  setupLogoutHandler(); // Add logout handler
}
  
export async function setupNavbarUserState() {
  const accessToken = sessionStorage.getItem('accessToken');
  const navRight = document.getElementById('nav-right');
  const logoutBtn = document.getElementById('btn-logout');

  if (accessToken) {
    let username = sessionStorage.getItem('username');

    // Clean up old auth buttons
    navRight.querySelectorAll('.nav-auth').forEach(el => el.remove());

    // Add username display
    const userGreeting = document.createElement('span');
    userGreeting.textContent = `Hi, ${username || 'User'}`;
    userGreeting.classList.add('nav-username');
    navRight.appendChild(userGreeting);
    
    // Show logout button
    if (logoutBtn) {
      logoutBtn.classList.remove('hidden');
    }
  } else {
    // Hide logout button when not logged in
    if (logoutBtn) {
      logoutBtn.classList.add('hidden');
    }
    
    // Remove any existing username display
    const usernameDisplay = navRight.querySelector('.nav-username');
    if (usernameDisplay) {
      usernameDisplay.remove();
    }
    
    // Ensure auth buttons are present
    const hasSignIn = navRight.querySelector('.btn-signin');
    const hasSignUp = navRight.querySelector('.btn-signup');
    
    if (!hasSignIn) {
      const signInLink = document.createElement('a');
      signInLink.href = '/login.html';
      signInLink.className = 'btn-signin nav-auth';
      signInLink.textContent = 'Sign In';
      navRight.appendChild(signInLink);
    }
    
    if (!hasSignUp) {
      const signUpLink = document.createElement('a');
      signUpLink.href = '/signup.html';
      signUpLink.className = 'btn-signup nav-auth';
      signUpLink.textContent = 'Sign Up';
      navRight.appendChild(signUpLink);
    }
  }
}

// Function to handle logout
function setupLogoutHandler() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Clear session storage
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('username');
      sessionStorage.removeItem('aiProfessorSession');
      
      // Update UI to reflect logged out state
      setupNavbarUserState();
      
      // Display logout success message
      alert('You have been successfully logged out.');
      
      // Redirect to home page
      window.location.href = '/';
    });
  }
}