"""Compress embedded runtime textures; preserve full-resolution packed .blend masters.
No topology, skinning, animations, buffer references, or alpha masks are removed.
"""
from pathlib import Path
from PIL import Image
import io,json,struct,sys
R=Path(__file__).resolve().parents[1]
for path in ([R/'public/assets/models'/name for name in sys.argv[1:]] if len(sys.argv)>1 else (R/'public/assets/models').glob('*.glb')):
 data=path.read_bytes();jsize=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jsize]);binary=data[28+jsize:];replacements={}
 for image in doc.get('images',[]):
  if 'bufferView' not in image:continue
  i=image['bufferView'];v=doc['bufferViews'][i];raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  pic=Image.open(io.BytesIO(raw));pic.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  alpha=pic.mode=='RGBA' and pic.getextrema()[3][0]<255
  out=io.BytesIO()
  if alpha:pic.save(out,format='PNG',optimize=True);image['mimeType']='image/png'
  else:pic.convert('RGB').save(out,format='JPEG',quality=90,optimize=True);image['mimeType']='image/jpeg'
  replacements[i]=out.getvalue()
 newbin=bytearray()
 for i,v in enumerate(doc['bufferViews']):
  raw=replacements.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);newbin+=b'\0'*((-len(newbin))%4);v['byteOffset']=len(newbin);v['byteLength']=len(raw);newbin+=raw
 newbin+=b'\0'*((-len(newbin))%4);doc['buffers'][0]['byteLength']=len(newbin)
 js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 result=struct.pack('<III',0x46546c67,2,28+len(js)+len(newbin))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(newbin),b'BIN\0')+newbin
 path.write_bytes(result);print(path.name,round(len(data)/1e6,1),'->',round(len(result)/1e6,1),'MB',flush=True)
