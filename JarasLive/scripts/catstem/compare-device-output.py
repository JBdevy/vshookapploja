#!/usr/bin/env python3
"""Compare downloaded iPad probe WAVs with the original desktop model."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.states import load_model

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--checkpoint", type=Path, required=True)
parser.add_argument("--documents", type=Path, required=True)
args = parser.parse_args()
assert hashlib.sha256(args.checkpoint.read_bytes()).hexdigest() == "34c22ccb381c6f9fdbf324f04e1e2fe21aaaf293f5ded163a162697ff9a02ddd"
torch.set_num_threads(2)
torch.set_num_interop_threads(1)
audio, rate = sf.read(args.documents / "input.wav", dtype="float32", always_2d=True)
mixture = torch.from_numpy(audio.T.copy())
reference = mixture.mean(0)
mean, deviation = reference.mean(), reference.std(unbiased=False)
model = load_model(args.checkpoint).eval()
with torch.inference_mode():
    result = apply_model(model, ((mixture - mean) / deviation)[None], device="cpu",
                         shifts=0, split=True, overlap=.25, num_workers=0)[0]
    result.mul_(deviation).add_(mean / 6)
report, combined = {}, np.zeros_like(audio)
for name, index in (("Vocal", 3), ("Drum", 0), ("Bass", 1), ("Guitar", 4), ("Other", None)):
    value, sample_rate = sf.read(args.documents / f"{name}.wav", dtype="float32", always_2d=True)
    assert sample_rate == rate == 44100 and value.shape == audio.shape and np.isfinite(value).all()
    combined += value
    if index is not None:
        expected = result[index].T.numpy()
        rms = float(np.sqrt(np.mean((value.astype("float64") - expected) ** 2)))
        reference_rms = float(np.sqrt(np.mean(expected.astype("float64") ** 2)))
        report[name] = dict(rms=rms, relative_rms=rms / max(1e-8, reference_rms),
                            maximum=float(np.max(np.abs(value - expected))))
        assert rms < max(2e-5, reference_rms * .005), report[name]
report["sum_maximum"] = float(np.max(np.abs(combined - audio)))
assert report["sum_maximum"] < 1e-6
report["frames"] = len(audio)
report["sample_rate"] = rate
print("PHYSICAL_IPAD_DESKTOP_PARITY_OK", json.dumps(report, indent=2))
