# Desempaqueta un export de Claude Design (__bundler/manifest) en sitio.html + assets/.
#   python3 -I diseno/desempaquetar.py "diseno/AutoShop Automotora — Web.html" diseno
# Cada página del tablero (diseno/assets/<uuid>.html) es a su vez un export: se desempaqueta igual en
# diseno/paginas/<página>/ (el nombre sale del título de su recuadro en diseno/sitio.html).
import sys,re,json,base64,gzip,os
src,out=sys.argv[1],sys.argv[2]
s=open(src,encoding='utf-8').read()
def blk(t):
    m=re.search(r'<script type="'+re.escape(t)+r'">(.*?)</script>',s,re.S); return m.group(1)
man=json.loads(blk('__bundler/manifest'))
tpl=json.loads(blk('__bundler/template'))
ext=json.loads(blk('__bundler/ext_resources'))
EXT={'text/javascript':'js','application/javascript':'js','font/woff2':'woff2','image/png':'png','image/jpeg':'jpg','image/svg+xml':'svg','text/css':'css','text/html':'html','image/webp':'webp'}
os.makedirs(out+'/assets',exist_ok=True)
names={}
for u,e in man.items():
    b=base64.b64decode(e['data'])
    if e.get('compressed'): b=gzip.decompress(b)
    x='woff2' if b[:4]==b'wOF2' else EXT.get(e['mime'],'bin')
    n=f'assets/{u}.{x}'
    open(f'{out}/{n}','wb').write(b)
    names[u]=n
    print(u,e['mime'],len(b))
for r in ext: names[r['uuid']]=r['id']
for u,n in names.items(): tpl=tpl.replace(u,n)
open(out+'/sitio.html','w',encoding='utf-8').write(tpl)
print('template',len(tpl))
