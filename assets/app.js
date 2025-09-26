// ===== State & Utils =====
let DATA = [];
let STATE = { q: '', grade: '', sort: 'title', tag: '', onlyFavs: false };

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function normalize(str){ return (str||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,''); }
function escReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function setState(patch, pushUrl=true){
  STATE = { ...STATE, ...patch };
  const params = new URLSearchParams();
  if(STATE.q) params.set('q', STATE.q);
  if(STATE.grade) params.set('g', STATE.grade);
  if(STATE.sort && STATE.sort !== 'title') params.set('s', STATE.sort);
  if(STATE.tag) params.set('t', STATE.tag);
  if(STATE.onlyFavs) params.set('f','1');
  const url = params.toString() ? `?${params.toString()}` : location.pathname;
  if(pushUrl) history.replaceState(null, '', url);
  render();
}

function parseParams(){
  const p = new URLSearchParams(location.search);
  STATE.q = p.get('q')||'';
  STATE.grade = p.get('g')||'';
  STATE.sort = p.get('s')||'title';
  STATE.tag = p.get('t')||'';
  STATE.onlyFavs = p.get('f') === '1';
}

// ===== Favorites & Recents =====
const FAVORITES_KEY = 'mt-favs';
const RECENTS_KEY = 'mt-recents';

function getFavs(){ return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]')); }
function setFavs(set){ localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set])); }
function getRecents(){ return JSON.parse(localStorage.getItem(RECENTS_KEY)||'[]'); }
function pushRecent(path){
  const arr = getRecents().filter(p => p!==path); arr.unshift(path);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(arr.slice(0,8)));
}

// track clicks for recents
document.addEventListener('click', e=>{
  const a = e.target.closest('a[href]');
  if(a && a.getAttribute('target') === '_blank'){ pushRecent(a.getAttribute('href')); }
});

// ===== Filtering =====
function filterData(){
  const term = normalize(STATE.q);
  const favs = getFavs();
  return DATA.filter(it => {
    const okGrade = !STATE.grade || it.grade === STATE.grade;
    const okTag = !STATE.tag || (it.tags||[]).includes(STATE.tag);
    const okFav = !STATE.onlyFavs || favs.has(it.path);
    const hay = normalize(it.title + ' ' + (it.tags||[]).join(' ') + ' ' + ((it.extra && it.extra.headings || []).join(' ')) + ' ' + ((it.extra && it.extra.keywords || []).join(' ')));
    const okTerm = !term || hay.includes(term);
    return okGrade && okTag && okFav && okTerm;
  }).sort((a,b)=>{
    const s = STATE.sort;
    if(s === 'title') return a.title.localeCompare(b.title, 'vi');
    if(s === '-title') return b.title.localeCompare(a.title, 'vi');
    if(s === 'updatedAt') return new Date(a.updatedAt) - new Date(b.updatedAt);
    if(s === '-updatedAt') return new Date(b.updatedAt) - new Date(a.updatedAt);
    return 0;
  });
}

// ===== Highlight helper =====
function hl(text, term){
  if(!term) return text;
  const t = escReg(term);
  return text.replace(new RegExp(t, 'ig'), m=>`<mark>${m}</mark>`);
}

