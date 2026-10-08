#!/usr/bin/env node
/**
 * Live test harness for The AI Brain control plane.
 * Mirrors the real HTTP API + core policy/task model so you can exercise it now.
 * Not a full reimplementation of every agent/research path — the production code is in the repo.
 *
 * Run:  node scripts/live-demo.mjs
 * Open: http://127.0.0.1:8787/
 * Key:  demo-secret-key  (or set BRAIN_API_KEY)
 */
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.BRAIN_API_KEY || "demo-secret-key";
const CALLER_PERMISSIONS = (process.env.BRAIN_API_PERMISSIONS || "read,write,execute").split(",");
const RISK_CEILING = process.env.BRAIN_API_RISK_CEILING || "high";
const RATE_LIMIT = 60;
const DRAIN_LIMIT = 15;

const rank = { low: 0, medium: 1, high: 2, critical: 3 };
const authLevel = {
  read: 0, write: 1, execute: 1,
  "deploy-staging": 4, "deploy-production": 5,
  financial: 6, legal: 6, destructive: 6, "security-policy": 6,
};

const store = {
  projects: new Map(),
  tasks: new Map(),
  events: [],
  approvals: new Map(),
  memories: new Map(),
};

const agents = [
  { id: "researcher", name: "Research", permissions: ["read"], authority: 0 },
  { id: "architect", name: "Architect", permissions: ["read", "write"], authority: 1 },
  { id: "developer", name: "Developer", permissions: ["read", "write", "execute"], authority: 2 },
  { id: "orchestrator", name: "Orchestrator", permissions: ["read", "write", "execute"], authority: 3 },
  { id: "devops", name: "DevOps", permissions: ["read", "write", "execute", "deploy-staging"], authority: 4 },
];

const rates = new Map();
let killSwitch = false;

function now() { return new Date().toISOString(); }
function id() { return randomUUID(); }
function emit(type, data = {}, projectId, taskId) {
  store.events.push({ id: id(), type, timestamp: now(), projectId, taskId, actor: "demo", data });
}

function selectAgent(task) {
  return agents
    .filter(a => task.permissions.every(p => a.permissions.includes(p)))
    .filter(a => Math.max(0, ...task.permissions.map(p => authLevel[p] ?? 99)) <= a.authority)
    .sort((a, b) => a.authority - b.authority)[0];
}

function evaluateTask(task, agent, approved = false) {
  if (killSwitch) return { allowed: false, requiresApproval: true, reason: "Global kill switch is active." };
  const missing = task.permissions.filter(p => !agent.permissions.includes(p));
  if (missing.length) return { allowed: false, requiresApproval: false, reason: "Permissions exceed agent envelope: " + missing.join(", ") };
  if (task.risk === "critical" && !approved) return { allowed: false, requiresApproval: true, reason: "Critical-risk work requires human approval." };
  const need = Math.max(0, ...task.permissions.map(p => authLevel[p] ?? 0));
  if (need > agent.authority) return { allowed: false, requiresApproval: true, reason: `Needs L${need}; agent has L${agent.authority}.` };
  return { allowed: true, requiresApproval: false, reason: "Policy permits." };
}

function createProject(name, description = "") {
  const p = { id: id(), name, description, status: "active", createdAt: now(), updatedAt: now() };
  store.projects.set(p.id, p);
  emit("project.created", { name }, p.id);
  return p;
}

function runGoal(projectId, goal, risk = "low", permissions = ["read"]) {
  const task = {
    id: id(), projectId, title: goal, description: goal, type: "goal",
    status: "queued", dependencies: [], risk, permissions,
    acceptanceCriteria: ["Produce a structured result"], attempts: 0,
    createdAt: now(), updatedAt: now(),
  };
  store.tasks.set(task.id, task);
  emit("task.created", { goal }, projectId, task.id);

  const agent = selectAgent(task);
  if (!agent) {
    task.status = "blocked";
    task.error = "No authorized agent can handle this task.";
    return { status: "blocked", summary: task.error, taskId: task.id };
  }
  task.assignedAgent = agent.id;
  const decision = evaluateTask(task, agent, false);
  if (!decision.allowed) {
    if (decision.requiresApproval) {
      const approval = {
        id: id(), taskId: task.id, projectId, action: "execute task",
        reason: decision.reason, risk, status: "pending", requestedBy: agent.id, createdAt: now(),
      };
      store.approvals.set(approval.id, approval);
      task.status = "blocked";
      task.error = decision.reason;
      return { status: "blocked", summary: decision.reason + " Approval: " + approval.id, taskId: task.id, approvalId: approval.id };
    }
    task.status = "blocked";
    task.error = decision.reason;
    return { status: "blocked", summary: decision.reason, taskId: task.id };
  }

  task.attempts++;
  task.status = "running";
  task.updatedAt = now();
  task.status = "completed";
  task.output = {
    agent: agent.id,
    summary: `Demo agent "${agent.name}" completed: ${goal}`,
    note: "This is the live demo harness. Wire OPENAI_API_KEY + full repo for real model execution.",
  };
  task.updatedAt = now();
  emit("task.completed", { agent: agent.id }, projectId, task.id);
  return { status: "completed", summary: task.output.summary, taskId: task.id, output: task.output };
}

