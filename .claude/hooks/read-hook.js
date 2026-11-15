// PreToolUse hook for Read and Grep (wired in .claude/settings.json).
// Blocks the Read and Grep tools on .env files so secrets never enter the agent's context.
// Example files such as .env.example stay readable, since they hold no secrets.
// It does not cover the shell. A `cat .env` through the Bash tool still reads the file.
// Exit code 2 tells Claude Code to block the tool call and show stderr to the agent.
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const toolArgs = JSON.parse(Buffer.concat(chunks).toString());

  // The path Claude is trying to read (Read uses file_path, Grep uses path).
  const readPath = toolArgs.tool_input?.file_path || toolArgs.tool_input?.path || "";

  if (readPath.includes(".env") && !readPath.endsWith(".example")) {
    console.error("You cannot read the .env file");
    process.exit(2);
  }
}

main();
