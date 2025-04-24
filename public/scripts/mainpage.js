const sections = document.querySelectorAll('section');
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    } else {
      entry.target.classList.remove('visible');
    }
  });
}, { threshold: 0.3 });

sections.forEach(section => observer.observe(section));

document.querySelector('.start-button').addEventListener('click', function () {
  if (sessionStorage.getItem('accessToken')) {
    window.location.href = "service.html"; 
  } else {
    window.location.href = "login.html";
  }
});

document.getElementById('hero-start-btn').addEventListener('click', function () {
  if (sessionStorage.getItem('accessToken')) {
    window.location.href = "service.html";
  } else {
    window.location.href = "login.html";
  }
});
