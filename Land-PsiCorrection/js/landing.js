/* ═══════════════════════════════════════════════════════════════
   PsiCorrection Landing Page — JavaScript v2.0
   Particles · Typing · Carousel · Calculator · Dark mode
═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Nav scroll effect ───
  const nav = document.getElementById('nav');
  const navProgress = document.getElementById('navProgress');
  const onScroll = () => {
    nav.classList.toggle('nav--scrolled', window.scrollY > 20);
    // Progress bar
    const scrollH = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollH > 0 && navProgress) {
      navProgress.style.width = (window.scrollY / scrollH * 100) + '%';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ─── Active nav link highlight ───
  const navSections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav__links a[href^="#"]');
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navAnchors.forEach(a => {
          a.classList.toggle('nav--active', a.getAttribute('href') === '#' + entry.target.id);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  navSections.forEach(s => sectionObserver.observe(s));

  // ─── Hamburger menu ───
  const hamburger = document.getElementById('navHamburger');
  const navDrawer = document.getElementById('navDrawer');
  const navOverlay = document.getElementById('navOverlay');

  function openMenu() {
    hamburger.classList.add('active');
    if (navDrawer) navDrawer.classList.add('active');
    if (navOverlay) navOverlay.classList.add('active');
    document.body.classList.add('nav-open');
  }

  function closeMenu() {
    hamburger.classList.remove('active');
    if (navDrawer) navDrawer.classList.remove('active');
    if (navOverlay) navOverlay.classList.remove('active');
    document.body.classList.remove('nav-open');
  }

  hamburger.addEventListener('click', () => {
    hamburger.classList.contains('active') ? closeMenu() : openMenu();
  });

  if (navOverlay) navOverlay.addEventListener('click', closeMenu);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  window.addEventListener('resize', () => { if (window.innerWidth > 768) closeMenu(); });

  if (navDrawer) {
    navDrawer.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  }

  // ─── Theme toggle ───
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('psi-theme');
  if (savedTheme) html.setAttribute('data-theme', savedTheme);
  themeToggle.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('psi-theme', next);
  });

  // ─── Cursor glow (desktop only) ───
  const cursorGlow = document.getElementById('cursorGlow');
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && cursorGlow) {
    document.addEventListener('mousemove', (e) => {
      cursorGlow.style.left = e.clientX + 'px';
      cursorGlow.style.top = e.clientY + 'px';
      cursorGlow.classList.add('active');
    });
  }

  // ─── Scroll reveal for [data-aos] ───
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('[data-aos]').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 6) * 80}ms`;
    revealObserver.observe(el);
  });

  // ─── Smooth scroll for anchor links ───
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ─── Typing effect ───
  const typingEl = document.getElementById('typingText');
  if (typingEl) {
    const words = ['NEUPSILIN Adulto', 'WISC-IV', 'BFP', 'NEUPSILIN Infantil'];
    let wordIndex = 0, charIndex = 0, deleting = false;
    const typeSpeed = 80, deleteSpeed = 40, pauseTime = 2000;

    function typeLoop() {
      const current = words[wordIndex];
      if (!deleting) {
        typingEl.textContent = current.substring(0, charIndex + 1);
        charIndex++;
        if (charIndex === current.length) {
          deleting = true;
          setTimeout(typeLoop, pauseTime);
          return;
        }
        setTimeout(typeLoop, typeSpeed);
      } else {
        typingEl.textContent = current.substring(0, charIndex - 1);
        charIndex--;
        if (charIndex === 0) {
          deleting = false;
          wordIndex = (wordIndex + 1) % words.length;
          setTimeout(typeLoop, 300);
          return;
        }
        setTimeout(typeLoop, deleteSpeed);
      }
    }
    typeLoop();
  }

  // ─── Animated counter for stats ───
  const animateCounter = (el, target) => {
    const duration = 2000;
    const start = performance.now();
    const update = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  };

  const statCards = document.querySelectorAll('.stat-card');
  let statsAnimated = false;
  const statsObserver = new IntersectionObserver((entries) => {
    if (statsAnimated) return;
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        statsAnimated = true;
        statCards.forEach(card => {
          const target = parseInt(card.dataset.count, 10);
          const numEl = card.querySelector('.stat-card__number');
          if (numEl && !isNaN(target)) animateCounter(numEl, target);

          // Animate ring
          const ring = card.querySelector('.stat-card__ring-fill');
          const ringData = card.querySelector('.stat-card__ring');
          if (ring && ringData) {
            const pct = parseInt(ringData.dataset.progress, 10) || 100;
            const circumference = 226.2;
            ring.style.strokeDashoffset = circumference - (circumference * pct / 100);
          }
        });
        statsObserver.disconnect();
      }
    });
  }, { threshold: 0.3 });
  statCards.forEach(card => statsObserver.observe(card));

  // ─── Mockup bar animation ───
  const mockupObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Animate bars
        entry.target.querySelectorAll('.mockup-bar-fill[data-width]').forEach((bar, i) => {
          setTimeout(() => {
            bar.style.width = bar.dataset.width + '%';
          }, i * 200);
        });
        // Animate QI counter
        const qiEl = document.getElementById('mockupQI');
        const classEl = document.getElementById('mockupClass');
        if (qiEl && qiEl.textContent === '—') {
          let qiVal = 0;
          const qiTarget = 112;
          const qiInterval = setInterval(() => {
            qiVal += 2;
            if (qiVal >= qiTarget) { qiVal = qiTarget; clearInterval(qiInterval); }
            qiEl.textContent = qiVal;
          }, 20);
          setTimeout(() => { if (classEl) classEl.textContent = 'Média Alta'; }, 1100);
        }
        mockupObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  const mockupCard = document.querySelector('.mockup-card');
  if (mockupCard) mockupObserver.observe(mockupCard);

  // ─── Test filter tabs ───
  const filterBtns = document.querySelectorAll('.tests__filter');
  const testCards = document.querySelectorAll('.test-card');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      testCards.forEach(card => {
        const cat = card.dataset.category;
        if (filter === 'all' || cat === filter || cat === 'all') {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // ─── Economy calculator ───
  const calcTests = document.getElementById('calcTests');
  const calcHour = document.getElementById('calcHour');
  const calcTestsVal = document.getElementById('calcTestsVal');
  const calcHourVal = document.getElementById('calcHourVal');

  function updateCalc() {
    if (!calcTests || !calcHour) return;
    const tests = parseInt(calcTests.value, 10);
    const hourRate = parseInt(calcHour.value, 10);
    if (calcTestsVal) calcTestsVal.textContent = tests;
    if (calcHourVal) calcHourVal.textContent = hourRate;

    const manualHours = tests * 1.5;
    const autoHours = tests * (8 / 60);
    const savedHours = manualHours - autoHours;
    const savedMoney = savedHours * hourRate;

    const monthlyEl = document.getElementById('calcMonthly');
    const yearlyEl = document.getElementById('calcYearly');
    const hoursMonthEl = document.getElementById('calcHoursMonth');
    const hoursYearEl = document.getElementById('calcHoursYear');

    if (monthlyEl) monthlyEl.textContent = 'R$ ' + Math.round(savedMoney).toLocaleString('pt-BR');
    if (yearlyEl) yearlyEl.textContent = 'R$ ' + Math.round(savedMoney * 12).toLocaleString('pt-BR');
    if (hoursMonthEl) hoursMonthEl.textContent = Math.round(savedHours) + 'h';
    if (hoursYearEl) hoursYearEl.textContent = Math.round(savedHours * 12) + 'h';
  }
  if (calcTests) calcTests.addEventListener('input', updateCalc);
  if (calcHour) calcHour.addEventListener('input', updateCalc);
  updateCalc();

  // ─── Testimonials carousel ───
  const track = document.getElementById('testimonialTrack');
  const dotsContainer = document.getElementById('testimDots');
  const prevBtn = document.getElementById('testimPrev');
  const nextBtn = document.getElementById('testimNext');

  if (track && dotsContainer) {
    const cards = track.querySelectorAll('.testimonial-card');
    let currentSlide = 0;
    const totalSlides = cards.length;

    // Create dots
    for (let i = 0; i < totalSlides; i++) {
      const dot = document.createElement('span');
      dot.className = 'testimonials__dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToSlide(i));
      dotsContainer.appendChild(dot);
    }
    const dots = dotsContainer.querySelectorAll('.testimonials__dot');

    function goToSlide(idx) {
      currentSlide = ((idx % totalSlides) + totalSlides) % totalSlides;
      track.style.transform = `translateX(-${currentSlide * (100 + (24 / track.parentElement.offsetWidth * 100))}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
    }

    if (prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

    // Auto-play
    let autoPlay = setInterval(() => goToSlide(currentSlide + 1), 5000);
    track.parentElement.addEventListener('mouseenter', () => clearInterval(autoPlay));
    track.parentElement.addEventListener('mouseleave', () => {
      autoPlay = setInterval(() => goToSlide(currentSlide + 1), 5000);
    });
  }

  // ─── Pricing toggle (monthly/yearly) ───
  const pricingToggle = document.getElementById('pricingToggle');
  if (pricingToggle) {
    pricingToggle.addEventListener('change', () => {
      const isYearly = pricingToggle.checked;
      const key = isYearly ? 'yearly' : 'monthly';
      document.querySelectorAll('[data-monthly][data-yearly]').forEach(el => {
        el.textContent = el.dataset[key];
      });
    });
  }

  // ─── Back to top ───
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 600);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ─── Canvas particles (hero + CTA) ───
  function initParticles(canvasId, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const count = 40;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 1,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.2
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = particles[i].color;
            ctx.globalAlpha = (1 - dist / 120) * 0.15;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }
    draw();
  }

  initParticles('heroParticles', ['#2563eb', '#7c3aed', '#0ea5e9', '#6366f1']);
  initParticles('ctaParticles', ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']);

});
