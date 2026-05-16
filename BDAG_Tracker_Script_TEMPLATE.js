// ============================================================
// BLOCKDAG PRICE TRACKER — Pushover Notifications
// ============================================================
// Avant de déployer, remplis les constantes ci-dessous.
// Consulte le fichier INSTALLATION.md pour le guide complet.

const PUSHOVER_BDAG_TOKEN = "TON_API_TOKEN_PUSHOVER";       // pushover.net → ton application → API Token
const PUSHOVER_BDAG_USER  = "TA_USER_KEY_PUSHOVER";         // pushover.net → ta User Key
const CMC_API_KEY         = "TA_CLE_API_COINMARKETCAP";     // coinmarketcap.com/api → ton API Key
const HEURES_ENVOI        = [2, 6, 10, 12, 14, 18, 22];    // Heures des pushs planifiés (12h = bilan journalier)
const BDAG_WALLET         = "0xTON_ADRESSE_WALLET_BDAG";   // Ton adresse wallet BDAG (0x...)
const BDAG_RPC_URL        = "https://rpc.bdagscan.com/";
const BDAG_PRIX_ACHAT_CHF = 0;      // Prix moyen d'achat en CHF par BDAG (0 = pas de calcul P&L)
                                    // Calcul : total CHF investis ÷ nombre de BDAG détenus
const RANG_ALERTE_SEUIL  = 5;      // Nb de positions CMC pour déclencher une alerte rang
const VOLUME_SPIKE_RATIO = 2;      // Multiplicateur vs moyenne 7j pour alerte volume inhabituel
const INTERVALLE_CMC_MIN = 10;     // Intervalle minimum entre deux appels CMC (minutes)
                                   // Trigger Google à 5 min — script appelle CMC toutes les 10 min max
                                   // → ~144 appels/jour · ~4 320/mois (limite : 10 000/mois)

// URL de la Web App — à mettre à jour après le premier déploiement (voir guide installation)
const PUSHOVER_ACTIONS = {
  menu: "VOTRE_URL_WEBAPP_APRES_DEPLOIEMENT"
};

// Token de sécurité optionnel — laisse "" pour un accès libre
// Si défini (ex: "monSecret42"), partage l'URL avec ?t=monSecret42
const DASHBOARD_TOKEN = "";

// ------------------------------------------------------------
// Bouton menu générique — même bouton sur tous les pushs
// Ajoute automatiquement le token si DASHBOARD_TOKEN est défini
// ------------------------------------------------------------
function actionButton() {
  const url = PUSHOVER_ACTIONS.menu + (DASHBOARD_TOKEN ? "?t=" + DASHBOARD_TOKEN : "");
  return {
    url:       url,
    url_title: "🎛️ Actions BDAG"
  };
}

