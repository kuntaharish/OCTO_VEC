#!/bin/bash
# VEC-ATP full reset — run after stopping npm start
cd "$(dirname "$0")/.."

echo "Clearing tasks DB..."
rm -f data/atp.db data/atp.db-shm data/atp.db-wal

echo "Clearing message queues and logs..."
rm -f data/pm_queue.json data/agent_messages.json data/events.json
rm -f data/chat-log.json data/message_flow.json

echo "Clearing agent conversation histories..."
rm -f data/agent-history/pm.json data/agent-history/dev.json data/agent-history/ba.json

echo "Clearing agent memory (STM only, keeping LTM/SLTM)..."
find memory -name "stm.md" -delete

echo "Clearing workspace projects..."
rm -rf workspace/projects/* workspace/shared/* workspace/agents/*/

echo "Done. Run: npm start"