// ===== Render =====
function render(){
  // controls
  $('#q').value = STATE.q;
  $('#sort').value = STATE.sort;
  $('#onlyFavs').checked = STATE.onlyFavs;
  $$('.tab').forEach(btn => btn.classList.toggle('is-active', btn.dataset.grade === STATE.grade));

  const filtered = filterData();
  $('#stats').textContent = `Có ${filtered.length}/${DATA.length} công cụ` + (STATE.grade?` • Khối ${STATE.grade}`:'') + (STATE.onlyFavs?' • ⭐':'') + (STATE.tag?` • #${STATE.tag}`:'');

  // tag chipbar (top 10)
  const tagCount = new Map();
  for(const it of DATA){ (it.tags||[]).forEach(t => tagCount.set(t, (tagCount.get(t)||0)+1)); }
  const popular = Array.from(tagCount.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
  $('#chipbar').innerHTML = popular.map(([t,c])=>`<button class="chip ${STATE.tag===t?'is-active':''}" data-tag="${t}">#${t} (${c})</button>`).join('');

  // recents
  const rec = getRecents().map(p => DATA.find(d => d.path===p)).filter(Boolean).slice(0,8);
  $('#recents').innerHTML = rec.length ? `<h4>Gần đây</h4><div class="row">${
    rec.map(it=>`<a href="${it.path}" target="_blank" rel="noopener">${it.title}</a>`).join('')
  }</div>` : '';

  // cards
  const favs = getFavs();
  $('#list').innerHTML = filtered.map(it => `
    <article class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <h3><a href="${it.path}" target="_blank" rel="noopener">${hl(it.title, STATE.q)}</a></h3>
        <button class="btn ghost" data-fav="${it.path}" title="Ghim/Yêu thích">${favs.has(it.path)?'⭐':'☆'}</button>
      </div>
      <div class="meta">Khối <strong>${it.grade}</strong> • Cập nhật: ${new Date(it.updatedAt).toLocaleDateString('vi-VN')}</div>
      ${(it.tags && it.tags.length) ? `<div class="badges">${it.tags.map(t=>`<span class="badge">#${hl(t, STATE.q)}</span>`).join('')}</div>` : ''}
    </article>
  `).join('');

  // bind fav buttons (delegate)
  $('#list').onclick = (e)=>{
    const btn = e.target.closest('button[data-fav]'); if(!btn) return;
    const favs2 = getFavs(); const p = btn.dataset.fav;
    if (favs2.has(p)) favs2.delete(p); else favs2.add(p);
    setFavs(favs2); render();
  };

  // autosuggest
  renderSuggest(filtered);
}

// ===== Autosuggest =====
let suggestBox;
function ensureSuggestBox(){
  if (suggestBox) return;
  suggestBox = document.createElement('div');
  suggestBox.className = 'suggest';
  document.querySelector('.input-group').appendChild(suggestBox);
}
function renderSuggest(items){
  ensureSuggestBox();
  if (!STATE.q) { suggestBox.innerHTML=''; return; }
  const top = items.slice(0,8);
  suggestBox.innerHTML = top.map(it => `
    <div class="sg-item" data-path="${it.path}">
      <strong>${hl(it.title, STATE.q)}</strong>
      <span>${(it.tags||[]).slice(0,3).map(t=>'#'+hl(t, STATE.q)).join(' ')}</span>
    </div>`).join('');
}
document.addEventListener('click', (e)=>{
  const el = e.target.closest('.sg-item');
  if (el){ window.open(el.dataset.path, '_blank'); }
});

// ===== Command Palette =====
function openPalette(){
  const dlg = document.createElement('dialog');
  dlg.className='palette';
  dlg.innerHTML = `
    <input id="pal-q" type="text" placeholder="Tìm công cụ… (gõ để lọc)" autofocus>
    <div id="pal-list"></div>`;
  document.body.appendChild(dlg); dlg.showModal();

  const palq = dlg.querySelector('#pal-q');
  const pall = dlg.querySelector('#pal-list');

  function rerender(){
    const term = palq.value.trim().toLowerCase();
    const items = filterData().filter(it =>
      (it.title + ' ' + (it.tags||[]).join(' ') + ' ' + ((it.extra && it.extra.headings || []).join(' '))).toLowerCase().includes(term)
    ).slice(0,30);
    pall.innerHTML = items.map(it=>`
      <div class="pal-item" data-path="${it.path}">
        <strong>${hl(it.title, term)}</strong> <em>• ${it.grade}</em>
        ${(it.tags||[]).length? `<span>${it.tags.slice(0,3).map(t=>'#'+t).join(' ')}</span>`:''}
      </div>`).join('');
  }
  palq.addEventListener('input', rerender);
  pall.addEventListener('click', e=>{
    const it = e.target.closest('.pal-item'); if(!it) return;
    window.open(it.dataset.path, '_blank'); dlg.close(); dlg.remove();
  });
  dlg.addEventListener('close', ()=> dlg.remove());
  rerender();
}

// ===== Events & Shortcuts =====
function bindEvents(){
  // search debounce
  let t;
  $('#q').addEventListener('input', e=>{
    clearTimeout(t);
    t = setTimeout(()=> setState({ q: e.target.value }), 120);
  });
  $('#sort').addEventListener('change', e=> setState({ sort: e.target.value }));
  $('#onlyFavs').addEventListener('change', e=> setState({ onlyFavs: e.target.checked }));
  $$('.tab').forEach(btn => btn.addEventListener('click', ()=> setState({ grade: btn.dataset.grade })));
  $('#chipbar').addEventListener('click', e=>{
    const btn = e.target.closest('.chip');
    if(!btn) return;
    const tag = btn.dataset.tag;
    setState({ tag: STATE.tag===tag? '' : tag });
  });

  // theme toggle
  const root = document.documentElement;
  $('#themeToggle').addEventListener('click', ()=>{
    const isDark = root.classList.toggle('dark');
    localStorage.setItem('theme', isDark? 'dark':'light');
  });
  $('#openPalette').addEventListener('click', openPalette);
  const saved = localStorage.getItem('theme');
  if(saved === 'dark') root.classList.add('dark');

  // shortcuts
  document.addEventListener('keydown', (e)=>{
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); $('#q').focus();
    }
    if (e.key === 'Escape') setState({ q:'', tag:'', grade:'', onlyFavs:false });
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openPalette(); }
  });
}

// ===== Boot =====
async function boot(){
  parseParams();
  bindEvents();
  try{
    const res = await fetch('manifest.json', { cache: 'no-store' });
    DATA = await res.json();
  }catch(err){
    DATA = [];
    console.error('Load manifest error', err);
  }
  render();
}
boot();
