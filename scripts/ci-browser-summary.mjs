import fs from "node:fs";
const file = process.argv[2],
  output = process.env.GITHUB_STEP_SUMMARY;
if (!file) process.exit(0);
const clean = (text) =>
  String(text)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[URL omitida]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[valor omitido]")
    .replace(/[<>]/g, "");
if (!fs.existsSync(file)) {
  const phase = process.argv[3],
    log = process.argv[4];
  const lines = [
    "### Browser preparation",
    "",
    "Playwright não gerou relatório.",
  ];
  if (phase && fs.existsSync(phase))
    lines.push("Fase: " + clean(fs.readFileSync(phase, "utf8").trim()));
  if (log && fs.existsSync(log))
    for (const line of fs
      .readFileSync(log, "utf8")
      .split("\n")
      .filter((l) => /error|failed|E:|space left|timed out|not found/i.test(l))
      .slice(-6))
      lines.push(clean(line).slice(0, 350));
  if (output) if (output) fs.appendFileSync(output, lines.join("\n") + "\n");
  const message = lines
    .slice(2)
    .join("; ")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  console.log("::error title=Browser preparation::" + message);
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const lines = [
  "### Browser tests",
  `Esperados: ${report.stats?.expected ?? 0}; inesperados: ${report.stats?.unexpected ?? 0}; instáveis: ${report.stats?.flaky ?? 0}.`,
];
function visit(suite) {
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests ?? []) {
      const result = t.results?.at(-1);
      if (result && result.status !== t.expectedStatus) {
        lines.push(`- ${clean(spec.title)} — ${clean(result.status)}`);
        for (const error of result.errors ?? []) {
          const text = clean(error.message ?? "");
          for (const l of text
            .split("\n")
            .filter(
              (l, i) =>
                i === 0 || /^(Expected:|Received:|Locator:|Timeout:)/.test(l),
            )
            .slice(0, 5))
            lines.push("  " + l.slice(0, 350));
        }
      }
    }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites ?? []) visit(suite);
if (output) fs.appendFileSync(output, lines.join("\n") + "\n");

if ((report.stats?.unexpected ?? 0) > 0)
  console.log(
    "::error title=Browser tests::" +
      lines
        .slice(2)
        .join("; ")
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A"),
  );
