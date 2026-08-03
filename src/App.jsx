import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem("styleai-token") || "");
  const [user, setUser] = useState(() => JSON.parse(window.localStorage.getItem("styleai-user") || "null"));
  const [loginError, setLoginError] = useState("");
  const [closet, setCloset] = useState(demoCloset);
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState(104);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMode, setRecommendationMode] = useState("closet");
  const [onlineQuery, setOnlineQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState([]);
  const [triedProducts, setTriedProducts] = useState(() => new Set(JSON.parse(window.localStorage.getItem("styleai-tried-products") || "[]")));
  const [pairingProduct, setPairingProduct] = useState(null);
  const [pairMatches, setPairMatches] = useState([]);
  const [selectedPairId, setSelectedPairId] = useState(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [activeLook, setActiveLook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const tryOnLock = useRef(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [modelImage, setModelImage] = useState("/user-model-new.jpg");
  const [modelPath, setModelPath] = useState("uploads/user-model-new.jpg");
  const [profileOpen, setProfileOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const [careMode, setCareMode] = useState("ideas");
  const [careLoading, setCareLoading] = useState(false);
  const [careResults, setCareResults] = useState([]);
  const [donationConfirm, setDonationConfirm] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(response => {
        if (!response.ok) throw new Error("expired");
        return response.json();
      })
      .then(profile => {
        setUser(profile);
        window.localStorage.setItem("styleai-user", JSON.stringify(profile));
      })
      .catch(() => {
        window.localStorage.removeItem("styleai-token");
        window.localStorage.removeItem("styleai-user");
        setAuthToken(""); setUser(null);
      });
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API}/inventory`).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(items => {
      setCloset(items.map(item => ({ ...item, image: demoCloset.find(demo => demo.id === item.id)?.image })));
    }).catch(() => {});
  }, [authToken]);

  useEffect(() => {
    fetch(`${API}/model-images`).then(response => response.json()).then(data => setModelOptions(data.images || [])).catch(() => {});
  }, []);

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

  const searchOnline = async (event, surprise = false) => {
    event?.preventDefault();
    setRecommendationMode("online"); setLoading(true); setError(""); setActiveLook(null);
    try {
      const response = await fetch(`${API}/online-products`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: onlineQuery, surprise, vibe: user?.style_preferences || [] }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setOnlineResults(data.results || []);
      if (!data.results?.length) setError("No online looks matched that search. Try a broader style description.");
    } catch { setError("Online inspiration could not connect. Restart the backend after setting EXA_API_KEY."); }
    finally { setLoading(false); }
  };

  const tryOn = async (look) => {
    if (tryOnLock.current) return;
    const outfitItems = look.items || look.item_ids.map(id => closet.find(item => item.id === id)).filter(Boolean);
    const garments = outfitItems.filter(item => ["top", "bottom", "dress", "outerwear"].includes(item.category));
    if (!garments.length || garments.some(item => !item.image_path)) return setError("Every item needs a garment photo before this outfit can be tried on.");
    setJobProgress(0);
    setActiveLook(look);
    tryOnLock.current = true;
    setTryOnLoading(true); setError("");
    try {
      const response = await fetch(`${API}/tryon-jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garments: garments.map(item => ({ path: item.image_path, category: item.category })),
          model_path: modelPath,
        }),
      });
      const submitted = await response.json();
      if (!response.ok) throw new Error(submitted.detail || "Could not create try-on job");
      const jobId = submitted.job_id;
      window.localStorage.setItem("styleai-active-job", jobId);

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
          if (status.status === "failed") {
            const terminalError = new Error(status.error || "FASHN VTON failed");
            terminalError.terminal = true;
            throw terminalError;
          }
          if (status.status === "complete") completedJob = status;
        } catch (pollError) {
          if (pollError.terminal) throw pollError;
          temporaryFailures += 1;
          if (temporaryFailures >= 12) throw pollError;
          await wait(2500);
        }
      }

      const resultUrl = completedJob.result_path?.startsWith("http")
        ? completedJob.result_path
        : `${API}/${completedJob.result_path}`;
      setModelImage(resultUrl);
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

  const deleteClosetItem = async item => {
    if (!window.confirm(`Delete ${item.name} from your closet?`)) return;
    const response = await fetch(`${API}/inventory/${item.id}`, { method: "DELETE" });
    if (!response.ok) return setError("This item could not be deleted.");
    setCloset(current => current.filter(piece => piece.id !== item.id));
    if (selected === item.id) setSelected(closet.find(piece => piece.id !== item.id)?.id || null);
  };

  const importProduct = async (product, addToCloset) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/import-online-item`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...product, add_to_closet: addToCloset }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not import this product image");
      if (addToCloset) {
        setCloset(current => [...current, data.item]); setSelected(data.item.id); setRecommendationMode("closet");
      } else {
        await tryOn({ name: product.title, reason: `Online inspiration from ${product.retailer}`, item_ids: [], items: [{ name: product.title, category: product.category, image_path: data.path }] });
        setTriedProducts(current => {
          const next = new Set(current); next.add(product.url);
          window.localStorage.setItem("styleai-tried-products", JSON.stringify([...next]));
          return next;
        });
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  const openPairing = async product => {
    setPairingProduct(product); setPairMatches([]); setSelectedPairId(null); setPairLoading(true); setError("");
    try {
      const response = await fetch(`${API}/pair-online-item`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not compare this item with your closet");
      setPairMatches(data.matches || []);
      setSelectedPairId(data.matches?.[0]?.item_id || null);
    } catch (requestError) { setError(requestError.message); }
    finally { setPairLoading(false); }
  };

  const tryPairedLook = async () => {
    const match = pairMatches.find(option => option.item_id === selectedPairId);
    if (!pairingProduct || !match) return;
    setPairLoading(true); setError("");
    try {
      const response = await fetch(`${API}/import-online-item`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pairingProduct, add_to_closet: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not prepare this online garment");
      const onlineGarment = {
        name: pairingProduct.title,
        category: pairingProduct.category,
        color: pairingProduct.color,
        image_path: data.path,
        image: pairingProduct.image,
      };
      const look = {
        name: `${pairingProduct.color || "New"} + ${match.item.color || "closet"}`,
        reason: match.reason,
        item_ids: [],
        items: [onlineGarment, match.item],
      };
      setPairingProduct(null);
      await tryOn(look);
      setTriedProducts(current => {
        const next = new Set(current); next.add(pairingProduct.url);
        window.localStorage.setItem("styleai-tried-products", JSON.stringify([...next]));
        return next;
      });
    } catch (requestError) { setError(requestError.message); }
    finally { setPairLoading(false); }
  };

  const signIn = async event => {
    event.preventDefault(); setLoginError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Sign in failed");
      window.localStorage.setItem("styleai-token", data.token); window.localStorage.setItem("styleai-user", JSON.stringify(data.user));
      setAuthToken(data.token); setUser(data.user);
    } catch (requestError) { setLoginError(requestError.message); }
  };

  const signOut = () => { window.localStorage.removeItem("styleai-token"); window.localStorage.removeItem("styleai-user"); setAuthToken(""); setUser(null); setProfileOpen(false); };

  const selectedItem = closet.find(item => item.id === selected) || closet[0];

  const openCare = (mode = "ideas") => {
    setCareMode(mode); setCareOpen(true); setCareResults([]); setError("");
  };

  const loadCareResults = async () => {
    if (!selectedItem) return;
    setCareMode("ideas"); setCareLoading(true); setCareResults([]); setError("");
    try {
      const response = await fetch(`${API}/restyle-guides`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: selectedItem.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load wardrobe ideas");
      setCareResults(data.ideas || []);
    } catch (requestError) { setError(requestError.message); }
    finally { setCareLoading(false); }
  };

  const findDonation = () => {
    setCareMode("donate"); setCareResults([]); setDonationConfirm(true);
  };

  const confirmDonation = async () => {
    if (!selectedItem) return;
    const mapWindow = window.open("about:blank", "_blank");
    try {
      const response = await fetch(`${API}/donate-item`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: selectedItem.id }) });
      if (!response.ok) throw new Error("Could not remove this item from your closet");
      setCloset(current => current.filter(item => item.id !== selectedItem.id));
      setDonationConfirm(false); setCareOpen(false);
      const openMap = location => { if (mapWindow) mapWindow.location = location; };
      if (!navigator.geolocation) return openMap("https://www.google.com/maps/search/clothing+donation+drop+off+near+me");
      navigator.geolocation.getCurrentPosition(({ coords }) => openMap(`https://www.google.com/maps/search/clothing+donation+drop+off/@${coords.latitude},${coords.longitude},14z`), () => openMap("https://www.google.com/maps/search/clothing+donation+drop+off+near+me"));
    } catch (requestError) { if (mapWindow) mapWindow.close(); setError(requestError.message); }
  };

  const uploadModel = async file => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    const response = await fetch(`${API}/model-images`, { method: "POST", body: form });
    const image = await response.json();
    if (!response.ok) return setError(image.detail || "Could not upload profile image");
    setModelOptions(current => [...current, image]); setModelPath(image.path); setModelImage(`${API}${image.url}`);
  };

  const chooseModel = image => { setModelPath(image.path); setModelImage(`${API}${image.url}`); setProfileOpen(false); };

  const deleteModel = async image => {
    if (!window.confirm("Delete this fitting-room photo?")) return;
    const response = await fetch(`${API}/model-images/${encodeURIComponent(image.name)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setError(data.detail || "Could not delete this photo");
    const remaining = modelOptions.filter(option => option.path !== image.path);
    setModelOptions(remaining);
    if (modelPath === image.path && remaining.length) chooseModel(remaining[0]);
  };

  const downloadResult = async () => {
    const response = await fetch(modelImage);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `styleai-look-${Date.now()}.png`; link.click();
    URL.revokeObjectURL(url);
  };

  if (!authToken || !user) return <main className="login-page"><section className="login-visual"><div className="login-brand"><span>S</span> STYLEAI</div><div><p>YOUR DIGITAL WARDROBE</p><h1>More ways to wear<br/>what feels like <em>you.</em></h1><small>AI styling, virtual try-on and a more thoughtful path through your closet.</small></div></section><section className="login-panel"><form onSubmit={signIn}><p className="eyebrow"><span /> WELCOME BACK</p><h2>Sign in to your closet.</h2><label>Email<input name="email" type="email" defaultValue="signintothings123@gmail.com" required/></label><label>Password<input name="password" type="password" defaultValue="password123" required/></label>{loginError && <p className="login-error">{loginError}</p>}<button>Enter StyleAI <span>→</span></button><small>Demo account details are pre-filled for you.</small></form></section></main>;

  return <main className="app-shell">
    <section className="studio">
      <aside className="stylist-panel">
        <div><p className="eyebrow"><span /> AI STYLIST</p><h1>Your closet.<br />A fresh <em>look.</em></h1><p className="intro">Style what you own—or search beyond your wardrobe when nothing feels right.</p></div>
        <div className="source-switch"><button className={recommendationMode === "closet" ? "active" : ""} onClick={() => setRecommendationMode("closet")}>From my closet</button><button className={recommendationMode === "online" ? "active" : ""} onClick={() => { setRecommendationMode("online"); setActiveLook(null); }}>Online inspo</button></div>
        {recommendationMode === "closet" ? <button className="dress-button" onClick={dressMe} disabled={loading}><span>{loading ? "✦" : "↗"}</span><div><strong>{loading ? "Styling your closet..." : "Dress me"}</strong><small>{loading ? "Matching colour and fit" : "Generate from pieces I own"}</small></div></button> : <form className="online-search" onSubmit={event => searchOnline(event, false)}><label>SEARCH SHOPPABLE INSPIRATION</label><div><input value={onlineQuery} onChange={event => setOnlineQuery(event.target.value)} placeholder="Search by colour, item or occasion"/><button disabled={loading || !onlineQuery.trim()}>{loading ? "…" : "Search"}</button></div><div className="search-suggestions"><span>TRY</span>{["streetwear for summer", "cottagecore dress", "vintage dinner top"].map(suggestion => <button type="button" key={suggestion} onClick={() => setOnlineQuery(suggestion)}>{suggestion}</button>)}</div><button type="button" className="surprise-button" onClick={() => searchOnline(null, true)} disabled={loading}>✦ Surprise me based on my closet & vibe</button><small>Full-body model and mannequin previews are prioritised · powered by Exa</small></form>}
        {error && <p className="inline-error">{error}</p>}
        <div className="recommendation-list">
          <div className="rec-title"><span>{recommendationMode === "closet" ? "AI RECOMMENDATIONS" : "ONLINE INSPIRATION"}</span><small>{recommendationMode === "closet" ? (recommendations.length ? `${recommendations.length} looks` : "Tap Dress me") : (onlineResults.length ? `${onlineResults.length} finds` : "Search a style")}</small></div>
          {recommendationMode === "closet" ? <>{!recommendations.length && <div className="empty-rec"><b>✦</b><span>Your styled looks will appear here.</span></div>}{recommendations.map((look, index) => <button key={`${look.name}-${index}`} className={`rec-card ${activeLook === look ? "active" : ""}`} onClick={() => tryOn(look)} disabled={tryOnLoading}><span>0{index + 1}</span><div><strong>{look.name}</strong><small>{activeLook === look && tryOnLoading ? "Creating try-on…" : look.reason}</small></div><i>→</i></button>)}</> : <>{!onlineResults.length && <div className="empty-rec"><b>⌕</b><span>Search with keywords or let AI surprise you.</span></div>}{onlineResults.map((product, index) => <article key={`${product.url}-${index}`} className={`product-card ${triedProducts.has(product.url) ? "tried" : ""}`}><a href={product.url} target="_blank" rel="noreferrer"><img src={product.image} alt={product.title}/>{triedProducts.has(product.url) && <span className="tried-badge">✓ Tried on</span>}</a><div><strong>{product.title}</strong><small>{product.retailer} · {product.category}{product.full_body_preferred ? " · full-body preview" : ""}</small><p>{product.summary}</p><div className="product-actions"><button onClick={() => openPairing(product)}>✦ Pair with closet</button><button onClick={() => importProduct(product, false)}>{triedProducts.has(product.url) ? "Try again" : "Try solo"}</button><button onClick={() => importProduct(product, true)}>＋ Closet</button></div></div></article>)}</>}
        </div>
        <p className="closet-count">{closet.length} pieces in your digital wardrobe</p>
      </aside>

      <section className="fitting-stage">
        <div className="ceiling-light light-one"/><div className="ceiling-light light-two"/><div className="arch arch-left"/><div className="arch arch-right"/>
        <div className="stage-title"><span>FITTING ROOM</span><small>{activeLook ? "AI LOOK SELECTED" : "YOUR PROFILE"}</small></div>
        <button className="floating-avatar" onClick={() => setProfileOpen(true)}>{user.initials}</button>
        <div className="model-frame yellow"><div className="frame-glow"/><img src={modelImage} alt="User in the virtual fitting room"/></div>
        <div className="look-label"><span>{activeLook ? "AI RECOMMENDS" : "YOUR BASE LOOK"}</span><strong>{activeLook?.name || "Ready to style"}</strong><small>{activeLook?.reason || "Choose Dress me to build an outfit from your closet."}</small></div>
        <div className="pedestal"><span/></div>
        {activeLook && tryOnLoading && <div className="stage-actions"><div className="try-progress"><span>✦</span><div className="try-progress-copy"><strong>Creating your try-on</strong><small>{jobProgress}%</small><div className="timer-track"><i style={{ width: `${jobProgress}%` }}/></div></div></div></div>}
        {!tryOnLoading && modelImage.includes("tryon_") && <button className="download-look" onClick={downloadResult} title="Download this look" aria-label="Download this look">⇩</button>}
      </section>

      <aside className="closet-panel">
        <div className="closet-heading"><div><p className="eyebrow">YOUR WARDROBE</p><h2>The closet</h2></div><button onClick={() => setUploadOpen(true)}>＋</button></div>
        <div className="tabs">{["all","top","bottom","dress"].map(tab => <button key={tab} onClick={() => setCategory(tab)} className={category === tab ? "active" : ""}>{tab === "all" ? "All" : `${tab[0].toUpperCase()}${tab.slice(1)}s`}</button>)}</div>
        <div className="wardrobe-grid featured">{shownItems.map(item => <article key={item.id} className={`garment-card ${selected === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><button className="trash-item" onClick={event => { event.stopPropagation(); deleteClosetItem(item); }} title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`}>⌫</button><span className="garment-image"><img src={closetImage(item)} alt={item.name}/></span><span className="garment-meta"><strong>{item.name}</strong><small>{item.color} · {item.category}</small></span>{selected === item.id && <i>✓</i>}</article>)}</div>
        <button className="add-piece" onClick={() => setUploadOpen(true)}>＋ Add another piece</button>
        <button className="care-entry" onClick={() => openCare("ideas")}><span>↻</span><div><strong>Restyle, repair or donate</strong><small>Make more of what you already own</small></div><b>→</b></button>
      </aside>
    </section>

    {careOpen && <div className="care-backdrop" onClick={() => setCareOpen(false)}><section className="care-drawer" onClick={event => event.stopPropagation()}>
      <button className="drawer-close" onClick={() => setCareOpen(false)}>×</button>
      <p className="eyebrow"><span /> WARDROBE AFTERCARE</p><h2>Wear it longer.</h2>
      <p className="care-intro">Restyle a piece you own, learn a practical transformation, or find somewhere nearby to pass it on.</p>
      <label className="care-item-label">SELECT A CLOSET PIECE<select value={selectedItem?.id || ""} onChange={event => { setSelected(Number(event.target.value)); setCareResults([]); }}>{closet.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="care-tabs"><button className={careMode === "ideas" ? "active" : ""} onClick={loadCareResults}>Restyle ideas + tutorials</button><button className={careMode === "donate" ? "active" : ""} onClick={findDonation}>Donate nearby</button></div>
      {careLoading && <div className="care-empty">Finding the best ideas…</div>}
      {!careLoading && careMode === "ideas" && !careResults.length && <button className="care-primary" onClick={loadCareResults}>Generate transformation guides</button>}
      {!careLoading && careMode === "ideas" && <div className="care-results guide-results">{careResults.map((idea, index) => <article key={`${idea.title}-${index}`}><span>IDEA {index + 1}</span><div>{idea.tutorial?.image && <img className="restyle-result-image" src={idea.tutorial.image} alt={`Finished inspiration for ${idea.title}`}/>}<strong>{idea.title}</strong><p>{idea.description}</p>{idea.tutorial && <a className="tutorial-video" href={idea.tutorial.url} target="_blank" rel="noreferrer">▶ Watch / open tutorial · {idea.tutorial.source}</a>}<ol>{idea.steps?.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>{idea.care_note && <small>CARE NOTE · {idea.care_note}</small>}</div></article>)}</div>}
      {careMode === "donate" && <div className="donation-card"><span>⌖</span><h3>Donate {selectedItem?.name}?</h3><p>This will remove the item from your active closet. You will then be shown the closest donation and textile collection points.</p>{!donationConfirm ? <button onClick={findDonation}>Continue</button> : <div className="donation-confirm"><strong>Are you sure you want to donate this?</strong><button onClick={confirmDonation}>Yes, remove it and show locations</button><button onClick={() => setDonationConfirm(false)}>No, keep it</button></div>}<small>Your location stays in your browser and is not stored by StyleAI.</small></div>}
    </section></div>}

    {profileOpen && <div className="modal-backdrop" onClick={() => setProfileOpen(false)}><section className="profile-modal" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setProfileOpen(false)}>×</button><p className="eyebrow"><span /> YOUR STYLE PROFILE</p><div className="profile-identity"><span>{user.initials}</span><div><h2>{user.name}</h2><p>{user.email}</p></div></div><div className="preference-block"><small>STYLE PREFERENCES</small><div>{user.style_preferences.map(value => <span key={value}>{value}</span>)}</div><small>PREFERRED COLOURS</small><div>{user.preferred_colors.map(value => <span key={value}>{value}</span>)}</div><small>PERSONALISATION</small><p>{user.fit_preferences.join(" · ")}<br/>{user.shopping_priorities.join(" · ")}</p></div><h3>Fitting-room photo</h3><p>Select a previous full-body upload or add a new one. New try-ons will use this picture.</p><div className="profile-grid">{modelOptions.map(image => <article key={image.path} className={modelPath === image.path ? "active" : ""}><button className="delete-model" onClick={() => deleteModel(image)} title="Delete this photo">⌫</button><button className="choose-model" onClick={() => chooseModel(image)}><img src={`${API}${image.url}`} alt={image.name}/><span>{image.name}</span></button></article>)}</div><label className="profile-upload">＋ Upload a new full-body photo<input type="file" accept="image/*" onChange={event => uploadModel(event.target.files[0])}/></label><button className="sign-out" onClick={signOut}>Sign out</button></section></div>}

    {uploadOpen && <div className="modal-backdrop" onClick={() => setUploadOpen(false)}><div className="upload-modal" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setUploadOpen(false)}>×</button><span className="upload-icon">＋</span><h2>Add to your closet</h2><p>Upload one clear garment photo. AI will identify and organise it automatically.</p><label>Choose a clothing photo<input type="file" accept="image/*" onChange={event => uploadItem(event.target.files[0])}/></label></div></div>}

    {pairingProduct && <div className="modal-backdrop" onClick={() => !pairLoading && setPairingProduct(null)}><section className="pairing-modal" onClick={event => event.stopPropagation()}>
      <button className="drawer-close" onClick={() => setPairingProduct(null)} disabled={pairLoading}>×</button>
      <p className="eyebrow"><span /> AI OUTFIT COMPATIBILITY</p><h2>Pair it with your closet.</h2>
      <p>StyleAI compared this online find with every compatible piece you own. The strongest match is selected, but the final choice is yours.</p>
      <div className="pair-online-piece"><img src={pairingProduct.image} alt={pairingProduct.title}/><div><small>ONLINE FIND</small><strong>{pairingProduct.title}</strong><span>{pairingProduct.color} · {pairingProduct.category}</span></div></div>
      {pairLoading && !pairMatches.length && <div className="pairing-loading">✦ Checking colour, silhouette, pattern and fabric…</div>}
      {!pairLoading && !pairMatches.length && <div className="pairing-loading">No complementary closet category is available yet. Add a matching separate to your closet first.</div>}
      {!!pairMatches.length && <><div className="pair-heading"><span>CHOOSE AN OWNED MATCH</span><small>{pairMatches.length} compatible options</small></div><div className="pair-options">{pairMatches.map((match, index) => <button key={match.item_id} className={selectedPairId === match.item_id ? "active" : ""} onClick={() => setSelectedPairId(match.item_id)}><img src={closetImage(match.item)} alt={match.item.name}/><div><span>{index === 0 ? "BEST MATCH" : `OPTION ${index + 1}`}</span><strong>{match.item.name}</strong><small>{match.reason}</small></div><b>{match.score}%</b></button>)}</div><button className="pair-try" onClick={tryPairedLook} disabled={pairLoading || tryOnLoading}>{pairLoading ? "Preparing look…" : "Try this complete look"}<span>→</span></button></>}
    </section></div>}
  </main>;
}
