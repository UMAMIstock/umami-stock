import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ---- テーマ ----
const T = {
  green: "#51682a",
  bg: "#ffffff",
  panel: "#f0f0e9",
  card: "#ffffff",
  qty: "#86956a",
  ageFresh: "#7eae53",
  ageMid: "#a09545",
  ageOld: "#e56228",
  textMain: "#51682a",
  textSub: "#86956a",
  textMuted: "#8f967c",
  border: "rgba(81,104,42,0.35)",
  softBorder: "rgba(81,104,42,0.16)",
};

// ---- Supabase REST API ----
async function sbFetch(table, options = {}) {
  const { method = "GET", body, params = "" } = options;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

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

// ---- DB行 → React state変換 ----
const toZaiko = r => ({
  id: r.id,
  name: r.name,
  qty: r.qty || "",
  buy: r.buy || 0,
  sell: r.sell || 0,
  buyDate: r.buy_date || "",
});

const toNyuka = r => ({
  id: r.id,
  name: r.name,
  qty: r.qty || "",
  date: r.date || "",
  place: r.place || "",
  buy: r.buy || 0,
});

const toKaitaku = r => ({
  id: r.id,
  title: r.title,
  memo: r.memo || "",
  url: r.url || "",
});

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const base = new Date(dateStr);
  base.setHours(0, 0, 0, 0);

  const diff = Math.round((today - base) / 86400000);

  let color = T.ageFresh;
  if (diff >= 7) color = T.ageOld;
  else if (diff >= 3) color = T.ageMid;

  let label;
  if (diff <= 0) label = "本日入荷";
  else if (diff === 1) label = "前日入荷";
  else if (diff === 2) label = "二日前";
  else if (diff === 7) label = "一週間前";
  else label = `${diff}日前`;

  return { label, color };
}

