import torch
import os

# 🔹 Path to your TorchScript model
MODEL_PATH = ""  # <-- update this filename

# 🔍 Check if the file exists before loading
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model file '{MODEL_PATH}' not found. Please check the path and filename.")

# 🔹 Load the TorchScript model
model = torch.jit.load(MODEL_PATH, map_location="cpu")
model.eval()  # Set to inference mode

# 🔹 Example input (adjust shape to match your model)
x = torch.randn(1, 3, 14, 14)

# 🔹 Run inference
with torch.no_grad():
    y = model(x)

print("✅ Model loaded successfully!")
print("📐 Output shape:", y.shape)
