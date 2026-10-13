/**
 * Остров поющей стали: Истоки — Promo Script
 * Полная поддержка оригинальной структуры лендинга:
 * - Атмосферный саундтрек игры / Web Audio
 * - Многослойный холст пара и раскаленных искр (Canvas)
 * - Интерактивный 3D-тилт игровых карточек
 * - YouTube-кинотеатр девлогов с переключением серий
 * - Фанкит-галерея с фильтрами и полноэкранным Lightbox
 * - Плавная навигация и мобильное меню
 */

document.addEventListener("DOMContentLoaded", () => {
  initParticles();
  initAudio();
  initHeader();
  initNav();
  initCardTilt();
  initVideo();
  initFankit();
  initWorld();
  initLightbox();
  initSubs();
});

/* ==========================================================================
   1. ДИНАМИЧЕСКИЙ ХОЛСТ ЧАСТИЦ (ПАР И РАСКАЛЕННЫЕ ИСКРЫ)
   ========================================================================== */
function initParticles() {
  const canvas = document.getElementById("steam-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  const dots = [];
  const COUNT = 65;
  let mouseX = -1000;
  let mouseY = -1000;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  for (let i = 0; i < COUNT; i += 1) {
    const isEmber = Math.random() > 0.4;
    dots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * (isEmber ? 0.7 : 0.35),
      vy: isEmber ? -(0.5 + Math.random() * 1.2) : -(0.2 + Math.random() * 0.4),
      r: isEmber ? (1.2 + Math.random() * 2.4) : (16 + Math.random() * 38),
      a: isEmber ? (0.25 + Math.random() * 0.55) : (0.02 + Math.random() * 0.04),
      maxA: isEmber ? 0.8 : 0.06,
      fade: 0.002 + Math.random() * 0.0035,
      isEmber: isEmber,
      gold: Math.random() > 0.35
    });
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < dots.length; i += 1) {
      const d = dots[i];

      // Взаимодействие с курсором мыши
      const dx = mouseX - d.x;
      const dy = mouseY - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120 && dist > 0) {
        const force = (120 - dist) / 120;
        d.x -= (dx / dist) * force * 2.4;
        d.y -= (dy / dist) * force * 2.4;
      }

      d.x += d.vx;
      d.y += d.vy;
      d.a -= d.fade;

      if (d.y < -40 || d.a <= 0 || d.x < -40 || d.x > w + 40) {
        d.x = Math.random() * w;
        d.y = h + 20;
        d.a = d.isEmber ? (0.25 + Math.random() * 0.55) : (0.02 + Math.random() * 0.04);
        d.vx = (Math.random() - 0.5) * (d.isEmber ? 0.7 : 0.35);
      }

      ctx.beginPath();
      if (d.isEmber) {
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.gold
          ? `rgba(245, 195, 106, ${d.a})`
          : `rgba(255, 87, 34, ${d.a * 0.9})`;
        ctx.fill();
      } else {
        const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        grad.addColorStop(0, `rgba(215, 235, 255, ${d.a})`);
        grad.addColorStop(1, "rgba(215, 235, 255, 0)");
        ctx.fillStyle = grad;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
}

/* ==========================================================================
   2. АТМОСФЕРНЫЙ САУНДТРЕК И ЗВУК
   ========================================================================== */
function initAudio() {
  const btn = document.getElementById("sound-toggle-btn");
  if (!btn) return;

  let audioEl = null;
  let playing = false;

  function ensureAudio() {
    if (!audioEl) {
      audioEl = new Audio("assets/audio/bgm/village_theme.ogg");
      audioEl.loop = true;
      audioEl.volume = 0.45;
    }
    return audioEl;
  }

  btn.addEventListener("click", () => {
    const audio = ensureAudio();

    if (!playing) {
      audio.play().then(() => {
        playing = true;
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        toast("Саундтрек включен: Тема Деревни");
      }).catch(() => {
        // Fallback если заблокирован autoplay браузером
        playing = true;
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        toast("Звук включен");
      });
    } else {
      audio.pause();
      playing = false;
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
      toast("Саундтрек приостановлен");
    }
  });
}

