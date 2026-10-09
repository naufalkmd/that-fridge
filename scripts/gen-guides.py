#!/usr/bin/env python3
"""Generates apps/legal/guides/ (hub + one page per food), sitemap.xml and robots.txt.
Every storage time below was checked against the cited source (see SOURCES)."""
import html, json, os, re

# Run from anywhere: python3 scripts/gen-guides.py (writes into apps/legal/).
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "legal")
SITE = "https://thatfridge.com"
STORE = "https://apps.apple.com/app/thatfridge/id6806239306"
REVIEWED = "October 2026"

SOURCES = {
    "chart": ("FoodSafety.gov, Cold Food Storage Chart", "https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts"),
    "keeper": ("USDA FoodKeeper (FSIS, Cornell University and the Food Marketing Institute)", "https://www.foodsafety.gov/keep/foodkeeperapp/index.html"),
    "leftovers": ("USDA FSIS, Leftovers and Food Safety", "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety"),
    "molds": ("USDA FSIS, Molds on Food: Are They Dangerous?", "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/molds-food-are-they-dangerous"),
    "eggs": ("USDA FSIS, Shell Eggs from Farm to Table", "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/eggs/shell-eggs-farm-table"),
}

FREEZE_NOTE = ("Fridge at 40°F (4°C) or below, freezer at 0°F (−18°C) or below. Freezer times are for best "
               "quality only: food kept frozen at 0°F (−18°C) or below stays safe indefinitely.")
TWO_HOURS = ("Don't leave it out of the fridge for more than 2 hours (1 hour above 90°F / 32°C). USDA advises "
             "throwing out perishable food left out longer than that.")

