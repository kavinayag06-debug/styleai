import { useState } from "react";

const BACKEND_URL = "http://localhost:8000";

const colorMap = {
  white: "#F0F0F0", blue: "#4A90D9", black: "#2C2C2C", pink: "#F4A7B9",
  grey: "#9B9B9B", beige: "#D4B896", red: "#E05252", olive: "#7A8C45",
  navy: "#2C3E6B", yellow: "#F5C842", cream: "#F5F0DC", burgundy: "#7B2D3E",
};

const categoryPosition = {
  top: { top: "18%", left: "20%", width: "60%", height: "28%" },
  outerwear: { top: "14%", left: "16%", width: "68%", height: "32%" },
  dress: { top: "18%", left: "20%", width: "60%", height: "50%" },
  bottom: { top: "46%", left: "22%", width: "56%", height: "30%" },
  shoes: { top: "76%", left: "26%", width: "48%", height: "16%" },
  accessory: { top: "8%", left: "30%", width: "40%", height: "10%" },
};

function BodySilhouette() {
  return (
    <svg viewBox="0 0 200 500" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <ellipse cx="100" cy="45" rx="28" ry="33" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <rect x="88" y="74" width="24" height="20" rx="4" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <path d="M55 90 Q45 100 42 140 L42 220 Q42 230 50 232 L150 232 Q158 230 158 220 L158 140 Q155 100 145 90 Q125 82 100 82 Q75 82 55 90Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <path d="M55 95 Q38 110 32 150 Q28 170 30 190 Q32 200 40 198 Q48 196 50 186 Q52 166 56 148 Q62 118 68 102Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <path d="M145 95 Q162 110 168 150 Q172 170 170 190 Q168 200 160 198 Q152 196 150 186 Q148 166 144 148 Q138 118 132 102Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <ellipse cx="35" cy="205" rx="10" ry="14" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <ellipse cx="165" cy="205" rx="10" ry="14" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <path d="M42 225 Q38 240 36 260 L164 260 Q162 240 158 225Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <path d="M42 255 Q36 280 34 320 Q32 360 34 390 Q36 400 46 400 Q56 400 58 390 Q62 360 64 320 Q68 280 68 255Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <path d="M158 255 Q164 280 166 320 Q168 360 166 390 Q164 400 154 400 Q144 400 142 390 Q138 360 136 320 Q132 280 132 255Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <ellipse cx="44" cy="408" rx="16" ry="10" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      <ellipse cx="156" cy="408" rx="16" ry="10" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
    </svg>
  );
}

function ClothingLayer({ item }) {
  const pos = categoryPosition[item.category] || categoryPosition.top;
  const color = colorMap[item.color] || "#ccc";

  if (item.image_path) {
    return (
      <div style={{ position: "absolute", ...pos, overflow: "hidden", borderRadius: 8, opacity: 0.9 }}>
        <img
          src={`${BACKEND_URL}/${item.image_path}`}
          alt={item.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={e => {
            e.target.style.display = "none";
            e.target.nextSibling.style.display = "flex";
          }}
        />
        <div style={{
          display: "none", width: "100%", height: "100%",
          background: color, borderRadius: 8, opacity: 0.75,
          alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "#fff", fontWeight: 600, textAlign: "center", padding: 4
        }}>
          {item.name}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", ...pos, background: color, borderRadius: 8, opacity: 0.8,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 600, textAlign: "center", padding: 4,
      color: ["white", "cream", "beige", "yellow"].includes(item.color) ? "#666" : "#fff",
    }}>
      {item.name}
    </div>
  );
}

