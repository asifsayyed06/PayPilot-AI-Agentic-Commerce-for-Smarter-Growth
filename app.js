// PayPilot AI frontend. Works with the Express API when available and
// automatically falls back to a local browser demo when hosted on GitHub Pages.
const API = window.PAYPILOT_API || '';
const DEMO_KEY = 'paypilot-demo-state-v2';
let demoMode = false;

const merchants = [
  { name: 'Office Depot', category: 'Office', riskScore: 15 },
  { name: 'Amazon Business', category: 'Office', riskScore: 25 },
  { name: 'CloudHost', category: 'Software', riskScore: 20 },
  { name: 'FreshMart', category: 'Groceries', riskScore: 10 },
  { name: 'Unknown Merchant', category: 'Unknown', riskScore: 80 }
];

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

function initialDemoState() {
  return { agents: [], transactions: [] };
}

function getDemoState() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY)) || initialDemoState();
  } catch (_) {
    return initialDemoState();
  }
}

function saveDemoState(state) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
}

function demoSummary(state) {
  const approved = state.transactions.filter(t => t.status === 'approved');
  return {
    totalAgents: state.agents.length,
    activeAgents: state.agents.filter(a => a.status === 'active').length,
    heldCount: state.transactions.filter(t => t.status === 'held').length,
    declinedCount: state.transactions.filter(t => t.status === 'declined').length,
    totalApprovedVolume: Number(approved.reduce((sum, t) => sum + t.amount, 0).toFixed(2))
  };
}

function evaluate(agent, merchant, amount, state) {
  const reasons = [];
  let score = merchant.riskScore || 20;
  if (amount > agent.limits.perTransactionCap) {
    score += 35;
    reasons.push('Amount exceeds per-transaction cap');
  }
  if (agent.allowedMerchantCategories.length && !agent.allowedMerchantCategories.some(c => c.toLowerCase() === merchant.category.toLowerCase())) {
    score += 35;
    reasons.push('Merchant category is not allowed');
  }
  const recent = state.transactions.filter(t => t.agentId === agent.id && Date.now() - new Date(t.createdAt).getTime() < 3600000);
  if (recent.length >= agent.limits.hourlyTransactionRateLimit) {
    score += 25;
    reasons.push('Hourly transaction limit exceeded');
  }
  const daily = state.transactions.filter(t => t.agentId === agent.id && Date.now() - new Date(t.createdAt).getTime() < 86400000);
  const dailySpend = daily.reduce((s, t) => s + t.amount, 0);
  if (dailySpend + amount > agent.limits.dailySpendCap) {
    score += 30;
    reasons.push('Daily spend cap exceeded');
  }
  if (score >= 70) return { decision: 'held', score, reasons: reasons.length ? reasons : ['High-risk transaction'] };
  if (score >= 90) return { decision: 'declined', score, reasons: reasons.length ? reasons : ['Risk score too high'] };
  return { decision: 'approved', score, reasons: reasons.length ? reasons : ['Within policy'] };
}

function demoCreateAgent(payload) {
  const state = getDemoState();
  const agent = {
    id: uid(), name: payload.name, ownerName: payload.ownerName, status: 'active',
    limits: {
      perTransactionCap: Number(payload.perTransactionCap),
      dailySpendCap: Number(payload.dailySpendCap),
      hourlyTransactionRateLimit: Number(payload.hourlyTransactionRateLimit)
    },
    allowedMerchantCategories: payload.allowedMerchantCategories,
    createdAt: new Date().toISOString()
  };
  state.agents.push(agent);
  saveDemoState(state);
  return { agent, token: `demo-${agent.id}` };
}

