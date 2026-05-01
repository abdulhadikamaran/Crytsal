/* ============================================
   CRYSTAL AI LANDING — SCRIPT
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

// Editorial Demo Text
const DEMO_BEFORE = 'the system architecture are highly scalable but it have a few bottleneck that needs resolving.';
const DEMO_AFTER  = 'The system architecture is highly scalable, but it has a few bottlenecks that need resolving.';

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
    await sleep(20 + Math.random() * 15);
  }

  await sleep(400);

  // Show shortcut hint
  demoShortcut.classList.add('show');
  await sleep(300);

  // Processing state
  demoBeforeBox.classList.add('active');
  await sleep(500);

  // Show corrected result
  demoAfterLabel.style.opacity = '1';
  demoAfter.style.opacity = '1';

  for (const char of DEMO_AFTER) {
    demoResultEl.textContent += char;
    await sleep(15);
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

// ── SUBTLE PARALLAX ON HERO VOID ─────────────
const heroVoid = document.querySelector('.hero-void');
if (heroVoid) {
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 30;
    const y = (e.clientY / window.innerHeight - 0.5) * 15;
    heroVoid.style.transform = `translateX(${x}px) translateY(${y}px)`;
  }, { passive: true });
}
