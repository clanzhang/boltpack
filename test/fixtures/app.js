console.log('Hello from app.js!');

document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  const greeting = document.createElement('div');
  greeting.textContent = 'Built with my-build!';
  greeting.style.marginTop = '20px';
  greeting.style.color = 'white';
  greeting.style.fontSize = '1.5rem';
  container.appendChild(greeting);
});