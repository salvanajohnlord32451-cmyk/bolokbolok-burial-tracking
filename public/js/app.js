/**
 * BolokBolok Burial Tracking System
 * Frontend Client SPA Script
 */

// Application State
const state = {
  token: localStorage.getItem('er_jwt_token') || null,
  user: JSON.parse(localStorage.getItem('er_user_data') || 'null'),
  currentView: 'dashboard-view',
  burials: [],
  stats: { totalBurials: 0, assignedLots: 0, unassignedLots: 0, recentBurials: 0, eligibleForRemoval: 0 },
  filters: {
    search: '',
    deathFrom: '',
    deathTo: '',
    removalStatus: 'all',
    lotStatus: 'all'
  },
  viewMode: 'table' // 'table' or 'grid'
};

// DOM Elements Initialization
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

function initApp() {
  // Check if URL contains a password reset token
  const hash = window.location.hash;
  const resetMatch = hash.match(/^#resetToken=([a-f0-9]+)$/);
  if (resetMatch) {
    const token = resetMatch[1];
    document.getElementById('reset-token-input').value = token;
    showAuthScreen();
    showResetForm();
    // Clear token from URL without reloading
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  if (state.token && state.user) {
    showMainApp();
    loadDashboardStats();
    loadBurialRecords();
  } else {
    showAuthScreen();
  }
}

// Helper: Check if deceased 20+ years ago
function is20YearsDeceased(dateOfDeathStr) {
  if (!dateOfDeathStr) return false;
  const death = new Date(dateOfDeathStr);
  const twentyYearsAgo = new Date();
  twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
  return death <= twentyYearsAgo;
}

// ================= AUTHENTICATION LOGIC =================

function showAllAuthForms(activeId) {
  ['login-form', 'register-form', 'forgot-form', 'reset-form'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== activeId);
  });
  showAuthAlert('');
}

function showResetForm() {
  showAllAuthForms('reset-form');
}

function showAuthScreen() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
}

function showMainApp() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');

  // Populate User Info in Sidebar
  if (state.user) {
    document.getElementById('sidebar-user-name').textContent = state.user.name || 'User Account';
    document.getElementById('sidebar-user-email').textContent = state.user.email || '';
    document.getElementById('sidebar-user-avatar').textContent = (state.user.name || 'U').charAt(0).toUpperCase();

    // Populate Account Page
    document.getElementById('profile-name').value = state.user.name || '';
    document.getElementById('profile-email').value = state.user.email || '';
    document.getElementById('profile-role').value = (state.user.role || 'staff').toUpperCase();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  showAuthAlert('');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!data.success) {
      showAuthAlert(data.message || 'Login failed', 'error');
      return;
    }

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('er_jwt_token', data.token);
    localStorage.setItem('er_user_data', JSON.stringify(data.user));

    showToast('Login successful! Welcome back.', 'success');
    showMainApp();
    loadDashboardStats();
    loadBurialRecords();
  } catch (err) {
    showAuthAlert('Unable to reach server. Please check connection.', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  showAuthAlert('');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (!data.success) {
      showAuthAlert(data.message || 'Registration failed', 'error');
      return;
    }

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('er_jwt_token', data.token);
    localStorage.setItem('er_user_data', JSON.stringify(data.user));

    showToast('Account created successfully!', 'success');
    showMainApp();
    loadDashboardStats();
    loadBurialRecords();
  } catch (err) {
    showAuthAlert('Server error during registration.', 'error');
  }
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('er_jwt_token');
  localStorage.removeItem('er_user_data');
  showToast('You have logged out.', 'info');
  showAuthScreen();
}

