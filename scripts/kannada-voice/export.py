"""Builds Sakhi's server voices: downloads SYSPIN's open female VITS model
(IISc Bangalore, CC BY 4.0) for Kannada or Hindi from Hugging Face and exports
it to ONNX so the Next.js server can speak with onnxruntime-node.

    python scripts/kannada-voice/export.py              # Kannada → models/kn-female/
    python scripts/kannada-voice/export.py --lang hi    # Hindi   → models/hi-female/
    python scripts/kannada-voice/export.py --pt FILE    # reuse a downloaded .pt

Needs Python 3.10+ with `pip install torch onnx onnxruntime`. The export is
checked before it is kept: every audio frame must align to exactly one
input letter, in order, covering the whole text.
"""

import argparse
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VOICES = {
    "kn": {
        "name": "Kannada",
        "repo": "tts_vits_coquiai_KannadaFemale",
        "pt": "kn_female_vits_30hrs.pt",
        "test": "ನಮಸ್ಕಾರ, ನಾನು ಸಖಿ. ನಿಮ್ಮ ಬೆಳೆಯನ್ನು ಮಾರಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.",
    },
    "hi": {
        "name": "Hindi",
        "repo": "tts_vits_coquiai_HindiFemale",
        "pt": "hi_female_vits_30hrs.pt",
        "test": "नमस्ते, मैं सखी हूँ। मैं आपकी फसल बेचने में मदद करती हूँ।",
    },
}
REPO = OUT = ""


def download(name, dest, attempts=30):
    """Downloads with resume: a dropped connection continues from the bytes already saved."""
    if os.path.exists(dest):
        return
    print(f"downloading {name} …", flush=True)
    tmp = dest + ".part"
    for attempt in range(attempts):
        have = os.path.getsize(tmp) if os.path.exists(tmp) else 0
        req = urllib.request.Request(f"{REPO}/{name}", headers={"Range": f"bytes={have}-"} if have else {})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                resumed = r.status == 206
                total = int(r.headers["Content-Range"].rsplit("/", 1)[1]) if resumed else int(r.headers.get("Content-Length", 0))
                with open(tmp, "ab" if resumed else "wb") as f:
                    shutil.copyfileobj(r, f, 1 << 20)
            if total and os.path.getsize(tmp) >= total:
                os.replace(tmp, dest)
                return
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
            print(f"  interrupted at {have / 1e6:.0f} MB ({e}), resuming …", flush=True)
        time.sleep(min(30, 2 + attempt * 2))
    sys.exit(f"could not download {name}; run again to resume")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=sorted(VOICES), default="kn", help="which voice to build (default: kn)")
    ap.add_argument("--pt", help="path to an already downloaded *_female_vits_30hrs.pt")
    ap.add_argument("--keep", action="store_true", help="keep the 333 MB TorchScript file after export")
    args = ap.parse_args()
    voice = VOICES[args.lang]
    global REPO, OUT
    REPO = f"https://huggingface.co/SYSPIN/{voice['repo']}/resolve/main"
    OUT = os.path.join(ROOT, "models", f"{args.lang}-female")

    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from torch.onnx import register_custom_op_symbolic

    try:
        from torch.onnx import symbolic_helper as sh
    except ImportError:  # torch ≥ 2.9 moved the TorchScript exporter
        from torch.onnx._internal.torchscript_exporter import symbolic_helper as sh

    os.makedirs(OUT, exist_ok=True)
    pt = args.pt or os.path.join(OUT, voice["pt"])
    if not args.pt:
        download(voice["pt"], pt)
    download("chars.txt", os.path.join(OUT, "chars.txt"))

    # Vits.forward squeezes twice: duration = w_ceil.squeeze(1) on [B,1,Tx]
    # (a real squeeze) and attn_mask.squeeze(1) on [B,Ty,Tx] (a no-op since
    # Ty > 1). The exporter would wrap both in If(size == 1), whose branches
    # differ in rank and break the transposes that follow.
    calls = []

    def squeeze(g, self, dim=None):
        calls.append(dim)
        d = sh._get_const(dim, "i", "dim")
        if len(calls) == 1:
            return g.op("Squeeze", self, g.op("Constant", value_t=torch.tensor([d], dtype=torch.long)))
        return g.op("Identity", self)

    register_custom_op_symbolic("aten::squeeze", squeeze, 17)

    net = torch.jit.load(pt, map_location="cpu").eval()
    tmp = os.path.join(OUT, "model.onnx.part")
    torch.onnx.export(
        net,
        (torch.randint(1, 80, (1, 101), dtype=torch.long),),
        tmp,
        dynamo=False,
        opset_version=17,
        input_names=["input"],
        output_names=["audio"],
        dynamic_axes={"input": {1: "tokens"}, "audio": {2: "samples"}},
    )
    if len(calls) != 2:
        sys.exit(f"expected 2 squeezes in the graph, saw {len(calls)}; the model changed, export not kept")

    # Check the alignment path: one letter per frame, monotonic, all letters used.
    m = onnx.load(tmp)
    nodes = list(m.graph.node)
    i = next(k for k, n in enumerate(nodes) if n.op_type == "CumSum" and n.output[0].count("/") == 1)
    sub = next(n for n in nodes[i:] if n.op_type == "Sub" and n.output[0].count("/") == 1)
    mul = next(n for n in nodes[i:] if n.op_type == "Mul" and sub.output[0] in n.input)
    m.graph.output.append(onnx.helper.make_tensor_value_info(mul.output[0], onnx.TensorProto.FLOAT, None))
    sess = ort.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])
    letters = open(os.path.join(OUT, "chars.txt"), encoding="utf-8").read().strip("\n")
    vocab = ["<PAD>"] + list("!¡'(),-.:;¿? ") + list(letters) + ["<BLNK>"]
    ids = {c: k for k, c in enumerate(vocab)}
    text = re.sub(r"\s+", " ", voice["test"])
    seq = [ids[c] for c in text if c in ids]
    x = [ids["<BLNK>"]] * (len(seq) * 2 + 1)
    x[1::2] = seq
    audio, path = sess.run(None, {"input": np.array([x], dtype=np.int64)})
    p = path.reshape(path.shape[-2], path.shape[-1])
    if p.shape[1] != len(x):
        p = p.T
    owner = p.argmax(1)
    ok = np.all(p.sum(1) == 1) and np.all(np.diff(owner) >= 0) and owner[0] == 0 and owner[-1] == len(x) - 1
    if not ok:
        os.remove(tmp)
        sys.exit("exported model failed the alignment check, not kept")
    os.replace(tmp, os.path.join(OUT, "model.onnx"))
    print(f"ok: {audio.size / 22050:.1f}s of speech for the test sentence")

    with open(os.path.join(OUT, "SOURCE.md"), "w", encoding="utf-8") as f:
        f.write(
            f"{voice['name']} female VITS voice by SYSPIN (SPIRE Lab, IISc Bangalore),\n"
            f"https://huggingface.co/SYSPIN/{voice['repo']}, licensed CC BY 4.0.\n"
            "Converted to ONNX by scripts/kannada-voice/export.py.\n"
        )
    if not args.pt and not args.keep:
        os.remove(pt)
    print(f"{voice['name']} voice ready in", OUT)


if __name__ == "__main__":
    main()
