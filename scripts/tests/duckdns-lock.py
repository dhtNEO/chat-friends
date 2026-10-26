"""Exercise mutual exclusion and recovery with the real Docker daemon, no DNS calls."""
import os
from pathlib import Path
import select
import signal
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
common = str(root / 'scripts/duckdns-common.sh')
first = None
old_id = None
operation_id = None
with tempfile.TemporaryDirectory() as workspace:
    env = dict(os.environ, DUCKDNS_TEST_COMMON=common)
    prefix = 'set -euo pipefail; source "$DUCKDNS_TEST_COMMON"; duck_lock; '
    try:
        first = subprocess.Popen(['bash', '-c', prefix + 'echo "READY $duck_lock_id"; read -r hold'],
                                 cwd=workspace, env=env, stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        ready, _, _ = select.select([first.stdout], [], [], 60)
        assert ready, 'Lock não respondeu'
        line = first.stdout.readline().strip()
        assert line.startswith('READY '), 'Primeira execução não adquiriu lock'
        old_id = line.split()[1]
        blocked = subprocess.run(['bash', '-c', prefix + 'echo UNEXPECTED'], cwd=workspace,
                                 env=env, capture_output=True, text=True)
        assert blocked.returncode != 0 and 'UNEXPECTED' not in blocked.stdout
        # Representa helper que sobreviveu à morte abrupta do processo no host.
        operation_id = subprocess.check_output(['docker', 'create', '--name', 'chat-friends-duckdns-operation',
                                               '--label', 'chatfriends.duckdns.lock=' + old_id,
                                               'node:24.14.0-alpine', 'true'], text=True).strip()
        first.send_signal(signal.SIGKILL)
        first.wait(timeout=10)
        recovered = subprocess.run(['bash', '-c', prefix + 'echo RECOVERED'], cwd=workspace,
                                   env=env, capture_output=True, text=True, timeout=30)
        assert recovered.returncode == 0 and 'RECOVERED' in recovered.stdout
        assert subprocess.run(['docker', 'inspect', operation_id], capture_output=True).returncode != 0
        print('Lock: concorrência recusada e processo/helper órfãos recuperados.')
    finally:
        if first and first.poll() is None:
            first.terminate()
            first.wait(timeout=10)
        for container_id in [operation_id, old_id]:
            if container_id:
                subprocess.run(['docker', 'rm', '-f', container_id], capture_output=True)