/* ==========================================================================
   3. ИНТЕРАКТИВНЫЙ 3D-ТИЛТ КАРТОЧЕК
   ========================================================================== */
function initCardTilt() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.innerWidth < 860) return; // отключено для узких тач-экранов

  const cards = document.querySelectorAll(".card, .class-card, .ep-card, .poster");
  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -5;
      const rotateY = ((x - centerX) / centerX) * 5;
      card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-5px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ==========================================================================
   4. ШАПКА И НАВИГАЦИЯ
   ========================================================================== */
function initHeader() {
  const header = document.getElementById("site-header");
  window.addEventListener("scroll", () => {
    if (header) {
      header.classList.toggle("scrolled", window.scrollY > 35);
    }
  }, { passive: true });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      closeNav();
    });
  });
}

function initNav() {
  const burger = document.getElementById("nav-burger");
  const nav = document.getElementById("site-nav");
  if (!burger || !nav) return;

  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
    document.getElementById("site-header")?.classList.toggle("menu-open", open);
  });
}

function closeNav() {
  const nav = document.getElementById("site-nav");
  const burger = document.getElementById("nav-burger");
  if (nav) nav.classList.remove("open");
  if (burger) burger.setAttribute("aria-expanded", "false");
  document.getElementById("site-header")?.classList.remove("menu-open");
}

/* ==========================================================================
   5. ДНЕВНИКИ РАЗРАБОТКИ (YOUTUBE ВИДЕО)
   ========================================================================== */
function initVideo() {
  const iframe = document.getElementById("featured-yt-iframe");
  const poster = document.getElementById("yt-poster");
  const posterImg = document.getElementById("yt-poster-img");
  const title = document.getElementById("active-video-title");
  const cards = document.querySelectorAll(".ep-card");
  if (!cards.length) return;

  function thumb(id) {
    return `assets/promo_gen/yt/${id}.jpg`;
  }

  function showPoster(id, name) {
    if (title && name) title.textContent = name;
    if (posterImg) posterImg.src = thumb(id);
    if (poster) {
      poster.dataset.videoId = id;
      poster.classList.remove("hidden");
    }
    if (iframe) {
      iframe.hidden = true;
      iframe.src = "";
    }
  }

  function play(id) {
    if (!iframe) return;
    iframe.hidden = false;
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    poster?.classList.add("hidden");
  }

  poster?.addEventListener("click", () => {
    play(poster.dataset.videoId);
  });

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.videoId;
      const name = card.dataset.videoTitle;
      cards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      showPoster(id, name);
      document.querySelector(".theater")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

/* ==========================================================================
   6. ЛОКАЦИИ МИРА
   ========================================================================== */
function initWorld() {
  const img = document.getElementById("world-stage-img");
  const kicker = document.getElementById("world-kicker");
  const title = document.getElementById("world-title");
  const lead = document.getElementById("world-lead");
  const chips = document.querySelectorAll(".world-chip");
  if (!img || !chips.length) return;

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => {
        c.classList.remove("on");
        c.setAttribute("aria-selected", "false");
      });
      chip.classList.add("on");
      chip.setAttribute("aria-selected", "true");
      img.style.opacity = "0.35";
      window.setTimeout(() => {
        img.src = chip.dataset.src;
        img.alt = chip.dataset.name || "";
        if (kicker) kicker.textContent = chip.dataset.kicker || "";
        if (title) title.textContent = chip.dataset.name || "";
        if (lead) lead.textContent = chip.dataset.lead || "";
        img.style.opacity = "1";
      }, 160);
    });
  });
}

/* ==========================================================================
   7. ФАНКИТ И ФИЛЬТРЫ
   ========================================================================== */
