/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");

const args = process.argv.slice(2);
const command = args[0];
if (
  (command === "dev" || command === "build") &&
  !args.includes("--webpack") &&
  !args.includes("--turbo") &&
  !args.includes("--turbopack")
) {
  args.push("--webpack");
}

const nodeOptions = [process.env.NODE_OPTIONS, "--use-openssl-ca"]
  .filter(Boolean)
  .join(" ")
  .trim();

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0",
    NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS:
      process.env.NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS ?? "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