// ================= FORGOT / RESET PASSWORD LOGIC =================

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const btn = e.target.querySelector('button[type="submit"]');

  showAuthAlert('');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Sending...';

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.success) {
      showAuthAlert(data.message, 'success');
      document.getElementById('forgot-form').reset();
    } else {
      showAuthAlert(data.message || 'Failed to send reset email.', 'error');
    }
  } catch (err) {
    showAuthAlert('Server error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Send Reset Link';
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const token = document.getElementById('reset-token-input').value;
  const newPassword = document.getElementById('reset-new-password').value;
  const confirmPassword = document.getElementById('reset-confirm-password').value;
  const btn = e.target.querySelector('button[type="submit"]');

  showAuthAlert('');

  if (newPassword !== confirmPassword) {
    showAuthAlert('Passwords do not match. Please try again.', 'error');
    return;
  }
  if (newPassword.length < 6) {
    showAuthAlert('Password must be at least 6 characters.', 'error');
    return;
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Resetting...';

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await res.json();
    if (data.success) {
      showAuthAlert(data.message, 'success');
      setTimeout(() => showAllAuthForms('login-form'), 2000);
    } else {
      showAuthAlert(data.message || 'Reset failed. Link may have expired.', 'error');
    }
  } catch (err) {
    showAuthAlert('Server error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Reset Password';
  }
}

function showAuthAlert(msg, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  if (!msg) {
    alertEl.classList.add('hidden');
    return;
  }
  alertEl.textContent = msg;
  alertEl.className = `alert alert-${type}`;
  alertEl.classList.remove('hidden');
}

// ================= NAVIGATION LOGIC =================

function switchView(targetViewId) {
  state.currentView = targetViewId;

  // Update active navigation item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === targetViewId);
  });

  // Switch View Sections
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === targetViewId);
  });

  // Update Page Header Title
  const titles = {
    'dashboard-view': 'Dashboard Overview',
    'deceased-view': 'Deceased Burial Inventory',
    'audit-view': 'Activity & Audit Trail Tracker',
    'account-view': 'Account Settings'
  };
  document.getElementById('page-title').textContent = titles[targetViewId] || 'Inventory System';

  if (targetViewId === 'audit-view') {
    loadAuditLogs();
  }

  // Mobile sidebar close
  document.getElementById('sidebar').classList.remove('open');
}

// ================= API DATA FETCHING & RENDERING =================

