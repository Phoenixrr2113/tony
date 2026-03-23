#!/usr/bin/env python3
"""
Email Cleanup Script for Apple Mail via AppleScript
Identifies and bulk-deletes old/junk emails from Mac Mail.app.

Run: python3 scripts/email-cleanup.py --dry-run    (preview what would be deleted)
Run: python3 scripts/email-cleanup.py --execute     (actually delete)
"""

import subprocess
import argparse
import json
from datetime import datetime, timedelta

# --- Configuration ---
# Emails matching ANY of these rules get flagged for deletion.
# Adjust to your needs.

RULES = [
    {
        "name": "EasilyDo folders",
        "description": "All EasilyDo automated emails",
        "mailboxes": [
            "EasilyDo", "EasilyDo Deal 2", "EasilyDo Deal 3",
            "EasilyDo Receipt 3", "EasilyDo Teach 2",
        ],
        "action": "delete_all",
    },
    {
        "name": "cc-automated",
        "description": "Automated CC'd emails",
        "mailboxes": ["cc-automated"],
        "action": "delete_all",
    },
    {
        "name": "Old junk",
        "description": "Junk folder contents",
        "mailboxes": ["Junk"],
        "action": "delete_all",
    },
    {
        "name": "Old inbox (1+ year)",
        "description": "Inbox emails older than 1 year",
        "mailboxes": ["Inbox"],
        "action": "delete_older_than_days",
        "days": 365,
    },
    {
        "name": "Old archive (2+ years)",
        "description": "Archived emails older than 2 years",
        "mailboxes": ["Archive"],
        "action": "delete_older_than_days",
        "days": 730,
    },
]


def run_applescript(script: str) -> str:
    """Run an AppleScript and return stdout."""
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True, timeout=300
    )
    if result.returncode != 0:
        raise RuntimeError(f"AppleScript error: {result.stderr.strip()}")
    return result.stdout.strip()


def count_messages_in_mailbox(account: str, mailbox: str) -> int:
    """Count messages in a specific mailbox."""
    script = f'''
    tell application "Mail"
        try
            set theMailbox to mailbox "{mailbox}" of account "{account}"
            return count of messages of theMailbox
        on error
            return 0
        end try
    end tell
    '''
    result = run_applescript(script)
    try:
        return int(result)
    except ValueError:
        return 0


def count_old_messages(account: str, mailbox: str, days: int) -> int:
    """Count messages older than N days in a mailbox."""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%m/%d/%Y")
    script = f'''
    tell application "Mail"
        try
            set theMailbox to mailbox "{mailbox}" of account "{account}"
            set cutoffDate to date "{cutoff}"
            set oldMessages to (messages of theMailbox whose date received < cutoffDate)
            return count of oldMessages
        on error errMsg
            return 0
        end try
    end tell
    '''
    result = run_applescript(script)
    try:
        return int(result)
    except ValueError:
        return 0


def delete_all_in_mailbox(account: str, mailbox: str) -> int:
    """Delete all messages in a mailbox. Returns count deleted."""
    count = count_messages_in_mailbox(account, mailbox)
    if count == 0:
        return 0

    script = f'''
    tell application "Mail"
        set theMailbox to mailbox "{mailbox}" of account "{account}"
        delete (every message of theMailbox)
        return {count}
    end tell
    '''
    run_applescript(script)
    return count


def delete_old_in_mailbox(account: str, mailbox: str, days: int) -> int:
    """Delete messages older than N days. Returns count deleted."""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%m/%d/%Y")

    # Do it in batches to avoid AppleScript timeouts
    script = f'''
    tell application "Mail"
        set theMailbox to mailbox "{mailbox}" of account "{account}"
        set cutoffDate to date "{cutoff}"
        set oldMessages to (messages of theMailbox whose date received < cutoffDate)
        set msgCount to count of oldMessages
        if msgCount > 0 then
            delete oldMessages
        end if
        return msgCount
    end tell
    '''
    result = run_applescript(script)
    try:
        return int(result)
    except ValueError:
        return 0


def get_accounts() -> list[str]:
    """Get all Mail account names."""
    script = '''
    tell application "Mail"
        set acctNames to name of every account
        set output to ""
        repeat with a in acctNames
            set output to output & a & linefeed
        end repeat
        return output
    end tell
    '''
    result = run_applescript(script)
    return [a.strip() for a in result.split("\n") if a.strip()]


def main():
    parser = argparse.ArgumentParser(description="Clean up Apple Mail")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be deleted")
    parser.add_argument("--execute", action="store_true", help="Actually delete emails")
    args = parser.parse_args()

    if not args.dry_run and not args.execute:
        print("Usage: python3 email-cleanup.py --dry-run  OR  --execute")
        return

    print("📧 Email Cleanup Script")
    print("=" * 50)

    # Find the Google account
    accounts = get_accounts()
    print(f"Accounts found: {', '.join(accounts)}")

    google_account = None
    for a in accounts:
        if "google" in a.lower() or "gmail" in a.lower():
            google_account = a
            break

    if not google_account:
        # Try first account
        google_account = accounts[0] if accounts else None

    if not google_account:
        print("❌ No mail accounts found")
        return

    print(f"Using account: {google_account}")
    print()

    total_to_delete = 0

    for rule in RULES:
        print(f"📋 Rule: {rule['name']}")
        print(f"   {rule['description']}")

        for mailbox in rule["mailboxes"]:
            if rule["action"] == "delete_all":
                count = count_messages_in_mailbox(google_account, mailbox)
                if count > 0:
                    print(f"   📁 {mailbox}: {count:,} messages → DELETE ALL")
                    total_to_delete += count
                    if args.execute:
                        deleted = delete_all_in_mailbox(google_account, mailbox)
                        print(f"      ✅ Deleted {deleted:,}")
                else:
                    print(f"   📁 {mailbox}: empty")

            elif rule["action"] == "delete_older_than_days":
                days = rule["days"]
                count = count_old_messages(google_account, mailbox, days)
                if count > 0:
                    print(f"   📁 {mailbox}: {count:,} messages older than {days} days → DELETE")
                    total_to_delete += count
                    if args.execute:
                        deleted = delete_old_in_mailbox(google_account, mailbox, days)
                        print(f"      ✅ Deleted {deleted:,}")
                else:
                    print(f"   📁 {mailbox}: no messages older than {days} days")

        print()

    print("=" * 50)
    if args.dry_run:
        print(f"🔍 DRY RUN: {total_to_delete:,} emails would be deleted")
        print("   Run with --execute to actually delete them")
    else:
        print(f"✅ Cleanup complete: {total_to_delete:,} emails processed")


if __name__ == "__main__":
    main()
