import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ---- Supabase REST API ----
async function sbFetch(table, options = {}) {
  const { method = "GET", body, params = "" } = options;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
  // POSTのみreturn=representationをつける（PATCH/DELETEはつけない）
  if (method === "POST") headers["Prefer"] = "return=representation";

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : [];
}

// ---- DB行 → React state変換（buyDate統一）----
const toZaiko   = r => ({ id: r.id, name: r.name, qty: r.qty || "", buy: r.buy || 0, sell: r.sell || 0, buyDate: r.buy_date || "" });
const toNyuka   = r => ({ id: r.id, name: r.name, qty: r.qty || "", date: r.date || "", place: r.place || "", buy: r.buy || 0 });
const toKaitaku = r => ({ id: r.id, title: r.title, memo: r.memo || "", url: r.url || "" });
const toSold = r => ({
  id: r.id,
  sourceId: r.source_id,
  name: r.name,
  qty: r.qty || "",
  buy: r.buy || 0,
  sell: r.sell || 0,
  profit: r.profit || 0,
  soldDate: r.sold_date || "",
});

// ---- ユーティリティ ----
function daysSince(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(dateStr)) / 86400000);
  const color = diff === 0 ? "#5a9e2f" : diff <= 3 ? "#5a9e2f" : diff <= 7 ? "#7a8599" : "#e05c2a";
  const label = diff === 0 ? "本日入荷" : diff === 1 ? "前日入荷" : `${diff}日前入荷`;
  return { label, color };
}

// ⑤ 色分け改善版
function daysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(dateStr) - today) / 86400000);
  let color, label;
  if (diff < 0)        { color = "#e05c2a"; label = "期日超過"; }
  else if (diff === 0) { color = "#5a9e2f"; label = "今日着"; }
  else if (diff <= 3)  { color = "#7ec85a"; label = diff === 1 ? "明日着" : `${diff}日後着`; }
  else                 { color = "#7a8599"; label = `${diff}日後着`; }
  return { label, color };
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}

function parseQty(qtyStr) {
  const match = String(qtyStr || "").trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  return {
    num: parseFloat(match[1]),
    unit: match[2].trim(),
  };
}

function subtractQty(currentQty, soldQty) {
  const current = parseQty(currentQty);
  const sold = parseQty(soldQty);

  if (!current || !sold) return currentQty;
  if (current.unit !== sold.unit) return currentQty;

  const remaining = current.num - sold.num;

  if (remaining <= 0) return "";

  return `${remaining}${current.unit}`;
}

