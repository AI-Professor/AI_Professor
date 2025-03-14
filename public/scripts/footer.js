export async function loadFooter() {
    const container = document.getElementById('footer-container');
    const response = await fetch('/public/footer.html');
    const footerHTML = await response.text();
    container.innerHTML = footerHTML;
  }