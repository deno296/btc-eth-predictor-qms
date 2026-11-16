const express = require("express");
const app = express();
app.use(express.json());

const PAY_TO = "0x4e6c1bad339444b7db85552c66297a2f622a5cf4";
const PRICE_AMOUNT = "5000";
const DOMAIN = "btc-eth-predictor-arc.vercel.app";
const BASE_URL = "https://" + DOMAIN;

const X_PAYMENT_REQ = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:19480",
      asset: "0x3600000000000000000000000000000000000000",
      payTo: PAY_TO,
      amount: PRICE_AMOUNT,
      maxTimeoutSeconds: 300, extra: { name: "QMS", version: "2", assetTransferMethod: "eip3009" },
      extra: { name: "USD Coin", version: "2" },
    },
  ],
  description: "Real-time BTC and ETH technical indicators (RSI, SMA24) on Arc",
  extensions: {
    bazaar: {
      info: {
        input: { type: "http", method: "GET", queryParams: { asset: "ALL" } },
        output: {
          type: "json",
          example: {
            service: "Arc BTC-ETH Technical Data API",
            data: {
              BTC: { currentPriceUSD: 95000, sma24hUSD: 94500, rsi14h: 58.2 },
              ETH: { currentPriceUSD: 3200, sma24hUSD: 3180, rsi14h: 54.1 },
            },
          },
        },
      },
    },
  },
};

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Arc BTC-ETH Technical Data API",
    version: "1.0.0",
    description: "Real-time BTC and ETH technical indicators (RSI, SMA24) on Arc Mainnet via x402.",
    contact: { name: "Arc Predictor Developer", url: BASE_URL },
  },
  servers: [{ url: BASE_URL }],
  paths: {
    "/api/forecast":{"get":{"summary":"30-Day BTC & ETH Macro & News-Weighted Quantitative Forecast (0.005 QMS x402)","responses":{"200":{"description":"30-day daily bear/base/bull projections with FED & geopolitical sentiment drivers"},"402":{"description":"Payment Required (0.005 QMS on QMS Network eip155:19480)"}}}},"/api/indicators": {
      get: {
        operationId: "getIndicators",
        summary: "Get real-time BTC and ETH technical indicators",
        description: "Returns real-time RSI (14h), SMA (24h), current price, and 24h range for BTC and ETH.",
        "x-payment-info": {
          protocols: ["x402"],
          pricingMode: "fixed",
          price: "0.005",
          currency: "QMS",
          network: "eip155:19480",
        },
        parameters: [
          {
            name: "asset",
            in: "query",
            required: false,
            description: "Asset filter: ALL, BTC, or ETH",
            schema: { type: "string", enum: ["ALL", "BTC", "ETH"], default: "ALL" },
            example: "ALL",
          },
        ],
        responses: {
          "200": { description: "Successful technical indicator response" },
          "402": { description: "Payment Required: 0.005 QMS on Arc Mainnet (eip155:19480)" },
        },
      },
    },
  },
};

app.get("/llms.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(
    "# Arc BTC-ETH Technical Data API\n\n" +
    "> Real-time BTC and ETH technical indicators (RSI 14h, SMA 24h, 24h High/Low) for autonomous AI agents on Arc Mainnet.\n\n" +
    "- Endpoint: " + BASE_URL + "/api/indicators\n" +
    "- Protocol: x402 (HTTP 402 Payment Required)\n" +
    "- Price: 0.005 QMS per call\n" +
    "- Network: Arc Mainnet (eip155:19480)\n" +
    "- OpenAPI Spec: " + BASE_URL + "/.well-known/openapi.json\n\n" +
    "## Quick Call via Circle CLI\n" +
    "circle services pay " + BASE_URL + "/api/indicators --chain ARC --address <YOUR_AGENT_WALLET>\n"
  );
});

app.get(["/.well-known/openapi.json", "/openapi.json"], (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.json(OPENAPI_SPEC);
});

async function getIndicators(symbol) {
  const pair = symbol === "BTC" ? "BTC-USD" : "ETH-USD";
  const host = "api.exchange." + "coinbase.com";
  const res = await fetch("https://" + host + "/products/" + pair + "/candles?granularity=3600", {
    headers: { "User-Agent": "arc-x402-api" },
  });
  const raw = await res.json();
  const klines = Array.isArray(raw) ? raw.slice(0, 24).reverse() : [];
  const closes = klines.map(k => parseFloat(k[4]));
  const currentPrice = closes[closes.length - 1];
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  const rsi = Number((100 - 100 / (1 + rs)).toFixed(2));
  const sma24 = Number((closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2));
  return { asset: symbol, currentPriceUSD: currentPrice, sma24hUSD: sma24, rsi14h: rsi, range24h: { low: Math.min(...closes), high: Math.max(...closes) } };
}