async function loadDashboardStats() {
  try {
    const res = await fetch('/api/burials/stats', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (data.success) {
      state.stats = data.stats;
      document.getElementById('stat-total').textContent = data.stats.totalBurials;
      if (document.getElementById('stat-eligible')) {
        document.getElementById('stat-eligible').textContent = data.stats.eligibleForRemoval || 0;
      }
      document.getElementById('stat-assigned').textContent = data.stats.assignedLots;
      document.getElementById('stat-unassigned').textContent = data.stats.unassignedLots;
    }
  } catch (err) {
    console.error('Stats fetch error:', err);
  }
}

async function loadBurialRecords() {
  try {
    const queryParams = new URLSearchParams();
    if (state.filters.search) queryParams.append('search', state.filters.search);
    if (state.filters.deathFrom) queryParams.append('deathFrom', state.filters.deathFrom);
    if (state.filters.deathTo) queryParams.append('deathTo', state.filters.deathTo);
    if (state.filters.removalStatus && state.filters.removalStatus !== 'all') {
      queryParams.append('removalStatus', state.filters.removalStatus);
    }
    if (state.filters.lotStatus) queryParams.append('lotFilter', state.filters.lotStatus);

    const res = await fetch(`/api/burials?${queryParams.toString()}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();

    if (data.success) {
      state.burials = data.burials;
      renderBurialList();
      renderDashboardGrid();
    } else if (res.status === 401) {
      handleLogout();
    }
  } catch (err) {
    console.error('Fetch burials error:', err);
    showToast('Failed to fetch burial records.', 'error');
  }
}

function renderBurialList() {
  const tableBody = document.getElementById('burial-table-body');
  const gridContainer = document.getElementById('grid-container');
  const emptyState = document.getElementById('empty-state');
  const recordCount = document.getElementById('record-count');

  recordCount.textContent = state.burials.length;

  if (state.burials.length === 0) {
    tableBody.innerHTML = '';
    gridContainer.innerHTML = '';
    document.getElementById('table-container').classList.add('hidden');
    gridContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  // Render Table View
  tableBody.innerHTML = state.burials.map(b => {
    const isDue = is20YearsDeceased(b.dateOfDeath);
    return `
      <tr class="${isDue ? 'row-removal-alert' : ''}">
        <td>
          <strong>${escapeHtml(b.name)}</strong>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
            Added by: ${escapeHtml(b.createdBy ? b.createdBy.name : 'Unknown')}
            ${b.updatedBy ? ` | Modified by: ${escapeHtml(b.updatedBy.name)}` : ''}
          </div>
        </td>
        <td>${formatDate(b.dateOfDeath)}</td>
        <td>${escapeHtml(b.address)}</td>
        <td>
          ${b.lotNumber ? `<span class="badge badge-success">Lot ${escapeHtml(b.lotNumber)}</span>` : `<span class="badge badge-warning">Unassigned</span>`}
          ${b.lotOwnerName ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:3px;">Owner: <strong>${escapeHtml(b.lotOwnerName)}</strong></div>` : ''}
        </td>
        <td>
          <div style="font-size:12px; color:var(--text-secondary);">
            ${b.email ? `✉️ ${escapeHtml(b.email)}<br>` : ''}
            ${b.phone ? `📞 ${escapeHtml(b.phone)}` : (!b.email ? '-' : '')}
          </div>
        </td>
        <td>
          ${isDue
            ? `<span class="badge alert-error" style="background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3);" title="20+ years since date of death">⚠️ 20+ Yrs (Due for Removal)</span>`
            : `<span class="badge badge-success">Active (< 20 Yrs)</span>`}
        </td>
        <td>
          <div class="table-actions">
            <button class="action-btn" onclick="editBurialRecord('${b._id}')" title="Edit Record">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteBurialRecord('${b._id}')" title="Delete Record">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Render Card Grid View
  gridContainer.innerHTML = state.burials.map(b => {
    const isDue = is20YearsDeceased(b.dateOfDeath);
    return `
      <div class="record-card ${isDue ? 'card-removal-alert' : ''}">
        ${isDue ? `<div style="font-size:11px; font-weight:700; color:var(--accent-red); margin-bottom:6px;">⚠️ 20+ YRS DECEASED - DUE FOR REMOVAL</div>` : ''}
        <div class="record-card-title">${escapeHtml(b.name)}</div>
        <div class="record-card-meta">💀 Died: <strong>${formatDate(b.dateOfDeath)}</strong></div>
        <div class="record-card-meta">📍 Address: ${escapeHtml(b.address)}</div>
        ${b.lotOwnerName ? `<div class="record-card-meta">👤 Lot Owner: <strong>${escapeHtml(b.lotOwnerName)}</strong></div>` : ''}
        ${b.email || b.phone ? `<div class="record-card-meta">📞 Contact: ${escapeHtml([b.phone, b.email].filter(Boolean).join(' | '))}</div>` : ''}
        <div class="record-card-meta" style="font-size:11px; color:var(--text-muted); margin-top:4px;">
          Added by: ${escapeHtml(b.createdBy ? b.createdBy.name : 'System')}
        </div>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${b.lotNumber ? `<span class="badge badge-success">Lot ${escapeHtml(b.lotNumber)}</span>` : `<span class="badge badge-warning">Optional Lot</span>`}
          <div class="table-actions">
            <button class="action-btn" onclick="editBurialRecord('${b._id}')" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="action-btn delete-btn" onclick="deleteBurialRecord('${b._id}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (state.viewMode === 'table') {
    document.getElementById('table-container').classList.remove('hidden');
    gridContainer.classList.add('hidden');
  } else {
    document.getElementById('table-container').classList.add('hidden');
    gridContainer.remove('hidden');
  }
}

function renderDashboardGrid() {
  // Render Lot Visualizer Matrix
  const lotGrid = document.getElementById('lot-matrix-grid');
  const removalTbody = document.getElementById('dashboard-removal-tbody');

  // Build matrix chips
  const totalSlots = Math.max(16, state.burials.length + 4);
  const matrixHtml = [];
  for (let i = 1; i <= totalSlots; i++) {
    const lotCode = `A-${100 + i}`;
    const found = state.burials.find(b => b.lotNumber && b.lotNumber.toLowerCase() === lotCode.toLowerCase());
    if (found) {
      const isDue = is20YearsDeceased(found.dateOfDeath);
      matrixHtml.push(`<div class="lot-chip assigned ${isDue ? 'chip-warning' : ''}" title="${escapeHtml(found.name)} - Lot ${lotCode} ${isDue ? '(Due for removal)' : ''}">${lotCode}${isDue ? ' ⚠️' : ''}</div>`);
    } else {
      matrixHtml.push(`<div class="lot-chip unassigned" title="Unassigned / Available Lot">${lotCode}</div>`);
    }
  }
  lotGrid.innerHTML = matrixHtml.join('');

  // Render removal table feed (20+ years deceased records)
  const eligibleRecords = state.burials.filter(b => is20YearsDeceased(b.dateOfDeath)).sort((a, b) => new Date(a.dateOfDeath) - new Date(b.dateOfDeath)).slice(0, 5);

  if (!removalTbody) return;

  if (eligibleRecords.length === 0) {
    removalTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px; color:var(--text-muted);">No records currently due for 20-year removal.</td></tr>`;
  } else {
    removalTbody.innerHTML = eligibleRecords.map(b => `
      <tr>
        <td><strong>${escapeHtml(b.name)}</strong></td>
        <td><span style="color:#fca5a5; font-weight:600;">${formatDate(b.dateOfDeath)}</span></td>
        <td>
          ${b.lotNumber ? `<span class="badge badge-success">Lot ${escapeHtml(b.lotNumber)}</span>` : '<span style="opacity:0.6;">Unassigned</span>'}
          ${b.lotOwnerName ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Owner: ${escapeHtml(b.lotOwnerName)}</div>` : ''}
        </td>
      </tr>
    `).join('');
  }
}

// ================= CRUD RECORD MODAL LOGIC =================

function openRecordModal(burialObj = null) {
  const modal = document.getElementById('record-modal');
  const form = document.getElementById('burial-form');
  const title = document.getElementById('modal-title');
  const deleteBtn = document.getElementById('delete-record-modal-btn');

  form.reset();

  if (burialObj) {
    title.textContent = 'Edit Burial Record';
    document.getElementById('burial-id').value = burialObj._id;
    document.getElementById('record-name').value = burialObj.name;
    document.getElementById('record-date-death').value = burialObj.dateOfDeath ? burialObj.dateOfDeath.split('T')[0] : '';
    document.getElementById('record-address').value = burialObj.address;
    document.getElementById('record-lot').value = burialObj.lotNumber || '';
    document.getElementById('record-owner').value = burialObj.lotOwnerName || '';
    document.getElementById('record-email').value = burialObj.email || '';
    document.getElementById('record-phone').value = burialObj.phone || '';
    document.getElementById('record-section').value = burialObj.section || 'General';
    document.getElementById('record-notes').value = burialObj.notes || '';
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Add New Deceased Record';
    document.getElementById('burial-id').value = '';
    deleteBtn.classList.add('hidden');
    // Set default date of death
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('record-date-death').value = today;
  }

  modal.classList.remove('hidden');
}

function closeRecordModal() {
  document.getElementById('record-modal').classList.add('hidden');
}

async function handleBurialSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('burial-id').value;
  const payload = {
    name: document.getElementById('record-name').value,
    dateOfDeath: document.getElementById('record-date-death').value,
    address: document.getElementById('record-address').value,
    lotNumber: document.getElementById('record-lot').value,
    lotOwnerName: document.getElementById('record-owner').value,
    email: document.getElementById('record-email').value,
    phone: document.getElementById('record-phone').value,
    section: document.getElementById('record-section').value,
    notes: document.getElementById('record-notes').value
  };

  const url = id ? `/api/burials/${id}` : '/api/burials';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Operation failed', 'error');
      return;
    }

    showToast(id ? 'Burial record updated!' : 'New burial record created!', 'success');
    closeRecordModal();
    loadDashboardStats();
    loadBurialRecords();
  } catch (err) {
    showToast('Server error saving record.', 'error');
  }
}

window.editBurialRecord = function (id) {
  const item = state.burials.find(b => b._id === id);
  if (item) {
    openRecordModal(item);
  }
};

window.deleteBurialRecord = async function (id) {
  if (!confirm('Are you sure you want to delete this deceased record? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`/api/burials/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Record deleted successfully.', 'success');
      loadDashboardStats();
      loadBurialRecords();
    } else {
      showToast(data.message || 'Failed to delete', 'error');
    }
  } catch (err) {
    showToast('Error connecting to server.', 'error');
  }
};

// ================= ACCOUNT PROFILE HANDLERS =================

async function handleProfileSave(e) {
  e.preventDefault();
  const name = document.getElementById('profile-name').value;

  try {
    const res = await fetch('/api/auth/update-profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    if (data.success) {
      state.user = data.user;
      localStorage.setItem('er_user_data', JSON.stringify(data.user));
      showToast('Profile name updated!', 'success');
      showMainApp();
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Server error', 'error');
  }
}

async function handlePasswordSave(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('curr-pass').value;
  const newPassword = document.getElementById('new-pass').value;

  try {
    const res = await fetch('/api/auth/update-profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Password updated successfully!', 'success');
      document.getElementById('password-form').reset();
    } else {
      showToast(data.message || 'Password update failed', 'error');
    }
  } catch (err) {
    showToast('Server error updating password.', 'error');
  }
}

// ================= AUDIT LOG HISTORY LOGIC =================

async function loadAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/burials/audit-logs', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    if (!data.success || !data.logs || data.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">No activity history logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.logs.map(log => {
      let badgeClass = 'badge-info';
      if (log.action === 'CREATE') badgeClass = 'badge-success';
      if (log.action === 'DELETE') badgeClass = 'alert-error';
      if (log.action === 'UPDATE') badgeClass = 'badge-warning';

      return `
        <tr>
          <td><small>${formatDateTime(log.timestamp)}</small></td>
          <td><span class="badge ${badgeClass}">${log.action}</span></td>
          <td><strong>${escapeHtml(log.recordName)}</strong></td>
          <td>👤 ${escapeHtml(log.performedBy ? log.performedBy.name : 'Unknown User')}</td>
          <td>${escapeHtml(log.details || '-')}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Fetch audit logs error:', err);
    showToast('Failed to fetch activity logs.', 'error');
  }
}

// ================= CSV EXPORT FEATURE =================

function exportToCSV() {
  if (state.burials.length === 0) {
    showToast('No records available to export.', 'info');
    return;
  }

  const headers = ['Full Name', 'Date of Death', 'Address', 'Lot Number', 'Lot Owner Name', 'Contact Email', 'Contact Phone', 'Cemetery Section', 'Removal Status (20+ Yrs)', 'Notes'];
  const csvRows = [headers.join(',')];

  state.burials.forEach(b => {
    const isDue = is20YearsDeceased(b.dateOfDeath);
    const row = [
      `"${(b.name || '').replace(/"/g, '""')}"`,
      `"${formatDate(b.dateOfDeath)}"`,
      `"${(b.address || '').replace(/"/g, '""')}"`,
      `"${(b.lotNumber || 'Unassigned').replace(/"/g, '""')}"`,
      `"${(b.lotOwnerName || '').replace(/"/g, '""')}"`,
      `"${(b.email || '').replace(/"/g, '""')}"`,
      `"${(b.phone || '').replace(/"/g, '""')}"`,
      `"${(b.section || 'General').replace(/"/g, '""')}"`,
      `"${isDue ? 'Due for Removal (20+ Yrs)' : 'Active (< 20 Yrs)'}"`,
      `"${(b.notes || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `burial_inventory_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV export downloaded successfully.', 'success');
}

// ================= HELPER UTILITIES =================

function setupEventListeners() {
  // Auth Form Toggles & Submits
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('forgot-form').addEventListener('submit', handleForgotPassword);
  document.getElementById('reset-form').addEventListener('submit', handleResetPassword);

  document.getElementById('show-register-btn').addEventListener('click', (e) => {
    e.preventDefault();
    showAllAuthForms('register-form');
  });
  document.getElementById('show-login-btn').addEventListener('click', (e) => {
    e.preventDefault();
    showAllAuthForms('login-form');
  });
  document.getElementById('show-forgot-btn').addEventListener('click', (e) => {
    e.preventDefault();
    showAllAuthForms('forgot-form');
  });
  document.getElementById('back-to-login-btn').addEventListener('click', (e) => {
    e.preventDefault();
    showAllAuthForms('login-form');
  });
  document.getElementById('back-to-login-from-reset-btn').addEventListener('click', (e) => {
    e.preventDefault();
    showAllAuthForms('login-form');
  });
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Sidebar Menu Switches
  document.querySelectorAll('.nav-item, .nav-switch-link').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // View Eligible Btn on Dashboard
  const viewEligibleBtn = document.getElementById('view-eligible-btn');
  if (viewEligibleBtn) {
    viewEligibleBtn.addEventListener('click', () => {
      document.getElementById('filter-removal-status').value = 'eligible';
      state.filters.removalStatus = 'eligible';
      switchView('deceased-view');
      loadBurialRecords();
    });
  }

  // Sidebar Mobile Toggle
  document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Modal Triggers
  document.getElementById('quick-add-btn').addEventListener('click', () => openRecordModal());
  document.getElementById('add-deceased-btn').addEventListener('click', () => openRecordModal());
  document.getElementById('close-modal-btn').addEventListener('click', closeRecordModal);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeRecordModal);
  document.getElementById('burial-form').addEventListener('submit', handleBurialSubmit);

  // Close modal when clicking outside modal card
  const recordModal = document.getElementById('record-modal');
  if (recordModal) {
    recordModal.addEventListener('click', (e) => {
      if (e.target === recordModal) {
        closeRecordModal();
      }
    });
  }

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recordModal && !recordModal.classList.contains('hidden')) {
      closeRecordModal();
    }
  });

  // Filters & Search
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    state.filters.search = e.target.value;
    document.getElementById('clear-search-btn').classList.toggle('hidden', !e.target.value);
    searchTimeout = setTimeout(loadBurialRecords, 300);
  });

  document.getElementById('clear-search-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    state.filters.search = '';
    document.getElementById('clear-search-btn').classList.add('hidden');
    loadBurialRecords();
  });

  document.getElementById('filter-death-from').addEventListener('change', (e) => {
    state.filters.deathFrom = e.target.value;
    loadBurialRecords();
  });
  document.getElementById('filter-death-to').addEventListener('change', (e) => {
    state.filters.deathTo = e.target.value;
    loadBurialRecords();
  });
  document.getElementById('filter-removal-status').addEventListener('change', (e) => {
    state.filters.removalStatus = e.target.value;
    loadBurialRecords();
  });
  document.getElementById('filter-lot-status').addEventListener('change', (e) => {
    state.filters.lotStatus = e.target.value;
    loadBurialRecords();
  });

  document.getElementById('reset-filters-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-death-from').value = '';
    document.getElementById('filter-death-to').value = '';
    document.getElementById('filter-removal-status').value = 'all';
    document.getElementById('filter-lot-status').value = 'all';
    state.filters = { search: '', deathFrom: '', deathTo: '', removalStatus: 'all', lotStatus: 'all' };
    loadBurialRecords();
  });

  // Table vs Grid Mode Toggle
  document.getElementById('toggle-table-view').addEventListener('click', () => {
    state.viewMode = 'table';
    document.getElementById('toggle-table-view').classList.add('active');
    document.getElementById('toggle-grid-view').classList.remove('active');
    renderBurialList();
  });
  document.getElementById('toggle-grid-view').addEventListener('click', () => {
    state.viewMode = 'grid';
    document.getElementById('toggle-grid-view').classList.add('active');
    document.getElementById('toggle-table-view').classList.remove('active');
    renderBurialList();
  });

  // Modal Delete Button
  document.getElementById('delete-record-modal-btn').addEventListener('click', () => {
    const id = document.getElementById('burial-id').value;
    if (id) {
      deleteBurialRecord(id);
      closeRecordModal();
    }
  });

  // Audit Logs Refresh Button
  document.getElementById('refresh-audit-btn').addEventListener('click', loadAuditLogs);

  // CSV Export Button
  document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);

  // Account Forms
  document.getElementById('profile-form').addEventListener('submit', handleProfileSave);
  document.getElementById('password-form').addEventListener('submit', handlePasswordSave);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
