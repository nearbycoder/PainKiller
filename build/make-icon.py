import struct,zlib
size=512
outer=[(256,35),(445,140),(445,373),(256,478),(67,373),(67,140)]
inner=[(256,47),(434,146),(434,367),(256,466),(78,367),(78,146)]
def inside(x,y,poly):
    result=False
    for i in range(len(poly)):
        a,b=poly[i],poly[(i+1)%len(poly)]
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: result=not result
    return result
raw=bytearray()
for y in range(size):
    raw.append(0)
    for x in range(size):
        color=(15,26,23,255)
        if inside(x,y,outer): color=(181,163,119,255)
        if inside(x,y,inner): color=(20,35,28,255)
        if 232<x<280 and 104<y<404 or 147<x<365 and 193<y<240: color=(189,73,43,255)
        if 242<x<246 and 115<y<390 or 155<x<357 and 199<y<203: color=(239,163,92,255)
        raw.extend(color)
def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
with open('build/icon.png','wb') as f:f.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
