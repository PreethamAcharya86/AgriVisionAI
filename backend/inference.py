import torch
import torch.nn as nn
import torchvision.transforms as transforms
from torchvision import models
import numpy as np
import cv2
from PIL import Image
import io

# ── Device ──────────────────────────────────────────────────────────────────
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Load checkpoint ──────────────────────────────────────────────────────────
CHECKPOINT_PATH = "../model/crop_disease_model.pth"

checkpoint = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
CLASS_NAMES  = checkpoint["class_names"]
NUM_CLASSES  = checkpoint["num_classes"]

print(f"Loading EfficientNet-B0 with {NUM_CLASSES} classes...")

# ── Rebuild model ─────────────────────────────────────────────────────────────
import timm
model = timm.create_model('efficientnet_b0', pretrained=False, num_classes=NUM_CLASSES)
model.load_state_dict(checkpoint["model_state_dict"])
model.to(DEVICE)
model.eval()

print(f"Model loaded. {NUM_CLASSES} classes.")

# ── Preprocessing (must match training) ──────────────────────────────────────
TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],   # ImageNet stats
        std=[0.229, 0.224, 0.225]
    )
])


def check_blur(image_bytes: bytes, threshold: int = 100):
    """Return (is_sharp: bool, message: str)"""
    nparr    = np.frombuffer(image_bytes, np.uint8)
    img_gray = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if img_gray is None:
        return False, "Could not read image."
    variance = cv2.Laplacian(img_gray, cv2.CV_64F).var()
    if variance < threshold:
        return False, (
            f"Image is blurry (score: {variance:.1f}). "
            "Please capture a closer, sharper leaf photo."
        )
    return True, "OK"


def predict_disease(image_bytes: bytes):
    """Return (disease: str, confidence: float, top3: list)"""
    img    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = TRANSFORM(img).unsqueeze(0).to(DEVICE)   # (1, 3, 224, 224)

    with torch.no_grad():
        logits = model(tensor)                         # raw logits
        probs  = torch.softmax(logits, dim=1)[0]       # probabilities

    probs_np   = probs.cpu().numpy()
    idx        = int(np.argmax(probs_np))
    confidence = float(probs_np[idx])
    disease    = CLASS_NAMES[idx]

    # Top-3 for transparency
    top3_idx = np.argsort(probs_np)[::-1][:3]
    top3 = [
        {"disease": CLASS_NAMES[i], "confidence": round(float(probs_np[i]) * 100, 1)}
        for i in top3_idx
    ]

    return disease, confidence, top3