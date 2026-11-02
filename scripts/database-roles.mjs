import fs from "node:fs";
import { parseEnv } from "./network-config.mjs";
const v = parseEnv(
  fs.readFileSync("infra/compose/generated/runtime.env", "utf8"),
);
for (const k of ["APP_DB_USER", "MIGRATION_DB_USER"])
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(v[k])) throw new Error("Role inválida");
for (const k of ["APP_DB_PASSWORD", "MIGRATION_DB_PASSWORD"])
  if (!/^[a-f0-9]{64}$/.test(v[k])) throw new Error("Segredo inválido");
const app = v.APP_DB_USER,
  migration = v.MIGRATION_DB_USER,
  owner = "friends_owner";
if (process.argv.includes("--finalize")) {
  process.stdout.write(
    `REVOKE ALL ON TABLE public.flyway_schema_history FROM ${app};\n`,
  );
  process.exit(0);
}
process.stdout.write(`BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${owner}') THEN CREATE ROLE ${owner} NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${app}') THEN CREATE ROLE ${app} LOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${migration}') THEN CREATE ROLE ${migration} LOGIN; END IF;
END $$;
ALTER ROLE ${app} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${v.APP_DB_PASSWORD}';
ALTER ROLE ${migration} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${v.MIGRATION_DB_PASSWORD}';
ALTER ROLE ${owner} WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT roleid::regrole::text AS role FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='${app}') LOOP EXECUTE format('REVOKE %I FROM ${app}',r.role); END LOOP;
END $$;
GRANT ${owner} TO ${migration};
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO ${owner};
GRANT USAGE ON SCHEMA public TO ${app};
GRANT CONNECT ON DATABASE friends TO ${app},${migration};
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') ORDER BY CASE WHEN c.relkind='S' THEN 1 ELSE 0 END,c.relname LOOP
  EXECUTE format('ALTER %s public.%I OWNER TO ${owner}',CASE WHEN r.relkind='S' THEN 'SEQUENCE' WHEN r.relkind='v' THEN 'VIEW' WHEN r.relkind='m' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,r.relname);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${app};
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${migration} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${migration} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${app};
DO $$ BEGIN
 IF to_regclass('public.flyway_schema_history') IS NOT NULL THEN REVOKE ALL ON TABLE public.flyway_schema_history FROM ${app}; END IF;
END $$;
COMMIT;
`);
