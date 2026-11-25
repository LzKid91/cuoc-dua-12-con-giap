// Starfield / Warp Speed Background for Welcome Screen
// Adapted from Lucian UX/UI Prompt #330

export function initStarfield(containerId = 'welcomeScreen', canvasId = 'starfieldCanvas') {
  const root = document.getElementById(containerId);
  if (!root) return null;

  const cv = document.getElementById(canvasId);
  if (!cv) return null;

  const cx = cv.getContext('2d');
  const mode = root.querySelector('.u330-hud b, .starfield-hud b');
  const spd = root.querySelector('.u330-hud span, .starfield-hud span');
  const wp = root.querySelector('.u330-wp, .starfield-wp');
  const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = root.clientWidth || window.innerWidth;
  let H = root.clientHeight || window.innerHeight;
  let dpr = Math.min(2, window.devicePixelRatio || 1);

  function resize() {
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.scale(dpr, dpr);
  }

  resize();
  window.addEventListener('resize', resize);

  const N = 380;
  const stars = [];
  let v = 0.22;
  let target = 0.22;
  let warp = false;
  let aim = { x: 0, y: 0 };
  let steer = { x: 0, y: 0 };

  function spawn(s, far) {
    s.x = (Math.random() - 0.5) * 2;
    s.y = (Math.random() - 0.5) * 2;
    s.z = far ? 1 : 0.05 + Math.random() * 0.95;
    s.pz = s.z;
    s.c = Math.random();
    return s;
  }

  for (let i = 0; i < N; i++) {
    stars.push(spawn({}, false));
  }

  function hud() {
    if (mode) mode.textContent = warp ? 'Warp' : 'Cruise';
    if (spd) spd.textContent = '×' + (v / 0.22).toFixed(1);
  }

  function draw(dt) {
    cx.fillStyle = warp || v > 0.5 ? 'rgba(2,3,10,.35)' : 'rgba(2,3,10,.9)';
    cx.fillRect(0, 0, W, H);

    const steerLimitX = Math.min(120, W * 0.15);
    const steerLimitY = Math.min(100, H * 0.15);
    const ox = W / 2 + steer.x * steerLimitX;
    const oy = H / 2 + steer.y * steerLimitY;
    const f = Math.max(160, Math.min(W, H) * 0.35);
    const blue = Math.min(1, (v - 0.22) / 1.6);

    cx.lineCap = 'round';
    stars.forEach(function (s) {
      s.pz = s.z;
      s.z -= v * dt;
      if (s.z <= 0.02) {
        spawn(s, true);
        return;
      }
      const x = ox + (s.x / s.z) * f;
      const y = oy + (s.y / s.z) * f;
      const px = ox + (s.x / (s.pz + v * 0.03)) * f;
      const py = oy + (s.y / (s.pz + v * 0.03)) * f;

      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) {
        spawn(s, true);
        return;
      }

      const a = Math.min(1, (1 - s.z) * 1.4);
      const w = Math.max(0.6, (1 - s.z) * 2.6);
      const r = Math.round(255 - blue * 120 * s.c);
      const g = Math.round(255 - blue * 40);
      const b = 255;

      cx.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
      cx.lineWidth = w;
      cx.beginPath();
      cx.moveTo(px, py);
      cx.lineTo(x + 0.01, y);
      cx.stroke();
    });

    if (blue > 0.05) {
      const gl = cx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(W, H) * 0.38);
      gl.addColorStop(0, `rgba(120,190,255,${(0.28 * blue).toFixed(2)})`);
      gl.addColorStop(1, 'rgba(120,190,255,0)');
      cx.fillStyle = gl;
      cx.fillRect(0, 0, W, H);
    }
  }

  let vis = true;
  let raf = 0;
  let last = 0;

  function frame(now) {
    raf = 0;
    if (!root.isConnected || !vis || root.style.display === 'none') return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    v += (target - v) * (1 - Math.pow(warp ? 0.25 : 0.12, dt));
    steer.x += (aim.x - steer.x) * (1 - Math.pow(0.05, dt));
    steer.y += (aim.y - steer.y) * (1 - Math.pow(0.05, dt));
    draw(dt);
    hud();
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (rm) {
      cx.fillStyle = '#02030A';
      cx.fillRect(0, 0, W, H);
      draw(0.016);
      hud();
      return;
    }
    if (!raf && vis && root.style.display !== 'none') {
      resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      vis = entries[0].isIntersecting;
      if (vis) {
        run();
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }).observe(root);
  }

  function setWarp(on) {
    warp = on;
    target = on ? 3.2 : 0.22;
    root.classList.toggle('is-warp', on);
    if (rm) {
      v = target;
      hud();
    }
  }

  const triggerElements = [cv];
  if (wp) triggerElements.push(wp);

  triggerElements.forEach(function (el) {
    el.addEventListener('pointerdown', function (e) {
      setWarp(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch (er) {}
    });
    el.addEventListener('pointerup', function () {
      setWarp(false);
    });
    el.addEventListener('pointercancel', function () {
      setWarp(false);
    });
  });

  if (wp) {
    wp.addEventListener('keydown', function (e) {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        setWarp(true);
      }
    });
    wp.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') setWarp(false);
    });
  }

  root.addEventListener('pointermove', function (e) {
    const r = root.getBoundingClientRect();
    aim = {
      x: ((e.clientX - r.left) / r.width - 0.5) * 2,
      y: ((e.clientY - r.top) / r.height - 0.5) * 2
    };
  });

  root.addEventListener('pointerleave', function () {
    aim = { x: 0, y: 0 };
  });

  cx.fillStyle = '#02030A';
  cx.fillRect(0, 0, W, H);
  hud();
  run();

  return {
    resume: () => {
      vis = true;
      run();
    },
    pause: () => {
      vis = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    setWarp
  };
}