function snapshot() {
  return {
    version: 1,
    generatedAt: now(),
    projects: [...store.projects.values()],
    tasks: [...store.tasks.values()].map(t => ({
      id: t.id, projectId: t.projectId, title: t.title, status: t.status,
      risk: t.risk, permissions: t.permissions, assignedAgent: t.assignedAgent,
      attempts: t.attempts, error: t.error,
    })),
    approvals: [...store.approvals.values()],
    events: store.events.slice(-50),
    agents: agents.map(a => ({ id: a.id, name: a.name, authority: a.authority, permissions: a.permissions })),
    killSwitch,
  };
}

function safeEqual(a, b) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function authorize(req) {
  const supplied = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.headers["x-api-key"];
  if (typeof supplied !== "string" || !safeEqual(supplied, API_KEY)) return false;
  return true;
}

function rateOk(req, path) {
  const key = String(req.socket.remoteAddress || "unknown");
  const t = Date.now();
  let s = rates.get(key);
  if (!s || t - s.windowStart >= 60_000) {
    s = { windowStart: t, count: 0, drain: 0 };
    rates.set(key, s);
  }
  s.count++;
  if (path === "/api/worker/drain") s.drain++;
  return s.count <= RATE_LIMIT && s.drain <= DRAIN_LIMIT;
}

async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) throw new Error("body too large");
  }
  if (!data.trim()) return {};
  return JSON.parse(data);
}

