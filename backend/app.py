import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from inference import check_blur, predict_disease
from dotenv import load_dotenv
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def parse_disease_label(raw_label):
    """
    Converts model class name to clean crop + disease strings.
    e.g. "Tomato___Early_blight"  -> ("Tomato", "Early blight")
         "Apple___healthy"        -> ("Apple",  "")
         "Grape___Black_rot"      -> ("Grape",  "Black rot")
    """
    parts = raw_label.split("___", 1)
    crop_from_model = parts[0].replace("_", " ").strip()

    if len(parts) > 1:
        disease_label = parts[1].replace("_", " ").strip()
    else:
        disease_label = ""

    # Treat "healthy" variants as no disease
    if disease_label.lower() in ("healthy", "none", "no disease", ""):
        disease_label = ""

    return crop_from_model, disease_label


def get_recommendation(crop, disease_label, location="India"):
    """
    Calls Groq LLM with a prompt tailored to whether a disease was detected.
    disease_label should already be clean (spaces, no underscores).
    """

    if not disease_label:
        # Healthy leaf — cultivation tip only
        prompt = f"""You are an expert agronomist.
Crop: {crop}
Location: {location}

The uploaded leaf image appears healthy — no disease was detected.
Provide a short, practical cultivation suggestion in exactly this format:

**Suggestion**
<2-3 sentences of general farming advice for {crop} suited to {location}>

Rules:
- Only output the formatted block above.
- No bullet points, no extra text.
"""
    else:
        # Disease detected — structured recommendation
        prompt = f"""You are an expert agronomist. A farmer provided the following details:
Crop: {crop}
Disease: {disease_label}
Location: {location}

Provide a structured recommendation in exactly this format:

**Immediate Action**
<what the farmer should do in the next 48 hours>

**Organic Treatment**
<organic/natural remedy options>

**Chemical Treatment**
<specific fungicide or pesticide recommendations>

**Recovery**
<steps to help the crop recover>

**Prevention**
<long-term steps to prevent recurrence>

Rules:
- Each heading must be bold (double asterisks).
- No bullet points, no numbered lists.
- Keep each section short and practical (2-3 sentences max).
- Do not add any introductions, conclusions, or extra commentary.
- Output ONLY the formatted response above.
"""

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500
            },
            timeout=15
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Recommendation unavailable: {str(e)}"


@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image_bytes = request.files["image"].read()
    crop        = request.form.get("crop", "Unknown")
    location    = request.form.get("location", "India")

    # Layer 1: blur check
    is_sharp, msg = check_blur(image_bytes)
    if not is_sharp:
        return jsonify({"error": msg}), 400

    # Inference — raw_label is the full class name e.g. "Tomato___Early_blight"
    raw_label, confidence, top3 = predict_disease(image_bytes)

    # Layer 2: confidence gate
    if confidence < 0.60:
        return jsonify({
            "error": f"Low confidence ({confidence*100:.1f}%). Please re-upload a clearer image.",
            "top3": top3
        }), 400

    # Parse clean disease label from the raw model class name
    _, disease_label = parse_disease_label(raw_label)

    # Clean up top3 disease names the same way
    clean_top3 = []
    for item in (top3 or []):
        _, d = parse_disease_label(item.get("disease", ""))
        clean_top3.append({
            "disease":    d if d else "Healthy",
            "confidence": item.get("confidence", 0)
        })

    # LLM recommendation
    recommendation = get_recommendation(crop, disease_label, location)

    # Debug
    print(f"Crop: {crop} | Raw label: {raw_label} | Disease: '{disease_label}' | Conf: {confidence:.2%}")

    # Severity: based on confidence
    if confidence >= 0.75:
        severity = "High"
    elif confidence >= 0.60:
        severity = "Moderate"
    else:
        severity = "Low"

    # Display label: "Healthy" if no disease detected
    display_disease = disease_label if disease_label else "Healthy"

    return jsonify({
        "crop":           crop,
        "disease":        display_disease,
        "confidence":     f"{confidence * 100:.1f}%",
        "severity":       severity,
        "location":       location,
        "top3":           clean_top3,
        "recommendation": recommendation
    })


def get_trends_report(crop, region):
    """
    Asks Groq LLM for emerging crop disease trends in a given region.
    Returns a JSON array of trend objects.
    """
    crop_line = f"Crop filter: {crop}" if crop and crop != "All" else "Crop filter: All major crops (Tomato, Apple, Grape, Wheat, Rice, Potato)"

    prompt = f"""You are a global crop disease surveillance expert with knowledge of emerging agricultural threats.

{crop_line}
Region: {region}

List the top 4-5 currently emerging or recently reported crop diseases that are a threat in or near this region.
For each disease return ONLY a valid JSON array with this exact structure — no markdown, no explanation, just raw JSON:

[
  {{
    "crop": "Crop name",
    "disease": "Disease common name",
    "affected_regions": "Specific countries or states affected",
    "threat_level": "High" or "Moderate" or "Low",
    "overview": "2 sentences about what this disease is and why it is trending now.",
    "symptoms": "2 sentences describing visible symptoms on leaves, fruit, or stems.",
    "precautions": "2-3 practical precaution steps a farmer should take immediately.",
    "spread": "2 sentences on how the disease spreads (wind, water, insects, soil, etc)."
  }}
]

Rules:
- Output ONLY the raw JSON array. No markdown code fences, no extra text before or after.
- threat_level must be exactly one of: High, Moderate, Low
- Keep each field concise (2-3 sentences max).
- Base answers on real, known diseases relevant to the region.
"""

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1800
            },
            timeout=25
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()

        # Strip markdown fences if model ignores instructions
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        import json
        trends = json.loads(raw)
        return trends, None
    except Exception as e:
        return None, str(e)


@app.route("/trends", methods=["POST"])
def trends():
    data   = request.get_json(force=True)
    crop   = data.get("crop", "All")
    region = data.get("region", "India")

    print(f"Trends request — Crop: {crop} | Region: {region}")

    result, error = get_trends_report(crop, region)

    if error:
        return jsonify({"error": f"Could not fetch trends: {error}"}), 500

    return jsonify({"trends": result})


@app.route("/health", methods=["GET"])
def health():
    from inference import CLASS_NAMES
    return jsonify({"status": "ok", "classes": len(CLASS_NAMES)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)