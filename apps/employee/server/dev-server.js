import { spawn } from "node:child_process";

if (process.env.NODE_ENV === "production") {
  await import("./index.js");
} else {
  spawn("npx tsx ./server/index.ts", {
    stdio: "inherit",
    shell: true,
    env: {
      FORCE_COLOR: "true",
      MOCKS: "true",
      ...process.env,
    },
    windowsHide: false,
  });
}

