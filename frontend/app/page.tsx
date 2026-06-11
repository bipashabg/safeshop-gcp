"use client";
import { useState, useEffect, useRef } from "react";

type Tab = "url" | "seller" | "review" | "delivery";

const tabs: { id: Tab; label: string; placeholder: string }[] = [
  { id: "url", label: "Website", placeholder: "https://quick-deals-shop.in" },
  { id: "seller", label: "Instagram", placeholder: "@cheap_deals_2024" },
  { id: "review", label: "Reviews", placeholder: "https://amazon.in/dp/B08N5WRWNW" },
  { id: "delivery", label: "Tracking", placeholder: "Tracking number · carrier name" },
];

function getVerdict(text: string): "safe" | "suspicious" | "dangerous" | "neutral" {
  const lower = text.toLowerCase();
  if (lower.includes("dangerous") || lower.includes("do not") || lower.includes("fraud")) return "dangerous";
  if (lower.includes("suspicious") || lower.includes("caution") || lower.includes("warning")) return "suspicious";
  if (lower.includes("safe") || lower.includes("legitimate") || lower.includes("genuine") || lower.includes("low risk")) return "safe";
  return "neutral";
}

const verdictConfig = {
  safe:       { color: "#00E87A", bg: "rgba(0,232,122,0.08)",  border: "rgba(0,232,122,0.25)",  label: "SAFE" },
  suspicious: { color: "#FFB800", bg: "rgba(255,184,0,0.08)",  border: "rgba(255,184,0,0.25)",  label: "SUSPICIOUS" },
  dangerous:  { color: "#FF3B3B", bg: "rgba(255,59,59,0.08)",  border: "rgba(255,59,59,0.25)",  label: "DANGEROUS" },
  neutral:    { color: "#F2F0EB", bg: "rgba(242,240,235,0.04)", border: "rgba(242,240,235,0.12)", label: "ANALYSIS COMPLETE" },
};

