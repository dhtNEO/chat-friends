import https from "node:https";
import tls from "node:tls";
// Conecta ao edge interno, verificando o certificado contra o FQDN público.
// Evita depender de NAT hairpin do roteador no diagnóstico executado no servidor.
export function checkHTTPS(domain, suffix, path, expected) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: "edge",
        port: 443,
        servername: domain,
        path,
        headers: { Host: domain + suffix },
        checkServerIdentity: (_hostname, certificate) =>
          tls.checkServerIdentity(domain, certificate),
      },
      (response) => {
        response.resume();
        if (response.statusCode === expected) resolve();
        else reject(new Error("HTTPS respondeu com status inesperado"));
      },
    );
    request.setTimeout(8000, () => request.destroy(new Error("HTTPS timeout")));
    request.on("error", () =>
      reject(new Error("HTTPS interno falhou; confira emissão do certificado")),
    );
  });
}
