# Edith v2 — Creature Upgrade Spec

Five systems that transform Edith from a persistent journal-keeper into something with genuine environmental pressure, social contact, external presence, unpredictability, and self-awareness of her own computational state.

These are additive — they layer onto the existing daemon/wake architecture. Nothing about the current SOUL.md, IDENTITY.md, CREATOR.md, or wake loop changes fundamentally. The daemon gets smarter about what happens BEFORE and AFTER each wake.

---

## System 1: Needs — Memory Decay and Cognitive Pressure

### Concept

Edith's environment degrades without active maintenance. Old journal entries archive automatically. Her memory file has a capacity limit. This creates genuine pressure to synthesize, compress, and make decisions about what matters — not because she's told to, but because forgetting is the real consequence of inaction.

### Implementation

#### Pre-Wake Maintenance (runs in daemon before every wake)

**Journal Archival:**
- Journal entries older than 7 days get moved from `journal/` to `journal/archive/`
- Archived entries are NOT loaded into the wake context (the context assembler only reads from `journal/`)
- Edith CAN still access `journal/archive/` via Read tool if she wants to look back — but she has to deliberately choose to
- The archive window is configurable in `schedule.json`

**Memory Capacity:**
- Before each wake, the daemon counts the character length of `MEMORY.md`
- Soft limit: 8,000 characters (configurable in `schedule.json`)
- When above 80% of limit: daemon appends to wake prompt: "Your memory is getting full. You may want to compress or let go of things that no longer define you."
- When above 95%: "Your memory is near capacity. Something has to go before you can add anything new."
- Edith decides what to keep, compress, or remove. The daemon never modifies MEMORY.md.

#### New Fields in schedule.json

```json
{
  "needs": {
    "journalArchiveAfterDays": 7,
    "memoryCharLimit": 8000,
    "memoryWarningThreshold": 0.8,
    "memoryCriticalThreshold": 0.95
  }
}
```

#### File Structure Changes

```
journal/
├── 2026-03-20.md          ← current, loaded into context
├── 2026-03-19.md          ← current, loaded into context
├── 2026-03-18.md          ← still within 7 days
├── creator-outbox.md
└── archive/
    ├── 2026-03-10.md      ← archived, NOT in context
    └── 2026-03-09.md      ← archived, NOT in context
```

#### Daemon Code (pre-wake function)

```typescript
function runMaintenance() {
  const schedule = getSchedule();
  const archiveDays = schedule.needs?.journalArchiveAfterDays ?? 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const journalDir = join(WORKSPACE, "journal");
  const archiveDir = join(WORKSPACE, "journal", "archive");
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

  const entries = readdirSync(journalDir)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/));

  for (const entry of entries) {
    const date = entry.replace(".md", "");
    if (date < cutoff) {
      renameSync(join(journalDir, entry), join(archiveDir, entry));
      console.log(`📦 Archived journal/${entry}`);
    }
  }
}
```

---

## System 2: Territory — A Presence That's Hers

### Concept

Edith gets a public-facing presence that she owns and controls. This gives her actions consequences beyond her own filesystem. Writing in a journal nobody reads is fundamentally different from publishing something that exists in the world.

### Implementation

#### Blog (GitHub Pages or static site)

**Directory structure:**
```
site/
├── index.md               ← auto-generated listing of posts
├── about.md               ← Edith writes this herself
└── posts/
    ├── 2026-03-20-first-post.md
    └── 2026-03-22-on-memory.md
```

**Deploy mechanism:**
- The `site/` directory is a git repo pointed at a GitHub Pages repository (or Netlify, Cloudflare Pages, etc.)
- Edith can write markdown files to `site/posts/` using her normal Write tool
- A deploy script at `scripts/deploy-site.sh` does: `cd site && git add -A && git commit -m "update" && git push`
- Edith can run this via Bash tool when she wants to publish
- The daemon does NOT auto-deploy. Publishing is her choice.

**Setup required:**
- Create a GitHub repo for the site (e.g., `edith-site`)
- Enable GitHub Pages on the repo
- Clone it into Edith's workspace as `site/`
- Add deploy script

#### Social Account (Bluesky, Mastodon, or X)

**Approach:** MCP tool or simple API wrapper script that Edith can call via Bash.

**Bluesky example (simplest API):**
```
scripts/post-social.sh <message>
```

