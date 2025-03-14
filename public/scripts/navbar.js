export async function loadNavbar() {
    const container = document.getElementById('navbar-container');
    const response = await fetch('/public/navbar.html');
    const navbarHTML = await response.text();
    container.innerHTML = navbarHTML;
  
    setupNavbarUserState(); // Automatically setup user state after navbar is loaded
  }
  
export async function setupNavbarUserState() {
  const accessToken = sessionStorage.getItem('accessToken');
  const navRight = document.getElementById('nav-right');

  if (accessToken) {
    let username = sessionStorage.getItem('username');

    // Clean up old auth buttons
    navRight.querySelectorAll('.nav-auth').forEach(el => el.remove());

    // Add username display
    const userGreeting = document.createElement('span');
    userGreeting.textContent = `Hi, ${username || 'User'}`;
    userGreeting.classList.add('nav-username');
    navRight.appendChild(userGreeting);
  }
}