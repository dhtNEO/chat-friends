"""An exception must not authorize a different binary, package version or feature."""
import copy
import importlib.util
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('policy', root / 'scripts/caddy-security-policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class SecurityPolicyTest(unittest.TestCase):
    def gate(self, target, version='v3.0.5', kind='gobinary'):
        report = {'Results': [{'Target': target, 'Type': kind, 'Vulnerabilities': [{
            'Severity': 'HIGH', 'VulnerabilityID': 'CVE-2026-116587',
            'PkgName': 'github.com/go-jose/go-jose/v3', 'InstalledVersion': version}]}]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.json'
            path.write_text(json.dumps(report))
            return subprocess.run(['python3', 'scripts/vulnerability-gate.py', str(path)],
                                  cwd=root, capture_output=True).returncode

    def test_exact_caddy_is_triaged(self):
        self.assertEqual(self.gate('usr/bin/caddy'), 0)
        self.assertEqual(self.gate('/usr/bin/caddy'), 0)

    def test_other_binary_still_fails(self):
        self.assertNotEqual(self.gate('livekit-server'), 0)

    def test_other_version_still_fails(self):
        self.assertNotEqual(self.gate('usr/bin/caddy', version='v3.0.4'), 0)

    def test_other_scanner_type_still_fails(self):
        self.assertNotEqual(self.gate('usr/bin/caddy', kind='jar'), 0)

    def test_reverse_proxy_allowed(self):
        policy.validate({'admin': {'disabled': True}, 'apps': {'http': {
            'servers': {'web': {'routes': [{'handle': [{'handler': 'reverse_proxy'}]}]}}}}})

    def test_new_features_rejected(self):
        cases = [
            {'admin': {}},
            {'apps': {'pki': {}}},
            {'apps': {'http': {'routes': [{'handler': 'acme_server'}]}}},
            {'apps': {'http': {'routes': [{'handler': 'authentication'}]}}},
            {'apps': {'tls': {'automation': {'policies': [{'issuers': [{'module': 'internal'}]}]}}}},
            {'apps': {'tls': {'automation': {'policies': [{'on_demand': True}]}}}},
        ]
        for change in cases:
            with self.subTest(change=change):
                config = {'admin': {'disabled': True}, 'apps': {}}
                config.update(copy.deepcopy(change))
                with self.assertRaises(ValueError):
                    policy.validate(config)

if __name__ == '__main__':
    unittest.main()
