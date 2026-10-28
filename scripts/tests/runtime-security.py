"""Inspect whitelisted fields, never print expanded secrets."""
import json,socket,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def command(*args):return subprocess.check_output(args,cwd=root)
config=json.loads(command('./scripts/compose.sh','config','--format','json'));services=config['services']
assert not services['db'].get('ports')
assert all(config['networks'][n].get('internal') for n in services['backend']['networks'])
assert services['backend']['environment']['POSTGRES_USER'] != services['db']['environment']['POSTGRES_USER']
assert 'MIGRATION_DB_PASSWORD' not in services['backend']['environment']
assert services['backend']['environment']['MIGRATIONS_ENABLED']=='false'
dbnet=set(services['db']['networks'])
for name in ['web','livekit']:
 assert not dbnet.intersection(services[name]['networks']),name
for name in ['backend','web','livekit']:
 container=command('./scripts/compose.sh','ps','-q',name).decode().strip()
 c=json.loads(command('docker','inspect',container))[0]
 assert c['Config']['User'] not in ['', '0', '0:0','root'],name
 h=c['HostConfig'];assert h['ReadonlyRootfs'] and 'ALL' in h['CapDrop'] and h['PidsLimit']>0,name
 for mount in c['Mounts']:assert 'docker.sock' not in mount['Destination']
print('Runtime: conta DB separada, redes segmentadas, usuários limitados, rootfs RO e capabilities removidas.')

# With three NICs rewritten to one public node_ip, duplicate ICE candidates can
# keep the wrong UDP mux. Only media_net receives the published media ports.
livekit=command('./scripts/compose.sh','ps','-q','livekit').decode().strip()
networks=json.loads(command('docker','inspect','--format','{{json .NetworkSettings.Networks}}',livekit))
media_ip=networks[config['networks']['media_net']['name']]['IPAddress']
bound=set()
for line in command('docker','exec',livekit,'cat','/proc/net/udp').decode().splitlines()[1:]:
 address,port=line.split()[1].split(':')
 if int(port,16)==7882:bound.add(socket.inet_ntoa(bytes.fromhex(address)[::-1]))
assert bound=={media_ip},'ICE UDP deve escutar somente na interface que recebe a porta Docker publicada'
print('Mídia: socket ICE UDP restrito à interface da rede de mídia, sem candidatos das redes de controle/sinalização.')

# Probe only this project's database, from the exact public web networks.
db=json.loads(command('docker','inspect',command('./scripts/compose.sh','ps','-q','db').decode().strip()))[0]
ip=next(iter(db['NetworkSettings']['Networks'].values()))['IPAddress']
args=['docker','run','--rm','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true']
for network in services['web']['networks']:args += ['--network',config['networks'][network]['name']]
args += ['-e','DB_PROBE_IP='+ip,'node:24.22.1-alpine','node','-e',"const net=require('net');const s=net.connect(5432,process.env.DB_PROBE_IP);s.setTimeout(1500);s.on('connect',()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(0));s.on('timeout',()=>{s.destroy();process.exit(0)});"]
subprocess.run(args,check=True,cwd=root,capture_output=True)
print('Rede: conexão TCP do conjunto de redes do web para o banco bloqueada neste daemon.')
