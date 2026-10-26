"""Exercise a hostile helper against actual mounts; no provider account/network calls."""
import os,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as temp:
 p=Path(temp);(p/'scripts').mkdir();generated=p/'infra/compose/generated';(generated/'duckdns').mkdir(parents=True);(generated/'network').mkdir()
 (p/'.env').write_text('OPERATOR_PASSWORD=must-not-be-mounted\n');(p/'.env.example').write_text('# helper fixture\n')
 (generated/'runtime.env').write_text('MFA_ENCRYPTION_KEY=must-not-be-mounted\n')
 (generated/'helper.env').write_text('LIVEKIT_API_KEY=test-only\n')
 token=generated/'duckdns/token';token.write_text('00000000-0000-0000-0000-000000000000');token.chmod(0o600)
 (p/'scripts/duckdns-update.mjs').write_text('''import fs from 'node:fs';
 const fail=()=>{throw new Error('Mount boundary failed')};
 if(fs.readFileSync('.env','utf8').includes('OPERATOR_PASSWORD'))fail();
 if(fs.existsSync('infra/compose/generated/runtime.env')||fs.existsSync('/var/run/docker.sock'))fail();
 for(const file of ['scripts/forbidden','.env','infra/compose/generated/duckdns/token']){
   try{fs.writeFileSync(file,'forbidden');fail()}catch(e){if(!['EROFS','EACCES'].includes(e.code))throw e;}
 }
 for(const dir of ['network','duckdns']){const f='infra/compose/generated/'+dir+'/atomic';fs.writeFileSync(f+'.tmp','ok');fs.renameSync(f+'.tmp',f);}
 console.log('Helper boundaries OK');
 ''')
 env=dict(os.environ,DUCKDNS_TEST_COMMON=str(root/'scripts/duckdns-common.sh'))
 result=subprocess.run(['bash','-c','set -euo pipefail; source "$DUCKDNS_TEST_COMMON"; duck_lock; duck_node test'],cwd=p,env=env,capture_output=True,text=True,timeout=30)
 assert result.returncode==0, 'Helper boundary test failed (credentials omitted)'
 assert (generated/'duckdns/atomic').read_text()=='ok' and (generated/'network/atomic').read_text()=='ok'
 assert (p/'.env').read_text().startswith('OPERATOR_PASSWORD')
 print('Helper: código/token RO, credenciais DB/MFA e Docker socket ausentes, estado com rename atômico RW.')
