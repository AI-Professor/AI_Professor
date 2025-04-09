import { loadNavbar, setupNavbarUserState } from "./navbar.js";
import { loadCaptcha } from "./captcha.js";
import { loadFooter } from "./footer.js";
import { setupTokenRefresh } from './token-utils.js';

const ENV = await (await fetch("/api.json")).json();
const externalIp = ENV.EXTERNAL_IP
const backendPort = ENV.BACKEND_PORT
const localBackendUrl = `http://${externalIp}:${backendPort}`

document.addEventListener('DOMContentLoaded', loadNavbar());
document.addEventListener('DOMContentLoaded', loadFooter());

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
        alert('Please fill in all fields.');
        registerButton.disabled = false;
        return;
    }

    if (password != confirmPassword) {
        alert('Passwards do not match. Please reenter password.');
        registerButton.disabled = false;
        return;
    }

    try {
      const formData = new FormData();
      formData.append('first_name', firstname);
      formData.append('last_name', lastname);
      formData.append('user_name', username);
      formData.append('university_name', university);
      formData.append('email', email);
      formData.append('password', password);
      formData.append('captcha_id', captchaId);
      formData.append('captcha_text', captchaText);

      const response = await fetch(`${localBackendUrl}/api/register`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.detail);
      }

      const data = await response.json();

      const loginResponse = await fetch(`${localBackendUrl}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ username: email, password, captcha_id: captchaId, captcha_text: captchaText }),
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.json();
        throw new Error(errorText.detail);
      }

        const loginData = await loginResponse.json();

        sessionStorage.setItem('accessToken', loginData.access_token); // Store token in localStorage
        console.log('Access Token:', loginData.access_token);

        setupTokenRefresh(localBackendUrl);
        
        const userResponse = await fetch(`${localBackendUrl}/api/user-info`, {
          method: 'GET',
          credentials: "include",
          headers: {
            'Authorization': `Bearer ${loginData.access_token}`,
          },
        });

        if (!userResponse.ok) {
          const errorText = await userResponse.json();
          throw new Error(errorText.detail);
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
        alert(error.message);
        registerButton.disabled = false;
        await refreshCaptcha(); // Refresh captcha on error
      }
};
