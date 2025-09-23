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
- `python steam_achievements.py --appid 1364780`
- `python steam_achievements.py --appid 1364780 --lang french --out portal2_fr.csv`

### Output CSV columns
`api_name,title,description,hidden,icon,icon_gray,global_percent`

## PlayStation trophies (TypeScript/Node)

### Setup
1. `cd psn`
2. `npm install`
3. Copy `.env.example` to `.env` and set `PSN_NPSSO`

### Run
- `npm start -- --query "Astro's Playroom"`
- `npm start -- --query "Ghost of Tsushima" --group base --out got_base.csv`

### Output CSV columns
`trophy_id,name,description,rarity_bucket,earned_rate_pct,hidden,icon,np_communication_id,group_id`

## Notes
- Steam hidden achievements may lack descriptions until unlocked.
- PSN endpoints rely on community documentation and require your own account credentials. Respect Sony's Terms of Service.
- Text localization depends on the Steam `--lang` option and your PSN account region.
