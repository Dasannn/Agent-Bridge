import { spawn } from "node:child_process";
import { fstatSync, writeSync } from "node:fs";

const mode = process.argv[2];
if (mode === "output") {
  writeSync(1, Buffer.from([0, 255, 10]));
  const euro = Buffer.from("€");
  writeSync(1, euro.subarray(0, 1));
  setTimeout(() => {
    writeSync(1, euro.subarray(1));
    writeSync(1, "\r\n\n");
    for (let i = 0; i < 100; i++) writeSync(1, `${i}\n`);
    setTimeout(() => {
      writeSync(1, "tail");
      writeSync(2, "stderr unchanged\n");
      process.exitCode = 7;
    }, 400);
  }, 20);
} else if (mode === "large-output") {
  const output = Buffer.alloc(Number(process.argv[3]) || 1024 * 1024);
  for (let i = 0; i < output.length; i++) output[i] = i % 256;
  let offset = 0;
  while (offset < output.length) offset += writeSync(1, output.subarray(offset, offset + 16384));
} else if (mode === "descendant" || mode === "writing-descendant") {
  const script =
    mode === "writing-descendant"
      ? 'setInterval(() => process.stdout.write("descendant output\\n"), 50); setTimeout(() => process.exit(), 2000)'
      : "setTimeout(() => {}, 2000)";
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "inherit", "ignore"],
  });
  child.unref();
  writeSync(1, `descendant:${child.pid}\n`);
  if (mode === "writing-descendant") {
    process.on("exit", () => writeSync(2, `exitAt:${Date.now()}\n`));
  }
  process.exitCode = 7;
} else if (mode === "signal") {
  writeSync(1, "ready\n");
  setInterval(() => {}, 1000);
} else if (mode === "stdio") {
  writeSync(1, `${String(fstatSync(1).ino) === process.env.PARENT_STDOUT_INO}\n`);
  process.stdin.pipe(process.stdout);
} else {
  writeSync(1, "hello\n");
}
