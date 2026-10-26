import fs from "node:fs";
const [repo, docker] = process.argv.slice(2);
if (!repo?.startsWith("/") || !docker?.startsWith("/"))
  throw new Error("Use caminhos absolutos");
const escape = (value) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
process.stdout.write(
  fs
    .readFileSync("infra/macos/duckdns.plist.example", "utf8")
    .replaceAll("__REPO__", escape(repo))
    .replaceAll("__DOCKER__", escape(docker)),
);