// ------------------------------------------------------------
// Webhook entrypoint — dashboard live + actions Pushover
// ------------------------------------------------------------
function doGet(e) {
  const baseUrl = PUSHOVER_ACTIONS.menu;
  const action  = e && e.parameter && e.parameter.action ? e.parameter.action : null;
  const token   = e && e.parameter && e.parameter.t     ? e.parameter.t     : "";

  // ── Vérification token (si DASHBOARD_TOKEN est configuré) ──────────────
  if (DASHBOARD_TOKEN !== "" && token !== DASHBOARD_TOKEN) {
    if (action) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="background:#0f0f1a;color:#555;font-family:-apple-system,sans-serif;display:flex;' +
      'align-items:center;justify-content:center;height:100vh;font-size:2rem;margin:0">🔒 Accès restreint</body></html>'
    );
  }

  // ── Action dashboard — toutes les données pour le dashboard live ────────
  if (action === "dashboard") {
    try {
      const m       = getBDAGmarketData();
      const props   = PropertiesService.getScriptProperties();
      const qte     = parseFloat(props.getProperty("bdag_quantite_last") || "0");
      const ath     = parseFloat(props.getProperty("bdag_ath")           || "0");
      const histRaw = props.getProperty("bdag_history");
      const history = histRaw ? JSON.parse(histRaw) : [];
      // Derniers 48 points pour la courbe (environ 48h à fréquence horaire)
      const chartData  = history.slice(-48).map(h => ({ ts: h.ts, p: h.price }));
      const targets    = JSON.parse(props.getProperty("bdag_targets") || "[]");
      const nextTarget = targets.find(t => !t.atteint && t.prix > m.price) || null;
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true, price: m.price, rank: m.rank, id: m.id,
          pct_1h: m.pct_1h, pct_24h: m.pct_24h, pct_7d: m.pct_7d,
          market_cap: m.market_cap, volume_24h: m.volume_24h,
          circulating: m.circulating, max_supply: m.max_supply,
          quantite: qte, pam: BDAG_PRIX_ACHAT_CHF,
          ath: ath, chart: chartData, nextTarget: nextTarget,
          targets: targets.filter(t => !t.atteint),
          heures: HEURES_ENVOI
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── Action prix — rétrocompatibilité ───────────────────────────────────
  if (action === "prix") {
    try {
      const m = getBDAGmarketData();
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, prix: m.price, rank: m.rank, pct24h: m.pct_24h }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── Manifest PWA — icône iOS/Android ──────────────────────────────────
  if (action === "manifest") {
    const coinId   = PropertiesService.getScriptProperties().getProperty("bdag_coin_id") || "";
    const iconUrl  = coinId
      ? "https://s2.coinmarketcap.com/static/img/coins/128x128/" + coinId + ".png"
      : "https://www.google.com/s2/favicons?domain=blockdag.network&sz=128";
    const startUrl = baseUrl + (DASHBOARD_TOKEN ? "?t=" + DASHBOARD_TOKEN : "");
    return ContentService
      .createTextOutput(JSON.stringify({
        name: "BDAG Tracker", short_name: "BDAG",
        start_url: startUrl, display: "standalone",
        background_color: "#0f0f1a", theme_color: "#1a1a35",
        icons: [{ src: iconUrl, sizes: "128x128", type: "image/png" }]
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Actions boutons ────────────────────────────────────────────────────
  if (action) {
    let ok = true, label = "";
    try {
      if      (action === "solde")      { pushBDAGbalanceOnchain(); label = "⛓️ Solde onchain envoyé"; }
      else if (action === "bilan")      { checkBDAGbilan();         label = "📊 Bilan journalier envoyé"; }
      else if (action === "market")     { pushBDAGmarketStats();    label = "📊 Stats marché envoyées"; }
      else if (action === "simulation") { pushSimulateurVente();    label = "💰 Simulateur vente envoyé"; }
      else { label = "Action inconnue"; ok = false; }
    } catch(err) {
      Logger.log("Erreur webhook (" + action + ") : " + err.message);
      label = "Erreur : " + err.message; ok = false;
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: ok, label: label }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Page HTML — dashboard complet live ────────────────────────────────
  const cachedCoinId  = PropertiesService.getScriptProperties().getProperty("bdag_coin_id") || "";
  const touchIconHref = cachedCoinId
    ? "https://s2.coinmarketcap.com/static/img/coins/128x128/" + cachedCoinId + ".png"
    : "https://www.google.com/s2/favicons?domain=blockdag.network&sz=128";
  return HtmlService.createHtmlOutput(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=980, initial-scale=0.33">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="BDAG">
<title>BDAG Tracker</title>
<link rel="apple-touch-icon" sizes="180x180" id="touch-icon" href="${touchIconHref}">
<link rel="manifest" href="${baseUrl}?action=manifest${token ? '&t=' + token : ''}">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'SF Pro Display',sans-serif;background:#0f0f1a;color:#e8e8f0;width:980px;padding:50px 40px 80px}
.header{display:flex;flex-direction:column;align-items:center;margin-bottom:44px}
#logo{width:96px;height:96px;border-radius:50%;display:none}
.logo-fb{width:96px;height:96px;border-radius:50%;background:#1a2a4a;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:900;color:#4a9eff}
.ticker{font-size:38px;font-weight:700;color:#888;letter-spacing:7px;margin-top:16px}
.price-hero{text-align:center;margin-bottom:36px}
.price-main{font-size:100px;font-weight:700;letter-spacing:-3px;line-height:1;margin-bottom:20px}
.hausse{color:#9FE1CB}.baisse{color:#F4A4A4}.neutral{color:#999}
.price-sub{font-size:50px;display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap}
.rank-badge{background:#1a1a35;border:1px solid #30305a;border-radius:40px;padding:10px 28px;font-size:44px;color:#aaa}
.chart-wrap{background:#13132a;border-radius:28px;padding:20px 12px 12px;margin-bottom:36px;min-height:160px}
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:36px}
.stat-card{background:#13132a;border-radius:24px;padding:28px}
.stat-label{font-size:33px;color:#b0b0d0;margin-bottom:10px}
.stat-value{font-size:48px;font-weight:600;color:#ddd}
.variations{background:#13132a;border-radius:24px;padding:28px;margin-bottom:36px;display:flex;justify-content:space-around}
.var-item{text-align:center}
.var-label{font-size:33px;color:#b0b0d0;margin-bottom:8px}
.var-val{font-size:46px;font-weight:600}
.section{background:#13132a;border-radius:24px;padding:28px;margin-bottom:36px}
.sec-title{font-size:30px;color:#a8a8c8;text-transform:uppercase;letter-spacing:4px;margin-bottom:20px}
.port-main{font-size:76px;font-weight:700;margin-bottom:10px}
.port-sub{font-size:40px;color:#999;margin-bottom:8px}
.pam-line{font-size:40px;color:#9FE1CB;margin-top:6px}
.target-card{background:#0a1525;border:1px solid #1a3050;border-radius:24px;padding:28px;margin-bottom:36px;font-size:44px;line-height:1.5}
.ath-card{background:#160f00;border:1px solid #3a2500;border-radius:24px;padding:28px;margin-bottom:40px;font-size:44px;line-height:1.5}
.btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:28px}
.btn{padding:40px 16px;border:none;border-radius:24px;font-size:46px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .15s;text-align:center}
.btn:active{opacity:.5}.btn:disabled{opacity:.35;cursor:default}
.btn-solde{background:#0f3d30;color:#9FE1CB}
.btn-bilan{background:#0d2d52;color:#B5D4F4}
.btn-market{background:#2d1650;color:#D4AAFF}
.btn-simulation{background:#3d2800;color:#FFD966}
#status{text-align:center;font-size:50px;min-height:76px;margin-top:8px;opacity:0;transition:opacity .3s}
#status.v{opacity:1}
.upd{text-align:center;color:#9090a8;font-size:32px;margin-bottom:30px}
.loading{text-align:center;font-size:56px;color:#9090a8;padding:100px 0}
</style>
</head>
<body>
<div class="header">
  <img id="logo" alt="BDAG" onerror="this.style.display='none'">
  <div id="logo-fb" class="logo-fb">B</div>
  <div class="ticker">BLOCKDAG</div>
</div>
<div id="dash"><div class="loading">⏳</div></div>
<div class="btn-grid">
  <button class="btn btn-solde"      onclick="run('solde',this)">⛓️ Solde</button>
  <button class="btn btn-bilan"      onclick="run('bilan',this)">📊 Bilan</button>
  <button class="btn btn-market"     onclick="run('market',this)">📈 Market</button>
  <button class="btn btn-simulation" onclick="run('simulation',this)">💰 Vente</button>
</div>
<div id="status"></div>
<script>
var T='${token}',B='${baseUrl}';
function api(a){return B+'?action='+a+(T?'&t='+T:'');}
function fp(p){if(!p&&p!==0)return'—';return p<0.01?p.toFixed(6):p<0.1?p.toFixed(4):p.toFixed(3);}
function fm(v){if(!v)return'—';return v>=1e9?(v/1e9).toFixed(2)+' Mrd':v>=1e6?(v/1e6).toFixed(2)+' M':v.toFixed(0);}
function fpv(v){if(!v&&v!==0)return'—';return v>=1e6?(v/1e6).toFixed(2)+'M':v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(0);}
function fc(v){
  if(v==null)return'<span class="neutral">—</span>';
  var s=v>=0?'+':'',a=v>0?'▲':v<0?'▼':'—',c=v>=0?'hausse':'baisse';
  return'<span class="'+c+'">'+a+' '+s+v.toFixed(2)+'%</span>';
}
function fmtTs(ts){
  var d=new Date(ts),now=new Date();
  var hm=d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  if(d.toDateString()===now.toDateString())return hm;
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+' '+hm;
}
function drawChart(data,pam,targets,quantite){
  var el=document.getElementById('chart-area');
  if(!data||data.length<3){
    el.innerHTML='<div style="color:#9090a8;font-size:36px;text-align:center;padding:40px 0">⏳ Courbe disponible après quelques jours</div>';
    return;
  }
  var W=900,H=165,LM=115,RM=115,CW=W-LM-RM,py=14;
  var prices=data.map(function(d){return d.p;});
  var mn=Math.min.apply(null,prices),mx=Math.max.apply(null,prices);
  var r=mx-mn||mn*0.001||1e-9;
  var mid=(mn+mx)/2;
  function cx(i){return LM+(i/(data.length-1))*CW;}
  function cy(price){return py+(1-(price-mn)/r)*(H-2*py);}
  function ry(price){return Math.max(py,Math.min(H-py,cy(price)));}
  var coords=data.map(function(d,i){return[cx(i),cy(d.p)];});
  var up=prices[prices.length-1]>=prices[0],col=up?'#9FE1CB':'#F4A4A4';
  var axCol='#7878a0',fSz=22;
  var ln='M '+coords.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L ');
  var fl='M '+LM+','+H+' L '+coords.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L ')+' L '+(LM+CW)+','+H+' Z';
  var lx=coords[coords.length-1][0].toFixed(1),ly=coords[coords.length-1][1].toFixed(1);
  var guides='';
  [[mx,py+4],[mid,H/2],[mn,H-py-4]].forEach(function(pair){
    guides+='<line x1="'+LM+'" y1="'+pair[1].toFixed(1)+'" x2="'+(LM+CW)+'" y2="'+pair[1].toFixed(1)+'" stroke="#ffffff" stroke-width="0.5" opacity="0.06"/>';
  });
  var axLeft='';
  [[mx,py+4],[mid,H/2],[mn,H-py-4]].forEach(function(pair){
    axLeft+='<text x="'+(LM-8)+'" y="'+pair[1].toFixed(1)+'" font-size="'+fSz+'" fill="'+axCol+'" text-anchor="end" dominant-baseline="middle" font-family="-apple-system,sans-serif">'+fp(pair[0])+'</text>';
  });
  var axRight='';
  if(quantite>0){
    [[mx,py+4],[mid,H/2],[mn,H-py-4]].forEach(function(pair){
      axRight+='<text x="'+(LM+CW+8)+'" y="'+pair[1].toFixed(1)+'" font-size="'+fSz+'" fill="'+axCol+'" text-anchor="start" dominant-baseline="middle" font-family="-apple-system,sans-serif">'+fpv(pair[0]*quantite)+'</text>';
    });
  }
  var refs='';
  if(pam>0){
    var pamFmt=parseFloat(fp(pam)).toString(); // supprime les zéros inutiles : 0.005100 → 0.0051
    if(pam>=mn&&pam<=mx){
      // PAM dans la plage visible — ligne pointillée + label à droite
      var pamY=ry(pam).toFixed(1);
      var pamTextY=parseFloat(pamY)<(py+22)?(parseFloat(pamY)+22).toFixed(1):(parseFloat(pamY)-7).toFixed(1);
      refs+='<line x1="'+LM+'" y1="'+pamY+'" x2="'+(LM+CW)+'" y2="'+pamY+'" stroke="#FFD966" stroke-width="2" stroke-dasharray="10,7" opacity="0.6"/>';
      refs+='<text x="'+(LM+CW-6)+'" y="'+pamTextY+'" font-size="20" fill="#FFD966" opacity="0.75" text-anchor="end" font-family="-apple-system,sans-serif">PAM '+pamFmt+'</text>';
    } else {
      // PAM hors plage — badge discret en haut ou bas à droite avec flèche
      var arrow=pam>mx?'↑':'↓';
      var edgeY=pam>mx?(py+18).toFixed(1):(H-py-4).toFixed(1);
      refs+='<text x="'+(LM+CW-6)+'" y="'+edgeY+'" font-size="20" fill="#FFD966" opacity="0.6" text-anchor="end" font-family="-apple-system,sans-serif">PAM '+pamFmt+' '+arrow+'</text>';
    }
  }
  if(targets&&targets.length){
    targets.forEach(function(t){
      if(t.prix<mn*0.4||t.prix>mx*2.5)return;
      var tY=ry(t.prix).toFixed(1);
      var tX=(LM+CW*0.58).toFixed(0);
      refs+='<line x1="'+tX+'" y1="'+tY+'" x2="'+(LM+CW)+'" y2="'+tY+'" stroke="#9090d8" stroke-width="1.5" stroke-dasharray="6,5" opacity="0.5"/>';
      refs+='<text x="'+(parseFloat(tX)-10)+'" y="'+(parseFloat(tY)-5)+'" font-size="20" fill="#9090d8" text-anchor="end" opacity="0.7" font-family="-apple-system,sans-serif">'+t.label+'</text>';
    });
  }
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0%" stop-color="'+col+'" stop-opacity="0.22"/>'+
    '<stop offset="100%" stop-color="'+col+'" stop-opacity="0"/>'+
    '</linearGradient></defs>'+
    guides+
    '<path d="'+fl+'" fill="url(#g)"/>'+
    refs+
    '<path d="'+ln+'" stroke="'+col+'" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<circle cx="'+lx+'" cy="'+ly+'" r="5" fill="'+col+'"/>'+
    '<circle cx="'+lx+'" cy="'+ly+'" r="12" fill="'+col+'" opacity="0.18"/>'+
    axLeft+axRight+
    '</svg>';
  var meta=document.getElementById('chart-meta');
  if(meta){
    meta.innerHTML=
      '<span style="font-size:30px;color:#9898b8">'+fmtTs(data[0].ts)+'</span>'+
      '<span style="font-size:26px;color:#7878a0">CHF/BDAG &nbsp;&nbsp;&nbsp; CHF portfolio</span>'+
      '<span style="font-size:30px;color:#9898b8">'+fmtTs(data[data.length-1].ts)+'</span>';
  }
}
function render(d){
  if(d.id){
    var lg=document.getElementById('logo');
    var imgUrl='https://s2.coinmarketcap.com/static/img/coins/128x128/'+d.id+'.png';
    lg.src='https://s2.coinmarketcap.com/static/img/coins/64x64/'+d.id+'.png';
    lg.onload=function(){lg.style.display='block';document.getElementById('logo-fb').style.display='none';};
    document.getElementById('touch-icon').href=imgUrl;
  }
  // Fond dynamique selon performance 24h
  var p24=d.pct_24h||0;
  var intensity=Math.min(Math.abs(p24)/15,1);
  var bgR=p24>=0?Math.round(15-5*intensity):Math.round(15+18*intensity);
  var bgG=p24>=0?Math.round(15+18*intensity):Math.round(15-5*intensity);
  var bgB=Math.round(26-8*intensity);
  document.body.style.background='rgb('+bgR+','+bgG+','+bgB+')';
  var pc=d.pct_24h>=0?'hausse':'baisse',pa=d.pct_24h>=0?'▲':'▼',ps=d.pct_24h>=0?'+':'';
  var pvNum=(d.price*d.quantite);
  var pvFmt=pvNum.toLocaleString('fr-CH',{minimumFractionDigits:2,maximumFractionDigits:2});
  var qFmt=(d.quantite||0).toLocaleString('fr-CH',{maximumFractionDigits:0});
  var pamHtml='';
  if(d.pam>0){
    var mult=(d.price/d.pam).toFixed(2);
    var pnl=((d.price-d.pam)*d.quantite).toFixed(2);
    var pnlS=parseFloat(pnl)>=0?'+':'';
    pamHtml='<div class="pam-line">×'+mult+' vs PAM '+fp(d.pam)+' CHF &nbsp;·&nbsp; P&L '+pnlS+pnl+' CHF</div>';
  }
  var tgt='';
  if(d.nextTarget){
    var rx=(d.nextTarget.prix/d.price).toFixed(1);
    // Barre de progression logarithmique depuis le min historique vers le palier
    var barPct=0;
    if(d.chart&&d.chart.length>1){
      var prices=d.chart.map(function(h){return h.p;});
      var logMin=Math.log(Math.min.apply(null,prices));
      var logTarget=Math.log(d.nextTarget.prix);
      var logNow=Math.log(d.price);
      barPct=Math.min(Math.max((logNow-logMin)/(logTarget-logMin)*100,0),100).toFixed(1);
    }
    var barColor=p24>=0?'linear-gradient(90deg,#1a6a4a,#9FE1CB)':'linear-gradient(90deg,#6a1a1a,#F4A4A4)';
    tgt='<div class="target-card">'+
      '🎯 Prochain palier&nbsp; <strong>'+d.nextTarget.label+'</strong>&nbsp; @ '+fp(d.nextTarget.prix)+' CHF'+
      '<span style="color:#a0b0c8">&nbsp;·&nbsp; ×'+rx+' à faire</span>'+
      '<div style="background:#0d1830;border-radius:12px;height:12px;overflow:hidden;margin-top:22px">'+
        '<div style="background:'+barColor+';height:100%;width:'+barPct+'%;border-radius:12px;transition:width 1s ease"></div>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:28px;color:#506080">'+
        '<span>📍 maintenant</span><span>'+barPct+'%</span><span>🎯 '+d.nextTarget.label+'</span>'+
      '</div>'+
    '</div>';
  }
  var athHtml='';
  if(d.ath>0){
    var athInfo=d.price>=d.ath?'<span style="color:#FFD966">🏆 Record actuel</span>':'<span style="color:#999">▼ '+(((d.price-d.ath)/d.ath)*100).toFixed(1)+'% vs ATH</span>';
    athHtml='<div class="ath-card">🏅 ATH&nbsp; <strong>'+fp(d.ath)+'</strong> CHF &nbsp;&nbsp;'+athInfo+'</div>';
  }
  // Distance au PAM
  var pamDistBadge='';
  if(d.pam>0&&d.price>0){
    var pamRatio=d.price/d.pam;
    if(pamRatio<1){
      var toReach=(d.pam/d.price).toFixed(1);
      pamDistBadge='<span style="background:rgba(255,180,0,0.12);color:#FFD966;border-radius:24px;padding:6px 20px;font-size:30px;font-weight:600">×'+toReach+' pour PAM ↑</span>';
    } else {
      pamDistBadge='<span style="background:rgba(100,220,160,0.12);color:#9FE1CB;border-radius:24px;padding:6px 20px;font-size:30px;font-weight:600">×'+pamRatio.toFixed(2)+' au-dessus PAM ✓</span>';
    }
  }
  // Prochain push
  var nextPushStr='';
  if(d.heures&&d.heures.length){
    var now2=new Date();
    var h2=now2.getHours(),m2=now2.getMinutes();
    var nextH=null;
    for(var i=0;i<d.heures.length;i++){if(d.heures[i]>h2){nextH=d.heures[i];break;}}
    if(nextH===null)nextH=d.heures[0];
    var diffMin=nextH>h2?(nextH-h2)*60-m2:(24-h2+nextH)*60-m2;
    var dh=Math.floor(diffMin/60),dm=diffMin%60;
    var diffStr=dh>0?dh+'h'+String(dm).padStart(2,'0'):dm+'min';
    nextPushStr=' &nbsp;·&nbsp; 🔔 '+String(nextH).padStart(2,'0')+':00 ('+diffStr+')';
  }
  var now=new Date();
  var ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  document.getElementById('dash').innerHTML=
    '<div class="price-hero">'+
      '<div class="price-main"><span class="'+pc+'">'+fp(d.price)+' CHF</span></div>'+
      '<div class="price-sub">'+
        '<span class="'+pc+'">'+pa+' '+ps+(d.pct_24h||0).toFixed(2)+'% (24h)</span>'+
        '<span class="rank-badge">#'+d.rank+' CMC</span>'+
        (pamDistBadge?pamDistBadge:'')+
      '</div>'+
    '</div>'+
    '<div class="chart-wrap"><div id="chart-area"></div><div id="chart-meta" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:0 4px"></div></div>'+
    '<div class="variations">'+
      '<div class="var-item"><div class="var-label">1h</div><div class="var-val">'+fc(d.pct_1h)+'</div></div>'+
      '<div class="var-item"><div class="var-label">24h</div><div class="var-val">'+fc(d.pct_24h)+'</div></div>'+
      '<div class="var-item"><div class="var-label">7j</div><div class="var-val">'+fc(d.pct_7d)+'</div></div>'+
    '</div>'+
    '<div class="section">'+
      '<div class="sec-title">Portfolio</div>'+
      '<div class="port-main">'+pvFmt+' CHF</div>'+
      '<div class="port-sub">'+qFmt+' BDAG &nbsp;·&nbsp; '+fp(d.price)+' CHF / BDAG</div>'+
      pamHtml+
    '</div>'+
    tgt+athHtml+
    '<div class="stats-grid">'+
      '<div class="stat-card"><div class="stat-label">🏦 Market Cap</div><div class="stat-value">'+fm(d.market_cap)+' CHF</div></div>'+
      '<div class="stat-card"><div class="stat-label">📦 Volume 24h</div><div class="stat-value">'+fm(d.volume_24h)+' CHF</div></div>'+
      '<div class="stat-card"><div class="stat-label">🔄 Circulation</div><div class="stat-value">'+fm(d.circulating)+' BDAG</div></div>'+
      '<div class="stat-card"><div class="stat-label">🏆 Rang CMC</div><div class="stat-value">#'+d.rank+'</div></div>'+
    '</div>'+
    '<div class="upd">↻ '+ts+nextPushStr+'</div>';
  setTimeout(function(){drawChart(d.chart,d.pam,d.targets||[],d.quantite||0);},50);
}
function loadDash(){
  var xhr=new XMLHttpRequest();
  xhr.open('GET',api('dashboard'),true);
  xhr.onload=function(){
    try{var d=JSON.parse(xhr.responseText);if(d.ok)render(d);else document.getElementById('dash').innerHTML='<div class="loading">❌</div>';}
    catch(e2){document.getElementById('dash').innerHTML='<div class="loading">❌</div>';}
  };
  xhr.onerror=function(){document.getElementById('dash').innerHTML='<div class="loading">❌ Réseau</div>';};
  xhr.send();
}
window.onload=function(){
  loadDash();
  setInterval(loadDash,600000);
};
function run(a){
  var btns=document.querySelectorAll('.btn');
  btns.forEach(function(b){b.disabled=true;});
  var st=document.getElementById('status');
  st.textContent='⏳ Envoi…';st.className='v';
  var xhr=new XMLHttpRequest();
  xhr.open('GET',api(a),true);
  xhr.onload=function(){
    try{var r=JSON.parse(xhr.responseText);st.textContent=r.ok?'✅ '+r.label:'❌ '+r.label;}
    catch(e2){st.textContent='✅ Push envoyé';}
    setTimeout(function(){btns.forEach(function(b){b.disabled=false;});st.className='';},2500);
  };
  xhr.onerror=function(){st.textContent='❌ Erreur réseau';btns.forEach(function(b){b.disabled=false;});};
  xhr.send();
}
</script>
</body>
</html>`).setTitle("BDAG Tracker");
}

// ------------------------------------------------------------
// Récupère le solde BDAG onchain — avec fallback mémoire
// ------------------------------------------------------------
function getBDAGquantite() {
  const props = PropertiesService.getScriptProperties();

  try {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method:  "eth_getBalance",
      params:  [BDAG_WALLET, "latest"],
      id:      1
    });

    const response = UrlFetchApp.fetch(BDAG_RPC_URL, {
      method:             "POST",
      contentType:        "application/json",
      payload:            payload,
      muteHttpExceptions: true
    });

    const data   = JSON.parse(response.getContentText());
    const weiHex = data.result;

    if (!weiHex) throw new Error("Pas de result dans la réponse RPC : " + response.getContentText());

    const balance = parseInt(weiHex, 16) / 1e18;

    if (balance > 0) {
      props.setProperty("bdag_quantite_last", balance.toString());
      props.setProperty("bdag_quantite_ts",   Date.now().toString());
      Logger.log("Solde onchain : " + balance + " BDAG (sauvegardé)");
      return { quantite: balance, source: "live" };
    }

    throw new Error("Solde RPC = 0 ou invalide");

  } catch(e) {
    Logger.log("⚠️ RPC échoué : " + e.message);

    const lastVal = props.getProperty("bdag_quantite_last");
    const lastTs  = props.getProperty("bdag_quantite_ts");

    if (lastVal) {
      const heuresEcoulees = ((Date.now() - parseInt(lastTs)) / 3600000).toFixed(1);
      Logger.log("Fallback mémoire : " + lastVal + " BDAG (il y a " + heuresEcoulees + "h)");
      return { quantite: parseFloat(lastVal), source: "cache", age: heuresEcoulees };
    }

    throw new Error("Solde indisponible — RPC échoué et aucun cache : " + e.message);
  }
}

// ------------------------------------------------------------
// Récupère le prix BDAG en CHF via CoinMarketCap
// ------------------------------------------------------------
function getBDAGpriceCHF_push() {
  return getBDAGmarketData().price;
}

// ------------------------------------------------------------
// Récupère les données marché complètes BDAG via CoinMarketCap
// ------------------------------------------------------------
function getBDAGmarketData() {
  const url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BDAG&convert=CHF";
  const options = {
    method: "GET",
    headers: {
      "X-CMC_PRO_API_KEY": CMC_API_KEY,
      "Accept": "application/json"
    },
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const data  = JSON.parse(response.getContentText());
  const coin  = data.data.BDAG;
  const quote = coin.quote.CHF;
  PropertiesService.getScriptProperties().setProperty("bdag_coin_id", coin.id.toString());
  return {
    price:       quote.price,
    volume_24h:  quote.volume_24h,
    market_cap:  quote.market_cap,
    pct_1h:      quote.percent_change_1h,
    pct_24h:     quote.percent_change_24h,
    pct_7d:      quote.percent_change_7d,
    circulating: coin.circulating_supply,
    max_supply:  coin.max_supply,
    rank:        coin.cmc_rank,
    id:          coin.id   // ID numérique CMC — utilisé pour l'URL du logo
  };
}

// ------------------------------------------------------------
// Envoi Pushover BDAG — bouton menu optionnel
// ------------------------------------------------------------
function sendPushoverBDAG(title, message, showButton, priority) {
  try {
    const payload = {
      token:   PUSHOVER_BDAG_TOKEN,
      user:    PUSHOVER_BDAG_USER,
      title:   title,
      message: message
    };

    // Priority : incluse uniquement si non-défaut — Pushover utilise 0 par défaut
    const prio = priority !== undefined ? Math.round(Number(priority)) : 0;
    if (prio !== 0) payload.priority = String(prio);

    if (showButton) {
      const btn         = actionButton();
      payload.url       = btn.url;
      payload.url_title = btn.url_title;
    }

    UrlFetchApp.fetch("https://api.pushover.net/1/messages.json", {
      method:  "post",
      payload: payload
    });
  } catch(e) {
    Logger.log("Erreur Pushover BDAG : " + e.message);
  }
}

// ------------------------------------------------------------
// Formate une variation en % avec flèche et signe — helper global
// ------------------------------------------------------------
function pctLine(label, val) {
  if (val == null) return `   ${label} N/A`;
  const sign  = val >= 0 ? "+" : "";
  const arrow = val > 0 ? "▲" : val < 0 ? "▼" : "—";
  return `${arrow} ${label} ${sign}${val.toFixed(2)}%`;
}

// ------------------------------------------------------------
// Retourne une ligne "prochain palier" — null si aucun défini
// ------------------------------------------------------------
function prochainPalier(prixActuel) {
  const raw = PropertiesService.getScriptProperties().getProperty("bdag_targets");
  if (!raw) return null;
  const targets = JSON.parse(raw);
  const prochain = targets.find(t => !t.atteint && t.prix > prixActuel);
  if (!prochain) return targets.length > 0 ? "🎯 Tous les paliers atteints ! 🎉" : null;
  const ratio = (prochain.prix / prixActuel).toFixed(2);
  return `🎯 Prochain : ${prochain.label} @ ${formatPrice(prochain.prix)} CHF (×${ratio})`;
}

// ------------------------------------------------------------
// Formate un grand nombre en M / Mrd
// ------------------------------------------------------------
function formatMillions(val) {
  if (val == null) return "N/A";
  if (val >= 1e9)  return (val / 1e9).toFixed(2) + " Mrd";
  if (val >= 1e6)  return (val / 1e6).toFixed(2) + " M";
  return val.toFixed(0);
}

// ------------------------------------------------------------
// Formate un prix — précision adaptée à la valeur
// ------------------------------------------------------------
function formatPrice(price) {
  if (price < 0.01)  return price.toFixed(6);
  if (price < 0.1)   return price.toFixed(4);
  return price.toFixed(3);
}

// ------------------------------------------------------------
// Flèche de tendance
// ------------------------------------------------------------
function tendance(diff) {
  if (diff > 0) return "📈";
  if (diff < 0) return "📉";
  return "➡️";
}

// ------------------------------------------------------------
// Formate la différence avec signe et %
// ------------------------------------------------------------
function formatDiff(current, previous) {
  const diff = current - previous;
  const pct  = (diff / previous) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${formatPrice(diff)} CHF (${sign}${pct.toFixed(2)}%)`;
}

// ------------------------------------------------------------
// Trouve l'entrée la plus proche d'un timestamp (sans tolérance)
// ------------------------------------------------------------
function trouveProche(history, cible) {
  if (history.length === 0) return null;
  return history.reduce((best, entry) =>
    Math.abs(entry.ts - cible) < Math.abs(best.ts - cible) ? entry : best
  );
}

// ------------------------------------------------------------
// Trouve l'entrée la plus proche d'un jour cible (±12h)
// ------------------------------------------------------------
function trouveProcheJour(history, tsJourCible) {
  if (history.length === 0) return null;
  const tolerance = 12 * 60 * 60 * 1000;
  const candidats = history.filter(e => Math.abs(e.ts - tsJourCible) < tolerance);
  if (candidats.length === 0) return null;
  return candidats.reduce((best, entry) =>
    Math.abs(entry.ts - tsJourCible) < Math.abs(best.ts - tsJourCible) ? entry : best
  );
}

// ------------------------------------------------------------
// Fonction principale — déclencheur toutes les 5 minutes
// ------------------------------------------------------------
function checkBDAGprice() {
  const props  = PropertiesService.getScriptProperties();
  const now    = new Date();
  const heure  = now.getHours();

  // ── Throttle CMC — appel au maximum toutes les INTERVALLE_CMC_MIN ──
  const lastCmcTs = parseInt(props.getProperty("bdag_last_cmc_ts") || "0");
  const tsNowMs   = Date.now();
  if ((tsNowMs - lastCmcTs) < INTERVALLE_CMC_MIN * 60 * 1000) return;
  props.setProperty("bdag_last_cmc_ts", tsNowMs.toString());

  // ── Données marché — un seul appel CMC par intervalle ───────
  const market     = getBDAGmarketData();
  const prixActuel = market.price;

  // Quantité depuis le cache Properties — pas de RPC à chaque tick
  const cachedQte  = parseFloat(props.getProperty("bdag_quantite_last") || "0");

  // ── Alertes critiques — réactivité maximale, toutes les 10 min ──
  checkATH(prixActuel);
  checkTargetsPrix(prixActuel, cachedQte);
  checkRangCMC(market.rank);

  // ── Suite réservée aux heures d'envoi planifiées ────────────
  if (!HEURES_ENVOI.includes(heure)) return;

  // Anti-doublon
  const lastSentKey = "bdag_last_sent_hour";
  const lastSent    = props.getProperty(lastSentKey);
  const nowKey      = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${heure}`;
  if (lastSent === nowKey) return;
  props.setProperty(lastSentKey, nowKey);

  const tsNow = now.getTime();

  // Solde onchain live — appel RPC uniquement aux heures planifiées
  let BDAG_QUANTITE = cachedQte;
  let sourceTag     = "";
  try {
    const { quantite, source, age } = getBDAGquantite();
    BDAG_QUANTITE = quantite;
    sourceTag     = source === "cache" ? ` ⚠️ cache ${age}h` : "";
  } catch(e) {
    Logger.log("⚠️ Quantité indisponible : " + e.message);
    sourceTag = " ⚠️ indisponible";
  }

  // Volume spike — échantillon quotidien, pas besoin de 5 min
  checkVolumeSpike(market.volume_24h);

  // Historique des prix
  const historyRaw = props.getProperty("bdag_history");
  const history    = historyRaw ? JSON.parse(historyRaw) : [];

  const entry4h  = trouveProche(history, tsNow - (4  * 60 * 60 * 1000));
  const entry24h = trouveProche(history, tsNow - (24 * 60 * 60 * 1000));

  history.push({ ts: tsNow, price: prixActuel });
  const limite = tsNow - (30 * 24 * 60 * 60 * 1000);
  props.setProperty("bdag_history", JSON.stringify(history.filter(e => e.ts >= limite)));

  // Push horaire — supprimé à 12h (remplacé par le bilan journalier)
  if (heure !== 12) {
    const heureStr = `${String(heure).padStart(2, "0")}:00`;
    const dateStr  = now.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

    let lines = [];
    lines.push(`💰 ${formatPrice(prixActuel)} CHF`);
    lines.push(`👛 ${(prixActuel * BDAG_QUANTITE).toFixed(2)} CHF (${BDAG_QUANTITE.toLocaleString("fr-CH", { maximumFractionDigits: 0 })} BDAG${sourceTag})`);
    lines.push(`🕐 ${dateStr} — ${heureStr}`);
    lines.push("─────────────────");

    if (entry4h) {
      const diff4h = prixActuel - entry4h.price;
      lines.push(`${tendance(diff4h)} vs 4h  : ${formatDiff(prixActuel, entry4h.price)}`);
      lines.push(`   (était : ${formatPrice(entry4h.price)} CHF)`);
    } else {
      lines.push("⏳ Pas encore de donnée 4h");
    }

    if (entry24h) {
      lines.push("─────────────────");
      const diff24h = prixActuel - entry24h.price;
      lines.push(`${tendance(diff24h)} vs 24h : ${formatDiff(prixActuel, entry24h.price)}`);
      lines.push(`   (était : ${formatPrice(entry24h.price)} CHF)`);
    }

    const titre = heure === 18
      ? `BDAG ${formatPrice(prixActuel)} CHF ${tendance(entry4h ? prixActuel - entry4h.price : 0)} — Bilan 24h`
      : `BDAG ${formatPrice(prixActuel)} CHF ${tendance(entry4h ? prixActuel - entry4h.price : 0)}`;

    sendPushoverBDAG(titre, lines.join("\n"), true);
    Logger.log("Push BDAG envoyé : " + titre);
  }

  // Bilan journalier — déclenché à 12h pile
  if (heure === 12) {
    const bilanKey  = "bdag_bilan_sent_day";
    const bilanSent = props.getProperty(bilanKey);
    const bilanDay  = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (bilanSent !== bilanDay) {
      props.setProperty(bilanKey, bilanDay);
      checkBDAGbilan();
    }
  }
}

// ------------------------------------------------------------
// Bilan journalier — J, J-7, J-14, J-21 + état du marché
// ------------------------------------------------------------
function checkBDAGbilan() {
  const props      = PropertiesService.getScriptProperties();
  const now        = new Date();
  const historyRaw = props.getProperty("bdag_history");
  const history    = historyRaw ? JSON.parse(historyRaw) : [];

  const market     = getBDAGmarketData();
  const prixActuel = market.price;

  let BDAG_QUANTITE = 0;
  let sourceTag     = " ⛓️ live";
  try {
    const { quantite, source, age } = getBDAGquantite();
    BDAG_QUANTITE = quantite;
    sourceTag     = source === "cache" ? ` ⚠️ cache ${age}h` : " ⛓️ live";
  } catch(e) {
    Logger.log("⚠️ Quantité indisponible : " + e.message);
    sourceTag = " ⚠️ indisponible";
  }

  const minuitAujourdhui = new Date(now);
  minuitAujourdhui.setHours(0, 0, 0, 0);
  const tsMinuit = minuitAujourdhui.getTime();

  const entry7  = trouveProcheJour(history, tsMinuit - 7  * 24 * 60 * 60 * 1000);
  const entry14 = trouveProcheJour(history, tsMinuit - 14 * 24 * 60 * 60 * 1000);
  const entry21 = trouveProcheJour(history, tsMinuit - 21 * 24 * 60 * 60 * 1000);

  function ligneComparaison(label, entry) {
    if (!entry) return `${label}\n   ⏳ Données non disponibles`;
    const valeur = (entry.price * BDAG_QUANTITE).toFixed(2);
    const diff   = prixActuel - entry.price;
    const pct    = (diff / entry.price) * 100;
    const signe  = diff >= 0 ? "+" : "";
    const fleche = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
    return (
      `${label}\n` +
      `   ${formatPrice(entry.price)} CHF · ${valeur} CHF\n` +
      `   ${fleche} ${signe}${formatPrice(diff)} CHF (${signe}${pct.toFixed(2)}%)`
    );
  }

  function ligneResume() {
    const entries = [{ price: prixActuel }, entry7, entry14, entry21].filter(Boolean);
    if (entries.length < 2) return "   Pas assez de données";
    const prix     = entries.map(e => e.price);
    const minP     = Math.min(...prix);
    const maxP     = Math.max(...prix);
    const oldest   = [entry21, entry14, entry7].find(e => e !== null);
    const deltaVal = ((prixActuel - oldest.price) * BDAG_QUANTITE).toFixed(2);
    const signe    = deltaVal >= 0 ? "+" : "";
    const fleche   = deltaVal >= 0 ? "▲" : "▼";
    return (
      `   Min : ${formatPrice(minP)} · Max : ${formatPrice(maxP)}\n` +
      `   ${fleche} Portefeuille ${signe}${deltaVal} CHF`
    );
  }

  const valeurActuelle = (prixActuel * BDAG_QUANTITE).toFixed(2);
  const dateStr = now.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

  const lines = [
    `╔═══════╗`,
    `║  BDAG BILAN ║`,
    `╚═══════╝`,
    ``,
    `💎 AUJOURD'HUI (${dateStr})`,
    `   ${formatPrice(prixActuel)} CHF · ${valeurActuelle} CHF`,
    `   👜 ${BDAG_QUANTITE.toLocaleString("fr-CH", { maximumFractionDigits: 0 })} BDAG${sourceTag}`,
    ``,
    `──────────────`,
    `📊 MARCHÉ`,
    `🏦 Market Cap : ${formatMillions(market.market_cap)} CHF`,
    `📦 Volume 24h : ${formatMillions(market.volume_24h)} CHF`,
    `🔄 Circulation : ${formatMillions(market.circulating)} BDAG`,
    market.max_supply ? `📋 Max Supply : ${formatMillions(market.max_supply)} BDAG` : null,
    `🏆 Rang CMC : #${market.rank}`,
    ``,
    `📈 VARIATIONS`,
    pctLine("1h  :", market.pct_1h),
    pctLine("24h :", market.pct_24h),
    pctLine("7j  :", market.pct_7d),
    ``,
    `──────────────`,
    ligneComparaison(`📅 J - 7`,  entry7),
    ``,
    ligneComparaison(`📅 J - 14`, entry14),
    ``,
    ligneComparaison(`📅 J - 21`, entry21),
    ``,
    `──────────────`,
    `📈 RÉSUMÉ 3 SEM.`,
    ligneResume(),
    ``,
    prochainPalier(prixActuel),
    `══════════════`
  ].filter(l => l !== null);

  const titre = `📊 BDAG ${formatPrice(prixActuel)} CHF — Bilan journalier`;
  sendPushoverBDAG(titre, lines.join("\n"), true);
  Logger.log("Bilan journalier BDAG envoyé.");
}

// ------------------------------------------------------------
// Push solde onchain
// ------------------------------------------------------------
function pushBDAGbalanceOnchain() {
  try {
    const { quantite: balance, source, age } = getBDAGquantite();
    const prixActuel = getBDAGpriceCHF_push();
    const valeurCHF  = (balance * prixActuel).toFixed(2);
    const now        = new Date();
    const dateStr    = now.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const heureStr   = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const sourceTag  = source === "cache" ? `⚠️ Cache (il y a ${age}h)` : "⛓️ Live blockchain";

    const lines = [
      `⛓️ SOLDE ONCHAIN`,
      ``,
      `👜 ${balance.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} BDAG`,
      `💰 ${formatPrice(prixActuel)} CHF / BDAG`,
      `💼 ${valeurCHF} CHF`,
      ``,
      `🕐 ${dateStr} — ${heureStr}`,
      `📡 ${sourceTag}`
    ];

    const titre = `⛓️ BDAG Onchain — ${balance.toLocaleString("fr-CH", { maximumFractionDigits: 0 })} BDAG`;
    sendPushoverBDAG(titre, lines.join("\n"), true);
    Logger.log("Push onchain envoyé : " + balance + " BDAG (" + source + ")");

  } catch(e) {
    sendPushoverBDAG("⚠️ BDAG Onchain — Erreur", "Impossible de lire le solde :\n" + e.message, false);
    Logger.log("Erreur onchain : " + e.message);
  }
}

// ------------------------------------------------------------
// Push stats marché BDAG (market cap, volume, variations, rang)
// ------------------------------------------------------------
function pushBDAGmarketStats() {
  try {
    const d   = getBDAGmarketData();
    const now = new Date();
    const dateStr  = now.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const heureStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    const lines = [
      `💰 Prix : ${formatPrice(d.price)} CHF`,
      `🏦 Market Cap : ${formatMillions(d.market_cap)} CHF`,
      `📦 Volume 24h : ${formatMillions(d.volume_24h)} CHF`,
      `🔄 Circulation : ${formatMillions(d.circulating)} BDAG`,
      d.max_supply ? `📋 Max Supply : ${formatMillions(d.max_supply)} BDAG` : null,
      `🏆 Rang CMC : #${d.rank}`,
      ``,
      `──────────────`,
      `📈 VARIATIONS`,
      pctLine("1h  :", d.pct_1h),
      pctLine("24h :", d.pct_24h),
      pctLine("7j  :", d.pct_7d),
      ``,
      `🕐 ${dateStr} — ${heureStr}`
    ].filter(l => l !== null);

    const titre = `📊 BDAG Market — ${formatPrice(d.price)} CHF · #${d.rank}`;
    sendPushoverBDAG(titre, lines.join("\n"), true);
    Logger.log("Push market stats BDAG envoyé.");
  } catch(e) {
    sendPushoverBDAG("⚠️ BDAG Market — Erreur", "Impossible de lire les stats :\n" + e.message, false);
    Logger.log("Erreur market stats : " + e.message);
  }
}

// ------------------------------------------------------------
// Alerte changement de rang CMC (seuil : ±RANG_ALERTE_SEUIL positions)
// ------------------------------------------------------------
function checkRangCMC(rangActuel) {
  const props   = PropertiesService.getScriptProperties();
  const lastRaw = props.getProperty("bdag_rang_last");
  props.setProperty("bdag_rang_last", rangActuel.toString());

  if (!lastRaw) return;

  const lastRang = parseInt(lastRaw);
  const delta    = lastRang - rangActuel;

  if (Math.abs(delta) < RANG_ALERTE_SEUIL) return;

  const hausse = delta > 0;
  const signe  = hausse ? "+" : "";
  const msg    = [
    `🏆 Rang actuel   : #${rangActuel}`,
    `📊 Rang précédent : #${lastRang}`,
    `${hausse ? "▲" : "▼"} ${signe}${delta} positions`
  ].join("\n");

  const titre = hausse
    ? `🚀 BDAG grimpe à #${rangActuel} CMC (+${delta} pos.)`
    : `⚠️ BDAG recule à #${rangActuel} CMC (${delta} pos.)`;

  sendPushoverBDAG(titre, msg, true);
  Logger.log(`Rang CMC : #${lastRang} → #${rangActuel} (${signe}${delta})`);
}

// ------------------------------------------------------------
// Paliers cibles — gestion depuis l'éditeur Apps Script
//   ajouterTarget(0.01, "×10")  — ajoute un palier
//   resetTargets()               — supprime tous les paliers
//   listerTargets()              — affiche dans les logs
// ------------------------------------------------------------
function ajouterTarget(prix, label) {
  const props   = PropertiesService.getScriptProperties();
  const raw     = props.getProperty("bdag_targets");
  const targets = raw ? JSON.parse(raw) : [];
  targets.push({ prix: prix, label: label, atteint: false });
  targets.sort((a, b) => a.prix - b.prix);
  props.setProperty("bdag_targets", JSON.stringify(targets));
  Logger.log(`Target ajouté : ${label} @ ${formatPrice(prix)} CHF`);
}

function resetTargets() {
  PropertiesService.getScriptProperties().deleteProperty("bdag_targets");
  Logger.log("Tous les targets ont été réinitialisés.");
}

function listerTargets() {
  const raw     = PropertiesService.getScriptProperties().getProperty("bdag_targets");
  const targets = raw ? JSON.parse(raw) : [];
  if (targets.length === 0) { Logger.log("Aucun target défini."); return; }
  targets.forEach(t =>
    Logger.log(`${t.atteint ? "✅" : "⏳"} ${t.label} @ ${formatPrice(t.prix)} CHF`)
  );
}

// ------------------------------------------------------------
// Vérifie les paliers cibles — appelé à chaque checkBDAGprice
// ------------------------------------------------------------
function checkTargetsPrix(prixActuel, quantite) {
  const props   = PropertiesService.getScriptProperties();
  const raw     = props.getProperty("bdag_targets");
  if (!raw) return;

  const targets  = JSON.parse(raw);
  let   modified = false;

  targets.forEach(t => {
    if (t.atteint || prixActuel < t.prix) return;

    t.atteint = true;
    modified  = true;

    const sim25  = simulCalc(prixActuel, quantite, 25);
    const sim50  = simulCalc(prixActuel, quantite, 50);
    const sim75  = simulCalc(prixActuel, quantite, 75);
    const sim100 = simulCalc(prixActuel, quantite, 100);

    const lines = [
      `💰 Prix actuel : ${formatPrice(prixActuel)} CHF`,
      `👜 Portefeuille : ${(prixActuel * quantite).toFixed(2)} CHF`,
      BDAG_PRIX_ACHAT_CHF > 0
        ? `📈 ×${(prixActuel / BDAG_PRIX_ACHAT_CHF).toFixed(1)} vs PAM ${formatPrice(BDAG_PRIX_ACHAT_CHF)} CHF`
        : null,
      ``,
      `──────────────`,
      `💡 SI TU VENDS`,
      `25%  → ${sim25.chfRecu} CHF${sim25.pnlTag}`,
      `   Reste : ${sim25.restantBDAG} BDAG`,
      `50%  → ${sim50.chfRecu} CHF${sim50.pnlTag}`,
      `   Reste : ${sim50.restantBDAG} BDAG`,
      `75%  → ${sim75.chfRecu} CHF${sim75.pnlTag}`,
      `   Reste : ${sim75.restantBDAG} BDAG`,
      `100% → ${sim100.chfRecu} CHF${sim100.pnlTag}`
    ].filter(l => l !== null);

    const titre = `🎯 Palier ${t.label} atteint ! BDAG > ${formatPrice(t.prix)} CHF`;
    sendPushoverBDAG(titre, lines.join("\n"), true, 1);
    Logger.log(`Target atteint : ${t.label} @ ${formatPrice(t.prix)} CHF`);
  });

  if (modified) props.setProperty("bdag_targets", JSON.stringify(targets));
}

// ------------------------------------------------------------
// Calcul d'un scénario de vente partielle
// ------------------------------------------------------------
function simulCalc(prix, quantite, pct) {
  const qteVendue = quantite * pct / 100;
  const chfRecu   = (qteVendue * prix).toFixed(2);
  const restant   = (quantite - qteVendue).toLocaleString("fr-CH", { maximumFractionDigits: 0 });
  let   pnlTag    = "";
  if (BDAG_PRIX_ACHAT_CHF > 0) {
    const pnl   = ((prix - BDAG_PRIX_ACHAT_CHF) * qteVendue).toFixed(2);
    const signe = parseFloat(pnl) >= 0 ? "+" : "";
    pnlTag = ` · P&L ${signe}${pnl} CHF`;
  }
  return { chfRecu, restantBDAG: restant, pnlTag };
}

// ------------------------------------------------------------
// Push simulateur de vente — 4 scénarios au prix actuel
// ------------------------------------------------------------
function pushSimulateurVente() {
  try {
    const market  = getBDAGmarketData();
    const prix    = market.price;
    let   quantite = 0;
    try {
      const { quantite: q } = getBDAGquantite();
      quantite = q;
    } catch(e) { Logger.log("⚠️ Quantité indisponible : " + e.message); }

    function lignePct(pct) {
      const s = simulCalc(prix, quantite, pct);
      return `${pct}% → ${s.chfRecu} CHF${s.pnlTag}\n   Reste : ${s.restantBDAG} BDAG`;
    }

    const pnlGlobal = BDAG_PRIX_ACHAT_CHF > 0 ? [
      ``,
      `📈 PAM : ${formatPrice(BDAG_PRIX_ACHAT_CHF)} CHF → ×${(prix / BDAG_PRIX_ACHAT_CHF).toFixed(2)}`,
      `   P&L total : ${((prix - BDAG_PRIX_ACHAT_CHF) * quantite).toFixed(2)} CHF`
    ] : [];

    const lines = [
      `💰 Prix : ${formatPrice(prix)} CHF`,
      `👜 Total : ${(prix * quantite).toFixed(2)} CHF`,
      ...pnlGlobal,
      ``,
      `──────────────`,
      `💡 SCÉNARIOS DE VENTE`,
      ``,
      lignePct(25),
      ``,
      lignePct(50),
      ``,
      lignePct(75),
      ``,
      lignePct(100)
    ];

    const titre = `💰 Simulateur vente — ${formatPrice(prix)} CHF`;
    sendPushoverBDAG(titre, lines.join("\n"), true);
    Logger.log("Simulateur vente envoyé.");
  } catch(e) {
    sendPushoverBDAG("⚠️ Simulateur — Erreur", e.message, false);
    Logger.log("Erreur simulateur : " + e.message);
  }
}

// ------------------------------------------------------------
// Tracker ATH — push priorité haute si nouveau record
// ------------------------------------------------------------
function checkATH(prix) {
  const props  = PropertiesService.getScriptProperties();
  const athRaw = props.getProperty("bdag_ath");
  const ath    = athRaw ? parseFloat(athRaw) : 0;

  if (prix <= ath) return;

  props.setProperty("bdag_ath", prix.toString());

  const lines = [
    `💰 Nouveau record : ${formatPrice(prix)} CHF`,
    ath > 0 ? `📊 Ancien ATH : ${formatPrice(ath)} CHF (+${((prix - ath) / ath * 100).toFixed(2)}%)` : null,
    BDAG_PRIX_ACHAT_CHF > 0
      ? `📈 ×${(prix / BDAG_PRIX_ACHAT_CHF).toFixed(2)} vs PAM ${formatPrice(BDAG_PRIX_ACHAT_CHF)} CHF`
      : null
  ].filter(l => l !== null);

  sendPushoverBDAG(`🏆 BDAG — Nouveau ATH ! ${formatPrice(prix)} CHF`, lines.join("\n"), true, 1);
  Logger.log(`Nouveau ATH BDAG : ${formatPrice(prix)} CHF`);
}

// ------------------------------------------------------------
// Alerte volume inhabituel — comparaison vs moyenne 7 jours
// ------------------------------------------------------------
function checkVolumeSpike(volumeActuel) {
  const props = PropertiesService.getScriptProperties();
  const now   = Date.now();

  const raw  = props.getProperty("bdag_volume_history");
  const vols = raw ? JSON.parse(raw) : [];
  vols.push({ ts: now, vol: volumeActuel });
  const filtres = vols.filter(v => v.ts >= now - 7 * 24 * 60 * 60 * 1000);
  props.setProperty("bdag_volume_history", JSON.stringify(filtres));

  if (filtres.length < 4) return;

  const spikeDayKey = "bdag_volume_spike_day";
  const today = new Date().toDateString();
  if (props.getProperty(spikeDayKey) === today) return;

  const precedents = filtres.slice(0, -1);
  const moyenne    = precedents.reduce((s, v) => s + v.vol, 0) / precedents.length;

  if (volumeActuel < moyenne * VOLUME_SPIKE_RATIO) return;

  props.setProperty(spikeDayKey, today);
  const ratio = (volumeActuel / moyenne).toFixed(1);

  const lines = [
    `📦 Volume actuel : ${formatMillions(volumeActuel)} CHF`,
    `📊 Moyenne 7j    : ${formatMillions(moyenne)} CHF`,
    `⚡ Ratio         : ×${ratio} vs moyenne`
  ].join("\n");

  sendPushoverBDAG(`⚡ BDAG — Volume ×${ratio} inhabituel !`, lines, true, 1);
  Logger.log(`Volume spike BDAG : ×${ratio} (${formatMillions(volumeActuel)} CHF)`);
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
function resetLastSent() {
  PropertiesService.getScriptProperties().deleteProperty("bdag_last_sent_hour");
}

function debugBilan() {
  const props = PropertiesService.getScriptProperties();
  const now   = new Date();

  const cacheTs      = props.getProperty("bdag_quantite_ts");
  const cacheAge     = cacheTs ? ((Date.now() - parseInt(cacheTs)) / 3600000).toFixed(1) + "h" : "—";
  const historyLen   = JSON.parse(props.getProperty("bdag_history")       || "[]").length;
  const volumeLen    = JSON.parse(props.getProperty("bdag_volume_history") || "[]").length;
  const targetsRaw   = props.getProperty("bdag_targets");
  const targets      = targetsRaw ? JSON.parse(targetsRaw) : [];

  Logger.log("═══════ DEBUG BDAG TRACKER ═══════");
  Logger.log("Heure actuelle    : " + now.getHours() + "h");
  Logger.log("Dernier push      : " + (props.getProperty("bdag_last_sent_hour") || "—"));
  Logger.log("Bilan envoyé le   : " + (props.getProperty("bdag_bilan_sent_day") || "—"));
  Logger.log("─────────────────────────────────");
  Logger.log("Solde en cache    : " + (props.getProperty("bdag_quantite_last") || "—") + " BDAG");
  Logger.log("Âge cache solde   : " + cacheAge);
  Logger.log("─────────────────────────────────");
  const lastCmc    = props.getProperty("bdag_last_cmc_ts");
  const lastCmcAge = lastCmc ? ((Date.now() - parseInt(lastCmc)) / 60000).toFixed(1) + " min" : "—";
  Logger.log("Dernier appel CMC : il y a " + lastCmcAge + " (intervalle : " + INTERVALLE_CMC_MIN + " min)");
  Logger.log("Historique prix   : " + historyLen + " entrées (30j max)");
  Logger.log("Historique volume : " + volumeLen  + " entrées (7j max)");
  Logger.log("ATH enregistré    : " + (props.getProperty("bdag_ath") || "—") + " CHF");
  Logger.log("Rang CMC sauvé    : #" + (props.getProperty("bdag_rang_last") || "—"));
  Logger.log("─────────────────────────────────");
  if (targets.length === 0) {
    Logger.log("Paliers cibles    : aucun défini");
  } else {
    Logger.log("Paliers cibles    : " + targets.length + " définis");
    targets.forEach(t => Logger.log(`  ${t.atteint ? "✅" : "⏳"} ${t.label} @ ${formatPrice(t.prix)} CHF`));
  }
  Logger.log("══════════════════════════════════");
}

function debugIcon() {
  const props  = PropertiesService.getScriptProperties();
  const coinId = props.getProperty("bdag_coin_id");
  if (!coinId) {
    Logger.log("⚠️ bdag_coin_id non défini — exécute testBDAGpush() pour le peupler");
    return;
  }
  Logger.log("bdag_coin_id : " + coinId);
  Logger.log("URL icône 64px  : https://s2.coinmarketcap.com/static/img/coins/64x64/"  + coinId + ".png");
  Logger.log("URL icône 128px : https://s2.coinmarketcap.com/static/img/coins/128x128/" + coinId + ".png");
}

function testBDAGpush() {
  let BDAG_QUANTITE = 0;
  try {
    const { quantite } = getBDAGquantite();
    BDAG_QUANTITE = quantite;
  } catch(e) {
    Logger.log("⚠️ Quantité indisponible : " + e.message);
  }
  const price  = getBDAGpriceCHF_push();
  const valeur = (price * BDAG_QUANTITE).toFixed(2);
  sendPushoverBDAG(
    `🧪 Test BDAG — ${formatPrice(price)} CHF`,
    `💰 ${formatPrice(price)} CHF\n👛 ${valeur} CHF (${BDAG_QUANTITE.toLocaleString("fr-CH", { maximumFractionDigits: 0 })} BDAG)\nTest manuel ✅`,
    true
  );
}

function testBDAGbilan() {
  checkBDAGbilan();
}

function testBDAGmarket() {
  pushBDAGmarketStats();
}

function testSimulateurVente() {
  pushSimulateurVente();
}

function testRangCMC() {
  PropertiesService.getScriptProperties().setProperty("bdag_rang_last", "320");
  checkRangCMC(310);
}

function testATH() {
  PropertiesService.getScriptProperties().setProperty("bdag_ath", "0.000001");
  checkATH(getBDAGpriceCHF_push());
}

function testVolumeSpike() {
  const props = PropertiesService.getScriptProperties();
  const fakeHistory = [1,2,3,4,5].map((i, idx) => ({
    ts:  Date.now() - (idx + 1) * 24 * 60 * 60 * 1000,
    vol: 1000
  }));
  props.setProperty("bdag_volume_history", JSON.stringify(fakeHistory));
  props.deleteProperty("bdag_volume_spike_day");
  checkVolumeSpike(getBDAGmarketData().volume_24h);
}

// ------------------------------------------------------------
// Configure tes paliers cibles — à éditer puis exécuter
// ------------------------------------------------------------
function configurerMesPaliers() {
  resetTargets();
  ajouterTarget(0.001,  "×2");    // Adapte les prix et étiquettes à tes objectifs
  ajouterTarget(0.005,  "×10");
  ajouterTarget(0.01,   "×20");
  ajouterTarget(0.05,   "×100");
  listerTargets();
}
