"""Call the existing Dokploy localhost API over an authorized SSH exec session.

No port forward/daemon, credentials on argv, raw response bodies or secret logging.
This helper never performs migrations, DNS edits, deletion or shared-service actions.
"""
import json
import shlex
import subprocess
from pathlib import Path

from dotenv import dotenv_values


REMOTE = '''import json,sys,urllib.request,urllib.error
p=json.load(sys.stdin)
if p.get('env_patch'):
 import urllib.parse,re
 req=urllib.request.Request('http://127.0.0.1:3000/api/application.one?'+urllib.parse.urlencode({'applicationId':p['body']['applicationId']}),headers={'x-api-key':p['key']})
 with urllib.request.urlopen(req,timeout=30) as r:current=json.load(r)
 environment=current.get('env') or ''
 for k,v in p['env_patch'].items():
  if not re.fullmatch(r'[A-Z][A-Z0-9_]*',k):raise ValueError('Invalid environment key')
  line=k+'='+json.dumps(v)
  environment,count=re.subn('^'+k+'=.*$',lambda match:line,environment,flags=re.M)
  if not count:environment+='\\n'+line+'\\n'
 p['body']={'applicationId':p['body']['applicationId'],'env':environment,'buildArgs':current.get('buildArgs'),'buildSecrets':current.get('buildSecrets'),'createEnvFile':False}
url='http://127.0.0.1:3000/api/'+p['endpoint']
if p.get('query'):
 import urllib.parse
 url+='?'+urllib.parse.urlencode(p['query'])
data=json.dumps(p['body']).encode() if p.get('body') is not None else None
content_type='application/json'
if p.get('zip_base64'):
 import base64,uuid
 boundary='----SportHost'+uuid.uuid4().hex
 parts=[]
 for k,v in p['body'].items():
  parts.append(('--'+boundary+'\\r\\nContent-Disposition: form-data; name="'+k+'"\\r\\n\\r\\n'+str(v)+'\\r\\n').encode())
 parts.append(('--'+boundary+'\\r\\nContent-Disposition: form-data; name="zip"; filename="sporthost-source.zip"\\r\\nContent-Type: application/zip\\r\\n\\r\\n').encode()+base64.b64decode(p['zip_base64'])+b'\\r\\n')
 data=b''.join(parts)+('--'+boundary+'--\\r\\n').encode()
 content_type='multipart/form-data; boundary='+boundary
request=urllib.request.Request(url,data=data,method=p['method'],headers={'x-api-key':p['key'],'content-type':content_type,'accept':'application/json'})
try:
 with urllib.request.urlopen(request,timeout=45) as r:
  raw=r.read()
  try:result=json.loads(raw) if raw else None
  except ValueError:result={}
 if p['endpoint']=='docker.getConfig' and isinstance(result,str):
  result=json.loads(result)
 safe={}
 if isinstance(result,dict):
  safe={k:result.get(k) for k in p['fields'] if k in result}
  safe['response_keys']=list(result)
  if p['endpoint']=='application.one':
   safe['configured_mounts']=[{k:mount.get(k) for k in ('mountId','type','volumeName','mountPath','applicationId')} for mount in result.get('mounts',[])]
  if p['endpoint']=='docker.getConfig':
   config=result
   if isinstance(result.get('config'),str):
    try:config=json.loads(result['config'])
    except Exception:pass
   safe['networks']={n:{k:v.get(k) for k in ('IPAddress','IPPrefixLen','Gateway','NetworkID')} for n,v in config.get('NetworkSettings',{}).get('Networks',{}).items()}
   safe['state']={k:config.get('State',{}).get(k) for k in ('Status','Running','Restarting')}
   safe['health_status']=config.get('State',{}).get('Health',{}).get('Status')
   pairs=dict(x.split('=',1) for x in config.get('Config',{}).get('Env',[]) if '=' in x)
   safe['runtime_flags']={k:pairs.get(k) for k in ('APP_ENV','APP_READ_ONLY','EMAIL_ENABLED','COOKIE_SECURE','PORT','STORAGE_BACKEND','FORWARDED_ALLOW_IPS')}
   safe['secret_presence']={k:bool(pairs.get(k)) for k in ('DATABASE_URL','SECRET_KEY','BLOB_READ_WRITE_TOKEN','RESEND_API_KEY')}
   safe['has_public_port_bindings']=bool(config.get('HostConfig',{}).get('PortBindings'))
   safe['runtime_user']=config.get('Config',{}).get('User')
   safe['node_server_command']=config.get('Config',{}).get('Cmd')==['node','server.js']
   safe['persistent_mounts']=[{k:m.get(k) for k in ('Type','Name','Destination','RW')} for m in config.get('Mounts',[])]
   safe['runtime_limits']={k:config.get('HostConfig',{}).get(k) for k in ('Memory','NanoCpus')}
 elif isinstance(result,list):safe={'items':[{k:item.get(k) for k in p['fields'] if k in item} for item in result if isinstance(item,dict)],'result_count':len(result)}
 elif isinstance(result,str) and p['endpoint']=='domain.generateDomain':safe={'generated_host':result}
 else:safe={'result_type':type(result).__name__,'result_count':len(result) if isinstance(result,list) else None}
 print(json.dumps({'ok':True,'result':safe}))
except urllib.error.HTTPError as e:
 out={'ok':False,'http_status':e.code}
 try:
  result=json.loads(e.read())
  # Only structured validation paths/codes, not echoed values or provider bodies.
  if isinstance(result,dict):
   out['code']=result.get('code')
   out['validation']=[{'path':i.get('path'),'code':i.get('code')} for i in result.get('issues',[]) if isinstance(i,dict)]
 except Exception:pass
 print(json.dumps(out))
except Exception as e:print(json.dumps({'ok':False,'error_category':type(e).__name__}))
'''

