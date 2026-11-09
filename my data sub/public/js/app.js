let appState = { user: null, catalog: null, pending: null, plansByNetwork: {}, planRequestId: 0, resultType: 'info' };
const appAlert = () => document.getElementById('app-alert');
const formData = (form) => Object.fromEntries(new FormData(form).entries());

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
  if (name === 'history') loadHistory();
}

function openPinModal(action) {
  appState.pending = action;
  document.getElementById('pin-value').value = '';
  document.getElementById('pin-error').className = 'alert hidden';
  document.getElementById('pin-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('pin-value').focus(), 50);
}

function closeModal() {
  document.getElementById('pin-modal').classList.add('hidden');
  appState.pending = null;
}

function openFundModal() {
  document.getElementById('fund-error').className = 'alert hidden';
  document.getElementById('fund-modal').classList.remove('hidden');
  setTimeout(() => document.querySelector('#fund-form input[name="amount"]').focus(), 50);
}

function closeFundModal() {
  document.getElementById('fund-modal').classList.add('hidden');
}

function showResult({ type = 'info', title, message, amount, reference }) {
  appState.resultType = type;
  const icon = document.getElementById('result-icon');
  const symbols = { success: '✓', processing: '…', insufficient: '!', failed: '×', info: 'i' };
  icon.textContent = symbols[type] || symbols.info;
  icon.className = `result-icon result-${type}`;
  document.getElementById('result-eyebrow').textContent = type === 'success' ? 'PAYMENT CONFIRMED' : type === 'processing' ? 'ORDER RECEIVED' : type === 'insufficient' ? 'WALLET BALANCE' : 'ORDER UPDATE';
  document.getElementById('result-title').textContent = title || 'Order update';
  document.getElementById('result-message').textContent = message || '';
  const amountNode = document.getElementById('result-amount');
  amountNode.textContent = amount ? `Amount: ${formatNaira(amount)}` : '';
  amountNode.classList.toggle('hidden', !amount);
  const referenceNode = document.getElementById('result-reference');
  referenceNode.textContent = reference ? `Reference: ${reference}` : '';
  referenceNode.classList.toggle('hidden', !reference);
  document.getElementById('result-fund').classList.toggle('hidden', type !== 'insufficient');
  document.getElementById('result-done').textContent = type === 'insufficient' ? 'Done' : 'Done';
  document.getElementById('result-modal').classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-modal').classList.add('hidden');
  showView('overview');
  refreshUser().catch(() => {});
  loadNotifications();
}

function renderBalance(balance) {
  document.getElementById('balance').textContent = Number(balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderOrder(order) {
  const status = order.status || 'processing';
  const statusLabel = status === 'successful' ? '✓ successful' : status === 'failed' ? '× refunded / failed' : '… processing';
  const label = String(order.kind || 'purchase').replaceAll('_', ' ');
  const detail = order.details?.plan || order.details?.phone || order.details?.customer || order.details?.accountId || order.details?.giftCard || '';
  const created = new Date(order.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  return `<div class="activity-item"><div><div class="activity-title">${escapeHtml(label)}</div><div class="activity-meta">${escapeHtml(detail)} · ${escapeHtml(created)}</div><span class="status-chip status-${escapeHtml(status)}">${escapeHtml(statusLabel)}</span></div><div class="activity-amount">${formatNaira(order.amount)}</div></div>`;
}

function renderRecent(orders) {
  const root = document.getElementById('recent-list');
  if (!orders.length) {
    root.innerHTML = '<div class="empty-state">No orders yet. Your next purchase will appear here.</div>';
    return;
  }
  root.innerHTML = orders.slice(0, 5).map(renderOrder).join('');
}

async function loadHistory() {
  try {
    const result = await API.get('/api/orders/transactions');
    const orders = result.orders || [];
    document.getElementById('history-list').innerHTML = orders.length ? orders.map(renderOrder).join('') : '<div class="empty-state">No transactions yet.</div>';
    renderRecent(orders);
    await loadNotifications();
  } catch (error) {
    showAlert(appAlert(), error.message);
  }
}

async function fundWallet() {
  const form = document.getElementById('fund-form');
  const button = form.querySelector('button[type="submit"]');
  const amount = Number(new FormData(form).get('amount'));
  const alert = document.getElementById('fund-error');
  button.disabled = true;
  try {
    const result = await API.post('/api/wallet/paystack/initialize', { amount });
    if (result.demo) {
      await API.post('/api/wallet/demo-credit', { amount, reference: result.reference });
      closeFundModal();
      form.reset();
      await refreshUser();
      await loadNotifications();
      showResult({ type: 'success', title: 'Wallet funded', message: `Demo wallet funding of ${formatNaira(amount)} was completed.` , amount, reference: result.reference });
    } else if (result.authorization_url) {
      location.href = result.authorization_url;
    } else {
      throw new Error('The payment provider did not return a checkout link.');
    }
  } catch (error) {
    showAlert(alert, error.message);
  } finally {
    button.disabled = false;
  }
}

async function updateDataPlans() {
  const networkSelect = document.getElementById('data-network');
  const planSelect = document.getElementById('data-plan');
  const continueButton = document.querySelector('#data-form button[type="submit"]');
  const note = document.getElementById('plan-source-label');
  const summary = document.getElementById('data-summary');
  const network = networkSelect.value;
  const requestId = ++appState.planRequestId;
  planSelect.disabled = true;
  continueButton.disabled = true;
  planSelect.innerHTML = '<option value="">Loading plans…</option>';
  note.textContent = 'Loading available plans…';
  summary.textContent = 'Checking current plan prices.';
  try {
    const result = await API.get(`/api/catalog/data-plans?network=${encodeURIComponent(network)}`);
    if (requestId !== appState.planRequestId) return;
    const plans = (result.plans || []).slice().sort((a, b) => Number(a.amount) - Number(b.amount) || String(a.label).localeCompare(String(b.label)));
    appState.plansByNetwork[network] = plans;
    if (!plans.length) {
      planSelect.innerHTML = '<option value="">No plans currently available</option>';
      summary.textContent = 'No plans are available for this network right now.';
      note.textContent = 'Please try another network later.';
      return;
    }
    planSelect.innerHTML = plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.label)} · ${formatNaira(plan.amount)}</option>`).join('');
    if (result.source === 'static') {
      note.textContent = `${plans.length} plans transcribed from your video. Display only—live purchases need matching supplier plan codes.`;
    } else if (result.source === 'vtu.ng') {
      note.textContent = `${plans.length} current plans from VTU.ng. Price includes your configured markup.`;
    } else {
      note.textContent = `${plans.length} sample plans in demo mode; switch live VTU.ng settings to load your account’s full catalogue.`;
    }
    planSelect.disabled = false;
    continueButton.disabled = result.canPurchase === false;
    updatePlanSummary();
  } catch (error) {
    if (requestId !== appState.planRequestId) return;
    planSelect.innerHTML = '<option value="">Plans could not be loaded</option>';
    continueButton.disabled = true;
    summary.textContent = 'Unable to load plans. Please try again.';
    note.textContent = error.message;
  }
}

function updatePlanSummary() {
  const network = document.getElementById('data-network').value;
  const plan = (appState.plansByNetwork[network] || []).find((item) => item.id === document.getElementById('data-plan').value);
  document.getElementById('data-summary').textContent = plan ? `${plan.label} · ${formatNaira(plan.amount)}` : 'Choose a plan to see its price.';
}

async function populateCatalog() {
  const { networks, bettingPlatforms, tvProviders, examPins, electricity } = appState.catalog;
  const network = document.getElementById('data-network');
  network.innerHTML = networks.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  network.addEventListener('change', updateDataPlans);
  document.getElementById('data-plan').addEventListener('change', updatePlanSummary);
  await updateDataPlans();
  document.getElementById('bet-platform').innerHTML = bettingPlatforms.map((item) => `<option>${escapeHtml(item)}</option>`).join('');
  const billService = document.getElementById('bill-service');
  const provider = document.getElementById('bill-provider');
  const updateProvider = () => {
    const map = { electricity, tv: tvProviders, exam_pin: examPins };
    provider.innerHTML = (map[billService.value] || []).map((item) => `<option>${escapeHtml(item)}</option>`).join('');
  };
  billService.addEventListener('change', updateProvider);
  updateProvider();
}

async function loadNotifications() {
  const list = document.getElementById('notification-list');
  if (!list) return;
  try {
    const result = await API.get('/api/notifications');
    const items = result.notifications || [];
    const count = Number(result.unreadCount || 0);
    const badge = document.getElementById('notification-count');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count === 0);
    document.getElementById('notification-summary').textContent = count ? `${count} unread update${count === 1 ? '' : 's'}` : 'You’re up to date';
    list.innerHTML = items.length ? items.map((item) => {
      const date = new Date(item.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      return `<article class="notification-item ${item.readAt ? '' : 'unread'}"><span class="notification-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><small>${escapeHtml(date)}</small></div></article>`;
    }).join('') : '<div class="empty-state">No notifications yet. Sign-ins, purchases and wallet funding updates will show here.</div>';
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function toggleNotifications(force) {
  const panel = document.getElementById('notification-panel');
  const button = document.getElementById('notifications-toggle');
  const open = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  button.setAttribute('aria-expanded', String(open));
  if (open) loadNotifications();
}

function setNotificationListeners() {
  document.getElementById('notifications-toggle').addEventListener('click', () => toggleNotifications());
  document.getElementById('notifications-read').addEventListener('click', async () => {
    try {
      await API.post('/api/notifications/read', {});
      await loadNotifications();
    } catch (error) {
      showAlert(appAlert(), error.message);
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-shell')) toggleNotifications(false);
  });
}

function bindPurchase(formId, buildAction) {
  document.getElementById(formId).addEventListener('submit', (event) => {
    event.preventDefault();
    if (formId === 'data-form' && (document.getElementById('data-plan').disabled || document.querySelector('#data-form button[type="submit"]').disabled)) return;
    const payload = formData(event.target);
    openPinModal((pin) => buildAction(payload, pin));
  });
}

function attachForms() {
  document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
  document.querySelectorAll('[data-action="open-fund"]').forEach((item) => item.addEventListener('click', openFundModal));
  document.querySelectorAll('[data-action="close-modal"]').forEach((item) => item.addEventListener('click', closeModal));
  document.querySelectorAll('[data-action="close-fund"]').forEach((item) => item.addEventListener('click', closeFundModal));
  document.getElementById('logout').addEventListener('click', async () => {
    await API.post('/api/auth/logout', {});
    location.href = '/pages/login.html';
  });
  document.getElementById('result-done').addEventListener('click', closeResult);
  document.getElementById('result-fund').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
    openFundModal();
  });
  document.getElementById('fund-form').addEventListener('submit', (event) => {
    event.preventDefault();
    fundWallet();
  });
  setNotificationListeners();

  document.getElementById('password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = formData(form);
    const alert = document.getElementById('password-alert');
    if (data.newPassword !== data.confirmPassword) return showAlert(alert, 'The new passwords do not match.');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await API.post('/api/auth/change-password', { currentPassword: data.currentPassword, newPassword: data.newPassword });
      form.reset();
      showAlert(alert, result.message, 'success');
    } catch (error) {
      showAlert(alert, error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('wallet-pin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = formData(form);
    const alert = document.getElementById('pin-change-alert');
    if (data.newPin !== data.confirmPin) return showAlert(alert, 'The new payment PINs do not match.');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await API.post('/api/auth/change-pin', { currentPin: data.currentPin, newPin: data.newPin });
      form.reset();
      showAlert(alert, result.message, 'success');
    } catch (error) {
      showAlert(alert, error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('pin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = appState.pending;
    if (!action) return;
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await action(document.getElementById('pin-value').value);
      closeModal();
      renderBalance(result.balance);
      await loadHistory();
      const type = result.status === 'processing' ? 'processing' : 'success';
      showResult({ type, title: type === 'success' ? 'Purchase successful' : 'Order received', message: result.message, amount: result.order?.amount, reference: result.order?.providerReference || result.order?.id });
    } catch (error) {
      if (error.status === 402 || error.body?.code === 'INSUFFICIENT_BALANCE') {
        closeModal();
        showResult({ type: 'insufficient', title: 'Insufficient balance', message: 'Your wallet does not have enough funds for this purchase. Fund your wallet to continue.' });
      } else if (error.status === 401 && /PIN/i.test(error.message)) {
        showAlert(document.getElementById('pin-error'), error.message);
      } else {
        closeModal();
        showResult({ type: 'failed', title: 'Purchase not completed', message: error.message || 'Please check your transaction history before trying again.' });
      }
    } finally {
      button.disabled = false;
    }
  });

  bindPurchase('data-form', (payload, pin) => API.post('/api/orders/data', { ...payload, pin }));
  bindPurchase('airtime-form', (payload, pin) => API.post('/api/orders/airtime', { ...payload, pin }));
  bindPurchase('bills-form', (payload, pin) => API.post('/api/orders/bills', { ...payload, pin }));

  document.getElementById('verify-bet').addEventListener('click', async () => {
    const platform = document.getElementById('bet-platform').value;
    const accountId = document.getElementById('bet-account').value.trim();
    const resultBox = document.getElementById('bet-result');
    try {
      const result = await API.post('/api/orders/betting/verify', { platform, accountId });
      resultBox.textContent = `${result.message} ${result.accountName}`;
      resultBox.className = 'verify-result success';
      resultBox.classList.remove('hidden');
      document.getElementById('bet-form').classList.remove('hidden');
    } catch (error) {
      resultBox.textContent = error.message;
      resultBox.className = 'verify-result fail';
      resultBox.classList.remove('hidden');
      document.getElementById('bet-form').classList.add('hidden');
    }
  });

  document.getElementById('bet-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = formData(event.target);
    payload.platform = document.getElementById('bet-platform').value;
    payload.accountId = document.getElementById('bet-account').value.trim();
    openPinModal((pin) => API.post('/api/orders/betting/fund', { ...payload, pin }));
  });
}

async function refreshUser() {
  const result = await API.get('/api/auth/me');
  appState.user = result.user;
  document.getElementById('user-name').textContent = result.user.name;
  document.getElementById('heading-name').textContent = result.user.name.split(' ')[0];
  renderBalance(result.user.walletBalance);
}

(async function init() {
  try {
    await refreshUser();
    appState.catalog = await API.get('/api/catalog');
    await populateCatalog();
    attachForms();
    await loadHistory();
    await loadNotifications();
    const reference = new URLSearchParams(location.search).get('reference');
    if (reference) {
      const result = await API.get(`/api/wallet/paystack/verify/${encodeURIComponent(reference)}`);
      await refreshUser();
      showResult({ type: 'success', title: 'Wallet funded', message: result.message, amount: result.amount, reference });
      history.replaceState({}, document.title, '/pages/dashboard.html');
    }
  } catch (error) {
    location.href = '/pages/login.html';
  }
})();
