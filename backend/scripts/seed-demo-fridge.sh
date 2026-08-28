#!/bin/sh
# Quick demo data for local dev: one fridge, two sections, a spread of items with
# varying expiry so freshness bars show green/amber/red. Idempotent-ish — re-running
# just adds another "Home Fridge".
#
# Usage: API=http://127.0.0.1:8000/api EMAIL=keira@thatfridge.test PASS=password123 sh backend/scripts/seed-demo-fridge.sh
set -e
API="${API:-http://127.0.0.1:8000/api}"
EMAIL="${EMAIL:-keira@thatfridge.test}"
PASS="${PASS:-password123}"

j() { python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('data') or d)$1)"; }
post() { curl -s -X POST "$API$1" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$2"; }

TOKEN=$(curl -s -X POST "$API/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | j "['token']")
FID=$(post /fridges '{"name":"Home Fridge"}' | j "['id']")
TOP=$(post "/fridges/$FID/sections" '{"name":"Top shelf"}' | j "['id']")
CRISPER=$(post "/fridges/$FID/sections" '{"name":"Crisper"}' | j "['id']")

soon()  { date -u -v+"$1"d +%Y-%m-%d 2>/dev/null || date -u -d "+$1 days" +%Y-%m-%d; }
# freshness needs BOTH expiry_date and shelf_life_days — see ItemResource.php
item() { post "/sections/$1/items" "{\"name\":\"$2\",\"icon\":\"$3\",\"location\":\"$4\",\"quantity\":$5,\"nutrition_category\":\"$6\",\"expiry_date\":\"$(soon $7)\",\"shelf_life_days\":$8}" >/dev/null; }

item "$TOP"     "Milk"           milk    fridge  2  dairy       2  7
item "$TOP"     "Greek Yogurt"   yogurt  fridge  1  dairy       9  21
item "$TOP"     "Eggs"           egg     fridge  12 protein     18 30
item "$TOP"     "Chicken Breast" chicken freezer 3  protein     40 120
item "$CRISPER" "Spinach"        spinach fridge  1  vegetables  1  6
item "$CRISPER" "Carrots"        carrot  fridge  6  vegetables  14 21
item "$CRISPER" "Apples"         apple   fridge  4  fruit       10 20
item "$CRISPER" "Bread"          bread   pantry  1  grains      4  7

echo "Seeded fridge $FID for $EMAIL"
