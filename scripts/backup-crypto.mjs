import fs from "node:fs";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
const [action, input, output, passwordFile] = process.argv.slice(2);
let temporary;
try {
  if (
    !["encrypt", "decrypt"].includes(action) ||
    !input ||
    !output ||
    !passwordFile
  )
    throw new Error();
  if (fs.statSync(passwordFile).mode & 0o077) throw new Error();
  const password = fs.readFileSync(passwordFile);
  if (password.length < 16 || password.length > 1024) throw new Error();
  if (fs.existsSync(output)) throw new Error();
  const magic = Buffer.from("CFBACKUP1");
  const headerLength = magic.length + 16 + 12;
  let header, salt, iv, tag;
  const size = fs.statSync(input).size;
  if (action === "encrypt") {
    salt = crypto.randomBytes(16);
    iv = crypto.randomBytes(12);
    header = Buffer.concat([magic, salt, iv]);
  } else {
    if (size < headerLength + 16) throw new Error();
    const fd = fs.openSync(input, "r");
    try {
      header = Buffer.alloc(headerLength);
      fs.readSync(fd, header, 0, header.length, 0);
      tag = Buffer.alloc(16);
      fs.readSync(fd, tag, 0, 16, size - 16);
    } finally {
      fs.closeSync(fd);
    }
    if (!header.subarray(0, magic.length).equals(magic)) throw new Error();
    salt = header.subarray(magic.length, magic.length + 16);
    iv = header.subarray(magic.length + 16);
  }
  const key = crypto.scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  password.fill(0);
  const cipher =
    action === "encrypt"
      ? crypto.createCipheriv("aes-256-gcm", key, iv)
      : crypto.createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  if (tag) cipher.setAuthTag(tag);
  key.fill(0);
  temporary = output + "." + crypto.randomUUID() + ".partial";
  const fd = fs.openSync(temporary, "wx", 0o600);
  if (action === "encrypt") fs.writeSync(fd, header);
  fs.closeSync(fd);
  await pipeline(
    fs.createReadStream(
      input,
      action === "decrypt" ? { start: headerLength, end: size - 17 } : {},
    ),
    cipher,
    fs.createWriteStream(temporary, { flags: "a", mode: 0o600 }),
  );
  if (action === "encrypt") fs.appendFileSync(temporary, cipher.getAuthTag());
  fs.linkSync(temporary, output);
  fs.unlinkSync(temporary);
  temporary = undefined;
} catch {
  if (temporary) fs.rmSync(temporary, { force: true });
  console.error(
    "Backup: operação recusada ou autenticação falhou; nenhum arquivo de saída confirmado.",
  );
  process.exitCode = 1;
}
