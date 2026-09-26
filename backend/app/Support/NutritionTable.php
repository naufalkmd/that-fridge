<?php

namespace App\Support;

/**
 * Approximate nutrition for common ingredients, used to estimate a recipe's calories from its
 * ingredient names alone (recipes carry no quantities). Each entry is
 * `[keywords separated by '|', kcal per 100 g, typical grams of it in ONE serving of a dish]`,
 * so kcal-per-serving = kcal/100 * grams. Values are rounded USDA-style figures (cooked weight
 * for rice / pasta / noodles / legumes); they are estimates, not a nutrition database. Malaysian
 * and wider Asian staples are included since that is the launch market.
 *
 * Matching (RecipeCalories) is on whole words and the LONGEST keyword wins, so "coconut milk"
 * beats "milk", "sweet potato" beats "potato" and "chicken stock" beats "chicken".
 */
final class NutritionTable
{
    /** @var list<array{0: string, 1: int, 2: int}> */
    public const ENTRIES = [
        // Meat & poultry
        ['chicken breast|chicken fillet', 165, 120], ['chicken thigh|chicken drumstick|chicken wing', 209, 130],
        ['chicken', 200, 120], ['beef mince|minced beef|ground beef|mince', 254, 120],
        ['beef|steak|sirloin|ribeye|brisket', 250, 120], ['lamb|mutton', 282, 120], ['pork belly', 518, 80],
        ['pork|pork chop', 242, 120], ['bacon', 541, 30], ['ham', 145, 40], ['sausage|hotdog|hot dog', 301, 75],
        ['salami|pepperoni', 407, 25], ['duck', 337, 100], ['turkey', 135, 120], ['meat', 220, 120],
        ['burger|patty', 250, 120], ['dumpling|wonton|gyoza|spring roll|samosa', 220, 80], ['pizza', 266, 120],
        // Fish & seafood
        ['salmon', 208, 130], ['tuna', 132, 100], ['canned tuna|tinned tuna', 116, 85],
        ['cod|snapper|barramundi|white fish|sea bass|tilapia|fish fillet', 105, 130], ['mackerel|kembung', 205, 120],
        ['sardine', 208, 85], ['ikan bilis|anchovy|anchovies', 290, 15], ['fish', 150, 120],
        ['prawn|shrimp', 99, 100], ['squid|calamari|sotong', 92, 100], ['crab', 97, 100],
        ['clam|mussel|cockle|oyster', 72, 100],
        // Eggs, soy, legumes, nuts
        ['egg', 143, 75], ['tofu|beancurd|bean curd|taukwa', 76, 100], ['tempeh|tempe', 192, 80],
        ['lentil|dhal|dal', 116, 120], ['chickpea|garbanzo', 164, 100], ['bean', 127, 100],
        ['peanut butter', 588, 16], ['peanut', 567, 20], ['almond|cashew|walnut|nut', 600, 25], ['sesame seed', 573, 5],
        // Dairy
        ['coconut milk|santan', 197, 60], ['coconut cream', 330, 40], ['condensed milk', 321, 20], ['milk', 61, 120],
        ['cream cheese', 342, 30], ['mozzarella', 280, 40], ['parmesan', 431, 10], ['cheese|cheddar|feta|halloumi', 350, 30],
        ['yogurt|yoghurt', 61, 125], ['whipping cream|heavy cream|cream', 340, 30], ['butter|margarine', 717, 10],
        ['ghee', 900, 10], ['ice cream', 207, 70],
        // Rice, noodles, pasta, bread, grains
        ['brown rice', 123, 180], ['rice|nasi', 130, 180],
        ['rice noodle|vermicelli|bihun|kway teow|kuey teow|beehoon|mee hoon', 109, 180],
        ['egg noodle|noodle|mee|ramen|udon|soba', 138, 180], ['instant noodle|maggi', 450, 75],
        ['spaghetti|pasta|macaroni|penne|fusilli|linguine|fettuccine|lasagna|lasagne', 158, 180],
        ['bread|toast|baguette|bun|roti', 265, 60], ['roti canai|paratha|chapati|naan', 300, 80],
        ['tortilla|wrap|pita', 300, 60], ['oat|oatmeal|porridge', 379, 40], ['flour', 364, 30],
        ['cereal|granola|muesli', 380, 40], ['quinoa', 120, 150], ['couscous', 112, 150], ['breadcrumb', 395, 20],
        ['cornstarch|corn flour|starch', 381, 8], ['cracker|biscuit', 430, 30], ['cake|cookie|pastry|pie|muffin|brownie', 400, 50],
        // Starchy vegetables
        ['sweet potato|kumara|keledek', 86, 130], ['potato', 77, 150], ['cassava|tapioca|yam|taro|keladi', 160, 100],
        ['corn|sweetcorn', 86, 80], ['pumpkin', 26, 100],
        // Vegetables
        ['carrot', 41, 80], ['spinach', 23, 60], ['kale', 49, 60], ['lettuce|salad|greens|rocket|arugula', 15, 50],
        ['broccoli', 34, 90], ['cauliflower', 25, 90], ['cabbage', 25, 80], ['tomato', 18, 100],
        ['cucumber', 15, 80], ['onion|shallot|bawang', 40, 60], ['garlic', 149, 5], ['ginger|galangal|lengkuas|turmeric', 80, 5],
        ['bell pepper|capsicum', 26, 80], ['chili|chilli|cili', 40, 10], ['mushroom', 22, 70], ['zucchini|courgette', 17, 100],
        ['eggplant|aubergine|brinjal', 25, 100], ['green bean|long bean|french bean|kacang panjang', 31, 80], ['pea', 81, 60],
        ['bean sprout|sprout|taugeh|tauge', 30, 60], ['kangkung|water spinach', 19, 80],
        ['bok choy|pak choy|sawi|choy sum|chinese cabbage|mustard green', 13, 80], ['celery', 14, 40],
        ['leek|spring onion|scallion|green onion|chive', 32, 15],
        ['coriander|cilantro|parsley|basil|mint|dill|herb|curry leaf|lemongrass|serai|pandan|bay leaf|oregano|thyme|rosemary', 25, 5],
        ['okra|ladies finger|lady finger|bendi', 33, 80], ['beetroot', 43, 60], ['radish|daikon|turnip|lobak', 16, 60],
        ['asparagus', 20, 80], ['olive', 115, 15], ['pickle|gherkin|kimchi', 15, 30], ['seaweed|nori', 35, 5],
        ['vegetable|veggie|veg', 40, 100],
        // Fruit
        ['apple', 52, 150], ['banana', 89, 110], ['orange', 47, 130],
        ['strawberry|strawberries|blueberry|blueberries|raspberry|raspberries|berry|berries', 50, 80],
        ['mango', 60, 120], ['pineapple|nanas', 50, 100], ['grape', 69, 80], ['lemon|lime|calamansi', 29, 15],
        ['avocado', 160, 70], ['watermelon|melon|honeydew', 30, 150], ['papaya|pawpaw', 43, 120], ['coconut', 354, 30],
        ['pear|peach|plum|kiwi', 55, 120], ['date', 282, 25], ['raisin|sultana|dried fruit|cranberry|cranberries', 299, 20],
        ['fruit', 55, 120],
        // Oils, sweeteners, sauces, seasonings
        ['olive oil|sesame oil|vegetable oil|cooking oil|canola|sunflower oil|coconut oil|palm oil|oil', 884, 10],
        ['sugar|palm sugar|gula melaka|brown sugar|icing sugar|syrup|maple', 387, 8], ['honey', 304, 10],
        ['soy sauce|soya sauce|kicap|tamari', 53, 10], ['oyster sauce', 51, 10], ['fish sauce', 35, 8],
        ['sweet chili sauce|chili sauce|hot sauce|sriracha|sambal', 100, 15], ['ketchup', 112, 15],
        ['mayonnaise|mayo', 680, 15], ['mustard', 66, 5], ['vinegar', 18, 5], ['tomato paste', 82, 15],
        ['tomato sauce|passata|tomato puree', 24, 80], ['pasta sauce|marinara|bolognese', 50, 100],
        ['curry paste|rendang paste|laksa paste|tom yum paste|paste', 130, 20],
        ['curry powder|spice|cumin|paprika|cinnamon|cardamom|nutmeg|masala|seasoning|bouillon', 300, 3],
        ['salt|msg|baking soda|baking powder|yeast', 0, 1], ['water|ice', 0, 200],
        ['chicken stock|beef stock|vegetable stock|chicken broth|beef broth|stock|broth', 5, 200],
        ['wine|shaoxing|mirin', 85, 30], ['chocolate|cocoa', 546, 25], ['jam|jelly|marmalade|kaya', 250, 15],
        ['tahini', 595, 15], ['hummus', 166, 40], ['gravy', 50, 50], ['guacamole', 155, 40], ['salsa', 36, 40],
        ['dressing|vinaigrette', 300, 20], ['sauce', 60, 20], ['soup|stew', 40, 250], ['pepper|black pepper|white pepper', 250, 1],
        ['leftover', 150, 200],
    ];

    /** Curated icon keys that stand in for a name the table did not recognise. */
    public const ICON_HINTS = [
        'eggs' => 'egg', 'milk' => 'milk', 'cheese' => 'cheese', 'yogurt' => 'yogurt', 'spinach' => 'spinach',
        'carrot' => 'carrot', 'apple' => 'apple', 'berries' => 'berry', 'meat' => 'meat', 'leftovers' => 'leftover',
    ];
}
