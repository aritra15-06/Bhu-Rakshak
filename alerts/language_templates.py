"""
Multi-language alert templates with dynamic danger levels, road corridors, and landmarks.
"""

from __future__ import annotations

SUPPORTED_LANGUAGES = ["en", "hi", "ne", "bn", "mr"]
DEFAULT_LANGUAGE = "en"

TEMPLATES = {
    "EVACUATE_NOW": {
        "en": "🚨 URGENT EVACUATION: There is a {prob}% probability of a landslide in the road connecting {road_corridor}. Immediate action: Evacuate immediately to designated relief shelters on higher ground. Strictly avoid all vehicular travel on {road_corridor}.",
        "hi": "🚨 अत्यावश्यक निकासी: {road_corridor} को जोड़ने वाली सड़क पर भूस्खलन की {prob}% संभावना है। तत्काल कार्रवाई: तुरंत ऊंचे स्थानों पर बने राहत शिविरों में जाएं। इस सड़क पर सभी वाहन यात्रा से बचें।",
        "ne": "🚨 अति आवश्यक खाली गर्नुहोस्: {road_corridor} जोड्ने सडकमा पहिरोको {prob}% सम्भावना छ। तत्काल कार्य: तुरुन्तै माथिल्लो क्षेत्रका सुरक्षित आश्रयस्थलमा सर्नुहोस्। यस सडकमा यात्रा नगर्नुहोस्।",
        "bn": "🚨 জরুরি উচ্ছেদ: {road_corridor} সংযোগকারী সড়কে ভূমিধসের {prob}% সম্ভাবনা রয়েছে। তাৎক্ষণিক করণীয়: অবিলম্বে উঁচু স্থানের আশ্রয়কেন্দ्रे চলে যান। এই সড়কে সব ধরনের যান চলাচল বন্ধ রাখুন।",
        "mr": "🚨 तातडीने स्थलांतर करा: {road_corridor} ला जोडणाऱ्या रस्त्यावर दरड कोसळण्याची {prob}% शक्यता आहे. त्वरित कृती: ताबडतोब सुरक्षित किंवा उंच ठिकाणी जा. या रस्त्यावरील प्रवास पूर्णपणे टाळा.",
    },
    "PREPARE": {
        "en": "⚠️ LANDSLIDE WARNING: There is a {prob}% probability of a landslide in the road connecting {road_corridor}. Action required: Stay on high alert, prepare emergency go-bags, and avoid unnecessary transit near steep slopes.",
        "hi": "⚠️ भूस्खलन चेतावनी: {road_corridor} को जोड़ने वाली सड़क पर भूस्खलन की {prob}% संभावना है। आवश्यक कार्रवाई: सतर्क रहें, आपातकालीन किट तैयार रखें और ढलानों के पास यात्रा से बचें।",
        "ne": "⚠️ पहिरो चेतावनी: {road_corridor} जोड्ने सडकमा पहिरोको {prob}% सम्भावना छ। आवश्यक कार्य: उच्च सतर्कता अपनाउनुहोस्, आपतकालीन झोला तयार राख्नुहोस् र भीर नजिक नजानुहोस्।",
        "bn": "⚠️ ভূমিধস সতর্কতা: {road_corridor} সংযোগকারী সড়কে ভূমিধসের {prob}% সম্ভাবনা রয়েছে। করণীয়: সর্বোচ্চ সতর্ক থাকুন, জরুরি ব্যাগ প্রস্তুত রাখুন এবং খাড়া পাহাড়ের কাছে যাওয়া এড়িয়ে চলুন।",
        "mr": "⚠️ दरड इशारा: {road_corridor} ला जोडणाऱ्या रस्त्यावर दरड कोसळण्याची {prob}% शक्यता आहे. आवश्यक कृती: सतर्क राहा, आपत्कालीन साहित्य तयार ठेवा आणि उताराजवळील प्रवास टाळा.",
    },
    "ADVISORY": {
        "en": "📢 LANDSLIDE ADVISORY: Monitoring indicates a {prob}% probability of slope movement along the road connecting {road_corridor}. Action required: Monitor official advisories and exercise caution while driving.",
        "hi": "📢 भूस्खलन सलाह: {road_corridor} को जोड़ने वाली सड़क पर भूस्खलन की {prob}% संभावना है। आवश्यक कार्रवाई: मौसम की स्थिति पर नजर रखें और सावधानीपूर्वक यात्रा करें।",
        "ne": "📢 पहिरो सल्लाह: {road_corridor} जोड्ने सडकमा {prob}% पहिरोको जोखिम छ। आवश्यक कार्य: मौसमको जानकारी राख्नुहोस् र यात्रा गर्दा सावधानी अपनाउनुहोस्।",
        "bn": "📢 ভূমিধস পরামর্শ: {road_corridor} সংযোগকারী সড়কে {prob}% ভূমিধসের ঝুঁকি রয়েছে। করণীয়: আবহাওয়ার খবরে নজর রাখুন এবং চলাচলে সতর্কতা অবলম্বন করুন।",
        "mr": "📢 दरड सल्ला: {road_corridor} ला जोडणाऱ्या रस्त्यावर हालचालींची {prob}% शक्यता आहे. आवश्यक कृती: अधिकृत माहितीचे अनुसरण करा आणि सावधगिरी बाळगा.",
    },
    "TRANSIT_DETOUR_ADVISORY": {
        "en": "🛑 ROUTE CLOSED: There is a {prob}% probability of active landslide blockages in the road connecting {road_corridor}. Action required: Do not attempt to cross. Divert immediately to designated alternate bypass routes.",
        "hi": "🛑 मार्ग बंद: {road_corridor} को जोड़ने वाली सड़क पर सक्रिय भूस्खलन की {prob}% संभावना है। आवश्यक कार्रवाई: आगे बढ़ने का प्रयास न करें। तुरंत वैकल्पिक मार्ग अपनाएं।",
        "ne": "🛑 बाटो बन्द: {road_corridor} जोड्ने सडकमा सक्रिय पहिरोको {prob}% सम्भावना छ। आवश्यक कार्य: अगाडि बढ्ने प्रयास नगर्नुहोस्। तुरुन्तै वैकल्पिक बाटो प्रयोग गर्नुहोस्।",
        "bn": "🛑 রাস্তা বন্ধ: {road_corridor} সংযোগকারী সড়কে সক্রিয় ভূমিধসের {prob}% সম্ভাবনা রয়েছে। করণীয়: অগ্রসর হওয়ার চেষ্টা করবেন না। অবিলম্বে বিকল্প পথ ব্যবহার করুন।",
        "mr": "🛑 रस्ता बंद: {road_corridor} ला जोडणाऱ्या रस्त्यावर सक्रिय दरडीची {prob}% शक्यता आहे. आवश्यक कृती: पुढे जाऊ नका. ताबडतोब पर्यायी मार्ग वापरा.",
    },
}


def get_message(
    tier: str,
    site_name: str,
    language: str = DEFAULT_LANGUAGE,
    danger_level: str = "MODERATE",
    road_corridor: str = "Local Route Corridor",
    landmark: str = "Nearby Slope",
    probability: int = 80,
) -> str:
    lang = language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    template = TEMPLATES.get(tier, TEMPLATES["ADVISORY"]).get(lang, TEMPLATES[tier][DEFAULT_LANGUAGE])
    return template.format(
        site=site_name,
        danger_level=danger_level,
        road_corridor=road_corridor,
        landmark=landmark,
        prob=int(probability) if probability is not None else 80,
    )
