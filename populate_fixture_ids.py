import urllib.request
import json
import time

API_KEY = "4a78829c8e7307cab4d598e77994c8d4"
SUPABASE_URL = "https://bsrvqpggsxyrxatdtnqf.supabase.co"
SERVICE_KEY = "sb_secret_q0j7LNutUwOP6y84jKpkZw_6s6snPt8"

# Fetch all WC 2026 fixtures from API
url = "https://v3.football.api-sports.io/fixtures?league=1&season=2026"
req = urllib.request.Request(url, headers={"x-apisports-key": API_KEY})
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())

api_fixtures = data["response"]
print(f"Got {len(api_fixtures)} fixtures from API")

# For each API fixture, update our DB row by matching date + home team name
updated = 0
for f in api_fixtures:
    api_id = f["fixture"]["id"]
    date = f["fixture"]["date"][:10]  # YYYY-MM-DD
    home_team = f["teams"]["home"]["name"]
    
    # Update our fixtures row where date matches and home_team matches
    patch_url = f"{SUPABASE_URL}/rest/v1/fixtures?date=gte.{date}T00:00:00&date=lte.{date}T23:59:59&home_team=eq.{urllib.parse.quote(home_team)}"
    patch_req = urllib.request.Request(
        patch_url,
        data=json.dumps({"api_fixture_id": api_id}).encode(),
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        method="PATCH"
    )
    try:
        with urllib.request.urlopen(patch_req) as r:
            updated += 1
            print(f"✓ {home_team} on {date} → api_id {api_id}")
    except Exception as e:
        print(f"✗ {home_team} on {date}: {e}")
    time.sleep(0.1)

print(f"\nDone! Updated {updated} fixtures")
