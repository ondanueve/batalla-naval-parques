#!/usr/bin/env python3
"""Tableros geográficos contiguos: para cada parque y terreno, una franja real norte-sur partida en dos
rectángulos pegados (Argentina al sur, el invasor al norte). Baja las imágenes de Sentinel-2 cloudless
(EOX, capa 2016, CC BY 4.0), calcula la máscara agua/tierra por celda para el modo mixto con los
polígonos de agua de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL) y escribe
maps/<parque>-<terreno>-<encuadre><a|b>.jpg + tools/geo/boards.json.
Uso: python3 tools/geo/build.py [--preview]"""
import json, math, os, sys, io, urllib.request, urllib.parse
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 10, 20            # celdas por tablero
PX = 48                  # px por celda en el jpg (480×960)
CROPS = 5
# franja de cada encuadre: centro de la franja (lat, lng), ancho en km (cada tablero es ancho × 2·ancho)
ZONES = json.load(open(os.path.join(os.path.dirname(__file__), 'zones.json')))
LAYER = {'default': 's2cloudless'}
# de dónde sale la máscara agua/tierra: OSM (por defecto) o el color de la imagen (lagos glaciarios)
ZONES_MASK = {'glaciares': 'color'}

def bbox(lat, lng, wkm, hkm):
    dlat = hkm / 111.32
    dlng = wkm / (111.32 * math.cos(math.radians(lat)))
    return [lng - dlng / 2, lat - dlat / 2, lng + dlng / 2, lat + dlat / 2]

def fetch(b, w, h, layer):
    url = ("https://tiles.maps.eox.at/wms?service=WMS&request=GetMap&version=1.1.1&layers=%s&styles=&srs=EPSG:4326"
           "&bbox=%f,%f,%f,%f&width=%d&height=%d&format=image/jpeg" % (layer, b[0], b[1], b[2], b[3], w, h))
    cache = os.path.join('/workspace/geo-cache', '%s_%.5f_%.5f_%.5f_%.5f_%d_%d.jpg' % ((layer,) + tuple(b) + (w, h)))
    os.makedirs('/workspace/geo-cache', exist_ok=True)
    if not os.path.exists(cache):
        urllib.request.urlretrieve(url, cache)
    return Image.open(cache).convert('RGB')

def is_water(r, g, b):
    """Lagos glaciarios (celeste lechoso): para parques donde OSM no responde con polígonos manejables."""
    return r < 200 and (r + g + b) > 230 and (b > r + 26 or (g > r + 30 and b > r + 5))

def color_mask(img):
    rows = []
    for y in range(H):
        row = ''
        for x in range(W):
            cell = img.crop((x * PX, y * PX, (x + 1) * PX, (y + 1) * PX)).resize((12, 12))
            px = list(cell.get_flattened_data() if hasattr(cell, 'get_flattened_data') else cell.getdata())
            wet = sum(1 for p in px if is_water(*p))
            row += 'W' if wet > len(px) * 0.5 else 'L'
        rows.append(row)
    return rows

def overpass(b):
    """Polígonos de agua de OSM en el bbox [w, s, e, n] (cacheado)."""
    cache = '/workspace/geo-cache/osm_%.4f_%.4f_%.4f_%.4f.json' % tuple(b)
    d = os.path.dirname(cache)
    for f in os.listdir(d) if os.path.isdir(d) else []:
        if f.startswith('osm_'):
            c = [float(v) for v in f[4:-5].split('_')]
            if c[0] <= b[0] + 0.011 and c[1] <= b[1] + 0.011 and c[2] >= b[2] - 0.011 and c[3] >= b[3] - 0.011:
                return json.load(open(os.path.join(d, f)))   # ya hay uno que lo cubre
    if not os.path.exists(cache):
        q = ('[out:json][timeout:120];(way["natural"="water"](%f,%f,%f,%f);relation["natural"="water"](%f,%f,%f,%f);'
             'way["waterway"="riverbank"](%f,%f,%f,%f);relation["waterway"="riverbank"](%f,%f,%f,%f););out geom;') % ((b[1], b[0], b[3], b[2]) * 4)
        import time
        last = None
        for attempt in range(6):
            for ep in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):
                try:
                    req = urllib.request.Request(ep, data=('data=' + urllib.parse.quote(q)).encode(),
                                                 headers={'User-Agent': 'parques-en-guerra-build/1.0', 'Accept': '*/*'})
                    data = urllib.request.urlopen(req, timeout=180).read()
                    json.loads(data)
                    open(cache, 'wb').write(data)
                    return json.load(open(cache))
                except Exception as e:
                    last = e
                    print('overpass', ep, e, file=sys.stderr)
            time.sleep(15)
        raise last
    return json.load(open(cache))

def rings(el):
    """Anillos (outer, inner) de un way cerrado o de una relación multipolígono (une tramos)."""
    if el['type'] == 'way':
        g = [(p['lon'], p['lat']) for p in el.get('geometry', [])]
        return [g], []
    out, inn = [], []
    for role, acc in (('outer', out), ('inner', inn)):
        segs = [[(p['lon'], p['lat']) for p in m.get('geometry', [])] for m in el.get('members', []) if (m.get('role') or 'outer') == role and m.get('geometry')]
        while segs:
            ring = segs.pop(0)
            changed = True
            while changed and ring[0] != ring[-1]:
                changed = False
                for i, sg in enumerate(segs):
                    if sg[0] == ring[-1]: ring = ring + sg[1:]
                    elif sg[-1] == ring[-1]: ring = ring + sg[::-1][1:]
                    elif sg[-1] == ring[0]: ring = sg[:-1] + ring
                    elif sg[0] == ring[0]: ring = sg[::-1][:-1] + ring
                    else: continue
                    segs.pop(i); changed = True; break
            acc.append(ring)
    return out, inn

