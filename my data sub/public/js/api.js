window.API = {
  async request(path, options = {}) {
    const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || 'Something went wrong.'); error.status = response.status; error.body = body; throw error; }
    return body;
  },
  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); }
};
window.formatNaira = (amount) => `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
window.escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
window.showAlert = (element, message, type = 'error') => { if (!element) return; element.textContent = message; element.className = `alert ${type}`; element.classList.remove('hidden'); };
