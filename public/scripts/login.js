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

const loginButton = document.getElementById('login-button');
loginButton.onclick = async () => {
    loginButton.disabled = true;

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const captchaText = document.getElementById('captcha-input').value;
    const captchaId = document.getElementById('captcha-id').value;

    if (!email || !password || !captchaText) {
      alert('Please fill in all fields.');
      loginButton.disabled = false;
      return;
    }

    try {
      // Use URLSearchParams to include captcha fields
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
      form.append("captcha_id", captchaId);
      form.append("captcha_text", captchaText);

      const response = await fetch(`${localBackendUrl}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });

      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.detail);
      }

      const data = await response.json();

      sessionStorage.setItem('accessToken', data.access_token);
      console.log('Access Token:', data.access_token);

      setupTokenRefresh(localBackendUrl);
      
      const userResponse = await fetch(`${localBackendUrl}/api/user-info`, {
        method: 'GET',
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
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
      
      window.location.href = "/";
    } catch (error) {
      sessionStorage.removeItem('accessToken');
      alert(`Login failed: ${error.message}`);
      loginButton.disabled = false;
      await refreshCaptcha(); // Refresh captcha on error
    }
};
