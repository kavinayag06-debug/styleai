#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if ! command -v python3.12 >/dev/null 2>&1; then
  echo "Python 3.12 is required. Install it with: brew install python@3.12"
  exit 1
fi

if [[ ! -d "$SCRIPT_DIR/fashn-vton-1.5/.git" ]]; then
  git clone https://github.com/fashn-AI/fashn-vton-1.5.git "$SCRIPT_DIR/fashn-vton-1.5"
fi

python3.12 -m venv "$SCRIPT_DIR/.venv-vton"
source "$SCRIPT_DIR/.venv-vton/bin/activate"
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r "$SCRIPT_DIR/requirements.txt"

# The upstream package defaults to CUDA ONNX Runtime. macOS requires the CPU build.
python -m pip install torch torchvision safetensors huggingface_hub pillow numpy opencv-python tqdm einops onnxruntime matplotlib fashn-human-parser
python -m pip install -e "$SCRIPT_DIR/fashn-vton-1.5" --no-deps
python "$SCRIPT_DIR/fashn-vton-1.5/scripts/download_weights.py" --weights-dir "$SCRIPT_DIR/fashn-vton-1.5/weights"

echo "FASHN VTON v1.5 is ready. Activate with: source backend/.venv-vton/bin/activate"
