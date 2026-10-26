import fs from "node:fs";
const file = process.argv[2],
  output = process.env.GITHUB_STEP_SUMMARY;
if (!file || !fs.existsSync(file) || !output) process.exit(0);
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const clean = (text) =>
  String(text)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[URL omitida]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[valor omitido]")
    .replace(/[<>]/g, "");
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
fs.appendFileSync(output, lines.join("\n") + "\n");
