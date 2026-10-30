import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
function bootstrap(failures, exitCode = 1) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "friends-maven-"));
  try {
    for (const folder of ["scripts", "backend", "bin"])
      fs.mkdirSync(path.join(cwd, folder));
    fs.copyFileSync(
      path.join(root, "scripts/bootstrap-maven.sh"),
      path.join(cwd, "scripts/bootstrap-maven.sh"),
    );
    fs.writeFileSync(
      path.join(cwd, "backend/mvnw"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> calls
count=$(wc -l < calls)
if (( count <= ${failures} )); then
  echo 'Falha sintética de bootstrap/checksum' >&2
  exit ${exitCode}
fi
echo 'Apache Maven 3.9.11'
`,
      { mode: 0o700 },
    );
    fs.writeFileSync(
      path.join(cwd, "bin/sleep"),
      '#!/usr/bin/env bash\nprintf "%s\\n" "$1" >> ../delays\n',
      { mode: 0o700 },
    );
    const result = spawnSync("bash", ["scripts/bootstrap-maven.sh"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: path.join(cwd, "bin") + ":" + process.env.PATH,
      },
    });
    return {
      ...result,
      calls: fs
        .readFileSync(path.join(cwd, "backend/calls"), "utf8")
        .trim()
        .split("\n"),
      delays: fs.existsSync(path.join(cwd, "delays"))
        ? fs.readFileSync(path.join(cwd, "delays"), "utf8").trim().split("\n")
        : [],
    };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
test("bootstrap bem-sucedido não é repetido", () => {
  const result = bootstrap(0);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, ["-B -ntp --version"]);
  assert.deepEqual(result.delays, []);
});
test("falhas transitórias repetem só bootstrap com espera limitada", () => {
  const result = bootstrap(2);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, Array(3).fill("-B -ntp --version"));
  assert.deepEqual(result.delays, ["2", "4"]);
});
test("falha persistente/checksum continua fechada e mantém código de erro", () => {
  const result = bootstrap(10, 17);
  assert.equal(result.status, 17);
  assert.deepEqual(result.calls, Array(3).fill("-B -ntp --version"));
  assert.deepEqual(result.delays, ["2", "4"]);
  assert.match(result.stderr, /após 3 tentativas/);
});
