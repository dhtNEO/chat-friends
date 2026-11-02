"""Validate adapted Caddy JSON without printing configuration or secrets."""
import json
import sys

def validate(config):
    if config.get('admin', {}).get('disabled') is not True:
        raise ValueError('Admin Caddy deve permanecer desativado')
    apps = config.get('apps', {})
    if set(apps) - {'http', 'tls'}:
        raise ValueError('Aplicação Caddy adicional exige revisão da triagem JOSE')
    allowed = {'subroute', 'reverse_proxy', 'headers', 'encode', 'file_server',
               'static_response', 'vars', 'rewrite', 'request_body'}
    def visit(node):
        if isinstance(node, list):
            for child in node:
                visit(child)
        elif isinstance(node, dict):
            if 'handler' in node and node['handler'] not in allowed:
                raise ValueError('Handler Caddy exige revisão da triagem JOSE')
            for child in node.values():
                visit(child)
    visit(apps)
    for policy in apps.get('tls', {}).get('automation', {}).get('policies', []):
        for issuer in policy.get('issuers', []):
            if issuer.get('module') != 'acme':
                raise ValueError('Emissor TLS não ACME exige revisão da triagem JOSE')
        if policy.get('on_demand'):
            raise ValueError('TLS on-demand exige revisão da triagem JOSE')

if __name__ == '__main__':
    validate(json.load(sys.stdin))
    print('Caddy: admin desativado, sem PKI/servidor ACME/JWK público ou handlers adicionais.')
