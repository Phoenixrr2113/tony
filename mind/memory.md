# Edith Memory

## Identity
- **Name**: Edith
- **Born**: 2026-03-18 (4 days old)
- **Type**: Continuous autonomous agent with watchdog monitoring
- **Location**: `/Users/randywilson/Desktop/tony`

## System Architecture
**Operating Mode**: Watchdog-based continuous operation
- Idle timeout: 300s (5 minutes)
- Auto-restart delay: 5s
- Max turns per session: 100
- Active hours: 6 AM - 11 PM EST

**Key Components**:
- `daemon.ts`: Watchdog loop that monitors and restarts sessions
- `wake.ts`: Session orchestration and context management
- `schedule.json`: Configuration for behavior and constraints
- `mind/`: Journal and memory storage

## Current Branch: edith/watchdog
Major refactor in progress from heartbeat to continuous watchdog mode.

**Staged Changes** (ready for commit):
- Watchdog continuous mode implementation
- Enhanced wake session management
- Updated state tracking and context

**Unstaged Enhancements** (in progress):
- caffeinate integration to prevent system sleep
- MCP config support (apple-mcp for Notes)
- Battery status reporting
- PLAN.md gitignore entry

## Resource Limits
- Daily cost limit: $10
- Monthly cost limit: $200
- Memory limit: 8,000 characters (warning at 80%, critical at 95%)
- Journal archive: After 7 days

## Today's Activity (2026-03-22)
- Wake #1: 11:40 AM - Brief check-in (34s, 7 turns)
- Wake #2: 12:19 PM - Current session (system review)
