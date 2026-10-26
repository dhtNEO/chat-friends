import fs from "node:fs";
import {
  DuckDNSError,
  directory,
  settings,
  atomic,
  prepare,
  healthy,
  commit,
  verifyDNS,
} from "./duckdns-lib.mjs";
const root = process.cwd(),
  action = process.argv[2];
try {
  if (action === "init") {
    const [appDomain, mediaDomain, email, wanIP] = fs
      .readFileSync(0, "utf8")
      .trim()
      .split(/\r?\n/);
    const value = settings({ appDomain, mediaDomain, email, wanIP });
    atomic(directory + "/settings.json", JSON.stringify(value));
    console.log("Configuração DuckDNS salva; DNS ainda não foi atualizado.");
  } else if (action === "prepare" || action === "update")
    console.log(await prepare(root, { initial: action === "prepare" }));
  else if (action === "diagnose") {
    const config = settings(
      JSON.parse(fs.readFileSync(directory + "/settings.json", "utf8")),
    );
    const applied = JSON.parse(
      fs.readFileSync(directory + "/applied.json", "utf8"),
    );
    for (const domain of [config.appDomain, config.mediaDomain]) {
      await verifyDNS(domain, applied.ip);
      const response = await fetch(
        "https://" +
          domain +
          (domain === config.appDomain ? "/api/health" : "/"),
        { signal: AbortSignal.timeout(8000), redirect: "error" },
      );
      if (response.status !== (domain === config.appDomain ? 200 : 404))
        throw new Error("HTTPS não respondeu como esperado");
    }
    console.log("DNS A/AAAA e HTTPS dos dois nomes: OK (TLS validado).");
  } else if (action === "health") {
    await healthy(root);
    console.log("SFU administrativa saudável.");
  } else if (action === "commit") {
    await healthy(root);
    commit(root);
    console.log("IPv4 aplicado e SFU saudável.");
  } else throw new Error("Ação DuckDNS inválida");
} catch (error) {
  // Nunca imprimir objetos de erro de fetch/DNS: podem conter URL com token.
  console.error(
    error instanceof DuckDNSError
      ? "DuckDNS: " + error.message
      : "DuckDNS: operação falhou. Confira arquivos privados, rede e Docker; credenciais omitidas.",
  );
  process.exitCode = 1;
}
