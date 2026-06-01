/* =====================================================================
   SENTIMINT — animation & interaction layer
   - GSAP + ScrollTrigger for entrance reveals
   - Vanilla listeners for hero parallax + magnetic CTAs
   - All motion is gated behind prefers-reduced-motion
===================================================================== */

(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = typeof window.gsap !== 'undefined';

  if (hasGSAP && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  // ===================================================================
  // 1. Hero word-reveal (60ms stagger)
  // ===================================================================
  const splitHeroTitle = () => {
    const el = document.querySelector('[data-word-reveal]');
    if (!el) return [];

    // Preserve <br> by splitting per text-node
    const fragments = [];
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const words = node.textContent.split(/\s+/).filter(Boolean);
        words.forEach((w) => fragments.push({ type: 'word', value: w }));
      } else if (node.nodeName === 'BR') {
        fragments.push({ type: 'br' });
      }
    });

    el.innerHTML = '';
    const wordEls = [];
    fragments.forEach((f, i) => {
      if (f.type === 'br') {
        el.appendChild(document.createElement('br'));
      } else {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = f.value;
        el.appendChild(span);
        wordEls.push(span);
        // hair space between words (kept outside the span so transforms only move the word)
        const next = fragments[i + 1];
        if (next && next.type === 'word') {
          el.appendChild(document.createTextNode(' '));
        }
      }
    });
    return wordEls;
  };

  const animateHero = (words) => {
    if (!hasGSAP || prefersReducedMotion || !words.length) {
      words.forEach((w) => { w.style.opacity = 1; w.style.transform = 'none'; });
      return;
    }
    gsap.to(words, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.06,        // 60ms per word, per spec
      delay: 0.15,
    });
  };

  // ===================================================================
  // 2. WebGL hero scene (Phase 4 / Step 07 — 3D Models)
  //
  // Three.js + GLTFLoader render sentimint-box.glb inside <canvas id="hero-canvas">.
  // - Scene: transparent background so the page's ambient haze bleeds through.
  // - Camera: PerspectiveCamera centered dead-on at the asset.
  // - Lights: candlelight mood (ambient fill + amber key + golden glow).
  // - Interaction: mouse-tracked lerp rotation for luxury inertia.
  // - Fallbacks: WebGL failure or GLB load error flips to the CSS placeholder
  //   under `.hero__stage-inner.is-fallback`.
  // ===================================================================
  const initHero3D = () => {
    const canvas = document.getElementById('hero-canvas');
    const stageInner = document.querySelector('[data-parallax-inner]');
    if (!canvas || !stageInner) return;

    // ---- Graceful WebGL detection -------------------------------------
    const hasWebGL = (() => {
      try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
          (c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch (_) { return false; }
    })();
    if (!window.THREE || !hasWebGL) {
      stageInner.classList.add('is-fallback');
      return;
    }

    // ---- Scene / camera / renderer ------------------------------------
    const scene = new THREE.Scene();           // transparent (no .background)

    const rect = canvas.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(
      35,
      Math.max(rect.width, 1) / Math.max(rect.height, 1),
      0.1,
      100,
    );
    // Camera pulled further back so the model's bounding sphere never
    // clips the canvas frustum even at full 360° rotation.
    camera.position.set(0, 0, 7.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(rect.width, rect.height, false);
    if ('outputEncoding' in renderer) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    // ---- Candlelight rig (amplified exposure) -------------------------
    // Lifted to 1.2 so dark metal facets stop crushing to pure black.
    const ambient = new THREE.AmbientLight(0xFFFFFF, 1.2);
    scene.add(ambient);

    // Warm amber key — pushed forward (+z) so the front faces of the
    // box catch the highlight, not just the side. Intensity 4.0.
    const keyLight = new THREE.DirectionalLight(0xD1BBA3, 4.0);
    keyLight.position.set(-2, 4, 5);
    scene.add(keyLight);

    // Golden point light inside the box — emits a stark candle glow,
    // intensity 5.0 so it reads even on dark materials.
    const innerGlow = new THREE.PointLight(0xFFD19A, 5.0, 10, 2);
    innerGlow.position.set(0, -0.2, 0);
    scene.add(innerGlow);

    // ---- GLTF load (with diagnostic telemetry) ------------------------
    let model = null;
    let introActive = false;       // true while the intro sweep is running

    // Base "showcase" pose — near top-down diamond view so the box
    // opening faces the camera and the coins inside are fully visible.
    //   X = +1.4      → tilt the box's TOP toward the camera (~80°),
    //                   so we look down INTO the open box (not the bottom)
    //   Y =  0        → no horizontal twist
    //   Z =  π/4      → 45° camera-axis rotation → diamond silhouette
    const BASE_ROT_X =  1.4;
    const BASE_ROT_Y =  0;
    const BASE_ROT_Z =  Math.PI / 4;

    const loader = new THREE.GLTFLoader();
    loader.load(
      'sentimint-box.glb',
      (gltf) => {
        model = gltf.scene;

        // Center the model on the origin, then scale-fit to ~viewport height.
        // fitScale 4.8 + camera z=7.5: model fills the (enlarged) canvas
        // comfortably while still keeping headroom for cursor-tracked
        // rotation without aggressive clipping at the edges.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fitScale = 4.8 / maxDim;
        model.scale.setScalar(fitScale);
        model.position.x = -center.x * fitScale;
        model.position.y = -center.y * fitScale;
        model.position.z = -center.z * fitScale;

        // Apply showcase pose so contents are visible immediately.
        model.rotation.x = BASE_ROT_X;
        model.rotation.y = BASE_ROT_Y;
        model.rotation.z = BASE_ROT_Z;

        scene.add(model);

        // ---- Intro reveal sweep ----
        // Auto-rotates the box FROM a side-on starting angle INTO the
        // top-down diamond pose, giving viewers a quick preview of the
        // 3D and landing on the coin-visible view.
        if (window.gsap && !prefersReducedMotion) {
          // Start position — face-on, slight forward tilt, no diamond.
          // X is positive (matches BASE_ROT_X sign) so the box swings
          // forward into the top-down pose, not flipping through the bottom.
          introActive = true;
          target.x =  0.2;
          target.y = -0.9;
          model.rotation.x =  0.2;
          model.rotation.y = -0.9;
          model.rotation.z =  0;

          // Animate the Z rotation on the model directly (Z isn't part
          // of mouse-follow — it stays locked at the diamond angle).
          gsap.to(model.rotation, {
            z: BASE_ROT_Z,
            duration: 2.6,
            ease: 'power3.out',
          });
          // Animate X/Y via the target so the render-loop lerp picks it
          // up. introActive freezes cursor-follow until the sweep ends
          // so the mouse can't fight the tween.
          gsap.to(target, {
            x: BASE_ROT_X,
            y: BASE_ROT_Y,
            duration: 2.6,
            ease: 'power3.out',
            onComplete: () => { introActive = false; },
          });
        }

        console.log('[Sentimint 3D Engine] GLB successfully parsed and added to scene.');
      },
      undefined,
      (err) => {
        console.error('[Sentimint 3D Engine] Severe loading error:', err);
        stageInner.classList.add('is-fallback');
      },
    );

    // ---- Mouse-follow rotation ----------------------------------------
    // The cursor's normalized position drives the model's target rotation
    // around the BASE showcase pose. Range is wide (~±144° on Y, ~±57°
    // on X) so the user can preview most angles just by moving the mouse.
    const mouse  = { x: 0, y: 0 };
    const target = { x: BASE_ROT_X, y: BASE_ROT_Y };
    const ROT_RANGE_Y = 2.5;         // ~143° each way
    const ROT_RANGE_X = 1.0;         // ~57° each way

    if (!prefersReducedMotion) {
      window.addEventListener('mousemove', (e) => {
        // Normalize cursor to [-1, 1] across viewport
        mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
        mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });
    }

    // ---- Resize handling (debounced via rAF) ---------------------------
    // BUG FIX: on first boot, getBoundingClientRect() can return 0×0 if
    // the canvas hasn't been measured yet (CSS / fonts still loading).
    // We now (a) call handleResize() immediately to prime the projection,
    // and (b) attach a ResizeObserver to the parent [data-parallax-inner]
    // so any subsequent layout expansion re-syncs the canvas dimensions.
    let resizeRAF = null;
    const handleResize = () => {
      if (resizeRAF) cancelAnimationFrame(resizeRAF);
      resizeRAF = requestAnimationFrame(() => {
        const r = canvas.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        camera.aspect = r.width / r.height;
        camera.updateProjectionMatrix();
        renderer.setSize(r.width, r.height, false);
      });
    };
    window.addEventListener('resize', handleResize);

    // Prime the projection matrix on boot (fixes the empty-canvas bug)
    handleResize();

    // Continuously track the parent wrapper so late layout shifts
    // (font swaps, late CSS) also re-fit the canvas.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(handleResize);
      ro.observe(stageInner);
    }

    // ---- Render loop ---------------------------------------------------
    const LERP = 0.06;        // 0..1 — lower = heavier inertia
    const tick = () => {
      requestAnimationFrame(tick);

      if (model) {
        if (prefersReducedMotion) {
          // Frozen at the showcase pose — no cursor influence.
          model.rotation.x = BASE_ROT_X;
          model.rotation.y = BASE_ROT_Y;
        } else if (!introActive) {
          // Cursor position → target rotation, biased around BASE pose
          // so the box rests at the showcase angle when the cursor is
          // centered, and rotates wide when the cursor moves edge-ward.
          target.y = BASE_ROT_Y + mouse.x * ROT_RANGE_Y;
          target.x = BASE_ROT_X + mouse.y * ROT_RANGE_X;

          // Lerp for luxury weighted inertia.
          model.rotation.y += (target.y - model.rotation.y) * LERP;
          model.rotation.x += (target.x - model.rotation.x) * LERP;
        } else {
          // During the intro sweep, the GSAP tween writes target.{x,y}
          // directly — just lerp the model toward it without re-deriving
          // from cursor (otherwise mouse would fight the intro).
          model.rotation.y += (target.y - model.rotation.y) * LERP;
          model.rotation.x += (target.x - model.rotation.x) * LERP;
        }
      }

      renderer.render(scene, camera);
    };
    tick();
  };

  // ===================================================================
  // 3. Magnetic CTAs — attract within 40px of the cursor
  // ===================================================================
  const initMagnetic = () => {
    if (prefersReducedMotion) return;
    const RADIUS = 40;       // attract distance (spec)
    const STRENGTH = 0.4;    // 0..1, how strongly to pull

    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      let frame = null;
      const onMove = (e) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);

        // Treat anywhere within (radius + half the larger side) as in-range
        const maxReach = RADIUS + Math.max(rect.width, rect.height) / 2;
        if (dist > maxReach) {
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            el.style.transform = '';
          });
          return;
        }

        // Scale pull strength by proximity
        const pull = (1 - Math.min(dist / maxReach, 1)) * STRENGTH;
        const tx = dx * pull;
        const ty = dy * pull;

        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          el.style.transform = `translate(${tx}px, ${ty}px)`;
        });
      };

      const onLeave = () => {
        if (frame) cancelAnimationFrame(frame);
        el.style.transition = 'transform .4s cubic-bezier(.34,1.56,.64,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 400);
      };

      window.addEventListener('mousemove', onMove, { passive: true });
      el.addEventListener('mouseleave', onLeave);
    });
  };

  // ===================================================================
  // 4. Scroll reveal — fade + 30px lift, sequentially per section
  // ===================================================================
  const initScrollReveal = () => {
    if (!hasGSAP || !window.ScrollTrigger) return;
    if (prefersReducedMotion) {
      document.querySelectorAll('[data-reveal] > *, [data-reveal-child], [data-reveal] .feature__pill')
        .forEach((el) => { el.style.opacity = 1; el.style.transform = 'none'; });
      return;
    }

    document.querySelectorAll('[data-reveal]').forEach((section) => {
      // Reveal the section's direct children sequentially.
      const children = section.querySelectorAll(
        ':scope > *, :scope .feature__pill, :scope [data-reveal-child]'
      );
      if (!children.length) return;

      gsap.to(children, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: section,
          start: 'top 85%',
          once: true,
        },
      });
    });
  };

  // ===================================================================
  // 5. Active-nav sync — slide the Ellipse 80 indicator behind the
  // active icon as the user scrolls. The indicator is the absolutely
  // positioned <span class="side-pill__indicator"> inside the rail; we
  // translate it on the Y axis so it parks behind whichever link the
  // viewport is currently centered on.
  // ===================================================================
  const initActiveNav = () => {
    const rail = document.querySelector('.side-pill--left');
    const indicator = document.querySelector('.side-pill__indicator');
    const links = document.querySelectorAll('.side-pill--left a[href^="#"]');
    if (!rail || !links.length) return;

    // Park the indicator behind a given link
    const parkOn = (link) => {
      if (!indicator || !link) return;
      const railRect = rail.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      const indicatorH = indicator.offsetHeight || 48;
      // Offset = link center within rail − indicator's half-height
      const y = (linkRect.top - railRect.top) + (linkRect.height / 2) - (indicatorH / 2);
      indicator.style.transform = `translateY(${Math.round(y)}px)`;
    };

    // Initial park on the active link (the .is-active one in HTML)
    const initialActive = document.querySelector('.side-pill--left .is-active') || links[0];
    // Defer one frame so the rail has measured itself
    requestAnimationFrame(() => parkOn(initialActive));

    const map = new Map();
    links.forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      const tgt = document.getElementById(id);
      if (tgt) map.set(tgt, a);
    });

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const link = map.get(entry.target);
          if (!link) return;
          links.forEach((l) => l.classList.remove('is-active'));
          link.classList.add('is-active');
          parkOn(link);
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    map.forEach((_, section) => obs.observe(section));

    // Keep the indicator aligned across viewport resizes
    window.addEventListener('resize', () => {
      const active = document.querySelector('.side-pill--left .is-active');
      if (active) parkOn(active);
    });
  };

  // ===================================================================
  // Boot
  // ===================================================================
  const boot = () => {
    const words = splitHeroTitle();
    animateHero(words);
    initHero3D();              // Three.js WebGL scene (was initHeroParallax)
    initMagnetic();
    initScrollReveal();
    initActiveNav();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