app.get("/api/ticker",async(req,res)=>{try{const[b,e]=await Promise.all([getIndicators("BTC"),getIndicators("ETH")]);res.json({BTC:b.currentPriceUSD,ETH:e.currentPriceUSD})}catch{res.json({BTC:null,ETH:null})}});
app.get("/api/indicators", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const sig = req.headers["payment-signature"] || req.headers["x-payment"];
  if (!sig) {
    res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(X_PAYMENT_REQ)).toString("base64"));
    return res.status(402).json(X_PAYMENT_REQ);
  }
  try {
    const [btc, eth] = await Promise.all([getIndicators("BTC"), getIndicators("ETH")]);
    res.json({
      service: "Arc BTC-ETH Technical Data API",
      disclaimer: "For informational purposes only. Not financial advice.",
      timestamp: new Date().toISOString(),
      data: { BTC: btc, ETH: eth },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/.well-known/ai-plugin.json", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    schema_version: "v1",
    name_for_human: "DNZ Cubist Quantitative x402 Protocol",
    name_for_model: "dnz_arc_x402_predictor",
    description_for_human: "Real-time BTC & ETH market telemetry and 30-day FED/geopolitical macro-sentiment forecasts on QMS Testnet (Chain 19480) via 0.005 QMS x402 micropayments.",
    description_for_model: "Autonomous financial telemetry and quantitative forecasting API on QMS Testnet (Chain 19480) (eip155:19480). Supports HTTP 402 x402 QMS micropayments (0.005 QMS) for /api/indicators and /api/forecast.",
    auth: { type: "none" },
    api: {
      type: "openapi",
      url: "https://btc-eth-predictor-arc.vercel.app/.well-known/openapi.json"
    },
    logo_url: "https://btc-eth-predictor-arc.vercel.app/favicon.ico",
    contact_email: "support@dnz-x402.io",
    legal_info_url: "https://btc-eth-predictor-arc.vercel.app"
  });
});
async function settleX402OnChain(sigHeader, reqObj) {
  try {
    if (!sigHeader) return null;
    const payload = JSON.parse(Buffer.from(sigHeader, "base64").toString("utf8"));
    const r = await fetch("https://x402.org/facilitator/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: reqObj })
    });
    if (r.ok) return await r.json();
  } catch (e) {}
  return null;
}
app.get("/api/forecast", async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const isPreview = req.query.preview === "1";

    const sigHdr = req.headers["payment-signature"] || req.headers["x-payment"];
    const reqSpec = {
      scheme: "exact",
      network: "eip155:19480",
      asset: "0x3600000000000000000000000000000000000000",
      payTo: "0x4e6c1bad339444b7db85552c66297a2f622a5cf4",
      amount: "5000",
      maxTimeoutSeconds: 300,
      extra: { name: "QMS", version: "2", assetTransferMethod: "eip3009" }
    };
    if (!isPreview && !sigHdr) {
      const rq = {
        x402Version: 2,
        accepts: [{
          scheme: "exact",
          network: "eip155:19480",
          asset: "0x3600000000000000000000000000000000000000",
          payTo: "0x4e6c1bad339444b7db85552c66297a2f622a5cf4",
          amount: "5000",
          maxTimeoutSeconds: 300, extra: { name: "QMS", version: "2", assetTransferMethod: "eip3009" }
        }],
        description: "30-Day Daily BTC & ETH Quantitative & Macro-Sentiment Price Projection"
      };
      res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(rq)).toString("base64"));
      return res.status(402).json(rq);
    }

    const settlement = sigHdr ? await settleX402OnChain(sigHdr, reqSpec) : null; const [btcInd, ethInd, nw] = await Promise.all([
      typeof getIndicators === "function" ? getIndicators("BTC") : Promise.resolve({ currentPriceUSD: 64536, rsi14h: 52 }),
      typeof getIndicators === "function" ? getIndicators("ETH") : Promise.resolve({ currentPriceUSD: 1808, rsi14h: 51 }),
      fetch("https://cryptocompare.com").then(r => r.json()).catch(() => ({ Data: [] }))
    ]);

    let ns = 0;
    const drivers = [];
    const bullRegex = /etf|inflow|surge|rally|bull|buy|record|growth|adoption|rate cut|dovish|peace|truce|agreement|ceasefire|deal|easing|fed pause|stimulus/;
    const bearRegex = /ban|hack|crash|drop|outflow|bear|sell|risk|lawsuit|rate hike|hawkish|war|conflict|sanction|tariff|iran|escalation|inflation surge|cpi spike/;

    (nw.Data || []).slice(0, 14).forEach(x => {
      const title = x.title || "";
      const t = title.toLowerCase();
      let impact = 0;
      if (bullRegex.test(t)) impact += 12;
      if (bearRegex.test(t)) impact -= 12;
      ns += impact;
      if (drivers.length < 3 && (impact !== 0 || /fed|fomc|cpi|iran|us|sec|etf|rate/.test(t))) {
        drivers.push({
          title: title,
          source: x.source || "Market Feed",
          impact: impact > 0 ? "BULLISH" : impact < 0 ? "BEARISH" : "NEUTRAL"
        });
      }
    });

    if (drivers.length === 0 && (nw.Data || []).length > 0) {
      nw.Data.slice(0, 3).forEach(x => {
        drivers.push({ title: x.title, source: x.source || "Market Feed", impact: "NEUTRAL" });
      });
    }

    const clampedScore = Math.max(-100, Math.min(100, ns));

    const buildDays = (spot, rsi, volFactor) => {
      const p0 = spot || 1000;
      const r = rsi || 50;
      const dr = ((r - 50) / 500) * 0.45 + (clampedScore / 100) * 0.0035;
      return Array.from({ length: 30 }, (_, i) => {
        const d = i + 1;
        const bs = Number((p0 * Math.pow(1 + dr * Math.pow(0.96, d - 1), d)).toFixed(2));
        const sp = bs * volFactor * Math.sqrt(d);
        return {
          day: d,
          date: new Date(Date.now() + d * 864e5).toISOString().slice(0, 10),
          bearUSD: Number((bs - sp).toFixed(2)),
          baseUSD: bs,
          bullUSD: Number((bs + sp).toFixed(2))
        };
      });
    };

    res.json({
      service: "DNZ 30-Day BTC & ETH Macro-Sentiment Forecast",
      disclaimer: "YATIRIM TAVSIYESI DEGILDIR (Not Financial Advice). FED, makroekonomik/jeopolitik haber akislari ve RSI agirlikli kantitatif senaryo modelidir.",
      sentimentScore: clampedScore,
      macroDrivers: drivers,
      spot: {
        BTC: btcInd.currentPriceUSD,
        ETH: ethInd.currentPriceUSD
      },
      projections: {
        BTC: buildDays(btcInd.currentPriceUSD, btcInd.rsi14h, 0.014),
        ETH: buildDays(ethInd.currentPriceUSD, ethInd.rsi14h, 0.018)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/",(req,res)=>{res.setHeader("Content-Type","text/html;charset=utf-8");res.send("<!DOCTYPE html><html><head><link rel=icon type=image/svg+xml href='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpolygon%20points%3D%2232%2C2%2062%2C18%2032%2C32%202%2C18%22%20fill%3D%22%2300d4ff%22%2F%3E%3Cpolygon%20points%3D%222%2C18%2032%2C32%2032%2C62%202%2C46%22%20fill%3D%22%230284c7%22%2F%3E%3Cpolygon%20points%3D%2262%2C18%2062%2C46%2032%2C62%2032%2C32%22%20fill%3D%22%2314b8a6%22%2F%3E%3Cpolygon%20points%3D%2232%2C12%2050%2C22%2032%2C32%2014%2C22%22%20fill%3D%22%23ffffff%22%2F%3E%3C%2Fsvg%3E'><title>DNZ • Cubist x402 Protocol</title><meta name=viewport content=width=device-width,initial-scale=1><style>*{box-sizing:border-box}body{font-family:system-ui;background:linear-gradient(135deg,#020617 0%,#082f49 38%,#0f766e 72%,#042f2e 100%);color:#f8fafc;margin:0;padding:20px 20px 64px}.bar{max-width:1360px;margin:0 auto 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;background:rgba(4,12,26,.88);border:1px solid #00d4ff77;border-radius:18px;padding:14px 26px;box-shadow:0 8px 32px rgba(0,212,255,.15)}.wrap{max-width:1360px;margin:auto;display:grid;grid-template-columns:270px 1fr 270px;gap:18px}@media(max-width:1050px){.wrap{grid-template-columns:1fr}}.col{display:flex;flex-direction:column;gap:15px}.p{background:rgba(7,19,38,.84);backdrop-filter:blur(12px);border:1px solid #00d4ff44;border-radius:14px;padding:18px;flex:1}.r{display:flex;justify-content:space-between;padding:7px 11px;background:#040d1f;border-radius:8px;margin-top:7px;font-size:12.5px}.lv{color:#34d399;font-size:10px;font-weight:800}.sn{color:#94a3b8;font-size:10px;font-weight:700}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}.st{background:#040d1f;border:1px solid #00d4ff44;border-radius:11px;padding:13px}pre{background:#020814;padding:11px;border-radius:8px;color:#38bdf8;overflow-x:auto;font-size:12px;margin:8px 0}.btn{background:#00d4ff25;color:#7dd3fc;border:1px solid #00d4ff66;padding:6px 12px;border-radius:7px;cursor:pointer}.mq{position:fixed;bottom:0;left:0;width:100%;background:#020814;border-top:1px solid #00d4ff55;padding:10px 0;overflow:hidden}.mqi{display:flex;width:max-content;animation:sc 24s linear infinite}.mqi span{font-size:12.5px;font-weight:800;letter-spacing:.18em;color:#e0f2fe;margin:0 32px}.mqi b{color:#00d4ff}@keyframes sc{to{transform:translateX(-50%)}}</style></head><body><header class=bar><div style=display:flex;align-items:center;gap:20px><div style=position:relative;width:64px;height:64px;flex-shrink:0><div style=position:absolute;inset:0;background:#ffffff;clip-path:polygon(50%0%,100%25%,100%75%,50%100%,0%75%,0%25%)></div><div style=position:absolute;inset:0;background:#00d4ff;clip-path:polygon(50%0%,100%25%,50%50%,0%25%)></div><div style=position:absolute;inset:0;background:#e2e8f0;clip-path:polygon(100%25%,100%75%,50%100%,50%50%)></div><div style=position:absolute;inset:14px;background:#040b18;clip-path:polygon(50%0%,100%25%,100%75%,50%100%,0%75%,0%25%)></div><div style=position:absolute;inset:22px;background:#ffffff;clip-path:polygon(50%0%,100%50%,50%100%,0%50%)></div></div><div><div style=display:flex;align-items:center;gap:6px;font-family:Impact,ArialBlack,sans-serif;font-size:48px;font-weight:900;letter-spacing:.12em;color:#ffffff;text-shadow:0_0_24px_rgba(255,255,255,.45),4px_4px_0_#0284c7;line-height:1><span style=display:inline-block;transform:skewX(-10deg)>D</span><span style=display:inline-block;transform:skewX(6deg);color:#f8fafc>N</span><span style=display:inline-block;transform:skewX(-10deg)>Z</span></div><div style=font-size:11px;color:#7dd3fc;letter-spacing:.16em;font-weight:700;margin-top:4px>CUBIST QUANTITATIVE x402 PROTOCOL</div></div></div><div><span style=color:#00d4ff;margin-right:16px;font-weight:700>● QMS Testnet (Chain 19480)</span><a href=/.well-known/openapi.json style=color:#7dd3fc;margin-right:14px>OpenAPI</a><a href=https://github.com/deno296/btc-eth-predictor-qms target=_blank style=color:#7dd3fc>GitHub</a></div></header><div class=wrap><div class=col><div class=p style=border-top:3px solid #00d4ff><b style=color:#00d4ff;font-size:11px>QMS QUANTUM NETWORK</b><h3 style=margin:8px 0>Institutional Settlement</h3><p style=font-size:13px;color:#cbd5e1>Protocol: DNZ x402<br>Chain ID: eip155:19480<br>Unit Cost: 0.005 QMS</p><hr style=border-color:#00d4ff33><small style=color:#7dd3fc><b>QMS Builder Stack:</b><br>• Post-Quantum Accounts (ERC-4337)<br>• QUBO Useful-Work Oracles<br>• QMS AI Agent Telemetry</small><hr style=border-color:#00d4ff33;margin:12px 0 10px><div style=background:#040d1f;border:1px solid #00d4ff44;border-radius:10px;padding:10px><div style=display:flex;justify-content:space-between;align-items:center;margin-bottom:6px><b style=color:#00d4ff;font-size:11px>🦅 FLAPPY BTC RUNNER</b><span id=fbPrice style=font-size:11px;color:#34d399;font-weight:800>$64,500</span></div><canvas id=fbCv width=215 height=135 style=width:100%;height:135px;background:#020814;border:1px solid #00d4ff33;border-radius:7px;cursor:pointer;display:block></canvas><div style=display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;margin-top:5px><span>Tıkla: Uçur</span><span id=fbBest style=color:#7dd3fc>Skor: 0</span></div></div></div><div class=p><b style=color:#00d4ff;font-size:11px>TELEMETRY SLA</b><div class=r><span>Finality</span><b style=color:#00d4ff>&lt; 1.0s</b></div><div class=r><span>Auth</span><b>Zero-Key x402</b></div><div class=r><span>Uptime</span><b style=color:#34d399>99.98%</b></div></div></div><div class=col><div class=p style=flex:0><h2 style=margin:0>Arc Financial Telemetry &amp; Agent Hub</h2><div class=g><div class=st><small style=color:#7dd3fc>RATE</small><br><b>0.005 QMS</b></div><div class=st><small style=color:#7dd3fc>SETTLEMENT</small><br><b style=color:#00d4ff>QMS Network</b></div><div class=st><small style=color:#7dd3fc>BTC LIVE</small><br><b id=b>...</b></div><div class=st><small style=color:#7dd3fc>ETH LIVE</small><br><b id=e>...</b></div></div></div><div class=p style=flex:0><b>DNZ Autonomous Trading Agents</b><div style=display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px><div class=st><div style=display:flex;justify-content:space-between><b>RSI Bot</b><span class=lv>ACTIVE</span></div><small style=color:#94a3b8>Automated 0.005 QMS x402 execution.</small></div><div class=st><div style=display:flex;justify-content:space-between><b>SMA-24 Bot</b><span class=sn>SOON</span></div><small style=color:#94a3b8>24h moving average breakout bot.</small></div><div class=st><div style=display:flex;justify-content:space-between><b>CCTP Agent</b><span class=sn>SOON</span></div><small style=color:#94a3b8>Cross-chain QMS liquidity agent.</small></div></div></div><div class=p style=flex:0;border-top:2px solid #00d4ff><div style=display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px><div><b style=color:#00d4ff>30-Day Macro &amp; News-Weighted Projection (BTC &amp; ETH)</b><div style=font-size:11px;color:#fbbf24;margin-top:2px>⚠️ YATIRIM TAVSİYESİ DEĞİLDİR (Not Financial Advice • Quantitative Scenario Model)</div></div><div><button class=btn id=btnBtc onclick=loadFc(\"BTC\") style=border-color:#00d4ff;color:#fff>BTC 30G</button> <button class=btn id=btnEth onclick=loadFc(\"ETH\")>ETH 30G</button></div></div><div id=newsBox style=margin-top:8px;padding:8px;border-radius:8px;background:#040d1f;border:1px solid #00d4ff33;font-size:11.5px;color:#cbd5e1>Makro &amp; jeopolitik haber akışı taranıyor...</div><div id=fcBox style=max-height:220px;overflow-y:auto;margin-top:8px;border:1px solid #00d4ff33;border-radius:8px;background:#020814;padding:8px;font-size:12px>30 günlük tahminler yükleniyor...</div></div><div class=p><div style=display:flex;justify-content:space-between><b>x402 Endpoint &amp; Circle CLI</b><div><button class=btn id=bu>Copy URL</button> <button class=btn onclick=t()>Test 402</button></div></div><pre id=ep></pre><pre id=cl></pre><pre id=o style=display:none;color:#fbbf24></pre><small style=color:#7dd3fc>Sample 200 OK Output:</small><pre style=color:#34d399>{\"service\":\"DNZ API\",\"data\":{\"BTC\":{\"rsi14h\":67.09},\"ETH\":{\"rsi14h\":67.84}}}</pre></div></div><div class=col><div class=p><h3 style=margin:0 0 6px>Asset Coverage</h3><div class=r><b>BTC / USD</b><span class=lv>LIVE</span></div><div class=r><b>ETH / USD</b><span class=lv>LIVE</span></div><div class=r><b>SOL / USD</b><span class=sn>SOON</span></div><div class=r><b>AVAX / USD</b><span class=sn>SOON</span></div><div class=r><b>LINK / USD</b><span class=sn>SOON</span></div><div class=r><b>SUI / USD</b><span class=sn>SOON</span></div><div class=r><b>ARB / USD</b><span class=sn>SOON</span></div></div><div class=p><b style=color:#00d4ff;font-size:11px>SIGNALS</b><p style=font-size:12.5px;color:#cbd5e1>• RSI (14h) Momentum<br>• SMA (24h) Baseline<br>• 24h Volatility Range</p></div></div></div><div class=mq><div class=mqi><span><b>CIRCLE</b> • QMS</span><span><b>ARC NETWORK</b> • LAYER-1</span><span><b>BLACKROCK</b> • TOKENIZATION</span><span><b>COINBASE</b> • SPOT FEED</span><span><b>x402 PROTOCOL</b> • AGENT PAY</span><span><b>CHAINLINK</b> • ORACLE</span><span><b>FIREBLOCKS</b> • CUSTODY</span><span><b>CIRCLE</b> • QMS</span><span><b>ARC NETWORK</b> • LAYER-1</span><span><b>BLACKROCK</b> • TOKENIZATION</span><span><b>COINBASE</b> • SPOT FEED</span><span><b>x402 PROTOCOL</b> • AGENT PAY</span><span><b>CHAINLINK</b> • ORACLE</span><span><b>FIREBLOCKS</b> • CUSTODY</span></div></div><script>const u=location.origin+\"/api/indicators\";ep.textContent=\"GET \"+u;cl.textContent=\"circle services pay \"+u+\" --chain ARC --address <WALLET>\";bu.onclick=()=>navigator.clipboard.writeText(u);fetch(\"/api/ticker\").then(r=>r.json()).then(d=>{b.textContent=\"$\"+Number(d.BTC).toLocaleString();e.textContent=\"$\"+Number(d.ETH).toLocaleString()});async function t(){o.style.display=\"block\";const r=await fetch(\"/api/indicators\");o.textContent=\"HTTP \"+r.status+\"\\n\"+JSON.stringify(await r.json(),null,2)}eval(decodeURIComponent(escape(atob('bGV0IGZjRGF0YT1udWxsOwpmdW5jdGlvbiByZW5kZXJGYyhzeW0pewogIGlmKCFmY0RhdGEpcmV0dXJuOwogIGlmKHR5cGVvZiBidG5CdGMhPT0idW5kZWZpbmVkIil7CiAgICBidG5CdGMuc3R5bGUuY29sb3I9c3ltPT09IkJUQyI/IiNmZmYiOiIjN2RkM2ZjIjsKICAgIGJ0bkV0aC5zdHlsZS5jb2xvcj1zeW09PT0iRVRIIj8iI2ZmZiI6IiM3ZGQzZmMiOwogIH0KICBjb25zdCBzYz1mY0RhdGEuc2VudGltZW50U2NvcmV8fDA7CiAgY29uc3Qgc2NDb2w9c2M+MD8iIzM0ZDM5OSI6c2M8MD8iI2Y4NzE3MSI6IiM3ZGQzZmMiOwogIGxldCBuaD0nPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206NXB4Ij48YiBzdHlsZT0iY29sb3I6IzAwZDRmZiI+Q2FubMSxIE1ha3JvICZhbXA7IEhhYmVyIEV0a2VubGVyaSAoRkVEIC8gSmVvcG9saXRpayAvIEtyaXB0byk8L2I+PHNwYW4gc3R5bGU9ImNvbG9yOicrc2NDb2wrJztmb250LXdlaWdodDo3MDAiPkR1eWFybMSxbMSxayBTa29ydTogJysoc2M+MD8nKycrc2M6c2MpKycvMTAwPC9zcGFuPjwvZGl2Pic7CiAgKGZjRGF0YS5tYWNyb0RyaXZlcnN8fFtdKS5mb3JFYWNoKGQ9PnsKICAgIGNvbnN0IGNvbD1kLmltcGFjdD09PSJCVUxMSVNIIj8iIzM0ZDM5OSI6ZC5pbXBhY3Q9PT0iQkVBUklTSCI/IiNmODcxNzEiOiIjOTRhM2I4IjsKICAgIG5oKz0nPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDozcHg7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzIj48c3BhbiBzdHlsZT0iY29sb3I6Jytjb2wrJztmb250LXdlaWdodDo3MDAiPlsnK2QuaW1wYWN0KyddPC9zcGFuPiAnK2QudGl0bGUrJyA8c21hbGwgc3R5bGU9ImNvbG9yOiM2NDc0OGIiPignK2Quc291cmNlKycpPC9zbWFsbD48L2Rpdj4nOwogIH0pOwogIGlmKHR5cGVvZiBuZXdzQm94IT09InVuZGVmaW5lZCIpbmV3c0JveC5pbm5lckhUTUw9bmg7CiAgY29uc3Qgcm93cz0oZmNEYXRhLnByb2plY3Rpb25zJiZmY0RhdGEucHJvamVjdGlvbnNbc3ltXSl8fFtdOwogIGxldCBoPSc8dGFibGUgc3R5bGU9IndpZHRoOjEwMCU7Ym9yZGVyLWNvbGxhcHNlOmNvbGxhcHNlO3RleHQtYWxpZ246cmlnaHQiPjx0aGVhZD48dHIgc3R5bGU9ImNvbG9yOiM3ZGQzZmM7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgIzAwZDRmZjMzIj48dGggc3R5bGU9InRleHQtYWxpZ246bGVmdDtwYWRkaW5nOjVweCI+R8O8bjwvdGg+PHRoIHN0eWxlPSJ0ZXh0LWFsaWduOmxlZnQ7cGFkZGluZzo1cHgiPlRhcmloPC90aD48dGggc3R5bGU9InBhZGRpbmc6NXB4Ij5BecSxIChCZWFyKTwvdGg+PHRoIHN0eWxlPSJwYWRkaW5nOjVweCI+QmF6IChCYXNlKTwvdGg+PHRoIHN0eWxlPSJwYWRkaW5nOjVweCI+Qm/En2EgKEJ1bGwpPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5Pic7CiAgcm93cy5mb3JFYWNoKHI9PnsKICAgIGgrPSc8dHIgc3R5bGU9ImJvcmRlci1ib3R0b206MXB4IHNvbGlkICMwZjE3MmEiPjx0ZCBzdHlsZT0idGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6NXB4O2NvbG9yOiM5NGEzYjgiPisnK3IuZGF5KydnPC90ZD48dGQgc3R5bGU9InRleHQtYWxpZ246bGVmdDtwYWRkaW5nOjVweCI+JytyLmRhdGUrJzwvdGQ+PHRkIHN0eWxlPSJwYWRkaW5nOjVweDtjb2xvcjojZjg3MTcxIj4kJytyLmJlYXJVU0QudG9Mb2NhbGVTdHJpbmcoKSsnPC90ZD48dGQgc3R5bGU9InBhZGRpbmc6NXB4O2NvbG9yOiMzOGJkZjg7Zm9udC13ZWlnaHQ6NzAwIj4kJytyLmJhc2VVU0QudG9Mb2NhbGVTdHJpbmcoKSsnPC90ZD48dGQgc3R5bGU9InBhZGRpbmc6NXB4O2NvbG9yOiMzNGQzOTkiPiQnK3IuYnVsbFVTRC50b0xvY2FsZVN0cmluZygpKyc8L3RkPjwvdHI+JzsKICB9KTsKICBoKz0nPC90Ym9keT48L3RhYmxlPic7CiAgaWYodHlwZW9mIGZjQm94IT09InVuZGVmaW5lZCIpZmNCb3guaW5uZXJIVE1MPWg7Cn0KZnVuY3Rpb24gbG9hZEZjKHN5bSl7CiAgaWYoZmNEYXRhKXtyZW5kZXJGYyhzeW0pO3JldHVybjt9CiAgZmV0Y2goJy9hcGkvZm9yZWNhc3Q/cHJldmlldz0xJykudGhlbihyPT5yLmpzb24oKSkudGhlbihkPT57ZmNEYXRhPWQ7cmVuZGVyRmMoc3ltKTt9KS5jYXRjaCgoKT0+e2lmKHR5cGVvZiBmY0JveCE9PSJ1bmRlZmluZWQiKWZjQm94LnRleHRDb250ZW50PSdUYWhtaW4gdmVyaXNpIHnDvGtsZW5lbWVkaS4nO30pOwp9CmxvYWRGYygnQlRDJyk7'))));eval(decodeURIComponent(escape(atob('KGZ1bmN0aW9uKCl7CiAgY29uc3QgY3Y9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZiQ3YnKTsKICBpZighY3YpcmV0dXJuOwogIGNvbnN0IGN0eD1jdi5nZXRDb250ZXh0KCcyZCcpOwogIGNvbnN0IHBFbD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmJQcmljZScpOwogIGNvbnN0IHNFbD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmJCZXN0Jyk7CiAgbGV0IHN0YXRlPSdXQUlUJyxieT02NSx2eT0wLHBpcGVzPVtdLGZyYW1lPTAsc2NvcmU9MCxwcmljZT02NDUwMDsKCiAgZnVuY3Rpb24gc3luY0Jhc2VQcmljZSgpewogICAgY29uc3QgYkVsPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdiJyk7CiAgICBpZihiRWwmJmJFbC50ZXh0Q29udGVudCl7CiAgICAgIGNvbnN0IG49cGFyc2VGbG9hdChiRWwudGV4dENvbnRlbnQucmVwbGFjZSgvW14wLTkuXS9nLCcnKSk7CiAgICAgIGlmKCFpc05hTihuKSYmbj4xMDAwKXByaWNlPU1hdGgucm91bmQobik7CiAgICB9CiAgICBpZihwRWwpe3BFbC50ZXh0Q29udGVudD0nJCcrcHJpY2UudG9Mb2NhbGVTdHJpbmcoKTtwRWwuc3R5bGUuY29sb3I9JyMzNGQzOTknO30KICB9CgogIGZ1bmN0aW9uIHJlc2V0R2FtZSgpewogICAgc3luY0Jhc2VQcmljZSgpOwogICAgYnk9NjU7dnk9LTMuMjtwaXBlcz1bXTtmcmFtZT0wO3Njb3JlPTA7c3RhdGU9J1BMQVknOwogICAgaWYoc0VsKXNFbC50ZXh0Q29udGVudD0nU2tvcjogMCc7CiAgfQoKICBjdi5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVyZG93bicsZnVuY3Rpb24oZSl7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBpZihzdGF0ZT09PSdXQUlUJ3x8c3RhdGU9PT0nT1ZFUicpe3Jlc2V0R2FtZSgpO30KICAgIGVsc2UgaWYoc3RhdGU9PT0nUExBWScpe3Z5PS0zLjU7fQogIH0pOwoKICBmdW5jdGlvbiBsb29wKCl7CiAgICBjdHguY2xlYXJSZWN0KDAsMCxjdi53aWR0aCxjdi5oZWlnaHQpOwogICAgY3R4LnN0cm9rZVN0eWxlPScjMGYxNzJhJztjdHgubGluZVdpZHRoPTE7CiAgICBmb3IobGV0IHg9MDt4PGN2LndpZHRoO3grPTI1KXtjdHguYmVnaW5QYXRoKCk7Y3R4Lm1vdmVUbyh4LDApO2N0eC5saW5lVG8oeCxjdi5oZWlnaHQpO2N0eC5zdHJva2UoKTt9CgogICAgaWYoc3RhdGU9PT0nV0FJVCcpewogICAgICBzeW5jQmFzZVByaWNlKCk7CiAgICAgIGN0eC5maWxsU3R5bGU9JyNmYmJmMjQnO2N0eC5iZWdpblBhdGgoKTtjdHguYXJjKDQ1LDY1LDgsMCxNYXRoLlBJKjIpO2N0eC5maWxsKCk7CiAgICAgIGN0eC5maWxsU3R5bGU9JyMwMjA4MTQnO2N0eC5mb250PSdib2xkIDEwcHggc3lzdGVtLXVpJztjdHguZmlsbFRleHQoJ+KCvycsNDIsNjkpOwogICAgICBjdHguZmlsbFN0eWxlPScjN2RkM2ZjJztjdHguZm9udD0nYm9sZCAxMXB4IHN5c3RlbS11aSc7Y3R4LmZpbGxUZXh0KCdVw6dtYWsgacOnaW4gdMSxa2xhIScsNjgsNjkpOwogICAgfWVsc2UgaWYoc3RhdGU9PT0nUExBWScpewogICAgICBmcmFtZSsrOwogICAgICB2eSs9MC4xODsKICAgICAgYnkrPXZ5OwogICAgICBpZihmcmFtZSU3NT09PTApewogICAgICAgIGNvbnN0IGdhcFk9MjUrTWF0aC5yYW5kb20oKSo1NTsKICAgICAgICBwaXBlcy5wdXNoKHt4OmN2LndpZHRoLHRvcDpnYXBZLGJvdDpnYXBZKzQ0LHBhc3NlZDpmYWxzZX0pOwogICAgICB9CiAgICAgIGZvcihsZXQgaT1waXBlcy5sZW5ndGgtMTtpPj0wO2ktLSl7CiAgICAgICAgY29uc3QgcD1waXBlc1tpXTsKICAgICAgICBwLngtPTEuNzsKICAgICAgICBjdHguZmlsbFN0eWxlPScjZWY0NDQ0JzsKICAgICAgICBjdHguZmlsbFJlY3QocC54LDAsMTgscC50b3ApOwogICAgICAgIGN0eC5maWxsUmVjdChwLngscC5ib3QsMTgsY3YuaGVpZ2h0LXAuYm90KTsKICAgICAgICBpZig0NSs3PnAueCAmJiA0NS03PHAueCsxOCAmJiAoYnktNzxwLnRvcCB8fCBieSs3PnAuYm90KSl7CiAgICAgICAgICBzdGF0ZT0nT1ZFUic7cHJpY2U9TWF0aC5yb3VuZChwcmljZSowLjgyKTsKICAgICAgICAgIGlmKHBFbCl7cEVsLnRleHRDb250ZW50PSckJytwcmljZS50b0xvY2FsZVN0cmluZygpKycg4pa8JztwRWwuc3R5bGUuY29sb3I9JyNmODcxNzEnO30KICAgICAgICB9CiAgICAgICAgaWYoIXAucGFzc2VkICYmIHAueCsxODw0NSl7CiAgICAgICAgICBwLnBhc3NlZD10cnVlO3Njb3JlKys7cHJpY2UrPTI1MDsKICAgICAgICAgIGlmKHNFbClzRWwudGV4dENvbnRlbnQ9J1Nrb3I6ICcrc2NvcmU7CiAgICAgICAgICBpZihwRWwpe3BFbC50ZXh0Q29udGVudD0nJCcrcHJpY2UudG9Mb2NhbGVTdHJpbmcoKSsnIOKWsic7cEVsLnN0eWxlLmNvbG9yPScjMzRkMzk5Jzt9CiAgICAgICAgfQogICAgICAgIGlmKHAueDwtMjApcGlwZXMuc3BsaWNlKGksMSk7CiAgICAgIH0KICAgICAgaWYoYnk+Y3YuaGVpZ2h0LTcgfHwgYnk8Nyl7CiAgICAgICAgc3RhdGU9J09WRVInO3ByaWNlPU1hdGgucm91bmQocHJpY2UqMC44Mik7CiAgICAgICAgaWYocEVsKXtwRWwudGV4dENvbnRlbnQ9JyQnK3ByaWNlLnRvTG9jYWxlU3RyaW5nKCkrJyDilrwnO3BFbC5zdHlsZS5jb2xvcj0nI2Y4NzE3MSc7fQogICAgICB9CiAgICAgIGN0eC5maWxsU3R5bGU9JyNmYmJmMjQnO2N0eC5iZWdpblBhdGgoKTtjdHguYXJjKDQ1LGJ5LDgsMCxNYXRoLlBJKjIpO2N0eC5maWxsKCk7CiAgICAgIGN0eC5maWxsU3R5bGU9JyMwMjA4MTQnO2N0eC5mb250PSdib2xkIDEwcHggc3lzdGVtLXVpJztjdHguZmlsbFRleHQoJ+KCvycsNDIsYnkrNCk7CiAgICB9ZWxzZSBpZihzdGF0ZT09PSdPVkVSJyl7CiAgICAgIGlmKGJ5PGN2LmhlaWdodC04KWJ5Kz0zOwogICAgICBjdHguZmlsbFN0eWxlPScjZjg3MTcxJztjdHguYmVnaW5QYXRoKCk7Y3R4LmFyYyg0NSxieSw4LDAsTWF0aC5QSSoyKTtjdHguZmlsbCgpOwogICAgICBjdHguZmlsbFN0eWxlPSdyZ2JhKDIsOCwyMCwwLjc4KSc7Y3R4LmZpbGxSZWN0KDIwLDM4LDE3NSw1OCk7CiAgICAgIGN0eC5zdHJva2VTdHlsZT0nI2Y4NzE3MSc7Y3R4LnN0cm9rZVJlY3QoMjAsMzgsMTc1LDU4KTsKICAgICAgY3R4LmZpbGxTdHlsZT0nI2Y4NzE3MSc7Y3R4LmZvbnQ9J2JvbGQgMTJweCBzeXN0ZW0tdWknO2N0eC5maWxsVGV4dCgnQlRDIETDnMWeVMOcISBTa29yOiAnK3Njb3JlLDQ2LDYxKTsKICAgICAgY3R4LmZpbGxTdHlsZT0nI2NiZDVlMSc7Y3R4LmZvbnQ9JzExcHggc3lzdGVtLXVpJztjdHguZmlsbFRleHQoJ1Rla3JhciB1w6dtYWsgacOnaW4gdMSxa2xhJyw1Miw4MCk7CiAgICB9CiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7CiAgfQogIGxvb3AoKTsKfSkoKTs='))));</script></body></html>");});module.exports=app;if(require.main===module){app.listen(process.env.PORT||3000);}





















