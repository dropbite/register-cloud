const $ = (id) => document.getElementById(id);
let currentEmail = '';
$('year').textContent = new Date().getFullYear();
function notice(message, isError = false) { const el = $('notice'); el.textContent = message; el.classList.toggle('error', isError); el.hidden = false; }
function setBusy(button, busy, busyText) { button.disabled = busy; if (busy) { button.dataset.original = button.textContent; button.textContent = busyText; } else { button.textContent = button.dataset.original || button.textContent; } }
async function api(path, body) { const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'ስህተት ተፈጥሯል።'); return data; }
$('register-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('send-code-btn');
  const fullName = $('fullName').value.trim(); const email = $('email').value.trim().toLowerCase(); const password = $('password').value;
  if (!event.currentTarget.reportValidity()) return;
  setBusy(button, true, 'ኮድ በመላክ ላይ…'); $('notice').hidden = true;
  try { const result = await api('/api/register/start', { fullName, email, password }); currentEmail = email; $('verify-email-label').textContent = email; $('register-step').hidden = true; $('verify-step').hidden = false; $('step-label').textContent = 'STEP 02 / 02'; $('step-bubble').textContent = '02'; $('form-title').textContent = 'ኢሜይልዎን ያረጋግጡ'; $('progress-bar').style.width = '100%'; notice(result.message); $('otp').focus(); }
  catch (error) { notice(error.message, true); } finally { setBusy(button, false); }
});
$('verify-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('verify-btn'); if (!$('otp').value.match(/^\d{6}$/)) { notice('ባለ 6 አሃዝ ኮዱን ያስገቡ።', true); return; }
  setBusy(button, true, 'በማረጋገጥ ላይ…'); $('notice').hidden = true;
  try { const result = await api('/api/register/verify', { email: currentEmail, otp: $('otp').value.trim() }); notice(result.message); $('verify-form').reset(); $('verify-step').hidden = true; $('form-title').textContent = 'ምዝገባው ተጠናቋል'; $('step-label').textContent = 'COMPLETE'; $('step-bubble').textContent = '✓'; $('progress-bar').style.width = '100%'; }
  catch (error) { notice(error.message, true); } finally { setBusy(button, false); }
});
$('back-btn').addEventListener('click', () => { $('verify-step').hidden = true; $('register-step').hidden = false; $('form-title').textContent = 'መለያ ይፍጠሩ'; $('step-label').textContent = 'STEP 01 / 02'; $('step-bubble').textContent = '01'; $('progress-bar').style.width = '50%'; $('notice').hidden = true; });
$('otp').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
