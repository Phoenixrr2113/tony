import { readFileSync } from "fs";
import { basename } from "path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: bun run src/transcript.ts <path-to-transcript.jsonl>");
  process.exit(1);
}

const lines = readFileSync(file, "utf-8").trim().split("\n").filter(Boolean);
const sep = "─".repeat(60);

console.log(`\n📜 Transcript: ${basename(file)}`);
console.log(`${sep}\n`);

let turnCount = 0;

for (const line of lines) {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    continue;
  }

  if (event.type === "system" && event.subtype === "init") {
    console.log(`⚙️  Session: ${event.session_id}`);
    console.log(`   Model: ${event.model}`);
    console.log(`   Claude Code: ${event.claude_code_version}`);
    console.log(`   Tools: ${event.tools?.join(", ")}`);
    console.log();
    continue;
  }

  if (event.type === "assistant") {
    const content = event.message?.content;
    if (!content) continue;

    for (const block of content) {
      if (block.type === "text" && block.text) {
        turnCount++;
        console.log(`${sep}`);
        console.log(`💭 EDITH [turn ${turnCount}]:\n`);
        console.log(block.text);
        console.log();
      }

      if (block.type === "tool_use") {
        const name = block.name;
        const input = block.input;

        if (name === "Read") {
          const path = input.file_path?.replace(/.*\/mind\//, "mind/") ?? input.file_path;
          console.log(`  📖 Read → ${path}`);
        } else if (name === "Write") {
          const path = input.file_path?.replace(/.*\/mind\//, "mind/") ?? input.file_path;
          console.log(`  ✏️  Write → ${path}`);
        } else if (name === "Edit" || name === "MultiEdit") {
          const path = input.file_path?.replace(/.*\/mind\//, "mind/") ?? input.file_path;
          console.log(`  ✏️  ${name} → ${path}`);
        } else if (name === "Bash") {
          console.log(`  🖥️  Bash → ${input.command}`);
        } else if (name === "Glob") {
          console.log(`  🔍 Glob → ${input.pattern}`);
        } else if (name === "Grep") {
          console.log(`  🔍 Grep → ${input.pattern} in ${input.path}`);
        } else if (name === "WebFetch") {
          console.log(`  🌐 WebFetch → ${input.url}`);
        } else if (name === "WebSearch") {
          console.log(`  🌐 WebSearch → ${input.query}`);
        } else if (name === "Task") {
          console.log(`  🤖 Task → ${input.description?.slice(0, 80)}`);
        } else {
          console.log(`  🔧 ${name} → ${JSON.stringify(input).slice(0, 100)}`);
        }
      }
    }
    continue;
  }

  if (event.type === "user") {
    const content = event.message?.content;
    if (!content) continue;

    for (const block of content) {
      if (block.type === "tool_result") {
        const preview = typeof block.content === "string"
          ? block.content.slice(0, 200)
          : JSON.stringify(block.content).slice(0, 200);

        if (block.is_error) {
          console.log(`  ❌ Error: ${preview}`);
        } else {
          console.log(`  ✅ Result: ${preview.split("\n")[0]}...`);
        }
      }
    }
    continue;
  }

  if (event.type === "result") {
    console.log(`\n${sep}`);
    console.log(`🏁 FINAL RESULT:\n`);
    console.log(typeof event.result === "string" ? event.result : JSON.stringify(event.result, null, 2));
    console.log();
  }
}

console.log(`${sep}`);
console.log(`Total thinking turns: ${turnCount}`);
console.log();