// ---- スタイル定数 ----
const S = {
  body:        { background: "#f0f2f5", minHeight: "100vh", fontFamily: "'Noto Sans JP', sans-serif", color: "#1a1f2e" },
  header:      { position: "sticky", top: 0, zIndex: 100, background: "rgba(240,242,245,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #dde1e9", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 },
  logo:        { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 20, color: "#5a9e2f" },
  logoSub:     { fontWeight: 400, color: "#1a1f2e" },
  badge:       { fontSize: 11, background: "#5a9e2f", color: "#fff", padding: "2px 10px", borderRadius: 20, fontWeight: 700, letterSpacing: 1 },
  tabs:        { display: "flex", gap: 4, padding: "16px 12px 0" },
  tab: a =>   ({ padding: "10px 18px", borderRadius: "10px 10px 0 0", border: "1px solid #dde1e9", borderBottom: "none", background: a ? "#f7f8fa" : "#fff", color: a ? "#5a9e2f" : "#7a8599", fontSize: 14, fontWeight: a ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Noto Sans JP', sans-serif" }),
  content:     { background: "#f7f8fa", border: "1px solid #dde1e9", margin: "0 12px 32px", borderRadius: "0 12px 12px 12px", padding: "20px 16px", minHeight: 400 },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingLeft: 4 },
  sectionTitle:{ fontSize: 20, fontWeight: 700 },
  btnPrimary:  { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "#5a9e2f", color: "#fff", fontFamily: "'Noto Sans JP', sans-serif" },
  btnEdit:     { width: "100%", marginTop: 10, padding: 7, borderRadius: 7, border: "1.5px solid #dde1e9", background: "rgba(0,0,0,0.04)", color: "#7a8599", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans JP', sans-serif" },
  btnDel:      { width: "100%", marginTop: 6, padding: 7, borderRadius: 7, border: "1.5px solid rgba(90,158,47,0.25)", background: "rgba(90,158,47,0.08)", color: "#4a8424", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans JP', sans-serif" },
  btnNyuka:    { width: "100%", marginTop: 6, padding: 7, borderRadius: 7, border: "1.5px solid rgba(58,142,246,0.3)", background: "rgba(58,142,246,0.08)", color: "#3a8ef6", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans JP', sans-serif" },
  btnUrl:      { display: "block", width: "100%", textAlign: "center", marginTop: 8, padding: 7, borderRadius: 7, border: "1.5px solid #dde1e9", background: "rgba(0,0,0,0.04)", color: "#7a8599", fontSize: 12, fontWeight: 700, textDecoration: "none", boxSizing: "border-box" },
  cardGrid:    { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  card:        { background: "#fff", border: "1.5px solid #dde1e9", borderRadius: 12, overflow: "hidden", width: "100%", boxSizing: "border-box" },
  cardMain:    cardMain: {
  padding: "14px 16px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "flex-start",
  gap: 8
},
  cardName:    { fontSize: 15, fontWeight: 800, color: "#5a9e2f", lineHeight: 1.35, wordBreak: "break-word" },
  cardQty:     { fontSize: 15, fontWeight: 700, color: "#1a1f2e" },
  cardDetail:  { borderTop: "1px solid #dde1e9", padding: "12px 14px 14px" },
  detailRow:   { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13, borderBottom: "1px solid rgba(200,210,220,0.4)" },
  dk:          { color: "#7a8599", fontSize: 11, fontWeight: 700 },
  dv:          { fontWeight: 600, color: "#1a1f2e" },
  formBox:     { background: "#fff", border: "1px solid #dde1e9", borderRadius: 10, padding: 20, marginTop: 20 },
  formGrid:    { display: "grid", gridTemplateColumns: "1fr", gap: 14 },
  formGroup:   { display: "flex", flexDirection: "column", gap: 6 },
  label:       { fontSize: 11, fontWeight: 700, color: "#7a8599", letterSpacing: 1, textTransform: "uppercase" },
  input:       { background: "#fff", border: "1px solid #dde1e9", color: "#1a1f2e", padding: "9px 12px", borderRadius: 7, fontSize: 16, lineHeight: "22px", height: 42, fontFamily: "'Noto Sans JP', sans-serif", outline: "none", width: "100%", maxWidth: "100%", boxSizing: "border-box", appearance: "none" },
  textarea:    { background: "#fff", border: "1px solid #dde1e9", color: "#1a1f2e", padding: "9px 12px", borderRadius: 7, fontSize: 16, lineHeight: "22px", fontFamily: "'Noto Sans JP', sans-serif", outline: "none", width: "100%", maxWidth: "100%", minHeight: 80, resize: "vertical", boxSizing: "border-box" },
  select:      { background: "#fff", border: "1px solid #dde1e9", color: "#1a1f2e", padding: "9px 12px", borderRadius: 7, fontSize: 16, lineHeight: "22px", height: 42, fontFamily: "'Noto Sans JP', sans-serif", outline: "none", width: "100%", maxWidth: "100%", boxSizing: "border-box" },
  editInline:  { marginTop: 10, display: "flex", flexDirection: "column", gap: 7 },
  editInput:   { padding: "8px 10px", fontSize: 16, lineHeight: "22px", minHeight: 42, borderRadius: 6, border: "1px solid #dde1e9", background: "#f0f2f5", color: "#1a1f2e", fontFamily: "'Noto Sans JP', sans-serif", width: "100%", maxWidth: "100%", boxSizing: "border-box", appearance: "none" },
  editBtns:    { display: "flex", gap: 6 },
  editSave:    { flex: 1, padding: 6, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#5a9e2f", color: "#fff", border: "none", fontFamily: "'Noto Sans JP', sans-serif" },
  editCancel:  { flex: 1, padding: 6, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#f0f2f5", color: "#7a8599", border: "1px solid #dde1e9", fontFamily: "'Noto Sans JP', sans-serif" },
  empty:       { textAlign: "center", padding: "60px 20px", color: "#7a8599", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  profitPos:   { color: "#5a9e2f", fontWeight: 700 },
  profitNeg:   { color: "#e05c2a", fontWeight: 700 },
};

// ---- 汎用カードコンポーネント ----
function StockCard({ mainContent, subContent, detailContent }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...S.card, borderColor: open ? "#5a9e2f" : "#dde1e9" }}>
      <div style={S.cardMain} onClick={() => setOpen(o => !o)}>
        <div style={{ width: "100%" }}>
          {mainContent}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {subContent}
          </div>

          <span style={{ fontSize: 11, color: "#7a8599", whiteSpace: "nowrap", flexShrink: 0 }}>
            詳細 <span style={{ display: "inline-block", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
          </span>
        </div>
      </div>

      {open && <div style={S.cardDetail}>{detailContent}</div>}
    </div>
  );
}

// ---- 在庫カード（③ 仕入日編集対応）----
function ZaikoCard({ item, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(item.name);
  const [qty,     setQty]     = useState(item.qty);
  const [buy,     setBuy]     = useState(item.buy);
  const [sell,    setSell]    = useState(item.sell);
  const [buyDate, setBuyDate] = useState(item.buyDate);

  const profit = (item.sell || 0) - (item.buy || 0);
  const ds = daysSince(item.buyDate);

  const handleSave = async () => {
    // React側はbuyDate、Supabaseへはbuy_dateで送る
    await onUpdate(item.id, {
      name,
      qty,
      buy:      parseFloat(buy)  || 0,
      sell:     parseFloat(sell) || 0,
      buy_date: buyDate,
    });
    setEditing(false);
  };

  return (
    <StockCard
      mainContent={
  <div style={{ ...S.cardName, textAlign: "left", width: "100%" }}>
    {item.name}
  </div>
}
      subContent={
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <span style={S.cardQty}>{item.qty || "—"}</span>
          {ds && <span style={{ fontSize: 11, color: ds.color, fontWeight: 600, whiteSpace: "nowrap" }}>{ds.label}</span>}
        </div>
      }
      detailContent={
        <>
          {[
            ["仕入れ値", item.buy  ? `¥${item.buy.toLocaleString()}`  : "—"],
            ["売り値",   item.sell ? `¥${item.sell.toLocaleString()}` : "—"],
            ["粗利", (item.buy || item.sell)
              ? <span style={profit > 0 ? S.profitPos : profit < 0 ? S.profitNeg : {}}>
                  {profit >= 0 ? "+¥" : "¥"}{profit.toLocaleString()}
                </span>
              : "—"],
          ].map(([k, v], i, a) => (
            <div key={k} style={{ ...S.detailRow, borderBottom: i === a.length - 1 ? "none" : undefined }}>
              <span style={S.dk}>{k}</span><span style={S.dv}>{v}</span>
            </div>
          ))}
          {editing ? (
            <div style={S.editInline}>
              <input style={S.editInput} value={name}    onChange={e => setName(e.target.value)}    placeholder="品目" />
              <input style={S.editInput} value={qty}     onChange={e => setQty(e.target.value)}     placeholder="数量" />
              <input style={S.editInput} value={buy}     onChange={e => setBuy(e.target.value)}     type="number" placeholder="仕入れ値" />
              <input style={S.editInput} value={sell}    onChange={e => setSell(e.target.value)}    type="number" placeholder="売り値" />
              <input style={S.editInput} value={buyDate} onChange={e => setBuyDate(e.target.value)} type="date" />
              <div style={S.editBtns}>
                <button style={S.editSave}   onClick={handleSave}>保存</button>
                <button style={S.editCancel} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={S.btnEdit} onClick={() => setEditing(true)}>編集</button>
          )}
          <button style={S.btnDel} onClick={() => onDelete(item.id)}>削除</button>
        </>
      }
    />
  );
}

// ---- 入荷予定カード（④ 入荷済みボタン付き）----
function NyukaCard({ item, onDelete, onUpdate, onNyukazumi }) {
  const [editing, setEditing] = useState(false);
  const [name,  setName]  = useState(item.name);
  const [qty,   setQty]   = useState(item.qty);
  const [date,  setDate]  = useState(item.date);
  const [place, setPlace] = useState(item.place);
  const [buy,   setBuy]   = useState(item.buy);
  const dl = daysLeft(item.date);

  const handleSave = async () => {
    await onUpdate(item.id, { name, qty, date, place, buy: parseFloat(buy) || 0 });
    setEditing(false);
  };

  return (
    <StockCard
      mainContent={
  <div style={{ ...S.cardName, textAlign: "left", width: "100%" }}>
    {item.name}
  </div>
}
      subContent={
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <span style={S.cardQty}>{item.qty || "—"}</span>
          {dl && <span style={{ fontSize: 11, color: dl.color, fontWeight: 600, whiteSpace: "nowrap" }}>{dl.label}</span>}
        </div>
      }
      detailContent={
        <>
          {[
            ["入荷日",   formatDate(item.date)],
            ["受取場所", item.place === "市場" ? "🏪 市場" : item.place === "ヤマト" ? "📮 ヤマト" : item.place || "—"],
            ["仕入れ値", item.buy ? `¥${item.buy.toLocaleString()}` : "—"],
          ].map(([k, v], i, a) => (
            <div key={k} style={{ ...S.detailRow, borderBottom: i === a.length - 1 ? "none" : undefined }}>
              <span style={S.dk}>{k}</span><span style={S.dv}>{v}</span>
            </div>
          ))}
          {editing ? (
            <div style={S.editInline}>
              <input style={S.editInput} value={name}  onChange={e => setName(e.target.value)}  placeholder="品目" />
              <input style={S.editInput} value={qty}   onChange={e => setQty(e.target.value)}   placeholder="数量" />
              <input style={S.editInput} value={date}  onChange={e => setDate(e.target.value)}  type="date" />
              <select style={{ ...S.editInput }} value={place} onChange={e => setPlace(e.target.value)}>
                <option value="市場">🏪 市場</option>
                <option value="ヤマト">📮箱 ヤマト</option>
              </select>
              <input style={S.editInput} value={buy} onChange={e => setBuy(e.target.value)} type="number" placeholder="仕入れ値" />
              <div style={S.editBtns}>
                <button style={S.editSave}   onClick={handleSave}>保存</button>
                <button style={S.editCancel} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={S.btnEdit} onClick={() => setEditing(true)}>編集</button>
          )}
          <button style={S.btnNyuka} onClick={() => onNyukazumi(item)}>入荷済み</button>
          <button style={S.btnDel}   onClick={() => onDelete(item.id)}>削除</button>
        </>
      }
    />
  );
}

// ---- 新規開拓カード ----
function KaitakuCard({ item, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [memo,  setMemo]  = useState(item.memo);
  const [url,   setUrl]   = useState(item.url);

  const handleSave = async () => {
    await onUpdate(item.id, { title, memo, url });
    setEditing(false);
  };

  return (
    <StockCard
      mainContent={
  <div style={{ ...S.cardName, textAlign: "left", width: "100%" }}>
    {item.title}
  </div>
}
      subContent={
        <div style={{ fontSize: 12, color: "#7a8599", fontWeight: 600 }}>
          {item.memo ? "メモあり" : "メモなし"}
        </div>
      }
      detailContent={
        <>
          {item.memo && (
            <div style={{ fontSize: 13, color: "#7a8599", lineHeight: 1.6, whiteSpace: "pre-wrap", paddingBottom: 4 }}>{item.memo}</div>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" style={S.btnUrl}>サイトを開く</a>
          )}
          {editing ? (
            <div style={S.editInline}>
              <input    style={S.editInput} value={title} onChange={e => setTitle(e.target.value)} placeholder="仕入先・品目" />
              <input    style={S.editInput} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
              <textarea style={{ ...S.editInput, minHeight: 60, resize: "vertical" }} value={memo} onChange={e => setMemo(e.target.value)} placeholder="メモ" />
              <div style={S.editBtns}>
                <button style={S.editSave}   onClick={handleSave}>保存</button>
                <button style={S.editCancel} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={{ ...S.btnEdit, marginTop: item.url ? 8 : 10 }} onClick={() => setEditing(true)}>編集</button>
          )}
          <button style={S.btnDel} onClick={() => onDelete(item.id)}>削除</button>
        </>
      }
    />
  );
}

function SoldCard({ item }) {
  return (
    <StockCard
      mainContent={
        <div style={{ ...S.cardName }}>
          {item.name}
        </div>
      }
      subContent={
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <span style={S.cardQty}>{item.qty || "—"}</span>
          <span style={{ fontSize: 11, color: "#7a8599", fontWeight: 600, whiteSpace: "nowrap" }}>
            {formatDate(item.soldDate)}
          </span>
        </div>
      }
      detailContent={
        <>
          {[
            ["商品名", item.name || "—"],
            ["数量", item.qty || "—"],
            ["仕入れ値", item.buy ? `¥${item.buy.toLocaleString()}` : "—"],
            ["売り値", item.sell ? `¥${item.sell.toLocaleString()}` : "—"],
            ["粗利", <span style={item.profit > 0 ? S.profitPos : item.profit < 0 ? S.profitNeg : {}}>
              {item.profit >= 0 ? "+¥" : "¥"}{item.profit.toLocaleString()}
            </span>],
            ["販売日", formatDate(item.soldDate)],
          ].map(([k, v], i, a) => (
            <div key={k} style={{ ...S.detailRow, borderBottom: i === a.length - 1 ? "none" : undefined }}>
              <span style={S.dk}>{k}</span><span style={S.dv}>{v}</span>
            </div>
          ))}
        </>
      }
    />
  );
}

// ---- メインアプリ ----
export default function App() {
  const [tab,     setTab]     = useState("zaiko");
  const [zaiko,   setZaiko]   = useState([]);
  const [nyuka,   setNyuka]   = useState([]);
  const [kaitaku, setKaitaku] = useState([]);
  const [sold, setSold] = useState([]);
  const [syncMsg,   setSyncMsg]   = useState("読み込み中...");
  const [syncColor, setSyncColor] = useState("#7a8599");
  const [showZaikoForm,   setShowZaikoForm]   = useState(false);
  const [showNyukaForm,   setShowNyukaForm]   = useState(false);
  const [showKaitakuForm, setShowKaitakuForm] = useState(false);

  // フォーム state
  const [zName, setZName] = useState(""); const [zQty,  setZQty]  = useState("");
  const [zBuy,  setZBuy]  = useState(""); const [zSell, setZSell] = useState(""); const [zDate, setZDate] = useState("");
  const [nName, setNName] = useState(""); const [nQty,   setNQty]   = useState("");
  const [nDate, setNDate] = useState(""); const [nPlace, setNPlace] = useState(""); const [nBuy, setNBuy] = useState("");
  const [kTitle, setKTitle] = useState(""); const [kMemo, setKMemo] = useState(""); const [kUrl, setKUrl] = useState("");

  const showSync = useCallback((msg, color, auto = true) => {
    setSyncMsg(msg); setSyncColor(color);
    if (auto) setTimeout(() => setSyncMsg(""), 2500);
  }, []);

  // ② 初回のみloadAll（setIntervalなし）
  const loadAll = useCallback(async () => {
    showSync("読み込み中...", "#7a8599", false);
    try {
      const [z, n, k, s] = await Promise.all([
  sbFetch("zaiko",   { params: "?order=id.asc" }),
  sbFetch("nyuka",   { params: "?order=date.asc" }),
  sbFetch("kaitaku", { params: "?order=id.asc" }),
  sbFetch("sold",    { params: "?order=sold_date.desc" }),
]);

setZaiko(z.map(toZaiko));
setNyuka(n.map(toNyuka));
setKaitaku(k.map(toKaitaku));
setSold(s.map(toSold));
      setZaiko(z.map(toZaiko));
      setNyuka(n.map(toNyuka));
      setKaitaku(k.map(toKaitaku));
      showSync("✓ 同期済み", "#5a9e2f");
    } catch (e) {
      showSync("⚠ 読み込み失敗: " + e.message, "#e05c2a", false);
    }
  }, [showSync]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- 在庫CRUD ----
  const addZaiko = async () => {
    if (!zName.trim()) return alert("品目を入力してください");
    showSync("保存中...", "#7a8599", false);
    try {
      await sbFetch("zaiko", {
        method: "POST",
        body: {
          id: Date.now(),
          name: zName,
          qty: zQty,
          buy: parseFloat(zBuy) || 0,
          sell: parseFloat(zSell) || 0,
          buy_date: zDate || new Date().toISOString().slice(0, 10),
        },
      });
      setZName(""); setZQty(""); setZBuy(""); setZSell(""); setZDate("");
      setShowZaikoForm(false);
      await loadAll();
    } catch (e) { showSync("⚠ 保存失敗: " + e.message, "#e05c2a", false); }
  };

  const deleteZaiko = async (id) => {
    if (!confirm("削除しますか？")) return;
    showSync("削除中...", "#7a8599", false);
    try {
      await sbFetch("zaiko", { method: "DELETE", params: `?id=eq.${id}` });
      await loadAll();
    } catch (e) { showSync("⚠ 削除失敗", "#e05c2a", false); }
  };

  const updateZaiko = async (id, data) => {
    showSync("保存中...", "#7a8599", false);
    try {
      await sbFetch("zaiko", { method: "PATCH", params: `?id=eq.${id}`, body: data });
      await loadAll();
    } catch (e) { showSync("⚠ 保存失敗: " + e.message, "#e05c2a", false); }
  };

  // ---- 入荷予定CRUD ----
  const addNyuka = async () => {
    if (!nName.trim()) return alert("品目を入力してください");
    if (!nPlace)       return alert("受取場所を選択してください");
    showSync("保存中...", "#7a8599", false);
    try {
      await sbFetch("nyuka", {
        method: "POST",
        body: { id: Date.now(), name: nName, qty: nQty, date: nDate, place: nPlace, buy: parseFloat(nBuy) || 0 },
      });
      setNName(""); setNQty(""); setNDate(""); setNPlace(""); setNBuy("");
      setShowNyukaForm(false);
      await loadAll();
    } catch (e) { showSync("⚠ 保存失敗: " + e.message, "#e05c2a", false); }
  };

  const deleteNyuka = async (id) => {
    if (!confirm("削除しますか？")) return;
    showSync("削除中...", "#7a8599", false);
    try {
      await sbFetch("nyuka", { method: "DELETE", params: `?id=eq.${id}` });
      await loadAll();
    } catch (e) { showSync("⚠ 削除失敗", "#e05c2a", false); }
  };

  const updateNyuka = async (id, data) => {
    showSync("保存中...", "#7a8599", false);
    try {
      await sbFetch("nyuka", { method: "PATCH", params: `?id=eq.${id}`, body: data });
      await loadAll();
    } catch (e) { showSync("⚠ 保存失敗: " + e.message, "#e05c2a", false); }
  };

  // ④ 入荷済み処理
  const handleNyukazumi = async (item) => {
    if (!confirm(`入荷済みにしますか？`)) return;
    showSync("処理中...", "#7a8599", false);
    try {
      await sbFetch("zaiko", {
        method: "POST",
        body: {
          id: Date.now(),
          name: item.name,
          qty: item.qty,
          buy: item.buy,
          sell: 0,
          buy_date: item.date || new Date().toISOString().slice(0, 10),
        },
      });
      await sbFetch("nyuka", { method: "DELETE", params: `?id=eq.${item.id}` });
      await loadAll();
    } catch (e) { showSync("⚠ 処理失敗: " + e.message, "#e05c2a", false); }
  };

  // ---- 新規開拓CRUD ----
  const addKaitaku = async () => {
    if (!kTitle.trim()) return alert("仕入先・品目を入力してください");
    showSync("保存中...", "#7a8599", false);
    try {
      await sbFetch("kaitaku", {
        method: "POST",
        body: { id: Date.now(), title: kTitle, memo: kMemo, url: kUrl },
      });
      setKTitle(""); setKMemo(""); setKUrl("");
      setShowKaitakuForm(false);
      await loadAll();
    } catch (e) { showSync("⚠ 保存失敗: " + e.message, "#e05c2a", false); }
  };

  const deleteKaitaku = async (id) => {
    if (!confirm("削除しますか？")) return;
    showSync("削除中...", "#7a8599", false);
    try {
      await sbFetch("kaitaku", { method: "DELETE", params: `?id=eq.${id}` });
      await loadAll();
    } catch (e) { showSync("⚠ 削除失敗", "#e05c2a", false); }
  };

  const updateKaitaku = async (id, data) => {
    showSync("保存中...", "#7a8599", false);
    try {
      await sbFetch("kaitaku", { method: "PATCH", params: `?id=eq.${id}`, body: data });
      await loadAll();
    } catch (e) { showSync("⚠ 保存失敗: " + e.message, "#e05c2a", false); }
  };

  // ---- レンダリング ----
  return (
    <div style={S.body}>
      <header style={S.header}>
        <div style={S.logo}>UMAMI<span style={S.logoSub}> stock</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: syncColor }}>{syncMsg}</span>
          <div style={S.badge}>尼崎市場</div>
        </div>
      </header>

      <div style={S.tabs}>
        {[["zaiko","在庫"],["nyuka","入荷予定"],["kaitaku","新規開拓"],["sold","販売済み"]].map(([key,icon,label]) => (
          <button key={key} style={S.tab(tab===key)} onClick={() => setTab(key)}>{icon} {label}</button>
        ))}
      </div>

      <div style={S.content}>

        {/* 在庫 */}
        {tab === "zaiko" && (
          <div>
            <div style={S.sectionHead}>
              <div style={S.sectionTitle}>在庫</div>
              <button style={S.btnPrimary} onClick={() => setShowZaikoForm(v => !v)}>＋ 追加</button>
            </div>
            {zaiko.length === 0
              ? <div style={S.empty}><p>在庫データなし</p></div>
              : <div style={S.cardGrid}>{zaiko.map(item => <ZaikoCard
  key={item.id}
  item={item}
  onDelete={deleteZaiko}
  onUpdate={updateZaiko}
  onSold={handleSold}
/>)}</div>
            }
            {showZaikoForm && (
              <div style={S.formBox}>
                <div style={S.formGrid}>
                  <div style={S.formGroup}><label style={S.label}>品目</label><input style={S.input} value={zName} onChange={e=>setZName(e.target.value)} placeholder="例：鯛、トマト…"/></div>
                  <div style={S.formGroup}><label style={S.label}>数量</label><input style={S.input} value={zQty} onChange={e=>setZQty(e.target.value)} placeholder="例：10kg、5箱"/></div>
                  <div style={S.formGroup}><label style={S.label}>仕入れ日</label><input type="date" style={S.input} value={zDate} onChange={e=>setZDate(e.target.value)}/></div>
                  <div style={S.formGroup}><label style={S.label}>仕入れ値（円）</label><input type="number" style={S.input} value={zBuy} onChange={e=>setZBuy(e.target.value)} placeholder="0"/></div>
                  <div style={S.formGroup}><label style={S.label}>売り値（円）</label><input type="number" style={S.input} value={zSell} onChange={e=>setZSell(e.target.value)} placeholder="0"/></div>
                  <div style={{alignSelf:"flex-end"}}><button style={S.btnPrimary} onClick={addZaiko}>追加する</button></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 入荷予定 */}
        {tab === "nyuka" && (
          <div>
            <div style={S.sectionHead}>
              <div style={S.sectionTitle}>入荷予定</div>
              <button style={S.btnPrimary} onClick={() => setShowNyukaForm(v => !v)}>＋ 追加</button>
            </div>
            {nyuka.length === 0
              ? <div style={S.empty}><p>入荷予定データなし</p></div>
              : <div style={S.cardGrid}>{nyuka.map(item => <NyukaCard key={item.id} item={item} onDelete={deleteNyuka} onUpdate={updateNyuka} onNyukazumi={handleNyukazumi}/>)}</div>
            }
            {showNyukaForm && (
              <div style={S.formBox}>
                <div style={S.formGrid}>
                  <div style={S.formGroup}><label style={S.label}>品目</label><input style={S.input} value={nName} onChange={e=>setNName(e.target.value)} placeholder="例：カツオ…"/></div>
                  <div style={S.formGroup}><label style={S.label}>数量</label><input style={S.input} value={nQty} onChange={e=>setNQty(e.target.value)} placeholder="例：20kg"/></div>
                  <div style={S.formGroup}><label style={S.label}>入荷日</label><input type="date" style={S.input} value={nDate} onChange={e=>setNDate(e.target.value)}/></div>
                  <div style={S.formGroup}>
                    <label style={S.label}>受取場所</label>
                    <select style={S.select} value={nPlace} onChange={e=>setNPlace(e.target.value)}>
                      <option value="">選択してください</option>
                      <option value="市場">市場</option>
                      <option value="ヤマト">ヤマト</option>
                    </select>
                  </div>
                  <div style={S.formGroup}><label style={S.label}>仕入れ値（円）</label><input type="number" style={S.input} value={nBuy} onChange={e=>setNBuy(e.target.value)} placeholder="0"/></div>
                  <div style={{alignSelf:"flex-end"}}><button style={S.btnPrimary} onClick={addNyuka}>追加する</button></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 新規開拓 */}
        {tab === "kaitaku" && (
          <div>
            <div style={S.sectionHead}>
              <div style={S.sectionTitle}>新規開拓</div>
              <button style={S.btnPrimary} onClick={() => setShowKaitakuForm(v => !v)}>＋ 追加</button>
            </div>
            {kaitaku.length === 0
              ? <div style={S.empty}><p>新規開拓メモなし</p></div>
              : <div style={S.cardGrid}>{kaitaku.map(item => <KaitakuCard key={item.id} item={item} onDelete={deleteKaitaku} onUpdate={updateKaitaku}/>)}</div>
            }
            {showKaitakuForm && (
              <div style={S.formBox}>
                <div style={S.formGrid}>
                  <div style={S.formGroup}><label style={S.label}>仕入先・品目</label><input style={S.input} value={kTitle} onChange={e=>setKTitle(e.target.value)} placeholder="例：淡路島たまねぎ"/></div>
                  <div style={S.formGroup}><label style={S.label}>URL</label><input type="url" style={S.input} value={kUrl} onChange={e=>setKUrl(e.target.value)} placeholder="https://..."/></div>
                  <div style={{...S.formGroup, gridColumn:"span 2"}}><label style={S.label}>メモ・詳細</label><textarea style={S.textarea} value={kMemo} onChange={e=>setKMemo(e.target.value)} placeholder="産地、特徴、連絡先、価格感など…"/></div>
                  <div style={{alignSelf:"flex-end"}}><button style={S.btnPrimary} onClick={addKaitaku}>追加する</button></div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* 販売済み */}
{tab === "sold" && (
  <div>
    <div style={S.sectionHead}>
      <div style={S.sectionTitle}>販売済み</div>
    </div>

    {sold.length === 0
      ? <div style={S.empty}><div style={{fontSize:48,opacity:.4}}>✅</div><p>販売済みデータなし</p></div>
      : <div style={S.cardGrid}>{sold.map(item => <SoldCard key={item.id} item={item} />)}</div>
    }
  </div>
)}
      </div>
    </div>
  );
}