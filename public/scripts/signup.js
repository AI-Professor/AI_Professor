import { loadNavbar, setupNavbarUserState } from "./navbar.js";
import { loadCaptcha } from "./captcha.js";

const ENV = await (await fetch("/api.json")).json();
const localHostName = ENV.LOCAL_HOST_NAME;
const localBackendPort = ENV.LOCAL_BACKEND_PORT;
const localBackendUrl = `http://${localHostName}:${localBackendPort}`;

async function refreshCaptcha() {
    const data = await loadCaptcha(localBackendUrl);
    if (data) {
        document.getElementById('captcha-image').src = `data:image/png;base64,${data.captcha_image}`;
        document.getElementById('captcha-id').value = data.captcha_id;
    }
}

// Change: attach refresh event to captcha image instead of refresh button
document.getElementById('captcha-image').onclick = refreshCaptcha;
await refreshCaptcha();

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
    const captchaText = document.getElementById('captcha-input').value;
    const captchaId = document.getElementById('captcha-id').value;

    if (!firstname || !lastname || !username || !university || !confirmPassword || !email || !password || !captchaText) {
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
          password: password,
          captcha_id: captchaId,
          captcha_text: captchaText
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      document.getElementById('register-message').textContent = 'Registration successful!';

      const loginResponse = await fetch(`${localBackendUrl}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ username: email, password, captcha_id: captchaId, captcha_text: captchaText }),
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`API Error ${loginResponse.status}: ${errorText}`);
      }

        const loginData = await loginResponse.json();

        sessionStorage.setItem('accessToken', loginData.access_token); // Store token in localStorage
        console.log('Access Token:', loginData.access_token);
        
        const userResponse = await fetch(`${localBackendUrl}/api/user-info`, {
          method: 'GET',
          credentials: "include",
          headers: {
            'Authorization': `Bearer ${loginData.access_token}`,
          },
        });

        if (!userResponse.ok) {
          const errorText = await userResponse.text();
          throw new Error(`API Error ${userResponse.status}: ${errorText}`);
        }

        const userdata = await userResponse.json();

        sessionStorage.setItem('username', userdata.user_name);

        setTimeout(() => {
          if (sessionStorage.getItem('username')) {
            setupNavbarUserState();
          }
        }, 500);

        window.location.href = "/my-account.html";
      } catch (error) {
        sessionStorage.removeItem('accessToken');
        document.getElementById('register-message').textContent = 'Registration failed: ' + error.message;
        registerButton.disabled = false;
        await refreshCaptcha(); // Refresh captcha on error
      }
};

document.addEventListener('DOMContentLoaded', loadNavbar());