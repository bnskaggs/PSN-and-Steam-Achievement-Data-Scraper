# PSN and Steam Achievement Data Scraper

Two lightweight CLI tools for exporting global achievement/trophy data from Steam and PlayStation Network into tidy CSV files.

## Steam achievements (Python)

### Setup
1. `cd steam`
2. `python -m venv .venv`
3. Activate the virtual environment: `. .venv/bin/activate` (macOS/Linux) or `.venv\Scripts\activate` (Windows)
4. `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and set `STEAM_API_KEY`

### Run

- `python steam_achievements.py --appid 620`
- `python steam_achievements.py --appid 620 --lang french --out portal2_fr.csv`

### Output CSV columns
`api_name,title,description,hidden,icon,icon_gray,global_percent`


<<<<<<< HEAD
## One-off PSN trophy page → CSV (Playwright)

This tool extracts trophy lists and global rarity % from public pages (PSNProfiles / Exophase) without NPWR or PSN login.

### Install once
npm i -D playwright ts-node typescript @types/node
npx playwright install chromium

### Usage
# PSNProfiles:
npx ts-node tools/psn_trophies_from_page.ts --url "https://psnprofiles.com/trophies/22414-street-fighter-6" --out sf6_psnprofiles.csv

# Exophase:
npx ts-node tools/psn_trophies_from_page.ts --url "https://www.exophase.com/game/street-fighter-6-ps4/trophies/" --out sf6_exophase.csv

Outputs CSV columns:
trophy_id,title,description,rarity_percent,rarity_bucket,hidden,icon,source_url

Notes:
- Be respectful: one page at a time, cache results, do not hammer sites.
- Site HTML may change; update selectors in tools/psn_trophies_from_page.ts if parse fails.




## PlayStation trophies (TypeScript/Node) 
this requires knowing the NPWR of the specific game you're looking for. Also if you don't own the game on the PSN_NPSSO account, it doesn't seem like the API will return you a global completion percentage. 
Leaving this here because it technically works, but seems to have limited usefulness.
### Setup
1. `cd psn`
2. `npm install`
3. Copy `.env.example` to `.env` and set `PSN_NPSSO`

### Run
- `npm start -- --query "Astro's Playroom" --npwr NPWRxxxxx_yy
- `npm start -- --query "Ghost of Tsushima" --group base --out got_base.csv --npwr NPWRxxxxx_yy'

### Output CSV columns
`trophy_id,name,description,rarity_bucket,earned_rate_pct,hidden,icon,np_communication_id,group_id`

## Notes
- Steam hidden achievements may lack descriptions until unlocked.
- PSN endpoints rely on community documentation and require your own account credentials. Respect Sony's Terms of Service.
- Text localization depends on the Steam `--lang` option and your PSN account region.
