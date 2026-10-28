"""Check actual generated JSON for every shipped Caddyfile, using dummy inputs."""
import importlib.util
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('policy', root / 'scripts/caddy-security-policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
for file in ['frontend/Caddyfile', 'infra/compose/Caddyfile.prd', 'infra/compose/Caddyfile.duckdns']:
    result = subprocess.run([
        'docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'caddy',
        '-e', 'APP_DOMAIN=test-app.duckdns.org', '-e', 'MEDIA_DOMAIN=test-media.duckdns.org',
        '-e', 'ACME_EMAIL=test@example.org',
        '-e', 'ACME_CA=https://acme-v02.api.letsencrypt.org/directory',
        '-e', 'DUCKDNS_API_TOKEN=00000000-0000-0000-0000-000000000000',
        '-v', str(root / file) + ':/input/Caddyfile:ro',
        'chat-friends-web', 'adapt', '--config', '/input/Caddyfile', '--adapter', 'caddyfile',
    ], capture_output=True, check=True)
    policy.validate(json.loads(result.stdout))
    print(file + ': política JOSE validada')
