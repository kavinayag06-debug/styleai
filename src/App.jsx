import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
// Testing aid: set VITE_SHOW_INFERENCE_TIMER=false to hide it for the final demo.
const SHOW_INFERENCE_TIMER = import.meta.env.VITE_SHOW_INFERENCE_TIMER !== "false";
const DEFAULT_SECONDS_PER_GARMENT = 240;

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function currentTimestamp() {
  return Date.now();
}

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

const demoCloset = [
  { id: 102, name: "Light Wash Wide-Leg Jeans", category: "bottom", color: "blue", image_path: "uploads/jeans.png", image: "/closet/jeans.png", position: "50% 50%" },
  { id: 103, name: "Butter Satin Dress", category: "dress", color: "yellow", image_path: "uploads/yellow-dress.jpg", image: "/closet/yellow-dress.jpg", position: "50% 45%" },
  { id: 104, name: "Grey Jacquard Wrap Top", category: "top", color: "grey", image_path: "uploads/grey-knit-top.png", image: "/closet/grey-knit-top.png" },
  { id: 105, name: "Aqua Cotton Wrap Top", category: "top", color: "aqua", image_path: "uploads/aqua-wrap-top.png", image: "/closet/aqua-wrap-top.png" },
  { id: 106, name: "Stone Printed Wide-Leg Pants", category: "bottom", color: "stone", image_path: "uploads/printed-wide-pants.png", image: "/closet/printed-wide-pants.png" },
  { id: 107, name: "Blue Stripe Track Pants", category: "bottom", color: "blue", image_path: "uploads/blue-track-pants.png", image: "/closet/blue-track-pants.png" },
];

const fallbackRecommendations = [
  { name: "Soft Structure", item_ids: [104, 102], reason: "The fitted grey wrap top balances the volume of the pale wide-leg denim.", occasion: "Everyday" },
  { name: "Cool Tones", item_ids: [105, 107], reason: "Aqua and washed blue create a cohesive casual palette while the fitted top balances the relaxed pants.", occasion: "Casual" },
  { name: "Quiet Pattern", item_ids: [104, 106], reason: "The restrained grey knit complements the stone print without competing with it.", occasion: "Weekend" },
];

function closetImage(item) {
  if (item.image) return item.image;
  if (item.image_path) return `${API}/${item.image_path.replace(/^backend\//, "")}`;
  return "/closet/red-top.png";
}

