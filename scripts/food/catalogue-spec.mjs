/**
 * Shared vocabulary and sanity rules for the food catalogue. The validator, the
 * merge step and the app's category labels all read the same lists, so a typo in
 * a category or a state name is caught before it reaches the database.
 */

export const CATEGORIES = [
  "fruit", // fresh fruit
  "vegetable", // raw / boiled single vegetables, leafy greens, roots, mushrooms
  "sabzi", // cooked vegetable dishes, paneer / soya / mushroom curries
  "dal", // cooked dal, rajma, chole, kadhi, sambar, rasam
  "pulse", // dry / raw pulses and pulse flours
  "grain", // raw cereals, millets, flours, flakes
  "roti", // roti, paratha, puri, naan, kulcha
  "rice", // cooked rice dishes: plain rice, pulao, biryani, khichdi
  "tiffin", // idli, dosa, upma, poha, dhokla, breakfast dishes
  "snack", // chaat, pakora, namkeen, farsan, street food
  "sweet", // mithai, halwa, desserts
  "dairy", // milk, curd, paneer, cheese, butter, ghee, cream
  "egg", // eggs and egg dishes
  "nonveg", // meat, poultry, fish, seafood and their dishes
  "beverage", // chai, coffee, juices, lassi, sharbat, soft drinks
  "nuts", // nuts, seeds, dry fruits
  "condiment", // chutney, pickle, sauce, papad, spices
  "salad", // salads and raita
  "soup", // soups
  "bakery", // bread, biscuits, cake, packaged snacks
  "fastfood", // pizza, burger, momos, noodles, pasta, rolls
  "oil_sugar", // oils, sugar, jaggery, honey
];

export const REGIONS = [
  "Pan-India",
  "International",
  "North India",
  "South India",
  "East India",
  "West India",
  "Central India",
  "North-East India",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman & Nicobar",
];

export const DIETS = ["veg", "egg", "nonveg"];
export const CONFIDENCE = ["high", "medium", "low"];
export const UNITS = ["g", "ml"];

/** Categories whose rows are raw ingredients: a household portion is optional for them. */
export const RAW_CATEGORIES = new Set(["pulse", "grain", "oil_sugar"]);