function renderText(text: string) {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} style={{ height: 8 }} />;

    const boldMatch = trimmed.match(/^\*\*(.*?)\*\*$/);
    if (boldMatch) return (
      <div key={i} style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#F2F0EB", marginBottom: 4 }}>
        {boldMatch[1]}
      </div>
    );

    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.match(/^\d+\./)) {
      const content = trimmed.replace(/^[-•]\s+/, "").replace(/^\d+\.\s+/, "");
      const parts = content.split(/\*\*(.*?)\*\*/g);
      return (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#00E87A", flexShrink: 0, marginTop: 6 }} />
          <div style={{ fontSize: 13, color: "rgba(242,240,235,0.75)", lineHeight: 1.6 }}>
            {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: "#F2F0EB" }}>{p}</strong> : p)}
          </div>
        </div>
      );
    }

    const parts = trimmed.split(/\*\*(.*?)\*\*/g);
    return (
      <div key={i} style={{ fontSize: 13, color: "rgba(242,240,235,0.7)", lineHeight: 1.7, marginBottom: 4 }}>
        {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: "#F2F0EB", fontWeight: 500 }}>{p}</strong> : p)}
      </div>
    );
  });
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("url");
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [agentResponse, setAgentResponse] = useState<string>("");
  const [agentMessages, setAgentMessages] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    let rx = 0, ry = 0, mx = 0, my = 0;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    document.addEventListener("mousemove", onMove);
    let frame: number;
    const animate = () => {
      if (cursorRef.current) { cursorRef.current.style.left = mx - 6 + "px"; cursorRef.current.style.top = my - 6 + "px"; }
      if (ringRef.current) { rx += (mx - rx - 18) * 0.12; ry += (my - ry - 18) * 0.12; ringRef.current.style.left = rx + "px"; ringRef.current.style.top = ry + "px"; }
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => { document.removeEventListener("mousemove", onMove); cancelAnimationFrame(frame); };
  }, [isMobile]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const runScan = async () => {
    if (!input.trim() || scanning) return;
    setScanning(true);
    setAgentResponse("");
    setAgentMessages([]);

    const steps = [
      " Initialising SafeShop agent...",
      activeTab === "url" ? " Checking domain registration & SSL..." :
      activeTab === "seller" ? " Querying community fraud database..." :
      activeTab === "review" ? " Fetching and analysing reviews..." :
      " Validating tracking number format...",
      " Reasoning about the signals...",
      " Saving findings...",
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      setAgentMessages(prev => [...prev, steps[i]]);
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: activeTab, input }),
      });
      const data = await res.json();
      if (data.verdict) {
        setAgentResponse(data.verdict);
      } else if (data.error) {
        setAgentResponse(`Unable to complete analysis: ${data.error}\n\nPlease try again or check our community database.`);
      } else {
        setAgentResponse("Analysis complete. No response returned from agent.");
      }
    } catch {
      setAgentResponse("Connection error. Please check your internet and try again.");
    }
    setScanning(false);
  };

  const verdict = agentResponse ? getVerdict(agentResponse) : null;
  const vc = verdict ? verdictConfig[verdict] : null;
  const p = isMobile ? "16px" : "48px";
  const maxW = "1200px";

  return (
    <main style={{ background: "#080A0F", color: "#F2F0EB", fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", overflowX: "hidden", cursor: isMobile ? "auto" : "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ${!isMobile ? "*{cursor:none!important;}" : ""}
        html{scroll-behavior:smooth;}
        body::before{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:1000;opacity:0.5;}
        .reveal{opacity:0;transform:translateY(24px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal.visible{opacity:1;transform:translateY(0);}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.5)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        .a1{animation:fadeUp 0.7s 0.0s both}
        .a2{animation:fadeUp 0.7s 0.1s both}
        .a3{animation:fadeUp 0.7s 0.2s both}
        .a4{animation:fadeUp 0.7s 0.3s both}
        input::placeholder{color:rgba(242,240,235,0.35);}
        input:focus{outline:none;}
        .step-card{background:#0F1219;border:1px solid rgba(242,240,235,0.08);padding:28px 24px;transition:border-color 0.3s;}
        .step-card:hover{border-color:rgba(0,232,122,0.3);}
        .fraud-card{background:#080A0F;border:1px solid rgba(242,240,235,0.08);border-radius:16px;padding:28px;transition:all 0.3s;position:relative;overflow:hidden;}
        .fraud-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00E87A,transparent);transform:scaleX(0);transition:transform 0.3s;}
        .fraud-card:hover::before{transform:scaleX(1);}
        .fraud-card:hover{border-color:rgba(0,232,122,0.2);}
        .compare-table{width:100%;border-collapse:collapse;border:1px solid rgba(242,240,235,0.08);border-radius:16px;overflow:hidden;}
        .compare-table th{padding:16px 20px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;text-align:left;background:#0F1219;border-bottom:1px solid rgba(242,240,235,0.08);}
        .compare-table td{padding:14px 20px;font-size:13px;border-bottom:1px solid rgba(242,240,235,0.08);}
        .compare-table tr:last-child td{border-bottom:none;}
        .compare-table tr:hover td{background:rgba(242,240,235,0.02);}
        .agent-msg{display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(242,240,235,0.6);animation:slideIn 0.3s ease both;}
        a{text-decoration:none;}
        @media(max-width:768px){
          .hide-mobile{display:none!important;}
          .stats-strip{flex-wrap:wrap;gap:32px!important;padding:24px 20px!important;}
          .steps-grid{grid-template-columns:1fr!important;}
          .step-card:first-child{border-radius:16px 16px 0 0!important;}
          .step-card:last-child{border-radius:0 0 16px 16px!important;}
          .fraud-grid{grid-template-columns:1fr!important;}
          .ai-grid{grid-template-columns:1fr!important;gap:40px!important;}
          .compare-table th:nth-child(3),.compare-table th:nth-child(4),.compare-table td:nth-child(3),.compare-table td:nth-child(4){display:none;}
          .cta-buttons{flex-direction:column!important;align-items:stretch!important;}
          .cta-buttons a,.cta-buttons button{text-align:center!important;}
          .footer-inner{flex-direction:column!important;gap:12px!important;text-align:center!important;}
          .nav-links-desktop{display:none!important;}
        }
      `}</style>

      {!isMobile && <>
        <div ref={cursorRef} style={{ width:12,height:12,background:"#00E87A",borderRadius:"50%",position:"fixed",pointerEvents:"none",zIndex:9999,mixBlendMode:"screen",transition:"transform 0.15s" }} />
        <div ref={ringRef} style={{ width:36,height:36,border:"1px solid rgba(0,232,122,0.35)",borderRadius:"50%",position:"fixed",pointerEvents:"none",zIndex:9998 }} />
      </>}

      <nav style={{ position:"fixed",top:0,left:0,right:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",padding:`16px ${p}`,borderBottom:"1px solid rgba(242,240,235,0.08)",backdropFilter:"blur(20px)",background:"rgba(8,10,15,0.85)" }}>
        <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,letterSpacing:-0.5,display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:8,height:8,background:"#00E87A",borderRadius:"50%",animation:"pulse 2s infinite" }} />
          SafeShop
        </div>
        <div className="nav-links-desktop" style={{ display:"flex",gap:32,fontSize:14,color:"rgba(242,240,235,0.5)" }}>
          {["Why SafeShop","How it works","What we catch"].map(l=>(
            <a key={l} href={`#${l.toLowerCase().replace(/ /g,"-")}`} style={{ color:"inherit" }}
              onMouseEnter={e=>(e.currentTarget.style.color="#F2F0EB")}
              onMouseLeave={e=>(e.currentTarget.style.color="rgba(242,240,235,0.5)")}>{l}</a>
          ))}
        </div>
        <button onClick={()=>{ window.scrollTo({top:0,behavior:"smooth"}); setTimeout(()=>inputRef.current?.focus(),300); }}
          style={{ background:"#00E87A",color:"#080A0F",border:"none",padding:isMobile?"8px 16px":"10px 22px",fontFamily:"'DM Sans',sans-serif",fontWeight:500,fontSize:13,borderRadius:100 }}>
          {isMobile ? "Try free" : "Try it free →"}
        </button>
      </nav>

      <section style={{ minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:isMobile?"100px 16px 60px":"120px 48px 80px",textAlign:"center",position:"relative" }}>
        <div style={{ position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:isMobile?400:800,height:isMobile?300:500,background:"radial-gradient(ellipse,rgba(0,232,122,0.07) 0%,transparent 70%)",pointerEvents:"none" }} />


        <h1 className="a2" style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?"clamp(40px,11vw,52px)":"clamp(52px,7vw,88px)",lineHeight:1.0,letterSpacing:-2,maxWidth:860 }}>
          Stop online scams<br />before you{" "}
          <em style={{ fontStyle:"normal",color:"#00E87A" }}>pay</em>
        </h1>

        <p className="a3" style={{ fontSize:isMobile?15:17,fontWeight:300,color:"rgba(242,240,235,0.5)",maxWidth:520,lineHeight:1.7,marginTop:24,padding:isMobile?"0 8px":0 }}>
          Paste a link, Instagram handle, product URL, or tracking number. Our AI investigates the full fraud chain — so you don&apos;t have to.
        </p>

        <div className="a4" style={{ marginTop:48,width:"100%",maxWidth:680 }}>
          <div style={{ display:"flex",gap:4,background:"#0F1219",border:"1px solid rgba(242,240,235,0.08)",borderRadius:"12px 12px 0 0",padding:6 }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>{ setActiveTab(t.id); setAgentResponse(""); setAgentMessages([]); }}
                style={{ flex:1,padding:isMobile?"7px 2px":"8px 4px",fontSize:isMobile?10:12,fontWeight:activeTab===t.id?500:400,color:activeTab===t.id?"#F2F0EB":"rgba(242,240,235,0.45)",borderRadius:8,border:"none",background:activeTab===t.id?"#161B26":"transparent",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s" }}>
                {isMobile ? <div style={{ fontSize:9,marginTop:2 }}>{t.label}</div> : t.label}
              </button>
            ))}
          </div>
          <div style={{ display:"flex",border:"1px solid rgba(242,240,235,0.08)",borderTop:"none",borderRadius:"0 0 12px 12px",overflow:"hidden",background:"#0F1219" }}>
            <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runScan()}
              placeholder={tabs.find(t=>t.id===activeTab)?.placeholder}
              style={{ flex:1,background:"transparent",border:"none",padding:isMobile?"14px 14px":"18px 20px",fontFamily:"'DM Sans',sans-serif",fontSize:isMobile?14:15,color:"#F2F0EB",fontWeight:300 }} />
            <button onClick={runScan} style={{ background:"#00E87A",color:"#080A0F",border:"none",padding:isMobile?"0 16px":"0 28px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:isMobile?13:14,whiteSpace:"nowrap",minWidth:isMobile?80:110 }}>
              {scanning ? <div style={{ width:16,height:16,border:"2px solid rgba(8,10,15,0.3)",borderTop:"2px solid #080A0F",borderRadius:"50%",animation:"spin 0.6s linear infinite",margin:"0 auto" }} /> : isMobile ? "Scan" : "Scan now"}
            </button>
          </div>
        </div>

        {agentMessages.length > 0 && (
          <div style={{ width:"100%",maxWidth:680,marginTop:12,background:"#0F1219",border:"1px solid rgba(242,240,235,0.08)",borderRadius:12,padding:"14px 18px",display:"flex",flexDirection:"column",gap:8,animation:"fadeUp 0.3s ease both" }}>
            {agentMessages.map((msg,i)=>(
              <div key={i} className="agent-msg" style={{ animationDelay:`${i*0.1}s` }}>
                <div style={{ width:6,height:6,background:"#00E87A",borderRadius:"50%",flexShrink:0,animation:i===agentMessages.length-1&&scanning?"pulse 1s infinite":"none" }} />
                {msg}
              </div>
            ))}
          </div>
        )}

        {agentResponse && vc && (
          <div style={{ width:"100%",maxWidth:680,marginTop:12,border:`1px solid ${vc.border}`,borderRadius:12,overflow:"hidden",animation:"fadeUp 0.4s ease both" }}>
            <div style={{ padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",background:vc.bg,borderBottom:"1px solid rgba(242,240,235,0.08)" }}>
              <div style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"5px 14px",borderRadius:100,border:`1px solid ${vc.border}`,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:vc.color,letterSpacing:"0.06em" }}>
                <div style={{ width:7,height:7,borderRadius:"50%",background:vc.color,animation:"pulse 2s infinite" }} />
                {vc.label}
              </div>
            </div>

            {/* Body — formatted agent response */}
            <div style={{ padding:"16px 18px" }}>
              {renderText(agentResponse)}
            </div>

            {/* Footer */}
            <div style={{ padding:"10px 18px",borderTop:"1px solid rgba(242,240,235,0.08)",fontSize:11,color:"rgba(242,240,235,0.3)",display:"flex",gap:8,alignItems:"center" }}>
              <span style={{ color:"#00E87A" }}>●</span>
              Analysis saved to community database.
            </div>
          </div>
        )}
      </section>

      <div className="reveal stats-strip" style={{ borderTop:"1px solid rgba(242,240,235,0.08)",borderBottom:"1px solid rgba(242,240,235,0.08)",padding:`32px ${p}`,display:"flex",alignItems:"center",justifyContent:"center",gap:60,background:"#0F1219",flexWrap:"wrap" }}>
        {[["$2B+","Lost to scams annually","#00E87A"],["5 sec","Average scan time","#F2F0EB"],["4","Fraud types caught","#F2F0EB"],["∞","Community memory","#00E87A"]].map(([n,l,c])=>(
          <div key={l} style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?28:34,letterSpacing:-1,color:c }}>{n}</div>
            <div style={{ fontSize:11,color:"rgba(242,240,235,0.4)",marginTop:4,textTransform:"uppercase",letterSpacing:"0.08em" }}>{l}</div>
          </div>
        ))}
      </div>

      <section id="why-safeshop" style={{ padding:isMobile?`60px ${p}`:`100px ${p}`,maxWidth:maxW,margin:"0 auto" }}>
        <div className="reveal" style={{ fontSize:11,fontWeight:500,color:"#00E87A",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:16 }}>Why SafeShop</div>
        <h2 className="reveal" style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?"clamp(30px,8vw,40px)":"clamp(36px,4vw,52px)",letterSpacing:-2,lineHeight:1.05,maxWidth:600,marginBottom:48 }}>Other tools check one thing. We investigate everything.</h2>
        <div className="reveal" style={{ overflowX:"auto" }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th style={{ color:"rgba(242,240,235,0.4)",fontWeight:400 }}>Feature</th>
                <th style={{ color:"#00E87A" }}>SafeShop ✦</th>
                <th style={{ color:"rgba(242,240,235,0.5)" }}>F-Secure</th>
                <th style={{ color:"rgba(242,240,235,0.5)" }}>Safe Browsing</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Domain age check","✓","✓","✗"],
                ["Instagram shop detection","✓","✗","✗"],
                ["Fake review analysis","✓","✗","✗"],
                ["Delivery fraud detection","✓","✗","✗"],
                ["AI plain-language verdict","✓","✗","✗"],
                ["Dispute letter generator","✓","✗","✗"],
                ["Community fraud memory","✓","✗","Partial"],
                ["Conversational follow-up","✓","✗","✗"],
              ].map(([feat,us,fs,gsb])=>(
                <tr key={feat}>
                  <td style={{ color:"#F2F0EB" }}>{feat}</td>
                  <td style={{ color:"#00E87A",fontSize:17 }}>{us}</td>
                  <td style={{ color:fs==="✓"?"#00E87A":fs==="Partial"?"#FFB800":"rgba(242,240,235,0.2)",fontSize:fs==="Partial"?13:17 }}>{fs}</td>
                  <td style={{ color:gsb==="✓"?"#00E87A":gsb==="Partial"?"#FFB800":"rgba(242,240,235,0.2)",fontSize:gsb==="Partial"?13:17 }}>{gsb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="how-it-works" style={{ padding:isMobile?`0 ${p} 60px`:`0 ${p} 100px`,maxWidth:maxW,margin:"0 auto" }}>
        <div className="reveal" style={{ fontSize:11,fontWeight:500,color:"#00E87A",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:16 }}>How it works</div>
        <h2 className="reveal" style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?"clamp(30px,8vw,40px)":"clamp(36px,4vw,52px)",letterSpacing:-2,lineHeight:1.05,maxWidth:600,marginBottom:48 }}>Four tools. One conversation. Zero jargon.</h2>
        <div className="reveal steps-grid" style={{ display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(4,1fr)",gap:2 }}>
          {[
            {n:"01",t:"Domain Intelligence",d:"Scam shops are almost always less than 90 days old. We check domain age, SSL, and registration instantly."},
            {n:"02",t:"Social Shop Scanner",d:"Instagram handle too new? Sales language in the name? We cross-reference against our MongoDB community memory."},
            {n:"03",t:"Review Authenticity",d:"Gemini reads reviews and flags burst posting, generic praise, and suspicious rating patterns in seconds."},
            {n:"04",t:"Delivery Fraud Guard",d:"Already ordered? Paste your tracking number. We detect fake codes and generate your bank dispute letter automatically."},
          ].map((s,i)=>(
            <div key={i} className="step-card" style={{ borderRadius:isMobile?i===0?"16px 16px 0 0":i===3?"0 0 16px 16px":0:i===0?"16px 0 0 16px":i===3?"0 16px 16px 0":0 }}>
              <div style={{ fontFamily:"'Syne',sans-serif",fontSize:40,fontWeight:800,color:"rgba(0,232,122,0.1)",lineHeight:1,marginBottom:20 }}>{s.n}</div>
              <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,marginBottom:8 }}>{s.t}</div>
              <div style={{ fontSize:13,color:"rgba(242,240,235,0.5)",lineHeight:1.6 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="what-we-catch" style={{ background:"#0F1219",borderTop:"1px solid rgba(242,240,235,0.08)",borderBottom:"1px solid rgba(242,240,235,0.08)",padding:isMobile?`60px ${p}`:`100px ${p}` }}>
        <div style={{ maxWidth:maxW,margin:"0 auto" }}>
          <div className="reveal" style={{ fontSize:11,fontWeight:500,color:"#00E87A",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:16 }}>What we catch</div>
          <h2 className="reveal" style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?"clamp(30px,8vw,40px)":"clamp(36px,4vw,52px)",letterSpacing:-2,lineHeight:1.05,maxWidth:600,marginBottom:48 }}>The fraud is always a chain. We break every link.</h2>
          <div className="reveal fraud-grid" style={{ display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:16 }}>
            {[
              {t:"Fake Instagram Shops",d:"Scammers create stores overnight, run paid ads with stolen photos, collect UPI payments, then vanish. We detect them before you transfer money.",tag:"Social Commerce Fraud"},
              {t:"Cloned Checkout Pages",d:"Sites that look like Amazon or Myntra but steal your card details. Our domain intelligence catches clones Safe Browsing hasn't indexed yet.",tag:"Phishing Detection"},
              {t:"Fake Review Farms",d:"4.9 stars from 200 reviews all posted in the same week. Our AI reads what your eyes skip over.",tag:"Review Manipulation"},
              {t:"Delivery & Tracking Fraud",d:"Fake tracking numbers, packages stuck for weeks, marked delivered but never arrived. We detect anomalies and write your chargeback letter.",tag:"Post-Purchase Fraud"},
            ].map((c,i)=>(
              <div key={i} className="fraud-card">
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:17,marginBottom:8 }}>{c.t}</div>
                <div style={{ fontSize:13,color:"rgba(242,240,235,0.5)",lineHeight:1.7,marginBottom:14 }}>{c.d}</div>
                <div style={{ display:"inline-block",background:"rgba(0,232,122,0.08)",border:"1px solid rgba(0,232,122,0.2)",color:"#00E87A",fontSize:11,padding:"3px 10px",borderRadius:100,fontWeight:500 }}>{c.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding:isMobile?`60px ${p}`:`100px ${p}`,maxWidth:maxW,margin:"0 auto" }}>
        <div className="ai-grid" style={{ display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:isMobile?40:80,alignItems:"center" }}>
          <div className="reveal" style={{ background:"#0F1219",border:"1px solid rgba(242,240,235,0.08)",borderRadius:20,padding:28 }}>
            <div style={{ fontSize:11,color:"rgba(242,240,235,0.4)",marginBottom:14,letterSpacing:"0.06em",textTransform:"uppercase" }}>Live agent activity</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {[
                {c:"#00E87A",t:"check_domain → quick-deals-shop.in · 12 days old",s:"0.3s"},
                {c:"#FFB800",t:"validate_seller → @cheap_deals_2024 · community flagged",s:"0.6s"},
                {c:"#00E87A",t:"analyse_reviews → 94% generic phrases detected",s:"1.1s"},
                {c:"#00E87A",t:"MongoDB write → seller saved to community database",s:"1.4s"},
                {c:"#FF3B3B",t:"Verdict: DANGEROUS · 3 action steps generated",s:"1.8s"},
              ].map((ev,i)=>(
                <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#080A0F",border:"1px solid rgba(242,240,235,0.06)",borderRadius:10,fontSize:isMobile?11:12,animation:`slideIn 0.4s ${i*0.15}s both` }}>
                  <div style={{ width:7,height:7,borderRadius:"50%",background:ev.c,flexShrink:0 }} />
                  <div style={{ flex:1,color:"rgba(242,240,235,0.6)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:isMobile?"nowrap":"normal" }}>{ev.t}</div>
                  <div style={{ fontSize:10,color:"rgba(242,240,235,0.25)",flexShrink:0 }}>{ev.s}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal">
            <div style={{ fontSize:11,fontWeight:500,color:"#00E87A",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:16 }}>AI for good</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?"clamp(28px,7vw,36px)":"clamp(30px,3vw,42px)",letterSpacing:-1.5,lineHeight:1.1,marginBottom:20 }}>Fraud detection that used to take hours. Now takes 2 seconds.</h2>
            <p style={{ fontSize:14,color:"rgba(242,240,235,0.5)",lineHeight:1.8,marginBottom:16 }}>Before SafeShop, protecting yourself meant manually checking domain registrars, reading reviews, verifying seller credentials before every purchase. Exhausting. Most people skip it.</p>
            <p style={{ fontSize:14,color:"rgba(242,240,235,0.5)",lineHeight:1.8,marginBottom:28 }}>We automated every single step. Gemini reasons across all signals. MongoDB Atlas remembers every seller ever flagged. Every scan protects the next person too.</p>
            {["No technical knowledge needed — just paste and go","Every scan makes the community smarter for everyone","Free forever — safety shouldn't cost extra"].map(b=>(
              <div key={b} style={{ display:"flex",alignItems:"flex-start",gap:10,fontSize:14,color:"rgba(242,240,235,0.6)",marginBottom:12 }}>
                <div style={{ width:18,height:18,background:"rgba(0,232,122,0.1)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#00E87A",flexShrink:0,marginTop:1 }}>✓</div>
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ margin:isMobile?`0 ${p} 60px`:`0 48px 80px` }}>
        <div className="reveal" style={{ background:"linear-gradient(135deg,#0F1219 0%,rgba(0,232,122,0.04) 100%)",border:"1px solid rgba(242,240,235,0.08)",borderRadius:isMobile?16:24,padding:isMobile?"48px 24px":"72px 80px",textAlign:"center",position:"relative",overflow:"hidden" }}>
          <div style={{ position:"absolute",top:-80,left:"50%",transform:"translateX(-50%)",width:400,height:280,background:"radial-gradient(ellipse,rgba(0,232,122,0.08),transparent 70%)",pointerEvents:"none" }} />
          <h2 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:isMobile?"clamp(28px,8vw,40px)":"clamp(36px,4vw,52px)",letterSpacing:-2,lineHeight:1.05,marginBottom:16 }}>Your next purchase deserves a second opinion.</h2>
          <p style={{ fontSize:isMobile?14:16,color:"rgba(242,240,235,0.5)",marginBottom:36,maxWidth:480,marginLeft:"auto",marginRight:"auto",lineHeight:1.7 }}>Paste any link, handle, or tracking number. Get a verdict in seconds. Free.</p>
          <div className="cta-buttons" style={{ display:"flex",gap:12,justifyContent:"center" }}>
            <button onClick={()=>{ window.scrollTo({top:0,behavior:"smooth"}); setTimeout(()=>inputRef.current?.focus(),400); }}
              style={{ background:"#00E87A",color:"#080A0F",border:"none",padding:"14px 28px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,borderRadius:100 }}>
              Start scanning →
            </button>
            <a href="https://github.com/bipashabg/safeshop-gcp" target="_blank" rel="noreferrer"
              style={{ background:"transparent",color:"#F2F0EB",border:"1px solid rgba(242,240,235,0.15)",padding:"14px 28px",fontFamily:"'DM Sans',sans-serif",fontSize:14,borderRadius:100 }}>
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      <footer style={{ borderTop:"1px solid rgba(242,240,235,0.08)",padding:`28px ${p}` }}>
        <div className="footer-inner" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:13,color:"rgba(242,240,235,0.4)" }}>
          <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#F2F0EB",display:"flex",alignItems:"center",gap:6 }}>
            <div style={{ width:8,height:8,background:"#00E87A",borderRadius:"50%",animation:"pulse 2s infinite" }} />
            SafeShop
          </div>
          <div>Made by Bipasha Gayary</div>
          <div>2026</div>
        </div>
      </footer>
    </main>
  );
}
