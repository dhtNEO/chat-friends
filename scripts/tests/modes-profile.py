"""Check loopback-only dev publication and fail closed on invalid mode/options."""
import json
import os
import subprocess

def compose(mode, **options):
    env = dict(os.environ, CHAT_MODE=mode, CHAT_TURN='false', CHAT_ACME_STAGING='false')
    env.update(options)
    return subprocess.run(['./scripts/compose.sh', 'config', '--format', 'json'], env=env, capture_output=True)

result = compose('dev')
assert result.returncode == 0
services = json.loads(result.stdout)['services']
assert set(services) == {'db', 'backend', 'livekit', 'music', 'web'}
for name in ['backend', 'music']:
    assert services[name]['environment']['MUSIC_SECRET_FILE'] == '/run/music/control.key'
    scoped = [v for v in services[name]['volumes'] if v['target'] == '/run/music']
    assert len(scoped) == 1 and scoped[0].get('read_only')
    assert scoped[0]['source'].replace('\\','/').endswith('/generated/music')
    assert not any(v['target'] == '/run/secrets/music' for v in services[name]['volumes'])
ports = [p for service in services.values() for p in service.get('ports', [])]
assert {(p['target'],p['protocol']) for p in ports} == {(8080,'tcp'),(7881,'tcp'),(7882,'udp')}
assert all(p['host_ip'] == '127.0.0.1' for p in ports)
for invalid in ['local', 'internet', 'invalid', '']:
    assert compose(invalid).returncode != 0
assert compose('dev', CHAT_ACME_STAGING='true').returncode != 0
assert compose('dev', CHAT_TURN='true').returncode != 0
print('dev/prd: publicação dev somente em loopback; entradas e opções inválidas recusadas.')
