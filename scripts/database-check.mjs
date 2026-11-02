import fs from "node:fs";
import { parseEnv } from "./network-config.mjs";
const v = parseEnv(
  fs.readFileSync("infra/compose/generated/runtime.env", "utf8"),
);
for (const k of ["APP_DB_USER"])
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(v[k])) throw new Error();
if (!/^[a-f0-9]{64}$/.test(v.APP_DB_PASSWORD)) throw new Error();
process.stdout.write(`\\set QUIET on
SET ROLE ${v.APP_DB_USER};
DO $$ BEGIN
 IF (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'runtime elevated'; END IF;
 IF has_schema_privilege(current_user,'public','CREATE') THEN RAISE EXCEPTION 'runtime DDL'; END IF;
 IF has_table_privilege(current_user,'public.flyway_schema_history','SELECT') THEN RAISE EXCEPTION 'migration metadata exposed'; END IF;
 BEGIN EXECUTE 'CREATE TABLE public.denied_runtime_test(id int)';RAISE EXCEPTION 'runtime created table';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN EXECUTE 'CREATE ROLE denied_runtime_test';RAISE EXCEPTION 'runtime created role';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF NOT has_table_privilege(current_user,'public.messages','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'runtime missing DML';END IF;
END $$;
RESET ROLE;
`);
