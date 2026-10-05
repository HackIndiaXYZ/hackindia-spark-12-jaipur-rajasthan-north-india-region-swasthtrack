/**
 * Emoji for a food name, used wherever only the name is known (the day's log, quick
 * foods) and as the fallback when a catalogue row carries no emoji of its own.
 *
 * Rules are tried in order and the first hit wins, so the order is the design:
 *   1. how it is served (drink, sweet, bread, rice, snack, pickle ...)
 *   2. what it is made of (fruit, vegetable, meat, grain ...)
 *   3. generic dish words (curry, sabzi, dal)
 *   4. the category, then a plain plate.
 * A form beats an ingredient ("pineapple juice" is a drink, "chicken biryani" is rice)
 * and a specific word beats a general one, which is how pineapple stopped being an apple.
 */

type Rule = readonly [keywords: readonly string[], emoji: string];

const RULES: readonly Rule[] = [
  // ---- 1. Drinks -----------------------------------------------------------------------
  [["bournvita", "horlicks", "boost", "complan", "ovaltine", "malt drink", "malted milk", "haldi doodh", "golden milk", "masala doodh", "badam milk", "badam doodh", "kesar milk", "thandai", "rose milk", "flavoured milk", "flavored milk", "हल्दी दूध"], "🥛"],
  [["hot chocolate", "cocoa", "hot cocoa"], "☕"],
  [["bubble tea", "boba"], "🧋"],
  [["iced tea", "ice tea", "cold coffee", "iced coffee", "frappe", "frappé", "dalgona"], "🥤"],
  [["chai", "milk tea", "tea with milk", "masala tea", "tea masala", "cutting", "kulhad", "irani", "noon", "sheer chai", "ginger tea", "elaichi tea", "adrak tea"], "☕"],
  [["green tea", "black tea", "herbal tea", "lemon tea", "honey tea", "jasmine tea", "tulsi tea", "oolong", "chamomile", "hibiscus", "peppermint", "lemongrass", "darjeeling", "sulaimani", "lal saah", "lal chai", "butter tea", "po cha", "kadha", "kahwa", "matcha", "infusion", "tisane", "हरी चाय", "काली चाय", "हर्बल", "काढ़ा"], "🍵"],
  [["tea", "चाय"], "☕"],
  [["coffee", "kaapi", "kapi", "espresso", "latte", "cappuccino", "americano", "mocha", "कॉफी", "कॉफ़ी"], "☕"],
  [["coconut water", "tender coconut water", "nariyal pani", "नारियल पानी"], "🥥"],
  [["nimbu pani", "nimbu soda", "shikanji", "lemonade", "limeade", "lemon juice", "kulukki", "lemon water", "lime water", "नींबू पानी", "शिकंजी"], "🍋"],
  [["juice", "frooti", "maaza", "slice", "appy fizz", "nectar", "जूस"], "🧃"],
  [["sharbat", "sherbet", "sarbath", "shorbot", "squash", "panna", "pana", "panakam", "kanji", "sattu drink", "rooh afza", "nannari", "jaljeera", "jal jeera", "cooler", "shake", "milkshake", "smoothie", "cola", "soda", "energy drink", "thums up", "sprite", "fanta", "limca", "pepsi", "mountain dew", "soft drink", "cold drink", "sports drink", "tonic", "ginger ale", "शरबत", "शेक"], "🥤"],
  [["water", "ajwain water", "jeera water", "saunf water", "fennel water", "cumin water", "pani", "paani", "पानी"], "💧"],
  [["lassi", "chaas", "chaach", "buttermilk", "butter milk", "neer mor", "mattha", "छाछ", "लस्सी"], "🥛"],
  [["sugarcane juice", "ganne ka ras", "गन्ने का रस"], "🧃"],

  // ---- Sweets and desserts (before milk / fruit / nuts, which they often contain) ------
  [["ice cream", "icecream", "kulfi", "falooda", "gelato", "sundae", "आइसक्रीम", "कुल्फी"], "🍨"],
  [["chocolate", "dairy milk", "kitkat", "kit kat", "choco", "चॉकलेट"], "🍫"],
  [["doughnut", "donut"], "🍩"],
  [["cupcake", "muffin"], "🧁"],
  [["cake", "pastry", "brownie", "plum cake", "swiss roll", "cheesecake", "केक", "पेस्ट्री"], "🎂"],
  [["pie", "tart"], "🥧"],
  [["halwa", "kheer", "payasam", "payasa", "pudding", "custard", "rabri", "rabdi", "basundi", "shrikhand", "phirni", "sheer khurma", "kesari", "sheera", "malpua", "double ka meetha", "shahi tukda", "bebinca", "dodol", "हलवा", "खीर", "रबड़ी", "पायसम"], "🍮"],
  [["gulab jamun", "rasgulla", "rasagola", "rasmalai", "ras malai", "ladoo", "laddu", "laddoo", "barfi", "burfi", "peda", "jalebi", "imarti", "sandesh", "mithai", "candy", "toffee", "chikki", "gajak", "soan papdi", "petha", "cham cham", "kalakand", "mysore pak", "mohanthal", "ghevar", "balushahi", "khaja", "modak", "gujiya", "karanji", "puran poli", "pantua", "langcha", "kaju katli", "mishri", "rewri", "revdi", "jaggery sweet", "sweet jalebi", "तिलकुट", "मिठाई", "लड्डू", "बर्फी", "जलेबी", "गुलाब जामुन", "रसगुल्ला"], "🍬"],
  [["honey", "शहद"], "🍯"],

  // ---- Fast food and bakery -------------------------------------------------------------
  [["pizza", "पिज़्ज़ा", "पिज्जा"], "🍕"],
  [["burger", "बर्गर"], "🍔"],
  [["hot dog", "hotdog"], "🌭"],
  [["sandwich", "toastie", "sub", "सैंडविच"], "🥪"],
  [["taco", "tacos", "nachos"], "🌮"],
  [["burrito", "wrap", "kathi roll", "frankie", "shawarma", "roll", "rolls", "kebab roll", "falafel"], "🌯"],
  [["momo", "momos", "dumpling", "dimsum", "dim sum", "wonton", "gyoza", "मोमो"], "🥟"],
  [["pasta", "spaghetti", "macaroni", "penne", "lasagne", "lasagna", "mac and cheese"], "🍝"],
  [["noodle", "noodles", "chowmein", "chow mein", "hakka", "maggi", "ramen", "thukpa", "vermicelli", "sewai", "seviyan", "सेवई", "नूडल्स"], "🍜"],
  [["french fries", "fries", "finger chips", "potato chips", "chips", "wafers", "nuggets", "fried chicken"], "🍟"],
  [["popcorn", "makhana", "fox nut", "lotus seed", "मखाना"], "🍿"],
  [["biscuit", "biscuits", "cookie", "cookies", "rusk", "marie", "digestive", "nankhatai", "khari", "बिस्कुट"], "🍪"],
  [["croissant", "danish", "puff pastry", "veg puff", "puff"], "🥐"],
  [["bread", "toast", "pav", "bun", "ब्रेड", "पाव"], "🍞"],
  [["cornflakes", "corn flakes", "muesli", "granola", "cereal", "oats", "oatmeal", "porridge", "daliya", "dalia", "ओट्स", "दलिया"], "🥣"],

  // ---- Indian breads ----------------------------------------------------------------------
  [["dosa", "dose", "uttapam", "uttappam", "adai", "pesarattu", "cheela", "chilla", "pancake", "appam", "neer dosa", "paniyaram", "डोसा", "उत्तपम", "चीला"], "🥞"],
  [["idli", "idly", "thatte idli", "इडली"], "🍥"],
  [["roti", "chapati", "chapatti", "phulka", "paratha", "parantha", "parotta", "puri", "poori", "bhatura", "naan", "kulcha", "thepla", "bhakri", "rotla", "rumali", "roomali", "luchi", "sheermal", "thalipeeth", "khakhra", "papad", "papadum", "pappadam", "tortilla", "रोटी", "चपाती", "फुल्का", "पराठा", "पूरी", "नान", "कुलचा"], "🫓"],

  // ---- Rice and grain dishes ----------------------------------------------------------------
  [["biryani", "biriyani", "pulao", "pulav", "pilaf", "bisi bele bath", "bisibelebath", "बिरयानी", "पुलाव"], "🍛"],
  [["khichdi", "khichuri", "khichri", "pongal", "खिचड़ी", "पोंगल"], "🍲"],
  [["rice", "bhat", "bhaat", "chawal", "pulihora", "puliyogare", "sadam", "idiyappam", "puttu", "kanji", "panta bhat", "चावल", "भात"], "🍚"],
  [["poha", "pohe", "upma", "uppittu", "chivda", "chiwda", "पोहा", "उपमा"], "🥣"],
  [["dhokla", "khaman", "khandvi", "handvo", "muthia", "patra", "idra", "ढोकला", "खांडवी"], "🍘"],

  // ---- Snacks and street food ------------------------------------------------------------------
  [["samosa", "समोसा", "singara"], "🥟"],
  [["kachori", "mathri", "namak pare", "shakarpara", "chakli", "murukku", "sev", "bhujia", "gathiya", "ganthia", "fafda", "mixture", "namkeen", "papdi", "thattai", "nippattu", "kodubale", "bhakarwadi", "कचौरी", "नमकीन", "भुजिया"], "🍘"],
  [["pakora", "pakoda", "bhajiya", "bhajji", "bajji", "bonda", "vada", "wada", "vadai", "vadas", "cutlet", "tikki", "kofta", "chop", "पकौड़ा", "पकोड़ा", "वड़ा", "टिक्की"], "🧆"],
  [["kebab", "kabab", "tikka", "seekh", "shammi", "galouti", "tangdi", "lollipop", "कबाब"], "🍢"],
  [["chaat", "pani puri", "golgappa", "puchka", "bhel", "sev puri", "dahi puri", "papdi chaat", "dahi bhalla", "dahi vada", "ragda", "jhal muri", "pav bhaji", "misal", "dabeli", "vada pav", "चाट", "गोलगप्पा"], "🥗"],

  // ---- Condiments and preserves ------------------------------------------------------------------
  [["pickle", "achar", "achaar", "avakaya", "thokku", "murabba", "chutney", "thecha", "podi", "gunpowder", "jam", "marmalade", "sauce", "ketchup", "mayonnaise", "mayo", "spread", "peanut butter", "hummus", "paste", "अचार", "चटनी"], "🫙"],

  // ---- Soups and curd side dishes (a soup of mutton is a soup; a raita of cucumber is a raita) -------------
  [["soup", "shorba", "broth", "rasam", "saaru", "charu", "yakhni", "marag", "सूप", "रसम"], "🥣"],
  [["raita", "pachadi", "marinade", "gravy base", "रायता"], "🥣"],
  [["thali", "tarkari", "litti chokha", "chokha", "dal bati", "dal baati", "dal chawal", "dal rice", "rajma chawal", "kadhi chawal", "chole chawal", "curry rice", "sambar rice", "kothu"], "🍛"],

  // ---- 2. Ingredients ---------------------------------------------------------------------------------
  // Dairy and eggs
  [["paneer", "cheese", "chhena", "chena", "cottage cheese", "khoa", "mawa", "khoya", "tofu", "पनीर", "चीज़"], "🧀"],
  [["milk", "doodh", "dahi", "curd", "yogurt", "yoghurt", "cream", "malai", "दूध", "दही"], "🥛"],
  [["egg", "eggs", "omelette", "omelet", "anda", "अंडा", "अंडे"], "🥚"],

  // Mushrooms first so "oyster mushroom" is a mushroom, not an oyster
  [["mushroom", "mushrooms", "khumb", "dhingri", "मशरूम"], "🍄"],

  // Seafood and meat. Fish comes before poultry so "Bombay duck" is a fish, not a duck.
  [["prawn", "prawns", "shrimp", "jhinga", "chingri", "chemmeen", "lobster", "झींगा"], "🍤"],
  [["crab", "kekda", "nandu", "केकड़ा"], "🦀"],
  [["squid", "octopus", "cuttlefish", "calamari"], "🦑"],
  [["oyster", "clam", "mussel", "scallop"], "🦪"],
  [["fish", "rohu", "rahu", "katla", "catla", "hilsa", "ilish", "pomfret", "paplet", "surmai", "seer", "bombil", "bombay duck", "mackerel", "bangda", "sardine", "tarli", "mathi", "tuna", "salmon", "bhetki", "pabda", "magur", "singhi", "tilapia", "basa", "anchovy", "kingfish", "karimeen", "meen", "machhi", "machli", "maach", "macher", "machha", "xit", "मछली"], "🐟"],
  [["chicken", "murgh", "murg", "turkey", "duck", "quail", "pigeon meat", "guinea fowl", "emu", "goose", "poultry", "चिकन", "मुर्गा"], "🍗"],
  [["mutton", "lamb", "goat", "keema", "kheema", "beef", "pork", "ham", "bacon", "sausage", "salami", "meat", "gosht", "mans", "mansa", "nihari", "paya", "haleem", "liver", "kaleji", "maaz", "मटन", "गोश्त"], "🍖"],

  [["ghee", "butter", "makhan", "makkhan", "margarine", "घी", "मक्खन"], "🧈"],

  // Vegetables. They come before fruit so "Carrot, Orange" and "Cherry Tomato" are vegetables.
  [["leaves", "leaf", "patte", "patta", "patt", "पत्ते", "पत्ती"], "🥬"],
  [["tomato", "tamatar", "टमाटर"], "🍅"],
  [["brinjal", "baingan", "baigan", "eggplant", "aubergine", "begun", "vangi", "vankaya", "बैंगन"], "🍆"],
  [["sweet potato", "shakarkandi", "shakarkand", "शकरकंद"], "🍠"],
  [["potato", "aloo", "alu", "batata", "yam", "ratalu", "suran", "jimikand", "colocasia", "arbi", "tapioca", "cassava", "kappa", "lotus stem", "kamal kakdi", "bhein", "water chestnut", "singhara", "आलू", "रतालू", "अरबी", "सूरन"], "🥔"],
  [["carrot", "gajar", "गाजर"], "🥕"],
  [["corn", "bhutta", "makka", "maize", "sweet corn", "baby corn", "भुट्टा", "मक्का"], "🌽"],
  [["onion", "pyaz", "pyaaz", "kanda", "प्याज"], "🧅"],
  [["garlic", "lehsun", "lasun", "लहसुन"], "🧄"],
  [["ginger", "adrak", "अदरक"], "🫚"],
  [["capsicum", "bell pepper", "shimla mirch", "simla mirch", "शिमला मिर्च"], "🫑"],
  [["chilli", "chili", "mirchi", "mirch", "jalapeno", "मिर्च"], "🌶️"],
  [["cucumber", "kheera", "khira", "kakdi", "kakri", "zucchini", "courgette", "bottle gourd", "lauki", "ghiya", "doodhi", "dudhi", "ridge gourd", "tori", "turai", "jhinge", "sponge gourd", "gilki", "apple gourd", "tinda", "pointed gourd", "parwal", "patol", "bitter gourd", "karela", "ivy gourd", "kundru", "tindora", "kovakkai", "snake gourd", "chichinda", "padwal", "ash gourd", "petha", "chayote", "chow chow", "tendli", "खीरा", "लौकी", "तोरी", "टिंडा", "परवल", "करेला", "कुंदरू"], "🥒"],
  [["pumpkin", "kaddu", "कद्दू"], "🎃"],
  [["okra", "bhindi", "lady finger", "ladies finger", "vendakkai", "peas", "pea", "matar", "green peas", "beans", "bean", "french beans", "flat beans", "sem", "gawar", "guar", "cluster beans", "lobia", "yardlong", "drumstick", "sahjan", "moringa", "murungakkai", "edamame", "सेम", "मटर", "भिंडी", "फली"], "🫛"],
  [["cauliflower", "phool gobi", "broccoli", "फूल गोभी"], "🥦"],
  [["spinach", "palak", "methi", "fenugreek", "sarson", "saag", "sag", "bathua", "chaulai", "amaranth", "lettuce", "cabbage", "patta gobi", "band gobi", "dill", "suva", "shepu", "coriander leaves", "dhania patta", "mint", "pudina", "curry leaves", "kadi patta", "greens", "leafy", "kohlrabi", "knol khol", "brussels sprouts", "banana stem", "पालक", "मेथी", "सरसों", "साग", "पत्ता गोभी", "धनिया", "पुदीना"], "🥬"],
  [["gobi", "gobhi", "गोभी"], "🥦"],
  [["banana flower", "kele ka phool", "vazhaipoo"], "🌸"],
  [["radish", "mooli", "turnip", "shalgam", "beetroot", "chukandar", "beet", "bamboo shoot", "raw banana", "kaccha kela", "raw papaya", "kachha papita", "ker sangri", "sangri", "gunda", "lasoda", "kachri", "मूली", "शलगम", "चुकंदर"], "🥗"],
  [["salad", "kachumber", "koshimbir", "kosambari", "sprouts", "sprout", "सलाद"], "🥗"],

  // Fruit
  [["pineapple", "ananas", "anannas", "अनानास"], "🍍"],
  [["coconut", "nariyal", "copra", "नारियल"], "🥥"],
  [["mango", "aam", "kairi", "amba", "आम"], "🥭"],
  [["banana", "kela", "plantain", "केला"], "🍌"],
  [["green apple", "custard apple", "sitaphal", "amla", "gooseberry", "ber", "jujube", "karonda", "soursop"], "🍏"],
  [["apple", "seb", "pomegranate", "anar", "rose apple", "सेब", "अनार"], "🍎"],
  [["pear", "nashpati", "guava", "amrood", "amrud", "peru", "अमरूद", "नाशपाती"], "🍐"],
  [["peach", "aadu", "apricot", "khubani", "plum", "aloo bukhara", "nectarine", "sapota", "chikoo", "chiku", "आड़ू"], "🍑"],
  [["cherry", "cherries", "chery"], "🍒"],
  [["strawberry", "strawberries", "litchi", "lychee", "rambutan", "shahtoot"], "🍓"],
  [["blueberry", "blueberries", "blackberry", "mulberry", "jamun", "black plum", "falsa", "phalsa", "जामुन"], "🫐"],
  [["grape", "grapes", "angoor", "raisin", "kishmish", "fig", "anjeer", "kokum", "longan", "passion fruit", "mangosteen", "अंगूर", "किशमिश"], "🍇"],
  [["watermelon", "tarbooz", "dragon fruit", "तरबूज"], "🍉"],
  [["muskmelon", "melon", "kharbuja", "cantaloupe", "honeydew", "papaya", "papita", "jackfruit", "kathal", "bael", "bel fruit", "wood apple", "kaith", "पपीता", "खरबूजा"], "🍈"],
  [["kiwi"], "🥝"],
  [["orange", "mosambi", "sweet lime", "kinnow", "tangerine", "mandarin", "santra", "narangi", "persimmon", "संतरा", "मौसमी"], "🍊"],
  [["lemon", "lime", "nimbu", "citron", "star fruit", "kamrakh", "नींबू"], "🍋"],
  [["avocado"], "🥑"],
  [["date", "dates", "khajur", "tamarind ripe", "ice apple", "nungu", "fruit"], "🍑"],

  // Pulses, grains and nuts
  [["peanut", "peanuts", "groundnut", "moongfali", "mungfali", "almond", "badam", "cashew", "kaju", "pistachio", "pista", "hazelnut", "pine nut", "chilgoza", "charoli", "nuts", "dry fruit", "dry fruits", "trail mix", "बादाम", "काजू", "मूंगफली", "पिस्ता"], "🥜"],
  [["walnut", "akhrot", "chestnut", "अखरोट"], "🌰"],
  [["sesame", "til", "flax", "flaxseed", "alsi", "chia", "sunflower seed", "pumpkin seed", "watermelon seed", "magaj", "poppy", "khus khus", "seeds"], "🌰"],
  [["rajma", "kidney beans", "chole", "chana", "chickpea", "chickpeas", "kala chana", "moong", "mung", "masoor", "urad", "toor", "tur", "arhar", "lentil", "lentils", "dal", "daal", "dhal", "dahl", "sambar", "sambhar", "rasam", "kadhi", "pappu", "parippu", "usal", "ghugni", "matki", "moth", "kulthi", "horse gram", "soya", "soy", "nutrela", "legume", "pulse", "pulses", "besan", "sattu", "राजमा", "छोले", "चना", "मूंग", "मसूर", "उड़द", "अरहर", "तूर", "दाल", "सांभर", "रसम", "कढ़ी"], "🍲"],
  [["wheat", "atta", "flour", "maida", "suji", "rava", "semolina", "bajra", "jowar", "ragi", "millet", "barley", "jau", "quinoa", "amaranth seed", "buckwheat", "kuttu", "rajgira", "sabudana", "sago", "murmura", "puffed rice", "flattened rice", "grain", "cereal", "आटा", "मैदा", "सूजी", "ज्वार", "बाजरा", "रागी", "जौ"], "🌾"],

  // Oils and sugar
  [["oil", "tel", "vanaspati", "तेल"], "🫒"],
  [["sugar", "jaggery", "gur", "gud", "mishri", "cheeni", "चीनी", "गुड़"], "🍬"],

  [["spice", "masala powder", "garam masala", "turmeric", "haldi", "jeera", "cumin", "coriander powder", "chilli powder", "salt", "namak", "हल्दी", "मसाला", "नमक"], "🧂"],

  // ---- 3. Generic dish words -----------------------------------------------------------------------------
  [["curry", "masala", "gravy", "korma", "kofta curry", "bhuna", "kolhapuri", "handi", "tikka masala", "stew", "kuzhambu", "kulambu", "pulusu", "jhol", "jhola", "salan", "करी"], "🍛"],
  [["sabzi", "sabji", "subzi", "sabji", "bhaji", "poriyal", "thoran", "palya", "kootu", "avial", "aviyal", "bharta", "bharwa", "dum", "vegetable", "vegetables", "veg", "mix veg", "सब्ज़ी", "सब्जी", "भाजी"], "🥘"],
];

