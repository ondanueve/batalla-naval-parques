#!/usr/bin/env python3
"""Sectores geográficos contiguos: cada parque es UNA grilla real de cols × rows sectores pegados
(cada sector es un rectángulo de w × 2w km, 10 × 20 celdas, norte arriba). En cada partida cada jugador
recibe un sector distinto y todos los elegidos forman un bloque conexo (nunca se pisan).
Baja las imágenes de Sentinel-2 cloudless (EOX, capa 2016, CC BY 4.0), calcula la máscara agua/tierra
por celda con los polígonos de agua de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL) o con el
color de la imagen (lagos glaciarios), verifica que la flota entera entre en cada sector con la regla
libre (cada pieza entera sobre agua = barco, entera sobre tierra = tanque) y escribe
maps/<parque>-s<NN>.jpg + tools/geo/boards.json + la tabla BOARDS de core.js.
Uso: python3 tools/geo/build.py [--preview]"""
import json, math, os, sys, io, urllib.request, urllib.parse
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 10, 20            # celdas por tablero
PX = 48                  # px por celda en el jpg (480×960)
# grilla de cada parque: centro (lat, lng), ancho w de cada sector en km (cada sector es w × 2w), cols × rows
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

FLEET = [5, 4, 3, 3, 2]   # tamaños fijos (iguales para todos)

def fits(mask):
    """¿Entra la flota completa sin pisarse, cada pieza entera sobre un solo medio? (backtracking)"""
    taken = [[False] * W for _ in range(H)]
    def opts(size):
        out = []
        for hz in (True, False):
            for y in range(H - (0 if hz else size - 1)):
                for x in range(W - (size - 1 if hz else 0)):
                    cells = [(x + i, y) if hz else (x, y + i) for i in range(size)]
                    if len(set(mask[cy][cx] for cx, cy in cells)) == 1:
                        out.append(cells)
        return out
    pre = {s: opts(s) for s in set(FLEET)}
    def rec(i):
        if i == len(FLEET):
            return True
        for cells in pre[FLEET[i]]:
            if any(taken[cy][cx] for cx, cy in cells):
                continue
            for cx, cy in cells: taken[cy][cx] = True
            if rec(i + 1): return True
            for cx, cy in cells: taken[cy][cx] = False
        return False
    return rec(0)

def main():
    out = {}
    prev = '--preview' in sys.argv
    sheets = []
    for park, z in ZONES.items():
        cols, rows, wkm = z['cols'], z['rows'], z['w']
        dlat = 2 * wkm / 111.32
        dlng = wkm / (111.32 * math.cos(math.radians(z['lat'])))
        west = z['lng'] - cols * dlng / 2
        north = z['lat'] + rows * dlat / 2
        full = [west, north - rows * dlat, west + cols * dlng, north]
        osm = None if ZONES_MASK.get(park) == 'color' else overpass([full[0] - 0.01, full[1] - 0.01, full[2] + 0.01, full[3] + 0.01])
        tiles = []
        for r in range(rows):
            for c in range(cols):
                bb = [west + c * dlng, north - (r + 1) * dlat, west + (c + 1) * dlng, north - r * dlat]
                im = fetch(bb, W * PX, H * PX, z.get('layer', LAYER['default']))
                k = r * cols + c
                if not prev:
                    im.save(os.path.join(ROOT, 'maps', '%s-s%02d.jpg' % (park, k)), quality=80, optimize=True, progressive=True)
                mask = osm_mask(osm, bb) if osm else color_mask(im)
                ok = fits(mask)
                tiles.append({'bbox': [round(v, 5) for v in bb], 'mask': mask, 'ok': ok})
                sh = im.copy(); d = ImageDraw.Draw(sh, 'RGBA')
                for y in range(H):
                    for x in range(W):
                        if mask[y][x] == 'W':
                            d.rectangle((x * PX, y * PX, (x + 1) * PX, (y + 1) * PX), fill=(0, 120, 255, 70))
                if not ok:
                    d.line((0, 0, W * PX, H * PX), fill=(255, 0, 0, 255), width=12)
                d.rectangle((0, 0, W * PX - 1, H * PX - 1), outline=(255, 255, 0, 255), width=3)
                sheets.append((park, r, c, cols, sh.resize((120, 240))))
        wet = [sum(row.count('W') for row in t['mask']) / (W * H) for t in tiles]
        print(park, 'sectores', len(tiles), 'viables', sum(t['ok'] for t in tiles), 'agua %', [round(100 * v) for v in wet])
        out[park] = {'center': [round(z['lat'], 5), round(z['lng'], 5)], 'km': [round(cols * wkm, 3), round(rows * 2 * wkm, 3)],
                     'cols': cols, 'rows': rows, 'bbox': [round(v, 5) for v in full], 'tiles': tiles}
    json.dump(out, open(os.path.join(os.path.dirname(__file__), 'boards.json'), 'w'), indent=1)
    if not prev:
        core = os.path.join(ROOT, 'core.js')
        src = open(core).read()
        i, j = src.index('/* BOARDS:BEGIN */'), src.index('/* BOARDS:END */')
        lines = ['/* BOARDS:BEGIN */', '  const BOARDS = {']
        for park, g in out.items():
            lines.append('    %s: { center: %s, km: %s, cols: %d, rows: %d, bbox: %s, tiles: [' % (park, json.dumps(g['center']), json.dumps(g['km']), g['cols'], g['rows'], json.dumps(g['bbox'])))
            for t in g['tiles']:
                lines.append('      ' + json.dumps(t, separators=(',', ':')) + ',')
            lines.append('    ] },')
        lines.append('  };')
        lines.append('  ')
        open(core, 'w').write(src[:i] + '\n'.join(lines) + src[j:])
    # hoja de control: cada parque como su grilla real (azul = agua, rojo = sector descartado)
    parks = list(out.keys())
    wmax = max(out[p]['cols'] for p in parks) * 124
    hs = [out[p]['rows'] * 244 + 10 for p in parks]
    S = Image.new('RGB', (wmax, sum(hs)), 'black')
    yo = 0
    for p, hh in zip(parks, hs):
        for (pk, r, c, cols, sh) in sheets:
            if pk == p: S.paste(sh, (c * 124, yo + r * 244))
        yo += hh
    os.makedirs('/workspace/geo-cache', exist_ok=True)
    S.save('/workspace/geo-cache/sheet.jpg', quality=85)
    print('ok')

if __name__ == '__main__':
    main()