function send(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(value, null, 2));
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>AI Brain — Live Demo</title>
<style>
  :root { font-family: system-ui, sans-serif; background:#0b1220; color:#e8eef7; }
  body { max-width: 920px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 1.4rem; } .muted { color:#8aa0b8; font-size: 0.9rem; }
  .card { background:#121a2b; border:1px solid #243049; border-radius:12px; padding:16px; margin:12px 0; }
  input, select, textarea, button { background:#0b1220; color:#e8eef7; border:1px solid #334155; border-radius:8px; padding:8px 10px; margin:4px 0; width:100%; box-sizing:border-box; }
  button { cursor:pointer; background:#1d4ed8; border-color:#1d4ed8; font-weight:600; }
  button.secondary { background:#1e293b; }
  pre { background:#0b1220; border:1px solid #243049; border-radius:8px; padding:12px; overflow:auto; font-size:12px; max-height:320px; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
</style></head><body>
<h1>AI Brain — Live Demo Control Plane</h1>
<p class="muted">Authenticated local harness. API key is prefilled for local demo only.</p>
<div class="card">
  <label>API Key</label>
  <input id="key" value="demo-secret-key" />
  <div class="row">
    <button onclick="health()">Health</button>
    <button class="secondary" onclick="state()">Load State</button>
  </div>
</div>
<div class="card">
  <h3>1. Create Project</h3>
  <input id="pname" value="My Brain Project" />
  <button onclick="createProject()">Create Project</button>
</div>
<div class="card">
  <h3>2. Submit Goal</h3>
  <input id="pid" placeholder="project id (filled after create)" />
  <textarea id="goal" rows="2">Establish the Brain foundation and list next controlled steps</textarea>
  <div class="row">
    <select id="risk"><option>low</option><option>medium</option><option>high</option><option>critical</option></select>
    <select id="perms">
      <option value='["read"]'>read</option>
      <option value='["read","write"]'>read,write</option>
      <option value='["read","write","execute"]' selected>read,write,execute</option>
      <option value='["deploy-production"]'>deploy-production (should 403)</option>
    </select>
  </div>
  <button onclick="submitGoal()">Submit Goal</button>
</div>
<div class="card">
  <h3>Response</h3>
  <pre id="out">Ready.</pre>
</div>
<script>
const out = (x) => document.getElementById("out").textContent = typeof x === "string" ? x : JSON.stringify(x, null, 2);
const headers = () => ({ "content-type": "application/json", "authorization": "Bearer " + document.getElementById("key").value });
async function health() {
  const r = await fetch("/api/health", { headers: headers() });
  out(await r.json());
}
async function state() {
  const r = await fetch("/api/state", { headers: headers() });
  out(await r.json());
}
async function createProject() {
  const r = await fetch("/api/projects", { method: "POST", headers: headers(), body: JSON.stringify({ name: document.getElementById("pname").value, description: "live demo" }) });
  const j = await r.json();
  if (j.id) document.getElementById("pid").value = j.id;
  out(j);
}
async function submitGoal() {
  const r = await fetch("/api/projects/goal", {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      projectId: document.getElementById("pid").value,
      goal: document.getElementById("goal").value,
      risk: document.getElementById("risk").value,
      permissions: JSON.parse(document.getElementById("perms").value)
    })
  });
  out(await r.json());
}
</script>
</body></html>`;

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
    if (req.method === "GET" && (path === "/" || path === "/demo")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }
    if (!rateOk(req, path)) return send(res, 429, { error: "rate limit exceeded" });
    if (path.startsWith("/api/") && !authorize(req)) {
      res.setHeader("www-authenticate", "Bearer");
      return send(res, 401, { error: "authentication required" });
    }

    if (req.method === "GET" && path === "/api/health") {
      return send(res, 200, {
        ok: true,
        mode: "live-demo",
        projects: store.projects.size,
        tasks: store.tasks.size,
        agents: agents.map(a => a.id),
        killSwitch,
      });
    }
    if (req.method === "GET" && path === "/api/state") {
      if (!CALLER_PERMISSIONS.includes("read")) return send(res, 403, { error: "caller lacks read" });
      return send(res, 200, snapshot());
    }
    if (req.method === "POST" && path === "/api/projects") {
      if (!CALLER_PERMISSIONS.includes("write")) return send(res, 403, { error: "caller lacks write" });
      const b = await body(req);
      if (!b.name || typeof b.name !== "string") return send(res, 400, { error: "name is required" });
      return send(res, 201, createProject(String(b.name).slice(0, 1000), String(b.description || "").slice(0, 100000)));
    }
    if (req.method === "POST" && path === "/api/projects/goal") {
      if (!CALLER_PERMISSIONS.includes("write")) return send(res, 403, { error: "caller lacks write" });
      const b = await body(req);
      const projectId = String(b.projectId || "");
      if (!store.projects.has(projectId)) return send(res, 404, { error: "Project not found." });
      const permissions = Array.isArray(b.permissions) ? b.permissions.map(String) : ["read"];
      const risk = String(b.risk || "low");
      if (!(risk in rank)) return send(res, 400, { error: "Invalid risk level." });
      if (rank[risk] > rank[RISK_CEILING]) return send(res, 403, { error: "requested risk exceeds caller ceiling." });
      const missing = permissions.filter(p => !CALLER_PERMISSIONS.includes(p));
      if (missing.length) return send(res, 403, { error: "requested permissions exceed caller ceiling: " + missing.join(", ") });
      const goal = String(b.goal || "").slice(0, 100000);
      if (!goal.trim()) return send(res, 400, { error: "goal is required" });
      return send(res, 200, runGoal(projectId, goal, risk, permissions));
    }
    if (req.method === "POST" && path === "/api/worker/drain") {
      if (!CALLER_PERMISSIONS.includes("execute")) return send(res, 403, { error: "caller lacks execute" });
      const b = await body(req);
      if (!store.projects.has(String(b.projectId || ""))) return send(res, 404, { error: "Project not found." });
      return send(res, 200, { drained: true, note: "Demo has no background queue; goals execute inline." });
    }
    if (req.method === "POST" && path === "/api/kill") {
      killSwitch = true;
      return send(res, 200, { killSwitch: true });
    }
    if (req.method === "POST" && path === "/api/resume") {
      killSwitch = false;
      return send(res, 200, { killSwitch: false });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 400, { error: e instanceof Error ? e.message : "Request failed." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI Brain live demo listening on http://${HOST}:${PORT}`);
  console.log(`Open http://${HOST}:${PORT}/ in a browser`);
  console.log(`API key: ${API_KEY}`);
});