# icon: ("food", name) uses /assets/food/<name>.png (32px art), ("crew", name) uses /assets/crew/<name>.webp
GUIDES = [
    dict(
        slug="how-long-does-milk-last", group="Dairy & eggs", name="Milk", icon=("food", "milk"),
        title="How long does milk last?",
        card="Until the use-by date unopened; 3 months frozen.",
        desc="How long milk lasts in the fridge, freezer and pantry: fresh, ultra-pasteurized, shelf-stable and lactose-free, from USDA FoodKeeper.",
        answer="Fresh milk keeps in the fridge until the use-by date on the package. Frozen, it keeps its best quality for about 3 months.",
        cols=["Milk", "Fridge", "Freezer", "Pantry"],
        rows=[
            ["Plain or flavored milk", "Until the package use-by date", "3 months", "—"],
            ["Ultra-pasteurized, unopened", "1 to 3 months", "—", "—"],
            ["Ultra-pasteurized, opened", "7 to 10 days", "—", "—"],
            ["Shelf-stable (UHT), unopened", "—", "—", "6 to 12 months"],
            ["Shelf-stable (UHT), opened", "5 to 7 days", "—", "—"],
            ["Lactose-free, opened", "1 week", "Not recommended", "—"],
        ],
        table_src=["keeper"],
        tips=[
            "Check the use-by date when you buy it, and put milk away as soon as you get home.",
            "Shelf-stable (UHT) milk can live in the cupboard until you open it. After that it belongs in the fridge.",
            TWO_HOURS,
        ],
        signs=[
            "A sour smell, lumps or a curdled texture mean the milk has spoiled. Pour it out.",
            "If it's past the times above, throw it out even if it smells fine.",
        ],
        faq=[
            ("How long does milk last in the fridge?", "Fresh milk keeps until the use-by date on the package, according to USDA FoodKeeper. Ultra-pasteurized milk lasts 7 to 10 days once opened."),
            ("Can you freeze milk?", "Yes. Plain or flavored milk keeps its best quality for about 3 months in the freezer. FoodKeeper doesn't recommend freezing lactose-free milk."),
            ("How long can milk sit out?", "No more than 2 hours at room temperature, or 1 hour above 90°F (32°C). After that, USDA advises throwing perishable food away."),
        ],
        sources=["keeper", "chart", "leftovers"],
    ),
    dict(
        slug="how-long-do-eggs-last", group="Dairy & eggs", name="Eggs", icon=("food", "eggs"),
        title="How long do eggs last?",
        card="3 to 5 weeks in the fridge, in their shell.",
        desc="How long raw and hard-cooked eggs last in the fridge and freezer, plus how to store them, from FoodSafety.gov and USDA FSIS.",
        answer="Raw eggs in their shell keep for 3 to 5 weeks in the fridge. Hard-cooked eggs keep for 1 week.",
        cols=["Eggs", "Fridge", "Freezer"],
        rows=[
            ["Raw eggs in shell", "3 to 5 weeks", "Don't freeze in the shell. Beat yolks and whites together, then freeze."],
            ["Raw egg whites and yolks", "2 to 4 days", "12 months (yolks don't freeze well)"],
            ["Hard-cooked eggs", "1 week", "Don't freeze"],
            ["Liquid egg substitute, unopened", "1 week", "Don't freeze"],
            ["Liquid egg substitute, opened", "3 days", "Don't freeze"],
            ["Casseroles with eggs, after baking", "3 to 4 days", "2 to 3 months"],
        ],
        table_src=["chart"],
        tips=[
            "Buy eggs from a refrigerated case, with clean, uncracked shells.",
            "Keep them in their carton in the coldest part of the fridge, not in the door.",
            "Don't wash eggs. Wash water can be drawn into the egg through the pores in the shell.",
            "Don't leave refrigerated eggs out for more than 2 hours. A cold egg left out can sweat, which helps bacteria move into it.",
            "Refrigerate hard-cooked eggs within 2 hours of cooking and eat them within a week.",
        ],
        signs=[
            "If an egg smells bad when you crack it, throw it out.",
            "If eggs accidentally freeze in the shell, throw out any with a broken shell. Keep the rest frozen, thaw them in the fridge and use them straight away.",
        ],
        faq=[
            ("How long do eggs last in the fridge?", "Raw eggs in their shell keep for 3 to 5 weeks in the fridge, according to FoodSafety.gov. Hard-cooked eggs keep for 1 week."),
            ("Can you freeze eggs?", "Not in the shell. Beat the yolks and whites together, then freeze them for up to 12 months."),
            ("Should you wash eggs before storing them?", "No. USDA advises against it, because wash water can be drawn into the egg through the shell."),
        ],
        sources=["chart", "eggs"],
    ),
    dict(
        slug="how-long-does-cheese-last", group="Dairy & eggs", name="Cheese", icon=("food", "cheese"),
        title="How long does cheese last?",
        card="Hard: 3 to 4 weeks opened. Soft: 1 to 2 weeks.",
        desc="How long hard, soft, shredded and sliced cheese lasts in the fridge and freezer, and when you can cut mold off, from USDA.",
        answer="Opened hard cheese like cheddar keeps for 3 to 4 weeks in the fridge. Soft cheese like brie keeps for 1 to 2 weeks.",
        cols=["Cheese", "Fridge", "Freezer"],
        rows=[
            ["Hard (cheddar, Swiss, block Parmesan), unopened", "6 months", "6 months"],
            ["Hard, opened", "3 to 4 weeks", "6 months"],
            ["Soft (brie, Bel Paese, goat)", "1 to 2 weeks", "6 months"],
            ["Shredded (cheddar, mozzarella)", "1 month", "3 to 4 months"],
            ["Parmesan, shredded or grated", "12 months", "Not recommended"],
            ["Processed slices", "3 to 4 weeks", "Not recommended"],
        ],
        table_src=["keeper"],
        tips=[
            "Keep cheese wrapped so it doesn't dry out or pick up smells.",
            "After trimming mold off hard cheese, wrap it again in fresh wrap.",
            TWO_HOURS,
        ],
        signs=[
            "Hard cheese with a mold spot: cut off at least 1 inch (2.5 cm) around and below the spot, keeping the knife out of the mold. The rest is fine to use.",
            "Soft cheese (cottage, cream cheese, chèvre and similar) with mold: throw it out.",
            "Shredded, crumbled or sliced cheese of any type with mold: throw it out.",
            "Brie or Camembert with mold that isn't part of the cheese: throw it out. The mold in blue cheeses like Roquefort and Stilton is part of how they're made and is safe.",
        ],
        faq=[
            ("How long does cheddar last once opened?", "Opened hard cheese like cheddar keeps for 3 to 4 weeks in the fridge, according to USDA FoodKeeper. Unopened, it keeps for 6 months."),
            ("Can you cut mold off cheese?", "Off hard cheese, yes: cut at least 1 inch around and below the spot. Throw out soft cheese and any shredded, crumbled or sliced cheese with mold."),
            ("Can you freeze cheese?", "Hard and soft cheese keep their best quality for about 6 months in the freezer, and shredded cheese for 3 to 4 months. FoodKeeper doesn't recommend freezing processed slices."),
        ],
        sources=["keeper", "molds"],
    ),
    dict(
        slug="how-long-does-yogurt-last", group="Dairy & eggs", name="Yogurt", icon=("food", "milk"),
        title="How long does yogurt last?",
        card="1 to 2 weeks in the fridge.",
        desc="How long yogurt lasts in the fridge and freezer, and what to do if it grows mold, from USDA FoodKeeper and FSIS.",
        answer="Yogurt keeps for 1 to 2 weeks in the fridge. Frozen, it keeps its best quality for 1 to 2 months.",
        cols=["Yogurt", "Fridge", "Freezer"],
        rows=[["Yogurt", "1 to 2 weeks", "1 to 2 months"]],
        table_src=["keeper"],
        tips=[
            "The fridge time counts from the day you buy it.",
            "Keep the lid on so it doesn't pick up smells from the rest of the fridge.",
            TWO_HOURS,
        ],
        signs=[
            "Yogurt with mold: throw the whole container out. Don't scoop the mold off; it can reach below the surface.",
        ],
        faq=[
            ("How long does yogurt last in the fridge?", "Yogurt keeps for 1 to 2 weeks in the fridge, according to USDA FoodKeeper."),
            ("Can you freeze yogurt?", "Yes. It keeps its best quality for 1 to 2 months in the freezer."),
            ("Can you scoop mold off yogurt?", "No. USDA advises throwing out moldy yogurt, because mold can grow below the surface of moist foods."),
        ],
        sources=["keeper", "molds", "chart"],
    ),
    dict(
        slug="how-long-does-raw-chicken-last", group="Meat & poultry", name="Raw chicken", icon=("crew", "chef"),
        title="How long does raw chicken last?",
        card="1 to 2 days in the fridge; up to a year frozen.",
        desc="How long raw and cooked chicken last in the fridge and freezer, and the safe cooking temperature, from FoodSafety.gov and USDA FSIS.",
        answer="Raw chicken keeps for only 1 to 2 days in the fridge. Freeze it if you won't cook it by then.",
        cols=["Chicken", "Fridge", "Freezer"],
        rows=[
            ["Whole chicken, raw", "1 to 2 days", "1 year"],
            ["Chicken pieces, raw", "1 to 2 days", "9 months"],
            ["Ground chicken, raw", "1 to 2 days", "3 to 4 months"],
            ["Cooked chicken (leftovers)", "3 to 4 days", "2 to 6 months"],
            ["Chicken nuggets or patties, cooked", "3 to 4 days", "1 to 3 months"],
        ],
        table_src=["chart"],
        tips=[
            "If you won't cook it within 2 days, freeze it.",
            "Cook all poultry to 165°F (74°C), measured with a food thermometer.",
            "Refrigerate cooked chicken within 2 hours (1 hour above 90°F / 32°C).",
        ],
        signs=[
            "A sour smell or a slimy feel means raw chicken has spoiled. Throw it out.",
            "Past 2 days in the fridge, throw it out even if it looks and smells fine.",
        ],
        faq=[
            ("How long does raw chicken last in the fridge?", "Raw chicken, whole or in pieces, keeps for 1 to 2 days in the fridge, according to FoodSafety.gov."),
            ("How long does raw chicken last in the freezer?", "A whole chicken keeps its best quality for 1 year in the freezer, and chicken pieces for 9 months."),
            ("How long does cooked chicken last?", "Cooked chicken keeps for 3 to 4 days in the fridge and 2 to 6 months in the freezer."),
        ],
        sources=["chart", "leftovers"],
    ),
    dict(
        slug="how-long-does-ground-beef-last", group="Meat & poultry", name="Ground beef", icon=("crew", "chef"),
        title="How long does ground beef last?",
        card="1 to 2 days in the fridge; 3 to 4 months frozen.",
        desc="How long raw and cooked ground beef lasts in the fridge and freezer, and the safe cooking temperature, from FoodSafety.gov and USDA FSIS.",
        answer="Raw ground beef keeps for 1 to 2 days in the fridge and 3 to 4 months in the freezer.",
        cols=["Beef", "Fridge", "Freezer"],
        rows=[
            ["Ground beef and other ground meat, raw", "1 to 2 days", "3 to 4 months"],
            ["Steaks, chops and roasts, raw", "3 to 5 days", "4 to 12 months"],
            ["Cooked meat (leftovers)", "3 to 4 days", "2 to 6 months"],
        ],
        table_src=["chart"],
        tips=[
            "If you won't cook it within 2 days, freeze it.",
            "Cook ground beef to 160°F (71°C), measured with a food thermometer.",
            "Refrigerate cooked beef within 2 hours (1 hour above 90°F / 32°C).",
        ],
        signs=[
            "A sour smell or a sticky, slimy feel means it has spoiled. Throw it out.",
            "Past 2 days in the fridge, throw it out even if it looks and smells fine.",
        ],
        faq=[
            ("How long does ground beef last in the fridge?", "Raw ground beef keeps for 1 to 2 days in the fridge, according to FoodSafety.gov."),
            ("How long does ground beef last in the freezer?", "Raw ground beef keeps its best quality for 3 to 4 months in the freezer."),
            ("What temperature should ground beef be cooked to?", "160°F (71°C), measured with a food thermometer."),
        ],
        sources=["chart", "leftovers"],
    ),
    dict(
        slug="how-long-do-leftovers-last", group="Leftovers", name="Leftovers & cooked rice", icon=("crew", "chef"),
        title="How long do leftovers last?",
        card="3 to 4 days in the fridge, cooked rice included.",
        desc="How long leftovers and cooked rice last in the fridge and freezer, how to cool and reheat them, from FoodSafety.gov and USDA FSIS.",
        answer="Most leftovers, cooked rice included, keep for 3 to 4 days in the fridge. Freeze them if you won't eat them by then.",
        cols=["Leftovers", "Fridge", "Freezer"],
        rows=[
            ["Cooked meat or poultry", "3 to 4 days", "2 to 6 months"],
            ["Dishes with meat, fish, poultry or egg", "3 to 4 days", "2 to 3 months"],
            ["Cooked rice, vegetables or potatoes", "3 to 4 days", "1 to 2 months"],
            ["Soups and stews", "3 to 4 days", "2 to 3 months"],
            ["Pizza", "3 to 4 days", "1 to 2 months"],
        ],
        table_src=["chart", "keeper"],
        table_extra="The sources give slightly different freezer times. All of them are for quality, not safety.",
        tips=[
            "Refrigerate leftovers within 2 hours of cooking (1 hour above 90°F / 32°C).",
            "Cool food fast: split big batches into shallow containers and cut large pieces smaller. Hot food can go straight into the fridge.",
            "Cover leftovers or seal them in airtight containers.",
            "Reheat leftovers to 165°F (74°C), measured with a food thermometer.",
            "Thaw frozen leftovers in the fridge (then eat within 3 to 4 days), in cold water in a leak-proof bag (cook before refreezing), or in the microwave (heat to 165°F / 74°C).",
            "It's safe to reheat frozen leftovers without thawing them first; it just takes longer.",
        ],
        signs=[
            "Moldy cooked meat, poultry, casseroles, grains or pasta: throw it out. Mold can reach below the surface of moist food, and bacteria can grow alongside it.",
            "Past 4 days in the fridge, throw it out even if it looks and smells fine.",
        ],
        faq=[
            ("How long do leftovers last in the fridge?", "Most leftovers keep for 3 to 4 days in the fridge, according to USDA."),
            ("How long does cooked rice last in the fridge?", "Cooked rice keeps for 3 to 4 days in the fridge and 1 to 2 months in the freezer, according to USDA FoodKeeper."),
            ("Can you reheat frozen leftovers without thawing them?", "Yes. USDA says it's safe to reheat frozen leftovers without thawing; it just takes longer. Heat them to 165°F (74°C)."),
        ],
        sources=["chart", "keeper", "leftovers", "molds"],
    ),
    dict(
        slug="how-long-does-spinach-last", group="Fruit & veg", name="Spinach & leafy greens", icon=("food", "spinach"),
        title="How long does spinach last?",
        card="3 to 7 days in the fridge.",
        desc="How long spinach, leaf lettuce, romaine and other greens last in the fridge and freezer, from USDA FoodKeeper.",
        answer="Fresh spinach and leaf lettuce keep for 3 to 7 days in the fridge. Iceberg and romaine last longer, 1 to 2 weeks.",
        cols=["Greens", "Fridge", "Freezer"],
        rows=[
            ["Spinach and leaf lettuce", "3 to 7 days", "Not recommended"],
            ["Iceberg and romaine lettuce", "1 to 2 weeks", "Not recommended"],
        ],
        table_src=["keeper"],
        tips=[
            "Fridge times count from the day you buy them, so plan spinach for early in the week.",
            "Keep greens in the fridge at 40°F (4°C) or below.",
        ],
        signs=[
            "Slimy, mushy or moldy leaves mean the greens have spoiled. Throw them out.",
        ],
        faq=[
            ("How long does spinach last in the fridge?", "Fresh spinach keeps for 3 to 7 days in the fridge, according to USDA FoodKeeper."),
            ("Can you freeze fresh spinach?", "USDA FoodKeeper doesn't recommend freezing fresh spinach or leaf lettuce."),
        ],
        sources=["keeper", "chart"],
    ),
    dict(
        slug="how-long-do-carrots-last", group="Fruit & veg", name="Carrots", icon=("food", "carrot"),
        title="How long do carrots last?",
        card="2 to 3 weeks in the fridge.",
        desc="How long carrots and baby carrots last in the fridge, pantry and freezer, and what to do about mold, from USDA.",
        answer="Carrots keep for 2 to 3 weeks in the fridge. Baby carrots keep for about 4 weeks.",
        cols=["Carrots", "Pantry", "Fridge", "Freezer"],
        rows=[
            ["Carrots", "—", "2 to 3 weeks", "10 to 12 months"],
            ["Baby carrots", "4 days (below 75°F / 24°C)", "4 weeks", "3 months (blanch first)"],
        ],
        table_src=["keeper"],
        tips=[
            "Keep carrots in the fridge; baby carrots only last a few days out of it.",
            "Blanch baby carrots before freezing them.",
        ],
        signs=[
            "A small mold spot on a carrot: cut off at least 1 inch (2.5 cm) around and below it, keeping the knife out of the mold. Firm vegetables like carrots are hard for mold to get into.",
        ],
        faq=[
            ("How long do carrots last in the fridge?", "Carrots keep for 2 to 3 weeks in the fridge, according to USDA FoodKeeper. Baby carrots keep for 4 weeks."),
            ("Can you cut mold off carrots?", "Yes, if it's a small spot. Cut off at least 1 inch around and below it."),
        ],
        sources=["keeper", "molds"],
    ),
    dict(
        slug="how-long-do-apples-last", group="Fruit & veg", name="Apples", icon=("food", "apple"),
        title="How long do apples last?",
        card="3 weeks on the counter; 4 to 6 weeks in the fridge.",
        desc="How long apples and applesauce last on the counter, in the fridge and in the freezer, from USDA FoodKeeper.",
        answer="Apples keep for about 3 weeks on the counter and 4 to 6 weeks in the fridge.",
        cols=["Apples", "Pantry", "Fridge", "Freezer"],
        rows=[
            ["Apples", "3 weeks", "4 to 6 weeks", "8 months (cooked)"],
            ["Applesauce, homemade", "—", "3 weeks", "8 to 12 months"],
            ["Applesauce, store-bought, unopened", "12 to 18 months", "—", "—"],
            ["Applesauce, store-bought, opened", "—", "7 to 10 days", "—"],
        ],
        table_src=["keeper"],
        tips=[
            "Apples last longer in the fridge: 4 to 6 weeks instead of about 3 on the counter.",
            "FoodKeeper's freezer time applies to cooked apples.",
            "Once you open store-bought applesauce, keep it in the fridge.",
        ],
        signs=[
            "Throw out apples that are moldy, leaking or mushy.",
        ],
        faq=[
            ("How long do apples last?", "Apples keep for about 3 weeks on the counter and 4 to 6 weeks in the fridge, according to USDA FoodKeeper."),
            ("Can you freeze apples?", "Cooked apples keep their best quality for about 8 months in the freezer."),
        ],
        sources=["keeper"],
    ),
    dict(
        slug="how-long-does-bread-last", group="Bread", name="Bread", icon=("crew", "shopkeeper"),
        title="How long does bread last?",
        card="About 2 weeks for store-bought; freeze for months.",
        desc="How long store-bought, whole-wheat and homemade bread lasts in the pantry, fridge and freezer, and why moldy bread goes in the bin, from USDA.",
        answer="Store-bought bread keeps for 14 to 18 days in the pantry. Frozen, it keeps its best quality for 3 to 5 months.",
        cols=["Bread", "Pantry", "Fridge", "Freezer"],
        rows=[
            ["Store-bought bread, rolls, buns and flat breads", "14 to 18 days", "2 to 3 weeks (once opened)", "3 to 5 months"],
            ["Whole-wheat bread, store-bought pre-sliced", "3 to 5 days", "Not recommended", "3 months"],
            ["Whole-wheat bread, homemade", "3 to 5 days", "Not recommended", "3 months"],
        ],
        table_src=["keeper"],
        tips=[
            "Pantry times count from the day you buy it.",
            "Homemade bread may go off sooner because it has no preservatives.",
            "FoodKeeper doesn't recommend refrigerating whole-wheat bread: it dries out and goes stale quickly. Freeze it instead.",
        ],
        signs=[
            "Bread with any mold: throw it out. Bread is porous, so mold can reach well below the spot you see.",
        ],
        faq=[
            ("How long does bread last?", "Store-bought bread keeps for 14 to 18 days in the pantry, according to USDA FoodKeeper. Whole-wheat and homemade bread keep for 3 to 5 days."),
            ("Can you cut mold off bread?", "No. USDA advises throwing out moldy bread, because it's porous and mold can spread below the surface."),
            ("Should you keep bread in the fridge?", "Store-bought bread keeps 2 to 3 weeks in the fridge once opened, but FoodKeeper doesn't recommend refrigerating whole-wheat bread because it goes stale. The freezer is a better bet."),
        ],
        sources=["keeper", "molds"],
    ),
]

