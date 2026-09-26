import json, math, os

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

SITES = {
    'LOC01': (27.604, 88.646, 'Chungthang Confluence Hub'),
    'LOC02': (27.399, 88.524, 'Dikchu Teesta River Gorge'),
    'LOC03': (27.690, 88.740, 'Lachung High Ridge'),
    'LOC04': (27.720, 88.550, 'Lachen Alpine Valley'),
    'LOC05': (27.2345, 88.4972, 'Singtam Lower River Basin'),
    'LOC06': (27.1739, 88.5180, 'Rangpo Border River Delta')
}

SRC_FILE = 'FLOWS/backend/data/sikkim_osm_rivers_processed.json'
with open(SRC_FILE, 'r', encoding='utf-8') as f:
    rivers = json.load(f)

EXTERNAL_NAMES = {'murti', 'neora', 'ni chu', 'nartang', 'dre chu', 'di chu'}

clean_rivers = []
for r in rivers:
    pts = r['points']
    name = r.get('name', 'Teesta Drainage Reach').strip()
    name_lower = name.lower()
    
    # Calculate min distance to each site
    dists = {loc: min(haversine(p[0], p[1], slat, slon) for p in pts) for loc, (slat, slon, _) in SITES.items()}
    closest_loc = min(dists, key=dists.get)
    min_d_km = dists[closest_loc] / 1000.0
    
    avg_lat = sum(p[0] for p in pts) / len(pts)
    avg_lon = sum(p[1] for p in pts) / len(pts)
    
    # Check if external Duars/North Bengal plains river
    is_external = False
    if any(ext in name_lower for ext in EXTERNAL_NAMES):
        is_external = True
    elif avg_lon > 88.70 and avg_lat < 27.18:
        is_external = True
    elif avg_lat < 27.02 and (avg_lon < 88.41 or avg_lon > 88.55):
        is_external = True
        
    if is_external:
        continue
        
    r['nearLocationId'] = closest_loc
    r['minDistanceKm'] = round(min_d_km, 2)
    
    # Identify Teesta downstream corridor
    is_downstream_teesta = (avg_lat < 27.18 and 88.42 <= avg_lon <= 88.54)
    r['isDownstreamTeesta'] = is_downstream_teesta
    
    # Identify Teesta main stem
    rname_lower = name.lower()
    r['isTeestaMainStem'] = ('teesta' in rname_lower or is_downstream_teesta)
    
    clean_rivers.append(r)

print(f"Original rivers: {len(rivers)}")
print(f"Filtered clean Sikkim rivers: {len(clean_rivers)}")

# Save to all 3 paths
TARGET_PATHS = [
    'FLOWS/backend/data/sikkim_osm_rivers_processed.json',
    'FLOWS/frontend/src/data/sikkim_osm_rivers.json',
    'frontend/src/data/sikkim_osm_rivers.json'
]

for p in TARGET_PATHS:
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(clean_rivers, f, indent=2)
    print(f"Saved {len(clean_rivers)} clean rivers to {p}")
