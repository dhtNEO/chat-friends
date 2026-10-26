"""Inspect Compose in memory: never print expanded environment/secrets."""
import json
import os
import subprocess

env = dict(os.environ, CHAT_MODE='tailscale', CHAT_TURN='false')
result = subprocess.run(['./scripts/compose.sh', 'config', '--format', 'json'], env=env, capture_output=True, check=True)
config = json.loads(result.stdout)
services = config['services']
assert all(not service.get('ports') for service in services.values()), 'Porta publicada no host'
for name in ['web', 'livekit']:
    assert services[name]['network_mode'] == 'service:tailscale'
    assert not services[name].get('networks')
node = services['tailscale']
assert not node.get('privileged')
assert node['environment']['TS_USERSPACE'] == 'false'
assert set(node['cap_add']) == {'NET_ADMIN'}
assert {'livekit', 'web'} <= set(node['networks']['default']['aliases'])
serve = json.load(open('infra/compose/tailscale-serve.json'))
assert not serve.get('AllowFunnel')
assert serve['TCP'] == {'443': {'HTTPS': True}}
assert serve['Web']['${TS_CERT_DOMAIN}:443']['Handlers']['/']['Proxy'] == 'http://127.0.0.1:8080'
print('Compose Tailscale: sem portas públicas, namespace e Serve restritos.')
