from PIL import Image
import os

def calculate_ahash(image_path):
    try:
        img = Image.open(image_path)
        # Convert to grayscale and resize to 8x8
        img = img.convert('L').resize((8, 8), Image.Resampling.LANCZOS)
        pixels = list(img.getdata())
        avg = sum(pixels) / 64
        # Build the 64-bit hash
        diff_bits = [1 if p > avg else 0 for p in pixels]
        
        # Convert bits to 16-character hex string
        hash_val = 0
        for bit in diff_bits:
            hash_val = (hash_val << 1) | bit
        return f"{hash_val:016x}"
    except Exception as e:
        return f"Error: {e}"

brain_dir = r"C:\Users\YHONDER\.gemini\antigravity-ide\brain\9f562147-6f60-491e-88af-1a50d3cb22f5"
for f in os.listdir(brain_dir):
    if f.startswith("media__") and f.endswith((".jpg", ".png")):
        full_path = os.path.join(brain_dir, f)
        ahash = calculate_ahash(full_path)
        print(f"File: {f} | Size: {os.path.getsize(full_path)} | aHash: {ahash}")