SAFE_FIELDS = {'projectId','applicationId','environmentId','domainId','name','appName','applicationStatus',
               'buildType','dockerfile','dockerContextPath','dockerBuildStage','sourceType','buildPath',
               'autoDeploy','customGitUrl','customGitBranch','branch','repository','githubId',
               'port','path','https','certificateType','host','serverId','version','deploymentId',
               'replicas','memoryLimit','cpuLimit','healthCheckSwarm','networkSwarm',
               'containerId','id','Names','Name','Image','State','Status','image','state','status',
               'deploymentStatus','title','createdAt','description','mountId','volumeName','mountPath','serviceId','type'}
ALLOWED = {'application.create','application.one','application.update','application.saveBuildType',
           'application.saveEnvironment','application.saveGitProvider','application.saveGithubProvider',
           'application.deploy','domain.create','domain.generateDomain','domain.byApplicationId','deployment.all',
           'docker.getContainers','docker.getConfig','docker.getContainersByAppNameMatch','application.dropDeployment','mounts.create','mounts.remove','mounts.allNamedByApplicationId'}


def call(endpoint, *, body=None, query=None, fields=(), zip_path=None, env_patch=None):
    if endpoint not in ALLOWED or not set(fields).issubset(SAFE_FIELDS):
        raise ValueError('Endpoint/fields outside SportHost setup scope')
    values=dotenv_values('.env.dokploy.local')
    key=values.get('DOKPLOY_API_KEY')
    if not key or key=='[SENSITIVE]':raise RuntimeError('Dokploy API key is missing')
    payload={'key':key,'endpoint':endpoint,'method':'POST' if body is not None else 'GET',
             'body':body,'query':query,'fields':list(fields)}
    if env_patch is not None:
        if endpoint != 'application.saveEnvironment':raise ValueError('Environment patches require the environment endpoint')
        payload['env_patch']=env_patch
    if zip_path is not None:
        if endpoint != 'application.dropDeployment':raise ValueError('Uploads only use the documented Dokploy source deployment endpoint')
        import base64
        payload['zip_base64']=base64.b64encode(Path(zip_path).read_bytes()).decode()
    result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','sporthost',
                           'python3 -c '+shlex.quote(REMOTE)],
                          input=json.dumps(payload).encode(),capture_output=True,timeout=60)
    if result.returncode:raise RuntimeError('SSH API call failed; no credentials logged')
    return json.loads(result.stdout)