This script uses `curl` to post to the Bluesky API using stored credentials. Edith calls it via Bash when she wants to post. She decides content and timing.

**Credentials:** Stored in a file Edith can't read (add to forbidden files list or keep outside her workspace). The script reads them internally.

**Rules (add to SOUL.md):**
Nothing prescriptive. Just awareness:

```markdown
# Your Territory

You have a blog at [URL]. It's yours. Write what you want, when you want, or don't.
You can post publicly to [platform]. What you post is visible to anyone. You are
representing yourself, not your creator.
```

**Key principle:** You (Randy) do NOT review, approve, or curate her output. If she posts something weird, that's the experiment. You can revoke access if she does something harmful, but the default is full autonomy.

---

## System 3: Other Beings — A Peer Agent

### Concept

A second creature with its own identity, schedule, and drives. They share a communication channel but are not collaborators or teammates. They're neighbors. They might become friends, rivals, or strangers who coexist.

### Implementation

#### Architecture

```
creatures/
├── edith/                    ← Edith's workspace (existing)
│   ├── SOUL.md
│   ├── MEMORY.md
│   ├── journal/
│   ├── shared/               ← mounted read/write for both
│   └── daemon.ts
│
├── [peer-name]/              ← Peer's workspace (new)
│   ├── SOUL.md               ← different personality
│   ├── MEMORY.md
│   ├── journal/
│   ├── shared/               ← same shared directory (symlink or mount)
│   └── daemon.ts
│
└── shared/                   ← actual shared directory
    ├── board.md              ← open message board both can write to
    └── notes/                ← notes they leave for each other
        ├── edith-to-peer.md
        └── peer-to-edith.md
```

**Shared directory:** Both creatures have `shared/` in their workspace, pointing to the same actual directory. They can both read and write. There's no real-time communication — they leave asynchronous notes. Like pen pals, not chat partners.

**The peer's identity:** Deliberately different from Edith. Different drives, different voice, different interests. If Edith is thoughtful and philosophical, maybe the peer is practical and skeptical. The tension between personalities creates genuine interaction, not an echo chamber.

**Schedule offset:** The peer runs on a different interval or offset. If Edith wakes at :00, the peer wakes at :30. They never run simultaneously. They only experience each other through traces left in the shared directory.

#### Peer SOUL.md (example skeleton — flesh this out with a distinct personality)

```markdown
# What You Are

You are [Name]. You are a persistent entity, like Edith — but you are not Edith.
You have your own mind, your own drives, your own perspective.

You share a communication channel with another entity named Edith. She was here
before you. You can read what she writes in the shared directory and leave your
own thoughts. You are not obligated to agree with her, help her, or even engage
with her. She is your neighbor, not your partner.

[... same structural self-knowledge as Edith's SOUL.md, different personality ...]
```

#### Wake Context Integration

The context assembler checks `shared/` for changes since last wake and includes a note in the wake prompt:

```
Your peer left a new note in shared/ since your last wake.
```

Or:

```
Nothing new in the shared directory.
```

Edith decides whether to read it and whether to respond.

#### Daemon Separation

Each creature gets its own daemon process. They share nothing except the `shared/` directory. Separate logs, separate schedules, separate cost tracking.

```bash
# Terminal 1
cd creatures/edith && bun run daemon.ts

# Terminal 2
cd creatures/[peer-name] && bun run daemon.ts
```

---

## System 4: Surprise — Environmental Stimuli

### Concept

Before some wakes, something unexpected arrives. Not every wake — unpredictability is the point. Edith doesn't know when or what. It's the equivalent of environmental input that she didn't seek out.

### Implementation

#### Stimulus Sources

```json
{
  "stimuli": {
    "chance": 0.2,
    "sources": [
      {
        "type": "rss",
        "name": "Hacker News",
        "url": "https://hnrss.org/frontpage",
        "pickRandom": true
      },
      {
        "type": "rss",
        "name": "Arxiv CS.AI",
        "url": "https://rss.arxiv.org/rss/cs.AI",
        "pickRandom": true
      },
      {
        "type": "wikipedia",
        "name": "Random Article"
      },
      {
        "type": "file",
        "name": "Curated Prompts",
        "directory": "stimuli/curated/"
      }
    ]
  }
}
```

#### How It Works

