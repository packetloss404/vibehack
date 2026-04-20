import * as luma from './luma.mjs';
import * as headless from './headless.mjs';
import * as devpost from './devpost.mjs';
import * as providers from './providers.mjs';
import * as aggregators from './aggregators.mjs';
import * as signups from './signups.mjs';
import * as promos from './promos.mjs';
import * as gmail from './gmail.mjs';

export const workers = { luma, headless, devpost, providers, aggregators, signups, promos, gmail };

const publicAgents = {
  vibe_events: {
    name: 'vibe_events',
    label: 'Vibe Coding Events search',
    members: ['luma', 'headless'],
  },
  hackathons: {
    name: 'hackathons',
    label: 'Hackathon events',
    members: ['devpost'],
  },
  credit_hunter: {
    name: 'credit_hunter',
    label: 'Credit hunter duties',
    members: ['providers', 'aggregators', 'signups', 'gmail'],
  },
  promos: {
    name: 'promos',
    label: 'Promos search',
    members: ['promos'],
  },
};

const statusMap = {};
for (const name of Object.keys(workers)) {
  statusMap[name] = { name, state: 'idle', lastRun: null, lastResult: null, lastError: null, runs: 0 };
}

/** Call this from runOne AND (eventually) from inside workers to track. */
async function track(name, fn) {
  const s = statusMap[name];
  if (!s) throw new Error('unknown worker: ' + name);
  s.state = 'busy';
  try {
    const r = await fn();
    s.lastRun = new Date().toISOString();
    s.lastResult = r;
    s.lastError = null;
    s.runs++;
    s.state = 'running';
    return r;
  } catch (e) {
    s.lastError = e.message;
    s.state = 'error';
    throw e;
  }
}

export function status() {
  return Object.values(publicAgents).map((agent) => {
    const members = agent.members.map((name) => statusMap[name]).filter(Boolean);
    const state = members.some((row) => row.state === 'busy')
      ? 'busy'
      : members.some((row) => row.state === 'error')
        ? 'error'
        : members.some((row) => row.state === 'running')
          ? 'running'
          : 'idle';
    const lastRun = members.map((row) => row.lastRun).filter(Boolean).sort().slice(-1)[0] || null;
    const lastError = members.map((row) => row.lastError).filter(Boolean).slice(-1)[0] || null;
    const runs = members.reduce((sum, row) => sum + (row.runs || 0), 0);
    return {
      name: agent.name,
      label: agent.label,
      state,
      lastRun,
      lastError,
      runs,
      members: agent.members,
    };
  });
}

export function startAll() {
  for (const [name, w] of Object.entries(workers)) {
    try {
      w.start?.();
      if (statusMap[name].state === 'idle') statusMap[name].state = 'running';
    } catch (e) {
      console.error(`[workers] ${name} failed to start:`, e);
      statusMap[name].lastError = e.message;
    }
  }
}

export async function runOne(name) {
  const agent = publicAgents[name];
  if (agent) {
    const results = {};
    for (const member of agent.members) {
      results[member] = await track(member, () => workers[member].run());
    }
    return results;
  }
  const w = workers[name];
  if (!w) throw new Error('no such worker: ' + name);
  return track(name, () => w.run());
}
