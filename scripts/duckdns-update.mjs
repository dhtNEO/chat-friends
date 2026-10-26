import fs from "node:fs";
import { checkHTTPS } from "./duckdns-https.mjs";
import { portSuffix } from "./network-config.mjs";
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
    const [appDomain, mediaDomain, email, wanIP, httpsPort] = fs
      .readFileSync(0, "utf8")
      .trim()
      .split(/\r?\n/);
    const value = settings({
      appDomain,
      mediaDomain,
      email,
      wanIP,
      httpsPort: httpsPort || 18443,
    });
    atomic(directory + "/settings.json", JSON.stringify(value));
    console.log("Configuração DuckDNS salva; DNS ainda não foi atualizado.");
  } else if (action === "prepare" || action === "update" || action === "start")
    console.log(
      await prepare(root, {
        initial: action === "prepare",
        allowOriginChange: action === "start",
      }),
    );
  else if (action === "diagnose") {
    const config = settings(
      JSON.parse(fs.readFileSync(directory + "/settings.json", "utf8")),
    );
    const applied = JSON.parse(
      fs.readFileSync(directory + "/applied.json", "utf8"),
    );
    for (const domain of [config.appDomain, config.mediaDomain]) {
      await verifyDNS(domain, applied.ip);
      await checkHTTPS(
        domain,
        portSuffix(config.httpsPort ?? 18443),
        domain === config.appDomain ? "/api/health" : "/",
        domain === config.appDomain ? 200 : 404,
      );
    }
    console.log(
      "DNS A/AAAA e HTTPS interno: OK (certificado validado para os dois nomes). Teste WAN separadamente.",
    );
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