export default function PaperDoll({ items, outfitName, onClose }) {
  const [tryOnResult, setTryOnResult] = useState(null);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const [tryOnError, setTryOnError] = useState(null);
  const [modelFile, setModelFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  const layerOrder = ["shoes", "bottom", "dress", "top", "outerwear", "accessory"];
  const sortedItems = [...items].sort((a, b) =>
    layerOrder.indexOf(a.category) - layerOrder.indexOf(b.category)
  );

  const garmentItem = sortedItems.find(i => i.image_path) || sortedItems[0];

  const runTryOn = async () => {
    if (!garmentItem?.image_path) {
      setTryOnError("No clothing photo available — upload a real clothing photo first using 'Add clothing'.");
      return;
    }

    setTryOnLoading(true);
    setTryOnError(null);
    setTryOnResult(null);

    try {
      if (modelFile) {
        const garmentRes = await fetch(`${BACKEND_URL}/${garmentItem.image_path}`);
        const garmentBlob = await garmentRes.blob();
        const garmentFile = new File([garmentBlob], "garment.jpg", { type: "image/jpeg" });
        const formData = new FormData();
        formData.append("garment", garmentFile);
        formData.append("model", modelFile);
        const res = await fetch(`${BACKEND_URL}/tryon`, { method: "POST", body: formData });
        const data = await res.json();
        setTryOnResult(data.result_url);
      } else {
        const res = await fetch(`${BACKEND_URL}/tryon-by-path`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            garment_path: garmentItem.image_path,
            model_path: ""
          }),
        });
        const data = await res.json();
        setTryOnResult(data.result_url);
      }
    } catch {
      setTryOnError("Try-on failed — the AI model may be busy. Try again in a moment.");
    }

    setTryOnLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: 24,
        maxWidth: 440, width: "100%", maxHeight: "90vh",
        overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.3px" }}>{outfitName}</div>
            <div style={{ fontSize: 12, color: "#AAA" }}>2D model view</div>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #E0E0E0", background: "#F5F5F5", cursor: "pointer", fontSize: 14 }}>
            ✕
          </button>
        </div>

        {tryOnResult && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
              AI Try-On Result
            </div>
            <img src={tryOnResult} alt="Try-on result"
              style={{ width: "100%", borderRadius: 14, border: "1px solid #EFEFEF" }} />
            <button onClick={() => setTryOnResult(null)}
              style={{ width: "100%", padding: "8px 0", marginTop: 8, border: "1px solid #E0E0E0", borderRadius: 8, background: "transparent", fontSize: 13, color: "#888", cursor: "pointer" }}>
              ← Back to model view
            </button>
          </div>
        )}

        {!tryOnResult && (
          <>
            <div style={{ position: "relative", width: "100%", paddingBottom: "140%", background: "#FAFAFA", borderRadius: 14, border: "1px solid #EFEFEF", marginBottom: 16 }}>
              <div style={{ position: "absolute", inset: 0, padding: "5% 15%" }}>
                <BodySilhouette />
              </div>
              {sortedItems.map(item => (
                <ClothingLayer key={item.id} item={item} />
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              {tryOnError && (
                <div style={{ background: "#FFF0F0", border: "1px solid #FFE0E0", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#C62828", marginBottom: 10 }}>
                  {tryOnError}
                </div>
              )}

              <button onClick={runTryOn} disabled={tryOnLoading}
                style={{ width: "100%", padding: "11px 0", background: tryOnLoading ? "#888" : "#6B21A8", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: tryOnLoading ? "not-allowed" : "pointer", marginBottom: 8 }}>
                {tryOnLoading ? "🤖 AI is generating try-on... (30–60s)" : "✨ Generate AI try-on"}
              </button>

              <button onClick={() => setShowUpload(o => !o)}
                style={{ width: "100%", padding: "9px 0", background: "#F5F5F5", border: "1px solid #E0E0E0", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#555", fontWeight: 500 }}>
                {showUpload ? "Hide" : "📸 Use your own photo as the model"}
              </button>

              {showUpload && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: "block", border: "1.5px dashed #DDD", borderRadius: 10, padding: "16px", textAlign: "center", cursor: "pointer", background: "#FAFAFA" }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {modelFile ? `✅ ${modelFile.name}` : "Upload a full body photo"}
                    </div>
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => {
                        setModelFile(e.target.files[0]);
                        setShowUpload(false);
                      }} />
                  </label>
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Items in this outfit</div>
          {sortedItems.map(item => (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 8,
              background: "#F9F9F9", border: "1px solid #EFEFEF",
            }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, background: colorMap[item.color] || "#ccc", border: "1px solid #ddd" }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.name}</span>
              <span style={{ fontSize: 10, color: "#BBB", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.category}</span>
              {item.image_path && <span style={{ fontSize: 10, color: "#15803D", fontWeight: 600 }}>📸</span>}
            </div>
          ))}
        </div>

        {!garmentItem?.image_path && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#FFFBF0", border: "1px solid #FFE082", borderRadius: 8, fontSize: 12, color: "#7B5800" }}>
            💡 Upload real clothing photos via "Add clothing" to enable AI try-on
          </div>
        )}
      </div>
    </div>
  );
}
