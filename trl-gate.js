/*! TRL gate v1.0.0
 * Include once in the head of every page of the four tool apps, as a script
 * tag with src pointing at this file.
 *
 * 1. If a tool is opened directly (not inside the member-only page on
 *    www.therequirementlist.com) the visitor is redirected to that page,
 *    where Memberstack asks them to log in.
 * 2. On the Local Operators tool, contact details are shown only to Elite
 *    members. Everyone else sees an "Upgrade" button instead.
 *    Fails closed: contacts stay hidden until the parent page confirms Elite.
 *
 * NOTE: this is a front-end gate. It keeps contacts off the screen for normal
 * use; it does not hide data that is embedded in the page source.
 */
(function () {
  'use strict';

  var CONFIG = {
    // Pages that are allowed to embed the tools and to tell us the member status.
    parentOrigins: ['https://www.therequirementlist.com', 'https://therequirementlist.com'],

    // Production hostnames -> the member-only page on the main site.
    // Any other hostname (localhost, preview deployments) is left untouched.
    pages: {
      'localoperators.therequirementlist.com': 'https://www.therequirementlist.com/features/local-operators',
      'shoppingcentres.therequirementlist.com': 'https://www.therequirementlist.com/features/occupier-insights',
      'canvassing.therequirementlist.com': 'https://www.therequirementlist.com/features/canvassing-map',
      'gap.therequirementlist.com': 'https://www.therequirementlist.com/features/gap-analysis-map'
    },

    // Tools with Elite-only contacts.
    eliteHosts: ['localoperators.therequirementlist.com'],

    // Elements holding a person's contact details.
    contactSelector: '.contact-person, [data-trl-contact]',

    // Where non-Elite members are sent. This page must be viewable by all logged-in members.
    upgradeUrl: 'https://www.therequirementlist.com/upgrade-elite',
    upgradeLabel: 'Upgrade your plan',

    // If the parent page does not answer in time, contacts stay locked.
    statusTimeoutMs: 4000
  };

  var host = location.hostname;
  var parentPage = CONFIG.pages[host];
  if (!parentPage) return;

  // ---- 1. Direct visit -> send to the member-only page -------------------
  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }
  if (!framed) {
    var search = CONFIG.eliteHosts.indexOf(host) !== -1 ? location.search : '';
    location.replace(parentPage + search);
    return;
  }

  // ---- 2. Elite-only contacts --------------------------------------------
  if (CONFIG.eliteHosts.indexOf(host) === -1) return;

  var state = 'pending'; // 'pending' | 'locked' | 'elite'
  var replaced = [];     // [{ placeholder, original }] so a late "elite" can restore

  // Hide contacts immediately, before the table is even drawn.
  var style = document.createElement('style');
  style.id = 'trl-gate-style';
  style.textContent = CONFIG.contactSelector + '{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(style);

  function makeButton() {
    var a = document.createElement('a');
    a.className = 'contact-button trl-upgrade';
    a.href = CONFIG.upgradeUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = CONFIG.upgradeLabel;
    return a;
  }

  function lockNode(el) {
    var button = makeButton();
    if (el.tagName === 'TD') {
      // data-trl-contact placed on the cell itself: swap its content, keep the cell.
      var holder = document.createDocumentFragment();
      while (el.firstChild) holder.appendChild(el.firstChild);
      el.appendChild(button);
      replaced.push({ cell: el, placeholder: button, original: holder });
    } else {
      el.parentNode.replaceChild(button, el);
      replaced.push({ placeholder: button, original: el });
    }
  }

  function applyLock() {
    if (state !== 'locked') return;
    var nodes = document.querySelectorAll(CONFIG.contactSelector);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) lockNode(nodes[i]);
    }
  }

  function setElite() {
    if (state === 'elite') return;
    state = 'elite';
    if (observer) observer.disconnect();
    for (var i = 0; i < replaced.length; i++) {
      var r = replaced[i];
      if (!r.placeholder.parentNode) continue; // row was redrawn since
      if (r.cell) { r.cell.removeChild(r.placeholder); r.cell.appendChild(r.original); }
      else r.placeholder.parentNode.replaceChild(r.original, r.placeholder);
    }
    replaced = [];
    if (style.parentNode) style.parentNode.removeChild(style);
  }

  function setLocked() {
    if (state === 'elite') return;
    state = 'locked';
    applyLock();
  }

  // The table is redrawn when the city changes: keep locking new contacts.
  var observer = new MutationObserver(function () { if (state === 'locked') applyLock(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ---- Talk to the parent page --------------------------------------------
  window.addEventListener('message', function (e) {
    if (CONFIG.parentOrigins.indexOf(e.origin) === -1) return; // only our own site
    if (e.source !== window.parent) return;                    // only the embedding page
    var d = e.data;
    if (!d || d.type !== 'trl:status') return;
    gotStatus = true;
    if (d.loggedIn === true && d.elite === true) setElite(); else setLocked();
  });

  var gotStatus = false;

  // Work out which allowed origin actually embeds us, so we message only that one
  // (posting to a non-matching origin logs a console error in browsers).
  function embeddingOrigin() {
    var o = null;
    try { if (location.ancestorOrigins && location.ancestorOrigins.length) o = location.ancestorOrigins[0]; } catch (e) {}
    if (!o) { try { if (document.referrer) o = new URL(document.referrer).origin; } catch (e) {} }
    return o && CONFIG.parentOrigins.indexOf(o) !== -1 ? o : null;
  }

  function announce() {
    var known = embeddingOrigin();
    var targets = known ? [known] : CONFIG.parentOrigins;
    for (var i = 0; i < targets.length; i++) {
      try { window.parent.postMessage({ type: 'trl:ready' }, targets[i]); } catch (e) {}
    }
  }

  announce();
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (gotStatus || tries * 500 >= CONFIG.statusTimeoutMs) {
      clearInterval(timer);
      if (!gotStatus) setLocked();
      return;
    }
    announce();
  }, 500);
})();