GROUPS = ["Dairy & eggs", "Meat & poultry", "Leftovers", "Fruit & veg", "Bread"]

e = lambda s: html.escape(s, quote=True)


def icon_img(icon, size):
    kind, name = icon
    src = f"/assets/food/{name}.png" if kind == "food" else f"/assets/crew/{name}.webp"
    return f'<img class="px" src="{src}" alt="" width="{size}" height="{size}" loading="lazy" decoding="async">'


def head(title, desc, path, extra_ld=None):
    url = SITE + path
    ld = f'\n<script type="application/ld+json">\n{json.dumps(extra_ld, indent=2, ensure_ascii=False)}\n</script>' if extra_ld else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="https://thatfridge.com/assets/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#15110d">
<link rel="icon" type="image/png" href="/assets/favicon.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-tight-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
<link rel="stylesheet" href="/doc.css">
<link rel="stylesheet" href="/guides.css">{ld}
<script>document.documentElement.classList.add('js');</script>
<script src="/transitions.js"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="top" id="top">
  <a class="announce" href="{STORE}" rel="noopener">
    Now on the <u>App Store</u> for iPhone
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
  </a>
  <nav class="nav" aria-label="Main">
    <div class="nav-links">
      <a href="/privacy/">Privacy</a>
      <a href="/terms/">Terms</a>
    </div>
    <a class="brand" href="/" aria-label="ThatFridge home">
      <img src="/assets/logo.svg" alt="" width="30" height="31">
      <span>ThatFridge</span>
    </a>
    <div class="nav-right">
      <a href="/support/">Support</a>
      <a class="btn btn-sm" href="{STORE}" rel="noopener">Get the app</a>
    </div>
  </nav>
