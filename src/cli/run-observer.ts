import { type ClientRequest, request } from "node:http";
import { StringDecoder } from "node:string_decoder";

/** Invalid destinations disable observation, including HTTPS and non-loopback hosts. */
export function observerUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "http:" &&
      ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) &&
      !url.username &&
      !url.password
    ) {
      // Keep localhost on loopback without depending on the machine's DNS configuration.
      if (url.hostname === "localhost") url.hostname = "127.0.0.1";
      return url;
    }
  } catch {
    // Observation must never prevent a run.
  }
  return undefined;
}

export function runObserver(url: URL, agent: string, pid: number, args: string[]) {
  let stopped = false;
  const pending = new Map<ClientRequest, () => void>();
  const decoder = new StringDecoder("utf8");
  let partial = "";
  let lines: string[] = [];

  const stop = () => {
    stopped = true;
    partial = "";
    lines = [];
    for (const [req, finish] of pending) {
      req.destroy();
      finish();
    }
  };
  const post = (event: object) => {
    if (stopped) return;
    try {
      const body = JSON.stringify(event);
      const req = request(url, {
        method: "POST",
        agent: false,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      });
      const timer = setTimeout(stop, 1000);
      timer.unref();
      req.on("socket", (socket) => socket.unref());
      const finish = () => {
        clearTimeout(timer);
        pending.delete(req);
      };
      pending.set(req, finish);
      req.on("error", stop);
      req.on("response", (res) => {
        res.on("error", stop);
        res.resume();
        if ((res.statusCode ?? 500) >= 400) stop();
        else res.on("end", finish);
      });
      req.end(body);
    } catch {
      stop();
    }
  };
  const flush = () => {
    if (lines.length === 0) return;
    const batch = lines;
    lines = [];
    post({ type: "lines", pid, lines: batch });
  };
  const add = (text: string) => {
    partial += text;
    let end = partial.indexOf("\n");
    while (end !== -1) {
      lines.push(partial.slice(0, end).replace(/\r$/, ""));
      partial = partial.slice(end + 1);
      if (lines.length === 100) flush();
      end = partial.indexOf("\n");
    }
  };
  post({ type: "start", agent, pid, args, ts: new Date().toISOString() });
  const interval = setInterval(flush, 250);
  interval.unref();

  return {
    write(chunk: Buffer) {
      if (!stopped) add(decoder.write(chunk));
    },
    finish(code: number | null, signal: NodeJS.Signals | null, exitAt: number) {
      clearInterval(interval);
      if (!stopped) {
        add(decoder.end());
        if (partial) lines.push(partial);
        partial = "";
        flush();
        post({ type: "exit", pid, code, signal, ts: new Date(exitAt).toISOString() });
      }
      // Requests and their deadlines are unref'd: reporting never holds the run open.
    },
  };
}
