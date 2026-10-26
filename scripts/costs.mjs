// Valores monetários vêm do proprietário/calculadora oficial; nenhuma cotação embutida.
const values = Object.fromEntries(
  process.argv.slice(2).map((x) => x.split("=")),
);
const num = (name, otherwise) => {
  const n = Number(values[name] ?? otherwise);
  if (!Number.isFinite(n) || n < 0) throw new Error(name + " inválido");
  return n;
};
const hours = num("hours", 20),
  bitrate = num("mbps", 4),
  viewers = num("viewers", 15),
  overhead = num("overhead", 0.15);
const screenGB = bitrate * viewers * hours * 0.45,
  egressGiB = (screenGB * (1 + overhead) * 1e9) / 2 ** 30;
const vmHours = num("vmHours", 730),
  diskGiB = num("diskGiB", 40),
  backupGiB = num("backupGiB", 10);
const rates = [
  "vmUSDHour",
  "diskUSDGiBMonth",
  "ipv4USDHour",
  "egressUSDGiB",
  "backupUSDGiBMonth",
  "logsUSDMonth",
  "domainUSDMonth",
];
console.log(
  JSON.stringify(
    {
      hours,
      screenGB,
      estimatedWithOverheadGiB: egressGiB,
      overheadAssumption: overhead,
      vmHours,
      diskGiB,
      backupGiB,
    },
    null,
    2,
  ),
);
if (rates.every((k) => values[k] !== undefined)) {
  const total =
    vmHours * num("vmUSDHour", 0) +
    diskGiB * num("diskUSDGiBMonth", 0) +
    730 * num("ipv4USDHour", 0) +
    egressGiB * num("egressUSDGiB", 0) +
    backupGiB * num("backupUSDGiBMonth", 0) +
    num("logsUSDMonth", 0) +
    num("domainUSDMonth", 0);
  console.log("Estimativa USD/mês (sem créditos): " + total.toFixed(2));
} else
  console.log(
    "Sem cotação monetária: preencha " +
      rates.join(", ") +
      " com fonte, data e região.",
  );
