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

// ── DEMO ANIMATION ───────────────────────────
const demoTypingEl    = document.getElementById('demo-typing');
const demoResultEl    = document.getElementById('demo-result');
const demoShortcut    = document.getElementById('demo-shortcut');
const demoAfter       = document.getElementById('demo-after');
const demoAfterLabel  = document.getElementById('demo-after-label');
const demoBeforeBox   = document.getElementById('demo-before');

const DEMO_BEFORE = 'i rly nned to fnish thsi proejct tody. cna u hlp me wth it plss??';
const DEMO_AFTER  = 'I really need to finish this project today. Can you help me with it, please?';

let demoRunning = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runDemo() {
  if (demoRunning) return;
  demoRunning = true;

  // Reset state
  demoTypingEl.textContent = '';
  demoResultEl.textContent = '';
  demoShortcut.classList.remove('show');
  demoAfter.style.opacity = '0';
  demoAfterLabel.style.opacity = '0';
  demoBeforeBox.classList.remove('active');

  // Type messy text
  for (const char of DEMO_BEFORE) {
    demoTypingEl.textContent += char;
    await sleep(30 + Math.random() * 20);
  }

  await sleep(400);

  // Show shortcut hint
  demoShortcut.classList.add('show');
  await sleep(400);

  // Processing state
  demoBeforeBox.classList.add('active');
  await sleep(400);

  // Show corrected result
  demoAfterLabel.style.opacity = '1';
  demoAfter.style.opacity = '1';

  for (const char of DEMO_AFTER) {
    demoResultEl.textContent += char;
    await sleep(20);
  }

  await sleep(4000);

  demoRunning = false;
  await sleep(800);
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

// ── SUBTLE PARALLAX ON HERO GLOW ─────────────
const heroGlow = document.querySelector('.hero-bg-glow');
if (heroGlow) {
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 40;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    heroGlow.style.transform = `translateX(calc(-50% + ${x}px)) translateY(${y}px)`;
  }, { passive: true });
}
