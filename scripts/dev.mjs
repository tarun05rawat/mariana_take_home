import { spawn } from "node:child_process";

const commands = [
  { label: "server", command: "npm", args: ["run", "dev:server"] },
  { label: "client", command: "npm", args: ["run", "dev:client"] },
];

const children = commands.map(({ label, command, args }) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

process.on("SIGINT", () => {
  children.forEach((child) => child.kill("SIGINT"));
  process.exit(0);
});
