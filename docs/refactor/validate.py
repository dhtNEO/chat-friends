"""Verifica estrutura do plano; não substitui testes funcionais ou revisão."""
from pathlib import Path
import json,re,sys,datetime
ROOT=Path(__file__).resolve().parent

def validate():
 data=json.loads((ROOT/'backlog.json').read_text()); tasks=data['tasks']; by_id={t['id']:t for t in tasks}; errors=[]
 if len(by_id)!=len(tasks):errors.append('IDs duplicados')
 states={'planned','in_progress','blocked','in_review','done','superseded'}
 validations={'pending','confirmed','resolved','superseded'}
 def deps(t):return [] if t['dependencias']=='—' else t['dependencias'].split()
 for t in tasks:
  tid=t['id']
  if not (ROOT/'specs'/f'{tid}.md').is_file():errors.append(f'{tid}: spec ausente')
  if t['status'] not in states:errors.append(f'{tid}: status inválido')
  if t['validation'] not in validations:errors.append(f'{tid}: validation inválida')
  try:datetime.date.fromisoformat(t['updated_at'])
  except (ValueError,TypeError):errors.append(f'{tid}: data inválida')
  if not isinstance(t['evidence'],list) or not isinstance(t['notes'],list):errors.append(f'{tid}: evidence/notes devem ser listas')
  if t['status'] in {'in_progress','blocked','in_review','done'} and not t['owner']:errors.append(f'{tid}: owner obrigatório')
  if t['status'] in {'in_progress','in_review','done'}:
   if t['validation']=='pending' or not re.fullmatch('[a-f0-9]{40}',t['validated_sha'] or ''):errors.append(f'{tid}: revalidação/SHA obrigatórios')
   if any(d in by_id and by_id[d]['status'] not in {'done','superseded'} for d in deps(t)):errors.append(f'{tid}: dependências abertas')
  if t['status']=='blocked' and not t['blocked_reason']:errors.append(f'{tid}: blocked_reason obrigatório')
  if t['status'] in {'in_review','done','superseded'} and not t['evidence']:errors.append(f'{tid}: evidências obrigatórias')
  for d in deps(t):
   if d not in by_id:errors.append(f'{tid}: dependência desconhecida {d}')
 visiting=set();visited=set()
 def walk(tid):
  if tid in visiting:errors.append(f'Ciclo em {tid}');return
  if tid in visited or tid not in by_id:return
  visiting.add(tid)
  for d in deps(by_id[tid]):walk(d)
  visiting.remove(tid);visited.add(tid)
 for tid in by_id:walk(tid)
 actual={f.stem for f in (ROOT/'specs').glob('T*.md')}
 if actual!=set(by_id):errors.append('Specs e backlog não correspondem')
 for f in ROOT.rglob('*.md'):
  for link in re.findall(r'\]\(([^)]+)\)',f.read_text()):
   if link.startswith(('http:','https:','#','mailto:')):continue
   target=link.split('#')[0]
   if target and not (f.parent/target).exists():errors.append(f'{f.relative_to(ROOT)}: link ausente {target}')
 if errors:
  print('\n'.join(errors));return 1
 print(f'Plano válido: {len(tasks)} tarefas; estados, dependências e links consistentes.');return 0
if __name__=='__main__':sys.exit(validate())
