import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = process.cwd();
const BASE = 'tools';
const GRADES = ['10','11','12'];

function safeList(dir){ try{ return readdirSync(dir, { withFileTypes: true }) } catch{ return [] } }

function walkHtml(dir, grade) {
  const abs = join(ROOT, dir);
  return safeList(abs).flatMap(d => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return walkHtml(p, grade);
    if (extname(d.name).toLowerCase() !== '.html') return [];
    const full = join(ROOT, p);
    let html = '';
    try { html = readFileSync(full, 'utf8'); } catch { /* ignore */ }

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : basename(d.name, '.html');

    const metaTagsMatch = html.match(/<meta[^>]+name=["']tool-tags["'][^>]+>/i);
    let tags = [];
    if (metaTagsMatch) {
      const contentMatch = metaTagsMatch[0].match(/content=["']([^"']+)["']/i);
      if (contentMatch) tags = contentMatch[1].split(',').map(s=>s.trim()).filter(Boolean);
    }

    const kwMeta = html.match(/<meta[^>]+name=["']keywords["'][^>]+>/i);
    let keywords = [];
    if (kwMeta){
      const m = kwMeta[0].match(/content=["']([^"']+)["']/i);
      if (m) keywords = m[1].split(',').map(s=>s.trim()).filter(Boolean);
    }

    const hMatches = [...html.matchAll(/<(h1|h2|h3)[^>]*>(.*?)<\/\1>/gis)].map(m=>m[2].replace(/<[^>]+>/g,'').trim()).slice(0,6);

    const st = statSync(full);
    return [{
      title,
      path: p.replace(/^\/?/, ''),
      grade,
      tags,
      updatedAt: st.mtime.toISOString(),
      extra: { headings: hMatches, keywords }
    }];
  });
}

const items = GRADES.flatMap(g => walkHtml(join(BASE, g), g));
items.sort((a,b) => a.grade.localeCompare(b.grade) || a.title.localeCompare(b.title, 'vi'));
writeFileSync('manifest.json', JSON.stringify(items, null, 2), 'utf8');
console.log(`Generated manifest with ${items.length} items`);
