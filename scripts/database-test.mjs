import fs from "node:fs";
import { parseEnv } from "./network-config.mjs";
const { TEST_DB_PASSWORD: password } = parseEnv(
  fs.readFileSync("infra/compose/generated/runtime.env", "utf8"),
);
if (!/^[a-f0-9]{64}$/.test(password))
  throw new Error("Credencial de teste inválida");
if (process.argv.includes("--env")) {
  process.stdout.write(
    `POSTGRES_USER=friends_tests\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=jdbc:postgresql://db:5432/friends_test\nLIVEKIT_API_KEY=test-only\nLIVEKIT_API_SECRET=test-only-key-not-for-a-runtime-server\n`,
  );
} else
  process.stdout
    .write(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='friends_tests') THEN CREATE ROLE friends_tests LOGIN; END IF; END $$;
ALTER ROLE friends_tests NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
SELECT 'CREATE DATABASE friends_test OWNER friends_tests' WHERE NOT EXISTS(SELECT FROM pg_database WHERE datname='friends_test')\\gexec
ALTER DATABASE friends_test OWNER TO friends_tests;
\\connect friends_test
ALTER SCHEMA public OWNER TO friends_tests;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY CASE WHEN c.relkind='S' THEN 1 ELSE 0 END,c.relname LOOP
 EXECUTE format('ALTER %s public.%I OWNER TO friends_tests',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname);
 END LOOP;END $$;
`);