function demoSimulate(agentId, count = 5) {
  const state = getDemoState();
  const agent = state.agents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.status !== 'active') throw new Error('Agent is not active');
  const created = [];
  for (let i = 0; i < count; i++) {
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];
    const amount = Number((Math.random() * agent.limits.perTransactionCap * 1.3 + 1).toFixed(2));
    const result = evaluate(agent, merchant, amount, state);
    const tx = {
      id: uid(), agentId: agent.id, agentName: agent.name, merchant: merchant.name,
      category: merchant.category, amount, status: result.decision, riskScore: result.score,
      reasons: result.reasons, createdAt: new Date().toISOString(),
      decidedAt: result.decision === 'held' ? null : new Date().toISOString()
    };
    state.transactions.unshift(tx); created.push(tx);
  }
  saveDemoState(state);
  return created;
}

async function api(path, opts = {}) {
  try {
    const res = await fetch(`${API}/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed: ${res.status}`);
    return res.json();
  } catch (err) {
    if (!demoMode) {
      demoMode = true;
      showNotice('Backend unavailable — running in Browser Demo Mode. Your demo data is saved in this browser.');
      return null;
    }
    throw err;
  }
}

function showNotice(message) {
  let n = document.getElementById('appNotice');
  if (!n) {
    n = document.createElement('div'); n.id = 'appNotice'; n.className = 'app-notice';
    document.body.prepend(n);
  }
  n.textContent = message;
}

function getData() {
  const state = getDemoState();
  return { summary: demoSummary(state), agents: state.agents, held: state.transactions.filter(t => t.status === 'held'), ledger: state.transactions };
}

async function refreshAll() {
  if (!demoMode) {
    const results = await Promise.all([
      api('/dashboard/summary'), api('/agents'), api('/transactions?status=held'), api('/transactions')
    ]);
    if (results.every(Boolean)) {
      renderSummary(results[0]); renderAgents(results[1]); renderHeld(results[2]); renderLedger(results[3]); return;
    }
  }
  const d = getData(); renderSummary(d.summary); renderAgents(d.agents); renderHeld(d.held); renderLedger(d.ledger);
}

function renderSummary(s) {
  const el = document.getElementById('summaryPills');
  if (!el) return;
  el.innerHTML = `<div class="pill">Agents: <strong>${s.activeAgents}/${s.totalAgents}</strong> active</div>
    <div class="pill">Approved volume: <strong>$${Number(s.totalApprovedVolume).toFixed(2)}</strong></div>
    <div class="pill">Held: <strong>${s.heldCount}</strong></div>
    <div class="pill">Declined: <strong>${s.declinedCount}</strong></div>`;
}

function renderAgents(agents) {
  const el = document.getElementById('agentList');
  if (!agents.length) { el.innerHTML = '<p class="hint">No agents authorized yet.</p>'; return; }
  el.innerHTML = agents.map(a => `<div class="card"><div><div class="name">${escapeHtml(a.name)} <span class="badge ${a.status}">${a.status}</span></div>
    <div class="meta">Owner: ${escapeHtml(a.ownerName)} · Cap $${a.limits.perTransactionCap}/txn · $${a.limits.dailySpendCap}/day · ${a.limits.hourlyTransactionRateLimit}/hr</div>
    <div class="meta">Categories: ${a.allowedMerchantCategories.length ? a.allowedMerchantCategories.map(escapeHtml).join(', ') : 'any'}</div></div>
    <div class="actions"><button class="secondary" onclick="simulate('${a.id}')" ${a.status !== 'active' ? 'disabled' : ''}>Simulate 5 purchases</button>
    ${a.status === 'active' ? `<button class="danger" onclick="revokeAgent('${a.id}')">Kill switch</button>` : `<button class="success" onclick="reactivateAgent('${a.id}')">Reactivate</button>`}</div></div>`).join('');
}