function daysLeft(dateStr) {
  if (!dateStr) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const base = new Date(dateStr);
  base.setHours(0, 0, 0, 0);

  const diff = Math.round((base - today) / 86400000);

  let color = T.ageFresh;
  let label;

  if (diff < 0) {
    color = T.ageOld;
    label = "期日超過";
  } else if (diff === 0) {
    color = T.ageFresh;
    label = "今日着";
  } else if (diff === 1) {
    color = T.ageFresh;
    label = "明日着";
  } else if (diff === 2) {
    color = T.ageFresh;
    label = "二日後着";
  } else if (diff <= 6) {
    color = T.ageMid;
    label = `${diff}日後着`;
  } else {
    color = T.textMuted;
    label = `${diff}日後着`;
  }

  return { label, color };
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function parseQty(qtyStr) {
  const match = String(qtyStr || "").trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  return {
    num: parseFloat(match[1]),
    unit: match[2].trim(),
  };
}

function getQtyNumber(qtyStr) {
  const match = String(qtyStr || "").trim().match(/(\d+(?:\.\d+)?)/);
  if (!match) return 1;

  return parseFloat(match[1]) || 1;
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

function addQty(currentQty, restoreQty) {
  const current = parseQty(currentQty);
  const restore = parseQty(restoreQty);

  if (!current || !restore) return currentQty || restoreQty;
  if (current.unit !== restore.unit) return currentQty || restoreQty;

  const total = current.num + restore.num;
  return `${total}${current.unit}`;
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return getMonthKey(d) === getMonthKey(new Date());
}

function getThisWeekRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;

  const d = new Date(dateStr);
  const { monday, sunday } = getThisWeekRange();

  return d >= monday && d <= sunday;
}

function calcSoldSummary(items, mode) {
  const filtered = items.filter(item => {
    if (mode === "week") return isThisWeek(item.soldDate);
    return isThisMonth(item.soldDate);
  });

  return filtered.reduce(
    (acc, item) => {
      acc.sales += Number(item.sell || 0);
      acc.profit += Number(item.profit || 0);
      acc.count += 1;
      return acc;
    },
    { sales: 0, profit: 0, count: 0 }
  );
}

// ---- スタイル定数 ----
const S = {
  body: {
    background: T.bg,
    minHeight: "100vh",
    fontFamily: "'Noto Sans JP', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    color: T.textMain,
    padding: "26px 16px 16px",
    boxSizing: "border-box",
  },

  appShell: {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
  },

  header: {
    background: "transparent",
    borderBottom: "none",
    padding: "0 4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  logoImg: {
    display: "block",
    width: 185,
    maxWidth: "72vw",
    height: "auto",
  },

  syncText: {
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },

  tabs: {
    display: "flex",
    gap: 4,
    padding: 0,
    marginBottom: 18,
  },

  tab: active => ({
    flex: "1 1 0",
    minWidth: 0,
    height: 36,
    padding: "0 8px",
    borderRadius: 999,
    border: `1.5px solid ${T.green}`,
    background: active ? T.green : T.card,
    color: active ? "#fff" : T.green,
    fontSize: 15,
    fontWeight: 400,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    letterSpacing: "0.03em",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    boxSizing: "border-box",
  }),

  content: {
    background: T.panel,
    border: "none",
    margin: 0,
    borderRadius: 44,
    padding: "22px 18px 26px",
    minHeight: "calc(100vh - 150px)",
    boxSizing: "border-box",
  },

  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 21,
    padding: "0 16px",
  },

  sectionTitle: {
    fontSize: 30,
    fontWeight: 600,
    color: T.green,
    letterSpacing: "0.02em",
    lineHeight: 1.1,
  },

  btnAddCircle: {
    width: 25,
    height: 25,
    borderRadius: "50%",
    border: "none",
    background: T.green,
    color: "#fff",
    fontSize: 18,
    fontWeight: 400,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: "46px",
    fontFamily: "Arial, system-ui, sans-serif",
  },

  plusIcon: {
    display: "block",
    transform: "translateY(-1px)",
    lineHeight: 1,
  },

  btnPrimary: {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "12px 18px",
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: T.green,
    color: "#fff",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  },

  btnEdit: {
    width: "100%",
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 999,
    border: `1.5px solid ${T.softBorder}`,
    background: "rgba(255,255,255,0.55)",
    color: T.green,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  },

  btnDel: {
    width: "100%",
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 999,
    border: "1.5px solid rgba(229,98,40,0.28)",
    background: "rgba(229,98,40,0.08)",
    color: T.ageOld,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  },

  btnNyuka: {
    width: "100%",
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 999,
    border: `1.5px solid ${T.softBorder}`,
    background: "rgba(81,104,42,0.08)",
    color: T.green,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  },

  btnUrl: {
    display: "block",
    width: "100%",
    textAlign: "center",
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 999,
    border: `1.5px solid ${T.softBorder}`,
    background: "rgba(81,104,42,0.06)",
    color: T.green,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    boxSizing: "border-box",
  },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
  },

  card: {
    background: T.card,
    border: "none",
    borderRadius: 28,
    overflow: "hidden",
    width: "100%",
    boxSizing: "border-box",
  },

  cardMain: {
    padding: "16px 16px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 5,
  },

  cardName: {
    fontSize: 17,
    fontWeight: 500,
    color: T.green,
    lineHeight: 1.35,
    letterSpacing: "0.01em",
    wordBreak: "break-word",
  },

  cardQty: {
    fontSize: 15,
    fontWeight: 500,
    color: T.qty,
    letterSpacing: "0.02em",
  },

  cardSubText: {
    fontSize: 15,
    fontWeight: 500,
    color: T.textSub,
    lineHeight: 1.5,
  },

  cardArrow: open => ({
    width: 25,
    height: 25,
    borderRadius: "50%",
    background: T.green,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    fontWeight: 400,
    flexShrink: 0,
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .2s ease",
    lineHeight: 1,
  }),

  cardDetail: {
    borderTop: `none`,
    padding: "14px 18px 18px",
  },

  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: "8px 0",
    fontSize: 14,
    borderBottom: "1px solid rgba(81,104,42,0.10)",
  },

  dk: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },

  dv: {
    fontWeight: 500,
    color: T.green,
    textAlign: "right",
    wordBreak: "break-word",
  },

  formBox: {
    background: T.card,
    border: "none",
    borderRadius: 28,
    padding: 20,
    marginTop: 0,
    boxSizing: "border-box",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  },

  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  label: {
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    letterSpacing: "0.08em",
  },

  input: {
    background: "#fff",
    border: `1.5px solid ${T.softBorder}`,
    color: T.green,
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 16,
    lineHeight: "22px",
    height: 46,
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    outline: "none",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    appearance: "none",
  },

  textarea: {
    background: "#fff",
    border: `1.5px solid ${T.softBorder}`,
    color: T.green,
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 16,
    lineHeight: "22px",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    outline: "none",
    width: "100%",
    maxWidth: "100%",
    minHeight: 90,
    resize: "vertical",
    boxSizing: "border-box",
  },

  select: {
    background: "#fff",
    border: `1.5px solid ${T.softBorder}`,
    color: T.green,
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 16,
    lineHeight: "22px",
    height: 46,
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    outline: "none",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
  },

  editInline: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },

  editInput: {
    padding: "10px 13px",
    fontSize: 16,
    lineHeight: "22px",
    minHeight: 44,
    borderRadius: 15,
    border: `1.5px solid ${T.softBorder}`,
    background: "#fff",
    color: T.green,
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    appearance: "none",
  },

  editBtns: {
    display: "flex",
    gap: 8,
  },

  editSave: {
    flex: 1,
    padding: "10px 8px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    background: T.green,
    color: "#fff",
    border: "none",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  },

  editCancel: {
    flex: 1,
    padding: "10px 8px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    background: "rgba(255,255,255,0.65)",
    color: T.textMuted,
    border: `1.5px solid ${T.softBorder}`,
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  },

  empty: {
    textAlign: "center",
    padding: "58px 20px",
    color: T.textMuted,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    fontWeight: 500,
  },

  profitPos: {
    color: T.ageFresh,
    fontWeight: 500,
  },

  profitNeg: {
    color: T.ageOld,
    fontWeight: 500,
  },

  summaryBox: {
    background: T.card,
    border: "none",
    borderRadius: 28,
    padding: 18,
    marginBottom: 16,
  },

  summaryTabs: {
    display: "flex",
    gap: 5,
    marginBottom: 14,
  },

  summaryTab: active => ({
    flex: 1,
    padding: "10px 12px",
    borderRadius: 999,
    border: `1.5px solid ${T.green}`,
    background: active ? T.green : T.card,
    color: active ? "#fff" : T.green,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  }),

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  summaryItem: {
    background: T.bg,
    borderRadius: 22,
  },

  summaryLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    marginBottom: 5,
  },

  summaryValue: {
    fontSize: 20,
    fontWeight: 500,
    color: T.green,
  },
};

