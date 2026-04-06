	'use strict';
	// ═══════════════════════════════════════════════════════════════════════
	// GLOBAL STATE
	// ═══════════════════════════════════════════════════════════════════════
	let D = null;
	let ACTIVE_VIEW = 'overview';
	let ACTIVE_ROLE = 'admin';
	let NET_VIEW = 'topology'; // 'topology' | 'table'
	const ROLE_VIEWS = {
	  admin:   null,
	  manager: ['overview','hostpools','cost','fslogix','rbac'],
	  sd:      ['overview','sessionhosts','sessions','hostpools'],
	  finops:  ['overview','cost','scaling','hostpools'],
	};

	const $ = id => document.getElementById(id);
	const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
	const esc = s => { const d=document.createElement('div'); d.textContent=String(s??''); return d.innerHTML; };
	const fmt = n => n==null ? '—' : Number(n).toLocaleString();
	const fmtCur = (n,c) => n==null?'—':(c||'')+' '+(+n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
	const scoreColor = v => v>=90?'var(--green)':v>=70?'var(--amber)':'var(--red)';
	function statusPill(s){
	  const m={Available:'p-green',Unavailable:'p-red',NeedsAssistance:'p-orange',Shutdown:'p-gray',Disconnected:'p-amber'};
	  return m[s]||'p-gray';
	}
	function statusDotClass(s){ return (s||'other').toLowerCase().replace(/\s/g,''); }

	// ── Theme toggle ──────────────────────────────────────────────────
	let DARK_MODE = true;
	function toggleTheme(){
	  DARK_MODE=!DARK_MODE;
	  document.body.classList.toggle('light',!DARK_MODE);
	  $('theme-toggle').textContent=DARK_MODE?'🌙':'☀️';
	  try{ localStorage.setItem('avdi-theme',DARK_MODE?'dark':'light'); }catch(e){}
	}
	// Restore saved preference
	(function(){
	  try{
		const saved=localStorage.getItem('avdi-theme');
		if(saved==='light'){ DARK_MODE=false; document.body.classList.add('light'); $('theme-toggle') && ($('theme-toggle').textContent='☀️'); }
	  }catch(e){}
	})();

	// ── KPI counter animation ─────────────────────────────────────────
	function animateKPIs(container){
	  if(!container) return;
	  container.querySelectorAll('.kpi-value').forEach((el,i)=>{
		const raw=el.textContent.replace(/[^0-9.]/g,'');
		const num=parseFloat(raw);
		if(!raw||isNaN(num)||num===0) return;
		const prefix=el.textContent.match(/^[^0-9]*/)?.[0]||'';
		const suffix=el.textContent.match(/[^0-9.]+$/)?.[0]||'';
		const isInt=Number.isInteger(num);
		const dur=Math.min(500+num*0.5,900);
		const delay=i*60;
		el.classList.add('animating');
		setTimeout(()=>{
		  const t0=performance.now();
		  el.textContent=prefix+'0'+suffix;
		  function tick(now){
			const p=Math.min((now-t0)/dur,1);
			const ease=1-Math.pow(1-p,3);
			const val=isInt?Math.round(ease*num):(ease*num).toFixed(1);
			el.textContent=prefix+(Number(val)>=1000?Number(val).toLocaleString():val)+suffix;
			if(p<1) requestAnimationFrame(tick);
			else el.classList.remove('animating');
		  }
		  requestAnimationFrame(tick);
		},delay);
	  });
	}

	// ── Health ring animated SVG ──────────────────────────────────────
	function healthRing(pct,color,size=72){
	  const r=28,cx=size/2,cy=size/2,circ=2*Math.PI*r;
	  const target=circ*(1-(pct/100));
	  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="health-ring-svg-animated">
		<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
		<circle class="ring-fill" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
		  stroke-dasharray="${circ}" stroke-dashoffset="${circ}" stroke-linecap="round"
		  transform="rotate(-90 ${cx} ${cy})" data-target="${target}"/>
		<text x="${cx}" y="${cy+5}" text-anchor="middle" fill="${color}"
		  font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="15">${pct}%</text>
	  </svg>`;
	}
	function animateRings(container){
	  if(!container) return;
	  container.querySelectorAll('circle.ring-fill[data-target]').forEach((ring,i)=>{
		const target=parseFloat(ring.getAttribute('data-target'));
		if(isNaN(target)) return;
		ring.style.strokeDashoffset=ring.getAttribute('stroke-dasharray');
		ring.style.transition='none';
		requestAnimationFrame(()=>requestAnimationFrame(()=>{
		  ring.style.transition=`stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1) ${i*150}ms`;
		  ring.style.strokeDashoffset=target;
		}));
	  });
	}

	// ── Row stagger helper ────────────────────────────────────────────
	function staggerRows(container){
	  if(!container) return;
	  container.querySelectorAll('.row-stagger').forEach((r,i)=>{
		r.style.animationDelay=(i*30)+'ms';
	  });
	}


	// ── Utility helpers ───────────────────────────────────────────────
	function patchStatus(lastUpdate){
	  if(!lastUpdate||lastUpdate==='—') return {cls:'p-gray pill',label:'Unknown',days:null};
	  try{
		const d=new Date(lastUpdate.replace(' ','T'));
		const days=Math.floor((Date.now()-d.getTime())/(1000*60*60*24));
		if(isNaN(days)) return {cls:'p-gray pill',label:'Unknown',days:null};
		if(days<=30)  return {cls:'patch-ok pill',  label:days+'d ago',    days};
		if(days<=60)  return {cls:'patch-warn pill', label:days+'d ago ⚑', days};
		return            {cls:'patch-old pill',  label:days+'d ago ⚠', days};
	  }catch(e){ return {cls:'p-gray pill',label:'—',days:null}; }
	}

	function portalLink(resourceId, label){
	  if(!resourceId) return '';
	  const url='https://portal.azure.com/#resource'+resourceId;
	  return `<a class="portal-link" href="${esc(url)}" target="_blank" title="Open in Azure Portal">🔗 ${label||'Portal'}</a>`;
	}

	function copyToClipboard(text, btn){
	  const doIt = () => {
		if(btn){ btn.classList.add('copied'); btn.textContent='✓';
		  setTimeout(()=>{ btn.classList.remove('copied'); btn.textContent='⧉'; },1500); }
	  };
	  if(navigator.clipboard?.writeText){
		navigator.clipboard.writeText(text).then(doIt).catch(()=>{
		  fallbackCopy(text); doIt();
		});
	  } else { fallbackCopy(text); doIt(); }
	}
	function fallbackCopy(text){
	  const ta=document.createElement('textarea');
	  ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
	  document.body.appendChild(ta); ta.select();
	  try{ document.execCommand('copy'); }catch(e){}
	  document.body.removeChild(ta);
	}
	function copyBtn(text){
	  if(!text) return '';
	  return `<button class="copy-btn" title="Copy to clipboard" onclick="copyToClipboard('${esc(text).replace(/'/g,'&#39;')}',this)">⧉</button>`;
	}

	function checkStaleBanner(){
	  if(!D||!D.generatedAt) return;
	  try{
		const collected=new Date(D.generatedAt);
		const days=Math.floor((Date.now()-collected.getTime())/(1000*60*60*24));
		const banner=$('stale-banner');
		const text=$('stale-banner-text');
		if(!banner||!text) return;
		if(days>=7){
		  text.textContent='Data collected '+days+' day'+(days!==1?'s':'')+' ago — consider re-running the collector for current data.';
		  banner.style.display='flex';
		  if(days>=30){
			banner.style.background='rgba(239,68,68,0.07)';
			banner.style.borderColor='rgba(239,68,68,0.3)';
			banner.style.color='var(--red)';
		  }
		} else {
		  banner.style.display='none';
		}
	  }catch(e){}
	}

	(function tick(){
	  const el=$('live-clock');
	  if(el) el.textContent=new Date().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
	  setTimeout(tick,1000);
	})();

	// ── File loading ──────────────────────────────────────────────────
	function loadFile(e){
	  const f=e.target.files[0]; if(!f) return;
	  setStatus('wait','LOADING…');
	  const r=new FileReader();
	  r.onload=ev=>{ try{ initData(JSON.parse(ev.target.result)); }catch(err){ setStatus('idle','PARSE ERROR'); alert('Invalid JSON: '+err.message); } };
	  r.readAsText(f);
	}
	function setStatus(cls,txt){ const el=$('hdr-status'); el.className='status-'+cls; el.textContent=txt; }

	function initData(json){
	  D=json;
	  setStatus('ok','DATA LOADED');
	  $('hdr-meta').style.display='flex';
	  $('hdr-sub').textContent=D.subscriptionName||D.subscriptionId||'—';
	  $('hdr-tenant').textContent=D.tenantName||D.tenantId||'—';
	  $('hdr-col').textContent=D.generatedAt?(new Date(D.generatedAt).toLocaleString()):'—';
	  $('export-btn').style.display='flex';
	  $('landing').style.display='none';
	  $('sidebar').style.display='flex';
	  const kbHint=$('kb-hint'); if(kbHint) kbHint.style.display='inline';
	  document.body.setAttribute('data-sub', D.subscriptionName||D.subscriptionId||'AVD Intelligence');
	  updateBadges();
	  checkStaleBanner();
	  navTo('overview');
	}

	function setRole(role){
	  ACTIVE_ROLE=role;
	  document.querySelectorAll('.role-btn').forEach(b=>b.classList.toggle('active',b.dataset.role===role));
	  const allowed=ROLE_VIEWS[role];
	  document.querySelectorAll('.nav-item[data-view]').forEach(item=>{
		const v=item.dataset.view;
		if(!allowed||allowed.includes(v)){ item.classList.remove('role-hidden'); }
		else{ item.classList.add('role-hidden'); if(ACTIVE_VIEW===v) navTo('overview'); }
	  });
	  document.querySelectorAll('#sidebar .nav-section-label').forEach(label=>{
		let el=label.nextElementSibling, hasVisible=false;
		while(el&&!el.classList.contains('nav-section-label')){
		  if(el.classList.contains('nav-item')&&!el.classList.contains('role-hidden')) hasVisible=true;
		  el=el.nextElementSibling;
		}
		label.style.display=hasVisible?'':'none';
	  });
	}


	// ── Network Topology SVG renderer ────────────────────────────────
	// Uses string concatenation throughout — NO nested template literals
	function buildTopologySVG(net, hps, shs){
	  const vnets   = arr(net.virtualNetworks);
	  const nats    = arr(net.natGateways);
	  const basts   = arr(net.bastionHosts);
	  const nsgsAll = arr(net.networkSecurityGroups);
	  if(!vnets.length) return null;

	  // Layout constants
	  const MARGIN=24, COL_W=180, VNET_X=MARGIN+COL_W+40, VNET_W=520;
	  const SUBNET_PAD=12, SUBNET_H=80, SH_R=10, SH_COLS=4;
	  const ROW_GAP=16, VNET_GAP=40, HDR_H=36;

	  // Colours
	  const CYAN='#00d4ff', CYAN_DIM='#00a8cc', GREEN='#10b981', RED='#ef4444';
	  const AMBER='#f59e0b', PURPLE='#8b5cf6', BLUE='#3b82f6';
	  const DARK='#0d1117', PANEL='#111720', BORDER='#1e3a5f', MUTED='#3d5270';
	  const TEXT_SEC='#7a9bbf';

	  function statusColor(st){
		return {Available:GREEN,Unavailable:RED,NeedsAssistance:AMBER,Shutdown:MUTED,Disconnected:AMBER}[st]||MUTED;
	  }

	  function vnetHeight(vnet){
		let h=HDR_H+SUBNET_PAD;
		arr(vnet.subnets).forEach(function(sn){
		  var hosts=sn.sessionHostCount||0;
		  var rows=hosts>0?Math.ceil(hosts/SH_COLS):0;
		  h+=SUBNET_H+(rows>1?(rows-1)*28:0)+ROW_GAP;
		});
		return Math.max(h+SUBNET_PAD, HDR_H+SUBNET_PAD*2+SUBNET_H);
	  }

	  var vnetHeights=vnets.map(vnetHeight);
	  var totalH=MARGIN*2+vnetHeights.reduce(function(a,h){return a+h+VNET_GAP;},0)-VNET_GAP;
	  var totalW=VNET_X+VNET_W+MARGIN+COL_W/2+20;

	  var p=[]; // SVG parts array

	  p.push('<svg class="topo-svg" width="'+totalW+'" height="'+totalH+'" viewBox="0 0 '+totalW+' '+totalH+'" xmlns="http://www.w3.org/2000/svg">');
	  p.push('<rect width="'+totalW+'" height="'+totalH+'" fill="'+DARK+'"/>');
	  p.push('<defs>'
		+'<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">'
		+'<circle cx="10" cy="10" r="0.8" fill="'+MUTED+'" opacity="0.3"/></pattern>'
		+'<marker id="arr-c" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">'
		+'<path d="M0,0 L0,6 L8,3 z" fill="'+CYAN_DIM+'" opacity="0.7"/></marker>'
		+'<marker id="arr-g" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">'
		+'<path d="M0,0 L0,6 L8,3 z" fill="'+GREEN+'" opacity="0.7"/></marker>'
		+'<marker id="arr-a" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">'
		+'<path d="M0,0 L0,6 L8,3 z" fill="'+AMBER+'" opacity="0.7"/></marker>'
		+'<marker id="arr-p" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">'
		+'<path d="M0,0 L0,6 L8,3 z" fill="'+PURPLE+'" opacity="0.7"/></marker>'
		+'</defs>');
	  p.push('<rect width="'+totalW+'" height="'+totalH+'" fill="url(#grid)"/>');

	  // Internet node — centred vertically
	  var intX=MARGIN+8, internetY=totalH/2-10;
	  var usersY=MARGIN+36;

	  // Users / Devices node
	  p.push('<g class="topo-node" onclick="openFlyout(\'User Devices\',\'<p style=&quot;font-size:11px;color:var(--text-muted)&quot;>End-user devices connect via Windows App or Remote Desktop Client. Sessions are brokered through Azure Front Door — no inbound firewall ports required on session hosts.</p>\')">'
		+'<rect x="'+(intX-4)+'" y="'+(usersY-16)+'" width="68" height="32" rx="5" fill="#071520" stroke="'+CYAN_DIM+'" stroke-width="1.5"/>'
		+'<text x="'+(intX+30)+'" y="'+(usersY)+'" text-anchor="middle" font-size="15">&#128101;</text>'
		+'<text x="'+(intX+30)+'" y="'+(usersY+13)+'" text-anchor="middle" font-family="monospace" font-size="7" fill="'+CYAN+'">USERS</text>'
		+'</g>');
	  p.push('<line x1="'+(intX+30)+'" y1="'+(usersY+16)+'" x2="'+(intX+30)+'" y2="'+(internetY-16)+'" stroke="'+CYAN_DIM+'" stroke-width="1" stroke-dasharray="3,2" marker-end="url(#arr-c)" opacity="0.5"/>');

	  // Internet node
	  p.push('<g class="topo-node" onclick="openFlyout(\'Internet\',\'<p style=&quot;font-size:11px;color:var(--text-muted)&quot;>Outbound: session hosts reach internet via NAT Gateway. Inbound: user sessions via Azure Front Door reverse connect — no public inbound ports required on session hosts.</p>\')">'
		+'<rect x="'+(intX-4)+'" y="'+(internetY-14)+'" width="68" height="28" rx="4" fill="'+PANEL+'" stroke="'+BORDER+'" stroke-width="1"/>'
		+'<text x="'+(intX+30)+'" y="'+(internetY-1)+'" text-anchor="middle" font-size="13">&#127757;</text>'
		+'<text x="'+(intX+30)+'" y="'+(internetY+12)+'" text-anchor="middle" font-family="monospace" font-size="8" fill="'+TEXT_SEC+'">INTERNET</text>'
		+'</g>');

	  var vnetY=MARGIN;
	  vnets.forEach(function(vnet, vi){
		var vh=vnetHeights[vi];
		var subs=arr(vnet.subnets);
		var peers=arr(vnet.peerings);
		var hasPeer=peers.length>0;
		var natName=(subs.find(function(s){return s.natGatewayName;})||{}).natGatewayName;
		var nat=natName?nats.find(function(n){return n.name===natName;}):null;
		var bas=basts.find(function(b){return subs.some(function(s){return s.name==='AzureBastionSubnet';});});
		var vnetCY=vnetY+vh/2;
		var natX=MARGIN+COL_W/2;

		// VNet box
		var vnetStroke=hasPeer?PURPLE:CYAN_DIM;
		var vnetFill=hasPeer?'#150820':'#0d1830';
		p.push('<rect x="'+VNET_X+'" y="'+vnetY+'" width="'+VNET_W+'" height="'+vh+'" rx="8" fill="'+PANEL+'" stroke="'+vnetStroke+'" stroke-width="'+(hasPeer?'1.5':'1')+'"/>');
		p.push('<rect x="'+VNET_X+'" y="'+vnetY+'" width="'+VNET_W+'" height="'+HDR_H+'" rx="8" fill="'+vnetFill+'" stroke="'+vnetStroke+'" stroke-width="'+(hasPeer?'1.5':'1')+'"/>');
		p.push('<rect x="'+VNET_X+'" y="'+(vnetY+HDR_H-6)+'" width="'+VNET_W+'" height="6" fill="'+vnetFill+'"/>');

		// VNet header — clickable
		var vj=JSON.stringify({id:vnet.id,name:vnet.name,addressSpace:vnet.addressSpace,location:vnet.location,resourceGroup:vnet.resourceGroup,dnsServers:vnet.dnsServers,peerings:vnet.peerings}).replace(/"/g,'&quot;');
		p.push('<g class="topo-node" onclick="openNetFlyout(\'vnet\','+vj+')">'
		  +'<text x="'+(VNET_X+14)+'" y="'+(vnetY+16)+'" font-family="monospace" font-size="13" font-weight="700" fill="'+(hasPeer?PURPLE:CYAN)+'">&#127760; '+esc(vnet.name)+'</text>'
		  +'<text x="'+(VNET_X+14)+'" y="'+(vnetY+29)+'" font-family="monospace" font-size="8" fill="'+TEXT_SEC+'">'+esc(arr(vnet.addressSpace).join(', '))+' &middot; '+esc(vnet.location||'')+'</text>'
		  +(hasPeer?'<text x="'+(VNET_X+VNET_W-85)+'" y="'+(vnetY+22)+'" font-family="monospace" font-size="8" fill="'+PURPLE+'">&#x21BA; Hub-Spoke</text>':'')
		  +'</g>');

		// Subnets
		var subY=vnetY+HDR_H+SUBNET_PAD;
		var SUB_X=VNET_X+SUBNET_PAD, SUB_W=VNET_W-SUBNET_PAD*2;
		subs.forEach(function(sn){
		  var hosts=sn.sessionHostCount||0;
		  var rows=Math.ceil(hosts/SH_COLS)||0;
		  var sh=rows>0?SUBNET_H+(rows-1)*28:SUBNET_H;
		  var isBas=sn.name==='AzureBastionSubnet';
		  var hasNat=!!sn.natGatewayName, hasNsg=!!sn.nsgName;
		  var nsg=hasNsg?nsgsAll.find(function(n){return n.name===sn.nsgName;}):null;
		  var nsgF=nsg?arr(nsg.securityFindings).length:0;
		  var snCol=isBas?PURPLE:(!hasNat&&hosts>0)?AMBER:CYAN_DIM;
		  var snFill=isBas?'#1a0830':(!hasNat&&hosts>0)?'#1a1200':'#071520';
		  var snJ=JSON.stringify({name:sn.name,addressPrefix:sn.addressPrefix,associatedHostPool:sn.associatedHostPool,natGatewayName:sn.natGatewayName,nsgName:sn.nsgName,serviceEndpoints:sn.serviceEndpoints,sessionHostCount:hosts,sessionHostNames:sn.sessionHostNames,warning:sn.warning}).replace(/"/g,'&quot;');

		  // Subnet box
		  p.push('<g class="topo-node" onclick="openNetFlyout(\'subnet\','+snJ+')">'
			+'<rect x="'+SUB_X+'" y="'+subY+'" width="'+SUB_W+'" height="'+sh+'" rx="5" fill="'+snFill+'" stroke="'+snCol+'" stroke-width="1"'+(isBas?' stroke-dasharray="4,2"':'')+'"/>'
			+'<text x="'+(SUB_X+10)+'" y="'+(subY+14)+'" font-family="monospace" font-size="10" fill="'+snCol+'" font-weight="700">'+esc(sn.name)+'</text>'
			+'<text x="'+(SUB_X+10)+'" y="'+(subY+26)+'" font-family="monospace" font-size="8" fill="'+TEXT_SEC+'">'+esc(sn.addressPrefix||'')+'</text>'
			+'</g>');

		  // NAT pill
		  if(hasNat){
			p.push('<rect x="'+(SUB_X+SUB_W-96)+'" y="'+(subY+6)+'" width="88" height="14" rx="3" fill="#10b98120" stroke="'+GREEN+'" stroke-width="0.5"/>'
			  +'<text x="'+(SUB_X+SUB_W-89)+'" y="'+(subY+16)+'" font-family="monospace" font-size="8" fill="'+GREEN+'">&#x1F500; '+esc(sn.natGatewayName)+'</text>');
		  } else if(hosts>0){
			p.push('<rect x="'+(SUB_X+SUB_W-80)+'" y="'+(subY+6)+'" width="72" height="14" rx="3" fill="#f59e0b20" stroke="'+AMBER+'" stroke-width="0.5"/>'
			  +'<text x="'+(SUB_X+SUB_W-74)+'" y="'+(subY+16)+'" font-family="monospace" font-size="8" fill="'+AMBER+'">&#9888; No NAT GW</text>');
		  }

		  // NSG pill
		  if(hasNsg&&nsg){
			var nsgJ=JSON.stringify({id:nsg.id,name:nsg.name,associatedSubnets:nsg.associatedSubnets,securityRules:nsg.securityRules,securityFindings:nsg.securityFindings}).replace(/"/g,'&quot;');
			var nsgBg=nsgF>0?'#ef444420':'#3b82f620', nsgCol=nsgF>0?RED:BLUE;
			p.push('<g class="topo-node" onclick="event.stopPropagation();openNetFlyout(\'nsg\','+nsgJ+')">'
			  +'<rect x="'+(SUB_X+10)+'" y="'+(subY+30)+'" width="'+(sn.nsgName.length*6+28)+'" height="14" rx="3" fill="'+nsgBg+'" stroke="'+nsgCol+'" stroke-width="0.5"/>'
			  +'<text x="'+(SUB_X+18)+'" y="'+(subY+40)+'" font-family="monospace" font-size="8" fill="'+nsgCol+'">&#x1F6E1; '+esc(sn.nsgName)+(nsgF>0?' &#9888;'+nsgF:'')+'</text>'
			  +'</g>');
		  }

		  // Bastion label inside subnet
		  if(isBas&&bas){
			var basJ=JSON.stringify({id:bas.id,name:bas.name,sku:bas.sku,scaleUnits:bas.scaleUnits,enableTunneling:bas.enableTunneling,enableFileCopy:bas.enableFileCopy,enableIpConnect:bas.enableIpConnect,enableShareableLink:bas.enableShareableLink,publicIPAddress:bas.publicIPAddress,subnet:bas.subnet}).replace(/"/g,'&quot;');
			p.push('<g class="topo-node" onclick="event.stopPropagation();openNetFlyout(\'bastion\','+basJ+')">'
			  +'<text x="'+(SUB_X+SUB_W/2)+'" y="'+(subY+sh/2+4)+'" text-anchor="middle" font-family="monospace" font-size="10" fill="'+PURPLE+'">&#127984; '+esc(bas.name)+' &middot; '+esc(bas.sku||'Standard')+' SKU</text>'
			  +'</g>');
		  }

		  // Session host circles
		  if(hosts>0){
			var hostNames=arr(sn.sessionHostNames);
			hostNames.forEach(function(hName,hi){
			  var sh_obj=shs.find(function(s){return (s.vmName||'').toLowerCase()===hName.toLowerCase();});
			  var col=hi%SH_COLS, row=Math.floor(hi/SH_COLS);
			  var hx=SUB_X+18+col*((SUB_W-36)/Math.min(SH_COLS,hostNames.length));
			  var hy=subY+50+row*28;
			  var hColor=sh_obj?statusColor(sh_obj.status):MUTED;
			  var isDrain=sh_obj&&sh_obj.drainMode;
			  var shortName=hName.replace(/^sh-avd-/,'').substring(0,8);
			  var clickHandler=sh_obj?('openNetFlyout(\'sh\','+JSON.stringify({name:sh_obj.name,vmName:sh_obj.vmName,status:sh_obj.status,drainMode:sh_obj.drainMode,activeSessions:sh_obj.activeSessions,vmSize:sh_obj.vmSize,privateIP:sh_obj.privateIP,hostPoolName:sh_obj.hostPoolName,powerState:sh_obj.powerState,agentVersion:sh_obj.agentVersion,lastHeartbeat:sh_obj.lastHeartbeat,fslogixDetected:sh_obj.fslogixDetected,hasAMAAgent:sh_obj.hasAMAAgent,osDiskType:sh_obj.osDiskType,osDiskSizeGB:sh_obj.osDiskSizeGB,excludeFromScaling:sh_obj.excludeFromScaling,vmResourceId:sh_obj.vmResourceId}).replace(/"/g,'&quot;')+')'):'';
			  p.push('<g class="topo-node"'+(clickHandler?' onclick="'+clickHandler+'"':'')+'>'
				+'<circle cx="'+hx+'" cy="'+hy+'" r="'+SH_R+'" fill="'+DARK+'" stroke="'+hColor+'" stroke-width="1.5"'+(isDrain?' stroke-dasharray="3,2"':'')+'"/>'
				+'<text x="'+hx+'" y="'+(hy+4)+'" text-anchor="middle" font-size="8">&#128187;</text>'
				+'<text x="'+hx+'" y="'+(hy+SH_R+9)+'" text-anchor="middle" font-family="monospace" font-size="7" fill="'+hColor+'">'+esc(shortName)+'</text>'
				+'</g>');
			});
		  }

		  subY+=sh+ROW_GAP;
		});

		// Internet → NAT → VNet connections
		if(nat){
		  var natJ=JSON.stringify({id:nat.id,name:nat.name,sku:nat.sku,idleTimeoutMinutes:nat.idleTimeoutMinutes,publicIPAddresses:nat.publicIPAddresses,associatedSubnets:nat.associatedSubnets}).replace(/"/g,'&quot;');
		  // Internet ↔ NAT bidirectional
		  // Inbound (Internet → NAT): user traffic reverse connect label
		  p.push('<line x1="'+(intX+64)+'" y1="'+(internetY-4)+'" x2="'+natX+'" y2="'+(internetY-4)+'" stroke="'+CYAN_DIM+'" stroke-width="1.5" marker-end="url(#arr-c)" opacity="0.6"/>');
		  // Outbound (NAT → Internet): session host egress
		  p.push('<line x1="'+natX+'" y1="'+(internetY+4)+'" x2="'+(intX+64)+'" y2="'+(internetY+4)+'" stroke="'+GREEN+'" stroke-width="1" stroke-dasharray="3,2" marker-end="url(#arr-g)" opacity="0.5"/>');
		  // NAT vertical connector
		  if(Math.abs(internetY-vnetCY)>10){
			p.push('<line x1="'+natX+'" y1="'+internetY+'" x2="'+natX+'" y2="'+(vnetCY-20)+'" stroke="'+CYAN_DIM+'" stroke-width="1" stroke-dasharray="4,2" opacity="0.4"/>');
		  }
		  // NAT node
		  p.push('<g class="topo-node" onclick="openNetFlyout(\'nat\','+natJ+')">'
			+'<rect x="'+(natX-28)+'" y="'+(vnetCY-18)+'" width="56" height="36" rx="6" fill="#071a10" stroke="'+GREEN+'" stroke-width="1.5"/>'
			+'<text x="'+natX+'" y="'+(vnetCY-3)+'" text-anchor="middle" font-size="14">&#x1F500;</text>'
			+'<text x="'+natX+'" y="'+(vnetCY+11)+'" text-anchor="middle" font-family="monospace" font-size="7" fill="'+GREEN+'">'+esc(nat.name.substring(0,12))+'</text>'
			+'</g>');
		  // NAT → VNet (inbound/egress) + VNet → NAT (outbound) offset slightly
		  p.push('<line x1="'+(natX+28)+'" y1="'+(vnetCY-5)+'" x2="'+VNET_X+'" y2="'+(vnetCY-5)+'" stroke="'+GREEN+'" stroke-width="1.5" marker-end="url(#arr-g)" opacity="0.7"/>');
		  // Outbound: VNet → NAT
		  p.push('<line x1="'+VNET_X+'" y1="'+(vnetCY+5)+'" x2="'+(natX+28)+'" y2="'+(vnetCY+5)+'" stroke="'+CYAN_DIM+'" stroke-width="1" stroke-dasharray="4,2" marker-end="url(#arr-c)" opacity="0.5"/>');
		  p.push('<text x="'+(natX+34+Math.floor((VNET_X-natX-56)/2))+'" y="'+(vnetCY+15)+'" text-anchor="middle" font-family="monospace" font-size="7" fill="'+CYAN_DIM+'" opacity="0.6">outbound</text>');
		} else {
		  // No VNet-level NAT — check if any AVD subnets lack NAT GW and flag individually
		  // Do NOT draw a blanket VNet→Internet arrow — it implies all subnets have outbound
		  // access which is misleading. Per-subnet "No NAT GW" amber chip already signals this.
		  var avdSubsWithoutNat = subs.filter(function(sn){
			return !sn.natGatewayName && (sn.sessionHostCount||0) > 0 && sn.name !== 'AzureBastionSubnet';
		  });
		  if(avdSubsWithoutNat.length > 0){
			p.push('<text x="'+(intX+64+4)+'" y="'+(internetY+28)+'" font-family="monospace" font-size="7" fill="'+AMBER+'" opacity="0.8">&#9888; '+avdSubsWithoutNat.length+' subnet'+(avdSubsWithoutNat.length>1?'s':'')+' use default SNAT</text>');
		  }
		}

		// Bastion node (above VNet)
		if(bas){
		  var basX2=natX, basY2=vnetY+20;
		  var basJ2=JSON.stringify({id:bas.id,name:bas.name,sku:bas.sku,scaleUnits:bas.scaleUnits,enableTunneling:bas.enableTunneling,enableFileCopy:bas.enableFileCopy,enableIpConnect:bas.enableIpConnect,enableShareableLink:bas.enableShareableLink,publicIPAddress:bas.publicIPAddress,subnet:bas.subnet}).replace(/"/g,'&quot;');
		  p.push('<g class="topo-node" onclick="openNetFlyout(\'bastion\','+basJ2+')">'
			+'<rect x="'+(basX2-28)+'" y="'+(basY2-14)+'" width="56" height="28" rx="5" fill="#1a0830" stroke="'+PURPLE+'" stroke-width="1.5"/>'
			+'<text x="'+basX2+'" y="'+(basY2)+'" text-anchor="middle" font-size="11">&#127984;</text>'
			+'<text x="'+basX2+'" y="'+(basY2+11)+'" text-anchor="middle" font-family="monospace" font-size="7" fill="'+PURPLE+'">Bastion</text>'
			+'</g>');
		  p.push('<line x1="'+(basX2+28)+'" y1="'+basY2+'" x2="'+VNET_X+'" y2="'+basY2+'" stroke="'+PURPLE+'" stroke-width="1" stroke-dasharray="4,2" opacity="0.7"/>');
		}

		// Hub-spoke peering line between VNets
		if(hasPeer&&vi<vnets.length-1){
		  var midX=VNET_X+VNET_W/2;
		  var nextY=vnetY+vh+VNET_GAP;
		  p.push('<line x1="'+midX+'" y1="'+(vnetY+vh)+'" x2="'+midX+'" y2="'+nextY+'" stroke="'+PURPLE+'" stroke-width="1.5" stroke-dasharray="6,3" marker-end="url(#arr-p)"/>');
		  p.push('<rect x="'+(midX-30)+'" y="'+(vnetY+vh+VNET_GAP/2-8)+'" width="60" height="16" rx="3" fill="'+DARK+'" stroke="'+PURPLE+'" stroke-width="0.5"/>');
		  p.push('<text x="'+midX+'" y="'+(vnetY+vh+VNET_GAP/2+4)+'" text-anchor="middle" font-family="monospace" font-size="8" fill="'+PURPLE+'">VNet Peering</text>');
		}

		vnetY+=vh+VNET_GAP;
	  });

	  // Legend
	  var legX=VNET_X+VNET_W+16, legY=MARGIN;
	  var legItems=[['VNet',CYAN],['Available',GREEN],['Unavailable',RED],['Warning / No NAT',AMBER],['Hub-Spoke/Bastion',PURPLE],['NSG Protected',BLUE]];
	  p.push('<rect x="'+(legX-6)+'" y="'+(legY-6)+'" width="110" height="'+(legItems.length*18+18)+'" rx="4" fill="'+PANEL+'" stroke="'+BORDER+'" stroke-width="1" opacity="0.9"/>');
	  p.push('<text x="'+legX+'" y="'+(legY+9)+'" font-family="monospace" font-size="8" fill="'+TEXT_SEC+'" font-weight="700">LEGEND</text>');
	  legItems.forEach(function(item,i){
		var ly=legY+20+i*16;
		p.push('<circle cx="'+(legX+4)+'" cy="'+ly+'" r="4" fill="'+DARK+'" stroke="'+item[1]+'" stroke-width="1.5"/>');
		p.push('<text x="'+(legX+14)+'" y="'+(ly+4)+'" font-family="monospace" font-size="8" fill="'+TEXT_SEC+'">'+item[0]+'</text>');
	  });

	  p.push('</svg>');
	  return p.join('');
	}


	// ── Data mode detection ──────────────────────────────────────────
	function getDataMode(){
	  if(!D) return 'none';
	  const sv=D.schemaVersion||'';
	  if(sv.includes('/API/'))  return 'api';
	  if(sv.match(/YGIT-AVDIntelligence\/2/)) return 'ps1';
	  if(sv.includes('YGIT-AVDIntelligence')) return 'api';
	  return 'unknown';
	}

	// ── AVD Insights / Diagnostics completeness ──────────────────────
	const AVD_REQUIRED_CATEGORIES=['Checkpoint','Error','Management',
	  'Connection','HostRegistration','AgentHealthStatus'];

	function checkInsightsCompleteness(resource){
	  const diags=arr(resource.diagnosticSettings);
	  if(!diags.length) return {enabled:false,complete:false,missing:AVD_REQUIRED_CATEGORIES,categories:[]};
	  const allCats=[...new Set(diags.flatMap(d=>arr(d.logCategories)))];
	  const missing=AVD_REQUIRED_CATEGORIES.filter(c=>!allCats.includes(c));
	  return {enabled:true,complete:missing.length===0,missing,categories:allCats,workspaceName:diags[0]?.workspaceName||''};
	}

	function getInsightsSummary(hps){
	  const results=arr(hps).map(hp=>({name:hp.name,...checkInsightsCompleteness(hp)}));
	  return {
		total:results.length,
		enabled:results.filter(r=>r.enabled).length,
		complete:results.filter(r=>r.complete).length,
		partial:results.filter(r=>r.enabled&&!r.complete).length,
		disabled:results.filter(r=>!r.enabled).length,
		details:results,
	  };
	}

	function updateBadges(){
	  if(!D) return;
	  const s=D.summary||{};
	  const hps=arr(D.hostPools), sps=arr(D.scalingPlans), wss=arr(D.avdWorkspaces), ags=arr(D.applicationGroups);
	  const shs=arr(D.sessionHosts).length?arr(D.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
	  const sessions=arr(D.sessions).length?arr(D.sessions):hps.flatMap(hp=>arr(hp.sessionHosts).flatMap(sh=>arr(sh.sessions)));
	  const apps=ags.filter(g=>g.applicationGroupType==='RemoteApp').flatMap(g=>arr(g.remoteApps));
	  const dags=ags.filter(g=>g.applicationGroupType==='Desktop');
	  const allFindings=hps.flatMap(hp=>arr(hp.securityFindings));
	  const highFindings=allFindings.filter(f=>f.severity==='High'||f.severity==='Critical').length;
	  $('nb-overview').textContent=highFindings>0?highFindings+'!':'✓';
	  $('nb-hp').textContent=hps.length;
	  $('nb-sp').textContent=sps.length;
	  $('nb-ws').textContent=wss.length;
	  $('nb-ag').textContent=ags.length;
	  $('nb-apps').textContent=apps.length;
	  $('nb-desk').textContent=dags.length;
	  $('nb-sh').textContent=shs.length;
	  const activeSess=sessions.filter(se=>se.sessionState==='Active').length;
	  const discSess=sessions.filter(se=>se.sessionState==='Disconnected').length;
	  $('nb-sess').textContent=(activeSess+discSess)||s.totalSessions||0;
	  // Overview badge
	  if(highFindings>0){ $('nb-overview').className='nav-badge badge-red'; }
	  else{ $('nb-overview').className='nav-badge'; }

	  // Host Pools health dot
	  const hpHighFindings=hps.some(hp=>arr(hp.securityFindings).some(f=>f.severity==='High'||f.severity==='Critical'));
	  const hpMedFindings=hps.some(hp=>arr(hp.securityFindings).some(f=>f.severity==='Medium'));
	  setNavDot('nav-dot-hp', hpHighFindings?'red':hpMedFindings?'amber':null);

	  // Session Hosts health dot
	  const unavailSH=shs.filter(s=>s.status==='Unavailable'||s.status==='NeedsAssistance').length;
	  const drainSH=shs.filter(s=>s.drainMode).length;
	  setNavDot('nav-dot-sh', unavailSH>0?'red':drainSH>0?'amber':null);

	  // FSLogix health dot
	  $('nb-rbac').textContent=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)]).length||'—';
	  $('nb-kql').textContent=(D.metrics?.querySupported)?arr(D.metrics?.queriesRun).length+'Q':'—';
	  const fc=D.fslogixCoverage||{};
	  $('nb-fsl').textContent=fc.coveragePct!=null?fc.coveragePct+'%':'—';
	  setNavDot('nav-dot-fsl', fc.coveragePct!=null&&fc.coveragePct<100?'amber':null);
	  $('nb-cost').textContent=s.costAvailable?(s.currency||'')+'MTD':'—';
	  const rgs=arr(D.resourceGroups).filter(rg=>rg!=null);
	  const nbRg=$('nb-rg'); if(nbRg) nbRg.textContent=rgs.length?rgs.reduce((a,rg)=>a+(rg.resourceCount||arr(rg.resources).length),0)+' res':'—';
	  // AVD Insights completeness → health dot on Overview badge
	  const insightsOv=getInsightsSummary(hps);
	  if(insightsOv.disabled>0) setNavDot('nav-dot-insights-ov','red');
	  else if(insightsOv.partial>0) setNavDot('nav-dot-insights-ov','amber');

	  // Dev pool image drift dot
	  const hasDrift=D.imageDrift&&Object.keys(D.imageDrift).length>0;
	  setNavDot('nav-dot-intel', hasDrift?'amber':null);
	}

	function setNavDot(id, colour){
	  let dot=document.getElementById(id);
	  if(!dot){
		// Find the nav item and append dot
		const base=id.replace('nav-dot-','');
		const map={hp:'nb-hp',sh:'nb-sh',fsl:'nb-fsl',intel:'nb-kql'};
		const badgeEl=$(map[base]);
		if(!badgeEl) return;
		dot=document.createElement('span');
		dot.id=id; dot.className='nav-health-dot';
		badgeEl.parentElement.appendChild(dot);
	  }
	  if(!colour){ dot.style.display='none'; return; }
	  dot.style.display='inline-block';
	  dot.className='nav-health-dot dot-'+colour;
	}

	// ── Navigation ────────────────────────────────────────────────────
	function navTo(view){
	  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
	  const ni=document.querySelector('[data-view="'+view+'"]');
	  if(ni) ni.classList.add('active');
	  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
	  const vEl=$('view-'+view);
	  if(vEl){ vEl.classList.add('active'); }
	  ACTIVE_VIEW=view;
	  const fn={
		overview:renderOverview, hostpools:renderHostPools, scaling:renderScaling,
		workspaces:renderWorkspaces, appgroups:renderAppGroups, applications:renderApplications,
		desktops:renderDesktops, sessionhosts:renderSessionHosts, sessions:renderSessions,
		networking:renderNetworking, rbac:renderRBAC, intelligence:renderIntelligence,
		fslogix:renderFSLogix, cost:renderCost, rginventory:renderRGInventory
	  };
	  if(fn[view]) fn[view]();
	  // Fire animations after render
	  setTimeout(()=>{
		if(vEl){ animateKPIs(vEl); animateRings(vEl); staggerRows(vEl); }
	  },40);
	}

	// ── Flyout ────────────────────────────────────────────────────────
	function openFlyout(title,html){
	  $('flyout-title').textContent=title;
	  const body=$('flyout-body');
	  body.innerHTML=html;
	  $('flyout-overlay').classList.add('open');
	  document.body.style.overflow='hidden';
	  requestAnimationFrame(()=>{ body.querySelectorAll('.fr').forEach((r,i)=>r.style.animationDelay=(i*25)+'ms'); });
	}
	function closeFlyout(){ $('flyout-overlay').classList.remove('open'); document.body.style.overflow=''; }
	document.addEventListener('keydown',e=>{
	  if(e.key==='Escape'){ closeFlyout(); closeExportModal(); return; }
	  // Skip if typing in an input / textarea
	  const tag=(e.target.tagName||'').toLowerCase();
	  if(tag==='input'||tag==='textarea'||e.target.isContentEditable) return;
	  if(!D) return; // no data loaded yet
	  // Number keys 1-9 — navigate to views
	  const navMap={
		'0':'overview','1':'hostpools','2':'sessionhosts','3':'sessions',
		'4':'cost','5':'intelligence','6':'fslogix','7':'rbac','8':'scaling','9':'rginventory'
	  };
	  if(navMap[e.key]){ e.preventDefault(); navTo(navMap[e.key]); return; }
	  // / — focus search bar on current view
	  if(e.key==='/'||e.key==='f'&&e.ctrlKey===false&&e.metaKey===false){
		const vEl=document.querySelector('.view.active');
		if(vEl){
		  const searchInput=vEl.querySelector('.search-bar input');
		  if(searchInput){ e.preventDefault(); searchInput.focus(); searchInput.select(); }
		}
	  }
	});

	// ── Search ────────────────────────────────────────────────────────
	function filterTable(id,val){
	  const t=document.getElementById(id); if(!t) return;
	  const q=val.toLowerCase();
	  t.querySelectorAll('tbody tr').forEach(r=>{ r.style.display=(!q||r.dataset.search?.includes(q))?'':'none'; });
	}

	// ── Drag-drop ─────────────────────────────────────────────────────
	document.addEventListener('DOMContentLoaded',()=>{
	  const dz=$('drop-zone');
	  if(dz){
		dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});
		dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
		dz.addEventListener('drop',e=>{
		  e.preventDefault();dz.classList.remove('drag-over');
		  const f=e.dataTransfer.files[0]; if(!f) return;
		  setStatus('wait','LOADING…');
		  const r=new FileReader();
		  r.onload=ev=>{ try{ initData(JSON.parse(ev.target.result)); }catch(err){ setStatus('idle','PARSE ERROR'); alert('Invalid JSON: '+err.message); } };
		  r.readAsText(f);
		});
	  }
	  // Also allow drag over the whole #main area when on landing
	  const main=$('main');
	  if(main){
		main.addEventListener('dragover',e=>{ if($('landing').style.display!=='none'){ e.preventDefault(); if(dz) dz.classList.add('drag-over'); }});
		main.addEventListener('dragleave',()=>{ if(dz) dz.classList.remove('drag-over'); });
		main.addEventListener('drop',e=>{
		  if($('landing').style.display==='none') return;
		  e.preventDefault(); if(dz) dz.classList.remove('drag-over');
		  const f=e.dataTransfer.files[0]; if(!f) return;
		  setStatus('wait','LOADING…');
		  const r=new FileReader();
		  r.onload=ev=>{ try{ initData(JSON.parse(ev.target.result)); }catch(err){ setStatus('idle','PARSE ERROR'); alert('Invalid JSON: '+err.message); } };
		  r.readAsText(f);
		});
	  }
	});

	// ── HP card toggle ────────────────────────────────────────────────
	function toggleColl(id,header){const el=document.getElementById(id);if(!el)return;const open=el.style.display!=="none";el.style.display=open?"none":"block";const caret=header?header.querySelector(".coll-caret"):null;if(caret)caret.textContent=open?"▶":"▼";}

	function toggleHP(id){
	  const el=$(id); if(!el) return;
	  const name=id.replace('hp-','');
	  const caret=$('hpc-'+name);
	  const hidden=el.style.display==='none';
	  el.style.display=hidden?'block':'none';
	  if(caret) caret.textContent=hidden?'▼':'▶';
	}

	// ── noData placeholder ────────────────────────────────────────────
	function noData(lbl){
	  return `<div style="color:var(--text-muted);font-family:var(--font-mono);padding:40px;text-align:center">
		No data available${lbl?' for '+lbl:''}.<br><span style="font-size:11px;color:var(--text-dim)">Load a YGIT-AVDIntelligence JSON file to begin.</span></div>`;
	}

	// ═══════════════════════════════════════════════════════════════════
	// VIEW: OVERVIEW
	// ═══════════════════════════════════════════════════════════════════
	// ── Cost comparison helpers ───────────────────────────────────────
	function costProjection(mtd, collectedAt){
	  // Project end-of-month based on days elapsed
	  try {
		const collected = collectedAt ? new Date(collectedAt) : new Date();
		const year = collected.getFullYear();
		const month = collected.getMonth();
		const daysInMonth = new Date(year, month+1, 0).getDate();
		const dayOfMonth = collected.getDate();
		if(dayOfMonth < 1 || dayOfMonth > daysInMonth) return null;
		if(dayOfMonth < 3) return null; // Too early in month — projection would be misleading
		return Math.round((mtd / dayOfMonth) * daysInMonth * 100) / 100;
	  } catch(e){ return null; }
	}

	function costDeltaHTML(prevTotal, currMTD, cur, collectedAt){
	  if(prevTotal == null || currMTD == null) return '';
	  const proj = costProjection(currMTD, collectedAt);
	  const delta = proj != null ? proj - prevTotal : null;
	  const deltaPct = delta != null && prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : null;
	  const isUp = delta != null && delta > 0;
	  const isDown = delta != null && delta < 0;
	  const deltaClass = isUp ? 'delta-up' : isDown ? 'delta-down' : 'delta-flat';
	  const arrow = isUp ? '↑' : isDown ? '↓' : '→';
	  const deltaStr = delta != null ? (isUp?'+':'')+fmtCur(Math.abs(delta),cur) : '—';
	  const pctStr = deltaPct != null ? (isUp?'+':isDown?'':'')+deltaPct+'%' : '';

	  // Mini trend bars
	  const maxVal = Math.max(prevTotal, proj||currMTD, 1);
	  const prevH = Math.round((prevTotal/maxVal)*40);
	  const currH = Math.round(((proj||currMTD)/maxVal)*40);
	  const trendBar = `<div class="cost-trend-bar" style="height:44px">
		<div class="cost-trend-col">
		  <div class="cost-trend-bar-fill" style="height:${prevH}px;background:var(--border-lit)"></div>
		  <div class="cost-trend-bar-label">Last</div>
		</div>
		<div class="cost-trend-col">
		  <div class="cost-trend-bar-fill" style="height:${currH}px;background:${isUp?'var(--red)':isDown?'var(--green)':'var(--cyan)'}"></div>
		  <div class="cost-trend-bar-label">Proj</div>
		</div>
	  </div>`;

	  return `
	  <div class="cost-delta ${deltaClass}">
		<span class="cost-delta-arrow">${arrow}</span>
		<span class="cost-delta-text">
		  <span class="cost-delta-pct">${pctStr}</span>${pctStr?' · ':''}${deltaStr} vs last month
		  ${delta == null ? '<span style="color:var(--text-dim)"> — previous month data not available</span>' : ''}
		</span>
		${trendBar}
	  </div>
	  ${proj != null ? `<div class="cost-projection">
		<span class="cost-proj-icon">📈</span>
		<div>
		  <div class="cost-proj-label">Projected End of Month</div>
		  <div class="cost-proj-amount">${fmtCur(proj,cur)}</div>
		  <div class="cost-proj-note">Based on ${fmtCur(currMTD,cur)} MTD · estimate only</div>
		</div>
	  </div>` : ''}`;
	}

/* Include all your rendering functions (renderOverview, renderScaling, etc.) here */
/* ... (copied from the <script> section of your HTML file) ... */


	function renderOverview(){
	  if(!D){ $('view-overview').innerHTML=noData(); return; }
	  const s=D.summary||{};
	  const hps=arr(D.hostPools);
	  const isLive=D?.displayConfig?.isLiveMode===true;

	  // ── LIVE MODE — clean overview ──────────────────────────────────
	  if(isLive){
		const ags=arr(D.applicationGroups);
		const allAssignees=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)]);
		const shs=arr(D.sessionHosts).length?arr(D.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
		const availSHs  = shs.filter(s=>s.status==='Available').length;
		const unavailSHs= shs.filter(s=>s.status==='Unavailable').length;
		const shutdownSHs=shs.filter(s=>s.status==='Shutdown').length;
		const drainSHs  = shs.filter(s=>s.drainMode).length;
		$('view-overview').innerHTML=`
		<div class="section-hdr"><h2>Infrastructure Overview</h2><span class="section-sub">Live snapshot · ${esc(D.subscriptionName||D.subscriptionId||'—')}</span></div>
		<div class="card accent-cyan">
		  <div class="card-title">Subscription</div>
		  <div class="col2">
			<div>
			  <div class="ir"><span class="ir-k">Subscription</span><span class="ir-v">${esc(D.subscriptionName||'—')} ${copyBtn(D.subscriptionName||'')}</span></div>
			  <div class="ir"><span class="ir-k">Subscription ID</span><span class="ir-v" style="font-size:9px">${esc(D.subscriptionId||'—')} ${copyBtn(D.subscriptionId||'')}</span></div>
			</div>
			<div>
			  <div class="ir"><span class="ir-k">Tenant</span><span class="ir-v">${esc(D.tenantName||D.tenantId||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Collected</span><span class="ir-v">${D.generatedAt?(new Date(D.generatedAt).toLocaleString()):'—'}</span></div>
			</div>
		  </div>
		</div>
		<div class="kpi-grid g4">
		  <div class="kpi clickable" onclick="navTo('hostpools')"><div class="kpi-label">Host Pools</div><div class="kpi-value kv-cyan">${fmt(s.hostPoolCount)}</div><div class="kpi-sub">${s.pooledHostPools||0} pooled · ${s.personalHostPools||0} personal</div></div>
		  <div class="kpi clickable" onclick="navTo('workspaces')"><div class="kpi-label">Workspaces</div><div class="kpi-value">${fmt(s.avdWorkspaceCount)}</div></div>
		  <div class="kpi clickable" onclick="navTo('appgroups')"><div class="kpi-label">Application Groups</div><div class="kpi-value">${fmt(s.applicationGroupCount)}</div></div>
		  <div class="kpi clickable" onclick="navTo('sessionhosts')"><div class="kpi-label">Session Hosts</div><div class="kpi-value">${fmt(s.totalSessionHosts)}</div><div class="kpi-sub">${fmt(s.availableHosts)} available</div></div>
		</div>
		<div class="kpi-grid g4">
		  <div class="kpi clickable" onclick="navTo('sessions')"><div class="kpi-label">Active Sessions</div><div class="kpi-value kv-green">${fmt(s.totalActiveSessions)}</div><div class="kpi-sub">${fmt(s.totalDisconnectedSessions)} disconnected</div></div>
		  <div class="kpi clickable" onclick="navTo('rbac')"><div class="kpi-label">RBAC Assignments</div><div class="kpi-value kv-cyan">${allAssignees.length}</div><div class="kpi-sub">${allAssignees.filter(a=>a.objectType==='Group').length} groups</div></div>
		  <div class="kpi clickable" onclick="navTo('scaling')"><div class="kpi-label">Scaling Plans</div><div class="kpi-value">${fmt(s.scalingPlanCount)}</div><div class="kpi-sub kv-${(s.hostPoolsWithoutScaling||0)>0?'amber':''}">${s.hostPoolsWithoutScaling||0} pools without</div></div>
		  <div class="kpi clickable" onclick="navTo('rginventory')"><div class="kpi-label">Resource Groups</div><div class="kpi-value">${fmt(arr(D.resourceGroups).length)}</div></div>
		</div>
		<div class="card" style="margin-top:10px">
		  <div class="card-title">Session Host Status</div>
		  <div class="kpi-grid g4">
			<div class="kpi"><div class="kpi-label">Available</div><div class="kpi-value kv-green">${availSHs}</div></div>
			<div class="kpi"><div class="kpi-label">Unavailable</div><div class="kpi-value kv-${unavailSHs>0?'red':'green'}">${unavailSHs}</div></div>
			<div class="kpi"><div class="kpi-label">Shutdown</div><div class="kpi-value kv-${shutdownSHs>0?'amber':'green'}">${shutdownSHs}</div></div>
			<div class="kpi"><div class="kpi-label">Drain Mode</div><div class="kpi-value kv-${drainSHs>0?'amber':'green'}">${drainSHs}</div></div>
		  </div>
		</div>`;
		return;
	  }
	  
	  // ── PS1/JSON MODE — full overview ───────────────────────────────
	  const cur=s.currency||'';
	  const healthPct=s.overallHealthPct??0;
	  const shutdownHosts=s.shutdownHosts||0;
	  const activeHosts=(s.totalSessionHosts||0)-shutdownHosts;
	  const allShutdown=activeHosts===0&&shutdownHosts>0;
	  const availPct=activeHosts>0?Math.round(((s.availableHosts||0)/activeHosts)*100):0;
	  const prodHps=hps.filter(hp=>!/uat|dev|test/i.test(hp.name||''));
	  const prodPoolsWithoutScaling=prodHps.filter(hp=>!hp.hasScalingPlan).length;
	  const diagPct=prodHps.length>0?Math.round(((prodHps.filter(hp=>hp.diagnosticsEnabled).length)/prodHps.length)*100):0;
	  const diagNote=hps.length>prodHps.length?` (${hps.length-prodHps.length} non-prod excluded)`:'';
	  const allFindings=hps.flatMap(hp=>arr(hp.securityFindings));
	  const critCount=allFindings.filter(f=>f.severity==='Critical').length;
	  const highCount=allFindings.filter(f=>f.severity==='High').length;
	  const medCount=allFindings.filter(f=>f.severity==='Medium').length;

	  // RBAC summary
	  const ags=arr(D.applicationGroups);
	  const allAssignees=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)]);
	  const rbacGroups=allAssignees.filter(a=>a.objectType==='Group').length;
	  const rbacUsers=allAssignees.filter(a=>a.objectType==='User'||a.objectType==='ServicePrincipal').length;
	  const directUsers=allAssignees.filter(a=>a.objectType==='User').length;

	  $('view-overview').innerHTML=`
	  <div class="section-hdr"><h2>Infrastructure Overview</h2><span class="section-sub">Summary of all AVD resources in ${esc(D.subscriptionName||D.subscriptionId||'—')}</span></div>

	  <div class="card accent-cyan">
		<div class="card-title">Current Subscription</div>
		<div class="col2">
		  <div>
			<div class="ir"><span class="ir-k">Subscription Name</span><span class="ir-v">${esc(D.subscriptionName||'—')} ${copyBtn(D.subscriptionName||'')}</span></div>
			<div class="ir"><span class="ir-k">Subscription ID</span><span class="ir-v" style="font-size:9px">${esc(D.subscriptionId||'—')} ${copyBtn(D.subscriptionId||'')}</span></div>
			<div class="ir"><span class="ir-k">Tenant</span><span class="ir-v">${esc(D.tenantName||D.tenantId||'—')} ${copyBtn(D.tenantId||'')}</span></div>
		  </div>
		  <div>
			<div class="ir"><span class="ir-k">Data Collected</span><span class="ir-v">${D.generatedAt?(new Date(D.generatedAt).toLocaleString()):'—'}</span></div>
			<div class="ir"><span class="ir-k">Schema Version</span><span class="ir-v">${esc(D.schemaVersion||'—')}</span></div>
			<div class="ir"><span class="ir-k">Cost Available</span><span class="ir-v">${s.costAvailable?'<span class="pill p-green">Yes</span>':'<span class="pill p-amber">No</span>'}</span></div>
		  </div>
		</div>
	  </div>
	  
	  <div class="kpi-grid g4">
		<div class="kpi clickable" onclick="navTo('hostpools')"><div class="kpi-label">Host Pools</div><div class="kpi-value kv-cyan">${fmt(s.hostPoolCount)}</div><div class="kpi-sub">${s.pooledHostPools||0} pooled · ${s.personalHostPools||0} personal</div></div>
		<div class="kpi clickable" onclick="navTo('sessionhosts')"><div class="kpi-label">Session Hosts</div><div class="kpi-value">${fmt(s.totalSessionHosts)}</div><div class="kpi-sub">${fmt(s.availableHosts)} available</div></div>
		<div class="kpi clickable" onclick="navTo('sessions')"><div class="kpi-label">Active Sessions</div><div class="kpi-value kv-green">${fmt(s.totalActiveSessions)}</div><div class="kpi-sub">${fmt(s.totalDisconnectedSessions)} disconnected</div></div>
		<div class="kpi clickable" onclick="navTo('appgroups')"><div class="kpi-label">Application Groups</div><div class="kpi-value">${fmt(s.applicationGroupCount)}</div><div class="kpi-sub">${fmt(s.avdWorkspaceCount)} workspace${(s.avdWorkspaceCount||0)!==1?'s':''}</div></div>
	  </div>
	  <div class="kpi-grid g4">
		<div class="kpi clickable" onclick="navTo('scaling')"><div class="kpi-label">Scaling Plans</div><div class="kpi-value">${fmt(s.scalingPlanCount)}</div><div class="kpi-sub kv-${prodPoolsWithoutScaling>0?'amber':''}">${prodPoolsWithoutScaling} prod pools without</div></div>
		<div class="kpi clickable" onclick="navTo('fslogix')"><div class="kpi-label">FSLogix Detected</div><div class="kpi-value kv-${(s.hostsWithFSLogixDetected||0)>0?'cyan':'amber'}">${fmt(s.hostsWithFSLogixDetected)}</div><div class="kpi-sub">of ${s.totalSessionHosts||0} hosts</div></div>
		<div class="kpi"><div class="kpi-label">Diagnostics Coverage</div><div class="kpi-value kv-${diagPct>=80?'green':diagPct>=50?'amber':'red'}">${diagPct}%</div><div class="kpi-sub">${prodHps.filter(hp=>hp.diagnosticsEnabled).length} of ${prodHps.length} prod pools${diagNote}</div></div>
		<div class="kpi clickable" onclick="navTo('intelligence')"><div class="kpi-label">KQL Analytics</div><div class="kpi-value kv-${D.metrics?.querySupported?'cyan':'gray'}">${D.metrics?.querySupported?arr(D.metrics?.queriesRun).length+' Q':'—'}</div><div class="kpi-sub">${D.metrics?.timespanDays||7}d window</div></div>
	  </div>

	  <div class="kpi-grid g4">
		<div class="kpi clickable" onclick="navTo('rbac')"><div class="kpi-label">RBAC Assignments</div><div class="kpi-value kv-cyan">${allAssignees.length}</div><div class="kpi-sub">${rbacGroups} groups · ${rbacUsers} users</div></div>
		<div class="kpi clickable" onclick="navTo('rbac')"><div class="kpi-label">Group Assignments</div><div class="kpi-value kv-green">${rbacGroups}</div><div class="kpi-sub">best practice</div></div>
		<div class="kpi clickable" onclick="navTo('rbac')"><div class="kpi-label">Direct User Assign.</div><div class="kpi-value kv-${directUsers>0?'amber':'green'}">${directUsers}</div><div class="kpi-sub">${directUsers>0?'review recommended':'none — good'}</div></div>
		<div class="kpi"><div class="kpi-label">Distinct Roles</div><div class="kpi-value">${new Set(allAssignees.map(a=>a.role).filter(Boolean)).size}</div><div class="kpi-sub">across all app groups</div></div>
	  </div>
	  
	  <div class="col2-3">
		<div class="card" style="margin:0">
		  <div class="card-title">Environment Health</div>
		  <div class="health-rings-row">
			<div class="health-ring-wrap">${allShutdown?healthRing(100,'var(--text-muted)'):healthRing(healthPct,scoreColor(healthPct))}<div class="health-ring-label">Overall</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);text-align:center;margin-top:3px">${allShutdown?'all hosts powered off':`${s.availableHosts||0}/${activeHosts} active${shutdownHosts>0?' · '+shutdownHosts+' off':''}`}</div></div>
			<div class="health-ring-wrap">${allShutdown?healthRing(0,'var(--text-muted)'):healthRing(availPct,scoreColor(availPct))}<div class="health-ring-label">Availability</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);text-align:center;margin-top:3px">${allShutdown?'scaling plan active':`${s.availableHosts||0} available`}</div></div>
			<div class="health-ring-wrap">${healthRing(diagPct,scoreColor(diagPct))}<div class="health-ring-label">Diagnostics</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);text-align:center;margin-top:3px">${prodHps.filter(hp=>hp.diagnosticsEnabled).length}/${prodHps.length} prod pools${diagNote}</div></div>
		  </div>
		  ${(s.drainModeHosts||0)>0?'<div style="display:flex;align-items:center;gap:6px;margin-top:10px;padding:6px 10px;background:#f59e0b10;border:1px solid #f59e0b40;border-radius:4px;font-family:var(--font-mono);font-size:10px;color:var(--amber)"><span>⚠</span> '+s.drainModeHosts+' host'+((s.drainModeHosts>1)?'s are':' is')+' in Drain Mode — not accepting new sessions</div>':''} 
		</div>
		<div class="card" style="margin:0">
		  <div class="card-title">Security Findings</div>
		  ${allFindings.length===0?`<div style="color:var(--green);font-family:var(--font-mono);font-size:12px;padding:8px">✓ No security findings detected</div>`:`
		  <div class="kpi-grid g3" style="margin-bottom:10px">
			<div class="kpi"><div class="kpi-label">Critical</div><div class="kpi-value kv-${critCount>0?'red':'green'}">${critCount}</div></div>
			<div class="kpi"><div class="kpi-label">High</div><div class="kpi-value kv-${highCount>0?'orange':'green'}">${highCount}</div></div>
			<div class="kpi"><div class="kpi-label">Medium</div><div class="kpi-value kv-${medCount>0?'amber':'green'}">${medCount}</div></div>
		  </div>
		  ${allFindings.slice(0,4).map(f=>`<div class="alert-item sev-${f.severity?.toLowerCase()}"><div class="alert-sev sev-${f.severity?.toLowerCase()}">${esc(f.severity)}</div><div class="alert-msg">${esc(f.finding)}</div></div>`).join('')}
		  ${allFindings.length>4?`<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);padding:4px">+${allFindings.length-4} more — see Host Pools view</div>`:''}`}
		</div>
	  </div>
	  ${(()=>{
		const ins=getInsightsSummary(hps);
		if(ins.total===0||ins.complete===ins.total) return '';
		return '<div class="card accent-amber" style="margin-top:10px"><div class="card-title">⚠ AVD Insights / Diagnostics Gaps</div>'
		  +ins.details.filter(r=>!r.complete).map(r=>{
			const sev=r.enabled?'amber':'red';
			const msg=r.enabled
			  ? 'Missing log categories: '+r.missing.join(', ')
			  : 'No diagnostic settings — AVD Insights non-functional';
			return '<div class="alert-item sev-'+sev+'"><div class="alert-sev sev-'+sev+'">'+(r.enabled?'PARTIAL':'NONE')+'</div><div class="alert-msg"><strong>'+esc(r.name)+'</strong> — '+esc(msg)+'</div></div>';
		  }).join('')
		  +'</div>';
	  })()}
	  
	  ${s.costAvailable?`<div class="card accent-cyan" style="margin-top:12px">
		<div class="card-title">Cost Summary — Month-to-Date vs Previous Month</div>
		<div class="cost-compare-grid">
		  <div class="cost-compare-col">
			<div class="ccc-label">Previous Month</div>
			<div class="ccc-amount">${s.previousMonthCost!=null?fmtCur(s.previousMonthCost,cur):'—'}</div>
			<div class="ccc-period">${s.previousMonthFrom&&s.previousMonthTo?esc(s.previousMonthFrom)+' → '+esc(s.previousMonthTo):'Not collected'}</div>
		  </div>
		  <div class="cost-compare-col">
			<div class="ccc-label">This Month MTD</div>
			<div class="ccc-amount kv-cyan">${fmtCur(s.currentMonthCost,cur)}</div>
			<div class="ccc-period">${s.currentMonthFrom&&s.currentMonthTo?esc(s.currentMonthFrom)+' → '+esc(s.currentMonthTo):'Month to date'}</div>
		  </div>
		</div>
		${costDeltaHTML(s.previousMonthCost,s.currentMonthCost,cur,D.generatedAt)}
		<div class="kpi-grid g4" style="margin-top:8px">
		  <div class="kpi"><div class="kpi-label">Cost / Session</div><div class="kpi-value">${s.costPerSession?fmtCur(s.costPerSession,cur):'—'}</div></div>
		  <div class="kpi"><div class="kpi-label">Cost / User</div><div class="kpi-value">${s.costPerUser?fmtCur(s.costPerUser,cur):'—'}</div></div>
		  <div class="kpi"><div class="kpi-label">Wasted Spend</div><div class="kpi-value kv-${s.wastedSpendEstimate>0?'amber':'green'}">${s.wastedSpendEstimate?fmtCur(s.wastedSpendEstimate,cur):'—'}</div><div class="kpi-sub">${s.wastedSpendHosts||0} idle/drain hosts</div></div>
		  <div class="kpi"><div class="kpi-label">Proj. End of Month</div><div class="kpi-value kv-amber">${(()=>{const p=costProjection(s.currentMonthCost,D.generatedAt);return p?fmtCur(p,cur):'—';})()}</div><div class="kpi-sub">estimate</div></div>
		</div>
		${s.tenantCostTotal!=null?`<div class="kpi-grid g2" style="margin-top:8px">
		  <div class="kpi"><div class="kpi-label">Subscription Total MTD</div><div class="kpi-value">${fmtCur(s.tenantCostTotal,cur)}</div><div class="kpi-sub">all resources in subscription</div></div>
		  <div class="kpi"><div class="kpi-label">AVD Share of Subscription</div><div class="kpi-value kv-cyan">${s.tenantCostTotal>0?Math.round(s.currentMonthCost/s.tenantCostTotal*100)+'%':'—'}</div><div class="kpi-sub">AVD + compute vs total</div></div>
		</div>`:''}
	  </div>`:''}`;
	}
	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: HOST POOLS
	// ═══════════════════════════════════════════════════════════════════
	function renderHostPools(){
	  if(!D){ $('view-hostpools').innerHTML=noData('Host Pools'); return; }
	  const hps=arr(D.hostPools);
	  if(!hps.length){ $('view-hostpools').innerHTML=`<div class="section-hdr"><h2>Host Pools</h2></div><div class="card"><div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No host pools found.</div></div>`; return; }
	  $('view-hostpools').innerHTML=`<div class="section-hdr"><h2>Host Pools</h2><span class="section-sub">Collections of session hosts · ${hps.length} pool${hps.length!==1?'s':''}</span></div>${hps.map(hp=>hpCard(hp)).join('')}`;
	}

	function hpCard(hp){
	  const rdp=hp.rdpPropertiesParsed||{};
	  const shs=arr(hp.sessionHosts);
	  const findings=arr(hp.securityFindings);
	  const findBadge=findings.length>0?`<span class="pill p-${findings.some(f=>f.severity==='High'||f.severity==='Critical')?'red':'amber'}" style="font-size:9px">${findings.length} finding${findings.length!==1?'s':''}</span>`:'<span class="pill p-green" style="font-size:9px">✓ Clean</span>';
	  const hc=hp.healthPct??0;
	  const rdpAllKeys=Object.keys(rdp);
	  const rdpPills=rdpAllKeys.slice(0,8).map(k=>`<span class="rdp-prop"><span class="rdp-k">${k}</span><span class="rdp-v">${esc(rdp[k])}</span></span>`).join('')+(rdpAllKeys.length>8?`<span class="rdp-prop" style="color:var(--text-muted)">+${rdpAllKeys.length-8} more</span>`:'');

	  // sessions for this pool — clickable
	  const sessions=arr(D.sessions).filter(se=>se.hostPoolName===hp.name);
	  const activeSess=sessions.filter(se=>se.sessionState==='Active');
	  const discSess=sessions.filter(se=>se.sessionState==='Disconnected');

	  return `<div class="hp-card">
	  <div class="hp-card-header" onclick="toggleHP('hp-${esc(hp.name)}')">
		<span style="color:var(--cyan);font-size:18px">🖥</span>
		<span style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0">
		  <span class="hp-card-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(hp.name)}</span>
		  <span onclick="event.stopPropagation()">${copyBtn(hp.name)}</span>
		</span>
		<span class="pill ${hp.hostPoolType==='Pooled'?'p-cyan':'p-purple'}">${esc(hp.hostPoolType)}</span>
		${hp.isValidationEnv?'<span class="pill p-amber">Validation</span>':''}
		${findBadge}
		<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-left:auto">${hp.sessionHostCount||0} hosts</span>
		${portalLink(hp.id,'')}
		<span id="hpc-${esc(hp.name)}" style="font-size:10px;color:var(--text-muted);margin-left:6px">▼</span>
	  </div>
	  <div id="hp-${esc(hp.name)}" class="hp-card-body">
		<div class="col2-3" style="margin-bottom:12px">
		  <div>
			${hp.friendlyName&&hp.friendlyName!==hp.name?`<div class="ir"><span class="ir-k">Friendly Name</span><span class="ir-v">${esc(hp.friendlyName)}</span></div>`:''}
			<div class="ir"><span class="ir-k">Resource Group</span><span class="ir-v">${esc(hp.resourceGroup||'—')} ${copyBtn(hp.resourceGroup||'')}</span></div>
			<div class="ir"><span class="ir-k">Location</span><span class="ir-v">${esc(hp.location||'—')}</span></div>
			<div class="ir"><span class="ir-k">Load Balancer</span><span class="ir-v">${esc(hp.loadBalancerType||'—')}</span></div>
			<div class="ir"><span class="ir-k">Max Sessions</span><span class="ir-v">${esc(hp.maxSessionLimit??'—')}</span></div>
			<div class="ir"><span class="ir-k">Preferred App Type</span><span class="ir-v">${esc(hp.preferredAppGroupType||'—')}</span></div>
			<div class="ir"><span class="ir-k">Public Network</span><span class="ir-v">${hp.publicNetworkAccess===false?'<span class="pill p-amber">Private Only</span>':'<span class="pill p-green">Enabled</span>'}</span></div>
			<div class="ir"><span class="ir-k">Start VM on Connect</span><span class="ir-v">${hp.startVMOnConnect?'<span class="pill p-green">Enabled</span>':'<span class="pill p-gray">Disabled</span>'}</span></div>
			<div class="ir"><span class="ir-k">Diagnostics</span><span class="ir-v">${hp.diagnosticsEnabled?'<span class="pill p-green">Enabled</span>':'<span class="pill p-red">Not Configured</span>'}</span></div>
			<div class="ir"><span class="ir-k">Reg Token</span><span class="ir-v"><span class="pill ${hp.registrationTokenStatus==='Active'?'p-amber':'p-gray'}">${esc(hp.registrationTokenStatus||'None')}</span></span></div>
			<div class="ir"><span class="ir-k">Scaling Plan</span><span class="ir-v">${arr(hp.scalingPlans).length?arr(hp.scalingPlans).map(sp=>`<span class="pill p-cyan">${esc(sp.name)}</span>`).join(' '):'<span class="pill p-amber">None</span>'}</span></div>
			${hp.description?`<div class="ir"><span class="ir-k">Description</span><span class="ir-v">${esc(hp.description)}</span></div>`:''}
			${Object.keys(hp.tags||{}).length?`<div class="ir"><span class="ir-k">Tags</span><span class="ir-v">${Object.entries(hp.tags).map(([k,v])=>`<span class="rdp-prop"><span class="rdp-k">${esc(k)}</span><span class="rdp-v">${esc(v)}</span></span>`).join('')}</span></div>`:''}
			<div class="ir"><span class="ir-k">Resource ID</span><span class="ir-v" style="font-size:9px;word-break:break-all">${esc(hp.id||'—')} ${hp.id?copyBtn(hp.id):''}</span></div>
		  </div>
		  <div>
			<div class="kpi-grid g3">
			  <div class="kpi"><div class="kpi-label">Health</div><div class="kpi-value" style="color:${scoreColor(hc)}">${hc}%</div><div class="kpi-sub">${hp.sessionHostsAvailable||0}/${hp.sessionHostCount||0}</div></div>
			  <div class="kpi clickable" onclick="openSessionsFlyout('${esc(hp.name)}','Active')" title="Click to see active sessions"><div class="kpi-label">Active</div><div class="kpi-value kv-green">${hp.activeSessions||0}</div></div>
			  <div class="kpi clickable" onclick="openSessionsFlyout('${esc(hp.name)}','Disconnected')" title="Click to see disconnected sessions"><div class="kpi-label">Disconnected</div><div class="kpi-value kv-${(hp.disconnectedSessions||0)>0?'amber':'green'}">${hp.disconnectedSessions||0}</div></div>
			</div>
			<div class="kpi-grid g3">
			  <div class="kpi"><div class="kpi-label">Capacity</div><div class="kpi-value">${hp.capacityUsedPct??0}%</div><div class="kpi-sub">${hp.totalSessions||0}/${hp.totalCapacity||0}</div></div>
			  <div class="kpi"><div class="kpi-label">Unavailable</div><div class="kpi-value kv-${(hp.sessionHostsUnavailable||0)>0?'red':'green'}">${hp.sessionHostsUnavailable||0}</div></div>
			  <div class="kpi"><div class="kpi-label">Drain Mode</div><div class="kpi-value kv-${(hp.sessionHostsDrainMode||0)>0?'amber':'green'}">${hp.sessionHostsDrainMode||0}</div></div>
			</div>
		  </div>
		</div>

		<div class="hp-sec-label" style="display:flex;align-items:center;justify-content:space-between">
		  <span>RDP Properties</span>
		  ${Object.keys(hp.rdpPropertiesParsed||{}).length?`<button class="rdp-analysis-btn" onclick="event.stopPropagation();openRDPFlyout(${JSON.stringify(hp).replace(/"/g,'&quot;')})">🔧 Analyse</button>`:''}
		</div>
		${rdpPills?`<div style="padding:4px 0 8px">${rdpPills}</div>`:'<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);padding:4px 0 8px">No RDP properties configured — using Azure defaults</div>'}

		${findings.length?`<div class="hp-sec-label">Security Findings (${findings.length})</div>
		${findings.map(f=>`<div class="alert-item sev-${f.severity?.toLowerCase()}"><div class="alert-sev sev-${f.severity?.toLowerCase()}">${esc(f.severity)}</div><div class="alert-msg">${esc(f.finding)}</div></div>`).join('')}`:''}

		${shs.length?`<div class="hp-sec-label">Session Hosts (${shs.length})</div>
		${shs.map(sh=>`<div class="sh-row" onclick="openSHFlyout(${JSON.stringify(sh).replace(/"/g,'&quot;')})">
		  <span class="sh-dot ${statusDotClass(sh.status)}"></span>
		  <span class="sh-name">${esc(sh.vmName||sh.name||'—')}</span>
		  <span class="pill ${statusPill(sh.status)}" style="font-size:9px">${esc(sh.status||'—')}</span>
		  <span class="sh-meta">${esc(sh.vmSize||'')}</span>
		  <span class="sh-meta" style="margin-left:auto">${sh.activeSessions||0}A · ${sh.disconnectedSessions||0}D</span>
		  <span style="color:var(--text-dim);font-size:10px">→</span>
		</div>`).join('')}`:''}

		${arr(hp.appGroups).length?`<div class="hp-sec-label">Application Groups</div>
		<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
		  ${arr(hp.appGroups).map(ag=>`<span class="pill ${ag.type==='Desktop'?'p-blue':'p-purple'}">${esc(ag.name)} · ${esc(ag.type)}</span>`).join('')}
		</div>`:''}
	  </div></div>`;
	}


		// ── Session flyout from host pool card ────────────────────────────
	function openSessionsFlyout(hpName, state){
	  const allSess=arr(D.sessions);
	  let sessions=allSess.filter(s=>(s.hostPoolName||'')=== hpName);
	  if(state) sessions=sessions.filter(s=>s.sessionState===state);
	  const stateColor=state==='Active'?'var(--green)':state==='Disconnected'?'var(--amber)':'var(--cyan)';
	  if(!sessions.length){
		openFlyout(`${state} Sessions — ${hpName}`,`<div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No ${state.toLowerCase()} sessions found for this host pool.</div>`);
		return;
	  }
	  openFlyout(`${state} Sessions — ${hpName}`,`
		<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);letter-spacing:1px;margin-bottom:12px">
		  <span style="color:${stateColor}">${sessions.length}</span> ${state.toUpperCase()} SESSION${sessions.length!==1?'S':''}
		</div>
		<div class="data-table-wrap"><table class="data-table">
		  <thead><tr><th>User</th><th>State</th><th>Session Host</th><th>Connected</th><th>Type</th></tr></thead>
		  <tbody>${sessions.map(s=>`<tr>
			<td class="name-col fr" style="font-family:var(--font-mono)">${esc(s.userPrincipalName||'Unknown')}</td>
			<td><span class="pill p-${s.sessionState==='Active'?'green':'amber'}" style="font-size:9px">${esc(s.sessionState||'—')}</span></td>
			<td style="color:var(--cyan)">${esc((s.sessionHostName||'—').split('.')[0])}</td>
			<td style="font-size:9px">${esc(s.createTime||'—')}</td>
			<td><span class="pill p-${s.applicationType==='Desktop'?'blue':'purple'}" style="font-size:8px">${esc(s.applicationType||'Desktop')}</span></td>
		  </tr>`).join('')}</tbody>
		</table></div>`);
	}

	// ── Session host flyout ───────────────────────────────────────────
	// ── Network Topology flyouts ─────────────────────────────────────
	function openNetFlyout(type, data){
	  switch(type){
		case 'vnet':   openVNetFlyout(data);   break;
		case 'subnet': openSubnetFlyout(data); break;
		case 'nsg':    openNSGFlyout(data);    break;
		case 'nat':    openNATFlyout(data);    break;
		case 'bastion':openBastionFlyout(data);break;
		case 'sh':     openSHFlyout(data);     break;
		default: break;
	  }
	}

	function openVNetFlyout(vnet){
	  const subnets=arr(vnet.subnets);
	  const peerings=arr(vnet.peerings);
	  openFlyout('Virtual Network — '+esc(vnet.name),
		'<div class="kpi-grid g3" style="margin-bottom:12px">'
		+'<div class="kpi"><div class="kpi-label">Address Space</div><div class="kpi-value kv-cyan" style="font-size:13px">'+esc(arr(vnet.addressSpace).join(', ')||'—')+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Subnets</div><div class="kpi-value">'+subnets.length+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Peerings</div><div class="kpi-value kv-'+( peerings.length>0?'purple':'green')+'">'+peerings.length+'</div></div>'
		+'</div>'
		+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">PROPERTIES</div>'
		+'<div class="ir fr"><span class="ir-k">Resource Group</span><span class="ir-v">'+esc(vnet.resourceGroup||'—')+'</span></div>'
		+'<div class="ir fr"><span class="ir-k">Location</span><span class="ir-v">'+esc(vnet.location||'—')+'</span></div>'
		+'<div class="ir fr"><span class="ir-k">DNS Servers</span><span class="ir-v" style="font-size:9px">'+( arr(vnet.dnsServers).join(', ')||'Azure Default')+'</span></div>'
		+(peerings.length?'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:12px 0 6px">PEERINGS</div>'
		  +peerings.map(p=>'<div class="ir fr"><span class="ir-k">'+esc(p.remoteVnetName)+'</span><span class="ir-v"><span class="pill p-'+(p.peeringState==='Connected'?'green':'red')+'" style="font-size:8px">'+esc(p.peeringState)+'</span>'+(p.useRemoteGateways?' <span class="pill p-purple" style="font-size:8px">Gateway Transit</span>':'')+'</span></div>').join(''):'')
		+portalLink(vnet.id,'Open in Portal')
	  );
	}

	function openSubnetFlyout(sn){
	  openFlyout('Subnet — '+esc(sn.name),
		'<div class="kpi-grid g3" style="margin-bottom:12px">'
		+'<div class="kpi"><div class="kpi-label">Address Prefix</div><div class="kpi-value kv-cyan" style="font-size:13px">'+esc(sn.addressPrefix||'—')+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Session Hosts</div><div class="kpi-value">'+( sn.sessionHostCount||0)+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Host Pool</div><div class="kpi-value" style="font-size:10px">'+esc(sn.associatedHostPool||'None')+'</div></div>'
		+'</div>'
		+'<div class="ir fr"><span class="ir-k">NAT Gateway</span><span class="ir-v">'+(sn.natGatewayName?'<span class="pill p-green">'+esc(sn.natGatewayName)+'</span>':'<span class="pill p-amber">None — default SNAT</span>')+'</span></div>'
		+'<div class="ir fr"><span class="ir-k">NSG</span><span class="ir-v">'+(sn.nsgName?'<span class="pill p-blue">'+esc(sn.nsgName)+'</span>':'<span class="pill p-gray">None</span>')+'</span></div>'
		+(arr(sn.serviceEndpoints).length?'<div class="ir fr"><span class="ir-k">Service Endpoints</span><span class="ir-v" style="font-size:9px">'+arr(sn.serviceEndpoints).join(', ')+'</span></div>':'')
		+(sn.warning?'<div class="net-warning-strip" style="margin-top:8px">⚠ '+esc(sn.warning)+'</div>':'')
		+(arr(sn.sessionHostNames).length?'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:12px 0 6px">SESSION HOSTS</div>'
		  +arr(sn.sessionHostNames).map(h=>'<div class="net-host-chip" style="margin:2px 4px 2px 0;display:inline-flex">💻 '+esc(h)+'</div>').join(''):'')
	  );
	}

	function openNSGFlyout(nsg){
	  const rules=arr(nsg.securityRules);
	  const findings=arr(nsg.securityFindings);
	  const inbound=rules.filter(r=>r.direction==='Inbound');
	  const outbound=rules.filter(r=>r.direction==='Outbound');
	  openFlyout('NSG — '+esc(nsg.name),
		(findings.length?'<div style="margin-bottom:10px">'+findings.map(f=>'<div class="net-finding-strip net-finding-'+f.severity?.toLowerCase()+'">'+esc(f.finding)+'</div>').join('')+'</div>':'')
		+'<div class="kpi-grid g3" style="margin-bottom:12px">'
		+'<div class="kpi"><div class="kpi-label">Total Rules</div><div class="kpi-value">'+rules.length+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Inbound</div><div class="kpi-value kv-blue">'+inbound.length+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Security Findings</div><div class="kpi-value kv-'+(findings.length>0?'red':'green')+'">'+findings.length+'</div></div>'
		+'</div>'
		+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">INBOUND RULES</div>'
		+'<div class="data-table-wrap" style="max-height:220px;overflow-y:auto"><table class="data-table" style="font-size:9px">'
		+'<thead><tr><th>Priority</th><th>Name</th><th>Access</th><th>Source</th><th>Dest Port</th></tr></thead><tbody>'
		+inbound.map(r=>'<tr style="'+(r.securityConcern?'background:#ef444408':r.access==='Deny'?'opacity:0.55':'')+'"><td style="font-family:var(--font-mono)">'+r.priority+'</td><td style="font-size:8px">'+esc(r.name||'—')+'</td><td><span class="pill p-'+(r.access==='Allow'?'green':'red')+'" style="font-size:7px">'+esc(r.access)+'</span></td><td style="font-family:var(--font-mono)">'+esc(r.sourceAddressPrefix||'*')+'</td><td style="font-family:var(--font-mono)">'+(r.securityConcern?'<span style="color:var(--red)">':'')+''+esc(r.destinationPortRange||'*')+(r.securityConcern?'</span>':'')+'</td></tr>').join('')
		+'</tbody></table></div>'
		+portalLink(nsg.id,'Open in Portal')
	  );
	}

	function openNATFlyout(nat){
	  openFlyout('NAT Gateway — '+esc(nat.name),
		'<div class="kpi-grid g2" style="margin-bottom:12px">'
		+'<div class="kpi"><div class="kpi-label">SKU</div><div class="kpi-value kv-cyan">'+esc(nat.sku||'Standard')+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Idle Timeout</div><div class="kpi-value">'+( nat.idleTimeoutMinutes||4)+' min</div></div>'
		+'</div>'
		+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">PUBLIC IP ADDRESSES</div>'
		+arr(nat.publicIPAddresses).map(p=>'<div class="ir fr"><span class="ir-k">'+esc(p.name||p.id?.split('/').pop()||'—')+'</span><span class="ir-v" style="font-family:var(--font-mono);color:var(--cyan)">'+esc(p.ipAddress||'—')+'</span></div>').join('')
		+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:12px 0 6px">ASSOCIATED SUBNETS</div>'
		+arr(nat.associatedSubnets).map(s=>'<div class="net-host-chip" style="margin:2px 4px 2px 0;display:inline-flex">⊡ '+esc(s)+'</div>').join('')
		+'<div style="margin-top:10px">'+portalLink(nat.id,'Open in Portal')+'</div>'
	  );
	}

	function openBastionFlyout(bas){
	  openFlyout('Azure Bastion — '+esc(bas.name),
		'<div class="kpi-grid g2" style="margin-bottom:12px">'
		+'<div class="kpi"><div class="kpi-label">SKU</div><div class="kpi-value kv-cyan">'+esc(bas.sku||'Standard')+'</div></div>'
		+'<div class="kpi"><div class="kpi-label">Scale Units</div><div class="kpi-value">'+( bas.scaleUnits||1)+'</div></div>'
		+'</div>'
		+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">ENABLED FEATURES</div>'
		+[['Native Client Tunneling',bas.enableTunneling],['File Copy',bas.enableFileCopy],['IP Connect',bas.enableIpConnect],['Shareable Links',bas.enableShareableLink],['Kerberos',bas.enableKerberos]].map(([k,v])=>'<div class="ir fr"><span class="ir-k">'+k+'</span><span class="ir-v"><span class="pill p-'+(v?'green':'gray')+'" style="font-size:8px">'+(v?'✓ Enabled':'—')+'</span></span></div>').join('')
		+'<div class="ir fr"><span class="ir-k">Public IP</span><span class="ir-v" style="font-family:var(--font-mono);color:var(--cyan)">'+esc(bas.publicIPAddress||'—')+'</span></div>'
		+'<div class="ir fr"><span class="ir-k">Subnet</span><span class="ir-v">'+esc(bas.subnet||'AzureBastionSubnet')+'</span></div>'
		+'<div style="margin-top:10px">'+portalLink(bas.id,'Open in Portal')+'</div>'
	  );
	}

			// ── Session flyout from host pool card ────────────────────────────
		function openSessionsFlyout(hpName, state){
		  const allSess=arr(D.sessions);
		  let sessions=allSess.filter(s=>(s.hostPoolName||'')=== hpName);
		  if(state) sessions=sessions.filter(s=>s.sessionState===state);
		  const stateColor=state==='Active'?'var(--green)':state==='Disconnected'?'var(--amber)':'var(--cyan)';
		  if(!sessions.length){
			openFlyout(`${state} Sessions — ${hpName}`,`<div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No ${state.toLowerCase()} sessions found for this host pool.</div>`);
			return;
		  }
		  openFlyout(`${state} Sessions — ${hpName}`,`
			<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);letter-spacing:1px;margin-bottom:12px">
			  <span style="color:${stateColor}">${sessions.length}</span> ${state.toUpperCase()} SESSION${sessions.length!==1?'S':''}
			</div>
			<div class="data-table-wrap"><table class="data-table">
			  <thead><tr><th>User</th><th>State</th><th>Session Host</th><th>Connected</th><th>Type</th></tr></thead>
			  <tbody>${sessions.map(s=>`<tr>
				<td class="name-col fr" style="font-family:var(--font-mono)">${esc(s.userPrincipalName||'Unknown')}</td>
				<td><span class="pill p-${s.sessionState==='Active'?'green':'amber'}" style="font-size:9px">${esc(s.sessionState||'—')}</span></td>
				<td style="color:var(--cyan)">${esc((s.sessionHostName||'—').split('.')[0])}</td>
				<td style="font-size:9px">${esc(s.createTime||'—')}</td>
				<td><span class="pill p-${s.applicationType==='Desktop'?'blue':'purple'}" style="font-size:8px">${esc(s.applicationType||'Desktop')}</span></td>
			  </tr>`).join('')}</tbody>
			</table></div>`);
		}

		// ── Session host flyout ───────────────────────────────────────────
		// ── Network Topology flyouts ─────────────────────────────────────
		function openNetFlyout(type, data){
		  switch(type){
			case 'vnet':   openVNetFlyout(data);   break;
			case 'subnet': openSubnetFlyout(data); break;
			case 'nsg':    openNSGFlyout(data);    break;
			case 'nat':    openNATFlyout(data);    break;
			case 'bastion':openBastionFlyout(data);break;
			case 'sh':     openSHFlyout(data);     break;
			default: break;
		  }
		}

		function openVNetFlyout(vnet){
		  const subnets=arr(vnet.subnets);
		  const peerings=arr(vnet.peerings);
		  openFlyout('Virtual Network — '+esc(vnet.name),
			'<div class="kpi-grid g3" style="margin-bottom:12px">'
			+'<div class="kpi"><div class="kpi-label">Address Space</div><div class="kpi-value kv-cyan" style="font-size:13px">'+esc(arr(vnet.addressSpace).join(', ')||'—')+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Subnets</div><div class="kpi-value">'+subnets.length+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Peerings</div><div class="kpi-value kv-'+( peerings.length>0?'purple':'green')+'">'+peerings.length+'</div></div>'
			+'</div>'
			+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">PROPERTIES</div>'
			+'<div class="ir fr"><span class="ir-k">Resource Group</span><span class="ir-v">'+esc(vnet.resourceGroup||'—')+'</span></div>'
			+'<div class="ir fr"><span class="ir-k">Location</span><span class="ir-v">'+esc(vnet.location||'—')+'</span></div>'
			+'<div class="ir fr"><span class="ir-k">DNS Servers</span><span class="ir-v" style="font-size:9px">'+( arr(vnet.dnsServers).join(', ')||'Azure Default')+'</span></div>'
			+(peerings.length?'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:12px 0 6px">PEERINGS</div>'
			  +peerings.map(p=>'<div class="ir fr"><span class="ir-k">'+esc(p.remoteVnetName)+'</span><span class="ir-v"><span class="pill p-'+(p.peeringState==='Connected'?'green':'red')+'" style="font-size:8px">'+esc(p.peeringState)+'</span>'+(p.useRemoteGateways?' <span class="pill p-purple" style="font-size:8px">Gateway Transit</span>':'')+'</span></div>').join(''):'')
			+portalLink(vnet.id,'Open in Portal')
		  );
		}

		function openSubnetFlyout(sn){
		  openFlyout('Subnet — '+esc(sn.name),
			'<div class="kpi-grid g3" style="margin-bottom:12px">'
			+'<div class="kpi"><div class="kpi-label">Address Prefix</div><div class="kpi-value kv-cyan" style="font-size:13px">'+esc(sn.addressPrefix||'—')+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Session Hosts</div><div class="kpi-value">'+( sn.sessionHostCount||0)+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Host Pool</div><div class="kpi-value" style="font-size:10px">'+esc(sn.associatedHostPool||'None')+'</div></div>'
			+'</div>'
			+'<div class="ir fr"><span class="ir-k">NAT Gateway</span><span class="ir-v">'+(sn.natGatewayName?'<span class="pill p-green">'+esc(sn.natGatewayName)+'</span>':'<span class="pill p-amber">None — default SNAT</span>')+'</span></div>'
			+'<div class="ir fr"><span class="ir-k">NSG</span><span class="ir-v">'+(sn.nsgName?'<span class="pill p-blue">'+esc(sn.nsgName)+'</span>':'<span class="pill p-gray">None</span>')+'</span></div>'
			+(arr(sn.serviceEndpoints).length?'<div class="ir fr"><span class="ir-k">Service Endpoints</span><span class="ir-v" style="font-size:9px">'+arr(sn.serviceEndpoints).join(', ')+'</span></div>':'')
			+(sn.warning?'<div class="net-warning-strip" style="margin-top:8px">⚠ '+esc(sn.warning)+'</div>':'')
			+(arr(sn.sessionHostNames).length?'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:12px 0 6px">SESSION HOSTS</div>'
			  +arr(sn.sessionHostNames).map(h=>'<div class="net-host-chip" style="margin:2px 4px 2px 0;display:inline-flex">💻 '+esc(h)+'</div>').join(''):'')
		  );
		}

		function openNSGFlyout(nsg){
		  const rules=arr(nsg.securityRules);
		  const findings=arr(nsg.securityFindings);
		  const inbound=rules.filter(r=>r.direction==='Inbound');
		  const outbound=rules.filter(r=>r.direction==='Outbound');
		  openFlyout('NSG — '+esc(nsg.name),
			(findings.length?'<div style="margin-bottom:10px">'+findings.map(f=>'<div class="net-finding-strip net-finding-'+f.severity?.toLowerCase()+'">'+esc(f.finding)+'</div>').join('')+'</div>':'')
			+'<div class="kpi-grid g3" style="margin-bottom:12px">'
			+'<div class="kpi"><div class="kpi-label">Total Rules</div><div class="kpi-value">'+rules.length+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Inbound</div><div class="kpi-value kv-blue">'+inbound.length+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Security Findings</div><div class="kpi-value kv-'+(findings.length>0?'red':'green')+'">'+findings.length+'</div></div>'
			+'</div>'
			+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">INBOUND RULES</div>'
			+'<div class="data-table-wrap" style="max-height:220px;overflow-y:auto"><table class="data-table" style="font-size:9px">'
			+'<thead><tr><th>Priority</th><th>Name</th><th>Access</th><th>Source</th><th>Dest Port</th></tr></thead><tbody>'
			+inbound.map(r=>'<tr style="'+(r.securityConcern?'background:#ef444408':r.access==='Deny'?'opacity:0.55':'')+'"><td style="font-family:var(--font-mono)">'+r.priority+'</td><td style="font-size:8px">'+esc(r.name||'—')+'</td><td><span class="pill p-'+(r.access==='Allow'?'green':'red')+'" style="font-size:7px">'+esc(r.access)+'</span></td><td style="font-family:var(--font-mono)">'+esc(r.sourceAddressPrefix||'*')+'</td><td style="font-family:var(--font-mono)">'+(r.securityConcern?'<span style="color:var(--red)">':'')+''+esc(r.destinationPortRange||'*')+(r.securityConcern?'</span>':'')+'</td></tr>').join('')
			+'</tbody></table></div>'
			+portalLink(nsg.id,'Open in Portal')
		  );
		}

		function openNATFlyout(nat){
		  openFlyout('NAT Gateway — '+esc(nat.name),
			'<div class="kpi-grid g2" style="margin-bottom:12px">'
			+'<div class="kpi"><div class="kpi-label">SKU</div><div class="kpi-value kv-cyan">'+esc(nat.sku||'Standard')+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Idle Timeout</div><div class="kpi-value">'+( nat.idleTimeoutMinutes||4)+' min</div></div>'
			+'</div>'
			+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">PUBLIC IP ADDRESSES</div>'
			+arr(nat.publicIPAddresses).map(p=>'<div class="ir fr"><span class="ir-k">'+esc(p.name||p.id?.split('/').pop()||'—')+'</span><span class="ir-v" style="font-family:var(--font-mono);color:var(--cyan)">'+esc(p.ipAddress||'—')+'</span></div>').join('')
			+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:12px 0 6px">ASSOCIATED SUBNETS</div>'
			+arr(nat.associatedSubnets).map(s=>'<div class="net-host-chip" style="margin:2px 4px 2px 0;display:inline-flex">⊡ '+esc(s)+'</div>').join('')
			+'<div style="margin-top:10px">'+portalLink(nat.id,'Open in Portal')+'</div>'
		  );
		}

		function openBastionFlyout(bas){
		  openFlyout('Azure Bastion — '+esc(bas.name),
			'<div class="kpi-grid g2" style="margin-bottom:12px">'
			+'<div class="kpi"><div class="kpi-label">SKU</div><div class="kpi-value kv-cyan">'+esc(bas.sku||'Standard')+'</div></div>'
			+'<div class="kpi"><div class="kpi-label">Scale Units</div><div class="kpi-value">'+( bas.scaleUnits||1)+'</div></div>'
			+'</div>'
			+'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">ENABLED FEATURES</div>'
			+[['Native Client Tunneling',bas.enableTunneling],['File Copy',bas.enableFileCopy],['IP Connect',bas.enableIpConnect],['Shareable Links',bas.enableShareableLink],['Kerberos',bas.enableKerberos]].map(([k,v])=>'<div class="ir fr"><span class="ir-k">'+k+'</span><span class="ir-v"><span class="pill p-'+(v?'green':'gray')+'" style="font-size:8px">'+(v?'✓ Enabled':'—')+'</span></span></div>').join('')
			+'<div class="ir fr"><span class="ir-k">Public IP</span><span class="ir-v" style="font-family:var(--font-mono);color:var(--cyan)">'+esc(bas.publicIPAddress||'—')+'</span></div>'
			+'<div class="ir fr"><span class="ir-k">Subnet</span><span class="ir-v">'+esc(bas.subnet||'AzureBastionSubnet')+'</span></div>'
			+'<div style="margin-top:10px">'+portalLink(bas.id,'Open in Portal')+'</div>'
		  );
		}

	// ── RDP Properties Analysis flyout ───────────────────────────────
	const RDP_REF_FULL = {
	  'enablerdsaadauth':        {rec:'1',   label:'Entra ID Auth',       cat:'Authentication', desc:'Microsoft Entra ID (AAD) authentication for the session.'},
	  'targetisaadjoined':       {rec:'1',   label:'Entra Joined Target', cat:'Authentication', desc:'Set to 1 when session hosts are Entra ID joined (not AD).'},
	  'redirectwebauthn':        {rec:'1',   label:'WebAuthn / FIDO2',    cat:'Authentication', desc:'Passkeys and FIDO2 security keys usable inside the session.'},
	  'use multimon':            {rec:'1',   label:'Multi-Monitor',       cat:'Display',        desc:'Session spans all client monitors.'},
	  'dynamic resolution':      {rec:'1',   label:'Dynamic Resolution',  cat:'Display',        desc:'Resolution adjusts when client window is resized.'},
	  'audiomode':               {rec:'0',   label:'Audio Playback',      cat:'Audio/Video',    desc:'0=local client (recommended), 1=remote host, 2=disabled.'},
	  'audiocapturemode':        {rec:'1',   label:'Microphone',          cat:'Audio/Video',    desc:'Microphone redirected from client to session.'},
	  'videoplaybackmode':       {rec:'1',   label:'Video / MMR',         cat:'Audio/Video',    desc:'Multimedia redirection — video renders on client, not server.'},
	  'redirectclipboard':       {rec:'1',   label:'Clipboard',           cat:'Devices',        desc:'Copy/paste between local and remote.'},
	  'redirectprinters':        {rec:'1',   label:'Printers',            cat:'Devices',        desc:'Local printers available in session.'},
	  'redirectsmartcards':      {rec:'1',   label:'Smart Cards',         cat:'Devices',        desc:'Smart cards and YubiKeys usable in session.'},
	  'drivestoredirect':        {rec:'s:',  label:'Drive Redirect',      cat:'Devices',        desc:'Empty=disabled (pooled), *=all drives (personal only).'},
	  'devicestoredirect':       {rec:'s:',  label:'PnP Devices',         cat:'Devices',        desc:'Plug and Play device redirection.'},
	  'usbdevicestoredirect':    {rec:'s:',  label:'USB Devices',         cat:'Devices',        desc:'USB redirection — disable for pooled desktops.'},
	  'redirectcomports':        {rec:'0',   label:'COM Ports',           cat:'Devices',        desc:'Serial port redirection — disable unless legacy hardware needed.'},
	  'camerastoredirect':       {rec:'s:',  label:'Camera',              cat:'Devices',        desc:'Webcam redirection. Use Teams MMR instead where possible.'},
	  'bandwidthautodetect':     {rec:'1',   label:'Bandwidth Detect',    cat:'Connection',     desc:'Adapts quality to available bandwidth automatically.'},
	  'networkautodetect':       {rec:'1',   label:'Network Detect',      cat:'Connection',     desc:'Detects network type and optimises settings.'},
	  'autoreconnection enabled':{rec:'1',   label:'Auto Reconnect',      cat:'Connection',     desc:'Reconnects automatically after network interruption.'},
	  'compression':             {rec:'1',   label:'Compression',         cat:'Connection',     desc:'Reduces bandwidth at cost of minor CPU overhead.'},
	  'disableconnectionsharing':{rec:'0',   label:'Session Sharing',     cat:'Connection',     desc:'0=reconnect to existing session (recommended for pooled).'},
	};

	function rdpCompStatus(key, val){
	  const ref=RDP_REF_FULL[key]; if(!ref) return 'unknown';
	  const v=String(val??''); if(!v||v==='s:'&&ref.rec==='s:') return v===ref.rec?'ok':'unconfigured';
	  return v===String(ref.rec)?'ok':'review';
	}

	function openRDPFlyout(hp){
	  const rdp=hp.rdpPropertiesParsed||{};
	  const configuredKeys=Object.keys(rdp).filter(k=>rdp[k]!==undefined&&rdp[k]!=='');
	  const totalRef=Object.keys(RDP_REF_FULL).length;
	  let okCount=0, reviewCount=0, notSetCount=0;
	  Object.keys(RDP_REF_FULL).forEach(k=>{
		const st=rdpCompStatus(k,rdp[k]);
		if(st==='ok') okCount++;
		else if(st==='review') reviewCount++;
		else notSetCount++;
	  });

	  const cats=[...new Set(Object.values(RDP_REF_FULL).map(r=>r.cat))];
	  let body=`
		<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
		  <div class="kpi" style="flex:1;min-width:80px"><div class="kpi-label">Configured</div><div class="kpi-value kv-cyan">${configuredKeys.length}<span style="font-size:11px;color:var(--text-muted)">/${totalRef}</span></div></div>
		  <div class="kpi" style="flex:1;min-width:80px"><div class="kpi-label">Compliant</div><div class="kpi-value kv-green">${okCount}</div></div>
		  <div class="kpi" style="flex:1;min-width:80px"><div class="kpi-label">Review</div><div class="kpi-value kv-${reviewCount>0?'amber':'green'}">${reviewCount}</div></div>
		  <div class="kpi" style="flex:1;min-width:80px"><div class="kpi-label">Not Set</div><div class="kpi-value kv-${notSetCount>10?'amber':'green'}">${notSetCount}</div></div>
		</div>
		<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:10px">
		  Current value · <span style="color:var(--text-dim)">Recommended</span>
		</div>`;

	  cats.forEach(cat=>{
		const catKeys=Object.keys(RDP_REF_FULL).filter(k=>RDP_REF_FULL[k].cat===cat);
		body+=`<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);text-transform:uppercase;margin:12px 0 4px;padding-bottom:4px;border-bottom:1px solid var(--border)">${cat}</div>`;
		catKeys.forEach(key=>{
		  const ref=RDP_REF_FULL[key];
		  const val=rdp[key];
		  const st=rdpCompStatus(key,val);
		  const statusDot = st==='ok'
			? `<div class="rdp-comp-status" style="background:#10b98115;color:var(--green)">✓</div>`
			: st==='review'
			? `<div class="rdp-comp-status" style="background:#f59e0b15;color:var(--amber)">⚑</div>`
			: `<div class="rdp-comp-status" style="background:var(--bg-panel);color:var(--text-dim)">—</div>`;
		  const dispVal = val!==undefined&&val!==''
			? `<span style="color:${st==='ok'?'var(--green)':st==='review'?'var(--amber)':'var(--text-muted)'};">${esc(String(val))}</span>`
			: `<span style="color:var(--text-dim)">not set</span>`;
		  const recStr = ref.rec===''||ref.rec==='s:'?'(disabled)':ref.rec==='1'?'1 (on)':ref.rec==='0'?'0 (off)':ref.rec;
		  body+=`<div class="rdp-comp-row" title="${esc(ref.desc)}">
			${statusDot}
			<div style="flex:1;min-width:0">
			  <div style="font-family:var(--font-mono);font-size:9px;color:var(--cyan)">${esc(key)}</div>
			  <div style="font-size:9px;color:var(--text-muted);margin-top:1px">${esc(ref.label)}</div>
			</div>
			<div style="text-align:right;flex-shrink:0">
			  <div>${dispVal}</div>
			  <div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">rec: ${esc(recStr)}</div>
			</div>
		  </div>`;
		});
	  });

	  openFlyout(`RDP Properties — ${esc(hp.name)}`, body);
	}

	function openSHFlyout(sh){
	  const sessions=arr(D.sessions).filter(s=>{
		const shShort=(s.sessionHostName||'').toLowerCase().split('.')[0];
		const myShort=(sh.vmName||sh.name||'').toLowerCase().split('.')[0];
		return shShort===myShort;
	  });
	  openFlyout('Session Host — '+(sh.vmName||sh.name||''),`
		<div class="kpi-grid g2" style="margin-bottom:12px">
		  <div class="kpi"><div class="kpi-label">Status</div><div class="kpi-value" style="font-size:16px;color:${statusColor2(sh.status)}">${esc(sh.status||'—')}</div></div>
		  <div class="kpi"><div class="kpi-label">Sessions</div><div class="kpi-value kv-cyan">${(sh.activeSessions||0)+(sh.disconnectedSessions||0)}</div><div class="kpi-sub">${sh.activeSessions||0} active · ${sh.disconnectedSessions||0} disc</div></div>
		</div>
		<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">SESSION HOST STATUS</div>
		<div class="ir fr"><span class="ir-k">Status</span><span class="ir-v">${esc(sh.status||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">New Sessions</span><span class="ir-v">${sh.drainMode?'Blocked':'Allowed'}</span></div>
		<div class="ir fr"><span class="ir-k">Agent Version</span><span class="ir-v">${esc(sh.agentVersion||'—')} ${copyBtn(sh.agentVersion||'')}</span></div>
		<div class="ir fr"><span class="ir-k">Last Heartbeat</span><span class="ir-v">${esc(sh.lastHeartbeat||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">OS Version</span><span class="ir-v">${esc(sh.osVersion||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">Update State</span><span class="ir-v">${esc(sh.updateState||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">Last Update</span><span class="ir-v">${esc(sh.lastUpdate||'—')}</span></div>
		<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">VIRTUAL MACHINE</div>
		<div class="ir fr"><span class="ir-k">VM Name</span><span class="ir-v">${esc(sh.vmName||'—')} ${copyBtn(sh.vmName||'')} ${portalLink(sh.vmResourceId||sh.id,'')}</span></div>
		<div class="ir fr"><span class="ir-k">VM Size</span><span class="ir-v">${esc(sh.vmSize||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">Location</span><span class="ir-v">${esc(sh.vmLocation||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">OS Type</span><span class="ir-v">${esc(sh.osType||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">Power State</span><span class="ir-v">${esc(sh.powerState||'—')}</span></div>
		<div class="ir fr"><span class="ir-k">Provisioning</span><span class="ir-v">${sh.provisioningState?'<span class="pill p-'+(sh.provisioningState==='Succeeded'?'green':'amber')+'">'+esc(sh.provisioningState)+'</span>':'—'}</span></div>
		<div class="ir fr"><span class="ir-k">Image</span><span class="ir-v">${esc(sh.imageInfo||'—')}</span></div>
		${sh.excludeFromScaling?'<div class="ir fr"><span class="ir-k">Scaling</span><span class="ir-v"><span class="pill p-amber">⊘ Excluded from Scaling</span></span></div>':''}
		<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">STORAGE</div>
		<div class="ir fr"><span class="ir-k">OS Disk</span><span class="ir-v" style="font-size:9px">${esc(sh.osDiskName||'—')} ${sh.osDiskName?copyBtn(sh.osDiskName):''}</span></div>
		<div class="ir fr"><span class="ir-k">Disk Size</span><span class="ir-v">${sh.osDiskSizeGB?sh.osDiskSizeGB+' GB':'—'}</span></div>
		<div class="ir fr"><span class="ir-k">Storage Type</span><span class="ir-v">${(()=>{const t=sh.osDiskType||'—';const c=t.includes('Premium')?'p-cyan':t.includes('Standard_SSD')?'p-blue':'p-gray';return t!=='—'?'<span class="pill '+c+'" style="font-size:8px">'+esc(t)+'</span>':'—';})()}</span></div>
		<div class="ir fr"><span class="ir-k">Caching</span><span class="ir-v">${esc(sh.osDiskCaching||'—')}</span></div>
		${sh.vnetName?'<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">NETWORK</div><div class="ir fr"><span class="ir-k">VNet</span><span class="ir-v">'+esc(sh.vnetName||'—')+'</span></div><div class="ir fr"><span class="ir-k">Subnet</span><span class="ir-v">'+esc(sh.subnetName||'—')+'</span></div>':''}
		<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">NETWORK &amp; STORAGE</div>
		<div class="ir fr"><span class="ir-k">Private IP</span><span class="ir-v">${esc(sh.privateIP||'Not assigned')} ${sh.privateIP?copyBtn(sh.privateIP):''}</span></div>
		<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">MONITORING AGENTS</div>
		<div class="ir fr"><span class="ir-k">Azure Monitor Agent (AMA)</span><span class="ir-v">${sh.hasAMAAgent?'<span class="pill p-green">Detected</span>':'<span class="pill p-gray">Not found</span>'}</span></div>
		<div class="ir fr"><span class="ir-k">MMA (Legacy)</span><span class="ir-v">${sh.hasMMAAgent?'<span class="pill p-amber">Detected</span>':'<span class="pill p-gray">Not found</span>'}</span></div>
		<div class="ir fr"><span class="ir-k">FSLogix</span><span class="ir-v">${sh.fslogixDetected?'<span class="pill p-cyan">Detected</span>':'<span class="pill p-gray">Not detected</span>'}</span></div>
		${sessions.length?`<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">USER SESSIONS (${sessions.length})</div>
		${sessions.map(s=>`<div class="sess-row fr">
		  <span class="sess-dot ${s.sessionState||'Pending'}"></span>
		  <span class="sess-user">${esc(s.userPrincipalName||'Unknown')}</span> ${copyBtn(s.userPrincipalName||'')}
		  <span class="pill p-${s.sessionState==='Active'?'green':'amber'}" style="font-size:9px">${esc(s.sessionState||'—')}</span>
		  <span class="sess-meta">${esc(s.createTime||'')}</span>
		</div>`).join('')}`:''}
	  `);
	}
	function statusColor2(s){ const m={Available:'var(--green)',Unavailable:'var(--red)',NeedsAssistance:'var(--orange)',Shutdown:'var(--text-muted)',Disconnected:'var(--amber)'}; return m[s]||'var(--text-muted)'; }


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: SCALING PLANS
	// ═══════════════════════════════════════════════════════════════════
	function renderScaling(){
	  if(!D){ $('view-scaling').innerHTML=noData('Scaling Plans'); return; }
	  const sps=arr(D.scalingPlans);
	  if(!sps.length){ $('view-scaling').innerHTML=`<div class="section-hdr"><h2>Scaling Plans</h2></div><div class="card"><div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No scaling plans found.</div></div>`; return; }
	  $('view-scaling').innerHTML=`<div class="section-hdr"><h2>Scaling Plans</h2><span class="section-sub">Automated capacity management · ${sps.length} plan${sps.length!==1?'s':''}</span></div>
	  ${sps.map(sp=>{
		const refs=arr(sp.hostPoolRefs); const scheds=arr(sp.schedules);
		const spId='spbody'+Date.now()+Math.random().toString(36).slice(2);
		return `<div class="coll-card">
		  <div class="coll-header" onclick="toggleColl('${spId}',this)">
			<span style="font-size:18px">⚖</span>
			<span style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0"><span style="font-family:var(--font-display);font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sp.name)}</span><span onclick="event.stopPropagation()">${copyBtn(sp.name)} ${portalLink(sp.id,'')}</span></span>
			<span class="pill ${sp.hostPoolType==='Pooled'?'p-cyan':'p-purple'}">${esc(sp.hostPoolType||'Pooled')}</span>
			<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${arr(sp.schedules).length} schedule${arr(sp.schedules).length!==1?'s':''}</span>
			<span class="coll-caret">▼</span>
		  </div>
		  <div id="${spId}" class="coll-body">
		  <div class="col2" style="margin-bottom:12px">
			<div>
			  <div class="ir"><span class="ir-k">Resource Group</span><span class="ir-v">${esc(sp.resourceGroup||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Time Zone</span><span class="ir-v">${esc(sp.timezone||'—')}</span></div>
			  ${sp.exclusionTag?`<div class="ir"><span class="ir-k">Exclusion Tag</span><span class="ir-v"><span class="pill p-amber">${esc(sp.exclusionTag)}</span></span></div>`:''}
			</div>
			<div>
			  <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">ASSIGNED HOST POOLS (${refs.length})</div>
			  ${refs.map(r=>`<div class="ir"><span class="ir-k">${esc(r.hostPoolName||'—')}</span><span class="ir-v">${r.scalingEnabled?'<span class="pill p-green">Enabled</span>':'<span class="pill p-gray">Disabled</span>'}</span></div>`).join('') || '<div style="color:var(--text-muted);font-family:var(--font-mono);font-size:10px">None</div>'}
			</div>
		  </div>
		  ${scheds.map(sc=>{
			function t2p(t){ if(!t||t==='—') return null; const [h,m]=(t||'0:0').split(':').map(Number); return((h*60+(m||0))/(24*60))*100; }
			const phases=[{label:'Off-Peak',t:sc.offPeakStartTime,cls:'seg-op'},{label:'Ramp-Up',t:sc.rampUpStartTime,cls:'seg-ru'},{label:'Peak',t:sc.peakStartTime,cls:'seg-pk'},{label:'Ramp-Down',t:sc.rampDownStartTime,cls:'seg-rd'}];
			const pcts=phases.map(p=>t2p(p.t));
			let tl='';
			for(let i=0;i<phases.length;i++){ const s=pcts[i],e=i<phases.length-1?pcts[i+1]:100; if(s==null||e==null)continue; tl+=`<div class="sched-seg ${phases[i].cls}" style="left:${s}%;width:${e-s}%">${phases[i].label}</div>`; }
			return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px">
			  <div style="display:flex;justify-content:space-between;margin-bottom:8px">
				<span style="font-family:var(--font-display);font-weight:700;font-size:14px">${esc(sc.name||'Schedule')}</span>
				<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${arr(sc.daysOfWeek).join(', ')||'—'}</span>
			  </div>
			  <div class="sched-timeline">${tl}</div>
			  <div class="col2" style="margin-top:10px">
				<div>
				  <div style="font-family:var(--font-mono);font-size:9px;color:var(--purple);letter-spacing:1px;margin-bottom:4px">RAMP-UP · ${esc(sc.rampUpStartTime||'—')}</div>
				  <div class="ir"><span class="ir-k">Load Balancing</span><span class="ir-v">${esc(sc.rampUpLoadAlgorithm||'—')}</span></div>
				  <div class="ir"><span class="ir-k">Min Hosts %</span><span class="ir-v">${esc(sc.rampUpMinimumHostsPct??'—')}%</span></div>
				  <div class="ir"><span class="ir-k">Capacity Threshold</span><span class="ir-v">${esc(sc.rampUpCapacityThresholdPct??'—')}%</span></div>
				</div>
				<div>
				  <div style="font-family:var(--font-mono);font-size:9px;color:var(--amber);letter-spacing:1px;margin-bottom:4px">RAMP-DOWN · ${esc(sc.rampDownStartTime||'—')}</div>
				  <div class="ir"><span class="ir-k">Min Hosts %</span><span class="ir-v">${esc(sc.rampDownMinimumHostsPct??'—')}%</span></div>
				  <div class="ir"><span class="ir-k">Force Logoff</span><span class="ir-v">${sc.rampDownForceLogoffUser?'<span class="pill p-red">Yes</span>':'<span class="pill p-green">No</span>'}</span></div>
				  <div class="ir"><span class="ir-k">Wait Time</span><span class="ir-v">${esc(sc.rampDownWaitTimeMinutes??'—')} min</span></div>
				  ${sc.rampDownNotificationMessage?`<div class="ir" style="flex-direction:column;align-items:flex-start;gap:4px"><span class="ir-k">Notification</span><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-secondary)">${esc(sc.rampDownNotificationMessage)}</span></div>`:''}
				</div>
			  </div>
			</div>`;
		  }).join('')}
		</div>`;
	  }).join('')}`;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: WORKSPACES
	// ═══════════════════════════════════════════════════════════════════
	function renderWorkspaces(){
	  if(!D){ $('view-workspaces').innerHTML=noData('Workspaces'); return; }
	  const wss=arr(D.avdWorkspaces);
	  $('view-workspaces').innerHTML=`<div class="section-hdr"><h2>Workspaces</h2><span class="section-sub">Logical groupings of application groups · ${wss.length} workspace${wss.length!==1?'s':''}</span></div>
	  ${wss.map(ws=>{
		const ags=arr(D.applicationGroups).filter(ag=>ag.workspaceId===ws.id||ag.workspaceName===ws.name);
		const wsId='wsbody'+Date.now()+Math.random().toString(36).slice(2);
		return `<div class="coll-card">
		  <div class="coll-header" onclick="toggleColl('${wsId}',this)">
			<span style="font-size:18px">⊞</span>
			<span style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0"><span style="font-family:var(--font-display);font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ws.name)}</span><span onclick="event.stopPropagation()">${copyBtn(ws.name)} ${portalLink(ws.id,'')}</span></span>
			${ws.diagnosticsEnabled?'<span class="pill p-green" style="font-size:9px">Diag</span>':'<span class="pill p-amber" style="font-size:9px">No Diag</span>'}
			<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${ags.length} group${ags.length!==1?'s':''}</span>
			<span class="coll-caret">▼</span>
		  </div>
		  <div id="${wsId}" class="coll-body">
		  <div class="col2" style="margin-bottom:10px">
			<div>
			  <div class="ir"><span class="ir-k">Resource Group</span><span class="ir-v">${esc(ws.resourceGroup||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Location</span><span class="ir-v">${esc(ws.location||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Friendly Name</span><span class="ir-v">${esc(ws.friendlyName||'—')}</span></div>
			  ${ws.description?`<div class="ir"><span class="ir-k">Description</span><span class="ir-v">${esc(ws.description)}</span></div>`:''}
			  ${Object.keys(ws.tags||{}).length?`<div class="ir"><span class="ir-k">Tags</span><span class="ir-v">${Object.entries(ws.tags).map(([k,v])=>`<span class="rdp-prop"><span class="rdp-k">${esc(k)}</span><span class="rdp-v">${esc(v)}</span></span>`).join('')}</span></div>`:''}
			  <div class="ir"><span class="ir-k">Resource ID</span><span class="ir-v" style="font-size:9px;word-break:break-all">${esc(ws.id||'—')} ${ws.id?copyBtn(ws.id):''}</span></div>
			</div>
			<div>
			  <div class="ir"><span class="ir-k">Diagnostics</span><span class="ir-v">${ws.diagnosticsEnabled?'<span class="pill p-green">Enabled</span>':'<span class="pill p-amber">Not Configured</span>'}</span></div>
			  ${ws.currentMonthCost!=null?`<div class="ir"><span class="ir-k">Cost MTD</span><span class="ir-v">${fmtCur(ws.currentMonthCost,ws.currency)}</span></div>`:''}
			</div>
		  </div>
		  ${ags.length?`<div class="hp-sec-label">Assigned Application Groups</div>
		  ${ags.map(ag=>`<div class="ir"><span class="ir-k">${esc(ag.name)}</span><span class="ir-v"><span class="pill ${ag.applicationGroupType==='Desktop'?'p-blue':'p-purple'}">${esc(ag.applicationGroupType)}</span></span></div>`).join('')}`:''}
		  </div>
		</div>`;
	  }).join('')||'<div class="card"><div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No workspaces found.</div></div>'}`;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: APP GROUPS
	// ═══════════════════════════════════════════════════════════════════
	function renderAppGroups(){
	  if(!D){ $('view-appgroups').innerHTML=noData('App Groups'); return; }
	  const ags=arr(D.applicationGroups);
	  $('view-appgroups').innerHTML=`<div class="section-hdr"><h2>Application Groups</h2><span class="section-sub">Collections of apps or desktops published to users · ${ags.length} group${ags.length!==1?'s':''}</span></div>
	  ${ags.map(ag=>{
		const users=arr(ag.assignedUsers), groups=arr(ag.assignedGroups), all=[...users,...groups];
		const agId='agbody'+Date.now()+Math.random().toString(36).slice(2);
		return `<div class="coll-card">
		  <div class="coll-header" onclick="toggleColl('${agId}',this)">
			<span style="font-size:18px">${ag.applicationGroupType==='Desktop'?'🖥':'🚀'}</span>
			<span style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0"><span style="font-family:var(--font-display);font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ag.name)}</span><span onclick="event.stopPropagation()">${copyBtn(ag.name)} ${portalLink(ag.id,'')}</span></span>
			<span class="pill ${ag.applicationGroupType==='Desktop'?'p-blue':'p-purple'}">${esc(ag.applicationGroupType)}</span>
			<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${ag.totalAssignees||0} assigned</span>
			<span class="coll-caret">▼</span>
		  </div>
		  <div id="${agId}" class="coll-body">
		  <div class="col2" style="margin-bottom:10px">
			<div>
			  <div class="ir"><span class="ir-k">Host Pool</span><span class="ir-v"><span class="pill p-cyan">${esc(ag.hostPoolName||'—')}</span></span></div>
			  <div class="ir"><span class="ir-k">Workspace</span><span class="ir-v">${esc(ag.workspaceFriendlyName||ag.workspaceName||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Friendly Name</span><span class="ir-v">${esc(ag.friendlyName&&ag.friendlyName!==ag.name?ag.friendlyName:'—')}</span></div>
			  <div class="ir"><span class="ir-k">Resource Group</span><span class="ir-v">${esc(ag.resourceGroup||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Location</span><span class="ir-v">${esc(ag.location||'—')}</span></div>
			  ${ag.description?`<div class="ir"><span class="ir-k">Description</span><span class="ir-v">${esc(ag.description)}</span></div>`:''}
			  <div class="ir"><span class="ir-k">Diagnostics</span><span class="ir-v">${ag.diagnosticsEnabled?'<span class="pill p-green">Enabled</span>':'<span class="pill p-amber">Not Configured</span>'}</span></div>
			</div>
			<div>
			  <div class="ir"><span class="ir-k">Assignees</span><span class="ir-v">${ag.totalAssignees||0} total</span></div>
			  <div class="ir"><span class="ir-k">Groups</span><span class="ir-v">${groups.length}</span></div>
			  <div class="ir"><span class="ir-k">Users</span><span class="ir-v">${users.length}</span></div>
			</div>
		  </div>
		  ${all.length?`<div class="hp-sec-label">Assignments (${all.length})</div>
		  <div class="data-table-wrap"><table class="data-table">
			<thead><tr><th>Principal</th><th>Type</th></tr></thead>
			<tbody>${all.map(a=>{const stdRole='Desktop Virtualization User';const nonStd=a.role&&a.role!==stdRole?`<span class="pill p-amber" style="font-size:8px;margin-left:4px">${esc(a.role)}</span>`:'';return`<tr><td class="name-col">${esc(a.displayName||a.signInName||a.objectId||'—')}${nonStd}</td><td><span class="pill ${a.objectType==='Group'?'p-cyan':'p-gray'}">${esc(a.objectType||'—')}</span></td></tr>`;}).join('')}</tbody>
		  </table></div>`:''}
		  ${ag.applicationGroupType==='RemoteApp'&&arr(ag.remoteApps).length?`<div class="hp-sec-label">Published Applications (${ag.remoteAppCount||0})</div>
		  <div class="data-table-wrap"><table class="data-table">
			<thead><tr><th>Name</th><th>Friendly Name</th><th>Path</th><th>Portal</th></tr></thead>
			<tbody>${arr(ag.remoteApps).map(a=>`<tr><td class="name-col">${esc(a.name||'—')}</td><td>${esc(a.friendlyName||'—')}</td><td style="color:var(--cyan);font-size:9px">${esc(a.filePath||'—')}</td><td><span class="pill p-${a.showInPortal?'green':'gray'}" style="font-size:8px">${a.showInPortal?'Visible':'Hidden'}</span></td></tr>`).join('')}</tbody>
		  </table></div>`:''}
		</div>`;
	  }).join('')||'<div class="card"><div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No application groups found.</div></div>'}`;
	}

	// ═══════════════════════════════════════════════════════════════════
	// VIEW: APPLICATIONS
	// ═══════════════════════════════════════════════════════════════════
	function renderApplications(){
	  if(!D){ $('view-applications').innerHTML=noData('Applications'); return; }
	  const allApps=arr(D.applicationGroups).filter(g=>g.applicationGroupType==='RemoteApp').flatMap(g=>arr(g.remoteApps).map(a=>({...a,agName:g.name,assignees:[...arr(g.assignedUsers),...arr(g.assignedGroups)]})));
	  $('view-applications').innerHTML=`<div class="section-hdr"><h2>Applications</h2><span class="section-sub">Published RemoteApp applications · ${allApps.length} app${allApps.length!==1?'s':''}</span></div>
	  <div class="card"><div class="card-title">Published Applications — Available through RemoteApp</div>
	  ${allApps.length?`<div class="search-bar"><span class="search-icon">⌕</span><input placeholder="Filter by name, path, group…" oninput="filterTable('apps-t',this.value)"></div>
	  <div class="data-table-wrap"><table class="data-table" id="apps-t">
		<thead><tr><th>Name</th><th>Friendly Name</th><th>App Group</th><th>File Path</th><th>Arguments</th><th>Portal</th><th>Assigned</th></tr></thead>
		<tbody>${allApps.map(a=>`<tr data-search="${esc((a.name+a.agName+(a.filePath||'')).toLowerCase())}">
		  <td class="name-col">${esc(a.name||'—')}</td>
		  <td>${esc(a.friendlyName||'—')}</td>
		  <td><span class="pill p-purple">${esc(a.agName||'—')}</span></td>
		  <td style="color:var(--cyan);font-size:9px">${esc(a.filePath||'—')}</td>
		  <td style="color:var(--text-muted)">${esc(a.commandLineArguments||'None')}</td>
		  <td><span class="pill p-${a.showInPortal?'green':'gray'}" style="font-size:8px">${a.showInPortal?'Visible':'Hidden'}</span></td>
		  <td>${a.assignees.filter(x=>x.objectType==='Group').map(g=>`<span class="pill p-cyan" style="font-size:8px">${esc(g.displayName||g.objectId||'—')}</span>`).join(' ')||'—'}</td>
		</tr>`).join('')}</tbody>
	  </table></div>`:'<div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No RemoteApp applications published.</div>'}
	  </div>`;
	}

	// ═══════════════════════════════════════════════════════════════════
	// VIEW: DESKTOPS
	// ═══════════════════════════════════════════════════════════════════
	function renderDesktops(){
	  if(!D){ $('view-desktops').innerHTML=noData('Desktops'); return; }
	  const dags=arr(D.applicationGroups).filter(g=>g.applicationGroupType==='Desktop');
	  $('view-desktops').innerHTML=`<div class="section-hdr"><h2>Session Desktops</h2><span class="section-sub">Desktop sessions published to workspaces</span><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);margin-left:auto">${dags.length} Total Desktop${dags.length!==1?'s':''}</span></div>
	  ${dags.map(ag=>{
		const assignees=[...arr(ag.assignedUsers),...arr(ag.assignedGroups)];
		const hp=arr(D.hostPools).find(h=>h.name===ag.hostPoolName||h.id===ag.hostPoolId);
		const ws=arr(D.avdWorkspaces).find(w=>w.id===ag.workspaceId||w.name===ag.workspaceName);
		const deskId='deskbody'+Date.now()+Math.random().toString(36).slice(2);
		return `<div class="coll-card">
		  <div class="coll-header" onclick="toggleColl('${deskId}',this)">
			<span style="font-size:18px">🖵</span>
			<span style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0"><span style="font-family:var(--font-display);font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ag.name)}</span><span onclick="event.stopPropagation()">${copyBtn(ag.name)} ${portalLink(ag.id,'')}</span></span>
			<span class="pill p-green" style="font-size:9px">Published</span>
			<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${assignees.length} assigned</span>
			<span class="coll-caret">▼</span>
		  </div>
		  <div id="${deskId}" class="coll-body">
		  <div class="col2" style="margin-bottom:10px">
			<div>
			  <div class="ir"><span class="ir-k">Friendly Name</span><span class="ir-v">${esc(ag.friendlyName&&ag.friendlyName!==ag.name?ag.friendlyName:'—')}</span></div>
			  <div class="ir"><span class="ir-k">Resource Group</span><span class="ir-v">${esc(ag.resourceGroup||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Workspace</span><span class="ir-v">${esc(ws?.friendlyName||ws?.name||ag.workspaceFriendlyName||'—')}</span></div>
			  <div class="ir"><span class="ir-k">Host Pool</span><span class="ir-v"><span class="pill p-cyan">${esc(ag.hostPoolName||'—')}</span></span></div>
			  <div class="ir"><span class="ir-k">Show in Portal</span><span class="ir-v">${ag.showInPortal!==false?'<span class="pill p-green">Visible</span>':'<span class="pill p-gray">Hidden</span>'}</span></div>
			  ${ag.description?`<div class="ir"><span class="ir-k">Description</span><span class="ir-v">${esc(ag.description)}</span></div>`:''}
			</div>
			<div>
			  <div class="ir"><span class="ir-k">Assignees</span><span class="ir-v">${assignees.length}</span></div>
			  ${hp?`<div class="ir"><span class="ir-k">Active Sessions</span><span class="ir-v">${hp.activeSessions??'—'}</span></div>`:''} 
			  ${hp?`<div class="ir"><span class="ir-k">Pool Health</span><span class="ir-v" style="color:${scoreColor(hp.healthPct??0)}">${hp.healthPct??0}%</span></div>`:''}
			</div>
		  </div>
		  ${assignees.length?`<div class="hp-sec-label">Assignments (${assignees.length})</div>
		  <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Principal</th><th>Type</th><th>Role</th></tr></thead>
		  <tbody>${assignees.map(a=>`<tr><td class="name-col">${esc(a.displayName||a.signInName||a.objectId||'—')}</td><td><span class="pill ${a.objectType==='Group'?'p-cyan':'p-gray'}">${esc(a.objectType||'—')}</span></td><td style="font-size:9px">${esc(a.role||'—')}</td></tr>`).join('')}</tbody>
		  </table></div>`:''}
		  </div>
		</div>`;
	  }).join('')||'<div class="card"><div style="color:var(--text-muted);font-family:var(--font-mono);padding:16px">No Desktop application groups found.</div></div>'}`;
	}

	// ═══════════════════════════════════════════════════════════════════
	// VIEW: SESSION HOSTS
	// ═══════════════════════════════════════════════════════════════════
	function renderSessionHosts(){
	  if(!D){ $('view-sessionhosts').innerHTML=noData('Session Hosts'); return; }
	  const shs=arr(D.sessionHosts).length?arr(D.sessionHosts):arr(D.hostPools).flatMap(hp=>arr(hp.sessionHosts));
	  const available=shs.filter(s=>s.status==='Available').length;
	  const unavailable=shs.filter(s=>s.status==='Unavailable').length;
	  const needs=shs.filter(s=>s.status==='NeedsAssistance').length;
	  const drain=shs.filter(s=>s.drainMode).length;
	  $('view-sessionhosts').innerHTML=`<div class="section-hdr"><h2>Session Hosts</h2><span class="section-sub">Virtual machines hosting user sessions · ${shs.length} total</span></div>
	  <div class="kpi-grid g5">
		<div class="kpi"><div class="kpi-label">Total</div><div class="kpi-value">${shs.length}</div></div>
		<div class="kpi"><div class="kpi-label">Available</div><div class="kpi-value kv-green">${available}</div></div>
		<div class="kpi"><div class="kpi-label">Unavailable</div><div class="kpi-value kv-${unavailable>0?'red':'green'}">${unavailable}</div></div>
		<div class="kpi"><div class="kpi-label">Needs Assistance</div><div class="kpi-value kv-${needs>0?'orange':'green'}">${needs}</div></div>
		<div class="kpi"><div class="kpi-label">Drain Mode</div><div class="kpi-value kv-${drain>0?'amber':'green'}">${drain}</div></div>
	  </div>
	  <div class="card"><div class="card-title">Hosts List &amp; Network Topology — click a host for full details</div>
	  <div class="search-bar"><span class="search-icon">⌕</span><input placeholder="Filter by name, host pool, status…" oninput="filterTable('sh-t',this.value)"></div>
	  <div class="data-table-wrap" style="max-height:500px;overflow-y:auto"><table class="data-table" id="sh-t">
		<thead><tr><th>Name</th><th>Status</th><th>Host Pool</th><th>Sessions</th><th>New Sessions</th><th>Patch Status</th><th>Agent Version</th><th>Last Heartbeat</th><th>FSLogix</th></tr></thead>
		<tbody>${shs.map(sh=>{
		  const hbWarn=sh.minutesSinceHeartbeat!=null&&sh.minutesSinceHeartbeat>30&&sh.status==='Available';
		  const ps=patchStatus(sh.lastUpdate);
		  return `<tr data-search="${esc(((sh.vmName||sh.name||'')+(sh.hostPoolName||'')+(sh.status||'')).toLowerCase())}" style="cursor:pointer" onclick="openSHFlyout(${JSON.stringify(sh).replace(/"/g,'&quot;')})">
			<td class="name-col">${esc(sh.vmName||sh.name||'—')} ${copyBtn(sh.vmName||sh.name||'')} ${portalLink(sh.vmResourceId||sh.id||sh.name,'')}</td>
			<td><span class="pill ${statusPill(sh.status)}">${esc(sh.status||'—')}</span></td>
			<td>${esc(sh.hostPoolName||'—')}</td>
			<td><span title='Active sessions'>${sh.activeSessions??0}</span><span style='color:var(--text-muted)'>/</span><span title='Disconnected sessions' style='color:${(sh.disconnectedSessions||0)>0?"var(--amber)":"var(--text-muted)"}'>${sh.disconnectedSessions??0}</span></td>
			<td>${sh.drainMode?'<span class="pill p-amber">Blocked</span>':'<span class="pill p-green">Allowed</span>'}${sh.excludeFromScaling?' <span class="pill p-amber" style="font-size:8px">⊘ Excl.</span>':''}</td>
			<td><span class="pill ${ps.cls}" style="font-size:8px">${esc(ps.label)}</span></td>
			<td style="font-size:9px">${esc(sh.agentVersion||'—')}</td>
			<td style="${hbWarn?'color:var(--amber)':''};font-size:9px">${esc(sh.lastHeartbeat||'—')}${hbWarn?' ⚠':''}</td>
			<td>${sh.fslogixDetected?'<span class="pill p-cyan" style="font-size:8px">✓</span>':'<span class="pill p-gray" style="font-size:8px">—</span>'}</td>
		  </tr>`;
		}).join('')||'<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">No session host data — re-run collector</td></tr>'}</tbody>
	  </table></div></div>`;
	}

	// ═══════════════════════════════════════════════════════════════════
	// VIEW: USER SESSIONS
	// ═══════════════════════════════════════════════════════════════════
	function renderSessions(){
	  if(!D){ $('view-sessions').innerHTML=noData('Sessions'); return; }
	  const sessions=arr(D.sessions).length?arr(D.sessions):arr(D.hostPools).flatMap(hp=>arr(hp.sessionHosts).flatMap(sh=>arr(sh.sessions)));
	  const active=sessions.filter(s=>s.sessionState==='Active');
	  const disconnected=sessions.filter(s=>s.sessionState==='Disconnected');
	  $('view-sessions').innerHTML=`<div class="section-hdr"><h2>User Sessions</h2><span class="section-sub">Active and disconnected user sessions across all host pools</span></div>
	  <div class="kpi-grid g4">
		<div class="kpi"><div class="kpi-label">Total Sessions</div><div class="kpi-value">${sessions.length}</div></div>
		<div class="kpi"><div class="kpi-label">Active</div><div class="kpi-value kv-green">${active.length}</div></div>
		<div class="kpi"><div class="kpi-label">Disconnected</div><div class="kpi-value kv-${disconnected.length>0?'amber':'green'}">${disconnected.length}</div></div>
		<div class="kpi"><div class="kpi-label">Unique Users</div><div class="kpi-value">${new Set(sessions.map(s=>s.userPrincipalName).filter(Boolean)).size}</div></div>
	  </div>
	  ${sessions.length?`<div class="card"><div class="card-title">All Sessions — click a session for details</div>
	  <div class="search-bar"><span class="search-icon">⌕</span><input placeholder="Filter by user, host, host pool…" oninput="filterTable('sess-t',this.value)"></div>
	  <div class="data-table-wrap" style="max-height:520px;overflow-y:auto"><table class="data-table" id="sess-t">
		<thead><tr><th>User</th><th>State</th><th>Session Host</th><th>Host Pool</th><th>Connected Since</th><th>Type</th></tr></thead>
		<tbody>${sessions.map(s=>`<tr data-search="${esc(((s.userPrincipalName||'')+(s.sessionHostName||'')+(s.hostPoolName||'')).toLowerCase())}" style="cursor:pointer" onclick="openSessionDetailFlyout(${JSON.stringify(s).replace(/"/g,'&quot;')})">
		  <td class="name-col" style="font-family:var(--font-mono)">${esc(s.userPrincipalName||'Unknown')} ${copyBtn(s.userPrincipalName||'')}</td>
		  <td><span class="pill p-${s.sessionState==='Active'?'green':'amber'}">${esc(s.sessionState||'—')}</span></td>
		  <td style="color:var(--cyan)">${esc((s.sessionHostName||'—').split('.')[0])}</td>
		  <td style="font-size:9px">${esc(s.hostPoolName||'—')}</td>
		  <td style="font-size:9px">${esc(s.createTime||'—')}</td>
		  <td><span class="pill p-${s.applicationType==='Desktop'?'blue':'purple'}" style="font-size:8px">${esc(s.applicationType||'Desktop')}</span></td>
		</tr>`).join('')}</tbody>
	  </table></div></div>`
	  :`<div class="card accent-amber"><div style="font-family:var(--font-mono);font-size:11px;color:var(--amber);padding:8px">
		No session data collected. Run the collector without -SkipSessionDetail to capture active user sessions.
	  </div></div>`}`;
	}

	function openSessionDetailFlyout(s){
	  const sh=arr(D.sessionHosts).length?arr(D.sessionHosts).find(h=>(h.vmName||h.name||'').toLowerCase().split('.')[0]===(s.sessionHostName||'').toLowerCase().split('.')[0]):null;
	  openFlyout('Session — '+(s.userPrincipalName||'Unknown'),`
		<div class="kpi-grid g2" style="margin-bottom:12px">
		  <div class="kpi"><div class="kpi-label">State</div><div class="kpi-value" style="font-size:16px;color:${s.sessionState==='Active'?'var(--green)':'var(--amber)'}">${esc(s.sessionState||'—')}</div></div>
		  <div class="kpi"><div class="kpi-label">Type</div><div class="kpi-value" style="font-size:16px">${esc(s.applicationType||'Desktop')}</div></div>
		</div>
		<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:6px">SESSION DETAILS</div>
		<div class="ir fr"><span class="ir-k">User</span><span class="ir-v">${esc(s.userPrincipalName||'—')} ${copyBtn(s.userPrincipalName||'')}</span></div>
		${[['Session ID',s.sessionId],['Session State',s.sessionState],['Application Type',s.applicationType||'Desktop'],['Connected Since',s.createTime],['Session Host',(s.sessionHostName||'—').split('.')[0]],['Host Pool',s.hostPoolName]].map(([k,v])=>`<div class="ir fr"><span class="ir-k">${k}</span><span class="ir-v">${esc(v??'—')}</span></div>`).join('')}
		${sh?`<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin:14px 0 6px">HOST VM DETAILS</div>
		${[['VM Name',sh.vmName||sh.name],['VM Size',sh.vmSize],['Status',sh.status],['Private IP',sh.privateIP||'—'],['Power State',sh.powerState]].map(([k,v])=>`<div class="ir fr"><span class="ir-k">${k}</span><span class="ir-v">${esc(v??'—')}</span></div>`).join('')}`:''}
	  `);
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: NETWORKING
	// ═══════════════════════════════════════════════════════════════════
	function renderNetworking(){
	  if(!D){ $('view-networking').innerHTML=noData('Networking'); return; }
	  const hps  = arr(D.hostPools);
	  const shs  = arr(D.sessionHosts).length?arr(D.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
	  const net  = D.networking||null;
	  const hasPhase8 = net && arr(net.virtualNetworks).length>0;

	  // ── Toggle strip ───────────────────────────────────────────────
	  const toggleHtml = hasPhase8 ? `<div class="net-toggle-strip">
		<button class="net-toggle-btn ${NET_VIEW==='topology'?'active':''}" onclick="NET_VIEW='topology';renderNetworking()">⬡ Topology</button>
		<button class="net-toggle-btn ${NET_VIEW==='table'?'active':''}" onclick="NET_VIEW='table';renderNetworking()">☰ Table</button>
	  </div>` : '';

	  if(hasPhase8 && NET_VIEW==='topology'){
		// ── TOPOLOGY VIEW ───────────────────────────────────────────
		const svgHtml = buildTopologySVG(net, hps, shs);
		const sectionHdr = `<div class="section-hdr"><h2>Network Topology</h2>
		  <span class="section-sub">Click any node for details · ${arr(net.virtualNetworks).length} VNet${arr(net.virtualNetworks).length!==1?'s':''} · ${arr(net.natGateways).length} NAT GW · ${arr(net.bastionHosts).length} Bastion</span>
		</div>`;
		$('view-networking').innerHTML = sectionHdr + toggleHtml
		  + (svgHtml ? `<div class="topo-wrap">${svgHtml}</div>` : `<div class="topo-hint">No topology data — run YGIT-AVDIntelligence-v3.ps1</div>`)
		  + `<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);text-align:right;margin-top:-8px;margin-bottom:12px">Click any element to see details · Switch to Table view for NSG rules and full configuration</div>`;
		return;
	  }

	  // ── TABLE VIEW (existing full content) ────────────────────────
	  renderNetworkingTable(toggleHtml);
	}

	function renderNetworkingTable(toggleHtml){
	  if(!D){ $('view-networking').innerHTML=noData('Networking'); return; }
	  const hps  = arr(D.hostPools);
	  const shs  = arr(D.sessionHosts).length?arr(D.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
	  const net  = D.networking||null;
	  const vnets= net?arr(net.virtualNetworks):[];
	  const nats = net?arr(net.natGateways):[];
	  const nsgs = net?arr(net.networkSecurityGroups):[];
	  const lbs  = net?arr(net.loadBalancers):[];
	  const basts= net?arr(net.bastionHosts):[];
	  const pe   = net?.privateEndpoints||null;
	  const wss  = arr(D.avdWorkspaces);

	  // ── KPI row ──────────────────────────────────────────────────────
	  const hpWithPE  = hps.filter(h=>h.privateEndpointEnabled).length;
	  const hasPhase8 = vnets.length>0;
	  const allNsgFindings = nsgs.flatMap(n=>arr(n.securityFindings));
	  const highNsgF  = allNsgFindings.filter(f=>f.severity==='High').length;

	  let html = (toggleHtml||'') + `<div class="section-hdr"><h2>Networking Configuration</h2>
		<span class="section-sub">${hasPhase8?'VNets · Subnets · NAT · NSGs · Bastion · Private Endpoints':'Host pool configuration and session host network details'}</span>
	  </div>
	  <div class="kpi-grid g${hasPhase8?'5':'3'}">
		<div class="kpi"><div class="kpi-label">Host Pools</div><div class="kpi-value kv-cyan">${hps.length}</div></div>
		<div class="kpi"><div class="kpi-label">Session Hosts</div><div class="kpi-value">${shs.length}</div><div class="kpi-sub">${shs.filter(s=>s.privateIP&&s.privateIP!=='Not assigned').length} IPs mapped</div></div>
		${hasPhase8?`
		<div class="kpi"><div class="kpi-label">VNets</div><div class="kpi-value">${vnets.length}</div><div class="kpi-sub">${vnets.reduce((a,v)=>a+arr(v.subnets).length,0)} subnets</div></div>
		<div class="kpi"><div class="kpi-label">Private Endpoints</div><div class="kpi-value kv-${hpWithPE===hps.length?'green':hpWithPE>0?'amber':'red'}">${hpWithPE}/${hps.length}</div><div class="kpi-sub">host pools</div></div>
		<div class="kpi"><div class="kpi-label">NSG Findings</div><div class="kpi-value kv-${highNsgF>0?'red':'green'}">${highNsgF}</div><div class="kpi-sub">${highNsgF>0?'high severity':'all clear'}</div></div>`:''}
	  </div>`;

	  // ── Topology notes strip (Phase 8 data) ──────────────────────────
	  if(net&&arr(net.topologyNotes).length){
		html += `<div class="card" style="margin-bottom:10px"><div class="card-title">Topology Summary</div>
		${arr(net.topologyNotes).map(note=>{
		  const isWarn=note.toLowerCase().includes('warning')||note.toLowerCase().includes('no nat')||note.toLowerCase().includes('no azure bastion')||note.toLowerCase().includes('no avd private');
		  const isOk=note.includes('✓')||note.toLowerCase().includes('fully private')||note.toLowerCase().includes('bastion deployed');
		  return `<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--bg-panel)">
			<span style="font-size:12px;flex-shrink:0">${isOk?'✓':isWarn?'⚠':'·'}</span>
			<span style="font-family:var(--font-mono);font-size:10px;color:${isOk?'var(--green)':isWarn?'var(--amber)':'var(--text-secondary)'}">${esc(note)}</span>
		  </div>`;
		}).join('')}
		</div>`;
	  }

	  // ── Private Endpoint status per HP/WS ────────────────────────────
	  if(hasPhase8){
		const hpPEMissing=hps.filter(h=>!h.privateEndpointEnabled&&!h.isValidationEnv);
		const wsPEMissing=wss.filter(w=>!w.privateEndpointEnabled);
		html+=`<div class="card"><div class="card-title">Private Endpoint Coverage</div>
		<div class="net-section-label">Host Pools</div>
		${hps.map(hp=>`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--bg-panel)">
		  <span style="font-family:var(--font-mono);font-size:10px;color:var(--cyan);flex:1">${esc(hp.name)}</span>
		  <span class="pill ${hp.hostPoolType==='Pooled'?'p-cyan':'p-purple'}" style="font-size:8px">${esc(hp.hostPoolType)}</span>
		  <span class="pe-status-badge ${hp.privateEndpointEnabled?'pe-enabled':'pe-disabled'}">${hp.privateEndpointEnabled?'🔒 Private Endpoint':'🌐 Public Internet'}</span>
		</div>`).join('')}
		<div class="net-section-label" style="margin-top:10px">Workspaces</div>
		${wss.map(ws=>{
		  const wsPEClass=ws.privateEndpointEnabled?'pe-enabled':ws.privateEndpointEnabled===false?'pe-disabled':'pe-unknown';
		  const wsPELabel=ws.privateEndpointEnabled?'🔒 Private':'🌐 Public';
		  return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
			<span style="font-family:var(--font-mono);font-size:10px;color:var(--cyan);flex:1">${esc(ws.name)}</span>
			${ws.friendlyName&&ws.friendlyName!==ws.name?`<span style="font-size:9px;color:var(--text-muted)">${esc(ws.friendlyName)}</span>`:''}
			<span class="pe-status-badge ${wsPEClass}">${wsPELabel}</span>
		  </div>`;
		}).join('')}
		${pe&&pe.avdDnsZonesConfigured>0?`<div style="margin-top:10px;padding:8px 10px;background:var(--cyan-ghost);border-radius:var(--radius);font-family:var(--font-mono);font-size:9px;color:var(--cyan)">
		  ✓ AVD private DNS zone${pe.avdDnsZonesConfigured!==1?'s':''} configured: ${(pe.avdDnsZoneNames||[]).join(', ')}
		</div>`:hasPhase8?`<div class="net-warning-strip" style="margin-top:10px">⚠ No AVD private DNS zones found — required for private endpoint name resolution (privatelink.wvd.microsoft.com)</div>`:''}
		</div>`;
	  }

	  // ── VNets + Subnets (Phase 8) ─────────────────────────────────────
	  if(vnets.length){
		html+=`<div class="card"><div class="card-title">Virtual Networks & Subnets</div>`;
		vnets.forEach(vnet=>{
		  const subnets=arr(vnet.subnets);
		  const avdSubnets=subnets.filter(s=>s.sessionHostCount>0);
		  const collapsId='vnet-'+esc(vnet.name).replace(/[^a-zA-Z0-9]/g,'');
		  html+=`<div class="net-topology-card">
			<div class="net-vnet-header" onclick="toggleColl('${collapsId}',this)">
			  <span style="font-size:16px">🌐</span>
			  <div style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0">
				<span class="net-vnet-name">${esc(vnet.name)}</span>
				<span onclick="event.stopPropagation()">${copyBtn(vnet.name)} ${portalLink(vnet.id,'')}</span>
			  </div>
			  <span class="pill p-gray" style="font-size:8px">${(arr(vnet.addressSpace)).join(', ')||'—'}</span>
			  <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${subnets.length} subnet${subnets.length!==1?'s':''}</span>
			  ${arr(vnet.peerings).length?`<span class="pill p-purple" style="font-size:8px">Hub-Spoke</span>`:''}
			  <span class="coll-caret">▼</span>
			</div>
			<div id="${collapsId}">
			  ${arr(vnet.peerings).length?`<div style="padding:6px 14px;background:var(--bg-panel);border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:9px;color:var(--purple)">
				Peers: ${arr(vnet.peerings).map(p=>`<span style="color:var(--text-secondary)">${esc(p.remoteVnetName)}</span> <span style="color:${p.peeringState==='Connected'?'var(--green)':'var(--red)'}">● ${esc(p.peeringState)}</span>`).join(' · ')}
			  </div>`:''}
			  ${subnets.map(sn=>`<div class="net-subnet-row">
				<span class="net-subnet-icon">${sn.sessionHostCount>0?'🖥':'⊡'}</span>
				<div class="net-subnet-info">
				  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
					<span class="net-subnet-name">${esc(sn.name)}</span>
					<span class="net-subnet-prefix">${esc(sn.addressPrefix||'—')}</span>
					${sn.natGatewayName?`<span class="pill p-green" style="font-size:8px">🔀 ${esc(sn.natGatewayName)}</span>`:'<span class="pill p-amber" style="font-size:8px">No NAT GW</span>'}
					${sn.nsgName?`<span class="pill p-blue" style="font-size:8px">🛡 ${esc(sn.nsgName)}</span>`:''}
					${sn.name==='AzureBastionSubnet'?'<span class="pill p-cyan" style="font-size:8px">Bastion</span>':''}
				  </div>
				  ${arr(sn.serviceEndpoints).length?`<div style="margin-top:3px">${arr(sn.serviceEndpoints).map(ep=>`<span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-right:6px">${esc(ep)}</span>`).join('')}</div>`:''}
				  ${sn.sessionHostCount>0?`<div class="net-subnet-tags">
					${arr(sn.sessionHostNames).map(h=>`<span class="net-host-chip">💻 ${esc(h)}</span>`).join('')}
				  </div>`:''}
				  ${sn.warning?`<div class="net-warning-strip">⚠ ${esc(sn.warning)}</div>`:''}
				</div>
			  </div>`).join('')}
			</div>
		  </div>`;
		});
		html+=`</div>`;
	  }

	  // ── NAT Gateways ─────────────────────────────────────────────────
	  if(nats.length){
		html+=`<div class="card"><div class="card-title">NAT Gateways (${nats.length})</div>
		<div class="data-table-wrap"><table class="data-table">
		  <thead><tr><th>Name</th><th>SKU</th><th>Public IP(s)</th><th>Subnets</th><th>Idle Timeout</th></tr></thead>
		  <tbody>${nats.map(n=>`<tr>
			<td class="name-col">${esc(n.name)} ${copyBtn(n.name)} ${portalLink(n.id,'')}</td>
			<td><span class="pill p-cyan" style="font-size:8px">${esc(n.sku||'Standard')}</span></td>
			<td style="font-family:var(--font-mono);font-size:9px">${arr(n.publicIPAddresses).map(p=>esc(p.name||p.id?.split('/')[-1]||'—')).join(', ')||'—'}</td>
			<td style="font-size:9px">${arr(n.associatedSubnets).join(', ')||'—'}</td>
			<td style="font-size:9px">${esc(n.idleTimeoutMinutes||4)} min</td>
		  </tr>`).join('')}
		  </tbody>
		</table></div></div>`;
	  }

	  // ── NSGs ─────────────────────────────────────────────────────────
	  if(nsgs.length){
		html+=`<div class="card"><div class="card-title">Network Security Groups (${nsgs.length})</div>`;
		nsgs.forEach(nsg=>{
		  const findings=arr(nsg.securityFindings);
		  const rules=arr(nsg.securityRules);
		  const nsgId='nsg-'+esc(nsg.name).replace(/[^a-zA-Z0-9]/g,'');
		  html+=`<div class="net-topology-card" style="margin-bottom:8px">
			<div class="net-vnet-header" onclick="toggleColl('${nsgId}',this)">
			  <span style="font-size:14px">🛡</span>
			  <div style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0">
				<span style="font-family:var(--font-display);font-weight:700;font-size:13px">${esc(nsg.name)}</span>
				<span onclick="event.stopPropagation()">${copyBtn(nsg.name)} ${portalLink(nsg.id,'')}</span>
			  </div>
			  <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${rules.length} rules · ${arr(nsg.associatedSubnets).join(', ')||'unassociated'}</span>
			  ${findings.length?`<span class="pill p-${findings.some(f=>f.severity==='High')?'red':'amber'}" style="font-size:8px">${findings.length} finding${findings.length!==1?'s':''}</span>`:'<span class="pill p-green" style="font-size:8px">✓ Clean</span>'}
			  <span class="coll-caret">▼</span>
			</div>
			<div id="${nsgId}" class="coll-body" style="padding:0">
			  ${findings.map(f=>`<div class="net-finding-strip net-finding-${f.severity?.toLowerCase()}">${esc(f.finding)}</div>`).join('')}
			  <div class="data-table-wrap" style="max-height:250px;overflow-y:auto"><table class="data-table">
				<thead><tr><th>Priority</th><th>Name</th><th>Direction</th><th>Access</th><th>Protocol</th><th>Source</th><th>Dest Port</th></tr></thead>
				<tbody>${rules.map(r=>`<tr style="${r.securityConcern?'background:#ef444408':r.access==='Deny'?'opacity:0.6':''}">
				  <td style="font-family:var(--font-mono);font-size:9px">${r.priority}</td>
				  <td style="font-size:9px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${esc(r.name||'—')}</td>
				  <td><span class="pill ${r.direction==='Inbound'?'p-blue':'p-purple'}" style="font-size:8px">${esc(r.direction)}</span></td>
				  <td><span class="pill ${r.access==='Allow'?'p-green':'p-red'}" style="font-size:8px">${esc(r.access)}</span></td>
				  <td style="font-size:9px">${esc(r.protocol||'*')}</td>
				  <td style="font-family:var(--font-mono);font-size:9px">${esc(r.sourceAddressPrefix||'*')}</td>
				  <td style="font-family:var(--font-mono);font-size:9px">${esc(r.destinationPortRange||'*')}${r.securityConcern?' ⚠':''}</td>
				</tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No rules</td></tr>'}
				</tbody>
			  </table></div>
			</div>
		  </div>`;
		});
		html+=`</div>`;
	  }

	  // ── Bastion ───────────────────────────────────────────────────────
	  if(basts.length){
		html+=`<div class="card"><div class="card-title">Azure Bastion</div>
		${basts.map(b=>`<div style="display:flex;align-items:flex-start;gap:12px;padding:8px 0">
		  <span style="font-size:18px">🏰</span>
		  <div style="flex:1">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
			  <span style="font-family:var(--font-display);font-weight:700;font-size:13px">${esc(b.name)}</span>
			  ${copyBtn(b.name)} ${portalLink(b.id,'')}
			  <span class="pill p-cyan">${esc(b.sku||'Standard')}</span>
			</div>
			<div class="ir-row-wrap" style="display:flex;flex-wrap:wrap;gap:6px">
			  ${[['Public IP',b.publicIPAddress||'—'],['Subnet',b.subnet||'AzureBastionSubnet'],['Scale Units',b.scaleUnits||1]].map(([k,v])=>`<div class="ir fr" style="min-width:160px"><span class="ir-k">${k}</span><span class="ir-v" style="font-size:9px">${esc(String(v))}</span></div>`).join('')}
			</div>
			<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
			  ${b.enableTunneling?'<span class="pill p-green" style="font-size:8px">✓ Native Client</span>':''}
			  ${b.enableFileCopy?'<span class="pill p-green" style="font-size:8px">✓ File Copy</span>':''}
			  ${b.enableIpConnect?'<span class="pill p-green" style="font-size:8px">✓ IP Connect</span>':''}
			  ${b.enableShareableLink?'<span class="pill p-amber" style="font-size:8px">⚠ Shareable Links</span>':''}
			</div>
		  </div>
		</div>`).join('')}
		</div>`;
	  } else if(hasPhase8){
		html+=`<div class="card accent-amber"><div style="font-family:var(--font-mono);font-size:10px;color:var(--amber);padding:8px">⚠ No Azure Bastion found in AVD resource groups — ensure session hosts are accessed via VPN, ExpressRoute, or private connectivity only.</div></div>`;
	  }

	  // ── Load Balancers ────────────────────────────────────────────────
	  if(lbs.length){
		html+=`<div class="card"><div class="card-title">Load Balancers (${lbs.length})</div>
		<div class="data-table-wrap"><table class="data-table">
		  <thead><tr><th>Name</th><th>Type</th><th>SKU</th><th>Frontend IP</th><th>Rules</th><th>Backend Hosts</th></tr></thead>
		  <tbody>${lbs.map(lb=>`<tr>
			<td class="name-col">${esc(lb.name)} ${portalLink(lb.id,'')}</td>
			<td><span class="pill ${lb.type==='Internal'?'p-blue':'p-amber'}" style="font-size:8px">${esc(lb.type||'—')}</span></td>
			<td style="font-size:9px">${esc(lb.sku||'Standard')}</td>
			<td style="font-family:var(--font-mono);font-size:9px">${arr(lb.frontendIPConfigurations).map(f=>f.privateIPAddress||f.publicIPId?.split('/')[-1]||'—').join(', ')||'—'}</td>
			<td style="font-size:9px">${arr(lb.loadBalancingRules).length}</td>
			<td style="font-size:9px">${arr(lb.backendPools).reduce((a,bp)=>a+(bp.backendIPCount||0),0)}</td>
		  </tr>`).join('')}
		  </tbody>
		</table></div></div>`;
	  }

	  // ── Host Pool config + Session host table (always shown) ──────────
	  html+=`<div class="card accent-cyan"><div class="card-title">Host Pool Configuration</div>
	  <div class="data-table-wrap"><table class="data-table">
		<thead><tr><th>Host Pool</th><th>Type</th><th>Load Balancer</th><th>Max Sessions</th><th>Start VM on Connect</th><th>Private Endpoint</th></tr></thead>
		<tbody>${hps.map(hp=>`<tr>
		  <td class="name-col">${esc(hp.name)}</td>
		  <td><span class="pill ${hp.hostPoolType==='Pooled'?'p-cyan':'p-purple'}">${esc(hp.hostPoolType||'—')}</span></td>
		  <td style="font-size:9px">${esc(hp.loadBalancerType||'—')}</td>
		  <td>${esc(hp.maxSessionLimit??'—')}</td>
		  <td>${hp.startVMOnConnect?'<span class="pill p-green">Enabled</span>':'<span class="pill p-gray">Disabled</span>'}</td>
		  <td>${hp.privateEndpointEnabled?'<span class="pill p-cyan" style="font-size:8px">🔒 Private</span>':hp.privateEndpointEnabled===false?'<span class="pill p-amber" style="font-size:8px">🌐 Public</span>':'<span class="pill p-gray" style="font-size:8px">Unknown</span>'}</td>
		</tr>`).join('')}
		</tbody>
	  </table></div></div>

	  <div class="card"><div class="card-title">Session Host Network Details</div>
	  <div class="search-bar"><span class="search-icon">⌕</span><input placeholder="Filter by host, pool or IP…" oninput="filterTable('net-t',this.value)"></div>
	  <div class="data-table-wrap" style="max-height:400px;overflow-y:auto"><table class="data-table" id="net-t">
		<thead><tr><th>Session Host</th><th>Host Pool</th><th>Subnet</th><th>Private IP</th><th>VM Size</th><th>AMA</th></tr></thead>
		<tbody>${shs.map(sh=>`<tr data-search="${esc(((sh.vmName||sh.name||'')+(sh.hostPoolName||'')+(sh.privateIP||'')).toLowerCase())}">
		  <td class="name-col">${esc(sh.vmName||sh.name||'—')} ${copyBtn(sh.vmName||sh.name||'')} ${portalLink(sh.vmResourceId||'','')}</td>
		  <td style="font-size:9px">${esc(sh.hostPoolName||'—')}</td>
		  <td style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${esc(sh.subnetName||'—')}</td>
		  <td style="color:var(--cyan);font-family:var(--font-mono);font-size:9px">${esc(sh.privateIP||'Not assigned')} ${sh.privateIP?copyBtn(sh.privateIP):''}</td>
		  <td style="font-size:9px">${esc(sh.vmSize||'—')}</td>
		  <td>${sh.hasAMAAgent?'<span class="pill p-green" style="font-size:8px">✓</span>':'<span class="pill p-gray" style="font-size:8px">—</span>'}</td>
		</tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No session host network data</td></tr>'}
		</tbody>
	  </table></div></div>

	  ${(()=>{
		const hpsWithRdp3=hps.filter(hp=>Object.keys(hp.rdpPropertiesParsed||{}).length>0);
		if(!hpsWithRdp3.length) return '';
		const rows=hpsWithRdp3.map(hp=>{
		  const rdp=hp.rdpPropertiesParsed||{};
		  const managed   = rdp['targetisaadjoined']==='1';
		  const entraAuth = rdp['enablerdsaadauth']==='1';
		  const webauthn  = rdp['redirectwebauthn']==='1';
		  const multimon  = rdp['use multimon']==='1';
		  const token     = hp.registrationTokenStatus==='Active';
		  const ok  = (v) => v?'<span class="pill p-green" style="font-size:8px">✓</span>':'<span class="pill p-gray" style="font-size:8px">—</span>';
		  return '<tr>'
			+'<td class="name-col">'+esc(hp.name)+'</td>'
			+'<td>'+ok(entraAuth)+'</td>'
			+'<td>'+ok(managed)+'</td>'
			+'<td>'+ok(webauthn)+'</td>'
			+'<td>'+ok(multimon)+'</td>'
			+'<td>'+(token?'<span class="pill p-amber" style="font-size:8px">⚠ Active</span>':'<span class="pill p-green" style="font-size:8px">None</span>')+'</td>'
			+'</tr>';
		}).join('');
		return '<div class="card"><div class="card-title">RDP ShortPath & Auth Configuration</div>'
		  +'<div class="data-table-wrap"><table class="data-table">'
		  +'<thead><tr><th>Host Pool</th><th>Entra ID Auth</th><th>Entra Joined</th><th>WebAuthn</th><th>Multi-Monitor</th><th>Reg Token</th></tr></thead>'
		  +'<tbody>'+rows+'</tbody></table></div></div>';
	  })()}
		${!hasPhase8?`<div style="margin-top:10px;padding:10px 14px;background:var(--cyan-ghost);border:1px solid var(--cyan-dim);border-radius:var(--radius);font-family:var(--font-mono);font-size:10px;color:var(--cyan)">
		💡 Run YGIT-AVDIntelligence-v3.ps1 to collect full network topology data — VNets, NAT Gateways, NSGs, Bastion, Private Endpoints and more.
	  </div>`:''}`;

	  $('view-networking').innerHTML=html;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: RBAC
	// ═══════════════════════════════════════════════════════════════════
	function renderRBAC(){
	  if(!D){ $('view-rbac').innerHTML=noData('RBAC'); return; }
	  const ags=arr(D.applicationGroups);
	  const all=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)].map(a=>({...a,scope:ag.name})));
	  const seen=new Set(), unique=all.filter(a=>{ const k=(a.objectId||a.displayName||'')+'|'+a.role+'|'+a.scope; if(seen.has(k))return false; seen.add(k); return true; });
	  const people=unique.filter(a=>a.objectType==='User'||a.objectType==='Group'||a.objectType==='ForeignGroup');
	  const svcPrincipals=unique.filter(a=>a.objectType==='ServicePrincipal'||(!a.objectType&&a.objectId));
	  const byRole={};
	  people.forEach(a=>{ (byRole[a.role]=byRole[a.role]||[]).push(a); });
	  const spId='sp-rbac-'+Date.now();
	  $('view-rbac').innerHTML=`<div class="section-hdr"><h2>RBAC Assignments</h2><span class="section-sub">Role-based access control for AVD resources</span></div>
	  <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f59e0b10;border:1px solid #f59e0b40;border-radius:6px;margin-bottom:14px;font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)"><span style="color:var(--amber);font-size:13px">&#9888;</span> Only AVD-specific roles are shown (Desktop Virtualization &amp; VM Login roles). Subscription-level roles (Owner, Contributor, Reader) are excluded — review Azure RBAC for full inheritance.</div>
	  <div class="kpi-grid g4">
		<div class="kpi"><div class="kpi-label">User/Group Assignments</div><div class="kpi-value kv-cyan">${people.length}</div></div>
		<div class="kpi"><div class="kpi-label">Groups</div><div class="kpi-value">${people.filter(a=>a.objectType==='Group'||a.objectType==='ForeignGroup').length}</div></div>
		<div class="kpi"><div class="kpi-label">Direct Users</div><div class="kpi-value kv-${people.filter(a=>a.objectType==='User').length>0?'amber':'green'}">${people.filter(a=>a.objectType==='User').length}</div></div>
		<div class="kpi"><div class="kpi-label">Distinct Roles</div><div class="kpi-value">${Object.keys(byRole).length}</div></div>
	  </div>
	  <div class="card"><div class="card-title">User &amp; Group Assignments</div>
	  <div class="search-bar"><span class="search-icon">⌕</span><input placeholder="Filter by principal, role, scope…" oninput="filterTable('rbac-t',this.value)"></div>
	  <div class="data-table-wrap" style="max-height:480px;overflow-y:auto"><table class="data-table" id="rbac-t">
		<thead><tr><th>Principal</th><th>Type</th><th>Role</th><th>Scope</th></tr></thead>
		<tbody>${people.map(a=>`<tr data-search="${esc(((a.displayName||'')+(a.signInName||'')+(a.role||'')+(a.scope||'')).toLowerCase())}"><td class="name-col">${esc(a.displayName||a.signInName||a.objectId||'—')}</td><td><span class="pill ${a.objectType==='Group'||a.objectType==='ForeignGroup'?'p-cyan':'p-gray'}">${esc(a.objectType||'—')}</span></td><td><span class="pill p-purple" style="font-size:9px">${esc(a.role||'—')}</span></td><td style="font-size:9px;color:var(--text-muted)">${esc(a.scope||'—')}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No user or group assignments found</td></tr>'}</tbody>
	  </table></div></div>
	  ${Object.entries(byRole).length?`<div class="card"><div class="card-title">Role Breakdown</div>
	  ${Object.entries(byRole).map(([role,members])=>`<div class="score-bar-wrap"><div class="score-bar-label">${esc(role.length>28?role.slice(0,26)+'…':role)}</div><div class="score-bar-track"><div class="score-bar-fill" style="width:${Math.round((members.length/Math.max(people.length,1))*100)}%;background:var(--cyan)"></div></div><div class="score-bar-val">${members.length}</div></div>`).join('')}</div>`:''}
	  ${svcPrincipals.length?`<div class="card"><div class="card-title" style="cursor:pointer" onclick="toggleColl('${spId}',this)">⚙ Service Principal Assignments <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">(${svcPrincipals.length}) — click to expand</span></div>
	  <div id="${spId}" style="display:none"><div class="data-table-wrap" style="max-height:320px;overflow-y:auto"><table class="data-table">
		<thead><tr><th>Object ID</th><th>Role</th><th>Scope</th></tr></thead>
		<tbody>${svcPrincipals.map(a=>`<tr><td class="name-col" style="font-size:9px">${esc(a.objectId||'—')}</td><td><span class="pill p-purple" style="font-size:9px">${esc(a.role||'—')}</span></td><td style="font-size:9px;color:var(--text-muted)">${esc(a.scope||'—')}</td></tr>`).join('')}</tbody>
	  </table></div></div></div>`:''}`;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: INTELLIGENCE
	// ═══════════════════════════════════════════════════════════════════
	function renderIntelligence(){
	  if(!D){ $('view-intelligence').innerHTML=noData('Intelligence'); return; }
	  const met=D.metrics||{};

	  // ── Helpers ────────────────────────────────────────────────────────
	  // Format camelCase/PascalCase column name → readable label
	  function colLabel(k){
		return k.replace(/([A-Z])/g,' $1').replace(/^_/,'').trim()
				.replace(/^./,c=>c.toUpperCase());
	  }

	  // Build a dynamic table from an array of row objects (keys = columns)
	  // Handles single-row results that deserialise as objects rather than arrays
	  function dynTable(rows, maxRows){
		if(!rows) return '';
		if(!Array.isArray(rows)) rows = [rows];  // single-row object → wrap in array
		if(!rows.length) return '';
		const limit = maxRows||50;
		const cols = Object.keys(rows[0]);
		const thead = '<thead><tr>'+cols.map(c=>`<th>${colLabel(c)}</th>`).join('')+'</tr></thead>';
		const tbody = '<tbody>'+rows.slice(0,limit).map(row=>
		  '<tr>'+cols.map(c=>{
			const v = row[c]??'—';
			// Colour latency status
			if(c==='LatencyStatus') return `<td><span class="pill ${v==='Good'?'p-green':v==='Warning'?'p-amber':'p-red'}" style="font-size:9px">${esc(String(v))}</span></td>`;
			if(c==='Trend') return `<td style="font-family:var(--font-mono);font-size:10px">${esc(String(v))}</td>`;
			// Numeric colouring for hours/sessions
			const num = parseFloat(v);
			return `<td style="font-size:11px">${esc(String(v==='—'?'—':v))}</td>`;
		  }).join('')+'</tr>'
		).join('')+'</tbody>';
		const extra = rows.length>limit ? `<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);padding:4px">+${rows.length-limit} more rows</div>` : '';
		return `<div class="data-table-wrap"><table class="data-table">${thead}${tbody}</table></div>${extra}`;
	  }

	  // Render a card only if rows exist
	  function qCard(title, rows, accent){
		if(!rows) return '';
		if(!Array.isArray(rows)) rows = [rows];
		if(!rows.length) return '';
		return `<div class="card${accent?' accent-'+accent:''}"><div class="card-title">${title}</div>${dynTable(rows)}</div>`;
	  }

	  if(!met.querySupported){
		$('view-intelligence').innerHTML=`
		<div class="section-hdr"><h2>KQL Analytics</h2><span class="section-sub">Log Analytics powered insights</span></div>
		<div class="card accent-amber"><div style="font-family:var(--font-mono);font-size:11px;color:var(--amber);padding:8px">
		  ⚠ KQL metrics not collected — no Log Analytics workspace with AVD data found.<br>
		  <span style="color:var(--text-muted);display:block;margin-top:6px;line-height:2">
			· Enable AVD diagnostics on each host pool and route to Log Analytics<br>
			· Pass <code>-WorkspaceId &lt;guid&gt;</code> to target a specific workspace<br>
			· Ensure WVDConnections table has data in the workspace
		  </span>
		</div></div>
		${renderImageDriftSection()}`;
		return;
	  }

	  const skipped = arr(met.queriesSkipped);
	  const ran     = arr(met.queriesRun);
	  // connectionSuccessRate: read directly, or fall back to Q1_rows (single row may deserialise as object not array)
	  const q1raw = met.Q1_rows;
	  const q1rows = Array.isArray(q1raw) ? q1raw : (q1raw && typeof q1raw==='object' ? [q1raw] : []);
	  const csr = met.connectionSuccessRate ?? (q1rows.length ? (q1rows[0].SuccessRate??null) : null);
	  const csrCol  = csr==null?'':csr>=90?'kv-green':csr>=75?'kv-amber':'kv-red';

	  // KPI values from new queries
	  const q5rows  = arr(met.Q5_rows);
	  const q10rows = arr(met.Q10_rows);
	  const q13rows = arr(met.Q13_rows);
	  const topHours    = q5rows.length  ? (q5rows[0].TotalHours??'—')  : '—';
	  const topUser     = q5rows.length  ? (q5rows[0].UserName??'—').split('@')[0] : '—';
	  const inactiveCount = q10rows.length;
	  const peakSessions  = q13rows.length ? Math.max(...q13rows.map(r=>Number(r.PeakSessions||0))) : null;

	  let html = `
	  <div class="section-hdr"><h2>KQL Analytics</h2>
		<span class="section-sub">${met.timespanDays||1}-day window · ${ran.length} quer${ran.length===1?'y':'ies'} ran · ${skipped.length} skipped</span>
	  </div>

	  <!-- Summary KPIs -->
	  <div class="kpi-grid g4" style="margin-bottom:14px">
		<div class="kpi"><div class="kpi-label">Connection Success Rate</div><div class="kpi-value ${csrCol}">${csr!=null?csr+'%':'—'}</div><div class="kpi-sub">${met.timespanDays||1}d window</div></div>
		<div class="kpi"><div class="kpi-label">Top User Hours (7d)</div><div class="kpi-value kv-cyan">${topHours}</div><div class="kpi-sub">${esc(topUser)}</div></div>
		<div class="kpi"><div class="kpi-label">Inactive Users (3d+)</div><div class="kpi-value ${inactiveCount>0?'kv-amber':'kv-green'}">${inactiveCount}</div><div class="kpi-sub">no login in 3+ days</div></div>
		<div class="kpi"><div class="kpi-label">Peak Sessions</div><div class="kpi-value kv-purple">${peakSessions??'—'}</div><div class="kpi-sub">max concurrent</div></div>
	  </div>`;

	  // ── Dynamic query cards — one per query that returned data ─────────
	  html += qCard('Connection Success Rate — Q1', arr(met.Q1_rows));
	  html += qCard('CPU by Host — Q2', arr(met.Q2_rows));
	  html += qCard('RAM Available by Host — Q3', arr(met.Q3_rows));
	  html += qCard('User Session Utilisation — Q4', arr(met.Q4_rows));
	  html += qCard('Top Active Users by Hours — Q5', arr(met.Q5_rows));
	  html += qCard('Network Latency per User — Q6', arr(met.Q6_rows));
	  html += qCard('User Growth Trends — Q7', arr(met.Q7_rows));
	  html += qCard('User Retention & Churn — Q8', arr(met.Q8_rows));
	  html += qCard('Weekly Hours per User — Q9', arr(met.Q9_rows));
	  html += qCard('Inactive Users (3+ days) — Q10', arr(met.Q10_rows));
	  html += qCard('Users Last Seen 7+ Days Ago — Q11', arr(met.Q11_rows));
	  html += qCard('Client OS & Version — Q12', arr(met.Q12_rows));
	  html += qCard('Peak Sessions by Day — Q13', arr(met.Q13_rows));
	  html += qCard('Logon Duration by User — Q14', arr(met.Q14_rows));
	  html += qCard('Slowest Logons by Host — Q15', arr(met.Q15_rows));
	  html += qCard('FSLogix Mount Events — Q16', arr(met.Q16_rows));
	  html += qCard('Top Errors — Q17', arr(met.Q17_rows), 'red');
	  html += qCard('Errors by Host — Q18', arr(met.Q18_rows), 'red');
	  html += qCard('Admin Operations — Q19', arr(met.Q19_rows));

	  // ── Skipped queries note ───────────────────────────────────────────
	  if(skipped.length){
		html+=`<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px;padding:4px 8px">
		  Skipped (disabled in config): ${skipped.map(q=>esc(q)).join(', ')}
		</div>`;
	  }

	  html+=renderImageDriftSection();
	  $('view-intelligence').innerHTML=html;
	}

	function renderImageDriftSection(){
	  const d=D?.imageDrift||{}; const entries=Object.values(d);
	  if(!entries.length) return '';
	  return `<div class="card accent-amber"><div class="card-title">⚠ Image Drift — ${entries.length} pool(s) with mixed images</div>
	  ${entries.map(e=>`<div style="margin-bottom:12px"><div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);margin-bottom:6px">${esc(e.hostPool)} · ${e.hostCount} hosts</div>
	  ${arr(e.distinctImages).map(i=>`<span class="pill p-amber" style="margin:2px">${esc(i)}</span>`).join('')}
	  ${arr(e.outlierHosts).length?`<div style="margin-top:6px;font-size:9px;color:var(--text-muted)">Outliers: ${arr(e.outlierHosts).map(h=>`<span class="pill p-red" style="font-size:8px">${esc(h)}</span>`).join(' ')}</div>`:''}</div>`).join('')}</div>`;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: FSLOGIX
	// ═══════════════════════════════════════════════════════════════════
	function renderFSLogix(){
	  if(!D){ $('view-fslogix').innerHTML=noData('FSLogix'); return; }
	  const fc=D.fslogixCoverage||{};
	  const met=D.metrics||{};
	  const shs=arr(D.sessionHosts).length?arr(D.sessionHosts):arr(D.hostPools).flatMap(hp=>arr(hp.sessionHosts));
	  const withF=shs.filter(s=>s.fslogixDetected), withoutF=shs.filter(s=>!s.fslogixDetected);
	  const mounts=arr(met.fslogixMountEvents), slowM=arr(met.fslogixSlowMounts);
	  const storageAccounts=arr(fc.storageAccounts);
	  const covPct=fc.coveragePct??0;

	  let html=`<div class="section-hdr"><h2>FSLogix</h2><span class="section-sub">Profile container coverage and health</span></div>
	  <div class="kpi-grid g4">
		<div class="kpi"><div class="kpi-label">Coverage</div><div class="kpi-value kv-${covPct>=80?'green':covPct>=50?'amber':'red'}">${covPct}%</div><div class="kpi-sub">${fc.hostsWithFSLogix||withF.length} of ${fc.totalHosts||shs.length} hosts</div></div>
		<div class="kpi"><div class="kpi-label">With FSLogix</div><div class="kpi-value kv-green">${fc.hostsWithFSLogix||withF.length}</div></div>
		<div class="kpi"><div class="kpi-label">Without FSLogix</div><div class="kpi-value kv-${withoutF.length>0?'amber':'green'}">${withoutF.length}</div></div>
		<div class="kpi"><div class="kpi-label">Slow Mounts (KQL)</div><div class="kpi-value kv-${slowM.length>0?'amber':'green'}">${slowM.length}</div></div>
	  </div>`;

	  // ── Storage account section ──────────────────────────────────────
	  if(storageAccounts.length){
		html+=`<div class="card accent-green"><div class="card-title">🗄 FSLogix Profile Storage — ${storageAccounts.length} storage account${storageAccounts.length!==1?'s':''} detected</div>`;
		storageAccounts.forEach(sa=>{
		  const shares=arr(sa.shares);
		  html+=`<div style="margin-bottom:12px;padding:10px;background:var(--bg-card);border-radius:var(--radius);border:1px solid var(--border)">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
			  <span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(sa.storageAccount)}</span>
			  <span class="pill p-gray" style="font-size:8px">${esc(sa.sku||'—')}</span>
			  <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${esc(sa.resourceGroup||'—')} · ${esc(sa.location||'—')}</span>
			</div>
			${sa.storageAccountUrl?`<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:8px">🔗 <span style="color:var(--cyan-dim)">${esc(sa.storageAccountUrl)}</span> ${copyBtn(sa.storageAccountUrl)}</div>`:''}
			<div class="data-table-wrap"><table class="data-table">
			  <thead><tr><th>Share Name</th><th>Quota (GiB)</th><th>Used (GiB)</th><th>Remaining (GiB)</th><th>Utilisation</th><th>Tier</th><th>Share URL</th></tr></thead>
			  <tbody>${shares.map(sh=>{
				const hasQuota=sh.quotaGiB>0;
				const pct=hasQuota?Math.round((sh.usedGiB/sh.quotaGiB)*100):null;
				const col=pct==null?'var(--text-muted)':pct>85?'var(--red)':pct>65?'var(--amber)':'var(--green)';
				const remaining=hasQuota?(sh.quotaGiB-sh.usedGiB).toFixed(2):'—';
				return `<tr>
				  <td class="name-col"><span class="pill p-cyan" style="font-size:9px">${esc(sh.name)}</span></td>
				  <td>${hasQuota?sh.quotaGiB:'No quota'}</td>
				  <td style="color:${col}">${sh.usedGiB??'—'}</td>
				  <td>${remaining}</td>
				  <td>${pct!=null?`<div class="score-bar-track" style="width:80px;display:inline-block;vertical-align:middle"><div class="score-bar-fill" style="width:${pct}%;background:${col}"></div></div> <span style="font-size:9px;color:${col}">${pct}%</span>`:'<span style="font-size:9px;color:var(--text-muted)">No quota set</span>'}</td>
				  <td style="font-size:9px;color:var(--text-muted)">${esc(sh.tier||'—')}</td>
				  <td style="font-size:9px">${sh.shareUrl?`<span style="color:var(--cyan-dim)">${esc(sh.shareUrl)}</span> ${copyBtn(sh.shareUrl)}`:'—'}</td>
				</tr>`;
			  }).join('')}</tbody>
			</table></div>
		  </div>`;
		});
		html+=`</div>`;
	  } else {
		html+=`<div class="card accent-amber"><div class="card-title">⚠ No FSLogix Profile Storage Detected</div>
		  <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:4px">${esc(fc.fslogixCoverageNote||'No storage accounts with profile shares found. FSLogix may be deployed via GPO or not configured.')}</div>
		</div>`;
	  }

	  // ── Host coverage ────────────────────────────────────────────────
	  if(withF.length){
		html+=`<div class="card accent-green"><div class="card-title">Session Hosts — FSLogix Detected</div><div style="display:flex;flex-wrap:wrap;gap:6px">${withF.map(s=>`<span class="pill p-green">${esc(s.vmName||s.name||'—')}</span>`).join('')}</div></div>`;
	  }
	  if(withoutF.length){
		html+=`<div class="card accent-amber"><div class="card-title">Session Hosts — FSLogix NOT Detected</div><div style="display:flex;flex-wrap:wrap;gap:6px">${withoutF.map(s=>`<span class="pill p-amber">${esc(s.vmName||s.name||'—')}</span>`).join('')}</div></div>`;
	  }

	  // ── KQL events ───────────────────────────────────────────────────
	  if(mounts.length){
		html+=`<div class="card"><div class="card-title">FSLogix Mount Events (KQL)</div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Host</th><th>Result</th><th>Count</th><th>Status</th></tr></thead><tbody>${mounts.map(e=>`<tr><td class="name-col">${esc((e.computer||'—').split('.')[0])}</td><td style="font-size:9px">${esc(e.mountResult||'—')}</td><td>${e.count??'—'}</td><td>${e.isFailure?'<span class="pill p-red">Failure</span>':'<span class="pill p-green">OK</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
	  }
	  if(slowM.length){
		html+=`<div class="card accent-amber"><div class="card-title">Slow Mount Hosts (KQL)</div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Host</th><th>Slow Mounts</th><th>Avg Load (sec)</th><th>Max Load (sec)</th></tr></thead><tbody>${slowM.map(s=>`<tr><td class="name-col">${esc((s.computer||'—').split('.')[0])}</td><td style="color:var(--amber)">${s.slowMountCount??'—'}</td><td>${s.avgLoadSec??'—'}</td><td style="color:var(--red)">${s.maxLoadSec??'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
	  }
	  if(!mounts.length&&!slowM.length){
		html+=`<div class="card"><div style="color:var(--text-muted);font-family:var(--font-mono);font-size:10px;padding:6px">No FSLogix KQL event data — enable AVD diagnostics and Log Analytics to capture mount events.</div></div>`;
	  }

	  $('view-fslogix').innerHTML=html;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: COST
	// ═══════════════════════════════════════════════════════════════════
	function renderCost(){
	  if(!D){ $('view-cost').innerHTML=noData('Cost'); return; }
	  const s=D.summary||{}, cur=s.currency||'';
	  const hps=arr(D.hostPools);
	  const shs=arr(D.sessionHosts).length?arr(D.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
	  const wasteHosts=shs.filter(sh=>sh.drainMode||(sh.activeSessions===0&&sh.powerState==='VM running'));
	  if(!s.costAvailable){
		// Check if data was collected on day 1-2 of the month (Azure may not have published yet)
		const collDate = D?.generatedAt ? new Date(D.generatedAt) : null;
		const dayOfMonth = collDate ? collDate.getDate() : null;
		const isEarlyMonth = dayOfMonth != null && dayOfMonth <= 2;
		const prevMsgHtml = s.previousMonthCost!=null
		  ? `<div style="margin-top:10px;font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">Previous month (${esc(s.previousMonthFrom||'')} → ${esc(s.previousMonthTo||'')}): <strong style="color:var(--cyan)">${s.currency||''} ${Number(s.previousMonthCost).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>`
		  : '';
		const msg = isEarlyMonth
		  ? `It is day ${dayOfMonth} of the month — Azure Cost Management may not have published current month data yet. Previous month cost is shown below.`
		  : `Cost data not collected — re-run without -SkipCostCollection with Cost Management Reader permissions.`;
		$('view-cost').innerHTML=`<div class="section-hdr"><h2>Cost &amp; FinOps</h2></div>
		<div class="card accent-amber"><div style="font-family:var(--font-mono);font-size:11px;color:var(--amber);padding:8px">
		  ⚠ ${msg}${prevMsgHtml}
		</div></div>`;
		return;
	  }
	  const proj = costProjection(s.currentMonthCost, D.generatedAt);
	  const hpCosts=hps.filter(hp=>hp.currentMonthCost!=null).sort((a,b)=>b.currentMonthCost-a.currentMonthCost);
	  const maxVal=Math.max(s.previousMonthCost||0, proj||s.currentMonthCost||0, 1)*1.1;

	  $('view-cost').innerHTML=`
	  <div class="section-hdr"><h2>Cost &amp; FinOps</h2><span class="section-sub">Azure Cost Management · Month comparison</span></div>

	  <!-- Month comparison card -->
	  <div class="card accent-cyan">
		<div class="card-title">Month-on-Month Comparison</div>
		<div class="cost-compare-grid">
		  <div class="cost-compare-col">
			<div class="ccc-label">Previous Month — Final</div>
			<div class="ccc-amount">${s.previousMonthCost!=null?fmtCur(s.previousMonthCost,cur):'—'}</div>
			<div class="ccc-period">${s.previousMonthFrom&&s.previousMonthTo?esc(s.previousMonthFrom)+' → '+esc(s.previousMonthTo):'Not collected — re-run PS1 to include'}
			</div>
			${s.previousMonthCostPerSession!=null?`<div style="margin-top:8px"><div class="ccc-label">Cost / Session</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${fmtCur(s.previousMonthCostPerSession,cur)}</div></div>`:''}
		  </div>
		  <div class="cost-compare-col">
			<div class="ccc-label">This Month — MTD</div>
			<div class="ccc-amount kv-cyan">${fmtCur(s.currentMonthCost,cur)}</div>
			<div class="ccc-period">${s.currentMonthFrom&&s.currentMonthTo?esc(s.currentMonthFrom)+' → '+esc(s.currentMonthTo):'Month to date'}</div>
			${s.costPerSession!=null?`<div style="margin-top:8px"><div class="ccc-label">Cost / Session</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${fmtCur(s.costPerSession,cur)}</div></div>`:''}
		  </div>
		</div>
		${costDeltaHTML(s.previousMonthCost,s.currentMonthCost,cur,D.generatedAt)}
	  </div>

	  <!-- Summary KPIs -->
	  <div class="kpi-grid g4">
		<div class="kpi"><div class="kpi-label">AVD Cost MTD</div><div class="kpi-value kv-cyan">${fmtCur(s.currentMonthCost,cur)}</div></div>
		<div class="kpi"><div class="kpi-label">Projected EOM</div><div class="kpi-value kv-amber">${proj?fmtCur(proj,cur):'—'}</div><div class="kpi-sub">estimate</div></div>
		<div class="kpi"><div class="kpi-label">Cost / Active Session</div><div class="kpi-value">${s.costPerSession?fmtCur(s.costPerSession,cur):'—'}</div></div>
		<div class="kpi"><div class="kpi-label">Wasted Spend (est.)</div><div class="kpi-value kv-${s.wastedSpendEstimate>0?'amber':'green'}">${s.wastedSpendEstimate?fmtCur(s.wastedSpendEstimate,cur):'—'}</div><div class="kpi-sub">${s.wastedSpendHosts||0} idle/drain hosts</div></div>
	  </div>
	  ${s.tenantCostTotal!=null?`<div class="kpi-grid g2" style="margin-top:8px">
		<div class="kpi"><div class="kpi-label">Subscription Total MTD</div><div class="kpi-value">${fmtCur(s.tenantCostTotal,cur)}</div><div class="kpi-sub">all resources in subscription</div></div>
		<div class="kpi"><div class="kpi-label">AVD Share of Subscription</div><div class="kpi-value kv-cyan">${s.tenantCostTotal>0?Math.round(s.currentMonthCost/s.tenantCostTotal*100)+'%':'—'}</div><div class="kpi-sub">AVD + compute as % of total spend</div></div>
	  </div>`:''}

	  <!-- Visual bar chart: previous vs projected -->
	  ${(s.previousMonthCost!=null||proj!=null)?`<div class="card">
		<div class="card-title">Cost Trend — Previous Month vs Projection</div>
		<div style="display:flex;align-items:flex-end;gap:32px;padding:8px 0 4px;height:120px">
		  ${s.previousMonthCost!=null?`<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
			<div style="width:100%;background:var(--border-lit);border-radius:4px 4px 0 0;height:${Math.round((s.previousMonthCost/maxVal)*90)}px;min-height:4px;transition:height 0.9s ease"></div>
			<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Last Month</div>
			<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">${fmtCur(s.previousMonthCost,cur)}</div>
		  </div>`:''}
		  <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
			<div style="width:100%;background:var(--cyan);border-radius:4px 4px 0 0;opacity:0.6;height:${Math.round((s.currentMonthCost/maxVal)*90)}px;min-height:4px;transition:height 0.9s ease"></div>
			<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">This Month MTD</div>
			<div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${fmtCur(s.currentMonthCost,cur)}</div>
		  </div>
		  ${proj!=null?`<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
			<div style="width:100%;background:var(--amber);border-radius:4px 4px 0 0;opacity:0.5;height:${Math.round((proj/maxVal)*90)}px;min-height:4px;border-top:2px dashed var(--amber);transition:height 0.9s ease"></div>
			<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Projected EOM</div>
			<div style="font-family:var(--font-mono);font-size:11px;color:var(--amber)">${fmtCur(proj,cur)} est.</div>
		  </div>`:''}
		</div>
		<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);text-align:right;margin-top:4px">Projection = (MTD ÷ days elapsed) × days in month</div>
	  </div>`:''}

	  <!-- Cost by host pool -->
	  ${hpCosts.length?`<div class="card">
		<div class="card-title">Cost by Host Pool</div>
		${hpCosts.map(hp=>`<div class="score-bar-wrap">
		  <div class="score-bar-label">${esc(hp.name)}</div>
		  <div class="score-bar-track"><div class="score-bar-fill" style="width:${Math.min(Math.round((hp.currentMonthCost/(hpCosts[0].currentMonthCost||1))*100),100)}%;background:var(--cyan)"></div></div>
		  <div class="score-bar-val" style="width:90px">${fmtCur(hp.currentMonthCost,cur)}</div>
		</div>`).join('')}
	  </div>`:''}

	  <!-- Wasted spend -->
	  ${wasteHosts.length?`<div class="card accent-amber">
		<div class="card-title">⚠ Wasted Spend — Idle or Drain-Mode Hosts Still Running (${wasteHosts.length})</div>
		<div class="data-table-wrap"><table class="data-table">
		  <thead><tr><th>Host</th><th>Host Pool</th><th>Reason</th><th>Sessions</th><th>Power State</th></tr></thead>
		  <tbody>${wasteHosts.map(sh=>`<tr>
			<td class="name-col">${esc(sh.vmName||sh.name||'—')}</td>
			<td style="font-size:9px">${esc(sh.hostPoolName||'—')}</td>
			<td><span class="pill p-amber">${sh.drainMode?'Drain Mode':'Idle Running'}</span></td>
			<td><span title='Active sessions'>${sh.activeSessions??0}</span><span style='color:var(--text-muted)'>/</span><span title='Disconnected sessions' style='color:${(sh.disconnectedSessions||0)>0?"var(--amber)":"var(--text-muted)"}'>${sh.disconnectedSessions??0}</span></td>
			<td style="font-size:9px">${esc(sh.powerState||'—')}</td>
		  </tr>`).join('')}</tbody>
		</table></div>
	  </div>`:''}`;
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// REPORT BUILDER — Step 3
	// ═══════════════════════════════════════════════════════════════════
	const RB_DEFAULT_SECTIONS = new Set(['overview','hostpools','sessionhosts','sessions','cost']);
	const RB_ALL_SECTIONS = [
	  {id:'overview',    label:'Overview & Statistics',     icon:'⬛', isDefault:true},
	  {id:'workspaces',  label:'Workspaces',                icon:'⊞', isDefault:false},
	  {id:'hostpools',   label:'Host Pools',                icon:'🖥', isDefault:true},
	  {id:'appgroups',   label:'Application Groups',        icon:'⊡', isDefault:false},
	  {id:'desktops',    label:'Session Desktops',          icon:'🖵', isDefault:false},
	  {id:'sessionhosts',label:'Session Hosts',             icon:'💻', isDefault:true},
	  {id:'scaling',     label:'Scaling Plans',             icon:'⚖', isDefault:false},
	  {id:'networking',  label:'Networking',                icon:'🌐', isDefault:false},
	  {id:'rbac',        label:'RBAC Assignments',          icon:'🔑', isDefault:false},
	  {id:'intelligence',label:'AVD Diagnostics',           icon:'🔍', isDefault:true},
	  {id:'applications',label:'Applications',              icon:'🚀', isDefault:false},
	  {id:'fslogix',     label:'FSLogix',                   icon:'📦', isDefault:false},
	  {id:'cost',        label:'Cost & FinOps',             icon:'💰', isDefault:true},
	  {id:'sessions',    label:'User Sessions',             icon:'👤', isDefault:true},
	  {id:'rginventory', label:'RG Inventory (Appendix A)', icon:'📋', isDefault:false},
	  {id:'rdpanalysis', label:'RDP Analysis (Appendix B)', icon:'🔧', isDefault:false},
	];
	let rbState = { format:'html', sections:new Set(RB_DEFAULT_SECTIONS), dirty:true };

	// Compat shims
	function openExportModal(){ rbOpen(); }
	function closeExportModal(){
	  $('export-modal').classList.remove('open');
	  const iframe=$('rb-iframe');
	  if(iframe){ iframe.style.display='none'; iframe.srcdoc=''; }
	  const ph=$('rb-placeholder'); if(ph) ph.style.display='flex';
	}

	function rbOpen(){
	  if(!D){ alert('Load a JSON file first.'); return; }
	  const dateEl=$('rb-date'); if(dateEl&&!dateEl.value){
		const now=new Date();
		const aest=new Date(now.toLocaleString('en-AU',{timeZone:'Australia/Sydney'}));
		dateEl.value=aest.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})+' '+aest.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:false})+' AEST';
	  }
	  const envEl=$('rb-env'); if(envEl&&!envEl.value) envEl.value=(D.subscriptionName?D.subscriptionName+' — AVD Environment':'AVD Environment');
	  const envLbl=$('rb-env-label'); if(envLbl) envLbl.textContent=D.subscriptionName||D.subscriptionId||'—';
	  // Apply live mode section defaults before building list
	  if(D?.displayConfig?.isLiveMode===true){
		rbState.sections = new Set(['overview','workspaces','hostpools','appgroups','desktops','sessionhosts']);
	  }
	  rbBuildSecList(); rbUpdateSummary(); rbState.dirty=true; rbSetPreviewBtn(true);
	  // Pre-fill exec textarea if empty
	  const execTa = document.getElementById('rb-exec-text');
	  if(execTa && !execTa.value) rbExecChange();
	  // Pre-fill author: display name → UPN fallback in Live mode
	  const authorEl = document.getElementById('rb-author');
	  if(authorEl && !authorEl.value && D?.displayConfig?.isLiveMode){
		const displayName = D.displayConfig.collectedByDisplayName || '';
		const upn         = D.displayConfig.collectedByUpn || '';
		authorEl.value    = displayName || upn;
	  }
	  rbApplyLiveModeUI();
	  $('export-modal').classList.add('open');
	}
	function rbBuildSecList(){
	  const el=$('rb-sec-list'); if(!el) return;
	  const isLive=D?.displayConfig?.isLiveMode===true;
	  if(isLive){
		el.innerHTML=
		  `<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--cyan-dim);padding:4px 0 8px;border-bottom:1px solid var(--border);margin-bottom:6px">⚡ Live Mode — Quick Report</div>`+
		  RB_ALL_SECTIONS
			.filter(s=>!RB_LIVE_HIDDEN_SECS.has(s.id))
			.map(s=>`
		<div class="rb-sec-row" onclick="rbToggleSec('${s.id}',!document.getElementById('rbc-${s.id}').checked);document.getElementById('rbc-${s.id}').checked=rbState.sections.has('${s.id}')">
		  <input type="checkbox" id="rbc-${s.id}" ${rbState.sections.has(s.id)?'checked':''}
			onclick="event.stopPropagation()" onchange="rbToggleSec('${s.id}',this.checked)">
		  <span class="rb-sec-lbl">${s.icon} ${s.label}</span>
		</div>`).join('');
	  } else {
		el.innerHTML=RB_ALL_SECTIONS.map(s=>`
		<div class="rb-sec-row ${s.isDefault?'is-default':''}" onclick="rbToggleSec('${s.id}',!document.getElementById('rbc-${s.id}').checked);document.getElementById('rbc-${s.id}').checked=rbState.sections.has('${s.id}')">
		  <input type="checkbox" id="rbc-${s.id}" ${rbState.sections.has(s.id)?'checked':''}
			onclick="event.stopPropagation()" onchange="rbToggleSec('${s.id}',this.checked)">
		  <span class="rb-sec-lbl">${s.icon} ${s.label}</span>
		  ${s.isDefault?'<span class="rb-dflt-badge">DEFAULT</span>':''}
		</div>`).join('');
	  }
	}
	function rbSetFmt(fmt){
	  rbState.format=fmt;
	  ['markdown','html','pdf','word'].forEach(f=>{ const b=$('rbfmt-'+f); if(b) b.classList.toggle('active',f===fmt); });
	  const pf=$('rb-prev-fmt'); if(pf) pf.textContent=fmt.toUpperCase();
	  rbMarkDirty();
	}
	function rbToggleSec(id,checked){ if(checked) rbState.sections.add(id); else rbState.sections.delete(id); rbUpdateSummary(); rbMarkDirty(); }
	const LIVE_CONFIG = {
	  hiddenSections:     ['fslogix','cost','rdpanalysis','intelligence','sessions'],
	  tickedSections:     ['overview','hostpools','sessionhosts','workspaces','rbac','rginventory'],
	  hiddenUIFields:     ['rb-field-exec-style','rb-field-findings-sentence','rb-field-closing-para','rb-field-kf','rb-field-fi','rb-field-scope','rb-field-notes'],
	  hiddenDocRows:      ['rb-doc-row-env','rb-doc-row-version'],
	  skipPatchStatus:    true,
	  skipFSLogix:        true,
	  skipConfigFindings: true,
	  execStyle:          '0',
	};

	const RB_LIVE_HIDDEN_SECS = new Set(LIVE_CONFIG.hiddenSections);
	const RB_LIVE_TICKED_SECS = new Set(LIVE_CONFIG.tickedSections);
	function rbSetAllSec(all){
	  const isLive=D?.displayConfig?.isLiveMode===true;
	  RB_ALL_SECTIONS.forEach(s=>{
		if(isLive&&RB_LIVE_HIDDEN_SECS.has(s.id)) return;
		all?rbState.sections.add(s.id):rbState.sections.delete(s.id);
	  });
	  rbBuildSecList(); rbUpdateSummary(); rbMarkDirty();
	  if(isLive) rbApplyLiveModeUI();
	}
	function rbSetDefaults(){
	  const isLive=D?.displayConfig?.isLiveMode===true;
	  rbState.sections=isLive?new Set(RB_LIVE_TICKED_SECS):new Set(RB_DEFAULT_SECTIONS);
	  rbBuildSecList(); rbUpdateSummary(); rbMarkDirty();
	  if(isLive) rbApplyLiveModeUI();
	}
	function rbMarkDirty(){ rbState.dirty=true; rbSetPreviewBtn(true); rbUpdateSummary(); }

	function rbApplyLiveModeUI(){
	  const isLive = D?.displayConfig?.isLiveMode===true;
	  LIVE_CONFIG.hiddenUIFields.forEach(function(id){
		const el = document.getElementById(id);
		if(el) el.style.display = isLive ? 'none' : '';
	  });
	  // Hide specific section rows in the section list
	  LIVE_CONFIG.hiddenSections.forEach(function(sid){
		const row = document.getElementById('rbc-'+sid)?.closest('.rb-sec-row');
		if(row) row.style.display = isLive ? 'none' : '';
	  });
	}


	
	const RB_EXEC_OPTIONS = {
	  '0': `This document provides an overview of the Azure Virtual Desktop (AVD) environment for [client], collected on [date] and prepared by [engineer].\n\nThe environment has been implemented to provide users with secure, reliable access to their desktops and applications from any supported device. It has been designed with availability, security, and ease of management in mind, with monitoring in place to support day-to-day operations and informed decision-making.\n\nThis document captures the current state of the environment and serves as a reference for operational teams, stakeholders, and future planning activities.`,
	  '1': `This document provides an overview of the Azure Virtual Desktop (AVD) environment implemented for [client]. The platform has been designed to deliver secure, reliable access to applications and desktop services for end users, while providing flexibility to scale in line with business demand.\n\nThe environment has been built in line with Microsoft's recommended practices, with a strong emphasis on security, performance, and operational resilience. User access is centrally managed, session hosts are monitored for health and capacity, and logging has been configured to provide visibility into connection quality, user activity, and system performance.\n\nFrom an end-user perspective, the solution aims to provide a consistent and responsive experience across supported devices, whether accessing full desktops or published applications. From an operational perspective, the environment has been designed to be supportable, observable, and cost-aware, enabling informed decision-making as usage patterns evolve.\n\nThis document was collected on [date] and prepared by [engineer]. It acts as a reference point for the current state of the AVD environment and provides a foundation for ongoing optimisation, governance, and future enhancements.`,
	  '2': `The Azure Virtual Desktop environment described in this document has been implemented to provide staff at [client] with secure and dependable access to their working environments, regardless of location. The solution replaces traditional on-premises approaches with a modern, cloud-based platform that is more flexible and easier to manage.\n\nParticular attention has been given to the user experience, including logon behaviour, session performance, and network connectivity. Monitoring and reporting capabilities are in place to ensure issues can be identified early and addressed proactively, rather than reactively.\n\nFrom an operational standpoint, the environment has been structured to support day-to-day administration, troubleshooting, and capacity planning, while maintaining clear visibility over usage and cost.\n\nThis document was collected on [date] and prepared by [engineer]. The remainder of this document provides further detail on the environment's configuration, usage characteristics, and operational considerations.`,
	  '3': `This document outlines the current Azure Virtual Desktop (AVD) environment for [client] and how it supports secure, scalable delivery of applications and desktop services to users.\n\nThe platform has been implemented using Microsoft-recommended design principles, with controls in place to support security, availability, and performance. Usage monitoring and reporting have been enabled to provide insight into user behaviour, session health, and resource consumption.\n\nThe solution is intended to deliver a reliable experience for users while giving the organisation clear visibility and control over the environment. This document was collected on [date], prepared by [engineer], and serves as both a high-level overview for stakeholders and a reference guide for ongoing operation and future planning.`,
	  '4': `The Azure Virtual Desktop environment for [client] has been established as a managed, enterprise-grade platform for delivering remote desktops and applications. The design prioritises security, consistency, and operational transparency, ensuring the environment can be supported effectively over time.\n\nControls are in place to monitor connection success, session performance, logon behaviour, and host health. These insights enable support teams to identify trends, address performance concerns, and plan capacity with greater confidence.\n\nThis document was collected on [date] and prepared by [engineer]. It provides a clear view of the current state of the environment and is intended to support both technical teams and stakeholders in understanding how the platform is used, how it is monitored, and how it can be improved as requirements evolve.`,
	  '5': `The Azure Virtual Desktop platform described in this document has been implemented for [client] to provide a secure and dependable foundation for remote working. The environment has been designed with reliability and ease of use in mind, whilst maintaining strong security and governance controls.\n\nOngoing monitoring and reporting provide visibility into user activity, system performance, and overall service health. This enables the support team to take an informed, proactive approach to managing the environment and ensuring a consistent experience for users.\n\nThis document was collected on [date] and prepared by [engineer]. It captures the current configuration and operational characteristics of the AVD environment and should be used as a reference when reviewing performance, planning changes, or considering future enhancements.`,
	  '6': `This document describes the Azure Virtual Desktop environment currently in place for [client] and how it supports secure remote access to applications and desktops. The solution has been designed to balance user experience, security, and operational efficiency.\n\nFrom a user perspective, the platform provides consistent access from supported devices, with monitoring in place to track connectivity and performance. From a support perspective, the environment offers clear visibility into usage patterns and system health, enabling issues to be addressed quickly and effectively.\n\nThis document was collected on [date] and prepared by [engineer]. The intention is to provide a clear, shared understanding of how the environment operates today and to serve as a baseline for ongoing optimisation and future development.`
	};
	function rbExecChange(){
	  const val = document.querySelector('input[name="rb-exec-style"]:checked')?.value||'0';
	  const ta = document.getElementById('rb-exec-text');
	  if(!ta) return;
	  ta.value = RB_EXEC_OPTIONS[val]||'';
	  rbMarkDirty();
	}

	const RB_KF_OPTIONS = {
	  '1': `Based on the current configuration and observed usage of the Azure Virtual Desktop environment, the platform is operating in a stable and controlled manner. Core connection services are functioning as expected, and users are generally able to access their desktops and applications successfully.\n\nMonitoring data shows consistent session behaviour across the environment, with user activity patterns aligning with expected business usage. Session host performance is within acceptable thresholds, and host health indicators suggest that the environment is well‑balanced under current load conditions.\n\nVisibility into user sessions, logon behaviour, and network latency provides a strong foundation for proactive support. The availability of detailed telemetry enables issues to be identified early and addressed before they have a wider impact.\n\nOverall, the environment demonstrates a solid operational baseline, with appropriate controls in place to support day‑to‑day operations and informed decision‑making.`,
	  '2': `The Azure Virtual Desktop environment is currently supporting user workloads effectively, with a high rate of successful connections and no evidence of systemic instability. Session utilisation and user activity remain consistent, indicating that capacity is currently aligned with demand.\n\nPerformance monitoring shows that session hosts are operating within defined parameters, with no sustained CPU or memory pressure observed during typical usage periods. Network latency varies by user location, as expected, but remains within acceptable ranges for most sessions.\n\nLogon behaviour has been analysed using session lifecycle data, providing visibility into average and peak logon times. While some variation is observed between users and hosts, these patterns are consistent with normal operational conditions.\n\nThe environment benefits from clear observability, allowing the support team to correlate user experience with underlying system behaviour.`
	};
	function rbKFChange(){
	  const val = document.querySelector('input[name="rb-kf-style"]:checked')?.value||'0';
	  const ta = document.getElementById('rb-kf-text');
	  if(!ta) return;
	  if(val==='0'){ ta.style.display='none'; ta.value=''; }
	  else { ta.style.display=''; ta.value=RB_KF_OPTIONS[val]||''; }
	  rbMarkDirty();
	}

	const RB_FI_OPTIONS = {
	  '1': `While the Azure Virtual Desktop environment is performing well overall, a number of opportunities exist to further enhance its efficiency, resilience, and user experience.\n\nAs usage patterns mature, ongoing review of session host sizing and scaling behaviour may help optimise resource utilisation and cost. Regular trend analysis will support informed decisions around capacity planning as user demand changes over time.\n\nContinued monitoring of logon performance can help identify users or hosts experiencing slower‑than‑expected access, enabling targeted remediation such as profile optimisation or host rebalancing where appropriate.\n\nThe existing reporting and monitoring framework provides a strong platform for continuous improvement. Over time, this data can be used to support performance tuning, improve user experience, and ensure the environment evolves in line with business requirements.`,
	  '2': `The current Azure Virtual Desktop implementation provides a strong baseline; however, further refinement can be achieved through continuous optimisation informed by operational data.\n\nEnhancements may include more granular analysis of user behaviour and performance trends, enabling early identification of emerging capacity or performance constraints. Where appropriate, automation may be introduced to support scaling and routine operational tasks.\n\nLogon performance data can be used to focus improvement efforts on specific hosts or user groups, particularly where slower access times are observed. This may include reviewing profile management practices, host configuration, or session distribution.\n\nAs business needs evolve, the environment can be incrementally adjusted to support new workloads, users, or access patterns, ensuring Azure Virtual Desktop continues to provide a reliable and cost‑effective service.`
	};
	function rbFIChange(){
	  const val = document.querySelector('input[name="rb-fi-style"]:checked')?.value||'0';
	  const ta = document.getElementById('rb-fi-text');
	  if(!ta) return;
	  if(val==='0'){ ta.style.display='none'; ta.value=''; }
	  else { ta.style.display=''; ta.value=RB_FI_OPTIONS[val]||''; }
	  rbMarkDirty();
	}


	
	// ── Logo helpers ──────────────────────────────────────────────────
	function rbLogoFileChange(e){
	  const file=e.target.files[0]; if(!file) return;
	  const reader=new FileReader();
	  reader.onload=ev=>{
		const dataUrl=ev.target.result;
		$('rb-logo-data').value=dataUrl;
		$('rb-logo-img').src=dataUrl;
		$('rb-logo-status').textContent=file.name;
		$('rb-logo-preview').style.display='flex';
		$('rb-logo').value=''; // clear URL field
		$('rb-logo-file-label').textContent='✓ '+file.name;
		rbMarkDirty();
	  };
	  reader.readAsDataURL(file);
	}
	function rbLogoUrlChange(url){
	  if(url.trim()){
		$('rb-logo-data').value=''; // clear base64
		$('rb-logo-img').src=url;
		$('rb-logo-status').textContent='URL';
		$('rb-logo-preview').style.display='flex';
		$('rb-logo-img').onerror=()=>{ $('rb-logo-preview').style.display='none'; };
	  } else {
		if(!$('rb-logo-data').value) $('rb-logo-preview').style.display='none';
	  }
	  rbMarkDirty();
	}
	function rbClearLogo(){
	  $('rb-logo-data').value='';
	  $('rb-logo').value='';
	  $('rb-logo-file').value='';
	  $('rb-logo-file-label').textContent='📁 Upload JPG / PNG / SVG…';
	  $('rb-logo-preview').style.display='none';
	  rbMarkDirty();
	}
	function rbGetLogoSrc(){
	  const data=$('rb-logo-data')?.value;
	  if(data) return data;
	  const url=$('rb-logo')?.value?.trim();
	  return url||'';
	}
	function rbSetPreviewBtn(dirty){
	  const btn=$('rb-preview-btn'); if(!btn) return;
	  btn.classList.toggle('needs-refresh',dirty);
	  btn.innerHTML=dirty?'&#128065; Preview Document &bullet;':'&#128065; Preview Document';
	}
	function rbMeta(id){ return document.getElementById(id)?.value?.trim()||''; }
	function rbUpdateSummary(){
	  const fmtEl=$('rbs-fmt'); if(fmtEl) fmtEl.textContent=rbState.format.toUpperCase();
	  const secEl=$('rbs-secs'); if(secEl) secEl.textContent=rbState.sections.size+' of '+RB_ALL_SECTIONS.length;
	  const envEl=$('rbs-env'); if(envEl) envEl.textContent=rbMeta('rb-client')||D?.subscriptionName||'—';
	}
	function rbRenderPreview(){
	  rbState.dirty=false; rbSetPreviewBtn(false);
	  const iframe=$('rb-iframe'), ph=$('rb-placeholder'); if(!iframe) return;
	  const pf=$('rb-prev-fmt'); if(pf) pf.textContent=rbState.format.toUpperCase();
	  if(rbState.format==='markdown'){
		// Render markdown as HTML for preview display
		if(ph){ ph.style.display='none'; }
		iframe.style.display='block';
		const md=rbBuildMarkdown();
		// Simple md→html for preview only
		let body=md
		  .replace(/^## (.+)$/gm,'<h2>$1</h2>')
		  .replace(/^### (.+)$/gm,'<h3>$1</h3>')
		  .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
		  .replace(/`([^`]+)`/g,'<code>$1</code>')
		  .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
		  .replace(/^---$/gm,'<hr>')
		  .replace(/^\| (.+) \|$/gm,line=>{ if(line.includes('---')) return ''; const cells=line.split('|').slice(1,-1).map(c=>`<td>${c.trim()}</td>`).join(''); return `<tr>${cells}</tr>`; })
		  .replace(/^- (.+)$/gm,'<li>$1</li>')
		  .replace(/\n/g,'<br>');
		iframe.srcdoc=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:12px;padding:20px;background:#f8fafc;color:#1a2030;line-height:1.8;}h2{font-size:15px;border-bottom:2px solid #00a8cc;margin:18px 0 8px;}h3{font-size:13px;color:#1e3a5f;margin:14px 0 6px;}table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px;}th{background:#0d1117;color:#e8edf5;padding:5px 8px;text-align:left;}td{padding:5px 8px;border-bottom:1px solid #e0e8f0;}code{background:#e8edf5;padding:1px 4px;border-radius:2px;}blockquote{border-left:3px solid #00a8cc;padding:4px 10px;background:#f0f8ff;color:#3060a0;margin:6px 0;}hr{border:none;border-top:1px solid #d0dcea;margin:16px 0;}</style></head><body>${body}</body></html>`;
	  } else if(rbState.format==='word'){
		if(ph){ ph.style.display='flex'; ph.innerHTML=`<div style="text-align:center"><div style="font-size:48px;opacity:0.3">📘</div><div style="font-family:var(--font-mono);font-size:11px;color:#6080a0;margin-top:12px">Word export downloads a <strong style='color:#00a8cc'>.doc</strong> file that opens directly in Microsoft Word.<br>In Word, use <strong>File → Save As → .docx</strong> to convert to native format.<br>No internet connection required.</div></div>`; }
		iframe.style.display='none';
	  } else {
		if(ph) ph.style.display='none';
		iframe.style.display='block';
		iframe.srcdoc=rbBuildHTMLDoc();
	  }
	}
	function rbDoExport(){
	  const md=rbBuildMarkdown(), sub=(D.subscriptionName||'AVD').replace(/[^a-zA-Z0-9]/g,'-');
	  if(rbState.format==='pdf'){
		const w=window.open('','_blank');
		w.document.write(rbBuildHTMLDoc()); w.document.close();
		w.onload=()=>setTimeout(()=>w.print(),400);
	  } else if(rbState.format==='html'){
		rbDownload(rbBuildHTMLDoc(),'YGIT-AVDIntelligence-'+sub+'.html','text/html');
	  } else if(rbState.format==='word'){
		rbBuildDOCX(sub);
	  } else {
		rbDownload(md,'YGIT-AVDIntelligence-'+sub+'.md','text/markdown');
	  }
	}
	function rbDownload(content,filename,mime){
	  const blob=new Blob([content],{type:mime+';charset=utf-8'});
	  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename;
	  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
	}


	
	// ── Markdown ──────────────────────────────────────────────────────
	function buildMarkdown(){ return rbBuildMarkdown(); }
	function rbBuildMarkdown(){
	  if(!D) return '';
	  const s=D.summary||{}, cur=s.currency||'';
	  const hps=arr(D.hostPools), sps=arr(D.scalingPlans), wss=arr(D.avdWorkspaces), ags=arr(D.applicationGroups);
	  const shs=arr(D.sessionHosts).length?arr(D.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
	  const sessions=arr(D.sessions).length?arr(D.sessions):hps.flatMap(hp=>arr(hp.sessionHosts).flatMap(sh=>arr(sh.sessions)));
	  const sec=id=>rbState.sections.has(id);
	  const shutdownHosts=s.shutdownHosts||0;
	  const activeHosts=(s.totalSessionHosts||0)-shutdownHosts;
	  const prodHps=hps.filter(hp=>!/uat|dev|test/i.test(hp.name||''));
	  const prodPoolsWithoutScaling=prodHps.filter(hp=>!hp.hasScalingPlan).length;
	  const diagNote=hps.length>prodHps.length?` (${hps.length-prodHps.length} non-prod excluded)`:'';
	  const allFindings=hps.flatMap(hp=>arr(hp.securityFindings));
	  const now=new Date();
	  const client=rbMeta('rb-client')||D.subscriptionName||'—';
	  const envName=rbMeta('rb-env')||D.subscriptionName||'—';
	  const author=rbMeta('rb-author')||'YGIT';
	  const version=rbMeta('rb-version')||'v1.0';
	  const docDate=rbMeta('rb-date')||now.toLocaleDateString('en-AU');
	  const subtitle=rbMeta('rb-subtitle')||'Azure Virtual Desktop Environment Document';
	  const notes=rbMeta('rb-notes');
	  const L=[];
	  const scope=rbMeta('rb-scope');

	  L.push('# Azure Virtual Desktop — Environment Documentation');
	  L.push('\n| Field | Value |'); L.push('|-------|-------|');
	  L.push(`| Client | ${client} |`); L.push(`| Environment | ${envName} |`);
	  L.push(`| Prepared By | ${author} |`); L.push(`| Version | ${version} |`);
	  L.push(`| Date | ${docDate} |`);
	  L.push(`| Subscription | ${D.subscriptionName||D.subscriptionId||'—'} |`);
	  L.push(`| Tenant | ${D.tenantName||D.tenantId||'—'} |`);
	  L.push(`| Data Collected | ${D.generatedAt?(new Date(D.generatedAt).toLocaleString()):'—'} |`);
	  if(notes) L.push(`\n> **Notes:** ${notes}`);
	  if(scope) L.push(`\n**Document Scope:** ${scope}`);

	  // ── Table of Contents (always included) ──
	  L.push('\n---\n## Table of Contents\n');
	  const tocItems=[
		{id:'exec',label:'Executive Summary'},
		...RB_ALL_SECTIONS.filter(s=>rbState.sections.has(s.id)).map(s=>({id:s.id,label:s.label}))
	  ];
	  tocItems.forEach((t,i)=>L.push(`${i+1}. ${t.label}`));

	  // ── Executive Summary (always included) ──
	  const allF2=hps.flatMap(hp=>arr(hp.securityFindings));
	  const critF=allF2.filter(f=>f.severity==='Critical'||f.severity==='High').length;
	  L.push('\n---\n## Executive Summary\n');
	  L.push(`This document provides a technical assessment of the Azure Virtual Desktop environment for **${client}**,`);
	  L.push(`collected on **${D.generatedAt?(new Date(D.generatedAt).toLocaleDateString('en-AU')):docDate}** and prepared by **${author}**.\n`);
	  L.push(`The environment comprises **${s.hostPoolCount??0} host pool${(s.hostPoolCount||0)!==1?'s':''}** hosting **${s.totalSessionHosts??0} session host${(s.totalSessionHosts||0)!==1?'s':''}** with a current health rating of **${s.overallHealthPct??0}%**.`);
	  L.push(`There are **${s.totalActiveSessions??0} active** and **${s.totalDisconnectedSessions??0} disconnected** user sessions at time of collection.`);
	  if(critF>0) L.push(`\n> ⚠ **${critF} high/critical security finding${critF!==1?'s were':' was'} identified** — see Security Findings section for details.`);
	  else L.push('\n> ✓ No critical or high-severity security findings were identified.');
	  if(s.costAvailable){
		const proj=costProjection(s.currentMonthCost,D.generatedAt);
		let costLine=`Month-to-date AVD spend is **${s.currency||''}${s.currentMonthCost?.toFixed(2)??'—'}**`;
		if(s.costPerSession) costLine+=`, equivalent to **${s.currency||''}${s.costPerSession} per active session**`;
		if(s.previousMonthCost!=null&&proj!=null){
		  const delta=proj-s.previousMonthCost;
		  const pct=Math.round((delta/s.previousMonthCost)*100);
		  costLine+=`. Projected end-of-month spend is **${s.currency||''}${proj.toFixed(2)}**, ${delta>=0?`up ${pct}% vs`:`down ${Math.abs(pct)}% vs`} last month's **${s.currency||''}${s.previousMonthCost.toFixed(2)}**`;
		}
		L.push('\n'+costLine+'.');
	  }
	  if(scope) L.push(`\n**Scope:** ${scope}`);

	  L.push('\n---');
	  if(sec('overview')){
		L.push('\n## Infrastructure Overview\n');
		L.push('| Metric | Value |'); L.push('|--------|-------|');
		L.push(`| Host Pools | ${s.hostPoolCount??'—'} (${s.pooledHostPools||0} pooled) |`);
		L.push(`| Session Hosts | ${s.totalSessionHosts??'—'} (${s.availableHosts||0} available · ${shutdownHosts} powered off) |`);
		L.push(`| Active Sessions | ${s.totalActiveSessions??'—'} |`);
		L.push(`| Disconnected | ${s.totalDisconnectedSessions??'—'} |`);
		L.push(`| Workspaces | ${s.avdWorkspaceCount??'—'} |`);
		L.push(`| App Groups | ${s.applicationGroupCount??'—'} |`);
		L.push(`| Scaling Plans | ${s.scalingPlanCount??'—'} (${prodPoolsWithoutScaling} prod pools without) |`);
		L.push(`| FSLogix | ${s.hostsWithFSLogixDetected??'—'} of ${s.totalSessionHosts||0} hosts |`);
		L.push(`| Health | ${s.overallHealthPct??'—'}% (${s.availableHosts||0}/${activeHosts} active hosts) |`);
		L.push(`| Diagnostics Coverage | ${prodHps.filter(hp=>hp.diagnosticsEnabled).length} of ${prodHps.length} prod pools${diagNote} |`);
		if(s.costAvailable) L.push(`| AVD Cost MTD | ${cur} ${s.currentMonthCost?.toFixed(2)??'—'} |`);
		// Note: security findings are in the dedicated Recommendations section — not duplicated here
	  }
	  if(sec('hostpools')&&hps.length){
		L.push('\n---\n## Host Pools\n');
		hps.forEach(hp=>{
		  L.push(`### ${hp.name} [${hp.hostPoolType}]`);
		  if(hp.friendlyName&&hp.friendlyName!==hp.name) L.push(`- **Friendly Name:** ${hp.friendlyName}`);
		  if(hp.description) L.push(`- **Description:** ${hp.description}`);
		  L.push(`- **RG:** ${hp.resourceGroup||'—'} · **Location:** ${hp.location||'—'} · **LB:** ${hp.loadBalancerType||'—'}`);
		  L.push(`- **Max Sessions:** ${hp.maxSessionLimit??'—'} · **Preferred App Type:** ${hp.preferredAppGroupType||'—'}`);
		  L.push(`- **Public Network:** ${hp.publicNetworkAccess===false?'Private Only':'Enabled'} · **Start VM on Connect:** ${hp.startVMOnConnect?'Yes':'No'}`);
		  L.push(`- **Session Hosts:** ${hp.sessionHostCount||0} (${hp.sessionHostsAvailable||0} avail, ${hp.sessionHostsUnavailable||0} unavail)`);
		  L.push(`- **Sessions:** ${hp.activeSessions||0} active, ${hp.disconnectedSessions||0} disconnected · **Health:** ${hp.healthPct??0}%`);
		  L.push(`- **Diagnostics:** ${hp.diagnosticsEnabled?'Enabled':'Not configured'} · **Scaling Plan:** ${arr(hp.scalingPlans).map(sp=>sp.name).join(', ')||'None'}`);
		  if(Object.keys(hp.tags||{}).length) L.push(`- **Tags:** ${Object.entries(hp.tags).map(([k,v])=>`\`${k}: ${v}\``).join(', ')}`);
		  L.push(`- **Resource ID:** \`${hp.id||'—'}\``);
		  if(hp.customRdpProperties) L.push(`- **RDP:** \`${hp.customRdpProperties}\``);
		  const f=arr(hp.securityFindings);
		  if(f.length){ L.push('\n**Security Findings:**'); f.forEach(x=>L.push(`- [${x.severity}] ${x.finding}`)); }
		  L.push('');
		});
	  }
	  if(sec('scaling')&&sps.length){
		L.push('\n---\n## Scaling Plans\n');
		sps.forEach(sp=>{
		  L.push(`### ${sp.name}`);
		  const spHPNames = arr(sp.hostPoolReferences).map(function(r){ return r.hostPoolId.split('/').pop(); }).filter(Boolean);
		  L.push(`- **Host Pool${spHPNames.length!==1?'s':''}:** ${spHPNames.join(', ')||'—'}`);
		  L.push(`- **RG:** ${sp.resourceGroup||'—'} · **Location:** ${sp.location||'—'} · **Type:** ${sp.hostPoolType||'—'}`);
		  if(Object.keys(sp.tags||{}).length) L.push(`- **Tags:** ${Object.entries(sp.tags).map(([k,v])=>`\`${k}: ${v}\``).join(', ')}`);
		  arr(sp.schedules).forEach(sc=>{
			L.push(`\n#### ${sc.name} (${arr(sc.daysOfWeek).join(', ')||'—'})`);
			L.push('| Phase | Start | Algorithm | Min Hosts | Capacity |');
			L.push('|-------|-------|-----------|-----------|----------|');
			L.push(`| Ramp-Up | ${sc.rampUpStartTime||'—'} | ${sc.rampUpLoadAlgorithm||'—'} | ${sc.rampUpMinimumHostsPct??'—'}% | ${sc.rampUpCapacityThresholdPct??'—'}% |`);
			L.push(`| Peak | ${sc.peakStartTime||'—'} | ${sc.peakLoadAlgorithm||'—'} | — | — |`);
			L.push(`| Ramp-Down | ${sc.rampDownStartTime||'—'} | ${sc.rampDownLoadAlgorithm||'—'} | ${sc.rampDownMinimumHostsPct??'—'}% | — |`);
			L.push(`| Off-Peak | ${sc.offPeakStartTime||'—'} | ${sc.offPeakLoadAlgorithm||'—'} | — | — |`);
			if(sc.rampDownNotificationMessage) L.push(`\n> **Notification:** ${sc.rampDownNotificationMessage}`);
		  }); L.push('');
		});
	  }
	  if(sec('workspaces')&&wss.length){
		L.push('\n---\n## Workspaces\n');
		wss.forEach(ws=>{
		  const wsAgs=ags.filter(ag=>ag.workspaceId===ws.id||ag.workspaceName===ws.name);
		  L.push(`### ${ws.name}`);
		  if(ws.friendlyName&&ws.friendlyName!==ws.name) L.push(`- **Friendly Name:** ${ws.friendlyName}`);
		  if(ws.description) L.push(`- **Description:** ${ws.description}`);
		  L.push(`- **Resource Group:** ${ws.resourceGroup||'—'} · **Location:** ${ws.location||'—'}`);
		  L.push(`- **Diagnostics:** ${ws.diagnosticsEnabled?'Enabled':'Not Configured'}`);
		  if(Object.keys(ws.tags||{}).length) L.push(`- **Tags:** ${Object.entries(ws.tags).map(([k,v])=>`\`${k}: ${v}\``).join(', ')}`);
		  L.push(`- **Resource ID:** \`${ws.id||'—'}\``);
		  if(wsAgs.length){ L.push('\n**App Groups:**'); wsAgs.forEach(ag=>L.push(`- ${ag.name} [${ag.applicationGroupType}]`)); }
		  L.push('');
		});
	  }
	  if(sec('appgroups')&&ags.length){
		L.push('\n---\n## Application Groups\n');
		ags.forEach(ag=>{
		  L.push(`### ${ag.name} [${ag.applicationGroupType}]`);
		  if(ag.friendlyName&&ag.friendlyName!==ag.name) L.push(`- **Friendly Name:** ${ag.friendlyName}`);
		  if(ag.description) L.push(`- **Description:** ${ag.description}`);
		  L.push(`- **Host Pool:** ${ag.hostPoolName||'—'} · **Workspace:** ${ag.workspaceFriendlyName||ag.workspaceName||'—'}`);
		  L.push(`- **Resource Group:** ${ag.resourceGroup||'—'} · **Location:** ${ag.location||'—'}`);
		  L.push(`- **Assignees:** ${ag.totalAssignees||0} (${arr(ag.assignedGroups).length} group${arr(ag.assignedGroups).length!==1?'s':''}, ${arr(ag.assignedUsers).length} user${arr(ag.assignedUsers).length!==1?'s':''})`);
		  L.push(`- **Diagnostics:** ${ag.diagnosticsEnabled?'Enabled':'Not Configured'}`);
		  if(Object.keys(ag.tags||{}).length) L.push(`- **Tags:** ${Object.entries(ag.tags).map(([k,v])=>`\`${k}: ${v}\``).join(', ')}`);
		  const allA=[...arr(ag.assignedUsers),...arr(ag.assignedGroups)];
		  const stdRole='Desktop Virtualization User';
		  if(allA.length){ L.push('\n**Assignments:**'); allA.forEach(a=>{ const nonStd=a.role&&a.role!==stdRole?` ⚠ ${a.role}`:''; L.push(`- ${a.displayName||a.objectId||'—'} [${a.objectType}]${nonStd}`); }); }
		  if(ag.applicationGroupType==='RemoteApp'&&arr(ag.remoteApps).length){ L.push('\n**Apps:**'); arr(ag.remoteApps).forEach(a=>L.push(`- \`${a.name}\` → \`${a.filePath||'—'}\``)); }
		  L.push('');
		});
	  }
	  const deskAgs=ags.filter(ag=>ag.applicationGroupType==='Desktop');
	  if(sec('desktops')&&deskAgs.length){
		L.push('\n---\n## Session Desktops\n');
		deskAgs.forEach(ag=>{
		  L.push(`### ${ag.name}`);
		  if(ag.friendlyName&&ag.friendlyName!==ag.name) L.push(`- **Friendly Name:** ${ag.friendlyName}`);
		  if(ag.description) L.push(`- **Description:** ${ag.description}`);
		  L.push(`- **Workspace:** ${ag.workspaceFriendlyName||ag.workspaceName||'—'} · **Host Pool:** ${ag.hostPoolName||'—'}`);
		  L.push(`- **Show in Portal:** ${ag.showInPortal!==false?'Yes':'No'}`);
		  const allA=[...arr(ag.assignedUsers),...arr(ag.assignedGroups)];
		  const stdRole='Desktop Virtualization User';
		  if(allA.length){ L.push('\n**Assignments:**'); allA.forEach(a=>{ const nonStd=a.role&&a.role!==stdRole?` ⚠ ${a.role}`:''; L.push(`- ${a.displayName||a.objectId||'—'} [${a.objectType}]${nonStd}`); }); }
		  L.push('');
		});
	  }
	  if(sec('sessionhosts')&&shs.length){
		L.push('\n---\n## Session Hosts\n');
		shs.forEach(sh=>{
		  const net=sh.networkDetails||{};
		  const tags=Object.entries(sh.tags||{});
		  const displayName = sh.name||sh.vmName||'—';
		  const location    = sh.vmLocation||sh.location||'—';
		  L.push(`### ${sh.vmName||sh.name||'—'}`);
		  L.push('\n**Session Host Details**');
		  L.push(`| Field | Value |\n|-------|-------|`);
		  L.push(`| Status | ${sh.status||'—'} |`);
		  L.push(`| VM Size | ${sh.vmSize||'—'} |`);
		  L.push(`| Active Sessions | ${sh.activeSessions??0} |`);
		  L.push(`| Location | ${sh.vmLocation||sh.location||'—'} |`);
		  L.push(`| Allow New Sessions | ${sh.allowNewSessions===false?'Blocked':'Allowed'} |`);
		  L.push(`| Host Resource Group | ${sh.resourceGroup||'—'} |`);
		  L.push(`| Host Pool | ${sh.hostPoolName||'—'} |`);
		  L.push('\n**VM Details**');
		  L.push(`| Field | Value |\n|-------|-------|`);
		  L.push(`| VM Name | ${sh.vmName||'—'} |`);
		  L.push(`| OS Version | ${sh.osVersion||'—'} |`);
		  L.push(`| Agent Version | ${sh.agentVersion||'—'} |`);
		  L.push(`| OS Type | ${sh.osType||'—'} |`);
		  L.push(`| Power State | ${sh.powerState||'—'} |`);
		  L.push('\n**Storage Details**');
		  L.push(`| Field | Value |\n|-------|-------|`);
		  L.push(`| Disk Name | ${sh.osDiskName||'—'} |`);
		  L.push(`| Disk Size | ${sh.osDiskSizeGB?sh.osDiskSizeGB+' GB':'—'} |`);
		  L.push(`| Disk Type | ${sh.osDiskType||'—'} |`);
		  L.push(`| Caching | ${sh.osDiskCaching||'—'} |`);
		  L.push('\n**Network Details**');
		  L.push(`| Field | Value |\n|-------|-------|`);
		  L.push(`| Private IP | ${net.privateIP||sh.privateIP||'—'} |`);
		  L.push(`| Public IP | ${net.publicIP||sh.publicIP||'—'} |`);
		  L.push(`| NIC | ${net.nicName||sh.nicName||'—'} |`);
		  L.push(`| Virtual Network | ${net.virtualNetwork||sh.virtualNetwork||'—'} |`);
		  L.push(`| Subnet | ${net.subnet||sh.subnet||'—'} |`);
		  if(tags.length){ L.push('\n**Tags**'); L.push(`| Key | Value |\n|-----|-------|`); tags.forEach(([k,v])=>L.push(`| ${k} | ${v} |`)); }
		  if(sh.id) L.push(`\n**Resource ID:** \`${sh.id}\``);
		  L.push('');
		});
	  }
	  if(sec('sessions')&&sessions.length){
		L.push('\n---\n## User Sessions\n');
		L.push('| User | State | Session Host | Host Pool | Connected | Type |');
		L.push('|------|-------|-------------|-----------|-----------|------|');
		sessions.forEach(s=>L.push(`| ${s.userPrincipalName||'Unknown'} | ${s.sessionState||'—'} | ${(s.sessionHostName||'—').split('.')[0]} | ${s.hostPoolName||'—'} | ${s.createTime||'—'} | ${s.applicationType||'Desktop'} |`));
	  }
	  if(sec('rbac')){
		const all=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)].map(a=>({...a,scope:ag.name})));
		if(all.length){
		  L.push('\n---\n## RBAC Assignments\n');
		  L.push('> ⚠ Only AVD-specific roles are shown (Desktop Virtualization & VM Login roles). Subscription-level roles (Owner, Contributor, Reader) are excluded — review Azure RBAC for full inheritance.\n');
		  L.push('| Principal | Type | Role | Scope |'); L.push('|-----------|------|------|-------|');
		  all.forEach(a=>L.push(`| ${a.displayName||a.signInName||a.objectId||'—'} | ${a.objectType||'—'} | ${a.role||'—'} | ${a.scope||'—'} |`));
		}
	  }
	  if(sec('fslogix')){
		const fc=D.fslogixCoverage||{};
		L.push('\n---\n## FSLogix\n');
		L.push(`- **Coverage:** ${fc.coveragePct??'—'}% (${fc.hostsWithFSLogix||0} of ${fc.totalHosts||0} hosts)`);
		if(arr(fc.hostsWithout).length) L.push(`- **Without FSLogix:** ${arr(fc.hostsWithout).join(', ')}`);
		L.push(`\n> ${fc.fslogixCoverageNote||'Detection based on VM extension inventory.'}`);
		const sas=arr(fc.storageAccounts);
		if(sas.length){
		  L.push('\n### Profile Storage Accounts\n');
		  sas.forEach(sa=>{
			L.push(`#### ${sa.storageAccount}`);
			L.push(`- **Resource Group:** ${sa.resourceGroup||'—'} · **Location:** ${sa.location||'—'} · **SKU:** ${sa.sku||'—'}`);
			if(sa.storageAccountUrl) L.push(`- **Storage URL:** ${sa.storageAccountUrl}`);
			const shares=arr(sa.shares);
			if(shares.length){
			  L.push('\n| Share Name | Quota (GiB) | Used (GiB) | Tier | Share URL |');
			  L.push('|------------|-------------|------------|------|-----------|');
			  shares.forEach(sh=>{
				const pct=sh.quotaGiB>0?` (${Math.round((sh.usedGiB/sh.quotaGiB)*100)}%)`:'';
				L.push(`| ${sh.name||'—'} | ${sh.quotaGiB||'No quota'} | ${sh.usedGiB??'—'}${pct} | ${sh.tier||'—'} | ${sh.shareUrl||'—'} |`);
			  });
			}
			L.push('');
		  });
		}
	  }
	  if(sec('cost')&&s.costAvailable){
		L.push('\n---\n## Cost & FinOps\n');
		const proj=costProjection(s.currentMonthCost,D.generatedAt);
		L.push('| Metric | Value |'); L.push('|--------|-------|');
		if(s.previousMonthCost!=null) L.push(`| Previous Month (Final) | ${cur} ${s.previousMonthCost?.toFixed(2)} |`);
		L.push(`| This Month MTD | ${cur} ${s.currentMonthCost?.toFixed(2)??'—'} |`);
		if(proj!=null) L.push(`| Projected End of Month | ${cur} ${proj.toFixed(2)} (estimate) |`);
		if(s.previousMonthCost!=null&&proj!=null){ const d=proj-s.previousMonthCost; const pct=Math.round((d/s.previousMonthCost)*100); L.push(`| Month-on-Month Delta | ${d>=0?'+':''}${cur}${Math.abs(d).toFixed(2)} (${d>=0?'+':''}${pct}%) |`); }
		if(s.costPerSession) L.push(`| Cost / Session | ${cur} ${s.costPerSession} |`);
		if(s.costPerUser) L.push(`| Cost / User | ${cur} ${s.costPerUser} |`);
		if(s.wastedSpendEstimate) L.push(`| Wasted Spend | ${cur} ${s.wastedSpendEstimate} (${s.wastedSpendHosts||0} hosts) |`);
		const hpCosts=hps.filter(hp=>hp.currentMonthCost!=null).sort((a,b)=>b.currentMonthCost-a.currentMonthCost);
		if(hpCosts.length){ L.push('\n| Host Pool | Cost MTD |'); L.push('|-----------|----------|'); hpCosts.forEach(hp=>L.push(`| ${hp.name} | ${cur} ${hp.currentMonthCost?.toFixed(2)} |`)); }
	  }
	  // ── Appendix: RG Inventory (always appended if data exists) ──
	  const rgsData=arr(D.resourceGroups).filter(rg=>rg!=null);
	  if(rgsData.length&&sec('rginventory')){
		L.push('\n---\n## Appendix A — Resource Group Inventory\n');
		L.push(`> All Azure resources in the ${rgsData.length} resource group${rgsData.length!==1?'s':''} associated with this AVD environment.`);
		rgsData.forEach(rg=>{
		  const res=arr(rg.resources);
		  L.push(`\n### ${rg.name} (${rg.resourceCount||res.length} resources · ${rg.location||'—'})`);
		  if(Object.keys(rg.tags||{}).length) L.push(`**Tags:** ${Object.entries(rg.tags).map(([k,v])=>k+': '+v).join(' · ')}`);
		  L.push('\n| Resource | Type | Location |');
		  L.push('|----------|------|----------|');
		  res.forEach(r=>L.push(`| ${r.name} | ${r.shortType} | ${r.location||'—'} |`));
		});
	  }

	  if(sec('intelligence')){ const met=D.metrics||{}; if(met.querySupported){
		L.push('\n---\n## KQL Analytics\n');
		L.push(`- **Window:** ${met.timespanDays||7}d · **Success Rate:** ${met.connectionSuccessRate!=null?met.connectionSuccessRate+'%':'—'}`);
		L.push(`- **Avg Session Duration:** ${(()=>{const v=met.sessionDurationAvgMin?.avg??met.sessionDurationAvgMin;return(v!=null&&!isNaN(Number(v)))?Math.round(Number(v))+' min':'—'})()}`);
	  }}
	  L.push('\n---');
	  // Markdown format gets a plain text footer; HTML/PDF get the styled footer div injected by rbBuildHTMLDoc
	  if(rbState.format==='markdown'){
		L.push(`\n*Generated by YGIT AVD Intelligence v5.0 · ${now.toLocaleString()}*`);
	  }
	  return L.join('\n');
	}


	
	// ── HTML document builder ─────────────────────────────────────────
	function buildHTMLDoc(){ return rbBuildHTMLDoc(); }
	function rbBuildHTMLDoc(){
	  // ── Metadata ──────────────────────────────────────────────────
	  const client  = rbMeta('rb-client') || D?.subscriptionName || '—';
	  const envName = rbMeta('rb-env')    || D?.subscriptionName || '—';
	  const author  = rbMeta('rb-author') || 'YGIT';
	  const version = rbMeta('rb-version')|| 'v1.0';
	  const docDate = rbMeta('rb-date')   || new Date().toLocaleDateString('en-AU');
	  const scope   = rbMeta('rb-scope');
	  const notes   = rbMeta('rb-notes');
	  const logoUrl = rbGetLogoSrc();
	  const sub     = D?.subscriptionName||D?.subscriptionId||'—';
	  const now      = new Date().toLocaleString();
	  const dataDate = D?.generatedAt ? new Date(D.generatedAt).toLocaleString() : '—';
	  const s       = D?.summary||{};
	  const hps     = arr(D?.hostPools);
	  const ags     = arr(D?.applicationGroups);
	  const shs     = arr(D?.sessionHosts).length ? arr(D?.sessionHosts) : hps.flatMap(hp=>arr(hp.sessionHosts));
	  const sessions= arr(D?.sessions).length ? arr(D?.sessions) : hps.flatMap(hp=>arr(hp.sessionHosts).flatMap(sh=>arr(sh.sessions)));
	  const cur     = s.currency||'';
	  const sec     = id => rbState.sections.has(id);
	  const isLive        = D?.displayConfig?.isLiveMode===true;
	  const shutdownHosts = s.shutdownHosts||0;
	  const activeHosts   = (s.totalSessionHosts||0) - shutdownHosts;
	  const prodHps       = hps.filter(hp=>!/uat|dev|test/i.test(hp.name||''));
	  const prodPoolsWithoutScaling = prodHps.filter(hp=>!hp.hasScalingPlan).length;
	  const diagNote      = hps.length>prodHps.length?` (${hps.length-prodHps.length} non-prod excluded)`:'';

	  // ── RDP Reference table (inline — same data for PS1 and API) ────
	  const RDP_REF = {
		'enablerdsaadauth':       {rec:'1',   label:'Entra ID Auth',        cat:'Authentication'},
		'targetisaadjoined':      {rec:'1',   label:'Entra Joined Target',  cat:'Authentication'},
		'redirectwebauthn':       {rec:'1',   label:'WebAuthn/FIDO2',       cat:'Authentication'},
		'use multimon':           {rec:'1',   label:'Multi-Monitor',        cat:'Display'},
		'dynamic resolution':     {rec:'1',   label:'Dynamic Resolution',   cat:'Display'},
		'screen mode id':         {rec:'2',   label:'Screen Mode',          cat:'Display'},
		'session bpp':            {rec:'32',  label:'Colour Depth',         cat:'Display'},
		'audiomode':              {rec:'0',   label:'Audio Playback',       cat:'Audio/Video'},
		'audiocapturemode':       {rec:'1',   label:'Microphone',           cat:'Audio/Video'},
		'videoplaybackmode':      {rec:'1',   label:'Video/MMR',            cat:'Audio/Video'},
		'camerastoredirect':      {rec:'s:',  label:'Camera Redirect',      cat:'Devices'},
		'redirectclipboard':      {rec:'1',   label:'Clipboard',            cat:'Devices'},
		'redirectprinters':       {rec:'1',   label:'Printers',             cat:'Devices'},
		'redirectsmartcards':     {rec:'1',   label:'Smart Cards',          cat:'Devices'},
		'drivestoredirect':       {rec:'s:',  label:'Drive Redirect',       cat:'Devices'},
		'devicestoredirect':      {rec:'s:',  label:'PnP Devices',          cat:'Devices'},
		'usbdevicestoredirect':   {rec:'s:',  label:'USB Devices',          cat:'Devices'},
		'redirectcomports':       {rec:'0',   label:'COM Ports',            cat:'Devices'},
		'bandwidthautodetect':    {rec:'1',   label:'Bandwidth Detect',     cat:'Connection'},
		'networkautodetect':      {rec:'1',   label:'Network Detect',       cat:'Connection'},
		'autoreconnection enabled':{rec:'1',  label:'Auto Reconnect',       cat:'Connection'},
		'compression':            {rec:'1',   label:'Compression',          cat:'Connection'},
		'connection type':        {rec:'7',   label:'Connection Type',      cat:'Connection'},
		'disableconnectionsharing':{rec:'0',  label:'Session Sharing',      cat:'Connection'},
	  };
	  function rdpCompliance(key, val){
		const ref=RDP_REF[key]; if(!ref) return 'unknown';
		if(val===undefined||val===null||val==='not set'||val==='') return 'not-configured';
		return String(val)===String(ref.rec)?'compliant':'review';
	  }
	  const allFindings = hps.flatMap(hp=>arr(hp.securityFindings));
	  const critF   = allFindings.filter(f=>f.severity==='Critical').length;
	  const highF   = allFindings.filter(f=>f.severity==='High').length;
	  const medF    = allFindings.filter(f=>f.severity==='Medium').length;
	  const proj    = costProjection(s.currentMonthCost, D?.generatedAt);

	  // ── Helper renderers ──────────────────────────────────────────
	  function kpiBox(label, value, sub2, colour){
		const cols = {'cyan':'#00a8cc','green':'#059669','red':'#dc2626','amber':'#d97706','purple':'#7c3aed','blue':'#2563eb','gray':'#6b7280'};
		const c = cols[colour]||cols.cyan;
		return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${c};border-radius:6px;padding:12px 14px;min-width:120px;flex:1">
		  <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:4px">${label}</div>
		  <div style="font-size:22px;font-weight:700;color:${c};font-family:'Segoe UI',sans-serif;line-height:1">${value||'—'}</div>
		  ${sub2?`<div style="font-size:10px;color:#94a3b8;margin-top:3px">${sub2}</div>`:''}
		</div>`;
	  }
	  function kpiRow(...boxes){ return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px">${boxes.join('')}</div>`; }

	  function sectionHeader(num, icon, title, sub2, anchorId){
		const idAttr=anchorId?` id="${anchorId}"`:''; 
		return `<div${idAttr} style="margin:32px 0 16px;padding-bottom:10px;border-bottom:2px solid #00a8cc">
		  <div style="display:flex;align-items:center;gap:10px">
			<span style="font-family:'Courier New',monospace;font-size:11px;color:#00a8cc;font-weight:700">${String(num).padStart(2,'0')}</span>
			<span style="font-size:18px">${icon}</span>
			<span style="font-family:'Segoe UI',sans-serif;font-size:18px;font-weight:700;color:#0d1117">${title}</span>
			${sub2?`<span style="font-family:'Courier New',monospace;font-size:10px;color:#94a3b8;margin-left:auto">${sub2}</span>`:''}
		  </div>
		</div>`;
	  }

	  function kvLine(label, value){ return `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b;white-space:nowrap">${esc(label)}</span><span style="text-align:right;word-break:break-all">${value}</span></div>`; }

	  function docTable(headers, rows, opts){
		const colWidths = opts?.colWidths||[];
		const ths = headers.map((h,i)=>`<th style="${colWidths[i]?'width:'+colWidths[i]+';':''}">${h}</th>`).join('');
		const trs = rows.map((row,ri)=>{
		  const bg = ri%2===0?'':'background:#f8fafc;';
		  const tds = row.map((cell,ci)=>{
			const align = opts?.align?.[ci]||'left';
			return `<td style="text-align:${align}">${cell||'—'}</td>`;
		  }).join('');
		  return `<tr style="${bg}">${tds}</tr>`;
		}).join('');
		return `<table>${trs?`<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>`:''}</table>`;
	  }

	  function pill(text, colour){
		const cols={green:['#d1fae5','#059669'],red:['#fee2e2','#dc2626'],amber:['#fef3c7','#d97706'],cyan:['#e0f9ff','#00a8cc'],purple:['#ede9fe','#7c3aed'],blue:['#dbeafe','#2563eb'],gray:['#f1f5f9','#64748b']};
		const [bg,fg]=cols[colour]||cols.gray;
		return `<span style="display:inline-block;background:${bg};color:${fg};border-radius:3px;padding:1px 7px;font-family:'Courier New',monospace;font-size:10px;font-weight:600">${text}</span>`;
	  }

	  function statusPillDoc(status){
		const m={Available:'green',Unavailable:'red',NeedsAssistance:'amber',Shutdown:'gray',Disconnected:'amber',Active:'green',Disconnected_sess:'amber'};
		return pill(status, m[status]||'gray');
	  }

	  function findingBlock(severity, text){
		const advisoryPatterns=['no private endpoint','host pool health','no scaling plan'];
		const isAdvisory=advisoryPatterns.some(function(p){ return text.toLowerCase().includes(p); });
		const dispSev=isAdvisory?'Advisory':severity;
		const cols={Critical:['#fee2e2','#dc2626'],High:['#ffedd5','#ea580c'],Medium:['#fef9c3','#ca8a04'],Low:['#f1f5f9','#64748b'],Advisory:['#f8fafc','#94a3b8']};
		const c=cols[dispSev]||cols.Low;
		const bg=c[0], border=c[1];
		return '<div style="background:'+bg+';border-left:4px solid '+border+';border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:6px;font-size:11px">'
		  +'<span style="font-family:monospace;font-size:9px;font-weight:700;color:'+border+';letter-spacing:1px;margin-right:8px">'+dispSev.toUpperCase()+'</span>'
		  +'<span style="color:#1a2030">'+text+'</span>'
		  +'</div>';
	  }

	  function healthBar(pct){
		const colour = pct>=80?'#059669':pct>=60?'#d97706':'#dc2626';
		return `<div style="display:flex;align-items:center;gap:8px">
		  <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">
			<div style="width:${pct}%;height:100%;background:${colour};border-radius:3px"></div>
		  </div>
		  <span style="font-family:'Courier New',monospace;font-size:10px;color:${colour};font-weight:700;width:36px">${pct}%</span>
		</div>`;
	  }

	  // ── Sections accumulator ──────────────────────────────────────
	  const allRecsCount=(()=>{
		let c=0;
		hps.forEach(hp=>c+=arr(hp.securityFindings).filter(f=>!f.finding||!f.finding.toLowerCase().includes('diagnostic')).length);
		arr(D?.networking?.networkSecurityGroups).forEach(n=>c+=arr(n.securityFindings).length);
		if(arr(D?.fslogixCoverage?.hostsWithout).length) c++;
		hps.filter(hp=>!hp.privateEndpointEnabled&&!hp.isValidationEnv).forEach(hp=>{
		  const alreadyFlagged = arr(hp.securityFindings).some(f=>f.finding&&f.finding.toLowerCase().includes('private endpoint'));
		  if(!alreadyFlagged) c++;
		});
		Object.values(D?.imageDrift||{}).forEach(d=>{if(d.driftDetected)c++;});
		c+=getInsightsSummary(hps).details.filter(r=>!r.complete).length;
		if(s.wastedSpendEstimate>0) c++;
		return c;
	  })();
	  const sections = [];
	  let secNum = 1;

	  // ── 1. EXECUTIVE SUMMARY (always) ─────────────────────────────
	  {
		const proj2 = costProjection(s.currentMonthCost, D?.generatedAt);
		const dataCollected = D?.generatedAt ? new Date(D.generatedAt).toLocaleDateString('en-AU') : docDate;

		// 6 executive summary options — [client], [date], [engineer] auto-substituted
		// Read exec text from editable textarea (engineer may have edited it)
		const execTextRaw = (document.getElementById('rb-exec-text')?.value||'').trim();
		let execProse = execTextRaw
		  .replace(/\[client\]/g, esc(client))
		  .replace(/\[date\]/g, dataCollected)
		  .replace(/\[engineer\]/g, esc(author))
		  .split('\n\n').map(p=>esc(p)).join('<br><br>');

		// Cost block — prose only, no KPI cards
		if(s.costAvailable && s.currentMonthCost!=null){
		  execProse += '<br><br>';
		  if(s.previousMonthCost!=null){
			execProse += 'Previous month AVD spend was <strong>'+cur+' '+s.previousMonthCost.toFixed(2)+'</strong>. ';
		  }
		  execProse += 'Month-to-date AVD spend is <strong>'+cur+' '+s.currentMonthCost.toFixed(2)+'</strong>';
		  if(proj2) execProse += ', tracking to approximately <strong>'+cur+' '+proj2.toFixed(2)+'</strong> by end of month';
		  if(s.costPerSession) execProse += '. Cost per active session is <strong>'+cur+' '+s.costPerSession+'</strong>';
		  execProse += '.';
		}

		// Findings reference — single sentence only
		if(allRecsCount>0 && document.getElementById('rb-findings-sentence')?.checked!==false){
		  execProse += '<br><br>'+allRecsCount+' configuration finding'+(allRecsCount!==1?'s were':' was')+' identified during this assessment — see the <em>Configuration Findings</em> section for details.';
		}

		// Scope
		if(scope) execProse += '<br><br><strong>Scope:</strong> '+esc(scope);

		// Closing paragraph
		const closingParaEl = document.getElementById('rb-closing-para');
		const showClosingPara = !closingParaEl || closingParaEl.checked;
		const closingParaHtml = showClosingPara
		  ? '<p style="font-size:12px;line-height:1.9;color:#1e293b;margin-top:16px">The Azure Virtual Desktop environment described in this document is operating as a stable and supported service, with monitoring and governance controls in place. As usage patterns evolve, the platform is intended to be continuously reviewed and optimised based on operational data, rather than treated as a fixed, point&#8209;in&#8209;time deployment.</p>'
		  : '';

		// Disclaimer
		const disclaimerEl = document.getElementById('rb-disclaimer');
		const showDisclaimer = !disclaimerEl || disclaimerEl.checked;
		const disclaimerHtml = showDisclaimer
		  ? '<p style="font-size:10px;color:#64748b;font-style:italic;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:16px">This document reflects the environment and observed behaviour at the time of review and is intended for informational and operational reference purposes.</p>'
		  : '';

		sections.push(
		  sectionHeader(secNum++, '📋', 'Executive Summary', undefined, 'sec-exec') +
		  '<p style="font-size:12px;line-height:1.9;color:#1e293b;margin-bottom:16px">'+execProse+'</p>' +
		  closingParaHtml +
		  disclaimerHtml
		);
	  }

	  // ── 1b. KEY FINDINGS (optional) ────────────────────────────────
	  const kfText = (document.getElementById('rb-kf-text')?.value||'').trim();
	  if(kfText){
		sections.push(
		  sectionHeader(secNum++, '🔍', 'Key Findings', undefined, 'sec-keyfindings') +
		  kfText.split('\n\n').map(p=>'<p style="font-size:12px;line-height:1.9;color:#1e293b;margin-bottom:12px">'+esc(p)+'</p>').join('')
		);
	  }

	  // ── 1c. FUTURE IMPROVEMENTS (optional) ─────────────────────────
	  const fiText = (document.getElementById('rb-fi-text')?.value||'').trim();
	  if(fiText){
		sections.push(
		  sectionHeader(secNum++, '🚀', 'Future Improvements', undefined, 'sec-futureimprovements') +
		  fiText.split('\n\n').map(p=>'<p style="font-size:12px;line-height:1.9;color:#1e293b;margin-bottom:12px">'+esc(p)+'</p>').join('')
		);
	  }


	   // ── 2. OVERVIEW ────────────────────────────────────────────────
	  if(sec('overview')){
		const isLive = D?.displayConfig?.isLiveMode===true;
		let ovHtml = sectionHeader(secNum++, '⬛', 'Infrastructure Overview', `${D?.subscriptionName||sub}`, 'sec-overview', `${D?.subscriptionName||sub}`);

		if(isLive){
		  const shs=arr(D?.sessionHosts).length?arr(D?.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
		  const availSHs  =shs.filter(sh=>sh.status==='Available').length;
		  const unavailSHs=shs.filter(sh=>sh.status==='Unavailable').length;
		  const shutdownSHs=shs.filter(sh=>sh.status==='Shutdown').length;
		  const drainSHs  =shs.filter(sh=>sh.drainMode).length;
		  const liveAgs=arr(D?.applicationGroups);
		  const liveAssignees=liveAgs.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)]);
		  const liveApps=liveAgs.filter(ag=>ag.applicationGroupType==='RemoteApp').flatMap(ag=>arr(ag.remoteApps)).length;
		  const liveDesktops=liveAgs.filter(ag=>ag.applicationGroupType==='Desktop').length;
		  ovHtml += kpiRow(
			kpiBox('Host Pools', s.hostPoolCount||0, `${s.pooledHostPools||0} pooled · ${s.personalHostPools||0} personal`, 'cyan'),
			kpiBox('Workspaces', s.avdWorkspaceCount||0, '', 'blue'),
			kpiBox('Session Hosts', s.totalSessionHosts||0, `${s.availableHosts||0} available`, 'green'),
			kpiBox('Session Desktops', liveDesktops, 'desktop app groups', 'blue'),		
			kpiBox('Active Sessions', s.totalActiveSessions||0, `${s.totalDisconnectedSessions||0} disconnected`, 'green')
			
		  );
		  ovHtml += kpiRow(
			kpiBox('Application Groups', s.applicationGroupCount||0, '', 'cyan'),        
			kpiBox('Resource Groups', arr(D?.resourceGroups).length, '', 'blue'),
			kpiBox('Applications', liveApps, 'published RemoteApps', 'cyan'),
			kpiBox('Scaling Plans', s.scalingPlanCount||0, `${s.hostPoolsWithoutScaling||0} without`, (s.hostPoolsWithoutScaling||0)>0?'amber':'green'),
			kpiBox('RBAC Assignments', liveAssignees.length, `${liveAssignees.filter(a=>a.objectType==='Group').length} groups`, 'cyan')
		  );
		  
		  ovHtml += docTable(
			['Session Host Status','Count'],
			[['Available',availSHs],['Unavailable',unavailSHs],['Shutdown',shutdownSHs],['Drain Mode',drainSHs]],
			{colWidths:['60%','40%']}
		  );
		} else {
		  ovHtml += kpiRow(
			//kpiBox('Application Groups', s.applicationGroupCount||0, '', 'cyan'),
			//kpiBox('Scaling Plans', s.scalingPlanCount||0, `${s.hostPoolsWithoutScaling||0} without`, (s.hostPoolsWithoutScaling||0)>0?'amber':'green'),
			//kpiBox('Workspaces', s.avdWorkspaceCount||0, '', 'blue'),
			//kpiBox('FSLogix Coverage', (s.hostsWithFSLogixDetected||0)+'/'+s.totalSessionHosts, '', s.hostsWithFSLogixDetected===s.totalSessionHosts?'green':'amber')
			kpiBox('Host Pools', s.hostPoolCount||0, `${s.pooledHostPools||0} pooled · ${s.personalHostPools||0} personal`, 'cyan'),
			kpiBox('Workspaces', s.avdWorkspaceCount||0, '', 'blue'),
			kpiBox('Session Hosts', s.totalSessionHosts||0, `${s.availableHosts||0} available · ${shutdownHosts} powered off`, activeHosts>0&&(s.availableHosts||0)===activeHosts?'green':'amber'),
			kpiBox('Active Sessions', s.totalActiveSessions||0, `${s.totalDisconnectedSessions||0} disconnected`, 'green')
		  );
		  
		  ovHtml += kpiRow(
			kpiBox('Application Groups', s.applicationGroupCount||0, '', 'cyan'),        
			kpiBox('Resource Groups', arr(D?.resourceGroups).length, '', 'blue'),
			//kpiBox('Applications', liveApps, 'published RemoteApps', 'cyan'),
			kpiBox('Scaling Plans', s.scalingPlanCount||0, `${prodPoolsWithoutScaling} prod pools without`, prodPoolsWithoutScaling>0?'amber':'green')
			//kpiBox('Group Assignments', groups, 'best practice', 'green')
			//kpiBox('RBAC Assignments', liveAssignees.length, `${liveAssignees.filter(a=>a.objectType==='Group').length} groups`, 'cyan')
		  );
		  
		  const insightsSumm=getInsightsSummary(prodHps);
		  if(insightsSumm.total>0){
			const iCol=insightsSumm.complete===insightsSumm.total?'green':insightsSumm.disabled===insightsSumm.total?'red':'amber';
			ovHtml += kpiRow(
			  kpiBox('AVD Diagnostics', insightsSumm.complete+'/'+insightsSumm.total, insightsSumm.complete===insightsSumm.total?'All complete':'Gaps detected', iCol),
			  kpiBox('Full Coverage', insightsSumm.complete, 'all 6 categories enabled', insightsSumm.complete===insightsSumm.total?'green':'amber'),
			  kpiBox('Partial', insightsSumm.partial, 'missing categories', insightsSumm.partial>0?'amber':'green'),
			  kpiBox('Unconfigured', insightsSumm.disabled, 'no diagnostics at all', insightsSumm.disabled>0?'red':'green')
			);
			if(insightsSumm.complete<insightsSumm.total){
			  ovHtml += '<div style="margin-top:10px">';
			  insightsSumm.details.filter(r=>!r.complete).forEach(r=>{
				const bc=r.enabled?'#fef9c3':'#fee2e2', bc2=r.enabled?'#ca8a04':'#dc2626';
				ovHtml += '<div style="background:'+bc+';border-left:4px solid '+bc2+';border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:6px;font-size:11px">'
				  +'<strong style="color:'+bc2+'">'+esc(r.name)+'</strong> — '
				  +(r.enabled
					? 'Diagnostics configured but missing: <code style="font-size:9px;background:#fef3c7;padding:1px 4px;border-radius:2px">'+r.missing.join('</code>, <code style="font-size:9px;background:#fef3c7;padding:1px 4px;border-radius:2px">')+'</code>. Some AVD Insights queries will not return data.'
					: 'No diagnostic settings — AVD Insights is non-functional for this host pool. Configure diagnostics to enable monitoring.'
				  )+'</div>';
			  });
			  ovHtml += '</div>';
			}
		  }
		  
		  ovHtml += docTable(
			['Property','Value'],
			[
			  ['Subscription', sub],
			  ['Tenant', D?.tenantName||D?.tenantId||'—'],
			  ['Data Collected', D?.generatedAt?(new Date(D.generatedAt).toLocaleString()):'—'],
			  ['Schema Version', D?.schemaVersion||'—'],
			  ['Diagnostics Coverage', `${prodHps.filter(hp=>hp.diagnosticsEnabled).length} of ${prodHps.length} prod host pools${diagNote}`],
			  ['Session Detail Collected', s.sessionDetailCollected?'Yes':'No'],
			],
			{colWidths:['35%','65%']}
		  );
		  if(allFindings.length){
			ovHtml += '<p style="font-size:11px;color:#475569;margin-top:12px">'+allFindings.length+' configuration finding'+(allFindings.length!==1?'s':'')+' identified — see <em>Configuration Findings</em> section for details.</p>';
		  }
		}
		sections.push(ovHtml);
	  }

	  // ── 3. HOST POOLS ──────────────────────────────────────────────
	  if(sec('hostpools') && hps.length){
		let hpHtml = sectionHeader(secNum++, '🖥', 'Host Pools', `${hps.length} pool${hps.length!==1?'s':''}`, 'sec-hostpools', `${hps.length} pool${hps.length!==1?'s':''}`);
		hpHtml += kpiRow(
		  kpiBox('Total Pools', hps.length, `${s.pooledHostPools||0} pooled`, 'cyan'),
		  kpiBox('Total Capacity', hps.reduce((a,hp)=>a+(hp.totalCapacity||0),0), 'max sessions', 'blue'),
		  kpiBox('Active Sessions', s.totalActiveSessions||0, 'across all pools', 'green'),
		  kpiBox('Drain Mode', s.drainModeHosts||0, 'hosts blocked', (s.drainModeHosts||0)>0?'amber':'green')
		);
		hps.forEach(hp=>{
		  const hpF=arr(hp.securityFindings);
		  hpHtml += `<div style="margin:16px 0 8px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-left:4px solid #00a8cc">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
			  <span style="font-size:16px">🖥</span>
			  <span style="font-family:'Segoe UI',sans-serif;font-weight:700;font-size:14px;color:#0d1117">${esc(hp.name)}</span>
			  ${pill(hp.hostPoolType||'Pooled', hp.hostPoolType==='Pooled'?'cyan':'purple')}
			  ${hp.isValidationEnv?pill('Validation','amber'):''}
			  <span style="margin-left:auto">${healthBar(hp.healthPct||0)}</span>
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;color:#475569">
			  ${hp.friendlyName&&hp.friendlyName!==hp.name?`<div style="grid-column:1/-1"><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">FRIENDLY NAME</span><br>${esc(hp.friendlyName)}</div>`:''}
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">RESOURCE GROUP</span><br>${esc(hp.resourceGroup||'—')}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">LOCATION</span><br>${esc(hp.location||'—')}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">LOAD BALANCER</span><br>${esc(hp.loadBalancerType||'—')}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">MAX SESSIONS</span><br>${esc(hp.maxSessionLimit||'—')}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">START VM ON CONNECT</span><br>${hp.startVMOnConnect?'<span style="color:#059669">Enabled</span>':'Disabled'}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">PUBLIC NETWORK</span><br>${hp.publicNetworkAccess===false?'<span style="color:#d97706">Private Only</span>':'Enabled'}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">PREFERRED APP TYPE</span><br>${esc(hp.preferredAppGroupType||'—')}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">DIAGNOSTICS</span><br>${hp.diagnosticsEnabled?'<span style="color:#059669">Enabled</span>':'<span style="color:#d97706">Not Configured</span>'}</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">ACTIVE SESSIONS</span><br><strong>${hp.activeSessions||0}</strong> active · ${hp.disconnectedSessions||0} disconnected</div>
			  <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">SCALING PLAN</span><br>${arr(hp.scalingPlans).map(sp=>esc(sp.name)).join(', ')||'<span style="color:#d97706">None assigned</span>'}</div>
			  ${hp.description?`<div style="grid-column:1/-1"><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">DESCRIPTION</span><br>${esc(hp.description)}</div>`:''}
			  ${Object.keys(hp.tags||{}).length?`<div style="grid-column:1/-1"><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">TAGS</span><br>${Object.entries(hp.tags).map(([k,v])=>`<code style="background:#e2e8f0;padding:1px 5px;border-radius:2px;font-size:9px">${esc(k)}: ${esc(v)}</code>`).join(' ')}</div>`:''}
			  <div style="grid-column:1/-1"><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">RESOURCE ID</span><br><code style="font-size:9px;color:#0055aa;word-break:break-all">${esc(hp.id||'—')}</code></div>
			</div>
			${hpF.length?`<div style="margin-top:8px;font-family:'Courier New',monospace;font-size:9px;color:#d97706">⚠ ${hpF.length} finding${hpF.length!==1?'s':''} — see Recommendations section</div>`:''}
		  </div>`;
		});
		sections.push(hpHtml);
	  }

	  // ── 4. SCALING PLANS ──────────────────────────────────────────
	  if(sec('scaling') && arr(D?.scalingPlans).length){
		const sps=arr(D.scalingPlans);
		let spHtml = sectionHeader(secNum++, '⚖', 'Scaling Plans', `${sps.length} plan${sps.length!==1?'s':''}`, 'sec-scaling', `${sps.length} plan${sps.length!==1?'s':''}`);
		sps.forEach(sp=>{
		  const spTags=Object.entries(sp.tags||{});
		  const spHPs=arr(sp.hostPoolReferences).map(r=>r.hostPoolId.split('/').pop()).filter(Boolean);
		  spHtml += `<div style="margin-bottom:16px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px"><p style="font-weight:700;font-size:13px;color:#0d1117;margin-bottom:2px">${esc(sp.name)} <span style="font-size:10px;color:#94a3b8;font-weight:400">· ${esc(sp.hostPoolType||'—')}</span></p>
			<div style="font-size:11px;color:#475569;margin-bottom:6px">${esc(sp.resourceGroup||'—')} · ${esc(sp.location||'—')}${spTags.length?' · '+spTags.map(([k,v])=>`<code style="background:#e2e8f0;padding:1px 4px;border-radius:2px;font-size:9px">${esc(k)}: ${esc(v)}</code>`).join(' '):''}</div>
			${spHPs.length?`<div style="margin-bottom:6px;font-size:11px"><span style="color:#64748b">Host Pool${spHPs.length!==1?'s':''}:</span> ${spHPs.map(n=>`<span style="background:#e0f9ff;color:#00a8cc;border-radius:3px;padding:1px 7px;font-size:10px;font-family:'Courier New',monospace">${esc(n)}</span>`).join(' ')}</div>`:''}
			${sp.id?`<div style="font-size:9px;color:#94a3b8;margin-top:4px">Resource ID: <code style="font-size:9px;color:#475569">${esc(sp.id)}</code></div>`:''}`;
		  arr(sp.schedules).forEach(sc=>{
			spHtml += `<p style="font-size:11px;color:#475569;margin-bottom:4px;font-weight:600">${esc(sc.name)} — ${arr(sc.daysOfWeek).join(', ')||'—'}</p>`;
			spHtml += docTable(
			  ['Phase','Start Time','Algorithm','Min Hosts','Capacity Threshold'],
			  [
				['Ramp-Up', sc.rampUpStartTime||'—', sc.rampUpLoadAlgorithm||'—', (sc.rampUpMinimumHostsPct??'—')+'%', (sc.rampUpCapacityThresholdPct??'—')+'%'],
				['Peak',     sc.peakStartTime||'—',     sc.peakLoadAlgorithm||'—',     '—','—'],
				['Ramp-Down',sc.rampDownStartTime||'—', sc.rampDownLoadAlgorithm||'—', (sc.rampDownMinimumHostsPct??'—')+'%','—'],
				['Off-Peak', sc.offPeakStartTime||'—',  sc.offPeakLoadAlgorithm||'—',  '—','—'],
			  ]
			);
			if(sc.rampDownNotificationMessage) spHtml += `<p style="font-size:10px;color:#64748b;font-style:italic;margin:4px 0 10px">Notification: ${esc(sc.rampDownNotificationMessage)}</p>`;
		  });
		  spHtml += '</div>';
		});
		sections.push(spHtml);
	  }

	  // ── 5. WORKSPACES ─────────────────────────────────────────────
	  if(sec('workspaces') && arr(D?.avdWorkspaces).length){
		const wss=arr(D.avdWorkspaces);
		let wsHtml = sectionHeader(secNum++, '⊞', 'Workspaces', `${wss.length} workspace${wss.length!==1?'s':''}`, 'sec-workspaces', `${wss.length} workspace${wss.length!==1?'s':''}`);
		wss.forEach(ws=>{
		  const wsAgs=ags.filter(ag=>ag.workspaceId===ws.id||ag.workspaceName===ws.name);
		  wsHtml+=`<div style="margin-bottom:14px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
			  <span style="font-weight:700;font-size:13px">${esc(ws.name)}</span>
			  ${ws.friendlyName&&ws.friendlyName!==ws.name?`<span style="font-size:11px;color:#64748b">${esc(ws.friendlyName)}</span>`:''}
			  ${ws.diagnosticsEnabled?pill('Diagnostics','green'):pill('No Diagnostics','amber')}
			  <span style="font-size:11px;color:#94a3b8;margin-left:auto">${wsAgs.length} app group${wsAgs.length!==1?'s':''}</span>
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;margin-bottom:8px">
			  <span><b>Resource Group:</b> ${esc(ws.resourceGroup||'—')}</span>
			  <span><b>Location:</b> ${esc(ws.location||'—')}</span>
			  ${ws.description?`<span style="grid-column:1/-1"><b>Description:</b> ${esc(ws.description)}</span>`:''}
			  ${Object.keys(ws.tags||{}).length?`<span style="grid-column:1/-1"><b>Tags:</b> ${Object.entries(ws.tags).map(([k,v])=>`<code style="background:#e2e8f0;padding:1px 4px;border-radius:2px;font-size:9px">${esc(k)}: ${esc(v)}</code>`).join(' ')}</span>`:''}
			  <span style="grid-column:1/-1"><b>Resource ID:</b> <code style="font-size:9px;color:#0055aa">${esc(ws.id||'—')}</code></span>
			</div>
			${wsAgs.length?docTable(['App Group','Type','Host Pool'],wsAgs.map(ag=>[esc(ag.name||'—'),pill(ag.applicationGroupType||'—',ag.applicationGroupType==='Desktop'?'blue':'purple'),esc(ag.hostPoolName||'—')])):''}
		  </div>`;
		});
		sections.push(wsHtml);
	  }

	  // ── 6. APP GROUPS ─────────────────────────────────────────────
	  if(sec('appgroups') && ags.length){
		let agHtml = sectionHeader(secNum++, '⊡', 'Application Groups', `${ags.length} group${ags.length!==1?'s':''}`, 'sec-appgroups', `${ags.length} group${ags.length!==1?'s':''}`);
		ags.forEach(ag=>{
		  const allA=[...arr(ag.assignedUsers),...arr(ag.assignedGroups)];
		  const stdRole='Desktop Virtualization User';
		  agHtml += `<div style="margin-bottom:14px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
			  <span style="font-weight:700;font-size:13px">${esc(ag.name)}</span>
			  ${pill(ag.applicationGroupType||'Desktop', ag.applicationGroupType==='Desktop'?'blue':'purple')}
			  ${ag.diagnosticsEnabled?pill('Diagnostics On','green'):pill('No Diagnostics','amber')}
			  <span style="font-size:11px;color:#94a3b8;margin-left:auto">${ag.totalAssignees||0} assigned</span>
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;margin-bottom:8px">
			  <span><b>Host Pool:</b> ${esc(ag.hostPoolName||'—')}</span>
			  <span><b>Workspace:</b> ${esc(ag.workspaceFriendlyName||ag.workspaceName||'—')}</span>
			  <span><b>Resource Group:</b> ${esc(ag.resourceGroup||'—')}</span>
			  <span><b>Location:</b> ${esc(ag.location||'—')}</span>
			  ${ag.friendlyName&&ag.friendlyName!==ag.name?`<span><b>Friendly Name:</b> ${esc(ag.friendlyName)}</span>`:''}
			  ${ag.description?`<span style="grid-column:1/-1"><b>Description:</b> ${esc(ag.description)}</span>`:''}
			  ${Object.keys(ag.tags||{}).length?`<span style="grid-column:1/-1"><b>Tags:</b> ${Object.entries(ag.tags).map(([k,v])=>`<code style="background:#e2e8f0;padding:1px 4px;border-radius:2px;font-size:9px">${esc(k)}: ${esc(v)}</code>`).join(' ')}</span>`:''}
			</div>
			${allA.length?docTable(['Principal','Type'],allA.map(a=>{const nonStd=a.role&&a.role!==stdRole?` <span style="background:#fef3c7;color:#92400e;font-size:9px;padding:1px 4px;border-radius:3px">${esc(a.role)}</span>`:'';return[esc(a.displayName||a.signInName||a.objectId||'—')+nonStd,pill(a.objectType||'—',a.objectType==='Group'?'cyan':'gray')];})):'<p style="font-size:11px;color:#94a3b8">No assignments</p>'}
			${ag.applicationGroupType==='RemoteApp'&&arr(ag.remoteApps).length?'<p style="font-size:10px;color:#64748b;margin-top:6px">Apps: '+arr(ag.remoteApps).map(a=>`<code style="background:#e2e8f0;padding:1px 5px;border-radius:2px;font-size:10px">${esc(a.friendlyName||a.name||'—')}</code>`).join(' ')+'</p>':''}
		  </div>`;
		});
		sections.push(agHtml);
	  }

	  // ── 6b. APPLICATIONS (Published RemoteApps) ─────────────────
	  if(sec('applications')){
		const allApps=ags.filter(g=>g.applicationGroupType==='RemoteApp').flatMap(g=>arr(g.remoteApps).map(a=>({...a,agName:g.name,agHostPool:g.hostPoolName})));
		if(allApps.length){
		  let appsHtml = sectionHeader(secNum++, '🚀', 'Published Applications', `${allApps.length} app${allApps.length!==1?'s':''}`, 'sec-applications');
		  appsHtml += docTable(
			['Application','Friendly Name','App Group','File Path','Visibility'],
			allApps.map(a=>[
			  `<code style="font-size:10px">${esc(a.name||'—').split('/').pop()}</code>`,
			  esc(a.friendlyName||'—'),
			  esc(a.agName||'—'),
			  `<code style="font-size:10px;color:#0055aa">${esc(a.filePath||'—')}</code>`,
			  a.showInPortal?'<span style="color:#059669">Visible</span>':'<span style="color:#64748b">Hidden</span>'
			])
		  );
		  sections.push(appsHtml);
		}
	  }

	  // ── 6c. SESSION DESKTOPS ────────────────────────────────────────
	  const deskAgsR=ags.filter(g=>g.applicationGroupType==='Desktop');
	  if(sec('desktops')&&deskAgsR.length){
		let deskHtml=sectionHeader(secNum++,'🖵','Session Desktops',`${deskAgsR.length} desktop${deskAgsR.length!==1?'s':''}`, 'sec-desktops', `${deskAgsR.length} desktop${deskAgsR.length!==1?'s':''}`);
		deskAgsR.forEach(ag=>{
		  const allA=[...arr(ag.assignedUsers),...arr(ag.assignedGroups)];
		  const stdRole='Desktop Virtualization User';
		  deskHtml+=`<div style="margin-bottom:14px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
			  <span style="font-weight:700;font-size:13px">${esc(ag.name)}</span>
			  ${pill('Desktop','blue')}
			  ${ag.showInPortal!==false?pill('Visible in Portal','green'):pill('Hidden','gray')}
			  <span style="font-size:11px;color:#94a3b8;margin-left:auto">${allA.length} assigned</span>
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;margin-bottom:8px">
			  ${ag.friendlyName&&ag.friendlyName!==ag.name?`<span><b>Friendly Name:</b> ${esc(ag.friendlyName)}</span>`:''}
			  <span><b>Workspace:</b> ${esc(ag.workspaceFriendlyName||ag.workspaceName||'—')}</span>
			  <span><b>Host Pool:</b> ${esc(ag.hostPoolName||'—')}</span>
			  <span><b>Resource Group:</b> ${esc(ag.resourceGroup||'—')}</span>
			  ${ag.description?`<span style="grid-column:1/-1"><b>Description:</b> ${esc(ag.description)}</span>`:''}
			</div>
			${allA.length?docTable(['Principal','Type'],allA.map(a=>{const nonStd=a.role&&a.role!==stdRole?` <span style="background:#fef3c7;color:#92400e;font-size:9px;padding:1px 4px;border-radius:3px">${esc(a.role)}</span>`:'';return[esc(a.displayName||a.signInName||a.objectId||'—')+nonStd,pill(a.objectType||'—',a.objectType==='Group'?'cyan':'gray')];})):'<p style="font-size:11px;color:#94a3b8">No assignments</p>'}
		  </div>`;
		});
		sections.push(deskHtml);
	  }

	  // ── 7. SESSION HOSTS ──────────────────────────────────────────
	  if(sec('sessionhosts') && shs.length){
		const avail=shs.filter(s=>s.status==='Available').length;
		const unavail=shs.filter(s=>s.status==='Unavailable').length;
		const drain=shs.filter(s=>s.drainMode).length;
		let shHtml = sectionHeader(secNum++, '💻', 'Session Hosts', `${shs.length} host${shs.length!==1?'s':''}`, 'sec-sessionhosts', `${shs.length} host${shs.length!==1?'s':''}`);
		shHtml += kpiRow(
		  kpiBox('Available', avail, `of ${shs.length} total`, avail===shs.length?'green':'amber'),
		  kpiBox('Unavailable', unavail, 'needs attention', unavail>0?'red':'green'),
		  kpiBox('Drain Mode', drain, 'new sessions blocked', drain>0?'amber':'green'),
		  kpiBox('FSLogix', (s.hostsWithFSLogixDetected||0)+'/'+(s.totalSessionHosts||shs.length), 'coverage', s.hostsWithFSLogixDetected===shs.length?'green':'amber')
		);
		// ── Per-host expanded cards ───────────────────────────────────
		shs.forEach(function(sh){
		  const ps = patchStatus(sh.lastUpdate);
		  const statusC = {Available:'#059669',Unavailable:'#dc2626',NeedsAssistance:'#d97706',Shutdown:'#64748b',Disconnected:'#d97706'}[sh.status]||'#64748b';
		  const diskType = sh.osDiskType||'—';
		  const diskTypeC = diskType.includes('Premium')?'#059669':diskType.includes('Standard_SSD')?'#2563eb':'#64748b';
		  const tags = Object.entries(sh.tags||{});
		  const net = sh.networkDetails || {};
		  const location = sh.vmLocation||sh.location||'—';

		  shHtml += `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;overflow:hidden">
			<!-- Card header -->
			<div style="background:#0d1117;padding:10px 16px;display:flex;align-items:center;gap:12px">
			  <span style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#00d4ff">${esc(sh.vmNameFull||sh.vmName||sh.name||'—')}</span>
			  <span style="font-size:11px;font-weight:600;color:${statusC}">${esc(sh.status||'—')}</span>
			  ${sh.drainMode?'<span style="font-size:9px;background:#92400e;color:#fef3c7;padding:2px 6px;border-radius:3px;margin-left:4px">DRAIN MODE</span>':''}
			  ${sh.excludeFromScaling?'<span style="font-size:9px;background:#854d0e;color:#fef9c3;padding:2px 6px;border-radius:3px;margin-left:4px">EXCL. SCALING</span>':''}
			  <span style="margin-left:auto;font-family:'Courier New',monospace;font-size:10px;color:#64748b">${esc(sh.hostPoolName||'—')}</span>
			</div>
			<!-- Card body -->
			<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0;font-size:11px">

			  <!-- Session Host Details -->
			  <div style="padding:12px 14px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
				<div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:1.5px;color:#00a8cc;text-transform:uppercase;margin-bottom:8px">Session Host</div>
				${kvLine('Status',      `<span style="color:${statusC};font-weight:600">${esc(sh.status||'—')}</span>`)}
				${kvLine('VM Size',     `<code style="font-size:10px">${esc(sh.vmSize||'—')}</code>`)}
				${kvLine('Active Sessions', sh.activeSessions||0)}
				${kvLine('Location',    location)}
				${kvLine('New Sessions',sh.allowNewSessions===false?'<span style="color:#dc2626">Blocked</span>':'<span style="color:#059669">Allowed</span>')}
				${kvLine('Resource Group', sh.resourceGroup||'—')}
				${kvLine('Host Pool',   sh.hostPoolName||'—')}
			  </div>

			  <!-- VM Details -->
			  <div style="padding:12px 14px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
				<div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:1.5px;color:#00a8cc;text-transform:uppercase;margin-bottom:8px">VM Details</div>
				${kvLine('VM Name',     sh.vmName||'—')}
				${kvLine('OS Version',  sh.osVersion||'—')}
				${kvLine('Agent Ver',   sh.agentVersion||'—')}
				${kvLine('OS Type',     sh.osType||'—')}
				${kvLine('Power State', sh.powerState||'—')}
				${LIVE_CONFIG.skipPatchStatus||isLive ? '' : kvLine('Patch Status',`<span style="color:${ps.cls.includes('ok')?'#059669':ps.cls.includes('warn')?'#d97706':'#dc2626'}">${esc(ps.label)}</span>`)}
				${LIVE_CONFIG.skipFSLogix||isLive ? '' : kvLine('FSLogix', sh.fslogixDetected?'<span style="color:#059669">✓ Detected</span>':'—')}
			  </div>

			  <!-- Storage Details -->
			  <div style="padding:12px 14px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
				<div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:1.5px;color:#00a8cc;text-transform:uppercase;margin-bottom:8px">Storage</div>
				${kvLine('Disk Name',   `<code style="font-size:9px">${esc(sh.osDiskName||'—')}</code>`)}
				${kvLine('Disk Size',   sh.osDiskSizeGB ? sh.osDiskSizeGB+' GB' : '—')}
				${kvLine('Disk Type',   diskType!=='—'?`<span style="color:${diskTypeC}">${esc(diskType)}</span>`:'—')}
				${kvLine('Caching',     sh.osDiskCaching||'—')}
			  </div>

			  <!-- Network Details -->
			  <div style="padding:12px 14px;border-bottom:1px solid #e2e8f0">
				<div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:1.5px;color:#00a8cc;text-transform:uppercase;margin-bottom:8px">Network</div>
				${kvLine('Private IP',  net.privateIP||sh.privateIP||'—')}
				${kvLine('Public IP',   net.publicIP||sh.publicIP||'—')}
				${kvLine('NIC',         net.nicName||sh.nicName||'—')}
				${kvLine('vNet',        net.virtualNetwork||sh.virtualNetwork||'—')}
				${kvLine('Subnet',      net.subnet||sh.subnet||'—')}
			  </div>

			</div>
			<!-- Tags + Resource ID -->
			${tags.length||sh.id ? `<div style="padding:8px 14px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:10px;display:flex;gap:16px;flex-wrap:wrap;align-items:baseline">
			  ${tags.length?`<span><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:8px">TAGS</span> ${tags.map(([k,v])=>`<span style="background:#e2e8f0;border-radius:3px;padding:1px 5px;margin-left:3px">${esc(k)}: ${esc(v)}</span>`).join('')}</span>`:''}
			  ${sh.id?`<span style="margin-left:auto"><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:8px">RESOURCE ID</span> <code style="font-size:9px;color:#475569">${esc(sh.id)}</code></span>`:''}
			</div>` : ''}
		  </div>`;
		});

		// ExcludeFromScaling warning
		const excludedHosts=shs.filter(sh=>sh.excludeFromScaling);
		if(excludedHosts.length){
		  shHtml += `<div style="background:#fef9c3;border-left:4px solid #ca8a04;border-radius:0 4px 4px 0;padding:8px 12px;margin:8px 0;font-size:11px">
			<strong>⚠ ${excludedHosts.length} session host${excludedHosts.length!==1?'s are':' is'} tagged ExcludeFromScaling</strong> — ${excludedHosts.map(sh=>esc(sh.vmName||sh.name||'—')).join(', ')}. These hosts are excluded from the scaling plan and will not be automatically shut down.
		  </div>`;
		}
		sections.push(shHtml);
	  }

	  // ── 8. USER SESSIONS ──────────────────────────────────────────
	  if(sec('sessions') && sessions.length){
		const active=sessions.filter(s=>s.sessionState==='Active');
		const disc=sessions.filter(s=>s.sessionState==='Disconnected');
		let sessHtml = sectionHeader(secNum++, '👤', 'User Sessions', `${sessions.length} session${sessions.length!==1?'s':''}`, 'sec-sessions', `${sessions.length} session${sessions.length!==1?'s':''}`);
		sessHtml += kpiRow(
		  kpiBox('Total Sessions', sessions.length, '', 'cyan'),
		  kpiBox('Active', active.length, 'connected users', 'green'),
		  kpiBox('Disconnected', disc.length, 'idle sessions', disc.length>0?'amber':'green'),
		  kpiBox('Unique Users', new Set(sessions.map(s=>s.userPrincipalName).filter(Boolean)).size, '', 'blue')
		);
		sessHtml += docTable(
		  ['User','State','Session Host','Host Pool','Type','Connected Since'],
		  sessions.map(s=>[esc(s.userPrincipalName||'Unknown'), pill(s.sessionState||'—',s.sessionState==='Active'?'green':'amber'), esc((s.sessionHostName||'—').split('.')[0]), esc(s.hostPoolName||'—'), pill(s.applicationType||'Desktop',s.applicationType==='Desktop'?'blue':'purple'), esc(s.createTime||'—')])
		);
		sections.push(sessHtml);
	  }


	  // ── 12. COST ──────────────────────────────────────────────────
	  if(sec('cost') && s.costAvailable){
		const hpCosts=hps.filter(hp=>hp.currentMonthCost!=null).sort((a,b)=>b.currentMonthCost-a.currentMonthCost);
		let costHtml = sectionHeader(secNum++, '💰', 'Cost & FinOps', 'Month-to-Date', 'sec-cost');
		costHtml += kpiRow(
		  kpiBox('Previous Month', s.previousMonthCost!=null?`${cur} ${s.previousMonthCost.toFixed(0)}`:'—', s.previousMonthFrom&&s.previousMonthTo?`${s.previousMonthFrom} → ${s.previousMonthTo}`:'not collected', 'gray'),
		  kpiBox('This Month MTD', `${cur} ${s.currentMonthCost?.toFixed(0)||'—'}`, s.currentMonthFrom&&s.currentMonthTo?`${s.currentMonthFrom} → ${s.currentMonthTo}`:'month to date', 'cyan'),
		  kpiBox('Projected EOM', proj?`${cur} ${proj.toFixed(0)}`:'—', 'estimate based on run rate', 'amber'),
		  kpiBox('Wasted Spend', s.wastedSpendEstimate?`${cur} ${s.wastedSpendEstimate.toFixed(0)}`:'—', `${s.wastedSpendHosts||0} idle/drain hosts`, s.wastedSpendEstimate>0?'amber':'green')
		);
		if(s.previousMonthCost!=null && proj!=null){
		  const delta=proj-s.previousMonthCost, pct=Math.round((delta/s.previousMonthCost)*100);
		  const dcolour=delta>0?'#dc2626':'#059669';
		  costHtml += `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;display:flex;align-items:center;gap:12px">
			<span style="font-size:20px">${delta>0?'↑':'↓'}</span>
			<span><strong style="color:${dcolour}">${delta>0?'+':''}${cur} ${Math.abs(delta).toFixed(2)} (${delta>0?'+':''}${pct}%)</strong> vs last month</span>
			<span style="color:#94a3b8;font-size:11px;margin-left:auto">Projection = (MTD ÷ days elapsed) × days in month</span>
		  </div>`;
		}
		if(hpCosts.length){
		  costHtml += `<p style="font-weight:700;font-size:12px;margin-bottom:8px;color:#0d1117">Cost by Host Pool</p>`;
		  costHtml += docTable(
			['Host Pool','Cost MTD','% of Total'],
			hpCosts.map(hp=>[esc(hp.name), `${cur} ${hp.currentMonthCost.toFixed(2)}`, Math.round((hp.currentMonthCost/(s.currentMonthCost||1))*100)+'%'])
		  );
		}
		sections.push(costHtml);
	  }

	  // ── 10. NETWORKING ────────────────────────────────────────────
	  if(sec('networking') && hps.length){
		const net = D?.networking||null;
		let netHtml = sectionHeader(secNum++, '🌐', 'Networking Configuration', undefined, 'sec-networking');
		// Host pool config table
		netHtml += docTable(
		  ['Host Pool','Type','Load Balancer','Max Sessions','Start VM on Connect','Validation'],
		  hps.map(hp=>[esc(hp.name), pill(hp.hostPoolType||'Pooled',hp.hostPoolType==='Personal'?'purple':'cyan'), esc(hp.loadBalancerType||'—'), hp.maxSessionLimit||'—', hp.startVMOnConnect?'<span style="color:#059669">Enabled</span>':'Disabled', hp.isValidationEnv?'<span style="color:#d97706">Yes</span>':'No'])
		);
		// Session host network table
		const shsWithIP=shs.filter(s=>s.privateIP&&s.privateIP!=='Not assigned');
		if(shsWithIP.length){
		  netHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Session Host Network Details</p>`;
		  netHtml += docTable(
			['Host','Host Pool','Private IP','VM Size','AMA Agent'],
			shs.map(sh=>[esc(sh.vmName||sh.name||'—'), esc(sh.hostPoolName||'—'), `<code style="font-size:10px">${esc(sh.privateIP||'—')}</code>`, `<code style="font-size:10px">${esc(sh.vmSize||'—')}</code>`, sh.hasAMAAgent?'<span style="color:#059669">✓</span>':'—'])
		  );
		}
		// RDP Properties — configured values per host pool (compact)
		const hpsWithRdp = hps.filter(hp=>Object.keys(hp.rdpPropertiesParsed||{}).length);
		if(hpsWithRdp.length){
		  netHtml += `<p style="font-weight:700;font-size:12px;margin:16px 0 6px;color:#0d1117">RDP Properties — Configured Values</p>`;
		  netHtml += `<p style="font-size:11px;color:#64748b;margin-bottom:10px;font-style:italic">Shows only explicitly configured properties. See Appendix B for full analysis including recommended settings.</p>`;
		  netHtml += docTable(
			['Property','Category',...hpsWithRdp.map(hp=>esc(hp.name)),'Compliance'],
			(() => {
			  const allKeys=[...new Set(hpsWithRdp.flatMap(hp=>Object.keys(hp.rdpPropertiesParsed||{})))].sort();
			  return allKeys.map(key=>{
				const ref=RDP_REF[key];
				const vals=hpsWithRdp.map(hp=>{
				  const v=hp.rdpPropertiesParsed?.[key];
				  if(v===undefined||v===''||v==='s:') return '<span style="color:#94a3b8">—</span>';
				  const c=rdpCompliance(key,v);
				  const col=c==='compliant'?'#059669':c==='review'?'#d97706':'#94a3b8';
				  return `<span style="color:${col}">${esc(String(v))}</span>`;
				});
				const statuses=hpsWithRdp.map(hp=>rdpCompliance(key,hp.rdpPropertiesParsed?.[key]));
				const allCompliant=statuses.every(s=>s==='compliant');
				const anyReview=statuses.some(s=>s==='review');
				const status=allCompliant?'<span style="color:#059669">✓</span>':anyReview?'<span style="color:#d97706">⚑ Review</span>':'<span style="color:#94a3b8">—</span>';
				return [
				  `<code style="font-size:9px">${esc(key)}</code>`,
				  `<span style="font-size:10px;color:#64748b">${ref?.cat||'Other'}</span>`,
				  ...vals,
				  status
				];
			  });
			})()
		  );
		  // Compliance summary KPI row
		  const allKeys2=[...new Set(hpsWithRdp.flatMap(hp=>Object.keys(hp.rdpPropertiesParsed||{})))];
		  const compliantCount=allKeys2.filter(k=>hpsWithRdp.every(hp=>rdpCompliance(k,hp.rdpPropertiesParsed?.[k])==='compliant')).length;
		  const reviewCount=allKeys2.filter(k=>hpsWithRdp.some(hp=>rdpCompliance(k,hp.rdpPropertiesParsed?.[k])==='review')).length;
		  const notConfigured=Object.keys(RDP_REF).length-allKeys2.length;
		  netHtml += kpiRow(
			kpiBox('Configured',allKeys2.length,'of '+Object.keys(RDP_REF).length+' known properties','cyan'),
			kpiBox('Compliant',compliantCount,'match recommended','green'),
			kpiBox('Review Recommended',reviewCount,'differ from recommended',reviewCount>0?'amber':'green'),
			kpiBox('Not Configured',notConfigured,'using Azure defaults',notConfigured>5?'amber':'green')
		  );
		}
		// RDP ShortPath config table
		const hpsWithRdp2=hps.filter(hp=>Object.keys(hp.rdpPropertiesParsed||{}).length>0);
		if(hpsWithRdp2.length){
		  netHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">RDP Configuration Summary</p>`;
		  netHtml += docTable(
			['Host Pool','Entra ID Auth','WebAuthn','Multi-Monitor','Drive Redirect','Registration Token'],
			hpsWithRdp2.map(hp=>{
			  const rdp=hp.rdpPropertiesParsed||{};
			  const tick='<span style="color:#059669">✓</span>';
			  const cross='<span style="color:#d97706">—</span>';
			  const warn='<span style="color:#dc2626">⚠ Active</span>';
			  return [esc(hp.name), rdp['enablerdsaadauth']==='1'?tick:cross, rdp['redirectwebauthn']==='1'?tick:cross, rdp['use multimon']==='1'?tick:cross, rdp['drivestoredirect']===''||rdp['drivestoredirect']==='s:'?tick+'<span style="font-size:9px;color:#64748b"> disabled</span>':cross, hp.registrationTokenStatus==='Active'?warn:'<span style="color:#059669">None</span>'];
			})
		  );
		}
		// Private Endpoint status
		const hpWithPE2=hps.filter(hp=>hp.privateEndpointEnabled);
		const hpWithoutPE=hps.filter(hp=>hp.privateEndpointEnabled===false&&!hp.isValidationEnv);
		if(hps.some(hp=>hp.privateEndpointEnabled!==undefined)){
		  netHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Private Endpoint Coverage</p>`;
		  netHtml += kpiRow(
			kpiBox('Host Pools with PE', hpWithPE2.length+'/'+hps.length, hpWithPE2.length===hps.length?'All private':'Partial', hpWithPE2.length===hps.length?'green':hpWithPE2.length>0?'amber':'red'),
			kpiBox('Without PE', hpWithoutPE.length, 'production pools', hpWithoutPE.length>0?'amber':'green'),
			kpiBox('AVD DNS Zones', D?.networking?.privateEndpoints?.avdDnsZonesConfigured||0, 'privatelink.wvd.microsoft.com', (D?.networking?.privateEndpoints?.avdDnsZonesConfigured||0)>0?'green':'amber'),
			kpiBox('Architecture', D?.networking?.topologyNotes?.some(n=>n.includes('Hub-and-spoke'))?'Hub-Spoke':'Standard', '', 'blue')
		  );
		  if(hpWithoutPE.length){
			netHtml += `<div style="background:#fef9c3;border-left:4px solid #ca8a04;border-radius:0 4px 4px 0;padding:8px 12px;margin:6px 0;font-size:11px"><strong>Private endpoints not configured:</strong> ${hpWithoutPE.map(hp=>esc(hp.name)).join(', ')}. AVD control plane traffic uses public internet.</div>`;
		  }
		}
		// Topology notes
		const topoNotes2=arr(D?.networking?.topologyNotes);
		if(topoNotes2.length){
		  netHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Architecture Notes</p>`;
		  netHtml += `<ul style="margin:0 0 10px 16px">${topoNotes2.map(n=>`<li style="font-size:11px;color:${n.includes('WARNING')||n.includes('No ')?'#d97706':n.includes('✓')?'#059669':'#475569'};margin-bottom:4px">${esc(n)}</li>`).join('')}</ul>`;
		}
		// Topology architecture diagram (text-based for document)
		if(net && arr(net.virtualNetworks).length){
		  netHtml += `<p style="font-weight:700;font-size:12px;margin:16px 0 6px;color:#0d1117">Network Architecture</p>`;
		  arr(net.virtualNetworks).forEach(vnet=>{
			const peers=arr(vnet.peerings);
			const avdSubs=arr(vnet.subnets).filter(s=>s.sessionHostCount>0);
			const natName=arr(vnet.subnets).find(s=>s.natGatewayName)?.natGatewayName;
			const nat=arr(D?.networking?.natGateways).find(n=>n.name===natName);
			netHtml += `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;margin-bottom:10px">
			  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
				<span style="font-weight:700;font-size:13px;color:#0d1117">🌐 ${esc(vnet.name)}</span>
				<span style="font-family:'Courier New',monospace;font-size:10px;color:#64748b">${esc(arr(vnet.addressSpace).join(', '))} · ${esc(vnet.location||'')}</span>
				${peers.length?`<span style="background:#ede9fe;color:#7c3aed;border-radius:3px;padding:1px 7px;font-size:9px;font-family:'Courier New',monospace">Hub-Spoke (${peers.length} peering${peers.length!==1?'s':''})</span>`:''}
			  </div>
			  ${nat?`<div style="font-size:10px;color:#059669;margin-bottom:6px">🔀 Outbound via NAT Gateway: ${esc(nat.name)} · Public IP: ${arr(nat.publicIPAddresses).map(p=>p.ipAddress||p.name||'—').join(', ')||'—'}</div>`:'<div style="font-size:10px;color:#d97706;margin-bottom:6px">⚠ No NAT Gateway — outbound uses default Azure SNAT</div>'}
			  ${arr(D?.networking?.bastionHosts).find(b=>arr(vnet.subnets).some(s=>s.name==='AzureBastionSubnet'))?`<div style="font-size:10px;color:#7c3aed;margin-bottom:6px">🏰 Azure Bastion deployed (${arr(D?.networking?.bastionHosts)[0]?.sku||'Standard'} SKU)</div>`:''}
			  ${avdSubs.length?docTable(['Subnet','Prefix','Host Pool','Hosts','NAT GW','NSG'],avdSubs.map(sn=>[esc(sn.name),`<code style="font-size:9px">${esc(sn.addressPrefix||'—')}</code>`,esc(sn.associatedHostPool||'—'),sn.sessionHostCount||0,sn.natGatewayName?`<span style="color:#059669">✓ ${esc(sn.natGatewayName)}</span>`:'<span style="color:#d97706">None</span>',sn.nsgName?`<span style="color:#2563eb">✓ ${esc(sn.nsgName)}</span>`:'—'])):''}
			</div>`;
		  });
		  // NSG findings summary
		  const allNsgF=arr(D?.networking?.networkSecurityGroups).flatMap(n=>arr(n.securityFindings));
		  if(allNsgF.length){
			netHtml += `<p style="font-weight:700;font-size:12px;margin:12px 0 6px;color:#0d1117">NSG Security Findings</p>`;
			allNsgF.forEach(f=>{ netHtml+=findingBlock(f.severity,f.finding); });
		  }
		}
		sections.push(netHtml);
	  }

	  // ── 11. FSLOGIX ───────────────────────────────────────────────
	  if(sec('fslogix')){
		const fc=D?.fslogixCoverage||{};
		const covPct=fc.coveragePct??0;
		const sas=arr(fc.storageAccounts);
		let fslHtml = sectionHeader(secNum++, '📦', 'FSLogix Profile Containers', undefined, 'sec-fslogix');
		fslHtml += kpiRow(
		  kpiBox('Coverage', covPct+'%', `${fc.hostsWithFSLogix||0} of ${fc.totalHosts||shs.length} hosts`, covPct>=80?'green':covPct>=50?'amber':'red'),
		  kpiBox('With FSLogix', fc.hostsWithFSLogix||0, '', 'green'),
		  kpiBox('Without FSLogix', arr(fc.hostsWithout).length||0, 'needs attention', arr(fc.hostsWithout).length>0?'amber':'green'),
		  kpiBox('Slow Mounts', arr(D?.metrics?.fslogixSlowMounts).length||0, 'hosts affected', arr(D?.metrics?.fslogixSlowMounts).length>0?'amber':'green')
		);
		if(arr(fc.hostsWithout).length){
		  fslHtml += `<div style="background:#fef9c3;border-left:4px solid #ca8a04;border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:10px;font-size:11px"><strong>Hosts without FSLogix:</strong> ${arr(fc.hostsWithout).map(h=>`<code style="background:#fef3c7;padding:1px 5px;border-radius:2px">${esc(h)}</code>`).join(' ')}</div>`;
		}
		if(fc.fslogixCoverageNote) fslHtml += `<p style="font-size:11px;color:#64748b;font-style:italic">${esc(fc.fslogixCoverageNote)}</p>`;
		if(sas.length){
		  fslHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Profile Storage Accounts (${sas.length})</p>`;
		  sas.forEach(sa=>{
			const shares=arr(sa.shares);
			fslHtml += `<div style="margin-bottom:12px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
			  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
				<span style="font-weight:700;font-size:12px">${esc(sa.storageAccount)}</span>
				<span style="font-size:10px;color:#64748b">${esc(sa.sku||'—')}</span>
				<span style="font-size:10px;color:#94a3b8;margin-left:auto">${esc(sa.resourceGroup||'—')} · ${esc(sa.location||'—')}</span>
			  </div>
			  ${sa.storageAccountUrl?`<p style="font-size:10px;margin-bottom:8px"><b>Storage URL:</b> <code style="font-size:9px;color:#0055aa">${esc(sa.storageAccountUrl)}</code></p>`:''}
			  ${shares.length?docTable(
				['Share Name','Quota (GiB)','Used (GiB)','Utilisation','Tier','Share URL'],
				shares.map(sh=>{
				  const hasQ=sh.quotaGiB>0;
				  const pct=hasQ?Math.round((sh.usedGiB/sh.quotaGiB)*100):null;
				  const col=pct==null?'#64748b':pct>85?'#dc2626':pct>65?'#d97706':'#059669';
				  return[
					`<code style="font-size:10px">${esc(sh.name||'—')}</code>`,
					hasQ?sh.quotaGiB:'No quota',
					sh.usedGiB??'—',
					pct!=null?`<span style="color:${col}">${pct}%</span>`:'—',
					esc(sh.tier||'—'),
					sh.shareUrl?`<code style="font-size:9px;color:#0055aa">${esc(sh.shareUrl)}</code>`:'—'
				  ];
				})
			  ):'<p style="font-size:11px;color:#94a3b8">No shares found.</p>'}
			</div>`;
		  });
		}
		sections.push(fslHtml);
	  }


	  // ── 9. RBAC ───────────────────────────────────────────────────
	  if(sec('rbac')){
		const all=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)].map(a=>({...a,scope:ag.name})));
		if(all.length){
		  const groups=all.filter(a=>a.objectType==='Group').length;
		  const users=all.filter(a=>a.objectType==='User').length;
		  const direct=all.filter(a=>a.objectType==='User').length;
		  let rbacHtml = sectionHeader(secNum++, '🔑', 'RBAC Assignments', `${all.length} assignment${all.length!==1?'s':''}`, 'sec-rbac', `${all.length} assignment${all.length!==1?'s':''}`);
		  rbacHtml += `<p style="font-size:10px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:6px 10px;margin-bottom:10px">⚠ Only AVD-specific roles are shown (Desktop Virtualization &amp; VM Login roles). Subscription-level roles (Owner, Contributor, Reader) are excluded — review Azure RBAC for full inheritance.</p>`;
		  rbacHtml += kpiRow(
			kpiBox('Total Assignments', all.length, '', 'cyan'),
			kpiBox('Group Assignments', groups, 'best practice', 'green'),
			kpiBox('Direct User Assign.', direct, direct>0?'review recommended':'none — good', direct>0?'amber':'green'),
			kpiBox('Distinct Roles', new Set(all.map(a=>a.role).filter(Boolean)).size, '', 'blue')
		  );
		  rbacHtml += docTable(
			['Principal','Type','Role','Scope'],
			all.map(a=>[esc(a.displayName||a.signInName||a.objectId||'—'), pill(a.objectType||'—',a.objectType==='Group'?'cyan':'gray'), esc(a.role||'—'), esc(a.scope||'—')])
		  );
		  sections.push(rbacHtml);
		}
	  }

	  // ── 13. AVD DIAGNOSTICS & INSIGHTS COVERAGE ──────────────────

		if(sec('intelligence')){
		const met=D?.metrics||{};
		const insSum=getInsightsSummary(prodHps);
		let intHtml = sectionHeader(secNum++, '🔍', 'AVD Diagnostics & Insights Coverage', `${prodHps.length} prod host pool${prodHps.length!==1?'s':''}${diagNote}`, 'sec-intelligence');
		// Summary KPIs
		const diagComplete=insSum.complete, diagPartial=insSum.partial, diagNone=insSum.disabled;
		intHtml += kpiRow(
		  kpiBox('Full Coverage', diagComplete, `all ${AVD_REQUIRED_CATEGORIES.length} categories enabled`, diagComplete===hps.length?'green':'amber'),
		  kpiBox('Partial Coverage', diagPartial, 'missing some categories', diagPartial>0?'amber':'green'),
		  kpiBox('Not Configured', diagNone, 'no diagnostics at all', diagNone>0?'red':'green'),
		  kpiBox('KQL Queries Ran', arr(met.queriesRun).length, met.querySupported?`${met.timespanDays||1}d window`:'No workspace', met.querySupported?'cyan':'amber')
		);
		// Per-host-pool diagnostics table
		intHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Diagnostic Settings per Host Pool</p>`;
		intHtml += docTable(
		  ['Host Pool','Diagnostics','Log Analytics Workspace','Categories Enabled','Missing Categories'],
		  insSum.details.map(r=>{
			const ws=arr(arr(hps.find(hp=>hp.name===r.name)?.diagnosticSettings||[])).map(ds=>ds.workspaceName||'—').filter((v,i,a)=>a.indexOf(v)===i).join(', ')||'—';
			const enabled=r.categories.join(', ')||'—';
			const missing=r.missing.length?r.missing.map(c=>`<span style="color:#dc2626;font-size:9px">${esc(c)}</span>`).join(' '):'<span style="color:#059669">✓ All present</span>';
			const status=r.complete?'<span style="color:#059669">✓ Complete</span>':r.enabled?'<span style="color:#d97706">⚑ Partial</span>':'<span style="color:#dc2626">✗ Not configured</span>';
			return [esc(r.name), status, `<span style="font-size:9px">${esc(ws)}</span>`, `<span style="font-size:9px">${esc(enabled)}</span>`, missing];
		  })
		);
		// Required categories reference
		intHtml += `<p style="font-size:10px;color:#64748b;margin-top:10px"><strong>Required categories for full AVD Insights:</strong> ${AVD_REQUIRED_CATEGORIES.map(c=>`<code style="font-size:9px;background:#f1f5f9;padding:1px 4px;border-radius:2px">${c}</code>`).join(' ')}</p>`;
		// KQL summary if data available
		if(met.querySupported && met.connectionSuccessRate!=null){
		  intHtml += `<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">KQL Analytics Summary</p>`;
		  intHtml += docTable(['Metric','Value'],[
			['Connection Success Rate', met.connectionSuccessRate!=null?met.connectionSuccessRate+'%':'—'],
			['Queries Executed', arr(met.queriesRun).length+' of 19 configured'],
			['Window', (met.timespanDays||1)+' day(s)'],
			['Workspace ID', esc(met.workspaceId||'—')]
		  ]);
		}
		// Q5 — Top active users by hours
		const rptQ5 = arr(met.Q5_rows);
		if(rptQ5.length){
		  intHtml += '<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Top Active Users by Hours (7 days)</p>';
		  intHtml += docTable(['User','Total Hours','Sessions'],rptQ5.map(function(r){ return [esc(r.UserName||'—'),r.TotalHours??'—',r.Sessions??'—']; }));
		}
		// Q9 — Weekly hours per user
		const rptQ9 = arr(met.Q9_rows).filter(function(r){ return r&&r.UserName; });
		if(rptQ9.length){
		  intHtml += '<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">Weekly Hours per User</p>';
		  intHtml += docTable(['User','Total Hours','Sessions','Avg Session Hours'],rptQ9.map(function(r){ return [esc(r.UserName||'—'),r.TotalHours??'—',r.Sessions??'—',r.AvgSessionHours??'—']; }));
		}
		// Q8 — User retention & churn
		const rptQ8 = arr(met.Q8_rows).filter(function(r){ return r&&r.ThisWeekUsers!=null; });
		if(rptQ8.length){
		  intHtml += '<p style="font-weight:700;font-size:12px;margin:14px 0 6px;color:#0d1117">User Retention &amp; Growth (WoW)</p>';
		  intHtml += docTable(['Trend','This Week','Last Week','Growth Rate','New','Returning','Lost'],rptQ8.map(function(r){ return [esc(r.Trend||'—'),r.ThisWeekUsers??'—',r.LastWeekUsers??'—',esc(r.GrowthRate||'—'),r.NewUsers??'—',r.ReturningUsers??'—',r.LostUsers??'—']; }));
		}
		sections.push(intHtml);
	  }

	  // ── 14. RG INVENTORY APPENDIX ────────────────────────────────
	  const rgsData=arr(D?.resourceGroups).filter(rg=>rg!=null);
	  // ── RECOMMENDATIONS (before appendices) ────────────────────────
	  if(!LIVE_CONFIG.skipConfigFindings || !isLive){
		// Collect ALL findings from all sources
		const allRecs = [];
		// Host pool findings — downgrade health to Low, skip diagnostics (covered by AVD Insights)
		hps.forEach(hp=>{
		  arr(hp.securityFindings).forEach(f=>{
			const isDiagFinding = f.finding && f.finding.toLowerCase().includes('diagnostic');
			if(isDiagFinding) return;
			const isHealthFinding = f.finding && f.finding.toLowerCase().includes('host pool health');
			const severity = isHealthFinding && f.severity==='High' ? 'Low' : f.severity;
			allRecs.push({severity, source:'Host Pool', name:hp.name, finding:f.finding});
		  });
		});
		// NSG findings (if networking data present)
		arr(D?.networking?.networkSecurityGroups).forEach(nsg=>{
		  arr(nsg.securityFindings).forEach(f=>{
			allRecs.push({severity:f.severity, source:'NSG', name:nsg.name, finding:f.finding});
		  });
		});
		// FSLogix
		const fc=D?.fslogixCoverage||{};
		if(arr(fc.hostsWithout).length){
		  allRecs.push({severity:'Medium', source:'FSLogix', name:'Coverage', finding:`${arr(fc.hostsWithout).length} session host${arr(fc.hostsWithout).length!==1?'s':''} without FSLogix detected: ${arr(fc.hostsWithout).join(', ')}`});
		}
		// Private endpoints — only add if not already in securityFindings
		hps.filter(hp=>!hp.privateEndpointEnabled&&!hp.isValidationEnv).forEach(hp=>{
		  const alreadyFlagged = arr(hp.securityFindings).some(f=>f.finding&&f.finding.toLowerCase().includes('private endpoint'));
		  if(!alreadyFlagged) allRecs.push({severity:'Medium', source:'Networking', name:hp.name, finding:`Host pool '${hp.name}' has no private endpoint — AVD control plane uses public internet`});
		});
		// Image drift
		Object.entries(D?.imageDrift||{}).forEach(([pool,drift])=>{
		  if(drift.driftDetected) allRecs.push({severity:'Medium', source:'Image Drift', name:pool, finding:`Pool '${pool}' has ${drift.distinctImages.length} different images — outlier hosts: ${arr(drift.outlierHosts).join(', ')}`});
		});
		// AVD Insights / Diagnostics completeness
		getInsightsSummary(hps).details.filter(r=>!r.complete).forEach(r=>{
		  const sev = r.enabled ? 'Medium' : 'High';
		  const msg = r.enabled
			? 'Host pool diagnostics missing categories ['+r.missing.join(', ')+'] — some AVD Insights queries will not return data'
			: 'No diagnostic settings configured — AVD Insights is non-functional. Configure diagnostics to enable monitoring and KQL analytics';
		  allRecs.push({severity:sev, source:'AVD Insights', name:r.name, finding:msg});
		});
		// Wasted spend
		if(s.wastedSpendEstimate>0){
		  allRecs.push({severity:'Low', source:'Cost', name:'Wasted Spend', finding:'Estimated '+cur+' '+(s.wastedSpendEstimate?.toFixed(2)||'—')+' wasted on '+(s.wastedSpendHosts||0)+' idle/drain-mode hosts still running'});
		}

		if(allRecs.length){
		  const order={Critical:0,High:1,Medium:2,Low:3};
		  allRecs.sort((a,b)=>(order[a.severity]??9)-(order[b.severity]??9));
		  const bySev={};
		  allRecs.forEach(r=>{ (bySev[r.severity]=bySev[r.severity]||[]).push(r); });

		  const dataMode = getDataMode();
		  let recTitle = 'Configuration Findings';
		  let recSubtitle = 'Consolidated findings — sorted by severity';
		  let recHtml = sectionHeader(secNum++,'⚠',recTitle,recSubtitle,'sec-recommendations');
		  recHtml += '<p style="font-size:11px;color:#475569;margin-bottom:16px">'+allRecs.length+' finding'+(allRecs.length!==1?'s':'')+' identified — sorted by severity. Validate each finding in context before taking remediation action.</p>';

		  const sevStyles = {
			Critical: {bg:'#fee2e2', border:'#dc2626', label:'#dc2626'},
			High:     {bg:'#ffedd5', border:'#ea580c', label:'#ea580c'},
			Medium:   {bg:'#fef9c3', border:'#ca8a04', label:'#ca8a04'},
			Low:      {bg:'#f1f5f9', border:'#64748b', label:'#64748b'},
		  };

		  Object.entries(bySev).forEach(([sev,recs])=>{
			const st=sevStyles[sev]||sevStyles.Low;
			recHtml += `<p style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;color:${st.label};letter-spacing:1px;text-transform:uppercase;margin:16px 0 8px;border-bottom:2px solid ${st.border};padding-bottom:4px">${sev} (${recs.length})</p>`;
			recs.forEach(r=>{
			  recHtml += `<div style="background:${st.bg};border-left:4px solid ${st.border};border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:6px">
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
				  <span style="font-family:'Courier New',monospace;font-size:9px;color:${st.label};font-weight:700">[${esc(r.source)}]</span>
				  <span style="font-family:'Courier New',monospace;font-size:9px;color:#64748b">${esc(r.name)}</span>
				</div>
				<div style="font-size:11px;color:#1e293b">${esc(r.finding)}</div>
			  </div>`;
			});
		  });

		  recHtml += `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-top:16px;font-size:10px;color:#64748b;font-style:italic">
			Findings are auto-generated from collected data. Validate each finding in context before taking remediation action.
		  </div>`;
		  sections.push(recHtml);
		}
	  }

		if(rgsData.length && sec('rginventory')){
		let rgHtml = sectionHeader(secNum++, '📋', 'Appendix A — Resource Group Inventory', `${rgsData.reduce((a,rg)=>a+(rg.resourceCount||arr(rg.resources).length),0)} resources`, 'sec-rginventory', `${rgsData.reduce((a,rg)=>a+(rg.resourceCount||arr(rg.resources).length),0)} resources`);
		rgHtml += `<p style="font-size:11px;color:#475569;margin-bottom:14px">All Azure resources in ${rgsData.length} resource group${rgsData.length!==1?'s':''} associated with this AVD environment.</p>`;
		rgsData.forEach(rg=>{
		  const res=arr(rg.resources);
		  rgHtml += `<p style="font-weight:700;font-size:12px;color:#0d1117;margin:12px 0 4px">${esc(rg.name)} <span style="font-weight:400;color:#94a3b8;font-size:10px">${esc(rg.location||'—')} · ${rg.resourceCount||res.length} resources</span></p>`;
		  if(Object.keys(rg.tags||{}).length) rgHtml += `<p style="font-size:10px;color:#64748b;margin-bottom:6px">Tags: ${Object.entries(rg.tags).map(([k,v])=>`<code style="background:#f1f5f9;padding:1px 4px;border-radius:2px;font-size:9px">${esc(k)}: ${esc(v)}</code>`).join(' ')}</p>`;
		  rgHtml += docTable(['Resource Name','Type','Location'], res.map(r=>[esc(r.name), `<code style="font-size:10px;background:#f1f5f9;padding:1px 5px;border-radius:2px">${esc(r.shortType)}</code>`, esc(r.location||'—')]));
		});
		sections.push(rgHtml);
	  }

	  // ── APPENDIX B — RDP PROPERTIES FULL ANALYSIS ────────────────
	  if(sec('rdpanalysis')){
		const hpsWithRdp2=hps.filter(hp=>Object.keys(hp.rdpPropertiesParsed||{}).length);
		if(hpsWithRdp2.length){
		  let rdpHtml = sectionHeader(secNum++, '🔧', 'Appendix B — RDP Properties Analysis', `${Object.keys(RDP_REF).length} properties reviewed`, 'sec-rdpanalysis');
		  rdpHtml += `<p style="font-size:11px;color:#475569;margin-bottom:14px">Full comparison of all known RDP properties against Microsoft-recommended values for Azure Virtual Desktop. Source: <a href="https://learn.microsoft.com/en-us/azure/virtual-desktop/rdp-properties" style="color:#00a8cc">Microsoft Learn — Supported RDP properties</a>.</p>`;

		  // Group by category
		  const cats=[...new Set(Object.values(RDP_REF).map(r=>r.cat))];
		  cats.forEach(cat=>{
			const catKeys=Object.keys(RDP_REF).filter(k=>RDP_REF[k].cat===cat);
			rdpHtml += `<p style="font-weight:700;font-size:12px;margin:16px 0 6px;color:#0d1117;border-left:3px solid #00a8cc;padding-left:8px">${cat}</p>`;
			rdpHtml += docTable(
			  ['Property','Recommended',...hpsWithRdp2.map(hp=>`<span style="font-size:9px">${esc(hp.name)}</span>`),'Status'],
			  catKeys.map(key=>{
				const ref=RDP_REF[key];
				const recVal=ref.rec==='s:'?'(disabled)':ref.rec==='1'?'Enabled':ref.rec==='0'?'Disabled':ref.rec;
				const vals=hpsWithRdp2.map(hp=>{
				  const v=hp.rdpPropertiesParsed?.[key];
				  if(v===undefined||v==='') return '<span style="color:#94a3b8;font-size:9px">not set</span>';
				  const c=rdpCompliance(key,v);
				  const col=c==='compliant'?'#059669':c==='review'?'#d97706':'#94a3b8';
				  return `<span style="color:${col};font-size:9px">${esc(String(v||'—'))}</span>`;
				});
				const statuses=hpsWithRdp2.map(hp=>rdpCompliance(key,hp.rdpPropertiesParsed?.[key]));
				const anyCompliant=statuses.some(s=>s==='compliant');
				const anyReview=statuses.some(s=>s==='review');
				const anyMissing=statuses.some(s=>s==='not-configured');
				let badge='<span style="color:#059669;font-size:9px">✓</span>';
				if(anyReview) badge='<span style="color:#d97706;font-size:9px">⚑ Review</span>';
				if(anyMissing&&!anyCompliant&&!anyReview) badge='<span style="color:#94a3b8;font-size:9px">Not set</span>';
				return [
				  `<code style="font-size:9px">${esc(key)}</code><br><span style="font-size:9px;color:#64748b">${esc(ref.label)}</span>`,
				  `<span style="font-size:9px;color:#059669;font-weight:600">${esc(recVal)}</span>`,
				  ...vals,
				  badge
				];
			  })
			);
		  });
		  sections.push(rdpHtml);
		}
	  }


	
  // ── TOC ───────────────────────────────────────────────────────
  const tocEntries = [{label:'Executive Summary',id:'sec-exec'}];
  const kfVal = document.querySelector('input[name="rb-kf-style"]:checked')?.value||'0';
  if(kfVal!=='0') tocEntries.push({label:'Key Findings',id:'sec-keyfindings'});
  const fiVal = document.querySelector('input[name="rb-fi-style"]:checked')?.value||'0';
  if(fiVal!=='0') tocEntries.push({label:'Future Improvements',id:'sec-futureimprovements'});
  if(sec('overview')) tocEntries.push({label:'Infrastructure Overview',id:'sec-overview'});
  if(sec('hostpools')&&hps.length) tocEntries.push({label:'Host Pools',id:'sec-hostpools'});
  if(sec('scaling')&&arr(D?.scalingPlans).length) tocEntries.push({label:'Scaling Plans',id:'sec-scaling'});
  if(sec('workspaces')&&arr(D?.avdWorkspaces).length) tocEntries.push({label:'Workspaces',id:'sec-workspaces'});
  if(sec('appgroups')&&ags.length) tocEntries.push({label:'Application Groups',id:'sec-appgroups'});
  if(sec('applications')) tocEntries.push({label:'Published Applications',id:'sec-applications'});
  if(sec('desktops')&&ags.filter(g=>g.applicationGroupType==='Desktop').length) tocEntries.push({label:'Session Desktops',id:'sec-desktops'});
  if(sec('sessionhosts')&&shs.length) tocEntries.push({label:'Session Hosts',id:'sec-sessionhosts'});
  if(sec('sessions')&&sessions.length) tocEntries.push({label:'User Sessions',id:'sec-sessions'});
  if(sec('rbac')) tocEntries.push({label:'RBAC Assignments',id:'sec-rbac'});
  if(sec('networking')&&hps.length) tocEntries.push({label:'Networking Configuration',id:'sec-networking'});
  if(sec('fslogix')) tocEntries.push({label:'FSLogix Profile Containers',id:'sec-fslogix'});
  if(sec('cost')&&s.costAvailable) tocEntries.push({label:'Cost & FinOps',id:'sec-cost'});
  if(sec('intelligence')) tocEntries.push({label:'AVD Diagnostics & Insights Coverage',id:'sec-intelligence'});
  if(allRecsCount>0 && !isLive) tocEntries.push({label:'Configuration Findings',id:'sec-recommendations'});
  if(rgsData.length&&sec('rginventory')) tocEntries.push({label:'Appendix A — Resource Group Inventory',id:'sec-rginventory'});
  if(sec('rdpanalysis')&&hps.some(hp=>Object.keys(hp.rdpPropertiesParsed||{}).length)) tocEntries.push({label:'Appendix B — RDP Properties Analysis',id:'sec-rdpanalysis'});

  // ── Document details table (after cover, before TOC) ──────────
  const docDetailsHtml = `
  <div style="margin:0 0 28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px 22px">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:2px;color:#00a8cc;text-transform:uppercase;margin-bottom:10px">Document Details</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:11px">
      <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">CLIENT</span><br><strong>${esc(client)}</strong></div>
      ${LIVE_CONFIG.hiddenDocRows.includes('rb-doc-row-env')||isLive ? '' : `<div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">ENVIRONMENT</span><br>${esc(envName)}</div>`}
      <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">PREPARED BY</span><br>${esc(author)}</div>
      <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">VERSION</span><br>${esc(version)}</div>
      <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">DATE</span><br>${esc(docDate)}</div>
      ${LIVE_CONFIG.hiddenDocRows.includes('rb-doc-row-version')||isLive ? '' : `<div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">DATA COLLECTED</span><br>${dataDate}</div>`}
      <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">SUBSCRIPTION</span><br><span style="font-size:10px">${esc(D?.subscriptionName||'—')}</span></div>
      <div><span style="color:#94a3b8;font-family:'Courier New',monospace;font-size:9px">TENANT</span><br><span style="font-size:10px">${esc(D?.tenantName||D?.tenantId||'—')}</span></div>
    </div>
  </div>`;

  const tocHtml = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:24px 0 32px">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:2px;color:#00a8cc;text-transform:uppercase;margin-bottom:12px">Table of Contents</div>
    ${tocEntries.map((t,i)=>`<div onclick="document.getElementById('${t.id}')?.scrollIntoView({behavior:'smooth'})" style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background=''">
      <span style="font-family:'Courier New',monospace;font-size:10px;color:#94a3b8;width:28px">${String(i+1).padStart(2,'0')}</span>
      <span style="font-size:12px;color:#1e293b">${t.label}</span>
      <span style="margin-left:auto;font-size:10px;color:#00a8cc">↓</span>
    </div>`).join('')}
  </div>`;


		  // ── CSS ───────────────────────────────────────────────────────
	  const css = `
	*{box-sizing:border-box;margin:0;padding:0;}
	body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f3f8;color:#1a2030;font-size:13px;line-height:1.7;}
	.doc-wrap{max-width:960px;margin:0 auto;padding:32px 24px 64px;}
	/* Cover */
	.cover{background:linear-gradient(135deg,#0a0c10 0%,#0d1830 50%,#0a1525 100%);border-radius:10px;padding:0;margin-bottom:32px;overflow:hidden;position:relative;}
	.cover::before{content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;border-radius:50%;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.10);}
	.cover::after{content:'';position:absolute;bottom:-80px;left:40px;width:200px;height:200px;border-radius:50%;background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,0.07);}
	.cover-top{padding:36px 44px 32px;position:relative;z-index:1;}
	.cover-ygit{font-family:'Courier New',monospace;font-size:9px;letter-spacing:3px;color:rgba(0,212,255,0.5);text-transform:uppercase;margin-bottom:24px;display:flex;align-items:center;gap:8px;}
	.cover-ygit::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff;}
	.cover-client{font-size:34px;font-weight:700;color:#ffffff;line-height:1.1;margin-bottom:6px;}
	.cover-env{font-size:15px;color:rgba(255,255,255,0.5);margin-bottom:0;}
	.cover-logo-wrap{position:absolute;top:36px;right:44px;z-index:2;}
	.cover-logo{max-height:56px;max-width:150px;object-fit:contain;border-radius:6px;}
	.cover-rule{height:1px;background:linear-gradient(90deg,rgba(0,212,255,0.3),transparent);margin:0 44px;}
	.cover-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:24px 44px 36px;position:relative;z-index:1;}
	.cover-meta-item label{display:block;font-family:'Courier New',monospace;font-size:8px;letter-spacing:2px;color:rgba(0,212,255,0.5);text-transform:uppercase;margin-bottom:3px;}
	.cover-meta-item span{font-size:11px;color:rgba(255,255,255,0.75);}
	.cover-scope{margin:0 44px 28px;padding:10px 14px;background:rgba(255,255,255,0.04);border-left:3px solid rgba(0,212,255,0.4);font-size:11px;color:rgba(255,255,255,0.55);position:relative;z-index:1;border-radius:0 4px 4px 0;}
	/* Tables */
	table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;border-radius:6px;overflow:hidden;}
	thead tr{background:#0d1117;}
	th{color:#e8edf5;font-family:'Courier New',monospace;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;padding:7px 10px;text-align:left;font-weight:600;}
	td{padding:7px 10px;border-bottom:1px solid #e8edf5;vertical-align:top;color:#1e293b;}
	tr:last-child td{border-bottom:none;}
	tbody tr:nth-child(even) td{background:#f8fafc;}
	code{background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:10px;font-family:'Courier New',monospace;color:#0055aa;}
	hr{border:none;border-top:1px solid #e2e8f0;margin:24px 0;}
	/* Footer */
	.doc-footer{margin-top:48px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-family:'Courier New',monospace;font-size:9px;color:#94a3b8;letter-spacing:0.5px;}
	@media print{
	  body{background:#fff !important;}
	  .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
	  .doc-wrap{padding:8px;}
	  @page{size:A4;margin:14mm 12mm;}
	}`;

	  // ── Assemble ──────────────────────────────────────────────────
	  return `<!DOCTYPE html>
	<html lang="en">
	<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${esc(client)} — AVD Environment Documentation ${esc(version)}</title>
	<style>${css}</style>
	</head>
	<body>
	<div class="doc-wrap">

	  <!-- Cover page -->
	  <div class="cover">
		<div class="cover-top">
		  <div class="cover-ygit">YGIT AVD Intelligence · v1.0</div>
		  ${isLive
			? `<div class="cover-client">${esc(rbMeta('rb-subtitle')||'Azure Virtual Desktop Environment Document')}</div>`
			: `<div class="cover-client">${esc(client)}</div>
		  <div class="cover-env">${esc(rbMeta('rb-subtitle')||'Azure Virtual Desktop Environment Document')}</div>`
		  }
		  ${logoUrl?`<div class="cover-logo-wrap"><img class="cover-logo" src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'"></div>`:''}
		</div>
		<div class="cover-rule"></div>
		<div class="cover-meta">
		  <div class="cover-meta-item"><label>Version</label><span>${esc(version)}</span></div>
		  <div class="cover-meta-item"><label>Date</label><span>${esc(docDate)}</span></div>
		  <div class="cover-meta-item"><label>Prepared By</label><span>${esc(author)}</span></div>
		  <div class="cover-meta-item"><label>Subscription</label><span>${esc(sub)}</span></div>
		  <div class="cover-meta-item"><label>Tenant</label><span>${esc(D?.tenantName||D?.tenantId||'—')}</span></div>
		  <div class="cover-meta-item"><label>Data Collected</label><span>${D?.generatedAt?(new Date(D.generatedAt).toLocaleDateString('en-AU')):'—'}</span></div>
		</div>
		${scope?`<div class="cover-scope"><strong>Scope:</strong> ${esc(scope)}</div>`:''}
	  </div>

	  <!-- Document details -->
	  ${docDetailsHtml}

	  <!-- TOC -->
	  ${tocHtml}

	  <!-- Sections -->
	  ${sections.join('\n')}

	  <!-- Live mode note -->
	  ${D?.displayConfig?.isLiveMode ? `<p style="font-size:10px;color:#64748b;font-style:italic;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:24px;text-align:center">This document reflects a point-in-time snapshot of the Azure Virtual Desktop environment collected via Connect Live on ${D.generatedAt ? new Date(D.generatedAt).toLocaleDateString('en-AU') : '—'}. Configuration findings, FSLogix analysis, cost intelligence, KQL analytics and networking deep-dive are available via the full PS1 assessment.</p>` : ''}

	  <!-- Footer -->
	  <div class="doc-footer">
		<span>Generated by YGIT AVD Intelligence v5.0</span>
		<span>${esc(now)}</span>
	  </div>

	</div>
	</body>
	</html>`;
	}


	
	// ── DOCX Builder — loads docx.js on demand to avoid CDN blocking ──
	async function rbBuildDOCX(sub){
	  // ── Try 3 CDNs for true .docx, silently fall back to .doc ──────
	  // No modals, no errors shown to user — best available format wins.

	  async function tryDocxCDN(){
		const CDNS=[
		  'https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/index.min.js',
		  'https://unpkg.com/docx@8.5.0/build/index.min.js',
		  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.min.js',
		];
		for(const url of CDNS){
		  try{
			await new Promise((resolve,reject)=>{
			  const s=document.createElement('script');
			  s.src=url;
			  const t=setTimeout(()=>{s.onload=s.onerror=null;reject();},6000);
			  s.onload=()=>{clearTimeout(t);resolve();};
			  s.onerror=()=>{clearTimeout(t);reject();};
			  document.head.appendChild(s);
			});
			if(window.docx) return true; // loaded successfully
		  }catch(e){}
		}
		return false;
	  }

	  // Show loading state on button
	  const btn=$('rb-preview-btn');
	  const origBtnHtml=btn?btn.innerHTML:'';
	  if(btn) btn.innerHTML='⏳ Preparing Word file…';

	  const cdnLoaded = !window.docx ? await tryDocxCDN() : true;

	  if(cdnLoaded && window.docx){
		// ── TRUE .docx via docx.js ─────────────────────────────────
		if(btn) btn.innerHTML='⏳ Building .docx…';
		try{
		  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
				  TableBorders, WidthType, BorderStyle, AlignmentType, PageBreak,
				  ShadingType, UnderlineType, Header, Footer } = window.docx;

		  const client  = rbMeta('rb-client') || D?.subscriptionName || '—';
		  const envName = rbMeta('rb-env')    || D?.subscriptionName || '—';
		  const author  = rbMeta('rb-author') || 'YGIT';
		  const version = rbMeta('rb-version')|| 'v1.0';
		  const docDate = rbMeta('rb-date')   || new Date().toLocaleDateString('en-AU');
		  const scope   = rbMeta('rb-scope');
		  const notes   = rbMeta('rb-notes');
		  const s       = D?.summary||{};
		  const cur     = s.currency||'';
		  const hps     = arr(D?.hostPools);
		  const ags     = arr(D?.applicationGroups);
		  const shs     = arr(D?.sessionHosts).length?arr(D?.sessionHosts):hps.flatMap(hp=>arr(hp.sessionHosts));
		  const sessions= arr(D?.sessions).length?arr(D?.sessions):hps.flatMap(hp=>arr(hp.sessionHosts).flatMap(sh=>arr(sh.sessions)));
		  const secFn   = id => rbState.sections.has(id);
		  const allF    = hps.flatMap(hp=>arr(hp.securityFindings));
		  const shutdownHosts = s.shutdownHosts||0;
		  const activeHosts   = (s.totalSessionHosts||0) - shutdownHosts;
		  const prodHps       = hps.filter(hp=>!/uat|dev|test/i.test(hp.name||''));
		  const prodPoolsWithoutScaling = prodHps.filter(hp=>!hp.hasScalingPlan).length;
		  const diagNote      = hps.length>prodHps.length?` (${hps.length-prodHps.length} non-prod excluded)`:'';
		  const proj    = costProjection(s.currentMonthCost, D?.generatedAt);

		  const C = {
			CYAN:'0099BB',DARK:'0D1117',WHITE:'FFFFFF',LIGHT:'F8FAFC',
			RED:'DC2626',RED_L:'FEE2E2',AMBER:'D97706',AMBER_L:'FEF3C7',
			GREEN:'059669',GREEN_L:'D1FAE5',BLUE:'2563EB',BLUE_L:'DBEAFE',
			PURPLE:'7C3AED',PURPLE_L:'EDE9FE',MUTED:'64748B',MUTED2:'94A3B8',BODY:'1E293B',
		  };
		  const sz=n=>n*2;
		  function run(text,opts={}){ return new TextRun({text:String(text??''),font:'Calibri',size:sz(11),color:C.BODY,...opts}); }
		  function runMono(text,opts={}){ return new TextRun({text:String(text??''),font:'Courier New',size:sz(9),color:C.MUTED,...opts}); }
		  function para(children,spacing={after:80},alignment){ const runs=Array.isArray(children)?children:[run(children)]; return new Paragraph({children:runs,spacing,alignment}); }
		  function pageBreak(){ return new Paragraph({children:[new PageBreak()],spacing:{after:0}}); }
		  function sectionH(num,title,subtitle){ return new Paragraph({children:[new TextRun({text:String(num).padStart(2,'0')+'  ',font:'Courier New',size:sz(11),color:C.CYAN,bold:true}),new TextRun({text:title,font:'Calibri',size:sz(16),bold:true,color:C.DARK}),...(subtitle?[new TextRun({text:'  '+subtitle,font:'Courier New',size:sz(9),color:C.MUTED2})]:[] )],border:{bottom:{style:BorderStyle.SINGLE,size:6,color:C.CYAN,space:4}},spacing:{before:sz(20),after:sz(10)}}); }
		  function subH(text,colour){ return new Paragraph({children:[new TextRun({text,font:'Calibri',size:sz(13),bold:true,color:colour||C.DARK})],spacing:{before:sz(12),after:sz(6)}}); }
		  function divider(){ return new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:1,color:C.CYAN}},spacing:{after:120,before:120},children:[new TextRun('')]}); }
		  const NB={style:BorderStyle.NONE},THIN={style:BorderStyle.SINGLE,size:1,color:'E8EDF5'},CYANB={style:BorderStyle.SINGLE,size:2,color:C.CYAN};
		  function kvTable(pairs){ return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:pairs.map((p,i)=>new TableRow({children:[new TableCell({children:[para([runMono(String(p[0]),{color:C.MUTED})],{after:0})],shading:{type:ShadingType.SOLID,fill:i%2===0?C.LIGHT:C.WHITE},borders:{top:NB,bottom:THIN,left:NB,right:NB},margins:{top:50,bottom:50,left:80,right:80},width:{size:35,type:WidthType.PERCENTAGE}}),new TableCell({children:[para([run(String(p[1]??'—'),{size:sz(10)})],{after:0})],shading:{type:ShadingType.SOLID,fill:i%2===0?C.LIGHT:C.WHITE},borders:{top:NB,bottom:THIN,left:NB,right:NB},margins:{top:50,bottom:50,left:80,right:80}})]})),spacing:{after:160}}); }
		  function dataTable(headers,rows){ const hRow=new TableRow({children:headers.map(h=>new TableCell({children:[para([runMono(h.toUpperCase(),{color:C.WHITE,bold:true})],{after:0})],shading:{type:ShadingType.SOLID,fill:C.DARK},borders:{top:NB,bottom:CYANB,left:NB,right:NB},margins:{top:60,bottom:60,left:80,right:80}})),tableHeader:true}); const dRows=rows.map((row,ri)=>new TableRow({children:row.map(cell=>new TableCell({children:[para([run(String(cell??'—'),{size:sz(10)})],{after:0})],shading:{type:ShadingType.SOLID,fill:ri%2===0?C.LIGHT:C.WHITE},borders:{top:NB,bottom:THIN,left:NB,right:NB},margins:{top:50,bottom:50,left:80,right:80}}))})); return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[hRow,...dRows],spacing:{after:160}}); }
		  function kpiTable(boxes){ const cols={cyan:C.CYAN,green:C.GREEN,red:C.RED,amber:C.AMBER,blue:C.BLUE,purple:C.PURPLE,gray:C.MUTED},lightCols={cyan:'E0F9FF',green:C.GREEN_L,red:C.RED_L,amber:C.AMBER_L,blue:C.BLUE_L,purple:C.PURPLE_L,gray:C.LIGHT}; const cells=boxes.map(b=>{ const ac=cols[b.colour||'cyan'],bg=lightCols[b.colour||'cyan']; return new TableCell({children:[para([runMono(b.label.toUpperCase(),{letterSpacing:40})],{after:40}),para([new TextRun({text:String(b.value??'—'),font:'Calibri',size:sz(20),bold:true,color:ac})],{after:20}),...(b.sub?[para([runMono(b.sub)],{after:0})]:[] )],shading:{type:ShadingType.SOLID,fill:bg},borders:{top:{style:BorderStyle.SINGLE,size:6,color:ac},bottom:NB,left:NB,right:NB},margins:{top:80,bottom:80,left:80,right:80}}); }); while(cells.length<4)cells.push(new TableCell({children:[para('')],shading:{type:ShadingType.SOLID,fill:C.LIGHT},borders:{top:NB,bottom:NB,left:NB,right:NB}})); return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:cells.slice(0,4)})],spacing:{after:160}}); }
		  function findingP(sev,text){ const cs={Critical:C.RED,High:C.AMBER,Medium:C.AMBER,Low:C.MUTED}; return new Paragraph({children:[runMono('['+sev.toUpperCase()+']  ',{color:cs[sev]||C.MUTED,bold:true}),run(text,{size:sz(10)})],border:{left:{style:BorderStyle.SINGLE,size:12,color:cs[sev]||C.MUTED,space:6}},indent:{left:120},spacing:{after:60}}); }

		  const children=[]; let secNum=1;
		  // Cover
		  children.push(para([runMono('YGIT AVD INTELLIGENCE  ·  v1.0',{color:C.CYAN,bold:true,letterSpacing:60})],{after:sz(8)}));
		  children.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:2,color:C.CYAN}},spacing:{after:sz(12)},children:[new TextRun('')]}));
		  children.push(para([new TextRun({text:client,font:'Calibri',size:sz(32),bold:true,color:C.DARK})],{after:sz(4)}));
		  children.push(para([run((D?.tenantName||D?.tenantId||'—')+' · Azure Virtual Desktop Environment Report',{color:C.MUTED,size:sz(12)})],{after:sz(16)}));
		  children.push(kvTable([['Version',version],['Date',docDate],['Prepared By',author],['Subscription',D?.subscriptionName||D?.subscriptionId||'—'],['Tenant',D?.tenantName||D?.tenantId||'—'],['Environment',envName],['Data Collected',D?.generatedAt?(new Date(D.generatedAt).toLocaleDateString('en-AU')):'—']]));
		  if(scope) children.push(para([runMono('Scope: ',{bold:true}),run(scope,{italics:true,color:C.MUTED})],{after:80}));
		  children.push(pageBreak());
		  // TOC
		  children.push(sectionH(0,'Table of Contents'));
		  children.push(para('',{after:80}));
		  const tocItems2=[{label:'Executive Summary'}];
		  if(secFn('overview')) tocItems2.push({label:'Infrastructure Overview'});
		  if(secFn('hostpools')&&hps.length) tocItems2.push({label:'Host Pools'});
		  if(secFn('scaling')&&arr(D?.scalingPlans).length) tocItems2.push({label:'Scaling Plans'});
		  if(secFn('workspaces')&&arr(D?.avdWorkspaces).length) tocItems2.push({label:'Workspaces'});
		  if(secFn('appgroups')&&ags.length) tocItems2.push({label:'Application Groups'});
		  if(secFn('applications')) tocItems2.push({label:'Published Applications'});
		  if(secFn('desktops')&&ags.filter(g=>g.applicationGroupType==='Desktop').length) tocItems2.push({label:'Session Desktops'});
		  if(secFn('sessionhosts')&&shs.length) tocItems2.push({label:'Session Hosts'});
		  if(secFn('sessions')&&sessions.length) tocItems2.push({label:'User Sessions'});
		  if(secFn('rbac')) tocItems2.push({label:'RBAC Assignments'});
		  if(secFn('networking')&&hps.length) tocItems2.push({label:'Networking Configuration'});
		  if(secFn('fslogix')) tocItems2.push({label:'FSLogix Profile Containers'});
		  if(secFn('cost')&&s.costAvailable) tocItems2.push({label:'Cost & FinOps'});
		  if(secFn('intelligence')&&D?.metrics?.querySupported) tocItems2.push({label:'KQL Analytics'});
		  if(arr(D?.resourceGroups).length&&secFn('rginventory')) tocItems2.push({label:'Appendix A — Resource Group Inventory'});
		  tocItems2.forEach((t,i)=>children.push(new Paragraph({children:[runMono(String(i+1).padStart(2,'0')+'  ',{color:C.CYAN}),run(t.label,{size:sz(11)})],spacing:{after:50}})));
		  children.push(pageBreak());
		  // Exec Summary
		  const critF=allF.filter(f=>f.severity==='Critical').length,highF=allF.filter(f=>f.severity==='High').length;
		  children.push(sectionH(secNum++,'Executive Summary'));
		  children.push(para([run('This document provides a technical assessment of the Azure Virtual Desktop environment for '),run(client,{bold:true}),run(', collected on '),run(D?.generatedAt?new Date(D.generatedAt).toLocaleDateString('en-AU'):docDate,{bold:true}),run(' and prepared by '),run(author,{bold:true}),run('.')],{after:100}));
		  children.push(para([run('The environment comprises '),run(String(s.hostPoolCount||0),{bold:true}),run(` host pool${(s.hostPoolCount||0)!==1?'s':''} hosting `),run(String(s.totalSessionHosts||0),{bold:true}),run(` session host${(s.totalSessionHosts||0)!==1?'s':''} with an overall health of `),run(String(s.overallHealthPct||0)+'%',{bold:true,color:s.overallHealthPct>=80?C.GREEN:s.overallHealthPct>=60?C.AMBER:C.RED}),run('. There are '),run(String(s.totalActiveSessions||0),{bold:true}),run(' active and '),run(String(s.totalDisconnectedSessions||0),{bold:true}),run(' disconnected sessions.')],{after:100}));
		  if(allF.length) children.push(para([new TextRun({text:`⚠  ${allF.length} finding${allF.length!==1?'s':''} identified — ${critF} critical, ${highF} high`,font:'Calibri',size:sz(11),bold:true,color:critF>0?C.RED:C.AMBER})],{after:80}));
		  else children.push(para([run('✓  No security findings identified.',{bold:true,color:C.GREEN})],{after:80}));
		  if(s.costAvailable&&s.currentMonthCost!=null){ const p2=costProjection(s.currentMonthCost,D?.generatedAt); children.push(para(`Month-to-date AVD spend is ${cur} ${s.currentMonthCost.toFixed(2)}${p2?`, tracking to ~${cur} ${p2.toFixed(2)} by end of month`:''}${s.previousMonthCost&&p2?` (${p2>s.previousMonthCost?'↑':'↓'}${Math.abs(Math.round(((p2-s.previousMonthCost)/s.previousMonthCost)*100))}% vs last month)`:''}.`,{after:100})); }
		  if(scope){ children.push(divider()); children.push(para([runMono('Scope: ',{bold:true}),run(scope,{italics:true})],{after:80})); }
		  children.push(kpiTable([{label:'Host Pools',value:s.hostPoolCount||0,sub:`${s.pooledHostPools||0} pooled`,colour:'cyan'},{label:'Session Hosts',value:s.totalSessionHosts||0,sub:`${s.availableHosts||0} avail · ${shutdownHosts} off`,colour:s.overallHealthPct>=80?'green':'amber'},{label:'Active Sessions',value:s.totalActiveSessions||0,sub:`${s.totalDisconnectedSessions||0} disc`,colour:'blue'},{label:'Health',value:(s.overallHealthPct||0)+'%',sub:`${prodHps.filter(hp=>hp.diagnosticsEnabled).length}/${prodHps.length} diag${diagNote}`,colour:s.overallHealthPct>=80?'green':s.overallHealthPct>=60?'amber':'red'}]));
		  if(s.costAvailable) children.push(kpiTable([{label:'Prev Month',value:s.previousMonthCost!=null?`${cur} ${s.previousMonthCost.toFixed(0)}`:'—',sub:s.previousMonthFrom||'not collected',colour:'gray'},{label:'This Month MTD',value:`${cur} ${s.currentMonthCost?.toFixed(0)||'—'}`,sub:'month to date',colour:'cyan'},{label:'Projected EOM',value:costProjection(s.currentMonthCost,D?.generatedAt)?`${cur} ${costProjection(s.currentMonthCost,D?.generatedAt).toFixed(0)}`:'—',sub:'estimate',colour:'amber'},{label:'Wasted Spend',value:s.wastedSpendEstimate?`${cur} ${s.wastedSpendEstimate.toFixed(0)}`:'—',sub:`${s.wastedSpendHosts||0} idle`,colour:s.wastedSpendEstimate>0?'amber':'green'}]));
		  children.push(pageBreak());
		  // Overview
		  if(secFn('overview')){ children.push(sectionH(secNum++,'Infrastructure Overview',D?.subscriptionName||'')); children.push(kvTable([['Subscription',D?.subscriptionName||D?.subscriptionId||'—'],['Tenant',D?.tenantName||D?.tenantId||'—'],['Data Collected',D?.generatedAt?(new Date(D.generatedAt).toLocaleString()):'—'],['Host Pools',`${s.hostPoolCount||0} (${s.pooledHostPools||0} pooled, ${s.personalHostPools||0} personal)`],['Session Hosts',`${s.totalSessionHosts||0} (${s.availableHosts||0} available)`],['Active Sessions',s.totalActiveSessions||0],['Application Groups',s.applicationGroupCount||0],['Scaling Plans',`${s.scalingPlanCount||0} (${prodPoolsWithoutScaling} prod pools without)`],['FSLogix',`${s.hostsWithFSLogixDetected||0} of ${s.totalSessionHosts||0} hosts`],['Health',`${s.overallHealthPct||0}%`]])); if(allF.length){children.push(subH('Security Findings',C.RED));allF.forEach(f=>children.push(findingP(f.severity,f.finding)));} }
		  // Host Pools
		  if(secFn('hostpools')&&hps.length){ children.push(pageBreak()); children.push(sectionH(secNum++,'Host Pools',`${hps.length} pool${hps.length!==1?'s':''}`)); children.push(kpiTable([{label:'Total',value:hps.length,sub:`${s.pooledHostPools||0} pooled`,colour:'cyan'},{label:'Capacity',value:hps.reduce((a,hp)=>a+(hp.totalCapacity||0),0),sub:'max sessions',colour:'blue'},{label:'Active Sessions',value:s.totalActiveSessions||0,colour:'green'},{label:'Drain Mode',value:s.drainModeHosts||0,colour:(s.drainModeHosts||0)>0?'amber':'green'}])); hps.forEach(hp=>{ const hpF=arr(hp.securityFindings); children.push(subH(`${hp.name}  [${hp.hostPoolType}]`,C.CYAN)); children.push(kvTable([...(hp.friendlyName&&hp.friendlyName!==hp.name?[['Friendly Name',hp.friendlyName]]:[]),['Resource Group',hp.resourceGroup||'—'],['Location',hp.location||'—'],['Load Balancer',hp.loadBalancerType||'—'],['Max Sessions',hp.maxSessionLimit??'—'],['Preferred App Type',hp.preferredAppGroupType||'—'],['Public Network',hp.publicNetworkAccess===false?'Private Only':'Enabled'],['Start VM on Connect',hp.startVMOnConnect?'Enabled':'Disabled'],['Session Hosts',`${hp.sessionHostCount||0} (${hp.sessionHostsAvailable||0} avail)`],['Active / Disc.',`${hp.activeSessions||0} active · ${hp.disconnectedSessions||0} disconnected`],['Health',`${hp.healthPct??0}%`],['Diagnostics',hp.diagnosticsEnabled?'Enabled':'Not configured'],['Scaling Plan',arr(hp.scalingPlans).map(sp=>sp.name).join(', ')||'None'],...( hp.description?[['Description',hp.description]]:[]),...( Object.keys(hp.tags||{}).length?[['Tags',Object.entries(hp.tags).map(([k,v])=>k+': '+v).join(', ')]]:[]),['Resource ID',hp.id||'—']])); if(hpF.length) hpF.forEach(f=>children.push(findingP(f.severity,f.finding))); }); }
		  // Session Hosts
		  if(secFn('workspaces')&&arr(D?.avdWorkspaces).length){ const wssD=arr(D?.avdWorkspaces); children.push(pageBreak()); children.push(sectionH(secNum++,'Workspaces',`${wssD.length} workspace${wssD.length!==1?'s':''}`)); wssD.forEach(ws=>{ const wsAgsD=ags.filter(ag=>ag.workspaceId===ws.id||ag.workspaceName===ws.name); children.push(subH((ws.friendlyName&&ws.friendlyName!==ws.name?ws.friendlyName+' ('+ws.name+')':ws.name),C.CYAN)); children.push(kvTable([['Resource Group',ws.resourceGroup||'—'],['Location',ws.location||'—'],['Friendly Name',ws.friendlyName||'—'],['Diagnostics',ws.diagnosticsEnabled?'Enabled':'Not Configured'],['App Groups',wsAgsD.map(ag=>ag.name).join(', ')||'None'],...(ws.description?[['Description',ws.description]]:[]),...(Object.keys(ws.tags||{}).length?[['Tags',Object.entries(ws.tags).map(([k,v])=>k+': '+v).join(', ')]]:[]),['Resource ID',ws.id||'—']])); }); }
		  const deskAgsD=ags.filter(g=>g.applicationGroupType==='Desktop');
		  if(secFn('appgroups')&&ags.length){ children.push(pageBreak()); children.push(sectionH(secNum++,'Application Groups',`${ags.length} group${ags.length!==1?'s':''}`)); ags.forEach(ag=>{ const allA=[...arr(ag.assignedUsers),...arr(ag.assignedGroups)]; children.push(subH(ag.name,C.CYAN)); children.push(kvTable([['Type',ag.applicationGroupType||'—'],['Host Pool',ag.hostPoolName||'—'],['Workspace',ag.workspaceFriendlyName||ag.workspaceName||'—'],['Resource Group',ag.resourceGroup||'—'],['Location',ag.location||'—'],['Diagnostics',ag.diagnosticsEnabled?'Enabled':'Not Configured'],['Assignees',allA.length+' ('+arr(ag.assignedGroups).length+' groups, '+arr(ag.assignedUsers).length+' users)'],...(ag.description?[['Description',ag.description]]:[]),...(Object.keys(ag.tags||{}).length?[['Tags',Object.entries(ag.tags).map(([k,v])=>k+': '+v).join(', ')]]:[]),['Resource ID',ag.id||'—']])); }); }
		  if(secFn('desktops')&&deskAgsD.length){ children.push(pageBreak()); children.push(sectionH(secNum++,'Session Desktops',`${deskAgsD.length} desktop${deskAgsD.length!==1?'s':''}`)); children.push(dataTable(['Name','Friendly Name','Workspace','Host Pool','Show in Portal','Assignees'],deskAgsD.map(ag=>[esc(ag.name||'—'),esc(ag.friendlyName&&ag.friendlyName!==ag.name?ag.friendlyName:'—'),esc(ag.workspaceFriendlyName||ag.workspaceName||'—'),esc(ag.hostPoolName||'—'),ag.showInPortal!==false?'Visible':'Hidden',[...arr(ag.assignedUsers),...arr(ag.assignedGroups)].length+' assigned']))); }
		  if(secFn('sessionhosts')&&shs.length){ const avail=shs.filter(s=>s.status==='Available').length,unavail=shs.filter(s=>s.status==='Unavailable').length,drain=shs.filter(s=>s.drainMode).length; children.push(pageBreak()); children.push(sectionH(secNum++,'Session Hosts',`${shs.length} host${shs.length!==1?'s':''}`)); children.push(kpiTable([{label:'Available',value:avail,sub:`of ${shs.length}`,colour:avail===shs.length?'green':'amber'},{label:'Unavailable',value:unavail,colour:unavail>0?'red':'green'},{label:'Drain Mode',value:drain,colour:drain>0?'amber':'green'},{label:'FSLogix',value:(s.hostsWithFSLogixDetected||0)+'/'+shs.length,colour:s.hostsWithFSLogixDetected===shs.length?'green':'amber'}])); children.push(dataTable(['Session Host','Host Pool','Status','VM Size','Sessions','Patch','FSLogix'],shs.map(sh=>{const ps=patchStatus(sh.lastUpdate);return[sh.vmName||sh.name||'—',sh.hostPoolName||'—',sh.status||'—',sh.vmSize||'—',(sh.activeSessions||0)+' active',ps.label,sh.fslogixDetected?'✓':'—'];}))); }
		  // Scaling Plans
		  if(secFn('scaling')&&arr(D?.scalingPlans).length){ const spsW=arr(D.scalingPlans); children.push(pageBreak()); children.push(sectionH(secNum++,'Scaling Plans',`${spsW.length} plan${spsW.length!==1?'s':''}`)); spsW.forEach(sp=>{ children.push(subH(sp.name,C.CYAN)); children.push(kvTable([['Resource Group',sp.resourceGroup||'—'],['Location',sp.location||'—'],['Host Pool Type',sp.hostPoolType||'—'],['Host Pools',arr(sp.hostPoolReferences).map(r=>r.hostPoolId.split('/').pop()).join(', ')||'—'],...(Object.keys(sp.tags||{}).length?[['Tags',Object.entries(sp.tags).map(([k,v])=>k+': '+v).join(', ')]]:[]),['Resource ID',sp.id||'—']])); }); }
		  // Applications
		  if(secFn('applications')){ const allApps=ags.filter(g=>g.applicationGroupType==='RemoteApp').flatMap(g=>arr(g.remoteApps).map(a=>({...a,agName:g.name,agHostPool:g.hostPoolName}))); if(allApps.length){ children.push(pageBreak()); children.push(sectionH(secNum++,'Published Applications',`${allApps.length} app${allApps.length!==1?'s':''}`)); children.push(dataTable(['Application','Friendly Name','App Group','File Path','Visible'],allApps.map(a=>[a.name?.split('/').pop()||'—',a.friendlyName||'—',a.agName||'—',a.filePath||'—',a.showInPortal?'Yes':'No']))); } }
		  // User Sessions
		  if(secFn('sessions')&&sessions.length){ const active=sessions.filter(s=>s.sessionState==='Active'),disc=sessions.filter(s=>s.sessionState==='Disconnected'); children.push(pageBreak()); children.push(sectionH(secNum++,'User Sessions',`${sessions.length} session${sessions.length!==1?'s':''}`)); children.push(kpiTable([{label:'Total',value:sessions.length,colour:'cyan'},{label:'Active',value:active.length,colour:'green'},{label:'Disconnected',value:disc.length,colour:disc.length>0?'amber':'green'},{label:'Unique Users',value:new Set(sessions.map(s=>s.userPrincipalName).filter(Boolean)).size,colour:'blue'}])); children.push(dataTable(['User','State','Session Host','Host Pool','Type','Connected'],sessions.map(s=>[s.userPrincipalName||'Unknown',s.sessionState||'—',(s.sessionHostName||'—').split('.')[0],s.hostPoolName||'—',s.applicationType||'Desktop',s.createTime||'—']))); }
		  // RBAC
		  if(secFn('rbac')){ const all=ags.flatMap(ag=>[...arr(ag.assignedUsers),...arr(ag.assignedGroups)].map(a=>({...a,scope:ag.name}))); if(all.length){ const groups=all.filter(a=>a.objectType==='Group').length,direct=all.filter(a=>a.objectType==='User').length; children.push(pageBreak()); children.push(sectionH(secNum++,'RBAC Assignments',`${all.length} total`)); children.push(para([run('⚠ Only AVD-specific roles are shown (Desktop Virtualization & VM Login roles). Subscription-level roles (Owner, Contributor, Reader) are excluded — review Azure RBAC for full inheritance.',{color:'#92400e',size:sz(8)})],{before:sz(2),after:sz(4)})); children.push(kpiTable([{label:'Total',value:all.length,colour:'cyan'},{label:'Groups',value:groups,colour:'green'},{label:'Direct Users',value:direct,colour:direct>0?'amber':'green'},{label:'Roles',value:new Set(all.map(a=>a.role).filter(Boolean)).size,colour:'blue'}])); children.push(dataTable(['Principal','Type','Role','Scope'],all.map(a=>[a.displayName||a.signInName||a.objectId||'—',a.objectType||'—',a.role||'—',a.scope||'—']))); } }
		  // Networking
		  if(secFn('networking')&&hps.length){ const netW=D?.networking||null; children.push(pageBreak()); children.push(sectionH(secNum++,'Networking Configuration')); children.push(kpiTable([{label:'Host Pools',value:hps.length,colour:'cyan'},{label:'vNets',value:netW?arr(netW.virtualNetworks).length:0,colour:'blue'},{label:'NAT Gateways',value:netW?arr(netW.natGateways).length:0,colour:arr(netW?.natGateways).length>0?'green':'amber'},{label:'Session Hosts with IP',value:shs.filter(s=>s.privateIP&&s.privateIP!=='Not assigned').length,colour:'green'}])); children.push(subH('Host Pool Configuration')); children.push(dataTable(['Host Pool','Type','Load Balancer','Max Sessions','Start VM on Connect'],hps.map(hp=>[hp.name,hp.hostPoolType||'—',hp.loadBalancerType||'—',hp.maxSessionLimit??'—',hp.startVMOnConnect?'Yes':'No']))); const shsWithIP=shs.filter(s=>s.privateIP&&s.privateIP!=='Not assigned'); if(shsWithIP.length){ children.push(subH('Session Host Network Details')); children.push(dataTable(['Session Host','Host Pool','Private IP','vNet','Subnet'],shsWithIP.map(sh=>[sh.vmName||sh.name||'—',sh.hostPoolName||'—',sh.privateIP||'—',sh.virtualNetwork||'—',sh.subnet||'—']))); } if(netW&&arr(netW.virtualNetworks).length){ children.push(subH('Virtual Network Summary')); arr(netW.virtualNetworks).forEach(function(vnet){ const natNames=[...new Set(arr(vnet.subnets).map(function(s){return s.natGatewayName;}).filter(Boolean))]; children.push(para([run(vnet.name,{bold:true,color:C.CYAN})],{after:sz(2)})); children.push(kvTable([['Location',vnet.location||'—'],['Subnets',arr(vnet.subnets).length],['NAT Gateway',natNames.join(', ')||'None — default SNAT'],['AVD Subnets',arr(vnet.subnets).filter(function(s){return s.sessionHostCount>0;}).map(function(s){return s.name+'('+s.sessionHostCount+' hosts)';}).join(', ')||'—']])); }); } }
		  // Cost
		  if(secFn('cost')&&s.costAvailable){ const hpCosts=hps.filter(hp=>hp.currentMonthCost!=null).sort((a,b)=>b.currentMonthCost-a.currentMonthCost); const p3=costProjection(s.currentMonthCost,D?.generatedAt); children.push(pageBreak()); children.push(sectionH(secNum++,'Cost & FinOps','Month-to-Date')); children.push(kpiTable([{label:'Prev Month',value:s.previousMonthCost!=null?`${cur} ${s.previousMonthCost.toFixed(0)}`:'—',colour:'gray'},{label:'MTD',value:`${cur} ${s.currentMonthCost?.toFixed(0)||'—'}`,colour:'cyan'},{label:'Projected EOM',value:p3?`${cur} ${p3.toFixed(0)}`:'—',colour:'amber'},{label:'Wasted',value:s.wastedSpendEstimate?`${cur} ${s.wastedSpendEstimate.toFixed(0)}`:'—',colour:s.wastedSpendEstimate>0?'amber':'green'}])); if(s.previousMonthCost!=null&&p3!=null){const delta=p3-s.previousMonthCost,pct=Math.round((delta/s.previousMonthCost)*100);children.push(para([new TextRun({text:(delta>0?'↑ ':'↓ '),font:'Calibri',size:sz(14),bold:true,color:delta>0?C.RED:C.GREEN}),run(`${delta>0?'+':''}${cur} ${Math.abs(delta).toFixed(2)} (${delta>0?'+':''}${pct}%) vs last month`,{bold:true,color:delta>0?C.RED:C.GREEN})],{after:100}));} if(hpCosts.length){children.push(subH('Cost by Host Pool'));children.push(dataTable(['Host Pool','Cost MTD','% of Total'],hpCosts.map(hp=>[hp.name,`${cur} ${hp.currentMonthCost.toFixed(2)}`,Math.round((hp.currentMonthCost/(s.currentMonthCost||1))*100)+'%'])));} }
		  // FSLogix
		  if(secFn('fslogix')){ const fc=D?.fslogixCoverage||{},covPct=fc.coveragePct??0,sas=arr(fc.storageAccounts); children.push(pageBreak()); children.push(sectionH(secNum++,'FSLogix Profile Containers')); children.push(kpiTable([{label:'Coverage',value:covPct+'%',sub:`${fc.hostsWithFSLogix||0}/${fc.totalHosts||shs.length}`,colour:covPct>=80?'green':covPct>=50?'amber':'red'},{label:'With',value:fc.hostsWithFSLogix||0,colour:'green'},{label:'Without',value:arr(fc.hostsWithout).length||0,colour:arr(fc.hostsWithout).length>0?'amber':'green'},{label:'Slow Mounts',value:arr(D?.metrics?.fslogixSlowMounts).length||0,colour:arr(D?.metrics?.fslogixSlowMounts).length>0?'amber':'green'}])); if(arr(fc.hostsWithout).length) children.push(para([runMono('Hosts without FSLogix: ',{bold:true,color:C.AMBER}),run(arr(fc.hostsWithout).join(', '),{color:C.MUTED})],{after:80})); if(fc.fslogixCoverageNote) children.push(para([run(fc.fslogixCoverageNote,{italics:true,color:C.MUTED,size:sz(10)})],{after:80})); if(sas.length){ children.push(para([runMono('PROFILE STORAGE ACCOUNTS',{bold:true,letterSpacing:40,color:C.CYAN})],{before:sz(8),after:sz(4)})); sas.forEach(sa=>{ children.push(para([run(sa.storageAccount,{bold:true,size:sz(11)}),run('  '+sa.sku+'  '+sa.resourceGroup+' · '+sa.location,{size:sz(9),color:C.MUTED})],{after:sz(2)})); if(sa.storageAccountUrl) children.push(para([runMono('Storage URL: ',{bold:true,size:sz(9)}),runMono(sa.storageAccountUrl,{color:C.CYAN,size:sz(9)})],{after:sz(2)})); const shares=arr(sa.shares); if(shares.length) children.push(dataTable(['Share Name','Quota (GiB)','Used (GiB)','Utilisation','Tier','Share URL'],shares.map(sh=>{ const pct=sh.quotaGiB>0?Math.round((sh.usedGiB/sh.quotaGiB)*100)+'%':'—'; return[sh.name||'—',sh.quotaGiB||'No quota',sh.usedGiB??'—',pct,sh.tier||'—',sh.shareUrl||'—']; }))); }); } }
		  // RG Inventory
		  const rgsData2=arr(D?.resourceGroups).filter(rg=>rg!=null); if(rgsData2.length&&secFn('rginventory')){ children.push(pageBreak()); children.push(sectionH(secNum++,'Appendix A — Resource Group Inventory',`${rgsData2.reduce((a,rg)=>a+(rg.resourceCount||arr(rg.resources).length),0)} resources`)); rgsData2.forEach(rg=>{ const res=arr(rg.resources); children.push(subH(`${rg.name}  (${rg.resourceCount||res.length} resources)`)); children.push(dataTable(['Resource','Type','Location'],res.map(r=>[r.name,r.shortType||'—',r.location||'—']))); }); }
		  // Footer
		  children.push(divider()); children.push(new Paragraph({children:[new TextRun({text:'Generated by YGIT AVD Intelligence v5.0  ·  '+new Date().toLocaleString(),font:'Courier New',size:sz(8),color:C.MUTED2,italics:true})],alignment:AlignmentType.CENTER,spacing:{before:120}}));

		  const doc=new Document({creator:author,title:`${client} — AVD Documentation`,styles:{default:{document:{run:{font:'Calibri',size:sz(11),color:C.BODY}}}},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:720,bottom:720,left:900,right:900}}},children}]});
		  const blob=await Packer.toBlob(doc);
		  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='YGIT-AVDIntelligence-'+sub+'.docx';
		  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
		  if(btn){ btn.innerHTML='✓ Downloaded .docx'; setTimeout(()=>rbSetPreviewBtn(rbState.dirty),2500); }
		  return;
		}catch(err){
		  console.warn('docx.js build failed, falling back to .doc:',err);
		}
	  }

	  // ── Fallback: HTML-to-Word .doc (works offline, no CDN needed) ─
	  const htmlDoc=rbBuildHTMLDoc();
	  const wordDoc=`<!DOCTYPE html>\n<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n<head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]--><style>@page{size:A4;margin:2cm 2.5cm;mso-page-orientation:portrait;}body{font-family:Calibri,sans-serif;font-size:11pt;}.cover{background:#0A1020!important;-webkit-print-color-adjust:exact;}</style></head>\n<body>${htmlDoc.replace(/^[\s\S]*?<body[^>]*>/,'').replace(/<\/body>[\s\S]*$/,'')}</body></html>`;
	  const blob=new Blob([wordDoc],{type:'application/vnd.ms-word;charset=utf-8'});
	  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='YGIT-AVDIntelligence-'+sub+'.doc';
	  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
	  if(btn){ btn.innerHTML='✓ Downloaded .doc — open in Word, Save As .docx'; setTimeout(()=>rbSetPreviewBtn(rbState.dirty),3500); }
	}


	
	// ═══════════════════════════════════════════════════════════════════
	// VIEW: RG INVENTORY
	// ═══════════════════════════════════════════════════════════════════
	function renderRGInventory(){
	  if(!D){ $('view-rginventory').innerHTML=noData('RG Inventory'); return; }
	  const rgs=arr(D.resourceGroups).filter(rg=>rg!=null);
	  if(!rgs.length){
		$('view-rginventory').innerHTML=`<div class="section-hdr"><h2>RG Inventory</h2></div>
		<div class="card accent-amber"><div style="font-family:var(--font-mono);font-size:11px;color:var(--amber);padding:8px">
		  Resource Group inventory not collected — re-run the PS1 with RG collection enabled.
		</div></div>`;
		return;
	  }
	  const totalRes=rgs.reduce((a,rg)=>a+(rg.resourceCount||arr(rg.resources).length),0);
	  function resIcon(t){const m={'Virtual Machine':'💻','NIC':'🔌','Managed Disk':'💾','Host Pool':'🖥','Workspace':'⊞','App Group':'⊡','Scaling Plan':'⚖','Virtual Network':'🌐','NSG':'🛡','Storage Account':'🗄','Log Analytics':'◎','Key Vault':'🔑','Recovery Services':'📦','Public IP':'🌍'};return m[t]||'⬡';}
	  function resChip(t){const m={'Virtual Machine':'rgt-vm','NIC':'rgt-nic','Managed Disk':'rgt-disk','Host Pool':'rgt-avd','Workspace':'rgt-avd','App Group':'rgt-avd','Scaling Plan':'rgt-avd','Virtual Network':'rgt-net','NSG':'rgt-net','Storage Account':'rgt-store','Log Analytics':'rgt-store','Key Vault':'rgt-store','Recovery Services':'rgt-store'};return m[t]||'rgt-other';}

	  $('view-rginventory').innerHTML=`
	  <div class="section-hdr"><h2>Resource Group Inventory</h2><span class="section-sub">${rgs.length} group${rgs.length!==1?'s':''} · ${totalRes} resources total</span></div>
	  <div class="kpi-grid g${Math.min(rgs.length+1,4)}" style="margin-bottom:14px">
		<div class="kpi"><div class="kpi-label">Resource Groups</div><div class="kpi-value kv-cyan">${rgs.length}</div></div>
		<div class="kpi"><div class="kpi-label">Total Resources</div><div class="kpi-value">${totalRes}</div></div>
		${rgs.map(rg=>`<div class="kpi"><div class="kpi-label">${esc(rg.name)}</div><div class="kpi-value">${rg.resourceCount||arr(rg.resources).length}</div><div class="kpi-sub">${esc(rg.location||'—')}</div></div>`).join('')}
	  </div>
	  ${rgs.map(rg=>{
		const res=arr(rg.resources);
		const typeCounts={};
		res.forEach(r=>{typeCounts[r.shortType]=(typeCounts[r.shortType]||0)+1;});
		const rgId=esc(rg.name).replace(/[^a-zA-Z0-9]/g,'');
		return `<div class="rg-card">
		  <div class="rg-card-header" onclick="(function(h){const b=h.nextElementSibling;const open=b.style.display!=='none';b.style.display=open?'none':'block';h.querySelector('.rg-caret').textContent=open?'▼':'▶';})(this)">
			<span style="font-size:16px">📁</span>
			<div style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0">
			  <span class="rg-name">${esc(rg.name)}</span>
			  <span onclick="event.stopPropagation()">${copyBtn(rg.name)}</span>
			  ${rg.id?portalLink(rg.id,''):''}
			</div>
			<span class="rg-count-badge">${rg.resourceCount||res.length} resources</span>
			<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-left:8px">${esc(rg.location||'—')}</span>
			<span class="rg-caret" style="font-size:10px;color:var(--text-muted);margin-left:10px">▼</span>
		  </div>
		  <div class="rg-body">
			${Object.keys(rg.tags||{}).length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${Object.entries(rg.tags||{}).map(([k,v])=>`<span class="res-tag">${esc(k)}: ${esc(v)}</span>`).join('')}</div>`:''}
			<div class="rg-type-strip">${Object.entries(typeCounts).map(([type,count])=>`<span class="rg-type-chip ${resChip(type)}">${resIcon(type)} ${esc(type)} <strong>${count}</strong></span>`).join('')}</div>
			<div class="hp-sec-label">All Resources (${res.length})</div>
			<div class="search-bar" style="margin-bottom:8px"><span class="search-icon">⌕</span><input placeholder="Filter resources…" oninput="filterRGResources(this,'rg-list-${rgId}')"></div>
			<div id="rg-list-${rgId}" style="max-height:320px;overflow-y:auto">
			  ${res.map(r=>`<div class="res-row" data-rgsearch="${esc((r.name+'|'+r.shortType).toLowerCase())}">
				<span class="res-icon">${resIcon(r.shortType)}</span>
				<span style="display:inline-flex;align-items:center;gap:4px;flex:1;min-width:0;overflow:hidden">
				  <span class="res-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>
				  <span onclick="event.stopPropagation()">${copyBtn(r.name)}</span>
				</span>
				<span class="res-type">${esc(r.shortType)}</span>
				<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:8px">${esc(r.location||'')}</span>
			  </div>`).join('')}
			</div>
		  </div>
		</div>`;
	  }).join('')}`;
	}

	function filterRGResources(input, containerId){
	  const q=(input.value||'').toLowerCase();
	  const container=document.getElementById(containerId);
	  if(!container) return;
	  container.querySelectorAll('.res-row').forEach(row=>{
		row.style.display=(!q||(row.dataset.rgsearch||'').includes(q))?'':'none';
	  });
	}



	
	// ── QUICK REPORT — MSAL Auth ──────────────────────────────────────
	const QR_MSAL_CONFIG = {
	  auth: {
		clientId:    '58495013-6d96-4b2e-afe9-1ec427778fc9',
		authority:   'https://login.microsoftonline.com/common',
		redirectUri: 'https://tabaniz.github.io/avdintelligence/'
	  },
	  cache: { cacheLocation: 'sessionStorage' }
	};
	let qrMsalApp = null;
	let qrToken    = null;
	let qrUpn      = '';
	let qrDisplayName = '';

	// ── Live Debug Panel ──────────────────────────────────────────────
	const LIVE_DEBUG = true; // set false to suppress in-page panel
	let   liveLogStart = 0;

	function liveLog(msg, level) {
	  const elapsed = liveLogStart ? '+' + (Date.now() - liveLogStart) + 'ms' : '';
	  const colours = { info:'#7a9bbf', warn:'#f59e0b', error:'#ef4444', success:'#10b981' };
	  const colour  = colours[level||'info'] || colours.info;
	  // Always write to browser console
	  const fn = level==='error' ? console.error : level==='warn' ? console.warn : console.log;
	  fn('[YGIT Live]', msg, elapsed);
	  if(!LIVE_DEBUG) return;
	  const panel = document.getElementById('live-debug-panel');
	  if(!panel) return;
	  const line = document.createElement('div');
	  line.style.cssText = 'display:flex;gap:8px;padding:2px 0;border-bottom:1px solid #1e2d42;font-size:10px;';
	  line.innerHTML = `<span style="color:#3d5270;font-family:monospace;flex-shrink:0">${elapsed||'0ms'}</span><span style="color:${colour};word-break:break-all">${msg}</span>`;
	  const body = document.getElementById('live-debug-body');
	  if(body){ body.appendChild(line); body.scrollTop = body.scrollHeight; }
	}

	function liveLogShow() {
	  if(!LIVE_DEBUG) return;
	  liveLogStart = Date.now();
	  let panel = document.getElementById('live-debug-panel');
	  if(panel) { panel.style.display='flex'; document.getElementById('live-debug-body').innerHTML=''; return; }
	  panel = document.createElement('div');
	  panel.id = 'live-debug-panel';
	  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;width:420px;max-height:280px;background:#0d1117;border:1px solid #1e2d42;border-radius:8px;display:flex;flex-direction:column;z-index:9999;box-shadow:0 4px 24px #00000080;font-family:monospace;';
	  panel.innerHTML = `
		<div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid #1e2d42;gap:8px;flex-shrink:0">
		  <span style="font-size:10px;letter-spacing:2px;color:#00d4ff;text-transform:uppercase">⚡ Live Collect Log</span>
		  <span style="margin-left:auto;display:flex;gap:6px">
			<button onclick="navigator.clipboard?.writeText(Array.from(document.getElementById('live-debug-body').querySelectorAll('div')).map(d=>d.textContent).join('\\n'))" style="background:#1c2535;border:1px solid #1e2d42;border-radius:3px;color:#7a9bbf;font-size:9px;cursor:pointer;padding:2px 7px">Copy</button>
			<button onclick="const b=document.getElementById('live-debug-body');b.style.display=b.style.display==='none'?'':'none'" style="background:#1c2535;border:1px solid #1e2d42;border-radius:3px;color:#7a9bbf;font-size:9px;cursor:pointer;padding:2px 7px">Collapse</button>
			<button onclick="document.getElementById('live-debug-panel').style.display='none'" style="background:#1c2535;border:1px solid #1e2d42;border-radius:3px;color:#7a9bbf;font-size:9px;cursor:pointer;padding:2px 7px">✕</button>
		  </span>
		</div>
		<div id="live-debug-body" style="overflow-y:auto;padding:6px 10px;flex:1"></div>`;
	  document.body.appendChild(panel);
	}

	function liveLogDone() {
	  if(!LIVE_DEBUG) return;
	  liveLog('✓ Collect complete — ' + (Date.now()-liveLogStart) + 'ms total', 'success');
	  const body = document.getElementById('live-debug-body');
	  if(body) { const b = document.createElement('div'); b.style.cssText='border-top:1px solid #1e2d42;margin-top:4px;padding-top:4px;font-size:9px;color:#3d5270;text-align:center'; b.textContent='Panel auto-collapses in 10s'; body.appendChild(b); }
	  setTimeout(function(){ const bd=document.getElementById('live-debug-body'); if(bd) bd.style.display='none'; }, 10000);
	}

	async function startQuickReport() {
	  const btn = document.querySelector('.mode-lite .lp-mode-btn');
	  try {
		if (btn) { btn.disabled = true; btn.textContent = 'Connecting...'; }
		if (!qrMsalApp) {
		  qrMsalApp = new msal.PublicClientApplication(QR_MSAL_CONFIG);
		  await qrMsalApp.initialize();
		}
		const login = await qrMsalApp.loginPopup({
		  scopes: ['https://management.azure.com/user_impersonation']
		});
		const token = await qrMsalApp.acquireTokenSilent({
		  scopes: ['https://management.azure.com/user_impersonation'],
		  account: login.account
		});
		qrToken = token.accessToken;

		const resp = await fetch('https://management.azure.com/subscriptions?api-version=2022-12-01',
		  { headers: { Authorization: 'Bearer ' + qrToken } });
		const data = await resp.json();
		const subs = (data.value || []).filter(function(s) { return s.state === 'Enabled'; });

		if (!subs.length) {
		  alert('No enabled subscriptions found.');
		  if (btn) { btn.disabled = false; btn.textContent = 'Generate Quick Report'; }
		  return;
		}
		qrShowSubPicker(subs, login.account.username);
		qrUpn         = login.account.username || login.account.name || '';
		qrDisplayName = login.account.name || '';
	  } catch(e) {
		console.error('QR auth error:', e);
		alert(e.errorCode === 'user_cancelled' ? 'Sign-in cancelled.' : 'Auth failed: ' + (e.message || e));
		if (btn) { btn.disabled = false; btn.textContent = 'Generate Quick Report'; }
	  }
	}

	function qrShowSubPicker(subs, user) {
	  const el = document.getElementById('qr-picker');
	  if (el) el.remove();
	  const opts = subs.map(function(s) {
		return '<option value="' + s.subscriptionId + '">' + s.displayName + '</option>';
	  }).join('');
	  const d = document.createElement('div');
	  d.id = 'qr-picker';
	  d.style.cssText = 'position:fixed;inset:0;background:#00000099;z-index:9999;display:flex;align-items:center;justify-content:center';
	  d.innerHTML = '<div style="background:#13161d;border:1px solid #10b98160;border-radius:12px;padding:28px 32px;min-width:380px">'
		+ '<div style="font-size:10px;color:#10b981;letter-spacing:2px;margin-bottom:8px">QUICK REPORT</div>'
		+ '<div style="font-size:15px;font-weight:700;color:#f0f4f8;margin-bottom:4px">Select Subscription</div>'
		+ '<div style="font-size:10px;color:#8899aa;margin-bottom:16px">' + user + '</div>'
		+ '<select id="qr-sub" style="width:100%;background:#0d1017;border:1px solid #ffffff20;color:#f0f4f8;padding:9px 12px;border-radius:6px;font-size:12px;margin-bottom:16px">' + opts + '</select>'
		+ '<div style="display:flex;gap:8px;justify-content:flex-end">'
		+ '<button onclick="qrCancel()" style="background:transparent;border:1px solid #ffffff20;color:#8899aa;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:11px">Cancel</button>'
		+ '<button onclick="qrCollect()" style="background:#10b981;border:none;color:#000;padding:7px 18px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">Collect Data</button>'
		+ '</div></div>';
	  document.body.appendChild(d);
	  const btn = document.querySelector('.mode-lite .lp-mode-btn');
	  if (btn) { btn.disabled = false; btn.textContent = 'Generate Quick Report'; }
	}

	function qrCancel() {
	  const el = document.getElementById('qr-picker');
	  if (el) el.remove();
	  const btn = document.querySelector('.mode-lite .lp-mode-btn');
	  if (btn) { btn.disabled = false; btn.textContent = 'Generate Quick Report'; }
	}

	const KNOWN_ROLES = {
	  '1d18fff3-a72a-46b5-b4a9-0b38a3cd7e63': 'Desktop Virtualization User',
	  '082f0a83-3be5-4ba1-904c-961cca79b387': 'Desktop Virtualization Contributor',
	  '49a72310-ab8d-41df-bbb0-79b649203868': 'Desktop Virtualization Reader',
	  'e307426c-f9b6-4e81-87de-d99efb3c32bc': 'Desktop Virtualization Host Pool Contributor',
	  'ceadfde2-b300-400a-ab7b-6143895aa822': 'Desktop Virtualization Host Pool Reader',
	  '86240b0e-9422-4c43-887b-b61143f32ba8': 'Desktop Virtualization Application Group Contributor',
	  'aebf23d0-b568-4e86-b8f9-fe83a2c6ab55': 'Desktop Virtualization Application Group Reader',
	  '21efdde3-836f-432b-bf3d-3e8e734d4b2b': 'Desktop Virtualization Workspace Contributor',
	  '0fa44ee9-7a7d-466b-9bb2-2bf446b1204d': 'Desktop Virtualization Workspace Reader',
	  'ea4bfff8-7fb4-485a-aadd-d4129a0ffaa6': 'Desktop Virtualization User Session Operator',
	  '2ad6aa64-aba4-4f28-96f3-253c89f8e7e5': 'Desktop Virtualization Session Host Operator',
	  '9980e02c-c2be-4d73-94e8-173b1dc7cf3c': 'Virtual Machine User Login',
	  '1c0163c0-47e6-4577-8991-ea5c82e286e4': 'Virtual Machine Administrator Login',
	  'acdd72a7-3385-48ef-bd42-f606fba81ae7': 'Reader',
	  'b24988ac-6180-42a0-ab88-20f7382dd24c': 'Contributor',
	  '8e3af657-a8ff-443c-a75c-2fe8c4bcb635': 'Owner'
	};

	async function qrCollect() {
	  const sel = document.getElementById('qr-sub');
	  const subId = sel ? sel.value : null;
	  const subName = sel ? sel.options[sel.selectedIndex].text : subId;
	  if (!subId) return;
	  document.getElementById('qr-picker').remove();

	  // ── Progress overlay ──────────────────────────────────────────────
	  const prog = document.createElement('div');
	  prog.id = 'qr-progress';
	  prog.style.cssText = 'position:fixed;inset:0;background:#00000099;z-index:9999;display:flex;align-items:center;justify-content:center';
	  prog.innerHTML = '<div style="background:#13161d;border:1px solid #10b98160;border-radius:12px;padding:28px 40px;text-align:center;min-width:320px">'
		+ '<div style="font-size:10px;color:#10b981;letter-spacing:2px;margin-bottom:12px">QUICK REPORT</div>'
		+ '<div id="qr-prog-msg" style="font-size:13px;color:#f0f4f8;margin-bottom:8px">Collecting data...</div>'
		+ '<div style="height:2px;background:#ffffff10;border-radius:2px;overflow:hidden"><div id="qr-prog-bar" style="height:100%;background:#10b981;width:0%;transition:width 0.4s"></div></div>'
		+ '</div>';
	  document.body.appendChild(prog);

	  function qrProgress(msg, pct) {
		const m = document.getElementById('qr-prog-msg');
		const b = document.getElementById('qr-prog-bar');
		if (m) m.textContent = msg;
		if (b) b.style.width = pct + '%';
		liveLog(msg + (pct!==undefined?' ['+pct+'%]':''), 'info');
	  }

	  function armGet(path) {
		return fetch('https://management.azure.com' + path, {
		  headers: { Authorization: 'Bearer ' + qrToken }
		}).then(function(r) {
		  if(r.status===401) throw new Error('Authentication failed or token expired. Please sign in again.');
		  if(r.status===403) throw new Error('Access denied (403) — your account lacks Reader or Desktop Virtualization Reader permissions on: ' + path.split('?')[0].split('/providers/')[1]);
		  if(r.status===404) return {value:[]};
		  if(!r.ok) throw new Error('Azure API error ' + r.status + ' on: ' + path.split('?')[0].split('/providers/')[1]);
		  return r.json();
		});
	  }

	  liveLogShow();
	  try {
		// ── Subscription info ───────────────────────────────────────────
		qrProgress('Getting subscription...', 5);
		const subResp = await armGet('/subscriptions/' + subId + '?api-version=2022-12-01');
		const tenantId = subResp.tenantId || '';

		// ── Host Pools ──────────────────────────────────────────────────
		qrProgress('Collecting host pools...', 15);
		const hpResp = await armGet('/subscriptions/' + subId + '/providers/Microsoft.DesktopVirtualization/hostPools?api-version=2023-09-05');
		const rawHPs = hpResp.value || [];

		// ── Workspaces ──────────────────────────────────────────────────
		qrProgress('Collecting workspaces...', 25);
		const wsResp = await armGet('/subscriptions/' + subId + '/providers/Microsoft.DesktopVirtualization/workspaces?api-version=2023-09-05');
		const rawWSs = wsResp.value || [];

		// ── App Groups ──────────────────────────────────────────────────
		qrProgress('Collecting app groups...', 35);
		const agResp = await armGet('/subscriptions/' + subId + '/providers/Microsoft.DesktopVirtualization/applicationGroups?api-version=2023-09-05');
		const rawAGs = agResp.value || [];

		// ── RBAC per App Group ──────────────────────────────────────────
		qrProgress('Collecting RBAC assignments...', 40);
		const allRoleAssignments = {};
		for (let i = 0; i < rawAGs.length; i++) {
		  const ag = rawAGs[i];
		  const agRg = (ag.id.match(/resourceGroups\/([^/]+)\//i)||[])[1]||'';
		  try {
			const raResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + agRg
			  + '/providers/Microsoft.DesktopVirtualization/applicationGroups/' + ag.name
			  + '/providers/microsoft.authorization/roleAssignments?api-version=2022-04-01');
			allRoleAssignments[ag.id] = raResp.value || [];
			console.log('[RBAC] AG:', ag.name, '— assignments:', (raResp.value||[]).map(r=>({principalId:r.properties?.principalId, principalType:r.properties?.principalType, roleId:(r.properties?.roleDefinitionId||'').split('/').pop()})));
		  } catch(e) { allRoleAssignments[ag.id] = []; }
		}

		// ── RemoteApps per App Group ───────────────────────────────────
		qrProgress('Collecting published applications...', 45);
		const allRemoteApps = {};
		for (let i = 0; i < rawAGs.length; i++) {
		  const ag = rawAGs[i];
		  if ((ag.properties||{}).applicationGroupType !== 'RemoteApp') continue;
		  const agRg = (ag.id.match(/resourceGroups\/([^/]+)\//i)||[])[1]||'';
		  try {
			const appsResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + agRg
			  + '/providers/Microsoft.DesktopVirtualization/applicationGroups/' + ag.name
			  + '/applications?api-version=2023-09-05');
			allRemoteApps[ag.id] = (appsResp.value||[]).map(function(a){
			  const ap = a.properties||{};
			  return { name:a.name, friendlyName:ap.friendlyName||a.name, description:ap.description||'', filePath:ap.filePath||'', commandLineArguments:ap.commandLineArguments||'', showInPortal:ap.showInPortal!==false };
			});
		  } catch(e) { allRemoteApps[ag.id] = []; }
		}

		// ── Resolve role GUIDs → friendly names ────────────────────────
		const roleNameMap = {...KNOWN_ROLES};
		const unknownGuids = new Set();
		Object.values(allRoleAssignments).forEach(function(ras){
		  ras.forEach(function(ra){
			const guid = (ra.properties?.roleDefinitionId||'').split('/').pop();
			if(guid && !roleNameMap[guid]) unknownGuids.add(guid);
		  });
		});
		for(const guid of unknownGuids){
		  try {
			const rdResp = await armGet('/subscriptions/'+subId+'/providers/Microsoft.Authorization/roleDefinitions/'+guid+'?api-version=2022-04-01');
			if(rdResp.properties?.roleName) roleNameMap[guid] = rdResp.properties.roleName;
		  } catch(e) { /* keep GUID as fallback */ }
		}

		// ── Session Hosts + Sessions per Host Pool ───────────────────────
		qrProgress('Collecting session hosts...', 45);
		const allSessionHosts = [];
		const allSessions = [];
		const allDiagnostics = {};

		for (let i = 0; i < rawHPs.length; i++) {
		  const hp = rawHPs[i];
		  const hpName = hp.name;
		  const rgMatch = hp.id.match(/resourceGroups\/([^/]+)\//i);
		  const rg = rgMatch ? rgMatch[1] : '';

		  const shResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + rg
			+ '/providers/Microsoft.DesktopVirtualization/hostPools/' + hpName
			+ '/sessionHosts?api-version=2023-09-05');
		  const shs = shResp.value || [];

		  shs.forEach(function(sh) {
			const shName = sh.name.split('/').pop();
			allSessionHosts.push({
			  name:              shName,
			  hostPoolName:      hpName,
			  resourceGroup:     rg,
			  subscriptionId:    subId,
			  id:                sh.id,
			  status:            sh.properties.status || 'Unknown',
			  agentVersion:      sh.properties.agentVersion || '',
			  allowNewSessions:  sh.properties.allowNewSession,
			  drainMode:         !sh.properties.allowNewSession,
			  lastHeartbeat:     sh.properties.lastHeartBeat || '',
			  assignedUser:      sh.properties.assignedUser || '',
			  vmName:            shName.split('.')[0],
			  vmNameFull:        shName,
			  osType:            'Windows',
			  powerState:        'Running',
			  activeSessions:    sh.properties.sessions || 0,
			  disconnectedSessions: 0,
			  sessions:          []
			});
		  });

		  // Sessions
		  try {
			const sessResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + rg
			  + '/providers/Microsoft.DesktopVirtualization/hostPools/' + hpName
			  + '/userSessions?api-version=2023-09-05');
			(sessResp.value || []).forEach(function(s) {
			  allSessions.push({
				sessionId:        s.name.split('/').pop(),
				userPrincipalName: s.properties.userPrincipalName || '',
				sessionHostName:  s.name.split('/')[1] || '',
				hostPoolName:     hpName,
				sessionState:     s.properties.sessionState || 'Unknown',
				applicationType:  s.properties.applicationType || 'Desktop',
				createTime:       s.properties.createTime || ''
			  });
			});
		  } catch(e) { /* sessions optional */ }

		  // Diagnostics
		  try {
			const diagResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + rg
			  + '/providers/Microsoft.DesktopVirtualization/hostPools/' + hpName
			  + '/providers/microsoft.insights/diagnosticSettings?api-version=2021-05-01-preview');
			const diagSettings = diagResp.value || [];
			allDiagnostics[hp.id] = diagSettings;
		  } catch(e) { /* diagnostics optional */ }

		  qrProgress('Collecting session hosts... (' + (i+1) + '/' + rawHPs.length + ')', 45 + Math.round((i+1)/rawHPs.length * 25));
		}

		// ── VMs ──────────────────────────────────────────────────────────
		qrProgress('Collecting VMs...', 72);
		const vmResp = await armGet('/subscriptions/' + subId + '/providers/Microsoft.Compute/virtualMachines?api-version=2023-07-01');
		const vmMap = {};
		(vmResp.value || []).forEach(function(vm) {
		  const osDisk = vm.properties.storageProfile.osDisk || {};
		  vmMap[vm.name.toLowerCase()] = {
			vmSize:       vm.properties.hardwareProfile.vmSize || '',
			osType:       osDisk.osType || 'Windows',
			location:     vm.location || '',
			osDiskName:   osDisk.name || '',
			osDiskSizeGB: osDisk.diskSizeGB || 0,
			osDiskType:   (osDisk.managedDisk||{}).storageAccountType || '',
			osDiskCaching:osDisk.caching || '',
			osDiskId:     (osDisk.managedDisk||{}).id || '',
			tags:         vm.tags || {},
			nicIds:       (vm.properties.networkProfile.networkInterfaces||[]).map(function(n){ return n.id; })
		  };
		});

		// Enrich session hosts with VM data
		allSessionHosts.forEach(function(sh) {
		  const vmKey = sh.vmName.toLowerCase();
		  if (vmMap[vmKey]) {
			sh.vmSize        = vmMap[vmKey].vmSize;
			sh.osType        = vmMap[vmKey].osType;
			sh.vmLocation    = vmMap[vmKey].location;
			sh.osDiskName    = vmMap[vmKey].osDiskName;
			sh.osDiskSizeGB  = vmMap[vmKey].osDiskSizeGB;
			sh.osDiskType    = vmMap[vmKey].osDiskType;
			sh.osDiskCaching = vmMap[vmKey].osDiskCaching;
			sh.osDiskId      = vmMap[vmKey].osDiskId;
			sh.tags          = vmMap[vmKey].tags;
			sh.nicIds        = vmMap[vmKey].nicIds;
		  }
		});

		// ── NIC enrichment — batch all NICs in parallel ────────────────
		const allNicIds = [];
		allSessionHosts.forEach(function(sh){
		  (sh.nicIds||[]).forEach(function(id){ if(id) allNicIds.push({ shName: sh.vmName||sh.name, nicId: id }); });
		});
		if(allNicIds.length){
		  qrProgress('Collecting network details... (0/' + allNicIds.length + ')', 73);
		  liveLog('NIC batch: ' + allNicIds.length + ' interfaces to collect', 'info');
		  let nicDone = 0;
		  const nicResults = await Promise.all(allNicIds.map(function(entry){
			return armGet(entry.nicId + '?api-version=2023-05-01')
			  .then(function(nic){
				nicDone++;
				if(nicDone % 5 === 0 || nicDone === allNicIds.length){
				  qrProgress('Collecting network details... (' + nicDone + '/' + allNicIds.length + ')', 73 + Math.round(nicDone/allNicIds.length * 4));
				}
				const ipCfg = ((nic.properties||{}).ipConfigurations||[])[0] || {};
				const ipProps = ipCfg.properties || {};
				const subnetRef = ipProps.subnet && ipProps.subnet.id ? ipProps.subnet.id : '';
				const subnetName  = subnetRef.split('/').pop() || '';
				const vnetName    = subnetRef.split('/virtualNetworks/')[1]?.split('/')[0] || '';
				const publicIPId  = ipProps.publicIPAddress && ipProps.publicIPAddress.id ? ipProps.publicIPAddress.id : '';
				return {
				  shName:     entry.shName,
				  nicName:    nic.name || '',
				  privateIP:  ipProps.privateIPAddress || '',
				  subnetName: subnetName,
				  vnetName:   vnetName,
				  subnetRef:  subnetRef,
				  publicIPId: publicIPId
				};
			  })
			  .catch(function(e){
				liveLog('NIC fetch failed: ' + entry.nicId.split('/').pop() + ' — ' + e.message, 'warn');
				return { shName: entry.shName, nicName:'', privateIP:'', subnetName:'', vnetName:'', subnetRef:'', publicIPId:'' };
			  });
		  }));
		  // Apply NIC data back to session hosts
		  nicResults.forEach(function(n){
			const sh = allSessionHosts.find(function(s){ return (s.vmName||s.name) === n.shName; });
			if(sh){
			  sh.privateIP       = sh.privateIP || n.privateIP;
			  sh.nicName         = n.nicName;
			  sh.subnet          = n.subnetName;
			  sh.virtualNetwork  = n.vnetName;
			  sh.subnetRef       = n.subnetRef;
			  sh.publicIPId      = n.publicIPId;
			}
		  });
		  liveLog('NIC enrichment complete — ' + nicResults.filter(function(n){ return n.privateIP; }).length + '/' + allNicIds.length + ' with private IP', 'success');
		}

		// ── Scaling Plans ─────────────────────────────────────────────────
		qrProgress('Collecting scaling plans...', 75);
		const rawSPs = [];
		try {
		  const spResp = await armGet('/subscriptions/' + subId + '/providers/Microsoft.DesktopVirtualization/scalingPlans?api-version=2023-09-05');
		  for (const sp of (spResp.value || [])) {
			const spRg = (sp.id.match(/resourceGroups\/([^/]+)\//i)||[])[1]||'';
			const props = sp.properties || {};
			
			// Fetch schedules for this scaling plan
			let schedules = [];
			try {
			  const schedResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + spRg 
				+ '/providers/Microsoft.DesktopVirtualization/scalingPlans/' + sp.name 
				+ '/pooledSchedules?api-version=2023-09-05');
			  schedules = (schedResp.value || []).map(function(sch){
				const sp = sch.properties || {};
				return {
				  name:                        sch.name,
				  daysOfWeek:                  sp.daysOfWeek || [],
				  rampUpStartTime:             sp.rampUpStartTime || '',
				  rampUpLoadAlgorithm:         sp.rampUpLoadBalancingAlgorithm || '',
				  rampUpMinimumHostsPct:       sp.rampUpMinimumHostsPct || 0,
				  rampUpCapacityThresholdPct:  sp.rampUpCapacityThresholdPct || 0,
				  peakStartTime:               sp.peakStartTime || '',
				  peakLoadAlgorithm:           sp.peakLoadBalancingAlgorithm || '',
				  rampDownStartTime:           sp.rampDownStartTime || '',
				  rampDownLoadAlgorithm:       sp.rampDownLoadBalancingAlgorithm || '',
				  rampDownMinimumHostsPct:     sp.rampDownMinimumHostsPct || 0,
				  rampDownCapacityThresholdPct:sp.rampDownCapacityThresholdPct || 0,
				  rampDownNotificationMessage: sp.rampDownNotificationMessage || '',
				  rampDownStopHostsWhen:       sp.rampDownStopHostsWhen || '',
				  rampDownWaitTimeMinutes:     sp.rampDownWaitTimeMinutes || 0,
				  offPeakStartTime:            sp.offPeakStartTime || '',
				  offPeakLoadAlgorithm:        sp.offPeakLoadBalancingAlgorithm || ''
				};
			  });
			  liveLog('Scaling plan "' + sp.name + '" — ' + schedules.length + ' schedule(s)', schedules.length ? 'success' : 'info');
			} catch(e) {
			  liveLog('Failed to fetch schedules for scaling plan "' + sp.name + '": ' + e.message, 'warn');
			}
			
			rawSPs.push({
			  name:          sp.name,
			  id:            sp.id,
			  resourceGroup: spRg,
			  location:      sp.location || '',
			  friendlyName:  props.friendlyName || sp.name,
			  hostPoolType:  props.hostPoolType || '',
			  tags:          sp.tags || {},
			  hostPoolReferences: (props.hostPoolReferences||[]).map(function(r){ return { hostPoolId: r.hostPoolArmPath, scalingPlanEnabled: r.scalingPlanEnabled }; }),
			  schedules:     schedules
			});
		  }
		} catch(e) { console.warn('Scaling plans unavailable:', e.message); }

		// ── NAT Gateways + build D.networking ────────────────────────────
		qrProgress('Collecting network topology...', 78);
		let liveNetworking = null;
		try {
		  const natResp = await armGet('/subscriptions/' + subId + '/providers/Microsoft.Network/natGateways?api-version=2023-05-01');
		  const rawNats = natResp.value || [];
		  liveLog('NAT gateways found: ' + rawNats.length, rawNats.length ? 'success' : 'info');

		  // Derive vNet/subnet structure from enriched session host NIC data
		  const vnetMap = {};
		  allSessionHosts.forEach(function(sh){
			if(!sh.virtualNetwork) return;
			const vnetKey = sh.virtualNetwork.toLowerCase();
			if(!vnetMap[vnetKey]){
			  vnetMap[vnetKey] = {
				name:         sh.virtualNetwork,
				location:     sh.vmLocation || '',
				addressSpace: [],
				subnets:      {},
				peerings:     []
			  };
			}
			const subKey = (sh.subnet||'unknown').toLowerCase();
			if(!vnetMap[vnetKey].subnets[subKey]){
			  vnetMap[vnetKey].subnets[subKey] = {
				name:               sh.subnet || 'unknown',
				addressPrefix:      '',
				associatedHostPool: sh.hostPoolName || '',
				sessionHostCount:   0,
				sessionHostNames:   [],
				natGatewayName:     '',
				nsgName:            ''
			  };
			}
			vnetMap[vnetKey].subnets[subKey].sessionHostCount++;
			vnetMap[vnetKey].subnets[subKey].sessionHostNames.push(sh.vmName||sh.name||'');
		  });

		  // Build NAT gateway objects and cross-reference to subnets
		  const natGateways = rawNats.map(function(nat){
			const natProps = nat.properties || {};
			const publicIPs = (natProps.publicIpAddresses||[]).map(function(pip){
			  return { name: pip.id.split('/').pop(), ipAddress: '', id: pip.id };
			});
			// Find which subnets reference this NAT gateway
			const assocSubnets = (natProps.subnets||[]).map(function(s){ return s.id.split('/').pop(); });
			// Mark subnets in vnetMap
			assocSubnets.forEach(function(sname){
			  Object.values(vnetMap).forEach(function(vnet){
				if(vnet.subnets[sname.toLowerCase()]){
				  vnet.subnets[sname.toLowerCase()].natGatewayName = nat.name;
				}
			  });
			});
			return {
			  name:             nat.name,
			  id:               nat.id,
			  location:         nat.location || '',
			  publicIPAddresses:publicIPs,
			  subnets:          assocSubnets
			};
		  });

		  // Convert vnetMap to array format expected by renderer
		  const virtualNetworks = Object.values(vnetMap).map(function(vnet){
			return {
			  name:         vnet.name,
			  location:     vnet.location,
			  addressSpace: vnet.addressSpace,
			  subnets:      Object.values(vnet.subnets),
			  peerings:     vnet.peerings
			};
		  });

		  liveNetworking = {
			virtualNetworks:      virtualNetworks,
			natGateways:          natGateways,
			networkSecurityGroups:[],
			privateEndpoints:     {},
			bastionHosts:         [],
			topologyNotes:        virtualNetworks.length ? ['Topology derived from session host NIC data via Connect Live.'] : []
		  };
		  liveLog('Networking built: ' + virtualNetworks.length + ' vNet(s), ' + natGateways.length + ' NAT GW(s)', 'success');
		} catch(e) {
		  liveLog('Networking collection failed: ' + e.message + ' — networking section will be empty', 'warn');
		}

		// ── Resource Groups ────────────────────────────────────────────────
		qrProgress('Collecting resource groups...', 82);
		const rawRGs = [];
		try {
		  const rgResp = await armGet('/subscriptions/' + subId + '/resourcegroups?api-version=2021-04-01');
		  // Collect unique RGs that contain AVD or VM resources
		  const avdRgNames = new Set();
		  rawHPs.forEach(function(hp){ const m=hp.id.match(/resourceGroups\/([^/]+)\//i); if(m) avdRgNames.add(m[1].toLowerCase()); });
		  allSessionHosts.forEach(function(sh){ if(sh.resourceGroup) avdRgNames.add(sh.resourceGroup.toLowerCase()); });

		  for (const rg of (rgResp.value||[])) {
			if (!avdRgNames.has(rg.name.toLowerCase())) continue;
			try {
			  const resResp = await armGet('/subscriptions/' + subId + '/resourceGroups/' + rg.name + '/resources?api-version=2021-04-01');
			  const resources = (resResp.value||[]).map(function(r){
				const t = r.type || '';
				const shortTypes = { 'Microsoft.Compute/virtualMachines':'Virtual Machine','Microsoft.Compute/disks':'Managed Disk','Microsoft.Network/networkInterfaces':'NIC','Microsoft.Network/virtualNetworks':'Virtual Network','Microsoft.Network/networkSecurityGroups':'NSG','Microsoft.DesktopVirtualization/hostpools':'Host Pool','Microsoft.DesktopVirtualization/workspaces':'Workspace','Microsoft.DesktopVirtualization/applicationgroups':'App Group','Microsoft.Storage/storageAccounts':'Storage Account','Microsoft.KeyVault/vaults':'Key Vault' };
				return { name:r.name, type:t, shortType:shortTypes[t]||t.split('/').pop(), location:r.location||'' };
			  });
			  rawRGs.push({ name:rg.name, id:rg.id, location:rg.location||'', tags:{}, resources:resources, resourceCount:resources.length });
			} catch(e) { /* skip RG if resources call fails */ }
		  }
		} catch(e) { console.warn('RG inventory unavailable:', e.message); }

		// ── Build D shape ─────────────────────────────────────────────────
		qrProgress('Building report...', 92);
		const now = new Date().toISOString();

		const hostPools = rawHPs.map(function(hp) {
		  const hpName = hp.name;
		  const props  = hp.properties || {};
		  const rgMatch = hp.id.match(/resourceGroups\/([^/]+)\//i);
		  const rg = rgMatch ? rgMatch[1] : '';
		  const hpSHs  = allSessionHosts.filter(function(s) { return s.hostPoolName === hpName; });
		  const hpSess = allSessions.filter(function(s) { return s.hostPoolName === hpName; });
		  const avail  = hpSHs.filter(function(s) { return s.status === 'Available'; }).length;

		  return {
			name:               hpName,
			id:                 hp.id,
			resourceGroup:      rg,
			subscriptionId:     subId,
			location:           hp.location || '',
			friendlyName:       props.friendlyName || hpName,
			description:        props.description || '',
			hostPoolType:       props.hostPoolType || '',
			loadBalancerType:   props.loadBalancerType || '',
			maxSessionLimit:    props.maxSessionLimit || 0,
			preferredAppGroupType: props.preferredAppGroupType || '',
			publicNetworkAccess:   props.publicNetworkAccess || '',
			startVMOnConnect:      props.startVMOnConnect || false,
			isValidationEnv:       props.validationEnvironment || false,
			customRdpProperties:   props.customRdpProperty || '',
			rdpPropertiesParsed:   {},
			registrationTokenStatus: 'Unknown',
			sessionHostCount:    hpSHs.length,
			sessionHostsAvailable: avail,
			sessionHostsUnavailable: hpSHs.filter(function(s){ return s.status==='Unavailable'; }).length,
			sessionHostsDrainMode:   hpSHs.filter(function(s){ return s.drainMode; }).length,
			sessionHostsNeedsAssistance: hpSHs.filter(function(s){ return s.status==='NeedsAssistance'; }).length,
			sessionHostsShutdown:    hpSHs.filter(function(s){ return s.status==='Shutdown'; }).length,
			healthPct:           hpSHs.length ? Math.round(avail/hpSHs.length*100) : 0,
			totalSessions:       hpSess.length,
			activeSessions:      hpSess.filter(function(s){ return s.sessionState==='Active'; }).length,
			disconnectedSessions:hpSess.filter(function(s){ return s.sessionState==='Disconnected'; }).length,
			totalCapacity:       props.maxSessionLimit * hpSHs.length,
			capacityUsedPct:     0,
			hasScalingPlan:      false,
			scalingPlanCount:    0,
			scalingPlans:        [],
			appGroupCount:       rawAGs.filter(function(a){ return (a.properties||{}).hostPoolArmPath===hp.id; }).length,
			appGroups:           [],
			privateEndpointEnabled: false,
			privateEndpoints:    [],
			diagnosticsEnabled:  (allDiagnostics[hp.id]||[]).length > 0,
			diagnosticSettings:  allDiagnostics[hp.id] || [],
			securityFindings:    [],
			securityScore:       100,
			tags:                hp.tags || {},
			rdpComplianceSummary:{score:0,compliant:0,total:0},
			currentMonthCost:    null,
			currency:            'AUD'
		  };
		});


		// Link scaling plans to host pools
		rawSPs.forEach(function(sp) {
		  (sp.hostPoolReferences||[]).forEach(function(ref) {
			const hp = hostPools.find(function(h){ return h.id === ref.hostPoolId; });
			if (hp) {
			  hp.hasScalingPlan = true;
			  hp.scalingPlanCount = (hp.scalingPlanCount||0) + 1;
			  if (!hp.scalingPlans) hp.scalingPlans = [];
			  hp.scalingPlans.push({ name: sp.name, id: sp.id });
			}
		  });
		});

		const totalSHs    = allSessionHosts.length;
		const availSHs    = allSessionHosts.filter(function(s){ return s.status==='Available'; }).length;
		const activeSess  = allSessions.filter(function(s){ return s.sessionState==='Active'; }).length;
		const disconnSess = allSessions.filter(function(s){ return s.sessionState==='Disconnected'; }).length;

		const D_live = {
		  schemaVersion:    'YGIT-AVDIntelligence/5.0-live',
		  generatedAt:      now,
		  subscriptionId:   subId,
		  subscriptionName: subName,
		  tenantId:         tenantId,
		  tenantName:       tenantId,
		  hostPools:        hostPools,
		  sessionHosts:     allSessionHosts,
		  sessions:         allSessions,
		  avdWorkspaces:    rawWSs.map(function(w){ return { name:w.name, id:w.id, friendlyName:(w.properties||{}).friendlyName||w.name, location:w.location, resourceGroup:(w.id.match(/resourceGroups\/([^/]+)\//i)||[])[1]||'' }; }),
		  applicationGroups:rawAGs.map(function(a){
			const ras = allRoleAssignments[a.id] || [];
			const users = [], groups = [];
			ras.forEach(function(ra){
			  const p = ra.properties || {};
			  const roleGuid = (p.roleDefinitionId||'').split('/').pop();
			  const roleName = roleNameMap[roleGuid]||'';
			  const isAvd = roleName.startsWith('Desktop Virtualization')||roleName==='Virtual Machine User Login'||roleName==='Virtual Machine Administrator Login';
			  if(!isAvd) return;
			  const entry = { objectId:p.principalId||'', objectType:p.principalType||'ServicePrincipal', role:roleName, displayName:'', signInName:'' };
			  if(p.principalType==='Group') groups.push(entry); else users.push(entry);
			});
			const agProps = a.properties || {};
			const agHostPoolId = agProps.hostPoolArmPath || '';
			const wsMatch = rawWSs.find(function(w){ return ((w.properties||{}).applicationGroupReferences||[]).some(function(ref){ return ref.toLowerCase()===a.id.toLowerCase(); }); });
			return {
			  name:                 a.name,
			  id:                   a.id,
			  resourceGroup:        (a.id.match(/resourceGroups\/([^/]+)\//i)||[])[1]||'',
			  location:             a.location||'',
			  tags:                 a.tags||{},
			  friendlyName:         agProps.friendlyName||a.name,
			  description:          agProps.description||'',
			  applicationGroupType: agProps.applicationGroupType||'',
			  hostPoolId:           agHostPoolId,
			  hostPoolName:         agHostPoolId.split('/').pop(),
			  workspaceId:          wsMatch ? wsMatch.id : '',
			  workspaceName:        wsMatch ? wsMatch.name : '',
			  workspaceFriendlyName:wsMatch ? ((wsMatch.properties||{}).friendlyName||wsMatch.name) : '',
			  assignedUsers:        users,
			  assignedGroups:       groups,
			  totalAssignees:       users.length + groups.length,
			  diagnosticsEnabled:   false,
			  remoteApps:           allRemoteApps[a.id]||[],
			  remoteAppCount:       (allRemoteApps[a.id]||[]).length
			};
		  }),
		  scalingPlans:     rawSPs,
		  metrics:          { querySupported:false, queriesRun:[], queriesSkipped:[] },
		  networking:       liveNetworking,
		  fslogixCoverage:  { hostsWithout:[], storageAccounts:[] },
		  resourceGroups:   rawRGs,
		  imageDrift:       {},
		  summary: {
			hostPoolCount:         hostPools.length,
			pooledHostPools:       hostPools.filter(function(h){ return h.hostPoolType==='Pooled'; }).length,
			personalHostPools:     hostPools.filter(function(h){ return h.hostPoolType==='Personal'; }).length,
			totalSessionHosts:     totalSHs,
			availableHosts:        availSHs,
			needsAssistanceHosts:  allSessionHosts.filter(function(s){ return s.status==='NeedsAssistance'; }).length,
			drainModeHosts:        allSessionHosts.filter(function(s){ return s.drainMode; }).length,
			unavailableHosts:      allSessionHosts.filter(function(s){ return s.status==='Unavailable'; }).length,
			totalActiveSessions:   activeSess,
			totalDisconnectedSessions: disconnSess,
			totalSessions:         allSessions.length,
			avdWorkspaceCount:     rawWSs.length,
			applicationGroupCount: rawAGs.length,
			scalingPlanCount:      rawSPs.length,
			hostPoolsWithDiagnostics:    hostPools.filter(function(h){ return h.diagnosticsEnabled; }).length,
			hostPoolsWithoutDiagnostics: hostPools.filter(function(h){ return !h.diagnosticsEnabled; }).length,
			hostsWithFSLogixDetected: 0,
			overallHealthPct:      totalSHs ? Math.round(availSHs/totalSHs*100) : 0,
			costAvailable:         false,
			sessionDetailCollected:true,
			collectedAt:           now,
			currency:              'AUD'
		  },
		  displayConfig: { isLiveMode: true, collectedByUpn: qrUpn, collectedByDisplayName: qrDisplayName },
		  reportConfig:  {}
		};

		// ── Hand off to report builder ────────────────────────────────────
		qrProgress('Done!', 100);
		liveLogDone();
		setTimeout(function() {
		  document.getElementById('qr-progress').remove();
		  initData(D_live);
		  // Skip sidebar, go straight to report builder and auto-open
		  $('sidebar').style.display = 'none';
		  navTo('reportbuilder');
		  rbOpen();
		}, 600);

	  } catch(err) {
		console.error('QR collect error:', err);
		liveLog('ERROR: ' + (err.message||err), 'error');
		document.getElementById('qr-progress').remove();
		alert('Data collection failed: ' + (err.message || err));
	  }
	}


	