import { loadNavbar, setupNavbarUserState} from "./navbar.js";

const ENV = await (await fetch("/api.json")).json();
const localHostName = ENV.LOCAL_HOST_NAME
const localBackendPort = ENV.LOCAL_BACKEND_PORT
const localBackendUrl = `http://${localHostName}:${localBackendPort}`

const loginButton = document.getElementById('login-button');
loginButton.onclick = async () => {
    loginButton.disabled = true;

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      document.getElementById('login-message').textContent = 'Please fill in all fields.';
      return;
    }

    try {
      const response = await fetch(`${localBackendUrl}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ username: email, password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      sessionStorage.setItem('accessToken', data.access_token); // Store token in localStorage
      document.getElementById('login-message').textContent = 'Login successful!';
      console.log('Access Token:', data.access_token);
      
      const userResponse = await fetch(`${localBackendUrl}/api/user-info`, {
        method: 'GET',
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const userdata = await userResponse.json();
      console.log(userdata.user_name);
      console.log(userdata.email);

      sessionStorage.setItem('username', userdata.user_name);

      setTimeout(() => {
        if (sessionStorage.getItem('username')) {
          setupNavbarUserState();
        }
      }, 500);
      
      window.location.href = "/";
    } catch (error) {
      // Clear the access token from localStorage if login fails
      sessionStorage.removeItem('accessToken');
      document.getElementById('login-message').textContent = 'Login failed: ' + error.message;
      loginButton.disabled = false;
    }
  };

document.addEventListener('DOMContentLoaded', loadNavbar());