# VEC Demo Recording Script

A step-by-step script for recording a 3-5 minute demo video to share on Discord, Twitter/X, and other platforms.

---

## Pre-Recording Setup (do this BEFORE you hit record)

### 1. Clean slate
```bash
npm start -- --reset
# Wait for banner, then Ctrl+C to stop
```

### 2. Environment
- **Terminal**: Use a clean terminal with a nice font (e.g., Cascadia Code, JetBrains Mono).
  Font size 14-16 so text is readable in video.
- **Dashboard**: Open `http://localhost:3000` in a browser. Use a dark theme if available.
- **Screen layout**: Terminal on the left (60%), Dashboard on the right (40%).
  Or: full-screen terminal for the first half, then switch to dashboard.
- **Model**: Make sure your `.env` has a working `GROQ_API_KEY` set. Groq is fast, which keeps the demo snappy.

### 3. Recommended `.env` for demo
```env
GROQ_API_KEY=your_key_here
VEC_MODEL_PROVIDER=groq
VEC_MODEL=moonshotai/kimi-k2-instruct-0905
VEC_PM_PROACTIVE_ENABLED=0
VEC_CLI_ENABLED=1
VEC_DEBOUNCE_MS=500
```
- Proactive OFF so PM doesn't randomly talk mid-demo.
- Debounce low so responses are snappy.

### 4. Test run
Do one full run-through off-camera. If the model is rate-limited or slow, you'll know before recording.

---

## The Recording

### SCENE 1: Startup (30 seconds)

**Start recording. Terminal is visible.**

```
npm start
```

**Narration (voiceover or text overlay):**
> "This is VEC — a virtual company where AI agents work together like real employees. Let me show you."

Wait for the banner to print. It shows:
- All 9 agents initialized
- Dashboard URL
- CLI commands available

**Cut/transition to show the dashboard briefly** (Kanban view — empty board).

---

### SCENE 2: Give a task (30 seconds)

**Back to terminal. Type this:**

```
Build me a simple Python calculator that supports add, subtract, multiply, divide. It should have a CLI interface where users type expressions. Include tests.
```

**Narration:**
> "I just told the PM what I want. Watch what happens — the PM will break this down into tasks and assign them to the right people."

**What you'll see:**
- PM (Arjun) responds, acknowledges the request
- PM calls `create_and_assign_task` multiple times (you'll see `[create_and_assign_task] done` lines)
- Typically creates 2-3 tasks: one for BA (requirements), one for Dev (build + test)

**Tip:** Don't type anything else. Let the PM finish creating tasks. This takes 15-30 seconds.

---

### SCENE 3: Agents working (1-2 minutes)

**Switch to Dashboard — Kanban view.**

**Narration:**
> "On the dashboard you can see the task board. Tasks are moving from pending to in-progress as agents pick them up."

**What to show on dashboard:**
1. **Kanban view** — tasks appearing, moving through columns (pending → in_progress → completed)
2. **Live view** — click "Live" in sidebar. Shows real-time streaming of each agent's thoughts and tool calls.
3. **Activity view** — shows the event log: who called what tool, when.

**Back in terminal**, you'll see the live queue monitor printing updates:
```
[UPDATE] BA TASK-001: BA started executing TASK-001
[INFO] DEV TASK-002: Priority interrupt received...
```

**Let the agents work.** This is the "wow" moment — agents are reading tasks, writing files, running tests, messaging each other, all autonomously.

**Narration while agents work:**
> "The BA is writing requirements. The Dev is building the calculator, writing tests, and running them. They're using real file tools — reading, writing, editing code, running bash commands. No mock data."

---

### SCENE 4: Show the output (30-60 seconds)

**Once tasks complete** (you'll see `[UPDATE] DEV TASK-002: completed` in terminal), show the results.

**In terminal:**
```
/board
```
This prints the task board — all tasks should show `completed`.

**Then show the files:**
```bash
# In a separate terminal, or after stopping VEC:
ls workspace/projects/
ls workspace/shared/
cat workspace/projects/calculator/calculator.py   # or wherever Dev saved it
```

**On Dashboard:**
- Switch to **Chat view** — shows the full conversation log between you and the PM.
- Switch to **Directory view** — shows all 9 employees with their roles and status.

**Narration:**
> "The BA wrote a requirements doc, the Dev built the calculator with a CLI interface, wrote tests, ran them, and confirmed they pass. All from a single sentence."

---

### SCENE 5: Direct messaging (optional, 20 seconds)

**Show that you can talk to any agent directly:**

```
/message dev Hey Rohan, can you add a modulo operator to the calculator?
```

**Or via Dashboard**: Use the Chat view to send a message.

**Narration:**
> "I can also message any agent directly — not just the PM. The system supports agent-to-agent messaging, priority interrupts, and memory across sessions."

---

### SCENE 6: Closing (15 seconds)

**Show the dashboard one last time — full Kanban board with completed tasks.**

**Narration:**
> "VEC runs on any LLM provider — Groq, OpenAI, Anthropic. 9 specialized agents, real file I/O, inter-agent messaging, persistent memory, and a live dashboard. Open source — link in the description."

```
/quit
```

---

## Backup Demo Scenarios

If the calculator demo doesn't land well, try one of these:

### Option B: Documentation task (simpler, more reliable)
```
Analyze this codebase and write a comprehensive README.md for it.
The project is in projects/my-app/ — check what's there and document it.
```
(Pre-seed `workspace/projects/my-app/` with a small Node.js app before recording.)

### Option C: Multi-agent coordination showcase
```
I need a competitive analysis of the top 5 project management tools.
BA should write the analysis, and TechWriter should create a polished report from it.
```
Shows BA → TechWriter handoff via shared/ folder.

### Option D: Quick "hello" (30-second clip for Twitter/X)
```
Hey Arjun, who's on the team? Give me a quick rundown.
```
PM responds with the full team roster. Quick, reliable, shows personality.

---

## Post-Production Tips

1. **Speed up** the waiting parts (agents thinking) to 2-4x. Keep the typing and output at 1x.
2. **Add text overlays** explaining what's happening during the "agents working" phase:
   - "BA is writing requirements..."
   - "Dev is building the calculator..."
   - "Dev is running tests..."
3. **Background music**: Lo-fi or ambient. Nothing distracting.
4. **Thumbnail**: Screenshot of the dashboard with tasks in multiple columns + terminal with the banner.
5. **Video length**:
   - Twitter/X: 60-90 seconds (use Option D or heavily edited version)
   - Discord/YouTube: 3-5 minutes (full demo)

---

## Talking Points for Posts

**One-liner:**
> Built a virtual company where 9 AI agents (PM, Dev, BA, QA, Security, DevOps, Architect, Researcher, TechWriter) work together autonomously. You talk to the PM, they handle the rest.

**Key features to highlight:**
- 9 specialized agents with distinct personalities and expertise
- Real file I/O (agents read/write/edit actual files, run bash commands)
- Inter-agent messaging (agents coordinate like real coworkers)
- SQLite task tracking with ATP (Agent Task Protocol)
- Live dashboard with Kanban, activity feed, and streaming views
- Persistent memory (agents remember across sessions, daily journal/sunrise)
- Works with any LLM (Groq, OpenAI, Anthropic, etc.)
- Agent sandbox (agents can't access each other's private folders)
- Built with TypeScript on @mariozechner's pi-agent-core

**Hashtags:** #AI #MultiAgent #LLM #OpenSource #TypeScript #AIAgents
