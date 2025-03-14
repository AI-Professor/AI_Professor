import { loadNavbar, setupNavbarUserState } from "./navbar.js";

const ENV = await (await fetch("/api.json")).json();
const localHostName = ENV.LOCAL_HOST_NAME
const localBackendPort = ENV.LOCAL_BACKEND_PORT
const localBackendUrl = `http://${localHostName}:${localBackendPort}`

const registerButton = document.getElementById('register-button');
registerButton.onclick = async () => {
    registerButton.disabled = true;

    const firstname = document.getElementById('firstname').value;
    const lastname = document.getElementById('lastname').value;
    const username = document.getElementById('username').value;
    const university = document.getElementById('university').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;

    if (!firstname || !lastname || !username || !university || !confirmPassword || !email || !password) {
        document.getElementById('register-message').textContent = 'Please fill in all fields.';
        return;
      }

    if (password != confirmPassword) {
        document.getElementById('register-message').textContent = 'Passwards do not match. Please reenter password.';
        return;
    }

    try {
        const response = await fetch(`${localBackendUrl}/api/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            first_name: firstname,
            last_name: lastname,
            user_name: username,
            university_name: university,
            email: email, 
            password: password }),
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }
  
        const data = await response.json();
        document.getElementById('register-message').textContent = 'Registration successful!';

        sessionStorage.setItem('accessToken', data.access_token); 
        console.log('Access Token:', data.access_token);

        sessionStorage.setItem('username', username);

        await setupNavbarUserState();

        window.location.href = "/my-account.html";
      } catch (error) {
        sessionStorage.removeItem('accessToken');
        document.getElementById('register-message').textContent = 'Registration failed: ' + error.message;
        registerButton.disabled = false;
      }
};

document.addEventListener('DOMContentLoaded', loadNavbar());