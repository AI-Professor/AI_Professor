import { loadNavbar, setupNavbarUserState } from "./navbar.js";
import { loadFooter } from "./footer.js";

const ENV = await (await fetch("/api.json")).json();
const localHostName = ENV.LOCAL_HOST_NAME;
const localBackendPort = ENV.LOCAL_BACKEND_PORT;
const localBackendUrl = `http://${localHostName}:${localBackendPort}`;

document.addEventListener('DOMContentLoaded', fetchUserInfo());
document.addEventListener('DOMContentLoaded', loadNavbar());
document.addEventListener('DOMContentLoaded', loadFooter());
window.saveChanges = saveChanges;

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
    
    // Profile Picture Fields
    document.getElementById('profileUserName').innerText = data.user_name;
    document.getElementById('user-email').innerText = data.email;
    
    // Update grid fields
    document.getElementById('userIdText').innerText = data.user_id;
    document.getElementById('firstNameText').innerText = data.first_name;
    document.getElementById('lastNameText').innerText = data.last_name;
    document.getElementById('userNameText').innerText = data.user_name;
    document.getElementById('emailText').innerText = data.email;
    document.getElementById('majorText').innerText = data.major;
    document.getElementById('subscriptionText').innerText = data.subscription_tier;
    document.getElementById('roleText').innerText = data.role;
    document.getElementById('universityText').innerText = data.university_name;

    document.getElementById('firstNameInput').value = data.first_name;
    document.getElementById('lastNameInput').value = data.last_name;
    document.getElementById('userNameInput').value = data.user_name;
    document.getElementById('emailInput').value = data.email;
    document.getElementById('majorInput').value = data.major;
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

async function saveChanges() {
  const token = sessionStorage.getItem('accessToken');
  if (!token) {
    document.getElementById('user-info').textContent = 'No access token found. Please log in.';
    return;
  }

  // Only editable fields are included in the payload; subscription_tier removed.
  const updatedUserInfo = {
    first_name: document.getElementById("firstNameInput").value,
    last_name: document.getElementById("lastNameInput").value,
    user_name: document.getElementById("userNameInput").value,
    email: document.getElementById("emailInput").value,
    major: document.getElementById("majorInput").value,
    university_name: document.getElementById("universityInput").value,
  };

  try {
    const response = await fetch(`${localBackendUrl}/api/user-info`, {
      method: 'PATCH',
      credentials: "include",
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedUserInfo)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    document.getElementById("firstNameText").innerText = data.first_name;
    document.getElementById("lastNameText").innerText = data.last_name;
    document.getElementById("userNameText").innerText = data.user_name;
    document.getElementById("emailText").innerText = data.email;
    document.getElementById("majorText").innerText = data.major;
    document.getElementById("subscriptionText").innerText = data.subscription_tier;
    document.getElementById("universityText").innerText = data.university_name;

    // Update sessionStorage and navbar
    sessionStorage.setItem('username', data.user_name);
    await setupNavbarUserState();

    toggleEdit();
    window.location.reload(); // Add this line to refresh the page
  } catch (error) {
    document.body.innerHTML = '<p>Failed to update user info: ' + error.message + '</p>';
  }
}

function toggleEdit() {
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