</header>
"""


def hero(eyebrow, h1, sub):
    return f"""
<main id="main" data-doc>
  <section class="hero doc-hero" aria-labelledby="doc-title">
    <div class="hero-bg" aria-hidden="true">
      <div class="stage"><picture><source srcset="/assets/scene.avif" type="image/avif"><img class="px" src="/assets/scene.webp" alt="" width="1180" height="842" fetchpriority="high"></picture></div>
    </div>
    <div class="doc-card">
      <p class="eyebrow">{eyebrow}</p>
      <h1 id="doc-title">{e(h1)}</h1>
      <p class="updated">{sub}</p>
    </div>
  </section>

  <div class="after-hero">
    <nav class="side side-doc" id="side" aria-label="On this page"><ol></ol></nav>
    <div class="panel">
      <details class="toc-m" id="toc-m" hidden><summary>On this page</summary><ol></ol></details>
      <article class="doc-body">
"""


FOOT = """      </article>
    </div>
  </div>
</main>

<footer class="foot">
  <div class="wrap">
    <div>
      <a class="brand" href="/" aria-label="ThatFridge home"><img src="/assets/logo.svg" alt="" width="30" height="31"><span>ThatFridge</span></a>
      <p>Know what's in your fridge. Waste less food.</p>
    </div>
    <div>
      <h2>Legal</h2>
      <ul>
        <li><a href="/privacy/">Privacy Policy</a></li>
        <li><a href="/privacy/pdpa/">PDPA notice (BM + EN)</a></li>
        <li><a href="/terms/">Terms of Service &amp; EULA</a></li>
      </ul>
    </div>
    <div>
      <h2>Help</h2>
      <ul>
        <li><a href="/support/">Support &amp; FAQ</a></li>
        <li><a href="mailto:support@thatfridge.com">support@thatfridge.com</a></li>
        <li><a href="https://apps.apple.com/app/thatfridge/id6806239306?ct=guides-footer" rel="noopener">App Store</a></li>
      </ul>
    </div>
    <div>
      <h2>More</h2>
      <ul>
        <li><a href="/guides/">Food storage guides</a></li>
        <li><a href="/press/">Press kit</a></li>
        <li><a href="https://www.youtube.com/@ThatFridge-co" rel="noopener">YouTube</a></li>
      </ul>
    </div>
    <p class="legal-line">&copy; <span id="y">2026</span> ThatFridge. All rights reserved. App Store is a service mark of Apple Inc.</p>
  </div>
  <p class="foot-mark" aria-hidden="true">ThatFridge</p>
