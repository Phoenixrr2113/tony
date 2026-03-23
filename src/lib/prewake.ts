import { PREWAKE_TIMEOUT_MS } from "./paths.ts";

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
  const script = `
set today to current date
set time of today to 0
set tomorrow to today + (1 * days)
tell application "Calendar"
  set output to ""
  repeat with cal in calendars
    try
      set evts to (every event of cal whose start date ≥ today and start date < tomorrow)
      repeat with evt in evts
        set h1 to hours of (start date of evt)
        set m1 to minutes of (start date of evt)
        set h2 to hours of (end date of evt)
        set m2 to minutes of (end date of evt)
        set timeStr to (text -2 thru -1 of ("0" & h1)) & ":" & (text -2 thru -1 of ("0" & m1)) & "–" & (text -2 thru -1 of ("0" & h2)) & ":" & (text -2 thru -1 of ("0" & m2))
        set output to output & "- " & timeStr & " " & (summary of evt) & " [" & (name of cal) & "]" & linefeed
      end repeat
    end try
  end repeat
  return output
end tell`;

  return runAppleScript(script, 10000);
}



export function gatherPrewakeContext(): string {
  const sections: string[] = [];

  const calendar = getCalendarEvents();
  if (calendar) {
    sections.push(`## Today's Calendar\n\n${calendar}`);
  } else {
    sections.push(`## Today's Calendar\n\nNo events today (or calendar unavailable).`);
  }



  if (sections.length === 0) return "";
  return sections.join("\n\n");
}

