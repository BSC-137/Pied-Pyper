import torch
import torch.nn as nn
import torch.nn.functional as f
import torch.optim as optim
import torch.optim.lr_scheduler as lr_scheduler
import numpy as np
import pandas as pd
from torch.utils.data import TensorDataset, DataLoader, Subset

class WeatherEnergyCorr(nn.Module):
    def __init__(self):
        super().__init__()

        # Convolutional layers for learning spatial data/relationships
        # Batchnorm to stabilise gradients
        self.conv_layers = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1), nn.BatchNorm2d(16), nn.ReLU(),
            nn.Conv2d(16, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
        )

        self.pool = nn.AdaptiveAvgPool2d((3,3))

        self.fc = nn.Sequential(
            # Squeeze into a 1D vector for pre-processing in linear fc layers
            nn.Flatten(),
            nn.Linear(64 * 3 * 3, 256), nn.ReLU(),
            nn.Linear(256, 1),
            nn.Softplus() # Ensure energy prediction >= 0
        )

    def forward(self, x):
        x = self.conv_layers(x)
        x = self.pool(x)
        x = self.fc(x)
        return x

    def train_model(self, epochs, data_loader, optimizer, criterion, update_freq=50):
        self.train() # Set into training mode

        for epoch in range(epochs):
            running_loss = 0.0

            for idx, data in enumerate(data_loader, 0):
                optimizer.zero_grad()  # Zero the gradient
                inputs, labels = data # Unpack data

                outputs = self(inputs)
                loss = criterion(outputs, labels)

                loss.backward() # Backprop
                optimizer.step()

                running_loss += loss.item()

                if (idx + 1) % update_freq == 0:
                    # Trying to calculate accuracy after every round slows down the training locally
                    # too much. Try relying on the loss instead?
                    print(f'Epoch: {epoch + 1}, Batch: {idx + 1}, Loss: {running_loss / update_freq:.3f}')
                    running_loss = 0.0

            val_mse = model.eval_model(test_loader, nn.MSELoss())
            scheduler.step(val_mse)

    def eval_model(self, data_loader, criterion):
        self.eval() # Turn off autograd etc.
        running_loss = 0.0

        for idx, data in enumerate(data_loader, 0):
            inputs, labels = data
            outputs = self(inputs)
            loss = criterion(outputs, labels)
            running_loss += loss.item()

        # Return avg. loss
        return running_loss / len(data_loader)

"""
energy_data = pd.read_parquet("data/energy_index.parquet")
print(energy_data)
"""

DS_PATH   = "../data/energy_weather_grid_3ch.pt"
TRACE_CSV = "../data/energy_weather_grid_3ch.trace.csv"
BATCH_SIZE = 32  # 32–64 tends to stabilize gradients

# --- outlier config ---
OUTLIER_MODE = "drop"      # "drop", "winsorize", or None
MAD_K = 3.0                # robust-z cutoff for drop
Q_LO, Q_HI = 0.01, 0.99    # winsorization quantiles

# --- load dataset + trace ---
ds = torch.load(DS_PATH, weights_only=False)
X_all, y_all = ds.tensors  # y shape [N,1]
trace = pd.read_csv(TRACE_CSV)
trace["Date"] = pd.to_datetime(trace["Date"]).dt.date

# --- chronological split (20k / rest) ---
order = trace.sort_values("Date").index.to_list()
N = len(order)
n_train = min(20000, N)
train_idx = np.array(order[:n_train])
test_idx  = np.array(order[n_train:])

# --- compute per-plant stats on TRAIN ONLY (no leakage) ---
train_names = trace.loc[train_idx, "Name"].to_numpy()
train_y = y_all[train_idx, 0].cpu().numpy()
df = pd.DataFrame({"Name": train_names, "y": train_y})

def mad(x):
    med = np.median(x)
    m = np.median(np.abs(x - med))
    return m if m > 0 else 1e-6

if OUTLIER_MODE == "drop":
    med  = df.groupby("Name")["y"].transform("median")
    mads = df.groupby("Name")["y"].transform(mad)
    z = 0.6745 * (df["y"] - med) / mads
    keep = z.abs().to_numpy() <= MAD_K
    kept_frac = keep.mean()
    if kept_frac == 0:
        raise RuntimeError("All training samples flagged as outliers. Relax MAD_K or disable outlier filtering.")
    filtered_train_idx = train_idx[keep]
    print(f"[outliers] drop mode: kept {kept_frac:.1%} of train, removed {(1-kept_frac):.1%}")
    train_ds = Subset(ds, filtered_train_idx.tolist())

elif OUTLIER_MODE == "winsorize":
    q_lo = df.groupby("Name")["y"].transform(lambda s: np.quantile(s, Q_LO))
    q_hi = df.groupby("Name")["y"].transform(lambda s: np.quantile(s, Q_HI))
    y_clip = np.clip(train_y, q_lo.to_numpy(), q_hi.to_numpy())
    # build a training TensorDataset with clipped labels (inputs unchanged)
    X_train = X_all[train_idx]
    y_train = y_all[train_idx].clone()
    y_train[:, 0] = torch.tensor(y_clip, dtype=y_train.dtype)
    print(f"[outliers] winsorize mode: labels clipped to [{int(Q_LO*100)}%, {int(Q_HI*100)}%] per plant")
    train_ds = TensorDataset(X_train, y_train)

else:
    print("[outliers] disabled")
    train_ds = Subset(ds, train_idx.tolist())

# --- test dataset untouched ---
test_ds  = Subset(ds, test_idx.tolist())

# --- loaders ---
train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
test_loader  = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)


model = WeatherEnergyCorr() # Initialise neural net

#___________Defining model parameters_______________
# Loss: Use MSE as it is a regression target
loss = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)
scheduler = lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=2)
model.train_model(epochs=1, data_loader=train_loader, optimizer=optimizer, criterion=loss)

avg_loss = model.eval_model(data_loader=test_loader, criterion=loss)
print(f"Avg. Validation Loss: {avg_loss}")



# Save model as TorchScript
model.eval()
example = torch.randn(1, 3, 14, 14)
ts_model = torch.jit.trace(model, example)
ts_model = torch.jit.freeze(ts_model)  # optional: constant-fold & lock params
ts_model.save("energy_grid_min_loss.torchscript")


