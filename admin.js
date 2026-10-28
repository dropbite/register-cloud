const $ = (id) => document.getElementById(id);
$('year').textContent = new Date().getFullYear();
function showNotice(id, message, isError = false) { const el = $(id); el.textContent = message; el.classList.toggle('error', isError); el.hidden = false; }
function busy(button, value, label) { button.disabled = value; if (value) { button.dataset.original = button.textContent; button.textContent = label; } else button.textContent = button.dataset.original || button.textContent; }
async function request(path, options = {}) { const response = await fetch(path, { credentials: 'same-origin', ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'ስህተት ተፈጥሯል።'); return data; }
function date(value) { return new Date(value).toLocaleString('am-ET', { year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function loadDashboard() {
  try { const data = await request('/api/admin/overview'); $('stat-total').textContent = data.stats.total; $('stat-verified').textContent = data.stats.verified; $('stat-recent').textContent = data.stats.last_24h; $('stat-pending').textContent = data.stats.pending;
    $('users-table').innerHTML = data.users.length ? data.users.map(user => `<tr><td>${escapeHtml(user.full_name)}</td><td>${escapeHtml(user.email)}</td><td><span class="status-pill ${user.verified ? '' : 'pending'}">${user.verified ? 'የተረጋገጠ' : 'በመጠባበቅ ላይ'}</span></td><td>${date(user.created_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">ገና ምዝገባ የለም።</td></tr>';
    $('events-list').innerHTML = data.events.length ? data.events.map(event => `<div class="event-row"><span class="event-name">${escapeHtml(event.detail)}</span><span class="event-time">${date(event.created_at)}</span></div>`).join('') : '<p class="muted">ክስተት የለም።</p>';
  } catch (error) { if (error.message.includes('እባክዎ እንደ አስተዳዳሪ')) { $('dashboard').hidden = true; $('admin-login-wrap').hidden = false; } else showNotice('admin-login-notice', error.message, true); }
}
async function checkSession() { try { await request('/api/admin/me'); $('admin-login-wrap').hidden = true; $('dashboard').hidden = false; await loadDashboard(); } catch { $('admin-login-wrap').hidden = false; $('dashboard').hidden = true; } }
$('admin-login-form').addEventListener('submit', async (event) => { event.preventDefault(); const button = $('admin-login-btn'); busy(button, true, 'በመግባት ላይ…'); $('admin-login-notice').hidden = true;
  try { await request('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:$('admin-email').value.trim(), password:$('admin-password').value }) }); $('admin-password').value = ''; $('admin-login-wrap').hidden = true; $('dashboard').hidden = false; await loadDashboard(); }
  catch (error) { showNotice('admin-login-notice', error.message, true); } finally { busy(button, false); }
});
$('logout-btn').addEventListener('click', async () => { try { await request('/api/admin/logout', { method:'POST' }); } finally { $('dashboard').hidden = true; $('admin-login-wrap').hidden = false; } });
$('refresh-btn').addEventListener('click', loadDashboard);
checkSession();
