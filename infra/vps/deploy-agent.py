"""Reviewed repo/service scope; no worker, database, cron or schema changes."""
import pathlib,subprocess,os,json,tarfile,io,fcntl,re,datetime,time
BASE=pathlib.Path('/opt/dbe-devops/copynews-api');REPO='git@github.com:jonatasismael1/copynews.git';SERVICE='dbe-copynews-api_runtime'
def run(args,**kw):return subprocess.run(args,check=True,capture_output=True,text=True,timeout=kw.pop('timeout',120),**kw).stdout.strip()
def main():
 lock=(BASE/'deploy.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 env=dict(os.environ,GIT_SSH_COMMAND='ssh -i /opt/dbe-devops/copynews-api/github-ro-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/opt/dbe-devops/copynews-api/github-known-hosts')
 repo=BASE/'repo.git'
 if not repo.exists():run(['git','clone','--bare','--filter=blob:none',REPO,str(repo)],env=env,timeout=180)
 assert run(['git','--git-dir',str(repo),'remote','get-url','origin'])==REPO
 run(['git','--git-dir',str(repo),'fetch','origin','main'],env=env,timeout=180)
 sha=run(['git','--git-dir',str(repo),'rev-parse','FETCH_HEAD']);assert re.fullmatch('[0-9a-f]{40}',sha)
 marker=BASE/'deployed.json';failed=BASE/'failed.json'
 if marker.exists()and json.loads(marker.read_text()).get('commit')==sha:return
 if failed.exists():
  f=json.loads(failed.read_text())
  if f.get('commit')==sha and time.time()-f.get('timestamp',0)<900:return
 work=BASE/('release-'+sha[:12]);work.mkdir(mode=0o700,exist_ok=True)
 archive=subprocess.check_output(['git','--git-dir',str(repo),'archive',sha],env=env,timeout=180)
 with tarfile.open(fileobj=io.BytesIO(archive))as t:
  for m in t.getmembers():assert not m.issym()and not m.islnk()and not m.name.startswith('/')and'..'not in pathlib.PurePosixPath(m.name).parts
  t.extractall(work,filter='data')
 tag='dbe-copynews-api:'+sha
 old=None
 try:
  with(work/'deploy-build.log').open('w')as log:subprocess.run(['docker','build','--build-arg','SOURCE_COMMIT='+sha,'-f',str(work/'infra/vps/Dockerfile.production'),'-t',tag,str(work)],stdout=log,stderr=subprocess.STDOUT,check=True,timeout=300)
  spec=json.loads(run(['docker','service','inspect',SERVICE]))[0]['Spec'];old=spec['TaskTemplate']['ContainerSpec']['Image'];assert old.startswith('dbe-copynews-api:')
  (BASE/('rollback-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')).write_text(json.dumps({'image':old,'commit':sha}))
  run(['docker','service','update','--no-resolve-image','--image',tag,'--update-order','start-first','--update-failure-action','rollback',SERVICE],timeout=180)
  cid=run(['docker','ps','-q','--filter','label=com.docker.swarm.service.name='+SERVICE]);assert cid and'\n'not in cid
  health=json.loads(run(['docker','exec',cid,'node','-e',"fetch('http://127.0.0.1:8080/healthz').then(r=>r.text()).then(console.log)"]))
  assert health['source']==sha and health['functions']==3
 except Exception:
  if old:subprocess.run(['docker','service','update','--no-resolve-image','--image',old,SERVICE],capture_output=True,timeout=180)
  failed.write_text(json.dumps({'commit':sha,'timestamp':time.time()}));raise
 marker.write_text(json.dumps({'commit':sha,'image':tag,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'health':health}))
 print(json.dumps({'deployed':sha,'functions':3}))
if __name__=='__main__':
 try:main()
 except BlockingIOError:pass
 except Exception as error:print(json.dumps({'failed':True,'error_class':type(error).__name__}));raise SystemExit(1)