</footer>

<script src="/assets/vendor/lenis-1.3.26.min.js"></script>
<script src="/site.js"></script>
</body>
</html>
"""


def cta(slug):
    return f"""
      <aside class="guide-cta" aria-label="Get ThatFridge">
        <img class="px" src="/assets/crew/guardian.webp" alt="" width="96" height="96" loading="lazy" decoding="async">
        <div>
          <p class="cta-title">Let Guardian <em class="s">remember for you.</em></p>
          <p>ThatFridge tracks what's in your fridge and reminds you before it expires, so nothing gets forgotten at the back.</p>
          <a class="store-badge" href="{STORE}?ct=guide-{slug}" rel="noopener"><img src="/assets/app-store-badge.svg" alt="Download on the App Store" width="150" height="50"></a>
        </div>
      </aside>
"""


def card_li(g):
    return (f'          <li><a href="/guides/{g["slug"]}/">{icon_img(g["icon"], 40)}'
            f'<span><b>{e(g["title"])}</b><span>{e(g["card"])}</span></span></a></li>')


DISCLAIMER = ("<strong>Guidance, not a guarantee.</strong> These times come from US government food safety "
              "sources and assume food was handled and stored safely. Always follow the date and instructions "
              "on the package, check food before you eat it, and when in doubt, throw it out. This page isn't "
              "medical advice.")


def guide_page(g):
    path = f"/guides/{g['slug']}/"
    faq_ld = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in g["faq"]],
    }
    out = [head(f"{g['title']} Fridge, freezer and pantry times | ThatFridge", g["desc"], path, faq_ld)]
    src_names = " and ".join(SOURCES[s][0].split(",")[0].split(" (")[0] for s in g["table_src"])
    out.append(hero('<a href="/guides/">Food storage guides</a>', g["title"], f"Sources: {e(src_names)}. Last reviewed {REVIEWED}."))
    b = []
    b.append(f'      <div class="answer">{icon_img(g["icon"], 48)}<div><p>{e(g["answer"])}</p>'
             '</div></div>\n')
    # Storage times
    b.append("      <h2>Storage times</h2>\n      <table>\n        <thead><tr>" +
             "".join(f'<th scope="col">{e(c)}</th>' for c in g["cols"]) + "</tr></thead>\n        <tbody>\n")
    for r in g["rows"]:
        b.append("          <tr>" + f'<th scope="row">{e(r[0])}</th>'.replace("<th", "<td").replace("</th>", "</td>") +
                 "".join(f"<td>{e(c)}</td>" for c in r[1:]) + "</tr>\n")
    b.append("        </tbody>\n      </table>\n")
    note = FREEZE_NOTE + " A dash means the source gives no time."
    if g.get("table_extra"):
        note += " " + g["table_extra"]
    b.append(f'      <p class="small">{e(note)}</p>\n')
    b.append("\n      <h2>Storage tips</h2>\n      <ul>\n" + "".join(f"        <li>{e(t)}</li>\n" for t in g["tips"]) + "      </ul>\n")
    b.append("\n      <h2>Signs it's gone off</h2>\n      <ul>\n" + "".join(f"        <li>{e(t)}</li>\n" for t in g["signs"]) + "      </ul>\n")
    b.append("\n      <h2>Common questions</h2>\n" + "".join(f"      <h3>{e(q)}</h3>\n      <p>{e(a)}</p>\n" for q, a in g["faq"]))
    b.append("\n      <h2>Sources</h2>\n      <ul>\n" + "".join(
        f'        <li><a href="{SOURCES[s][1]}" rel="noopener">{e(SOURCES[s][0])}</a></li>\n' for s in g["sources"]) + "      </ul>\n")
    b.append(f'      <div class="card"><p>{DISCLAIMER}</p></div>\n')
    b.append(cta(g["slug"]))
    others = [o for o in GUIDES if o["slug"] != g["slug"]]
    same = [o for o in others if o["group"] == g["group"]]
    rest = [o for o in others if o["group"] != g["group"]]
    more = (same + rest)[:3]
    b.append('\n      <h2>More food storage guides</h2>\n      <ul class="guide-grid">\n' + "\n".join(card_li(o) for o in more) +
             '\n      </ul>\n      <p><a href="/guides/">See all guides</a></p>\n')
    out.append("".join(b))
    out.append(FOOT)
    return "".join(out)


def hub_page():
    desc = ("How long food lasts in the fridge, freezer and pantry: milk, eggs, cheese, chicken, leftovers, "
            "greens and more, from USDA and FoodSafety.gov.")
    ld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Food storage guides",
        "url": SITE + "/guides/",
        "description": desc,
        "hasPart": [{"@type": "Article", "headline": g["title"], "url": f"{SITE}/guides/{g['slug']}/"} for g in GUIDES],
    }
    out = [head("Food storage guides: how long food lasts | ThatFridge", desc, "/guides/", ld)]
    out.append(hero("Food storage guides", "How long does it last?",
                    f"Fridge, freezer and pantry times from USDA and FoodSafety.gov. Last reviewed {REVIEWED}."))
    b = ['      <p>Plain answers to the question everyone asks with the fridge door open. Every time on these pages '
         'comes from a US government food safety source, linked at the bottom of each guide.</p>\n']
    for grp in GROUPS:
        items = [g for g in GUIDES if g["group"] == grp]
        b.append(f'\n      <h2>{e(grp)}</h2>\n      <ul class="guide-grid">\n' + "\n".join(card_li(g) for g in items) + "\n      </ul>\n")
    b.append('\n      <h2>Where these numbers come from</h2>\n'
             '      <p>Storage times come from the FoodSafety.gov Cold Food Storage Chart and USDA FoodKeeper. Handling '
             'advice comes from the USDA Food Safety and Inspection Service. Fridge times assume 40°F (4°C) or below; '
             'freezer times assume 0°F (−18°C) or below and are for quality only.</p>\n      <ul>\n' +
             "".join(f'        <li><a href="{u}" rel="noopener">{e(n)}</a></li>\n' for n, u in SOURCES.values()) + "      </ul>\n")
    b.append(f'      <div class="card"><p>{DISCLAIMER}</p></div>\n')
    b.append(cta("hub"))
    out.append("".join(b))
    out.append(FOOT)
    return "".join(out)


def main():
    os.makedirs(f"{ROOT}/guides", exist_ok=True)
    with open(f"{ROOT}/guides/index.html", "w") as f:
        f.write(hub_page())
    for g in GUIDES:
        os.makedirs(f"{ROOT}/guides/{g['slug']}", exist_ok=True)
        with open(f"{ROOT}/guides/{g['slug']}/index.html", "w") as f:
            f.write(guide_page(g))
    pages = ["/", "/ms/", "/guides/"] + [f"/guides/{g['slug']}/" for g in GUIDES] + ["/press/", "/support/", "/privacy/", "/privacy/pdpa/", "/terms/"]
    with open(f"{ROOT}/sitemap.xml", "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                "".join(f"  <url><loc>{SITE}{p}</loc></url>\n" for p in pages) + "</urlset>\n")
    with open(f"{ROOT}/robots.txt", "w") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
    print("wrote", len(GUIDES), "guides")


if __name__ == "__main__":
    main()
