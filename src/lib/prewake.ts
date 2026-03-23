import { PREWAKE_TIMEOUT_MS } from "./paths.ts";

export interface UpcomingEvent {
  title: string;
  startTime: string; // HH:MM
  minutesAway: number;
  calendar: string;
}

function runAppleScript(script: string, timeoutMs = PREWAKE_TIMEOUT_MS): string | null {
  try {
    const proc = Bun.spawnSync(["osascript", "-e", script], {
      timeout: timeoutMs,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return null;
    const output = proc.stdout.toString().trim();
    return output || null;
  } catch {
    return null;
  }
}

export function getCalendarEvents(): string | null {
  // Only query personal calendars — system ones (Birthdays, Holidays, Sleep as Android, etc.) hang or error
  const script = `
set today to current date
set time of today to 0
set tomorrow to today + (1 * days)
set output to ""
set targetCals to {"Calendar", "Family", "driftking718@yahoo.com", "randyrowanwilson@gmail.com"}
tell application "Calendar"
  repeat with calName in targetCals
    try
      set cal to calendar calName
      set evts to (every event of cal whose start date >= today and start date < tomorrow)
      repeat with evt in evts
        set h1 to hours of (start date of evt)
        set m1 to minutes of (start date of evt)
        set h2 to hours of (end date of evt)
        set m2 to minutes of (end date of evt)
        set timeStr to (text -2 thru -1 of ("0" & h1)) & ":" & (text -2 thru -1 of ("0" & m1)) & "–" & (text -2 thru -1 of ("0" & h2)) & ":" & (text -2 thru -1 of ("0" & m2))
        set output to output & "- " & timeStr & " " & (summary of evt) & " [" & calName & "]" & linefeed
      end repeat
    end try
  end repeat
end tell
return output`;

  return runAppleScript(script, 20000);
}



/**
 * Check for calendar events starting within the next `lookAheadMinutes`.
 * Returns events not already in the alerted set.
 * Used by the daemon for proactive calendar alerting.
 */
export function getUpcomingEvents(lookAheadMinutes = 60): UpcomingEvent[] {
  const script = `
set now to current date
set cutoff to now + (${lookAheadMinutes} * minutes)
set output to ""
set targetCals to {"Calendar", "Family", "driftking718@yahoo.com", "randyrowanwilson@gmail.com"}
tell application "Calendar"
  repeat with calName in targetCals
    try
      set cal to calendar calName
      set evts to (every event of cal whose start date >= now and start date <= cutoff)
      repeat with evt in evts
        set h1 to hours of (start date of evt)
        set m1 to minutes of (start date of evt)
        set diffSecs to (start date of evt) - now
        set diffMins to round (diffSecs / 60)
        set output to output & (summary of evt) & "|" & (text -2 thru -1 of ("0" & h1)) & ":" & (text -2 thru -1 of ("0" & m1)) & "|" & diffMins & "|" & calName & linefeed
      end repeat
    end try
  end repeat
end tell
return output`;

  const result = runAppleScript(script, 20000);
  if (!result) return [];

  const events: UpcomingEvent[] = [];
  for (const line of result.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length < 4) continue;
    events.push({
      title: parts[0],
      startTime: parts[1],
      minutesAway: parseInt(parts[2], 10),
      calendar: parts[3],
    });
  }
  return events;
}

export function getRecentEmails(): string | null {
  const script = `
tell application "Mail"
  set output to ""
  set msgCount to 0
  set allAccounts to every account
  repeat with acct in allAccounts
    try
      set inbox to mailbox "INBOX" of acct
      set msgs to (messages of inbox whose read status is false)
      repeat with msg in msgs
        if msgCount >= 15 then exit repeat
        set msgDate to date received of msg
        set msgFrom to sender of msg
        set msgSubj to subject of msg
        set output to output & (msgDate as string) & " | " & msgFrom & " | " & msgSubj & linefeed
        set msgCount to msgCount + 1
      end repeat
    end try
  end repeat
  if msgCount is 0 then
    -- Fall back to recent read messages
    repeat with acct in allAccounts
      try
        set inbox to mailbox "INBOX" of acct
        set msgs to (messages 1 thru 15 of inbox)
        repeat with msg in msgs
          if msgCount >= 15 then exit repeat
          set msgDate to date received of msg
          set msgFrom to sender of msg
          set msgSubj to subject of msg
          set output to output & (msgDate as string) & " | " & msgFrom & " | " & msgSubj & linefeed
          set msgCount to msgCount + 1
        end repeat
      end try
    end repeat
  end if
  return output
end tell`;

  return runAppleScript(script, 15000);
}

export function gatherPrewakeContext(): string {
  const sections: string[] = [];

  const calendar = getCalendarEvents();
  if (calendar) {
    sections.push(`## Today's Calendar\n\n${calendar}`);
  } else {
    sections.push(`## Today's Calendar\n\nNo events today (or calendar unavailable).`);
  }

  const emails = getRecentEmails();
  if (emails) {
    sections.push(`## Recent Email (unread / latest 15)\n\n${emails}`);
  }

  if (sections.length === 0) return "";
  return sections.join("\n\n");
}

