(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') return fn();
    document.addEventListener('DOMContentLoaded', fn);
  }

  var ICON_USER =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>';
  var ICON_EYE =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EYE_OFF =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-10-7-10-7a18.06 18.06 0 014.06-5.94"/>' +
    '<path d="M9.9 4.24A10.94 10.94 0 0112 4c7 0 10 7 10 7a18 18 0 01-3.16 4.36"/>' +
    '<path d="M1 1l22 22"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/></svg>';

  function wrap(input, iconHTML, classes) {
    var wrapEl = document.createElement('div');
    wrapEl.className = 'epos-input-wrap';
    input.parentNode.insertBefore(wrapEl, input);
    wrapEl.appendChild(input);

    var icon = document.createElement(classes.indexOf('epos-eye-toggle') >= 0 ? 'button' : 'span');
    icon.className = classes;
    icon.innerHTML = iconHTML;
    if (icon.tagName === 'BUTTON') {
      icon.type = 'button';
      icon.setAttribute('aria-label', 'Toggle password visibility');
    }
    wrapEl.appendChild(icon);
    return icon;
  }

  ready(function () {
    var form = document.getElementById('loginform');
    if (!form) return;

    var userInput = form.querySelector('#user_login');
    var passInput = form.querySelector('#user_pass');

    if (userInput) {
      wrap(userInput, ICON_USER, 'epos-input-icon');
    }

    if (passInput) {
      // WordPress injects its own .wp-hide-pw eye button; remove it so
      // ours is the only icon. CSS hides it as a fallback if JS is off.
      var wpEye = form.querySelector('.wp-hide-pw');
      if (wpEye && wpEye.parentNode) {
        wpEye.parentNode.removeChild(wpEye);
      }

      var toggle = wrap(passInput, ICON_EYE, 'epos-eye-toggle');
      toggle.addEventListener('click', function () {
        var isPw = passInput.type === 'password';
        passInput.type = isPw ? 'text' : 'password';
        toggle.innerHTML = isPw ? ICON_EYE_OFF : ICON_EYE;
        passInput.focus();
      });
    }

    var remember = form.querySelector('.forgetmenot');
    if (remember) {
      var row = document.createElement('div');
      row.className = 'epos-row-meta';
      remember.parentNode.insertBefore(row, remember);
      row.appendChild(remember);

      var forgotUrl = (window.EPOS_LOGIN && window.EPOS_LOGIN.forgotUrl) || null;
      if (forgotUrl) {
        var a = document.createElement('a');
        a.href = forgotUrl;
        a.textContent = 'Forgot password?';
        row.appendChild(a);
      }
    }

    // Swap WP's <input type="submit"> for a <button type="submit"> so the
    // CSS `.is-loading::after` spinner can render (pseudo-elements don't
    // work on replaced elements like <input>). The button keeps the same
    // name/value so the form POST is byte-identical.
    var oldSubmit = form.querySelector('#wp-submit');
    var submitBtn = null;
    if (oldSubmit && oldSubmit.tagName === 'INPUT') {
      submitBtn = document.createElement('button');
      submitBtn.type = 'submit';
      submitBtn.id = oldSubmit.id;
      submitBtn.name = oldSubmit.name;
      submitBtn.value = oldSubmit.value;
      submitBtn.className = oldSubmit.className;
      submitBtn.textContent = oldSubmit.value || 'Log In';
      oldSubmit.parentNode.replaceChild(submitBtn, oldSubmit);
    } else {
      submitBtn = oldSubmit;
    }

    form.addEventListener('submit', function () {
      if (!submitBtn) return;
      submitBtn.classList.add('is-loading');
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.disabled = true;
    });
  });
})();
