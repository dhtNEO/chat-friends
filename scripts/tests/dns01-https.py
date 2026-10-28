"""Validate HTTPS on public port 18443 and protected routes with a trusted lab CA.
No real DNS/ACME call or production token is used; TLS verification stays enabled.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[2]
name = 'friends-dns01-https-' + str(os.getpid())

def docker(*args, check=True):
    return subprocess.run(['docker', *args], capture_output=True, check=check)

with tempfile.TemporaryDirectory(dir=root / 'infra/compose/generated') as temporary:
    folder = Path(temporary)
    cert, key = folder / 'cert.pem', folder / 'key.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                    '-days', '1', '-subj', '/CN=test-app.duckdns.org',
                    '-addext', 'subjectAltName=DNS:test-app.duckdns.org,DNS:test-media.duckdns.org',
                    '-keyout', str(key), '-out', str(cert)], capture_output=True, check=True)
    token=folder/'token'
    token.write_text('00000000-0000-0000-0000-000000000000')
    token.chmod(0o600)
    config = (root / 'infra/compose/Caddyfile.duckdns').read_text()
    start = config.index('(duckdns_tls) {')
    end = config.index('https://{$APP_DOMAIN}:443')
    config = config[:start] + '(duckdns_tls) {\n tls /lab/cert.pem /lab/key.pem\n}\n' + config[end:]
    (folder / 'Caddyfile').write_text(config)
    try:
        docker('run', '-d', '--name', name, '--network', 'chat-friends_ingress_net', '--network', 'chat-friends_api_net', '--network', 'chat-friends_signal_net',
               '--user', f'{os.getuid()}:{os.getgid()}', '--read-only', '--cap-drop', 'ALL',
               '--sysctl', 'net.ipv4.ip_unprivileged_port_start=0',
               '--tmpfs', f'/data:uid={os.getuid()},gid={os.getgid()}', '--tmpfs', f'/config:uid={os.getuid()},gid={os.getgid()}',
               '--network-alias', 'edge', '-p', '127.0.0.1:18443:443',
               '-e', 'APP_DOMAIN=test-app.duckdns.org', '-e', 'MEDIA_DOMAIN=test-media.duckdns.org',
               '-e', 'NO_PROXY=localhost,127.0.0.1,web,backend,livekit,edge',
               '-e', 'no_proxy=localhost,127.0.0.1,web,backend,livekit,edge',
               '-e', 'ACME_EMAIL=test@example.org', '-e', 'ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory',
               '-v', str(folder) + ':/lab:ro', '-v', str(token)+':/run/secrets/duckdns_token:ro',
               'chat-friends-edge-duckdns', 'caddy', 'run', '--config', '/lab/Caddyfile', '--adapter', 'caddyfile')
        cases = [('test-app.duckdns.org', '/', '200'),
                 ('test-app.duckdns.org', '/api/health', '200'),
                 ('test-media.duckdns.org', '/', '404'),
                 ('test-media.duckdns.org', '/api/health', '404'),
                 ('test-media.duckdns.org', '/rtc', '401')]
        for host, route, expected in cases:
            for attempt in range(20):
                response = subprocess.run(['curl', '--silent', '--show-error', '--connect-timeout', '2',
                                          '--max-time', '3', '--cacert', str(cert),
                                          '--noproxy', host, '--resolve', host + ':18443:127.0.0.1',
                                          '-o', os.devnull, '-w', '%{http_code}',
                                          'https://' + host + ':18443' + route], capture_output=True, text=True)
                if response.returncode == 0:
                    break
                time.sleep(0.25)
            assert response.returncode == 0 and response.stdout == expected, f'{host}{route}: expected {expected}, status {response.stdout}, curl {response.returncode}: {response.stderr}'
        # Internal diagnostic validates public FQDN and Host :18443, without hairpin NAT.
        docker('run', '--rm', '--network', 'chat-friends_ingress_net',
               '-v', str(root) + ':/work:ro', '-v', str(folder) + ':/lab:ro',
               '-e', 'NODE_EXTRA_CA_CERTS=/lab/cert.pem', '-w', '/work',
               'node:24.22.1-alpine', 'node', '--input-type=module', '-e',
               'import {checkHTTPS} from "./scripts/duckdns-https.mjs";'
               'await checkHTTPS("test-app.duckdns.org",":18443","/api/health",200);'
               'let denied=false;try{await checkHTTPS("wrong.example.org",":18443","/",200)}catch{denied=true}'
               'if(!denied)process.exit(1);')
        saved = docker('exec', name, 'cat', '/config/caddy/autosave.json').stdout
        assert b'00000000-0000-0000-0000-000000000000' not in saved
        assert b'{env.DUCKDNS_API_TOKEN}' in saved
        logs = docker('logs', name)
        assert b'00000000-0000-0000-0000-000000000000' not in logs.stdout + logs.stderr
        print('HTTPS :18443, SNI/certificado, Host com porta, diagnóstico interno e admissão de mídia passaram.')
    finally:
        docker('rm', '-f', name, check=False)
