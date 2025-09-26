import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = process.cwd();
const BASE = 'tools';
const GRADE_DIRS = ['10','11','12'];

function safeList(dir){ try{ return readdirSync(dir, { withFileTypes: true }) } catch{ return [] } }

function inferGrade(p, html) {
  // Ưu tiên theo folder
  if (p.includes('/10/')) return '10';
  if (p.includes('/11/')) return '11';
  if (p.includes('/12/')) return '12';
  // Theo meta <meta name="tool-grade" content="10">
  const m = html.match(/<meta[^>]+name=["']tool-grade["'][^>]+>/i);
  if (m) {
    const c = m[0].match(/content=["']([^"']+)["']/i);
    if (c && ['10','11','12'].includes(c[1].trim())) return c[1].trim();
  }
  // Theo tiêu đề có chữ (Lớp 10/11/12)
  const t = html.match(/<title>([^<]+)<\/title>/i);
  if (t) {
    const s = t[1];
    if (/lớp\s*10/i.test(s)) return '10';
    if (/lớp\s*11/i.test(s)) return '11';
    if (/lớp\s*12/i.test(s)) return '12';
  }
  return 'khác';
}

function walk(dir) {
  const abs = join(ROOT, dir);
  return safeList(abs).flatMap(d => {
    const p = join(dir, d.name).replace(/\\/g,'/');
    if (d.isDirectory()) return walk(p);
    if (extname(d.name).toLowerCase() !== '.html') return [];
    const full = join(ROOT, p);
    let html = '';
    try { html = readFileSync(full, 'utf8'); } catch {}
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : basename(d.name, '.html');

    const tagsMeta = html.match(/<meta[^>]+name=["']tool-tags["'][^>]+>/i);
    let tags = [];
    if (tagsMeta) {
      const m = tagsMeta[0].match(/content=["']([^"']+)["']/i);
      if (m) tags = m[1].split(',').map(s=>s.trim()).filter(Boolean);
    }
    const kwMeta = html.match(/<meta[^>]+name=["']keywords["'][^>]+>/i);
    let keywords = [];
    if (kwMeta){
      const m = kwMeta[0].match(/content=["']([^"']+)["']/i);
      if (m) keywords = m[1].split(',').map(s=>s.trim()).filter(Boolean);
    }
    const heads = [...html.matchAll(/<(h1|h2|h3)[^>]*>(.*?)<\/\1>/gis)]
      .map(m=>m[2].replace(/<[^>]+>/g,'').trim()).slice(0,6);

    const st = statSync(full);
    return [{
      title,
      path: p.replace(/^\/?/, ''),
      grade: inferGrade(p, html),
      tags,
      updatedAt: st.mtime.toISOString(),
      extra: { headings: heads, keywords }
    }];
  });
}

// Quét toàn bộ thư mục tools (kể cả gốc và các cấp con)
const items = walk(BASE);
items.sort((a,b) => (a.grade||'').localeCompare(b.grade||'') || a.title.localeCompare(b.title, 'vi'));
writeFileSync('manifest.json', JSON.stringify(items, null, 2), 'utf8');
console.log(`Generated manifest with ${items.length} items`);