export default function App() {
  const [closet, setCloset] = useState(demoCloset);
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState(104);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMode, setRecommendationMode] = useState("closet");
  const [onlineQuery, setOnlineQuery] = useState("streetwear for summer");
  const [onlineResults, setOnlineResults] = useState([]);
  const [activeLook, setActiveLook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const tryOnLock = useRef(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStage, setJobStage] = useState("Waiting for GPU");
  const [tryOnStartedAt, setTryOnStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(DEFAULT_SECONDS_PER_GARMENT * 2);
  const [modelImage, setModelImage] = useState("/user-model-new.jpg");
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const [careMode, setCareMode] = useState("restyle");
  const [careLoading, setCareLoading] = useState(false);
  const [careResults, setCareResults] = useState([]);
  const [donationUrl, setDonationUrl] = useState("https://www.google.com/maps/search/clothing+donation+drop+off+near+me");

  useEffect(() => {
    fetch(`${API}/inventory`).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(items => {
      setCloset(items.map(item => ({ ...item, image: demoCloset.find(demo => demo.id === item.id)?.image })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tryOnLoading || !tryOnStartedAt) return undefined;
    const updateElapsed = () => setElapsedSeconds((Date.now() - tryOnStartedAt) / 1000);
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [tryOnLoading, tryOnStartedAt]);

  const shownItems = useMemo(() => category === "all" ? closet : closet.filter(item => item.category === category), [closet, category]);

  const dressMe = async () => {
    setRecommendationMode("closet");
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/recommendations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: "casual", season: "summer" }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const looks = data.outfits?.length ? data.outfits : fallbackRecommendations;
      setRecommendations(looks);
      setActiveLook(looks[0]);
    } catch {
      setRecommendations(fallbackRecommendations);
      setActiveLook(fallbackRecommendations[0]);
      setError("Backend is offline—showing an on-device recommendation. Start the API for live AI styling.");
    } finally { setLoading(false); }
  };

  const searchOnline = async (event) => {
    event?.preventDefault();
    setRecommendationMode("online"); setLoading(true); setError(""); setActiveLook(null);
    try {
      const response = await fetch(`${API}/online-inspiration`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: onlineQuery, occasion: "casual" }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setOnlineResults(data.results || []);
      if (!data.results?.length) setError("No online looks matched that search. Try a broader style description.");
    } catch { setError("Online search could not connect. Restart the backend after setting EXA_API_KEY."); }
    finally { setLoading(false); }
  };

  const tryOn = async (look) => {
    if (tryOnLock.current) return;
    const outfitItems = look.item_ids.map(id => closet.find(item => item.id === id)).filter(Boolean);
    const garments = outfitItems.filter(item => ["top", "bottom", "dress", "outerwear"].includes(item.category));
    if (!garments.length || garments.some(item => !item.image_path)) return setError("Every item needs a garment photo before this outfit can be tried on.");
    const learnedSeconds = Number(window.localStorage.getItem("styleai-seconds-per-garment")) || DEFAULT_SECONDS_PER_GARMENT;
    const startedAt = currentTimestamp();
    setEstimatedSeconds(learnedSeconds * garments.length);
    setElapsedSeconds(0);
    setTryOnStartedAt(startedAt);
    setJobProgress(0);
    setJobStage("Submitting try-on");
    setActiveLook(look);
    tryOnLock.current = true;
    setTryOnLoading(true); setError("");
    try {
      const response = await fetch(`${API}/tryon-jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garments: garments.map(item => ({ path: item.image_path, category: item.category })),
          model_path: "uploads/user-model-new.jpg",
        }),
      });
      const submitted = await response.json();
      if (!response.ok) throw new Error(submitted.detail || "Could not create try-on job");
      const jobId = submitted.job_id;
      window.localStorage.setItem("styleai-active-job", jobId);
      setJobStage(submitted.stage || "Waiting for GPU");

      let completedJob = null;
      let temporaryFailures = 0;
      while (!completedJob) {
        await wait(2500);
        try {
          const statusResponse = await fetch(`${API}/tryon-jobs/${jobId}`);
          const status = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(status.detail || "Could not read try-on status");
          temporaryFailures = 0;
          setJobProgress(status.progress || 0);
          setJobStage(status.stage || status.status);
          if (typeof status.elapsed_seconds === "number" && status.elapsed_seconds > 0) {
            setElapsedSeconds(status.elapsed_seconds);
          }
          if (status.status === "failed") {
            const terminalError = new Error(status.error || "FASHN VTON failed");
            terminalError.terminal = true;
            throw terminalError;
          }
          if (status.status === "complete") completedJob = status;
        } catch (pollError) {
          if (pollError.terminal) throw pollError;
          temporaryFailures += 1;
          setJobStage(`Reconnecting to job… (${temporaryFailures}/12)`);
          if (temporaryFailures >= 12) throw pollError;
          await wait(2500);
        }
      }

      const resultUrl = completedJob.result_path?.startsWith("http")
        ? completedJob.result_path
        : `${API}/${completedJob.result_path}`;
      setModelImage(resultUrl);
      const secondsPerGarment = completedJob.elapsed_seconds / garments.length;
      const previous = Number(window.localStorage.getItem("styleai-seconds-per-garment"));
      const smoothed = previous ? (previous * 0.6) + (secondsPerGarment * 0.4) : secondsPerGarment;
      window.localStorage.setItem("styleai-seconds-per-garment", String(Math.round(smoothed)));
      window.localStorage.removeItem("styleai-active-job");
    } catch (requestError) { setError(requestError.message || "FASHN VTON could not finish the try-on."); }
    finally {
      tryOnLock.current = false;
      setTryOnLoading(false);
    }
  };

  const uploadItem = async (file) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    setUploadOpen(false); setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setCloset(current => [...current, data.item]); setSelected(data.item.id);
    } catch { setError("Upload failed. Check that the backend and OPENAI_API_KEY are running."); }
    finally { setLoading(false); }
  };

  const selectedItem = closet.find(item => item.id === selected) || closet[0];

  const openCare = (mode = "restyle") => {
    setCareMode(mode); setCareOpen(true); setCareResults([]); setError("");
  };

  const loadCareResults = async (mode) => {
    if (!selectedItem) return;
    setCareMode(mode); setCareLoading(true); setCareResults([]); setError("");
    try {
      const endpoint = mode === "tutorials" ? "restyle-tutorials" : "restyle";
      const response = await fetch(`${API}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: selectedItem.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load wardrobe ideas");
      setCareResults(mode === "tutorials" ? data.tutorials || [] : data.styles || []);
    } catch (requestError) { setError(requestError.message); }
    finally { setCareLoading(false); }
  };

  const findDonation = () => {
    setCareMode("donate"); setCareResults([]);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setDonationUrl(`https://www.google.com/maps/search/clothing+donation+drop+off/@${coords.latitude},${coords.longitude},14z`);
    }, () => setDonationUrl("https://www.google.com/maps/search/clothing+donation+drop+off+near+me"));
  };

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand"><span className="brand-mark">S</span><span>STYLE<span>AI</span></span></button>
      <nav className="main-nav"><button className="active">My closet</button><button onClick={dressMe}>AI recommendations</button><button onClick={() => { setRecommendationMode("online"); setActiveLook(null); }}>Discover online</button><button onClick={() => openCare("restyle")}>Restyle & give</button><button onClick={() => setUploadOpen(true)}>Add item</button></nav>
      <div className="header-actions"><span className="api-status"><i /> Connected closet</span><button className="avatar">KG</button></div>
    </header>

    <section className="studio">
      <aside className="stylist-panel">
        <div><p className="eyebrow"><span /> AI STYLIST</p><h1>Your closet.<br />A fresh <em>look.</em></h1><p className="intro">Style what you own—or search beyond your wardrobe when nothing feels right.</p></div>
        <div className="source-switch"><button className={recommendationMode === "closet" ? "active" : ""} onClick={() => setRecommendationMode("closet")}>From my closet</button><button className={recommendationMode === "online" ? "active" : ""} onClick={() => { setRecommendationMode("online"); setActiveLook(null); }}>Search online</button></div>
        {recommendationMode === "closet" ? <button className="dress-button" onClick={dressMe} disabled={loading}><span>{loading ? "✦" : "↗"}</span><div><strong>{loading ? "Styling your closet..." : "Dress me"}</strong><small>{loading ? "Matching colour and fit" : "Generate from pieces I own"}</small></div></button> : <form className="online-search" onSubmit={searchOnline}><label>WHAT ARE YOU LOOKING FOR?</label><div><input value={onlineQuery} onChange={event => setOnlineQuery(event.target.value)} placeholder="e.g. minimalist dinner outfit"/><button disabled={loading}>{loading ? "…" : "Search"}</button></div><small>Powered by Exa · results open at their original source</small></form>}
        {error && <p className="inline-error">{error}</p>}
        <div className="recommendation-list">
          <div className="rec-title"><span>{recommendationMode === "closet" ? "AI RECOMMENDATIONS" : "ONLINE INSPIRATION"}</span><small>{recommendationMode === "closet" ? (recommendations.length ? `${recommendations.length} looks` : "Tap Dress me") : (onlineResults.length ? `${onlineResults.length} finds` : "Search a style")}</small></div>
          {recommendationMode === "closet" ? <>{!recommendations.length && <div className="empty-rec"><b>✦</b><span>Your styled looks will appear here.</span></div>}{recommendations.map((look, index) => <button key={`${look.name}-${index}`} className={`rec-card ${activeLook === look ? "active" : ""}`} onClick={() => tryOn(look)} disabled={tryOnLoading}><span>0{index + 1}</span><div><strong>{look.name}</strong><small>{activeLook === look && tryOnLoading ? "Creating try-on…" : look.reason}</small></div><i>→</i></button>)}</> : <>{!onlineResults.length && <div className="empty-rec"><b>⌕</b><span>Search the web when your closet needs new energy.</span></div>}{onlineResults.map((result, index) => <a key={`${result.url}-${index}`} className="online-card" href={result.url} target="_blank" rel="noreferrer">{result.image ? <img src={result.image} alt=""/> : <span>↗</span>}<div><strong>{result.title}</strong><small>{result.source}</small><p>{result.summary}</p></div></a>)}</>}
        </div>
        <p className="closet-count">{closet.length} pieces in your digital wardrobe</p>
      </aside>

      <section className="fitting-stage">
        <div className="ceiling-light light-one"/><div className="ceiling-light light-two"/><div className="arch arch-left"/><div className="arch arch-right"/>
        <div className="stage-title"><span>FITTING ROOM</span><small>{activeLook ? "AI LOOK SELECTED" : "YOUR PROFILE"}</small></div>
        <div className="model-frame yellow"><div className="frame-glow"/><img src={modelImage} alt="User in the virtual fitting room"/><div className="scan-line"/></div>
        <div className="look-label"><span>{activeLook ? "AI RECOMMENDS" : "YOUR BASE LOOK"}</span><strong>{activeLook?.name || "Ready to style"}</strong><small>{activeLook?.reason || "Choose Dress me to build an outfit from your closet."}</small></div>
        <div className="pedestal"><span/></div>
        {activeLook && tryOnLoading && <div className="stage-actions"><div className={`try-progress ${SHOW_INFERENCE_TIMER ? "with-timer" : ""}`}><span>✦</span><div className="try-progress-copy"><strong>Creating your try-on</strong><small>{jobStage} · {jobProgress}%</small>{SHOW_INFERENCE_TIMER && <div className="inference-timer"><div className="timer-labels"><span>{formatTime(elapsedSeconds)} elapsed</span><span>{elapsedSeconds < estimatedSeconds ? `~${formatTime(estimatedSeconds - elapsedSeconds)} remaining` : "Finishing…"}</span></div><div className="timer-track"><i style={{ width: `${jobProgress}%` }}/></div><em>Live status from the remote GPU job</em></div>}</div></div></div>}
      </section>

      <aside className="closet-panel">
        <div className="closet-heading"><div><p className="eyebrow">YOUR WARDROBE</p><h2>The closet</h2></div><button onClick={() => setUploadOpen(true)}>＋</button></div>
        <div className="tabs">{["all","top","bottom","dress"].map(tab => <button key={tab} onClick={() => setCategory(tab)} className={category === tab ? "active" : ""}>{tab === "all" ? "All" : `${tab[0].toUpperCase()}${tab.slice(1)}s`}</button>)}</div>
        <div className="wardrobe-grid featured">{shownItems.map(item => <button key={item.id} className={`garment-card ${selected === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><span className="garment-image"><img src={closetImage(item)} alt={item.name}/></span><span className="garment-meta"><strong>{item.name}</strong><small>{item.color} · {item.category}</small></span>{selected === item.id && <i>✓</i>}</button>)}</div>
        <button className="add-piece" onClick={() => setUploadOpen(true)}>＋ Add another piece</button>
        <button className="care-entry" onClick={() => openCare("restyle")}><span>↻</span><div><strong>Restyle, repair or donate</strong><small>Make more of what you already own</small></div><b>→</b></button>
      </aside>
    </section>

    {careOpen && <div className="care-backdrop" onClick={() => setCareOpen(false)}><section className="care-drawer" onClick={event => event.stopPropagation()}>
      <button className="drawer-close" onClick={() => setCareOpen(false)}>×</button>
      <p className="eyebrow"><span /> WARDROBE AFTERCARE</p><h2>Wear it longer.</h2>
      <p className="care-intro">Restyle a piece you own, learn a practical transformation, or find somewhere nearby to pass it on.</p>
      <label className="care-item-label">SELECT A CLOSET PIECE<select value={selectedItem?.id || ""} onChange={event => { setSelected(Number(event.target.value)); setCareResults([]); }}>{closet.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="care-tabs"><button className={careMode === "restyle" ? "active" : ""} onClick={() => loadCareResults("restyle")}>Restyle with AI</button><button className={careMode === "tutorials" ? "active" : ""} onClick={() => loadCareResults("tutorials")}>Tutorials</button><button className={careMode === "donate" ? "active" : ""} onClick={findDonation}>Donate nearby</button></div>
      {careLoading && <div className="care-empty">Finding the best ideas…</div>}
      {!careLoading && careMode === "restyle" && !careResults.length && <button className="care-primary" onClick={() => loadCareResults("restyle")}>Generate 3 new ways to wear it</button>}
      {!careLoading && careMode === "tutorials" && !careResults.length && <button className="care-primary" onClick={() => loadCareResults("tutorials")}>Find tutorials online</button>}
      {!careLoading && careMode === "restyle" && <div className="care-results">{careResults.map((style, index) => <article key={`${style.name}-${index}`}><span>0{index + 1}</span><div><strong>{style.name}</strong><p>{style.description}</p><small>{style.item_ids?.map(id => closet.find(item => item.id === id)?.name).filter(Boolean).join(" + ")}</small></div></article>)}</div>}
      {!careLoading && careMode === "tutorials" && <div className="care-results tutorial-results">{careResults.map((tutorial, index) => <a href={tutorial.url} target="_blank" rel="noreferrer" key={`${tutorial.url}-${index}`}>{tutorial.image && <img src={tutorial.image} alt=""/>}<div><strong>{tutorial.title}</strong><small>{tutorial.source}</small><p>{tutorial.summary}</p></div><b>↗</b></a>)}</div>}
      {careMode === "donate" && <div className="donation-card"><span>⌖</span><h3>Give this piece a next life</h3><p>See clothing donation bins, charity shops and textile collection points around you.</p><a href={donationUrl} target="_blank" rel="noreferrer" onClick={findDonation}>Open nearby donation points ↗</a><small>Your location stays in your browser and is not stored by StyleAI.</small></div>}
    </section></div>}

    {uploadOpen && <div className="modal-backdrop" onClick={() => setUploadOpen(false)}><div className="upload-modal" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setUploadOpen(false)}>×</button><span className="upload-icon">＋</span><h2>Add to your closet</h2><p>Upload one clear garment photo. AI will identify and organise it automatically.</p><label>Choose a clothing photo<input type="file" accept="image/*" onChange={event => uploadItem(event.target.files[0])}/></label></div></div>}
  </main>;
}