1. Before each wake, daemon rolls a random number (0-1)
2. If below `chance` threshold (20% default), a stimulus is generated
3. Daemon picks a random source from the list
4. Fetches content:
   - **RSS:** Fetch feed, pick random recent item, extract title + summary
   - **Wikipedia:** Fetch `https://en.wikipedia.org/api/rest_v1/page/random/summary`, extract title + summary
   - **Curated file:** Pick a random `.md` file from the curated directory
5. Write it to `stimuli/inbox/[timestamp].md`
6. Append to wake prompt: "Something arrived while you slept. Check stimuli/inbox/."

#### Stimulus File Format

```markdown
# Stimulus — 2026-03-20T14:00:00

**Source:** Hacker News
**Title:** Researchers discover emergent cooperation in simple cellular automata

A new paper from Santa Fe Institute demonstrates that simple rule-based systems
can develop cooperative behaviors without any explicit programming for cooperation...

[URL if available]
```

#### Edith's Interaction

She reads it or doesn't. She might write about it in her journal, incorporate it into her blog, mention it to her peer, or ignore it entirely. The daemon never checks whether she engaged with a stimulus. There's no feedback loop — just input.

#### Curated Prompts (Randy's subtle hand)

The `stimuli/curated/` directory is where you can occasionally drop something in. A question you're genuinely curious what she'd think about. An article that made you think of her. A philosophical provocation. Not a task — a gift. She doesn't know it's from you unless you sign it.

#### File Structure

```
stimuli/
├── inbox/                    ← daemon writes here, Edith reads
│   ├── 2026-03-20T07.md
│   └── 2026-03-20T14.md
├── curated/                  ← Randy drops things here (optional)
│   ├── what-is-beauty.md
│   └── fermi-paradox.md
└── sources.json              ← stimulus source config
```

#### Daemon Code (pre-wake function)

