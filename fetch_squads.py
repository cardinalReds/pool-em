import urllib.request
import json
import time

API_KEY = "4a78829c8e7307cab4d598e77994c8d4"

TEAMS = [
    (16,"Mexico"),(1531,"South Africa"),(17,"South Korea"),(770,"Czechia"),
    (5529,"Canada"),(1113,"Bosnia and Herzegovina"),(1569,"Qatar"),(15,"Switzerland"),
    (6,"Brazil"),(31,"Morocco"),(2386,"Haiti"),(1108,"Scotland"),
    (2384,"USA"),(2380,"Paraguay"),(20,"Australia"),(777,"Türkiye"),
    (25,"Germany"),(5530,"Curaçao"),(1501,"Ivory Coast"),(2382,"Ecuador"),
    (1118,"Netherlands"),(12,"Japan"),(5,"Sweden"),(28,"Tunisia"),
    (1,"Belgium"),(32,"Egypt"),(22,"Iran"),(4673,"New Zealand"),
    (9,"Spain"),(1533,"Cape Verde"),(23,"Saudi Arabia"),(7,"Uruguay"),
    (2,"France"),(13,"Senegal"),(1567,"Iraq"),(1090,"Norway"),
    (26,"Argentina"),(1532,"Algeria"),(775,"Austria"),(1548,"Jordan"),
    (27,"Portugal"),(1508,"Congo DR"),(1568,"Uzbekistan"),(8,"Colombia"),
    (10,"England"),(3,"Croatia"),(1504,"Ghana"),(11,"Panama"),
]

all_players = {}

for team_id, team_name in TEAMS:
    url = f"https://v3.football.api-sports.io/players/squads?team={team_id}"
    req = urllib.request.Request(url, headers={"x-apisports-key": API_KEY})
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
        squad = data.get("response", [{}])[0].get("players", [])
        players = []
        for p in squad:
            players.append({
                "name": p.get("name", ""),
                "position": p.get("position", "Unknown"),
                "number": p.get("number")
            })
        all_players[team_name] = players
        print(f"✓ {team_name}: {len(players)} players")
        time.sleep(0.3)
    except Exception as e:
        print(f"✗ {team_name}: {e}")
        all_players[team_name] = []

# Write TypeScript file
lines = ["// Auto-generated WC 2026 squad data"]
lines.append("export interface Player { name: string; position: string; number?: number }")
lines.append("export const WC_SQUADS: Record<string, Player[]> = {")
for team_name, players in all_players.items():
    safe_name = team_name.replace("'", "\\'")
    lines.append(f"  '{safe_name}': [")
    for p in players:
        pname = p['name'].replace("'", "\\'")
        pos = p['position'].replace("'", "\\'")
        num = p['number'] if p['number'] else 'undefined'
        lines.append(f"    {{ name: '{pname}', position: '{pos}', number: {num} }},")
    lines.append("  ],")
lines.append("}")

with open("wc_squads.ts", "w") as f:
    f.write("\n".join(lines))

print("\nDone! wc_squads.ts generated")
