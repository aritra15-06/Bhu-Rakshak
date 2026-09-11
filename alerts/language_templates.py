"""
Multi-language alert templates with dynamic danger levels, road corridors, and landmarks.
"""

from __future__ import annotations

SUPPORTED_LANGUAGES = ["en", "hi", "ne", "bn", "mr"]
DEFAULT_LANGUAGE = "en"

TEMPLATES = {
    "EVACUATE_NOW": {
        "en": "URGENT EVACUATION [{danger_level} HAZARD]: Landslide expected on {road_corridor} near {landmark} ({site}). Please evacuate immediately to safe ground.",
        "hi": "अत्यावश्यक निकासी [{danger_level} खतरा]: {landmark} ({site}) के पास {road_corridor} पर भूस्खलन की संभावना है। कृपया तुरंत सुरक्षित स्थान पर जाएँ।",
        "ne": "अति आवश्यक खाली गर्नुहोस् [{danger_level} जोखिम]: {landmark} ({site}) नजिक {road_corridor} मा पहिरो जाने सम्भावना छ। कृपया तुरुन्त सुरक्षित ठाउँमा सर्नुहोस्।",
        "bn": "জরুরি উচ্ছেদ [{danger_level} ঝুঁকি]: {landmark} ({site}) এর কাছে {road_corridor} এ ভূমিধসের শঙ্কা রয়েছে। অনুগ্রহ করে অবিলম্বে নিরাপদ স্থানে চলে যান।",
        "mr": "तातडीने स्थलांतर करा [{danger_level} धोका]: {landmark} ({site}) जवळ {road_corridor} वर दरड कोसळण्याचा धोका आहे. कृपया ताबडतोब सुरक्षित स्थळी जा.",
    },
    "PREPARE": {
        "en": "WARNING [{danger_level} HAZARD]: Elevated landslide risk on {road_corridor} near {landmark} ({site}). Keep emergency supplies ready and avoid travelling on this route.",
        "hi": "चेतावनी [{danger_level} खतरा]: {landmark} ({site}) के पास {road_corridor} पर भूस्खलन का खतरा बढ़ा है। कृपया आपातकालीन सामग्री तैयार रखें।",
        "ne": "चेतावनी [{danger_level} जोखिम]: {landmark} ({site}) नजिक {road_corridor} मा पहिरोको जोखिम बढेको छ। कृपया सजग रहनुहोस्।",
        "bn": "সতর্কতা [{danger_level} ঝুঁকি]: {landmark} ({site}) এর কাছে {road_corridor} এ ভূমিধসের ঝুঁকি বেড়েছে। প্রস্তুত থাকুন।",
        "mr": "इशारा [{danger_level} धोका]: {landmark} ({site}) जवळ {road_corridor} वर दरड कोसळण्याची शक्यता वाढली आहे. आपत्कालीन साहित्य तयार ठेवा.",
    },
    "ADVISORY": {
        "en": "ADVISORY [{danger_level} HAZARD]: Landslide risk monitoring active on {road_corridor} near {landmark} ({site}). Stay informed of weather and road status.",
        "hi": "सूचना [{danger_level} खतरा]: {landmark} ({site}) के पास {road_corridor} पर भूस्खलन निगरानी सक्रिय है। मौसम और सड़क की जानकारी रखें।",
        "ne": "जानकारी [{danger_level} जोखिम]: {landmark} ({site}) नजिक {road_corridor} मा पहिरो निगरानी सक्रिय छ।",
        "bn": "পরামর্শ [{danger_level} ঝুঁকি]: {landmark} ({site}) এর কাছে {road_corridor} এ পরিস্থিতি পর্যবেক্ষণে রয়েছে।",
        "mr": "सूचना [{danger_level} धोका]: {landmark} ({site}) जवळ {road_corridor} वर परिस्थितीवर लक्ष ठेवले जात आहे.",
    },
    "TRANSIT_DETOUR_ADVISORY": {
        "en": "ROUTE DETOUR ADVISORY: Corridor along {road_corridor} near {landmark} ({site}) is BLOCKED due to {danger_level}. Please avoid this highway and use alternate mountain routes.",
        "hi": "मार्ग परिवर्तन सलाह: सक्रिय {danger_level} के कारण {landmark} ({site}) के पास {road_corridor} बंद है। कृपया इस राजमार्ग से बचें और वैकल्पिक मार्ग अपनाएँ।",
        "ne": "सडक डाईभर्सन सूचना: सक्रिय {danger_level} को कारण {landmark} ({site}) नजिक {road_corridor} बन्द छ। कृपया वैकल्पिक बाटो प्रयोग गर्नुहोस्।",
        "bn": "রুট ডাইভারশন সতর্কতা: সক্রিয় {danger_level} এর কারণে {landmark} ({site}) সংলগ্ন {road_corridor} অবরুদ্ধ। অনুগ্রহ করে এই পথ এড়িয়ে বিকল্প পথ ব্যবহার করুন।",
        "mr": "पर्यायी मार्ग सल्ला: {landmark} ({site}) जवळ {road_corridor} वर {danger_level} मुळे रस्ता बंद आहे. कृपया पर्यायी मार्गाचा अवलंब करा.",
    },
}


def get_message(
    tier: str,
    site_name: str,
    language: str = DEFAULT_LANGUAGE,
    danger_level: str = "MODERATE",
    road_corridor: str = "Local Route Corridor",
    landmark: str = "Nearby Slope",
) -> str:
    lang = language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    template = TEMPLATES.get(tier, TEMPLATES["ADVISORY"]).get(lang, TEMPLATES[tier][DEFAULT_LANGUAGE])
    return template.format(
        site=site_name,
        danger_level=danger_level,
        road_corridor=road_corridor,
        landmark=landmark,
    )
