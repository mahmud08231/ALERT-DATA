document.addEventListener('DOMContentLoaded', () => {
  const alertBox = document.getElementById('form-alert');
  const form = (id) => document.getElementById(id);
  const values = (node) => Object.fromEntries(new FormData(node).entries());
  const setAlert = (message, type = 'error') => showAlert(alertBox, message, type);
  const query = new URLSearchParams(location.search);

  const register = form('register-form');
  if (register) register.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = register.querySelector('button'); button.disabled = true;
    try { const result = await API.post('/api/auth/register', values(register)); sessionStorage.setItem('verifyEmail', result.email); let message = result.message; if (result.devCode) message += ` Demo code: ${result.devCode}`; setAlert(message, 'success'); setTimeout(() => { location.href = `/pages/verify-email.html?email=${encodeURIComponent(result.email)}`; }, 850); }
    catch (error) { setAlert(error.message); } finally { button.disabled = false; }
  });

  const login = form('login-form');
  if (login) login.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = login.querySelector('button'); button.disabled = true;
    try { const result = await API.post('/api/auth/login', values(login)); location.href = result.user.role === 'admin' ? '/pages/admin.html' : '/pages/dashboard.html'; }
    catch (error) { if (error.body?.needsVerification) { sessionStorage.setItem('verifyEmail', error.body.email); location.href = `/pages/verify-email.html?email=${encodeURIComponent(error.body.email)}`; } else setAlert(error.message); } finally { button.disabled = false; }
  });

  const verify = form('verify-form');
  const resend = document.getElementById('resend-code');
  const emailField = verify?.elements.email;
  if (verify) {
    const email = query.get('email') || sessionStorage.getItem('verifyEmail') || '';
    emailField.value = email; const label = document.getElementById('verify-email-label'); if (label) label.textContent = email || 'your email';
    const startCountdown = (seconds) => { let remaining = Number(seconds) || 60; resend.disabled = true; const status = document.getElementById('resend-status'); const tick = () => { if (remaining <= 0) { resend.disabled = false; status.textContent = 'Didn’t get it?'; return; } status.textContent = `You can resend in ${remaining} seconds.`; remaining -= 1; setTimeout(tick, 1000); }; tick(); };
    startCountdown(60);
    verify.addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await API.post('/api/auth/verify-email', values(verify)); setAlert(result.message, 'success'); setTimeout(() => { location.href = '/pages/dashboard.html'; }, 700); } catch (error) { setAlert(error.message); } });
    resend?.addEventListener('click', async () => { try { const result = await API.post('/api/auth/resend-code', { email: emailField.value }); let message = result.message; if (result.devCode) message += ` Demo code: ${result.devCode}`; setAlert(message, 'success'); startCountdown(result.resendAvailableIn || 60); } catch (error) { setAlert(error.message); startCountdown(error.body?.resendAvailableIn || 60); } });
  }

  const requestReset = form('forgot-request-form');
  if (requestReset) requestReset.addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await API.post('/api/auth/forgot-password', values(requestReset)); let message = result.message; if (result.devToken) message += ` Demo reset code: ${result.devToken}`; setAlert(message, 'success'); if (result.devToken) document.querySelector('#reset-form [name="token"]').value = result.devToken; document.querySelector('#reset-form [name="email"]').value = requestReset.elements.email.value; } catch (error) { setAlert(error.message); } });
  const reset = form('reset-form');
  if (reset) reset.addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await API.post('/api/auth/reset-password', values(reset)); setAlert(result.message, 'success'); reset.reset(); } catch (error) { setAlert(error.message); } });
});
