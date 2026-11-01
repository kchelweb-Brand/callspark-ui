const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const logo = "data:image/svg+xml;base64," + readFileSync("logo.svg").toString("base64");
const css = `
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1080px;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;background:#0b0f14;position:relative;overflow:hidden}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;filter:blur(120px);opacity:.45}
.g1{background:#14a85f;right:-300px;top:-300px}.g2{background:#2a6ee6;left:-380px;bottom:-420px;opacity:.35}
.wrap{position:relative;padding:84px;height:100%;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:18px;font-weight:700;font-size:34px;letter-spacing:.3px}
.brand img{width:64px;height:64px;border-radius:16px}
.main{flex:1;display:flex;flex-direction:column;justify-content:center}
h1{font-size:96px;line-height:1.02;letter-spacing:-2px;font-weight:800}
h1 em{font-style:normal;color:#3ddc84}
p.sub{font-size:38px;line-height:1.35;color:#b9c4d0;margin-top:34px;max-width:860px}
.foot{font-size:28px;color:#8795a6;display:flex;justify-content:space-between}
.pill{display:inline-block;background:#3ddc84;color:#06210f;font-weight:800;font-size:30px;padding:14px 30px;border-radius:999px}
ul{list-style:none;padding:0;margin-top:40px}
li{font-size:46px;font-weight:700;padding:22px 0;border-top:1px solid #243140;display:flex;gap:22px;align-items:center}
li:last-child{border-bottom:1px solid #243140}
li b{color:#3ddc84;font-size:40px}
.big{font-size:230px;font-weight:800;letter-spacing:-8px;color:#3ddc84;line-height:1}
.big small{font-size:56px;color:#b9c4d0;letter-spacing:0;font-weight:600}
`;
const page = (body) => `<html><head><style>${css}</style></head><body><div class="glow g1"></div><div class="glow g2"></div><div class="wrap"><div class="brand"><img src="${logo}"/>Kchel Dialer</div>${body}</div></body></html>`;
const slides = {
  "1-intro": `<div class="main"><h1>Call more people.<br><em>Wait less.</em></h1><p class="sub">The cloud phone system and dialer for teams that live on the phone.</p></div><div class="foot"><span class="pill">Kchel Dialer</span><span>Windows app + browser</span></div>`,
  "2-features": `<div class="main"><h1>One dialer.<br><em>Everything calls need.</em></h1><ul><li><b>✓</b>Keypad dialing &amp; campaigns</li><li><b>✓</b>IVR menus &amp; voicemail</li><li><b>✓</b>Missed-call text-back</li><li><b>✓</b>Team roles &amp; call history</li></ul></div><div class="foot"><span>Kchel Dialer</span><span>Set up in an afternoon</span></div>`,
  "3-campaigns": `<div class="main"><h1>Work a list.<br><em>Don't dial ahead of your agents.</em></h1><p class="sub">Load contacts, start a campaign, and let your team talk to people instead of waiting for the next number.</p></div><div class="foot"><span class="pill">Campaigns</span><span>Kchel Dialer</span></div>`,
  "4-price": `<div class="main"><p class="sub" style="margin:0 0 10px">Starting at</p><div class="big">$29<small> / agent / month</small></div><p class="sub">The full dialer on your own carrier. Free 7-day trial to try it first.</p></div><div class="foot"><span class="pill">Start free</span><span>Kchel Dialer</span></div>`,
};
(async()=>{const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1080, height: 1080 } });
for (const [n, body] of Object.entries(slides)) {
  await pg.setContent(page(body)); await pg.screenshot({ path: `kchel-${n}.png` });
}
await b.close();
})();