function renderHeld(held) {
  const el = document.getElementById('heldList');
  if (!held.length) { el.innerHTML = '<p class="hint">Nothing waiting on you right now.</p>'; return; }
  el.innerHTML = held.map(t => `<div class="card"><div><div class="name">${escapeHtml(t.agentName)} → ${escapeHtml(t.merchant)} <span class="badge held">held · risk ${t.riskScore}</span></div>
    <div class="meta">$${t.amount.toFixed(2)} · ${escapeHtml(t.category)} · ${new Date(t.createdAt).toLocaleString()}</div><div class="meta">${t.reasons.map(escapeHtml).join('; ')}</div></div>
    <div class="actions"><button class="success" onclick="decide('${t.id}','approve')">Approve</button><button class="danger" onclick="decide('${t.id}','decline')">Decline</button></div></div>`).join('');
}

function renderLedger(txs) {
  const el = document.getElementById('ledgerBody');
  el.innerHTML = txs.map(t => `<tr><td>${new Date(t.createdAt).toLocaleTimeString()}</td><td>${escapeHtml(t.agentName)}</td><td>${escapeHtml(t.merchant)}</td><td>${escapeHtml(t.category)}</td><td>$${t.amount.toFixed(2)}</td><td>${t.riskScore}</td><td><span class="badge ${t.status}">${t.status}</span></td><td class="reasons">${t.reasons.map(escapeHtml).join('; ')}</td></tr>`).join('');
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function revokeAgent(id) {
  if (!demoMode) { const r = await api(`/agents/${id}/revoke`, { method: 'POST' }); if (r) return refreshAll(); }
  const s = getDemoState(), a = s.agents.find(x => x.id === id); if (a) { a.status = 'revoked'; saveDemoState(s); }
  refreshAll();
}

async function reactivateAgent(id) {
  if (!demoMode) { const r = await api(`/agents/${id}/reactivate`, { method: 'POST' }); if (r) return refreshAll(); }
  const s = getDemoState(), a = s.agents.find(x => x.id === id); if (a) { a.status = 'active'; saveDemoState(s); }
  refreshAll();
}

async function decide(txId, action) {
  if (!demoMode) { const r = await api(`/transactions/${txId}/${action}`, { method: 'POST' }); if (r) return refreshAll(); }
  const s = getDemoState(), t = s.transactions.find(x => x.id === txId);
  if (t && t.status === 'held') { t.status = action === 'approve' ? 'approved' : 'declined'; t.decidedAt = new Date().toISOString(); t.reasons.push(action === 'approve' ? 'Manually approved by human owner' : 'Manually declined by human owner'); saveDemoState(s); }
  refreshAll();
}

async function simulate(agentId) {
  if (!demoMode) { const r = await api('/dashboard/simulate', { method: 'POST', body: JSON.stringify({ agentId, count: 5 }) }); if (r) return refreshAll(); }
  demoSimulate(agentId, 5); refreshAll();
}

window.revokeAgent = revokeAgent; window.reactivateAgent = reactivateAgent; window.decide = decide; window.simulate = simulate;

document.getElementById('agentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    name: fd.get('name'), ownerName: fd.get('ownerName'), perTransactionCap: Number(fd.get('perTransactionCap')),
    dailySpendCap: Number(fd.get('dailySpendCap')), hourlyTransactionRateLimit: Number(fd.get('hourlyTransactionRateLimit')),
    allowedMerchantCategories: String(fd.get('allowedMerchantCategories') || '').split(',').map(s => s.trim()).filter(Boolean)
  };
  if (!demoMode) { const r = await api('/agents', { method: 'POST', body: JSON.stringify(payload) }); if (r) { e.target.reset(); setDefaults(e.target); return refreshAll(); } }
  demoCreateAgent(payload); e.target.reset(); setDefaults(e.target); refreshAll();
});

function setDefaults(form) {
  form.querySelector('[name="perTransactionCap"]').value = 100;
  form.querySelector('[name="dailySpendCap"]').value = 500;
  form.querySelector('[name="hourlyTransactionRateLimit"]').value = 5;
}

// Start in API mode, then transparently fall back to browser demo mode if API calls fail.
refreshAll().catch(() => { demoMode = true; refreshAll(); });
setInterval(() => refreshAll().catch(() => {}), 5000);
