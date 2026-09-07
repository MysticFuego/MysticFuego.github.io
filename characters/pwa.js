/* Service-worker registration + update prompt.
   Loaded by every page under characters/. Safe to include on pages that do not
   load sheet.css — the update bar carries its own inline styles. */
(function () {
  if (!('serviceWorker' in navigator)) return;

  /* Registered with a relative URL so the worker's scope is this directory.
     That keeps the tracker at the site root outside the worker entirely. */
  window.addEventListener('load', function () {
    /* updateViaCache:'none' stops the browser reusing an HTTP-cached sw.js when it
       checks for updates. GitHub Pages sends a 10-minute max-age, which could
       otherwise delay players seeing a fresh deploy. */
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      /* A worker already parked in `waiting` means an update landed on a
         previous visit and never got applied. Offer it straight away. */
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);

      reg.addEventListener('updatefound', function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', function () {
          /* Reaching "installed" while a controller exists means this is a NEW
             version waiting its turn. On a first-ever install there is no
             controller and nothing worth announcing. */
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBar(reg);
          }
        });
      });
    }).catch(function (err) {
      console.warn('[pwa] service worker registration failed:', err);
    });
  });

  /* The new worker calling clients.claim() fires this. Reload once so the page
     matches the freshly activated cache; the guard stops a reload loop. */
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  function showUpdateBar(reg) {
    if (document.getElementById('pwaUpdateBar')) return;
    var bar = document.createElement('div');
    bar.id = 'pwaUpdateBar';
    bar.setAttribute('role', 'status');
    bar.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:18px', 'transform:translateX(-50%)',
      'z-index:9999', 'display:flex', 'align-items:center', 'gap:14px',
      'padding:11px 14px 11px 18px', 'border-radius:12px',
      'background:#111827', 'border:1px solid #253347',
      'box-shadow:0 10px 30px rgba(0,0,0,.55)',
      'font:500 13px/1.3 Inter,system-ui,-apple-system,Segoe UI,sans-serif',
      'color:#e8edf5', 'max-width:calc(100vw - 32px)'
    ].join(';');

    var msg = document.createElement('span');
    msg.textContent = 'A newer version of the sheets is ready.';
    bar.appendChild(msg);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Update';
    btn.style.cssText = [
      'cursor:pointer', 'border-radius:8px', 'padding:7px 14px',
      'border:1px solid rgba(212,160,74,.45)', 'background:rgba(212,160,74,.14)',
      'color:#f5c86e', 'font:700 13px/1 Inter,system-ui,sans-serif'
    ].join(';');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Updating…';
      /* Tell the waiting worker to take over; controllerchange reloads us. */
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    bar.appendChild(btn);

    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '×';
    dismiss.style.cssText = [
      'cursor:pointer', 'border:0', 'background:transparent', 'color:#6b7e99',
      'font:400 20px/1 system-ui,sans-serif', 'padding:0 4px'
    ].join(';');
    dismiss.addEventListener('click', function () { bar.remove(); });
    bar.appendChild(dismiss);

    document.body.appendChild(bar);
  }
})();
