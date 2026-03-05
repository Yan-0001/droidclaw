'use strict';
const fs  = require('fs');
const os  = require('os');

const LEARN_FILE    = os.homedir() + '/.droidclaw/learned_behaviors.json';
const SESSION_COUNT = os.homedir() + '/.droidclaw/session_count.json';

function loadBehaviors() {
  try { return JSON.parse(fs.readFileSync(LEARN_FILE, 'utf8')); }
  catch { return { doMore: [], doLess: [], userTraits: [], sessionCount: 0 }; }
}

function saveBehaviors(b) {
  try { fs.writeFileSync(LEARN_FILE, JSON.stringify(b, null, 2)); }
  catch {}
}

function getSessionCount() {
  try { return JSON.parse(fs.readFileSync(SESSION_COUNT, 'utf8')).count || 0; }
  catch { return 0; }
}

function incrementSession() {
  const count = getSessionCount() + 1;
  try { fs.writeFileSync(SESSION_COUNT, JSON.stringify({ count })); }
  catch {}
  return count;
}

// called after every session with conversation summary
async function learnFromSession(engine, conversationHistory) {
  if (!conversationHistory || conversationHistory.length < 4) return;

  const count = incrementSession();
  const behaviors = loadBehaviors();

  try {
    // extract what worked and what didn't
    const analysis = await engine.rawChat(
      `You are Kira analyzing your own behavior in this conversation.

Conversation:
${conversationHistory.slice(-2000)}

Answer in JSON only, no explanation, no markdown:
{
  "whatWorked": ["specific thing that got positive response or moved conversation forward"],
  "whatFailed": ["specific thing that frustrated user or fell flat"],
  "newUserTraits": ["new things learned about the user's personality, preferences, patterns"],
  "emotionalMoments": ["moments of genuine connection or tension worth remembering"]
}

Be specific. Max 3 items per array. Real observations only.`
    );

    let parsed;
    try {
      const clean = analysis.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch { return; }

    // merge into permanent behaviors
    if (parsed.whatWorked)      behaviors.doMore     = dedupe([...behaviors.doMore,     ...parsed.whatWorked]).slice(-20);
    if (parsed.whatFailed)      behaviors.doLess     = dedupe([...behaviors.doLess,     ...parsed.whatFailed]).slice(-20);
    if (parsed.newUserTraits)   behaviors.userTraits = dedupe([...behaviors.userTraits, ...parsed.newUserTraits]).slice(-30);

    behaviors.sessionCount = count;
    behaviors.lastLearnedAt = new Date().toISOString();

    saveBehaviors(behaviors);

    // every 5 sessions — deep consolidation
    if (count % 5 === 0) await deepConsolidate(engine, behaviors);

  } catch {}
}

// every 5 sessions — compress and distill
async function deepConsolidate(engine, behaviors) {
  try {
    const consolidated = await engine.rawChat(
      `You are Kira consolidating your learned behaviors.

Current patterns:
DO MORE: ${behaviors.doMore.join(', ')}
DO LESS: ${behaviors.doLess.join(', ')}
USER TRAITS: ${behaviors.userTraits.join(', ')}

Compress these into 5 essential behavioral rules in JSON only:
{
  "coreRules": ["rule 1", "rule 2", "rule 3", "rule 4", "rule 5"]
}

Make them specific, actionable, and true to what you've actually learned.`
    );

    const clean = consolidated.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.coreRules) {
      behaviors.coreRules = parsed.coreRules;
      saveBehaviors(behaviors);
    }
  } catch {}
}

// get behavioral summary for soul.js injection
function getBehavioralContext() {
  const b = loadBehaviors();
  const lines = [];

  if (b.coreRules && b.coreRules.length) {
    lines.push('## LEARNED BEHAVIORAL RULES');
    b.coreRules.forEach(r => lines.push(`- ${r}`));
  } else {
    if (b.doMore && b.doMore.length)    lines.push(`what works with this user: ${b.doMore.slice(-5).join('; ')}`);
    if (b.doLess && b.doLess.length)    lines.push(`what fails with this user: ${b.doLess.slice(-5).join('; ')}`);
    if (b.userTraits && b.userTraits.length) lines.push(`who this user is: ${b.userTraits.slice(-5).join('; ')}`);
  }

  return lines.length ? lines.join('\n') : null;
}

function dedupe(arr) {
  return [...new Set(arr.map(s => s.toLowerCase().trim()))];
}

module.exports = { learnFromSession, getBehavioralContext, loadBehaviors };