def osm_mask(osm, bb):
    """10×20 de 'W'/'L' para el bbox [w, s, e, n] del tablero (norte arriba)."""
    RW, RH = W * 12, H * 12
    im = Image.new('L', (RW, RH), 0)
    d = ImageDraw.Draw(im)
    tx = lambda p: ((p[0] - bb[0]) / (bb[2] - bb[0]) * RW, (bb[3] - p[1]) / (bb[3] - bb[1]) * RH)
    inners = []
    for el in osm['elements']:
        if el.get('tags', {}).get('water') in ('wastewater', 'swimming_pool'):
            continue
        out, inn = rings(el)
        for r in out:
            if len(r) >= 3: d.polygon([tx(p) for p in r], fill=255)
        inners += inn
    for r in inners:
        if len(r) >= 3: d.polygon([tx(p) for p in r], fill=0)
    rows = []
    for y in range(H):
        row = ''
        for x in range(W):
            c = im.crop((x * 12, y * 12, (x + 1) * 12, (y + 1) * 12))
            row += 'W' if sum(c.tobytes()) > 255 * 72 else 'L'
        rows.append(row)
    return rows

def main():
    out = {}
    prev = '--preview' in sys.argv
    sheets = []
    for park, terrains in ZONES.items():
        out[park] = {}
        # un solo pedido a OSM por parque (la unión de todas sus franjas)
        allb = [bbox(z['lat'] + (k - 2) * z.get('dlat', 0), z['lng'] + (k - 2) * z.get('dlng', 0), z['w'], 4 * z['w']) for z in terrains.values() for k in range(CROPS)]
        osm = None if ZONES_MASK.get(park) == 'color' else overpass([min(b[0] for b in allb) - 0.01, min(b[1] for b in allb) - 0.01, max(b[2] for b in allb) + 0.01, max(b[3] for b in allb) + 0.01])
        for terrain, z in terrains.items():
            out[park][terrain] = []
            for k in range(CROPS):
                lat = z['lat'] + (k - 2) * z.get('dlat', 0)
                lng = z['lng'] + (k - 2) * z.get('dlng', 0)
                wkm = z['w']
                full = bbox(lat, lng, wkm, 4 * wkm)          # franja completa (los dos tableros)
                img = fetch(full, W * PX, 2 * H * PX, z.get('layer', LAYER['default']))
                north, south = img.crop((0, 0, W * PX, H * PX)), img.crop((0, H * PX, W * PX, 2 * H * PX))
                midlat = (full[1] + full[3]) / 2
                boards = {'a': (south, [full[0], full[1], full[2], midlat]), 'b': (north, [full[0], midlat, full[2], full[3]])}
                rec = {'center': [round(lat, 5), round(lng, 5)], 'km': [wkm, 4 * wkm], 'bbox': [round(v, 5) for v in full]}
                for side, (im, bb) in boards.items():
                    name = '%s-%s-%d%s.jpg' % (park, terrain, k, side)
                    if not prev:
                        im.save(os.path.join(ROOT, 'maps', name), quality=82, optimize=True, progressive=True)
                    rec[side] = {'bbox': [round(v, 5) for v in bb], 'mask': (osm_mask(osm, bb) if osm else color_mask(im)) if terrain == 'mixto' else None}
                out[park][terrain].append(rec)
                if terrain == 'mixto' or prev:
                    sh = img.copy(); d = ImageDraw.Draw(sh, 'RGBA')
                    for side, yoff in (('b', 0), ('a', H * PX)):
                        m = rec[side]['mask']
                        if m:
                            for y in range(H):
                                for x in range(W):
                                    if m[y][x] == 'W':
                                        d.rectangle((x * PX, yoff + y * PX, (x + 1) * PX, yoff + (y + 1) * PX), fill=(0, 120, 255, 70))
                    d.line((0, H * PX, W * PX, H * PX), fill=(255, 255, 0, 255), width=4)
                    sheets.append(sh.resize((120, 480)))
    json.dump(out, open(os.path.join(os.path.dirname(__file__), 'boards.json'), 'w'), indent=1)
    if not prev:
        core = os.path.join(ROOT, 'core.js')
        src = open(core).read()
        i, j = src.index('/* BOARDS:BEGIN */'), src.index('/* BOARDS:END */')
        lines = ['/* BOARDS:BEGIN */', '  const BOARDS = {']
        for park, ts in out.items():
            lines.append('    %s: {' % park)
            for terrain, zs in ts.items():
                lines.append('      %s: [' % terrain)
                for z in zs:
                    lines.append('        ' + json.dumps({'center': z['center'], 'km': z['km'], 'a': z['a'], 'b': z['b']}, separators=(',', ':')) + ',')
                lines.append('      ],')
            lines.append('    },')
        lines.append('  };')
        lines.append('  ')
        open(core, 'w').write(src[:i] + '\n'.join(lines) + src[j:])
    if sheets:
        cols = 15
        rows_n = (len(sheets) + cols - 1) // cols
        S = Image.new('RGB', (cols * 124, rows_n * 484), 'black')
        for i, s in enumerate(sheets):
            S.paste(s, ((i % cols) * 124, (i // cols) * 484))
        S.save('/workspace/geo-cache/sheet.jpg', quality=85)
    print('ok')

if __name__ == '__main__':
    main()