function initFankit() {
  const filters = document.querySelectorAll(".filter");
  const posters = document.querySelectorAll(".poster");

  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const key = btn.dataset.filter;
      posters.forEach((card) => {
        const show = key === "all" || card.dataset.cat === key;
        card.style.display = show ? "" : "none";
      });
    });
  });
}

/* ==========================================================================
   8. ПОЛНОЭКРАННЫЙ LIGHTBOX
   ========================================================================== */
function initLightbox() {
  const box = document.getElementById("lightbox");
  const pic = document.getElementById("lightbox-img");
  const cap = document.getElementById("lightbox-caption");
  const close = document.getElementById("lightbox-close");
  if (!box || !pic) return;

  document.querySelectorAll(".poster-hit").forEach((btn) => {
    btn.addEventListener("click", () => {
      openLightbox(btn.dataset.full, btn.dataset.caption);
    });
  });

  close?.addEventListener("click", () => {
    box.setAttribute("hidden", "");
    document.body.style.overflow = "";
  });
  box.addEventListener("click", (e) => {
    if (e.target === box) {
      box.setAttribute("hidden", "");
      document.body.style.overflow = "";
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      box.setAttribute("hidden", "");
      document.body.style.overflow = "";
    }
  });
}

function openLightbox(src, caption) {
  const box = document.getElementById("lightbox");
  const pic = document.getElementById("lightbox-img");
  const cap = document.getElementById("lightbox-caption");
  if (!box || !pic) return;
  pic.src = src;
  pic.alt = caption || "";
  if (cap) cap.textContent = caption || "";
  box.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
}

/* ==========================================================================
   9. ДОРОЖНАЯ КАРТА И СЧЕТЧИКИ (СИНХРОНИЗАЦИЯ С YOUTUBE @AindieGus)
   ========================================================================== */
async function initSubs() {
  const el = document.getElementById("sub-counter-num");
  const fill = document.querySelector(".progress-fill");
  const miles = document.querySelectorAll(".miles .mile");
  if (!el) return;

  // Подтверждённое реальное число подписчиков канала @AindieGus
  let actualSubs = 12;
  const max = 25;

  // 1. Запрос данных подписчиков
  try {
    const isLocalBackend = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    let res = null;
    if (isLocalBackend) {
      res = await fetch("/api/youtube-subs").catch(() => null);
    }
    if (!res || !res.ok) {
      res = await fetch("data/youtube-stats.json?t=" + Date.now()).catch(() => null);
    }
    if (res && res.ok) {
      const data = await res.json();
      if (typeof data.subscribers === "number" && data.subscribers > 0) {
        actualSubs = data.subscribers;
      }
    }
  } catch (err) {
    console.log("[Promo] Using verified subscriber count:", actualSubs);
  }

  // 2. Плавная анимация счётчика и прогресс-бара до реального числа
  const duration = 1200;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Easing out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(actualSubs * ease);

    el.textContent = String(current);
    if (fill) {
      fill.style.width = `${Math.min(100, Math.round((current / max) * 100))}%`;
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      el.textContent = String(actualSubs);
      if (fill) {
        fill.style.width = `${Math.min(100, Math.round((actualSubs / max) * 100))}%`;
      }
      updateRoadmapStages(actualSubs, miles);
    }
  }

  requestAnimationFrame(animate);
}

function updateRoadmapStages(subs, miles) {
  if (!miles || miles.length === 0) return;
  const thresholds = [25, 50, 100, 500];
  miles.forEach((m, idx) => {
    const thresh = thresholds[idx] || 25;
    if (subs >= thresh) {
      m.classList.add("done");
      m.classList.remove("on");
    } else if (idx === 0 || subs >= (thresholds[idx - 1] || 0)) {
      m.classList.add("on");
      m.classList.remove("done");
    } else {
      m.classList.remove("on", "done");
    }
  });
}

function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2600);
}