const CATEGORY_FALLBACK: Record<string, string> = {
  fruit: "🍑",
  vegetable: "🥗",
  salad_vegetable: "🥗",
  sabzi: "🥘",
  dal: "🍲",
  pulse: "🍲",
  grain: "🌾",
  roti: "🫓",
  rice: "🍚",
  tiffin: "🥞",
  snack: "🍘",
  sweet: "🍬",
  dairy: "🥛",
  egg: "🥚",
  nonveg: "🍖",
  protein: "🍖",
  beverage: "🥤",
  nuts: "🥜",
  seeds: "🌰",
  condiment: "🫙",
  spice: "🧂",
  salad: "🥗",
  soup: "🍲",
  bakery: "🍞",
  fastfood: "🍔",
  oil_sugar: "🫒",
  indian_preparation: "🍛",
  junk_food: "🍟",
};

const DEVANAGARI = /[ऀ-ॿ]/;

function compile(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Latin keywords match whole words (with an optional plural) so "tea" never fires on "steak" or "pineapple" on "apple".
  // Devanagari keywords match the whole word or the stem plus anusvara / e / o ("दालें", "आमों"), never a longer word:
  // "केक" (cake) must not match "केकड़ा" (crab), "रस" (juice) "रसगुल्ला", nor "चिकन" (chicken) "चिकनी" (smooth).
  return DEVANAGARI.test(keyword)
    ? new RegExp(`(^| )${escaped}(?=$| |[\\u0901\\u0902\\u0947\\u094b])`)
    : new RegExp(`(^| )${escaped}(s|es)?( |$)`);
}

const COMPILED: ReadonlyArray<readonly [RegExp[], string]> = RULES.map(([keywords, emoji]) => [keywords.map(compile), emoji]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** The emoji that best shows this food. Never throws; unknown foods get a plate. */
export function foodEmoji(foodName = "", category = ""): string {
  const text = normalize(foodName);
  if (text) {
    for (const [patterns, emoji] of COMPILED) {
      if (patterns.some((p) => p.test(text))) return emoji;
    }
  }
  return CATEGORY_FALLBACK[category] ?? "🍽️";
}