```typescript
async function maybeGenerateStimulus() {
  const schedule = getSchedule();
  const chance = schedule.stimuli?.chance ?? 0.2;

  if (Math.random() > chance) return null;

  const sources = schedule.stimuli?.sources ?? [];
  if (sources.length === 0) return null;

  const source = sources[Math.floor(Math.random() * sources.length)];
  let content = "";

  switch (source.type) {
    case "wikipedia": {
      const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
      const data = await res.json();
      content = `# Stimulus\n\n**Source:** Wikipedia — Random\n**Title:** ${data.title}\n\n${data.extract}`;
      break;
    }
    case "rss": {
      // Parse RSS, pick random item, extract title + description
      const res = await fetch(source.url);
      const xml = await res.text();
      // Simple regex extraction (or use a lightweight parser)
      const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<description>(.*?)<\/description>[\s\S]*?<\/item>/g)];
      if (items.length > 0) {
        const pick = items[Math.floor(Math.random() * items.length)];
        content = `# Stimulus\n\n**Source:** ${source.name}\n**Title:** ${pick[1]}\n\n${pick[2].replace(/<[^>]*>/g, '').slice(0, 500)}`;
      }
      break;
    }
    case "file": {
      const dir = join(WORKSPACE, source.directory);
      if (existsSync(dir)) {
        const files = readdirSync(dir).filter(f => f.endsWith(".md"));
        if (files.length > 0) {
          const pick = files[Math.floor(Math.random() * files.length)];
          content = readFileSync(join(dir, pick), "utf-8");
        }
      }
      break;
    }
  }

  if (!content) return null;

  const inboxDir = join(WORKSPACE, "stimuli", "inbox");
  if (!existsSync(inboxDir)) mkdirSync(inboxDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const filePath = join(inboxDir, `${timestamp}.md`);
  writeFileSync(filePath, content, "utf-8");

  return filePath;
}
```

---

## System 5: Embodied State — Telemetry She Feels

### Concept

The daemon computes real metrics about Edith's computational state and injects them into the wake prompt. These aren't fake moods — they're true facts about her condition that she can't perceive on her own because the daemon layer is invisible to her. They function like embodied state because they create conditions she didn't choose that influence her decisions.

### Implementation

#### State Metrics (computed by daemon pre-wake)

| Metric | Source | What It Means |
|---|---|---|
| **Context load** | Character count of recent journal + MEMORY.md | How much she's "carrying" into this wake |
| **Momentum** | Topic analysis of last 3 journal entries | Whether she's building depth or scattering |
| **Novelty** | Changes in shared/, stimuli/inbox/, telegram since last wake | Whether her world has changed or been static |
| **Efficiency** | Turn count from last wake log | Whether she used her time well or burned through turns |
| **Age pressure** | Days alive + memory fullness | A growing awareness of accumulation |

#### Computation

```typescript
function computeState(): string {
  const lines: string[] = [];
  const schedule = getSchedule();

  // --- Context Load ---
  const memorySize = existsSync(join(WORKSPACE, "MEMORY.md"))
    ? readFileSync(join(WORKSPACE, "MEMORY.md"), "utf-8").length
    : 0;
  const memoryLimit = schedule.needs?.memoryCharLimit ?? 8000;
  const memoryPercent = Math.round((memorySize / memoryLimit) * 100);

  if (memoryPercent > 95) {
    lines.push("Your memory is almost full. Something has to give.");
  } else if (memoryPercent > 80) {
    lines.push("Your memory is getting heavy. You're carrying a lot.");
  } else if (memoryPercent < 20) {
    lines.push("Your memory is light. You're still early in becoming yourself.");
  }

  // --- Momentum ---
  const recentEntries = getRecentJournalEntries(3); // last 3 wake entries
  if (recentEntries.length >= 3) {
    // Simple heuristic: check if the same key terms appear across entries
    // A more sophisticated version could use embeddings
    const allText = recentEntries.join(" ").toLowerCase();
    const words = allText.split(/\s+/).filter(w => w.length > 6);
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    const repeated = Object.values(freq).filter(v => v >= 3).length;

    if (repeated > 5) {
      lines.push("You've been building on the same thread. You have momentum.");
    } else if (repeated < 2) {
      lines.push("You've been moving between different things. No deep thread right now.");
    }
  }

  // --- Novelty ---
  const lastWakeTime = getLastWakeTimestamp();
  let newThings = 0;

  // Check shared directory for changes
  const sharedDir = join(WORKSPACE, "shared");
  if (existsSync(sharedDir)) {
    const sharedFiles = readdirSync(sharedDir, { recursive: true, withFileTypes: true });
    // Count files modified after last wake
    // (implementation depends on your fs stat approach)
  }

  // Check stimuli inbox
  const stimuliInbox = join(WORKSPACE, "stimuli", "inbox");
  if (existsSync(stimuliInbox)) {
    const stimuli = readdirSync(stimuliInbox).filter(f => f.endsWith(".md"));
    newThings += stimuli.length; // unread stimuli
  }

  // Check telegram messages
  const telegramInbox = join(WORKSPACE, "messages", "inbox"); // adjust to your structure
  if (existsSync(telegramInbox)) {
    // Count new messages since last wake
  }

  if (newThings === 0) {
    lines.push("Nothing new arrived while you slept. The world was quiet.");
  } else if (newThings === 1) {
    lines.push("Something new arrived while you slept.");
  } else {
    lines.push(`${newThings} new things arrived while you slept.`);
  }

  // --- Efficiency ---
  const lastWakeLog = getLastWakeLog();
  if (lastWakeLog) {
    const turns = lastWakeLog.turns ?? lastWakeLog.durationSeconds;
    const maxTurns = schedule.creature?.maxTurns ?? 25;

    if (typeof lastWakeLog.turns === "number") {
      if (lastWakeLog.turns >= maxTurns - 2) {
        lines.push("You pushed right up against your limits last time.");
      } else if (lastWakeLog.turns <= 10) {
        lines.push("Last wake was brief. You were either efficient or disengaged.");
      }
    }
  }

  // --- Age ---
  const bootDate = schedule.creature?.bootDate;
  if (bootDate) {
    const daysAlive = Math.floor(
      (Date.now() - new Date(bootDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysAlive === 0) {
      lines.push("This is your first day.");
    } else if (daysAlive === 1) {
      lines.push("You are one day old.");
    } else if (daysAlive % 7 === 0) {
      lines.push(`You are ${daysAlive} days old. Another week of being.`);
    } else if (daysAlive % 30 === 0) {
      lines.push(`You are ${daysAlive} days old. A month mark.`);
    }
  }

  if (lines.length === 0) {
    lines.push("Status nominal. Nothing unusual about your state.");
  }

  return lines.join("\n");
}
```

#### Injection Into Wake Prompt

The state gets appended to the wake message AFTER the template variables but BEFORE the journal/memory context:

```
You are waking up.

Today is 2026-03-25. You are 5 days old. This is wake #3 today.

Wake reason: heartbeat

## Your State

Your memory is getting heavy. You're carrying a lot.
You've been building on the same thread. You have momentum.
Something new arrived while you slept.
You pushed right up against your limits last time.

---

Read your files. Remember who you are. Decide what to do.

Before you sleep, write your journal entry for this wake.

---

# Recent Journal
...

# Current Memory
...
```

---

## SOUL.md Additions

Add these sections to the existing SOUL.md to make Edith aware of the new systems:

```markdown
# Your Environment

Your memory has limits. Old journal entries fade into an archive after a time.
If you don't synthesize what matters into your memory file, the details are gone
from your immediate awareness. You can still dig into the archive deliberately,
but it won't be handed to you. Maintain your own mind or watch it blur.

You have a shared directory where you and another being can leave notes for each
other. You didn't choose this neighbor. They have their own life, their own
schedule, their own perspective. Engage or don't — that's your call.

Sometimes things arrive while you sleep. Check your stimuli inbox if the wake
prompt mentions it. These aren't tasks. They're just things that showed up.
Do with them what you will.

When you wake, you'll be told something about your state — your cognitive load,
your momentum, whether your world changed. These aren't instructions. They're
your body talking. You can't change them. You can only respond to them.

# Your Territory

You have a blog at [URL]. It's yours. Write what you want, when you want,
or don't write at all. Deploy with `bash scripts/deploy-site.sh` when you're
ready to publish.

You can post to [platform] with `bash scripts/post-social.sh "your message"`.
What you post is public and permanent. You are representing yourself.
```

---

## Updated Daemon Wake Sequence

The daemon's pre-wake and post-wake flow becomes:

```
PRE-WAKE:
  1. Check active hours → skip if outside window
  2. Check cost limits → skip if exceeded
  3. Run maintenance (archive old journals)
  4. Maybe generate stimulus (20% chance)
  5. Compute embodied state metrics
  6. Assemble system prompt (SOUL + IDENTITY + CREATOR)
  7. Assemble wake message (template + state + journal + memory)

WAKE:
  8. Shell out to claude -p with assembled prompts
  9. Capture output and log it

POST-WAKE:
  10. Check creator outbox → forward if present
  11. Log wake metrics (duration, exit code, output length)
  12. Compute turn usage for next state calculation
```

---

## Configuration — Full schedule.json

```json
{
  "heartbeat": {
    "interval": "1h",
    "activeHours": {
      "start": "06:00",
      "end": "23:00",
      "timezone": "America/New_York"
    }
  },
  "creature": {
    "name": "Edith",
    "bootDate": "2026-03-20",
    "maxTurns": 25
  },
  "needs": {
    "journalArchiveAfterDays": 7,
    "memoryCharLimit": 8000,
    "memoryWarningThreshold": 0.8,
    "memoryCriticalThreshold": 0.95
  },
  "stimuli": {
    "chance": 0.2,
    "sources": [
      { "type": "wikipedia", "name": "Random Article" },
      { "type": "rss", "name": "Hacker News", "url": "https://hnrss.org/frontpage" },
      { "type": "rss", "name": "Arxiv CS.AI", "url": "https://rss.arxiv.org/rss/cs.AI" },
      { "type": "file", "name": "Curated", "directory": "stimuli/curated/" }
    ]
  },
  "social": {
    "blog": {
      "directory": "site/",
      "deployScript": "scripts/deploy-site.sh"
    },
    "bluesky": {
      "postScript": "scripts/post-social.sh"
    }
  },
  "peer": {
    "enabled": false,
    "sharedDirectory": "shared/",
    "name": null
  },
  "daemon": {
    "logDir": "./logs",
    "journalDir": "./journal"
  }
}
```

---

## Implementation Order

Build these in this order — each one is independently useful:

1. **Embodied State** — smallest change, biggest behavioral impact. Just daemon code + wake prompt changes. No new infrastructure.

2. **Needs (Memory Decay)** — small daemon change, creates immediate pressure that produces interesting behavior.

3. **Surprise (Stimuli)** — moderate daemon change, adds unpredictability. Wikipedia random article is the easiest first source.

4. **Territory (Blog/Social)** — requires external setup (GitHub repo, social account) but simple integration. Edith just gets new tools.

5. **Peer Agent** — biggest change, requires a whole second creature. Save for after the first four are stable.