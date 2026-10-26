"""Isolated socket regression without a Tailscale account/TUN; RTC uses eth0."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SUFFIX = str(os.getpid())
NODE = 'friends-ts-bind-node-' + SUFFIX
MEDIA = 'friends-ts-bind-media-' + SUFFIX
WEB = 'friends-ts-bind-web-' + SUFFIX


def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, capture_output=True, text=True)


try:
    docker('run', '-d', '--name', NODE, 'node:24.14.0-alpine', 'sleep', '180')
    ip = json.loads(docker('inspect', NODE).stdout)[0]['NetworkSettings']['IPAddress']
    with tempfile.TemporaryDirectory(dir=ROOT) as directory:
        config = Path(directory) / 'livekit.yaml'
        config.write_text(f'''port: 7880
bind_addresses: ["{ip}"]
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false
  node_ip: "{ip}"
  enable_loopback_candidate: false
  interfaces:
    includes: [eth0]
keys:
  test-key-only: test-secret-only-32-characters-long
logging:
  level: warn
''')
        docker('run', '-d', '--name', MEDIA, '--network', 'container:' + NODE,
               '-v', str(config) + ':/etc/livekit.yaml:ro',
               'livekit/livekit-server:v1.9.12', '--config', '/etc/livekit.yaml')
        docker('run', '-d', '--name', WEB, '--network', 'container:' + NODE,
               '-v', str(ROOT / 'infra/compose/Caddyfile.tailscale') + ':/etc/caddy/Caddyfile:ro',
               'chat-friends-web')
        script = '''
for (const [host, port, want] of JSON.parse(process.argv[1])) {
  let reachable = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://${host}:${port}`, {
        signal: AbortSignal.timeout(300),
        headers: {Host: "chat-amigos.example.ts.net"},
      });
      // Any HTTP response proves that a forbidden socket is exposed.
      reachable = !want || port !== 8080 || response.status === 200;
      break;
    } catch {
      if (!want) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  if (reachable !== want) process.exit(1);
}
'''
        checks = [[ip, 7880, True], ['127.0.0.1', 7880, False],
                  ['127.0.0.1', 8080, True], [ip, 8080, False]]
        result = docker('exec', NODE, 'node', '--input-type=module', '-e', script,
                        json.dumps(checks), check=False)
        if result.returncode:
            raise RuntimeError('Falha no binding dos containers descartáveis')
    print('Bindings validados: API LiveKit no IP Docker e Caddy no loopback. RTC usa eth0 neste ensaio sem TUN.')
finally:
    for name in [WEB, MEDIA, NODE]:
        docker('rm', '-f', name, check=False)
