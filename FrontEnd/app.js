const API = ''; // same-origin; change to e.g. 'http://localhost:4000' if serving frontend separately

const agentTokens = {}; // agentId -> latest issued JWT (kept client-side for the demo)

async function api(path, opts = {}) {
  const res = await fetch(`${API}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function refreshAll() {
  const [summary, agents, held, ledger] = await Promise.all([
    api('/dashboard/summary'),
    api('/agents'),
    api('/transactions?status=held'),
    api('/transactions')
  ]);
  renderSummary(summary);
  renderAgents(agents);
  renderHeld(held);
  renderLedger(ledger);
}

function renderSummary(s) {
  const el = document.getElementById('summaryPills');
  el.innerHTML = `
    <div class="pill">Agents: <strong>${s.activeAgents}/${s.totalAgents}</strong> active</div>
    <div class="pill">Approved volume: <strong>$${s.totalApprovedVolume.toFixed(2)}</strong></div>
    <div class="pill">Held: <strong>${s.heldCount}</strong></div>
    <div class="pill">Declined: <strong>${s.declinedCount}</strong></div>
  `;
}

function renderAgents(agents) {
  const el = document.getElementById('agentList');
  if (agents.length === 0) {
    el.innerHTML = '<p class="hint">No agents authorized yet.</p>';
    return;
  }
  el.innerHTML = agents.map((a) => `
    <div class="card">
      <div>
        <div class="name">${a.name} <span class="badge ${a.status}">${a.status}</span></div>
        <div class="meta">Owner: ${a.ownerName} · Cap $${a.limits.perTransactionCap}/txn · $${a.limits.dailySpendCap}/day · ${a.limits.hourlyTransactionRateLimit}/hr</div>
        <div class="meta">Categories: ${a.allowedMerchantCategories.length ? a.allowedMerchantCategories.join(', ') : 'any'}</div>
      </div>
      <div class="actions">
        <button class="secondary" onclick="simulate('${a.id}')" ${a.status !== 'active' ? 'disabled' : ''}>Simulate 5 purchases</button>
        ${a.status === 'active'
          ? `<button class="danger" onclick="revokeAgent('${a.id}')">Kill switch</button>`
          : `<button class="success" onclick="reactivateAgent('${a.id}')">Reactivate</button>`}
      </div>
    </div>
  `).join('');
}

function renderHeld(held) {
  const el = document.getElementById('heldList');
  if (held.length === 0) {
    el.innerHTML = '<p class="hint">Nothing waiting on you right now.</p>';
    return;
  }
  el.innerHTML = held.map((t) => `
    <div class="card">
      <div>
        <div class="name">${t.agentName} → ${t.merchant} <span class="badge held">held · risk ${t.riskScore}</span></div>
        <div class="meta">$${t.amount.toFixed(2)} · ${t.category} · ${new Date(t.createdAt).toLocaleString()}</div>
        <div class="meta">${t.reasons.join('; ')}</div>
      </div>
      <div class="actions">
        <button class="success" onclick="decide('${t.id}','approve')">Approve</button>
        <button class="danger" onclick="decide('${t.id}','decline')">Decline</button>
      </div>
    </div>
  `).join('');
}

function renderLedger(txs) {
  const el = document.getElementById('ledgerBody');
  el.innerHTML = txs.map((t) => `
    <tr>
      <td>${new Date(t.createdAt).toLocaleTimeString()}</td>
      <td>${t.agentName}</td>
      <td>${t.merchant}</td>
      <td>${t.category}</td>
      <td>$${t.amount.toFixed(2)}</td>
      <td>${t.riskScore}</td>
      <td><span class="badge ${t.status}">${t.status}</span></td>
      <td class="reasons">${t.reasons.join('; ')}</td>
    </tr>
  `).join('');
}

async function revokeAgent(id) {
  await api(`/agents/${id}/revoke`, { method: 'POST' });
  refreshAll();
}

async function reactivateAgent(id) {
  await api(`/agents/${id}/reactivate`, { method: 'POST' });
  refreshAll();
}

async function decide(txId, action) {
  await api(`/transactions/${txId}/${action}`, { method: 'POST' });
  refreshAll();
}

async function simulate(agentId) {
  await api('/dashboard/simulate', {
    method: 'POST',
    body: JSON.stringify({ agentId, count: 5 })
  });
  refreshAll();
}

document.getElementById('agentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const categories = String(fd.get('allowedMerchantCategories') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    name: fd.get('name'),
    ownerName: fd.get('ownerName'),
    perTransactionCap: Number(fd.get('perTransactionCap')),
    dailySpendCap: Number(fd.get('dailySpendCap')),
    hourlyTransactionRateLimit: Number(fd.get('hourlyTransactionRateLimit')),
    allowedMerchantCategories: categories
  };

  const { agent, token } = await api('/agents', { method: 'POST', body: JSON.stringify(payload) });
  agentTokens[agent.id] = token;
  e.target.reset();
  e.target.querySelector('[name="perTransactionCap"]').value = 100;
  e.target.querySelector('[name="dailySpendCap"]').value = 500;
  e.target.querySelector('[name="hourlyTransactionRateLimit"]').value = 5;
  refreshAll();
});

refreshAll();
setInterval(refreshAll, 5000);