// ---- 汎用カードコンポーネント ----
function StockCard({ mainContent, subContent, detailContent }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...S.card, ...(open ? S.cardOpen : {}) }}>
      <div style={S.cardMain} onClick={() => setOpen(o => !o)}>
        <div style={{ width: "100%" }}>
          {mainContent}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {subContent}
          </div>

          <span style={S.cardArrow(open)}>↓</span>
        </div>
      </div>

      {open && <div style={S.cardDetail}>{detailContent}</div>}
    </div>
  );
}

// ---- 在庫カード ----
function ZaikoCard({ item, onDelete, onUpdate, onSold }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [buy, setBuy] = useState(item.buy);
  const [sell, setSell] = useState(item.sell);
  const [buyDate, setBuyDate] = useState(item.buyDate);
  const [selling, setSelling] = useState(false);
  const [soldQty, setSoldQty] = useState(item.qty);
  const [soldSell, setSoldSell] = useState(item.sell);
  const [soldDate, setSoldDate] = useState(new Date().toISOString().slice(0, 10));

  const profit = (item.sell || 0) - (item.buy || 0);
  const ds = daysSince(item.buyDate);

  const handleSave = async () => {
    await onUpdate(item.id, {
      name,
      qty,
      buy: parseFloat(buy) || 0,
      sell: parseFloat(sell) || 0,
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
        <div style={{ display: "flex", alignItems: "center", gap: 23, overflow: "hidden" }}>
          <span style={S.cardQty}>{item.qty || "—"}</span>
          {ds && (
            <span style={{ fontSize: 15, color: ds.color, fontWeight: 500, whiteSpace: "nowrap" }}>
              {ds.label}
            </span>
          )}
        </div>
      }
      detailContent={
        <>
          {[
            ["仕入れ単価", item.buy ? `¥${Number(item.buy).toLocaleString()}` : "—"],
            ["販売単価", item.sell ? `¥${Number(item.sell).toLocaleString()}` : "—"],
            [
              "粗利",
              item.buy || item.sell ? (
                <span style={profit > 0 ? S.profitPos : profit < 0 ? S.profitNeg : {}}>
                  {profit >= 0 ? "+¥" : "¥"}{Number(profit).toLocaleString()}
                </span>
              ) : "—",
            ],
          ].map(([k, v], i, a) => (
            <div key={k} style={{ ...S.detailRow, borderBottom: i === a.length - 1 ? "none" : undefined }}>
              <span style={S.dk}>{k}</span>
              <span style={S.dv}>{v}</span>
            </div>
          ))}

          {editing ? (
            <div style={S.editInline}>
              <input style={S.editInput} value={name} onChange={e => setName(e.target.value)} placeholder="品目" />
              <input style={S.editInput} value={qty} onChange={e => setQty(e.target.value)} placeholder="数量" />
              <input style={S.editInput} value={buy} onChange={e => setBuy(e.target.value)} type="number" placeholder="仕入れ単価" />
              <input style={S.editInput} value={sell} onChange={e => setSell(e.target.value)} type="number" placeholder="販売単価" />
              <input style={S.editInput} value={buyDate} onChange={e => setBuyDate(e.target.value)} type="date" />
              <div style={S.editBtns}>
                <button style={S.editSave} onClick={handleSave}>保存</button>
                <button style={S.editCancel} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={S.btnEdit} onClick={() => setEditing(true)}>編集</button>
          )}

          {selling ? (
            <div style={S.editInline}>
              <input
                style={S.editInput}
                value={soldQty}
                onChange={e => setSoldQty(e.target.value)}
                placeholder="販売数量 例：1kg"
              />
              <input
                style={S.editInput}
                value={soldSell}
                onChange={e => setSoldSell(e.target.value)}
                type="number"
                placeholder="販売単価"
              />
              <input
                style={S.editInput}
                value={soldDate}
                onChange={e => setSoldDate(e.target.value)}
                type="date"
              />
              <div style={S.editBtns}>
                <button
                  style={S.editSave}
                  onClick={() => onSold(item, { qty: soldQty, sell: parseFloat(soldSell) || 0, soldDate })}
                >
                  販売済みにする
                </button>
                <button style={S.editCancel} onClick={() => setSelling(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={S.btnNyuka} onClick={() => setSelling(true)}>販売済み</button>
          )}

          <button style={S.btnDel} onClick={() => onDelete(item.id)}>削除</button>
        </>
      }
    />
  );
}

// ---- 入荷予定カード ----
function NyukaCard({ item, onDelete, onUpdate, onNyukazumi }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [date, setDate] = useState(item.date);
  const [place, setPlace] = useState(item.place);
  const [buy, setBuy] = useState(item.buy);
  const dl = daysLeft(item.date);

  const handleSave = async () => {
    await onUpdate(item.id, {
      name,
      qty,
      date,
      place,
      buy: parseFloat(buy) || 0,
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
        <div style={{ display: "flex", alignItems: "center", gap: 18, overflow: "hidden" }}>
          <span style={S.cardQty}>{item.qty || "—"}</span>
          {dl && (
            <span style={{ fontSize: 15, color: dl.color, fontWeight: 500, whiteSpace: "nowrap" }}>
              {dl.label}
            </span>
          )}
        </div>
      }
      detailContent={
        <>
          {[
            ["入荷日", formatDate(item.date)],
            [
              "受取場所",
              item.place === "市場"
                ? "尼崎市場"
                : item.place === "ヤマト"
                  ? "ヤマト"
                  : item.place === "佐川"
                    ? "佐川"
                    : item.place || "—",
            ],
            ["仕入れ単価", item.buy ? `¥${Number(item.buy).toLocaleString()}` : "—"],
          ].map(([k, v], i, a) => (
            <div key={k} style={{ ...S.detailRow, borderBottom: i === a.length - 1 ? "none" : undefined }}>
              <span style={S.dk}>{k}</span>
              <span style={S.dv}>{v}</span>
            </div>
          ))}

          {editing ? (
            <div style={S.editInline}>
              <input style={S.editInput} value={name} onChange={e => setName(e.target.value)} placeholder="品目" />
              <input style={S.editInput} value={qty} onChange={e => setQty(e.target.value)} placeholder="数量" />
              <input style={S.editInput} value={date} onChange={e => setDate(e.target.value)} type="date" />
              <select style={S.editInput} value={place} onChange={e => setPlace(e.target.value)}>
                <option value="市場">尼崎市場</option>
                <option value="ヤマト">ヤマト営業所</option>
                <option value="佐川">佐川営業所</option>
              </select>
              <input style={S.editInput} value={buy} onChange={e => setBuy(e.target.value)} type="number" placeholder="仕入れ単価" />
              <div style={S.editBtns}>
                <button style={S.editSave} onClick={handleSave}>保存</button>
                <button style={S.editCancel} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={S.btnEdit} onClick={() => setEditing(true)}>編集</button>
          )}

          <button style={S.btnNyuka} onClick={() => onNyukazumi(item)}>入荷済み</button>
          <button style={S.btnDel} onClick={() => onDelete(item.id)}>削除</button>
        </>
      }
    />
  );
}

// ---- 新規開拓カード ----
function KaitakuCard({ item, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [memo, setMemo] = useState(item.memo);
  const [url, setUrl] = useState(item.url);

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
        <div
          style={{
            fontSize: 15,
            color: T.textSub,
            fontWeight: 500,
            lineHeight: 1.5,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.memo || item.url || "詳細なし"}
        </div>
      }
      detailContent={
        <>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" style={S.btnUrl}>
              サイトを開く
            </a>
          )}

          {editing ? (
            <div style={S.editInline}>
              <input style={S.editInput} value={title} onChange={e => setTitle(e.target.value)} placeholder="仕入先・品目" />
              <input style={S.editInput} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
              <textarea style={{ ...S.editInput, minHeight: 70, resize: "vertical" }} value={memo} onChange={e => setMemo(e.target.value)} placeholder="メモ" />
              <div style={S.editBtns}>
                <button style={S.editSave} onClick={handleSave}>保存</button>
                <button style={S.editCancel} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button style={{ ...S.btnEdit, marginTop: item.url ? 10 : 12 }} onClick={() => setEditing(true)}>編集</button>
          )}

          <button style={S.btnDel} onClick={() => onDelete(item.id)}>削除</button>
        </>
      }
    />
  );
}

// ---- 販売済みカード ----
function SoldCard({ item, onDelete, onRestore }) {
  return (
    <StockCard
      mainContent={
        <div style={{ ...S.cardName, textAlign: "left", width: "100%" }}>
          {item.name}
        </div>
      }
      subContent={
        <div style={{ display: "flex", alignItems: "center", gap: 18, overflow: "hidden" }}>
          <span style={S.cardQty}>{item.qty || "—"}</span>
          <span style={{ fontSize: 15, color: T.textSub, fontWeight: 500, whiteSpace: "nowrap" }}>
            {formatDate(item.soldDate)}
          </span>
        </div>
      }
      detailContent={
        <>
          {[
            ["商品名", item.name || "—"],
            ["数量", item.qty || "—"],
            ["仕入原価", item.buy ? `¥${Number(item.buy).toLocaleString()}` : "—"],
            ["売上", item.sell ? `¥${Number(item.sell).toLocaleString()}` : "—"],
            [
              "粗利",
              <span style={item.profit > 0 ? S.profitPos : item.profit < 0 ? S.profitNeg : {}}>
                {item.profit >= 0 ? "+¥" : "¥"}{Number(item.profit).toLocaleString()}
              </span>,
            ],
            ["販売日", formatDate(item.soldDate)],
          ].map(([k, v], i, a) => (
            <div key={k} style={{ ...S.detailRow, borderBottom: i === a.length - 1 ? "none" : undefined }}>
              <span style={S.dk}>{k}</span>
              <span style={S.dv}>{v}</span>
            </div>
          ))}

          <button style={S.btnNyuka} onClick={() => onRestore(item)}>
            在庫に戻す
          </button>
          <button style={S.btnDel} onClick={() => onDelete(item.id)}>
            削除
          </button>
        </>
      }
    />
  );
}

// ---- メインアプリ ----
export default function App() {
  const [tab, setTab] = useState("zaiko");
  const [zaiko, setZaiko] = useState([]);
  const [nyuka, setNyuka] = useState([]);
  const [kaitaku, setKaitaku] = useState([]);
  const [sold, setSold] = useState([]);
  const [soldSummaryMode, setSoldSummaryMode] = useState("month");

  const [syncMsg, setSyncMsg] = useState("読み込み中...");
  const [syncColor, setSyncColor] = useState(T.textMuted);

  const [showZaikoForm, setShowZaikoForm] = useState(false);
  const [showNyukaForm, setShowNyukaForm] = useState(false);
  const [showKaitakuForm, setShowKaitakuForm] = useState(false);

  const [zName, setZName] = useState("");
  const [zQty, setZQty] = useState("");
  const [zBuy, setZBuy] = useState("");
  const [zSell, setZSell] = useState("");
  const [zDate, setZDate] = useState("");

  const [nName, setNName] = useState("");
  const [nQty, setNQty] = useState("");
  const [nDate, setNDate] = useState("");
  const [nPlace, setNPlace] = useState("");
  const [nBuy, setNBuy] = useState("");

  const [kTitle, setKTitle] = useState("");
  const [kMemo, setKMemo] = useState("");
  const [kUrl, setKUrl] = useState("");

  const showSync = useCallback((msg, color, auto = true) => {
    setSyncMsg(msg);
    setSyncColor(color);
    if (auto) setTimeout(() => setSyncMsg(""), 2500);
  }, []);

  const loadAll = useCallback(async () => {
    showSync("読み込み中...", T.textMuted, false);

    try {
      const [z, n, k, s] = await Promise.all([
        sbFetch("zaiko", { params: "?order=id.asc" }),
        sbFetch("nyuka", { params: "?order=date.asc" }),
        sbFetch("kaitaku", { params: "?order=id.asc" }),
        sbFetch("sold", { params: "?order=sold_date.desc" }),
      ]);

      setZaiko(z.map(toZaiko));
      setNyuka(n.map(toNyuka));
      setKaitaku(k.map(toKaitaku));
      setSold(s.map(toSold));

      showSync("✓ 同期済み", T.ageFresh);
    } catch (e) {
      showSync("⚠ 読み込み失敗: " + e.message, T.ageOld, false);
    }
  }, [showSync]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ---- 在庫CRUD ----
  const addZaiko = async () => {
    if (!zName.trim()) return alert("品目を入力してください");

    showSync("保存中...", T.textMuted, false);

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

      setZName("");
      setZQty("");
      setZBuy("");
      setZSell("");
      setZDate("");
      setShowZaikoForm(false);
      await loadAll();
    } catch (e) {
      showSync("⚠ 保存失敗: " + e.message, T.ageOld, false);
    }
  };

  const deleteZaiko = async id => {
    if (!confirm("削除しますか？")) return;

    showSync("削除中...", T.textMuted, false);

    try {
      await sbFetch("zaiko", { method: "DELETE", params: `?id=eq.${id}` });
      await loadAll();
    } catch (e) {
      showSync("⚠ 削除失敗", T.ageOld, false);
    }
  };

  const updateZaiko = async (id, data) => {
    showSync("保存中...", T.textMuted, false);

    try {
      await sbFetch("zaiko", {
        method: "PATCH",
        params: `?id=eq.${id}`,
        body: data,
      });
      await loadAll();
    } catch (e) {
      showSync("⚠ 保存失敗: " + e.message, T.ageOld, false);
    }
  };

  const handleSold = async (item, sale) => {
    if (!sale.qty.trim()) return alert("販売数量を入力してください");
    if (!confirm(`「${item.name}」を販売済みにしますか？`)) return;

    showSync("販売処理中...", T.textMuted, false);

    try {
      const soldQtyNum = getQtyNumber(sale.qty);

      const buyUnitPrice = Number(item.buy || 0);
      const sellUnitPrice = Number(sale.sell || item.sell || 0);

      const sales = sellUnitPrice * soldQtyNum;
      const cost = buyUnitPrice * soldQtyNum;
      const profit = sales - cost;

      const remainingQty = subtractQty(item.qty, sale.qty);

      await sbFetch("sold", {
        method: "POST",
        body: {
          id: Date.now(),
          source_id: item.id,
          name: item.name,
          qty: sale.qty,
          buy: cost,
          sell: sales,
          profit,
          sold_date: sale.soldDate || new Date().toISOString().slice(0, 10),
        },
      });

      if (!remainingQty) {
        await sbFetch("zaiko", {
          method: "DELETE",
          params: `?id=eq.${item.id}`,
        });
      } else {
        await sbFetch("zaiko", {
          method: "PATCH",
          params: `?id=eq.${item.id}`,
          body: { qty: remainingQty },
        });
      }

      setTab("sold");
      await loadAll();
    } catch (e) {
      showSync("⚠ 販売処理失敗: " + e.message, T.ageOld, false);
    }
  };

  // ---- 入荷予定CRUD ----
  const addNyuka = async () => {
    if (!nName.trim()) return alert("品目を入力してください");
    if (!nPlace) return alert("受取場所を選択してください");

    showSync("保存中...", T.textMuted, false);

    try {
      await sbFetch("nyuka", {
        method: "POST",
        body: {
          id: Date.now(),
          name: nName,
          qty: nQty,
          date: nDate,
          place: nPlace,
          buy: parseFloat(nBuy) || 0,
        },
      });

      setNName("");
      setNQty("");
      setNDate("");
      setNPlace("");
      setNBuy("");
      setShowNyukaForm(false);
      await loadAll();
    } catch (e) {
      showSync("⚠ 保存失敗: " + e.message, T.ageOld, false);
    }
  };

  const deleteNyuka = async id => {
    if (!confirm("削除しますか？")) return;

    showSync("削除中...", T.textMuted, false);

    try {
      await sbFetch("nyuka", { method: "DELETE", params: `?id=eq.${id}` });
      await loadAll();
    } catch (e) {
      showSync("⚠ 削除失敗", T.ageOld, false);
    }
  };

  const updateNyuka = async (id, data) => {
    showSync("保存中...", T.textMuted, false);

    try {
      await sbFetch("nyuka", {
        method: "PATCH",
        params: `?id=eq.${id}`,
        body: data,
      });
      await loadAll();
    } catch (e) {
      showSync("⚠ 保存失敗: " + e.message, T.ageOld, false);
    }
  };

  const handleNyukazumi = async item => {
    if (!confirm("入荷済みにしますか？")) return;

    showSync("処理中...", T.textMuted, false);

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

      await sbFetch("nyuka", {
        method: "DELETE",
        params: `?id=eq.${item.id}`,
      });

      await loadAll();
    } catch (e) {
      showSync("⚠ 処理失敗: " + e.message, T.ageOld, false);
    }
  };

  // ---- 新規開拓CRUD ----
  const addKaitaku = async () => {
    if (!kTitle.trim()) return alert("仕入先・品目を入力してください");

    showSync("保存中...", T.textMuted, false);

    try {
      await sbFetch("kaitaku", {
        method: "POST",
        body: {
          id: Date.now(),
          title: kTitle,
          memo: kMemo,
          url: kUrl,
        },
      });

      setKTitle("");
      setKMemo("");
      setKUrl("");
      setShowKaitakuForm(false);
      await loadAll();
    } catch (e) {
      showSync("⚠ 保存失敗: " + e.message, T.ageOld, false);
    }
  };

  const deleteKaitaku = async id => {
    if (!confirm("削除しますか？")) return;

    showSync("削除中...", T.textMuted, false);

    try {
      await sbFetch("kaitaku", { method: "DELETE", params: `?id=eq.${id}` });
      await loadAll();
    } catch (e) {
      showSync("⚠ 削除失敗", T.ageOld, false);
    }
  };

  const updateKaitaku = async (id, data) => {
    showSync("保存中...", T.textMuted, false);

    try {
      await sbFetch("kaitaku", {
        method: "PATCH",
        params: `?id=eq.${id}`,
        body: data,
      });
      await loadAll();
    } catch (e) {
      showSync("⚠ 保存失敗: " + e.message, T.ageOld, false);
    }
  };

  // ---- 販売済みCRUD ----
  const deleteSold = async id => {
    if (!confirm("販売済みデータを削除しますか？")) return;

    showSync("削除中...", T.textMuted, false);

    try {
      await sbFetch("sold", {
        method: "DELETE",
        params: `?id=eq.${id}`,
      });

      await loadAll();
    } catch (e) {
      showSync("⚠ 削除失敗: " + e.message, T.ageOld, false);
    }
  };

  const restoreSold = async item => {
    if (!confirm(`「${item.name}」を在庫に戻しますか？`)) return;

    showSync("在庫に戻しています...", T.textMuted, false);

    try {
      const qtyNum = getQtyNumber(item.qty);

      const buyUnitPrice = qtyNum ? Number(item.buy || 0) / qtyNum : 0;
      const sellUnitPrice = qtyNum ? Number(item.sell || 0) / qtyNum : 0;

      const existing = zaiko.find(z => {
        const sameSource = item.sourceId && z.id === item.sourceId;
        const sameName = z.name === item.name;
        const sameBuy = Number(z.buy || 0) === Number(buyUnitPrice || 0);
        const sameSell = Number(z.sell || 0) === Number(sellUnitPrice || 0);

        return sameSource || (sameName && sameBuy && sameSell);
      });

      if (existing) {
        const newQty = addQty(existing.qty, item.qty);

        await sbFetch("zaiko", {
          method: "PATCH",
          params: `?id=eq.${existing.id}`,
          body: {
            qty: newQty,
            buy: buyUnitPrice,
            sell: sellUnitPrice,
          },
        });
      } else {
        await sbFetch("zaiko", {
          method: "POST",
          body: {
            id: Date.now(),
            name: item.name,
            qty: item.qty,
            buy: buyUnitPrice,
            sell: sellUnitPrice,
            buy_date: new Date().toISOString().slice(0, 10),
          },
        });
      }

      await sbFetch("sold", {
        method: "DELETE",
        params: `?id=eq.${item.id}`,
      });

      setTab("zaiko");
      await loadAll();
    } catch (e) {
      showSync("⚠ 在庫戻し失敗: " + e.message, T.ageOld, false);
    }
  };

  return (
    <>
      <style>
        {`
          html, body, #root {
            margin: 0;
            min-height: 100%;
            background: ${T.bg};
          }

          * {
            box-sizing: border-box;
          }

          button,
          input,
          textarea,
          select {
            -webkit-tap-highlight-color: transparent;
          }
        `}
      </style>

      <div style={S.body}>
        <div style={S.appShell}>
          <header style={S.header}>
            <img src="/umami-logo.svg" alt="UMAMI stock" style={S.logoImg} />
            <span style={{ ...S.syncText, color: syncColor }}>{syncMsg}</span>
          </header>

          <div style={S.tabs}>
            {[
              ["zaiko", "在庫"],
              ["nyuka", "入荷予定"],
              ["kaitaku", "新規開拓"],
              ["sold", "販売済み"],
            ].map(([key, label]) => (
              <button key={key} style={S.tab(tab === key)} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          <div style={S.content}>
            {tab === "zaiko" && (
              <div>
                <div style={S.sectionHead}>
                  <div style={S.sectionTitle}>在庫</div>
                  <button style={S.btnAddCircle} onClick={() => setShowZaikoForm(v => !v)}>
                    ＋
                  </button>
                </div>

                {showZaikoForm ? (
                  <div style={S.formBox}>
                    <div style={S.formGrid}>
                      <div style={S.formGroup}>
                        <label style={S.label}>品目</label>
                        <input style={S.input} value={zName} onChange={e => setZName(e.target.value)} placeholder="例：鯛、トマト…" />
                      </div>
                      <div style={S.formGroup}>
                        <label style={S.label}>数量</label>
                        <input style={S.input} value={zQty} onChange={e => setZQty(e.target.value)} placeholder="例：10kg、5箱" />
                      </div>
                      <div style={S.formGroup}>
                        <label style={S.label}>仕入れ日</label>
                        <input type="date" style={S.input} value={zDate} onChange={e => setZDate(e.target.value)} />
                      </div>
                      <div style={S.formGroup}>
                        <label style={S.label}>仕入れ単価（円）</label>
                        <input type="number" style={S.input} value={zBuy} onChange={e => setZBuy(e.target.value)} placeholder="0" />
                      </div>
                      <div style={S.formGroup}>
                        <label style={S.label}>販売単価（円）</label>
                        <input type="number" style={S.input} value={zSell} onChange={e => setZSell(e.target.value)} placeholder="0" />
                      </div>
                      <button style={S.btnPrimary} onClick={addZaiko}>
                        追加する
                      </button>
                    </div>
                  </div>
                ) : zaiko.length === 0 ? (
                  <div style={S.empty}>
                    <p>在庫データなし</p>
                  </div>
                ) : (
                  <div style={S.cardGrid}>
                    {zaiko.map(item => (
                      <ZaikoCard
                        key={item.id}
                        item={item}
                        onDelete={deleteZaiko}
                        onUpdate={updateZaiko}
                        onSold={handleSold}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "nyuka" && (
              <div>
                <div style={S.sectionHead}>
                  <div style={S.sectionTitle}>入荷予定</div>
                  <button style={S.btnAddCircle} onClick={() => setShowNyukaForm(v => !v)}>
                    <span style={S.plusIcon}>＋</span>
                  </button>
                </div>

                {showNyukaForm ? (
                  <div style={S.formBox}>
                    <div style={S.formGrid}>
                      <div style={S.formGroup}>
                        <label style={S.label}>品目</label>
                        <input
                          style={S.input}
                          value={nName}
                          onChange={e => setNName(e.target.value)}
                          placeholder="例：とうもろこし…"
                        />
                      </div>

                      <div style={S.formGroup}>
                        <label style={S.label}>数量</label>
                        <input
                          style={S.input}
                          value={nQty}
                          onChange={e => setNQty(e.target.value)}
                          placeholder="例：50本"
                        />
                      </div>

                      <div style={S.formGroup}>
                        <label style={S.label}>入荷日</label>
                        <input
                          type="date"
                          style={S.input}
                          value={nDate}
                          onChange={e => setNDate(e.target.value)}
                        />
                      </div>

                      <div style={S.formGroup}>
                        <label style={S.label}>受取場所</label>
                        <select
                          style={S.select}
                          value={nPlace}
                          onChange={e => setNPlace(e.target.value)}
                        >
                          <option value="">選択してください</option>
                          <option value="市場">市場</option>
                          <option value="ヤマト">ヤマト</option>
                          <option value="佐川">佐川</option>
                        </select>
                      </div>

                      <div style={S.formGroup}>
                        <label style={S.label}>仕入れ単価（円）</label>
                        <input
                          type="number"
                          style={S.input}
                          value={nBuy}
                          onChange={e => setNBuy(e.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <button style={S.btnPrimary} onClick={addNyuka}>
                        追加する
                      </button>
                    </div>
                  </div>
                ) : nyuka.length === 0 ? (
                  <div style={S.empty}>
                    <p>入荷予定データなし</p>
                  </div>
                ) : (
                  <div style={S.cardGrid}>
                    {nyuka.map(item => (
                      <NyukaCard
                        key={item.id}
                        item={item}
                        onDelete={deleteNyuka}
                        onUpdate={updateNyuka}
                        onNyukazumi={handleNyukazumi}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "kaitaku" && (
              <div>
                <div style={S.sectionHead}>
                  <div style={S.sectionTitle}>新規開拓</div>
                  <button style={S.btnAddCircle} onClick={() => setShowKaitakuForm(v => !v)}>
                    <span style={S.plusIcon}>＋</span>
                  </button>
                </div>

                {showKaitakuForm ? (
                  <div style={S.formBox}>
                    <div style={S.formGrid}>
                      <div style={S.formGroup}>
                        <label style={S.label}>仕入先・品目</label>
                        <input
                          style={S.input}
                          value={kTitle}
                          onChange={e => setKTitle(e.target.value)}
                          placeholder="例：淡路島たまねぎ"
                        />
                      </div>

                      <div style={S.formGroup}>
                        <label style={S.label}>URL</label>
                        <input
                          type="url"
                          style={S.input}
                          value={kUrl}
                          onChange={e => setKUrl(e.target.value)}
                          placeholder="https://..."
                        />
                      </div>

                      <div style={S.formGroup}>
                        <label style={S.label}>メモ・詳細</label>
                        <textarea
                          style={S.textarea}
                          value={kMemo}
                          onChange={e => setKMemo(e.target.value)}
                          placeholder="産地、特徴、連絡先、価格感など…"
                        />
                      </div>

                      <button style={S.btnPrimary} onClick={addKaitaku}>
                        追加する
                      </button>
                    </div>
                  </div>
                ) : kaitaku.length === 0 ? (
                  <div style={S.empty}>
                    <p>新規開拓メモなし</p>
                  </div>
                ) : (
                  <div style={S.cardGrid}>
                    {kaitaku.map(item => (
                      <KaitakuCard
                        key={item.id}
                        item={item}
                        onDelete={deleteKaitaku}
                        onUpdate={updateKaitaku}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "sold" && (() => {
              const summary = calcSoldSummary(sold, soldSummaryMode);

              return (
                <div>
                  <div style={S.sectionHead}>
                    <div style={S.sectionTitle}>販売済み</div>
                    <button style={{ ...S.btnAddCircle, visibility: "hidden", pointerEvents: "none" }}>
                      +
                    </button>
                  </div>

                  <div style={S.summaryBox}>
                    <div style={S.summaryTabs}>
                      <button
                        style={S.summaryTab(soldSummaryMode === "month")}
                        onClick={() => setSoldSummaryMode("month")}
                      >
                        今月
                      </button>
                      <button
                        style={S.summaryTab(soldSummaryMode === "week")}
                        onClick={() => setSoldSummaryMode("week")}
                      >
                        今週
                      </button>
                    </div>

                    <div style={S.summaryGrid}>
                      <div style={S.summaryItem}>
                        <div style={S.summaryLabel}>
                          {soldSummaryMode === "month" ? "今月売上" : "今週売上"}
                        </div>
                        <div style={S.summaryValue}>
                          ¥{summary.sales.toLocaleString()}
                        </div>
                      </div>

                      <div style={S.summaryItem}>
                        <div style={S.summaryLabel}>
                          {soldSummaryMode === "month" ? "今月粗利" : "今週粗利"}
                        </div>
                        <div style={{ ...S.summaryValue, ...(summary.profit >= 0 ? S.profitPos : S.profitNeg) }}>
                          ¥{summary.profit.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {sold.length === 0 ? (
                    <div style={S.empty}>
                      <p>販売済みデータなし</p>
                    </div>
                  ) : (
                    <div style={S.cardGrid}>
                      {sold.map(item => (
                        <SoldCard
                          key={item.id}
                          item={item}
                          onDelete={deleteSold}
                          onRestore={restoreSold}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}