import { loadNavbar } from "./navbar.js";

const ENV = await (await fetch("/api.json")).json();
const localHostName = ENV.LOCAL_HOST_NAME
const localBackendPort = ENV.LOCAL_BACKEND_PORT
const localBackendUrl = `http://${localHostName}:${localBackendPort}`

async function fetchUserInfo() {
  const token = sessionStorage.getItem('accessToken'); // Retrieve token from localStorage
    if (!token) {
      document.getElementById('user-info').textContent = 'No access token found. Please log in.';
      return;
    }
    try {
      const response = await fetch(`${localBackendUrl}/api/user-info`, {
        method: 'GET',
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      document.getElementById('username').innerText = data.user_name;
      document.getElementById('user-email').innerText = data.email;
      document.getElementById('userIdText').innerText = data.user_id;
      document.getElementById('majorText').innerText = data.major;
      document.getElementById('emailText').innerText = data.email;
      document.getElementById('subscriptionText').innerText = data.subscription_tier;
      document.getElementById('roleText').innerText = data.role;
      document.getElementById('universityText').innerText = data.university_name;

      document.getElementById('userIdInput').value = data.user_id;
      document.getElementById('majorInput').value = data.major;
      document.getElementById('emailInput').value = data.email;
      document.getElementById('subscriptionInput').value = data.subscription_tier;
      document.getElementById('roleInput').value = data.role;
      document.getElementById('universityInput').value = data.university_name;

    } catch (error) {
      if (error.message.includes('401')) {
        window.location.href = '/login.html'; // Redirect to login page if unauthorized
      } else {
        document.body.innerHTML = '<p>Failed to fetch user info: ' + error.message + '</p>';
      }
    }
  }

const editButton = document.getElementById('edit-btn');
editButton.onclick = () => {
  let textElements = document.querySelectorAll('.info-box');
  let inputElements = document.querySelectorAll('.info-grid input');
  let editButton = document.getElementById('edit-btn');
  let saveButton = document.getElementById('save-btn');

  textElements.forEach(el => el.classList.toggle('hidden'));
  inputElements.forEach(el => el.classList.toggle('hidden'));

  if (editButton.innerText === "Edit") {
    editButton.innerText = "Cancel";
    saveButton.style.display = "block";
  } else {
    editButton.innerText = "Edit";
    saveButton.style.display = "none";
  }
}

function saveChanges() {
  document.getElementById("majorText").innerText = document.getElementById("majorInput").value;
  document.getElementById("emailText").innerText = document.getElementById("emailInput").value;
  document.getElementById("subscriptionText").innerText = document.getElementById("subscriptionInput").value;
  document.getElementById("roleText").innerText = document.getElementById("roleInput").value;
  document.getElementById("universityText").innerText = document.getElementById("universityInput").value;

  toggleEdit();
}

document.addEventListener('DOMContentLoaded', fetchUserInfo());
document.addEventListener('DOMContentLoaded', loadNavbar());