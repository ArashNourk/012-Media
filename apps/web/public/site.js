// 012 MEDIA — progressive enhancement for the access journey.
// Without JavaScript the hero form submits to /request (full-page form).
(function () {
  'use strict';
  var hero = document.querySelector('[data-access-form]');
  var dialog = document.getElementById('apply');
  if (!hero || !dialog || typeof dialog.showModal !== 'function') return;

  var heroInput = hero.querySelector('input[type="email"]');
  var heroError = document.getElementById('hero-error');
  var form = dialog.querySelector('[data-apply-form]');
  var done = dialog.querySelector('.apply-done');
  var formError = form.querySelector('.form-error');
  var submitBtn = form.querySelector('button[type="submit"]');
  var lastTrigger = null;
  var EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

  function showHeroError(msg) {
    heroError.textContent = msg;
    heroError.hidden = !msg;
    heroInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  hero.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var value = heroInput.value.trim();
    if (!EMAIL.test(value)) {
      showHeroError('Enter a valid email address.');
      heroInput.focus();
      return;
    }
    showHeroError('');
    var emailField = form.querySelector('[name="email"]');
    emailField.value = value; // the address persists into the application
    lastTrigger = document.activeElement;
    if (!done.hidden) {
      // A new request after a completed one starts from the form again.
      done.hidden = true;
      form.hidden = false;
    }
    dialog.showModal();
    var name = form.querySelector('[name="fullName"]');
    (name.value ? emailField : name).focus();
  });

  function close() {
    dialog.close();
  }
  dialog.addEventListener('close', function () {
    // Typed information is kept: closing never resets the form.
    (lastTrigger || heroInput).focus();
  });
  Array.prototype.forEach.call(dialog.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', close);
  });
  dialog.addEventListener('click', function (ev) {
    if (ev.target === dialog) close(); // backdrop
  });

  function clearErrors() {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (p) {
      p.hidden = true;
      p.textContent = '';
    });
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) {
      el.removeAttribute('aria-invalid');
    });
    formError.hidden = true;
    formError.textContent = '';
  }

  function showErrors(errors) {
    var first = null;
    Object.keys(errors).forEach(function (key) {
      var p = form.querySelector('#err-' + key);
      var field = form.querySelector('[name="' + key + '"]');
      if (p && field) {
        p.textContent = errors[key];
        p.hidden = false;
        field.setAttribute('aria-invalid', 'true');
        if (!first) first = field;
      } else {
        formError.textContent = errors[key];
        formError.hidden = false;
      }
    });
    (first || submitBtn).focus();
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearErrors();
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    submitBtn.disabled = true;
    fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-012-Form': '1' },
      body: JSON.stringify(data),
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.body.ok) {
          form.hidden = true;
          done.querySelector('[data-done-message]').textContent = r.body.message;
          done.hidden = false;
          done.focus();
        } else if (r.body && r.body.errors) {
          showErrors(r.body.errors);
        } else {
          showErrors({ form: (r.body && r.body.message) || 'Something went wrong. Please try again.' });
        }
      })
      .catch(function () {
        showErrors({ form: 'The request could not be sent. Check your connection and try again.' });
      })
      .then(function () {
        submitBtn.disabled = false;
      });
  });
})();
