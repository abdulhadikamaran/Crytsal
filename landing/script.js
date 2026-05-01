/* ============================================
   CRYSTAL AI LANDING — SCRIPT (VOLT THEME)
   ============================================ */

const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

const aosElements = document.querySelectorAll('[data-aos]');
const aosObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const siblings = [...entry.target.parentElement.querySelectorAll('[data-aos]')];
      const index = siblings.indexOf(entry.target);
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, index * 120);
      aosObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

aosElements.forEach(el => aosObserver.observe(el));

// ── DEMO ANIMATION (CHATGPT MOCKUP) ──────────
const demoTypingEl    = document.getElementById('demo-typing');
const demoCursor      = document.getElementById('demo-cursor');
const demoPlaceholder = document.getElementById('demo-placeholder');
const chatInputBox    = document.getElementById('demo-before');
const btnSend         = document.querySelector('.chat-btn-send');

const demoShortcutA   = document.getElementById('demo-shortcut-a');
const demoShortcutQ   = document.getElementById('demo-shortcut-q');

const DEMO_BEFORE = 'write me a email to my boss askign for a vaction next fridy pls.';
const DEMO_AFTER  = 'Write me an email to my boss asking for a vacation next Friday, please.';

let demoRunning = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runDemo() {
  if (demoRunning) return;
  demoRunning = true;

  // Reset to initial state
  demoTypingEl.textContent = '';
  demoPlaceholder.style.opacity = '1';
  btnSend.classList.remove('ready');
  chatInputBox.classList.remove('active');
  
  demoShortcutA.classList.remove('show');
  demoShortcutA.style.display = 'inline-flex';
  
  demoShortcutQ.classList.remove('show');
  demoShortcutQ.style.display = 'none';

  demoCursor.classList.add('show');
  
  await sleep(1000);

  // Type messy text
  demoPlaceholder.style.opacity = '0'; // Hide placeholder immediately
  btnSend.classList.add('ready');

  for (const char of DEMO_BEFORE) {
    demoTypingEl.textContent += char;
    await sleep(30 + Math.random() * 20);
  }

  await sleep(600);

  // Show shortcut hint Shift+A
  demoShortcutA.classList.add('show');
  await sleep(800);

  // Processing state (glow)
  chatInputBox.classList.add('active');
  demoCursor.classList.remove('show'); // Hide cursor while fixing
  await sleep(400);

  // Instant Replacement
  demoTypingEl.textContent = DEMO_AFTER;
  demoTypingEl.classList.add('refined-text');
  
  await sleep(2000); // Let user read it

  // Transition to Undo
  demoShortcutA.classList.remove('show');
  await sleep(300);
  demoShortcutA.style.display = 'none';
  
  demoShortcutQ.style.display = 'inline-flex';
  void demoShortcutQ.offsetWidth; 
  demoShortcutQ.classList.add('show');

  await sleep(1500);

  // Execute Undo
  demoTypingEl.textContent = DEMO_BEFORE;
  demoTypingEl.classList.remove('refined-text');
  chatInputBox.classList.remove('active');
  demoShortcutQ.classList.remove('show');
  demoCursor.classList.add('show');

  await sleep(1500);

  // Reset loop
  demoPlaceholder.style.opacity = '1';
  demoTypingEl.textContent = '';
  btnSend.classList.remove('ready');

  demoRunning = false;
  await sleep(1000);
  runDemo();
}

const heroObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    runDemo();
    heroObserver.disconnect();
  }
}, { threshold: 0.25 });

const heroSection = document.getElementById('hero');
if (heroSection) heroObserver.observe(heroSection);

// ── SMOOTH SCROLL ─────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── SUBTLE PARALLAX ON HERO GLOW ─────────────
const heroGlow = document.querySelector('.hero-bg-glow');
if (heroGlow) {
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 40;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    heroGlow.style.transform = `translateX(calc(-50% + ${x}px)) translateY(${y}px)`;
  }, { passive: true });
}
