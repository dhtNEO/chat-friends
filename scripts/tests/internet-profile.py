"""Inspect public ports, staging isolation and Caddy syntax without publishing services."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
for staging in ['false', 'true']:
    env = dict(os.environ, CHAT_MODE='internet', CHAT_TURN='false', CHAT_ACME_STAGING=staging)
    result = subprocess.run(['./scripts/compose.sh', 'config', '--format', 'json'],
                            cwd=root, env=env, capture_output=True, check=True)
    config = json.loads(result.stdout)
    ports = {(p['target'], p['protocol']) for service in config['services'].values()
             for p in service.get('ports', [])}
    assert ports == {(80, 'tcp'), (443, 'tcp'), (443, 'udp'), (7881, 'tcp'), (7882, 'udp')}
    data = next(v for v in config['services']['edge']['volumes'] if v['target'] == '/data')
    assert data['source'].endswith('certificates_staging' if staging == 'true' else 'certificates')
    ca = config['services']['edge']['environment']['ACME_CA']
    assert ('staging' in ca) == (staging == 'true')
    # Dummy hostnames/email only. Never expose the real expanded Compose environment.
    result = subprocess.run([
        'docker', 'run', '--rm',
        '-e', 'APP_DOMAIN=test-app.duckdns.org', '-e', 'MEDIA_DOMAIN=test-media.duckdns.org',
        '-e', 'ACME_EMAIL=test@example.org', '-e', 'ACME_CA=' + ca,
        '-v', str(root / 'infra/compose/Caddyfile.internet') + ':/etc/caddy/Caddyfile:ro',
        'caddy:2.10.2-alpine', 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--validate',
    ], capture_output=True, check=True)
    assert json.loads(result.stdout)['apps']['http']['servers']
print('Internet: portas limitadas, ACME staging isolado e Caddy válido em ambos os modos.')
