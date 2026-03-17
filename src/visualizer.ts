// src/visualizer.ts — Full-viewport file-level codebase topology visualization.
// Every file is a node. Files cluster by directory via force simulation.
// Import edges + co-change edges + implicit coupling rendered simultaneously.

import type { StructuredAnalysis } from "./types.js";

type Pkg = StructuredAnalysis["packages"][0];

export function generateReport(analysis: StructuredAnalysis): string {
  const pkg = analysis.packages[0];
  if (!pkg) return "<html><body><p>No packages found.</p></body></html>";

  const graph = buildFileGraph(pkg);
  const cochangeData = (pkg.gitHistory?.coChangeEdges ?? []).map((e) => [
    e.file1,
    e.file2,
    Math.round(e.jaccard * 100),
  ]);

  const statsHtml = [
    ["Files", pkg.files.total],
    ["Imports", pkg.importChain?.length ?? 0],
    ["Co-changes", pkg.gitHistory?.coChangeEdges?.length ?? 0],
    ["Clusters", pkg.coChangeClusters?.length ?? 0],
    ["Flows", pkg.executionFlows?.length ?? 0],
  ]
    .map(([l, v]) => `<div class="s"><span class="sv">${v}</span><span class="sl">${l}</span></div>`)
    .join("");

  const flowsHtml = (pkg.executionFlows ?? [])
    .slice(0, 6)
    .map((f) => {
      const conf =
        f.confidence >= 0.3
          ? '<i class="dot dot-g"></i>'
          : f.confidence > 0
            ? '<i class="dot dot-a"></i>'
            : '<i class="dot dot-m"></i>';
      return `<div class="fl">${conf}<span>${esc(f.steps.join(" \u2192 "))}</span></div>`;
    })
    .join("");

  const convHtml = [
    ...(pkg.conventions ?? []).map(
      (c) => `<div class="cv cv-do">${esc(c.name)} <span class="cd">${c.confidence.percentage}%</span></div>`,
    ),
    ...(pkg.antiPatterns ?? []).map((a) => `<div class="cv cv-no">${esc(a.rule)}</div>`),
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pkg.name)} \u2014 Codebase Topology</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0}
svg{display:block;width:100%;height:100%}
.hdr{position:fixed;top:0;left:0;right:0;padding:16px 24px;display:flex;align-items:center;gap:16px;z-index:10;pointer-events:none}
.hdr>*{pointer-events:auto}
.hdr h1{font-size:18px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap}
.hdr .tag{font-size:11px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,0.08);color:#888}
.stats{display:flex;gap:2px;margin-left:auto}
.s{text-align:center;padding:4px 12px}
.sv{display:block;font-size:16px;font-weight:700;color:#7aa2f7}
.sl{display:block;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#555}
.legend{position:fixed;bottom:16px;left:24px;display:flex;gap:16px;font-size:11px;color:#555;z-index:10}
.legend i{display:inline-block;width:20px;height:2px;vertical-align:middle;margin-right:4px;border-radius:1px}
.leg-imp{background:#333}
.leg-coc{background:#c59a28;opacity:0.7}
.leg-impl{background:#b44e8a;opacity:0.7}
.panel{position:fixed;top:0;right:0;width:300px;height:100%;background:#0d0d14;border-left:1px solid #1a1a24;z-index:20;transform:translateX(100%);transition:transform 0.25s ease;overflow-y:auto;padding:20px}
.panel.open{transform:translateX(0)}
.panel h2{font-size:15px;font-weight:700;margin-bottom:2px}
.panel .sub{font-size:12px;color:#555;margin-bottom:16px}
.panel h3{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#444;margin:14px 0 6px}
.panel ul{list-style:none}
.panel li{font-size:12px;padding:4px 0;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #111}
.panel li:last-child{border:none}
.panel code{font-size:11px;color:#8a8a9a}
.badge{font-size:9px;padding:1px 6px;border-radius:99px;font-weight:600}
.badge-b{background:rgba(122,162,247,0.15);color:#7aa2f7}
.badge-a{background:rgba(197,154,40,0.15);color:#c59a28}
.badge-p{background:rgba(180,78,138,0.15);color:#b44e8a}
.close-btn{position:absolute;top:12px;right:12px;background:none;border:none;color:#444;font-size:18px;cursor:pointer;padding:4px 8px}
.close-btn:hover{color:#888}
.drawer{position:fixed;bottom:0;left:0;right:0;z-index:10;pointer-events:none}
.drawer>*{pointer-events:auto}
.dtoggle{display:flex;justify-content:center}
.dtoggle button{font-size:11px;padding:4px 16px;border-radius:6px 6px 0 0;border:1px solid #1a1a24;border-bottom:none;background:#0d0d14;color:#666;cursor:pointer}
.dtoggle button:hover{color:#999}
.dcontent{background:#0d0d14;border-top:1px solid #1a1a24;max-height:0;overflow:hidden;transition:max-height 0.3s ease}
.dcontent.open{max-height:300px;overflow-y:auto}
.dcontent-inner{padding:16px 24px;display:flex;gap:32px}
.dcol{flex:1;min-width:200px}
.dcol h3{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#444;margin-bottom:8px}
.fl{font-size:11px;color:#666;padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl span{margin-left:4px}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%}
.dot-g{background:#4ade80}.dot-a{background:#c59a28}.dot-m{background:#333}
.cv{font-size:11px;padding:4px 8px;margin:2px 0;border-radius:4px;border-left:3px solid}
.cv-do{border-color:#4ade80;background:rgba(74,222,128,0.05);color:#777}
.cv-no{border-color:#f87171;background:rgba(248,113,113,0.05);color:#777}
.cd{font-size:9px;color:#555}
.hint{position:fixed;bottom:50px;left:50%;transform:translateX(-50%);font-size:12px;color:#333;z-index:5;transition:opacity 0.5s}
</style>
</head>
<body>
<div class="hdr">
  <h1>${esc(pkg.name)}</h1>
  <span class="tag">${pkg.architecture.packageType}</span>
  <div class="stats">${statsHtml}</div>
</div>
<div class="legend">
  <span><i class="leg-imp"></i>import</span>
  <span><i class="leg-coc" style="border:1px dashed #c59a28;height:0;width:20px"></i>co-change</span>
  <span><i class="leg-impl" style="border:1px dotted #b44e8a;height:0;width:20px"></i>implicit coupling</span>
  <span style="margin-left:8px;opacity:0.6">|</span>
  <span>color = directory group</span>
</div>
<div class="hint" id="hint">click a file to explore its connections</div>
<svg id="graph"></svg>
<div class="panel" id="panel">
  <button class="close-btn" onclick="closePanel()">&times;</button>
  <div id="panel-content"></div>
</div>
<div class="drawer">
  <div class="dtoggle"><button onclick="toggleDrawer()">Flows &amp; Conventions</button></div>
  <div class="dcontent" id="drawer">
    <div class="dcontent-inner">
      <div class="dcol"><h3>Execution Flows</h3>${flowsHtml || '<div class="fl">No flows detected</div>'}</div>
      <div class="dcol"><h3>Conventions</h3>${convHtml || '<div class="cv">No conventions detected</div>'}</div>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const G=${JSON.stringify(graph)};
const CC=${JSON.stringify(cochangeData)};
const PAL=['#7aa2f7','#4ade80','#c59a28','#f87171','#a78bfa','#e879a0','#38bdf8','#fb923c'];
const W=innerWidth,H=innerHeight;
const svg=d3.select('#graph').attr('viewBox',[0,0,W,H]);

const NC=G.nodes.length;
const maxImp=Math.max(1,...G.nodes.map(n=>n.importedBy));

// Directory cluster centers — spread evenly across the viewport
const dirs=[...new Set(G.nodes.map(n=>n.dir))];
const dirCenters={};
dirs.forEach((d,i)=>{
  const angle=(2*Math.PI*i)/dirs.length;
  const rx=W*0.3,ry=H*0.3;
  dirCenters[d]={x:W/2+Math.cos(angle)*rx, y:H/2+Math.sin(angle)*ry};
});

// Directory label colors
const dirColor={};
dirs.forEach((d,i)=>{dirColor[d]=PAL[i%PAL.length]});

// Force simulation — files cluster toward their directory center
const sim=d3.forceSimulation(G.nodes)
  .force('link',d3.forceLink(G.edges).id(d=>d.id).distance(NC>80?25:NC>40?40:60).strength(0.3))
  .force('charge',d3.forceManyBody().strength(NC>80?-15:NC>40?-30:-60))
  .force('collision',d3.forceCollide().radius(NC>80?6:NC>40?8:12))
  .force('x',d3.forceX(d=>dirCenters[d.dir].x).strength(0.15))
  .force('y',d3.forceY(d=>dirCenters[d.dir].y).strength(0.15));

// Directory labels (background text showing directory name)
const dirLabels=svg.append('g').selectAll('text').data(dirs).join('text')
  .attr('text-anchor','middle')
  .attr('fill',d=>dirColor[d])
  .attr('opacity',0.12)
  .attr('font-size',NC>80?'16px':NC>40?'22px':'28px')
  .attr('font-weight','800')
  .text(d=>{const p=d.split('/');return p.at(-1)||d});

// Edges
const link=svg.append('g').selectAll('line').data(G.edges).join('line')
  .attr('stroke',d=>d.type==='cochange'?'#c59a28':d.type==='implicit'?'#b44e8a':'#1a1a1f')
  .attr('stroke-width',d=>d.type==='cochange'||d.type==='implicit'?1.2:0.4)
  .attr('stroke-dasharray',d=>d.type==='cochange'?'5,3':d.type==='implicit'?'2,3':'none')
  .attr('opacity',d=>d.type==='import'?0.2:0.5);

// Glow filter
const defs=svg.append('defs');
const glow=defs.append('filter').attr('id','glow');
glow.append('feGaussianBlur').attr('stdDeviation','3').attr('result','blur');
const mg=glow.append('feMerge');mg.append('feMergeNode').attr('in','blur');mg.append('feMergeNode').attr('in','SourceGraphic');

// File nodes
const nodeR=NC>80?3:NC>40?4:6;
const node=svg.append('g').selectAll('g').data(G.nodes).join('g')
  .call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y})
    .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}))
  .on('click',(e,d)=>{e.stopPropagation();selectFile(d)})
  .style('cursor','pointer');

node.append('circle')
  .attr('r',d=>nodeR+Math.sqrt(d.importedBy/maxImp)*(NC>80?6:NC>40?10:16))
  .attr('fill',d=>dirColor[d.dir]+'33')
  .attr('stroke',d=>dirColor[d.dir])
  .attr('stroke-width',0.8);

// Labels — only show for larger/more-imported files to reduce clutter
const labelThreshold=NC>80?5:NC>40?2:1;
node.filter(d=>d.importedBy>=labelThreshold).append('text')
  .text(d=>d.name.replace(/\\.[^.]+$/,''))
  .attr('text-anchor','middle')
  .attr('dy',d=>-(nodeR+2+Math.sqrt(d.importedBy/maxImp)*(NC>80?6:NC>40?10:16)))
  .attr('font-size',NC>80?'7px':NC>40?'8px':'10px')
  .attr('fill','#666').attr('font-weight','500')
  .attr('paint-order','stroke').attr('stroke','#0a0a0f').attr('stroke-width',NC>80?2:3);

const pad=50;
sim.on('tick',()=>{
  G.nodes.forEach(d=>{d.x=Math.max(pad,Math.min(W-pad,d.x));d.y=Math.max(pad,Math.min(H-pad,d.y))});
  link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
  node.attr('transform',d=>\`translate(\${d.x},\${d.y})\`);
  // Keep directory labels at cluster centroid
  dirLabels.attr('x',d=>{const fs=G.nodes.filter(n=>n.dir===d);return fs.length?d3.mean(fs,n=>n.x):0})
    .attr('y',d=>{const fs=G.nodes.filter(n=>n.dir===d);return fs.length?d3.mean(fs,n=>n.y)+6:0});
});

function selectFile(d){
  document.getElementById('hint').style.opacity='0';
  node.select('circle').attr('opacity',.12).attr('filter',null);
  link.attr('opacity',.03);

  // Highlight selected
  node.filter(n=>n.id===d.id).select('circle').attr('opacity',1).attr('filter','url(#glow)').attr('stroke-width',2);

  // Connected nodes
  const conn=new Set();
  G.edges.forEach(e=>{
    const s=typeof e.source==='object'?e.source.id:e.source;
    const t=typeof e.target==='object'?e.target.id:e.target;
    if(s===d.id)conn.add(t);if(t===d.id)conn.add(s);
  });
  node.filter(n=>conn.has(n.id)).select('circle').attr('opacity',.8);
  link.filter(e=>{
    const s=typeof e.source==='object'?e.source.id:e.source;
    const t=typeof e.target==='object'?e.target.id:e.target;
    return s===d.id||t===d.id;
  }).attr('opacity',.9);

  // Panel
  const path=d.id;
  const imp=G.edges.filter(e=>{const s=typeof e.source==='object'?e.source.id:e.source;return s===path&&e.type==='import'});
  const impBy=G.edges.filter(e=>{const t=typeof e.target==='object'?e.target.id:e.target;return t===path&&e.type==='import'});
  const coc=CC.filter(e=>e[0]===path||e[1]===path);
  const seen=new Set();const ucoc=coc.filter(e=>{const k=e[0]+e[1];if(seen.has(k))return false;seen.add(k);return true});

  let h='<h2>'+d.name+'</h2>';
  h+='<div class="sub">'+d.dir+'/ &middot; imported by '+d.importedBy+' files</div>';
  if(impBy.length){h+='<h3>Imported by ('+impBy.length+')</h3><ul>';impBy.slice(0,10).forEach(e=>{const s=typeof e.source==='object'?e.source.id:e.source;h+='<li><code>'+s.split('/').pop()+'</code><span class="badge badge-b">'+e.weight+'</span></li>'});h+='</ul>'}
  if(imp.length){h+='<h3>Imports ('+imp.length+')</h3><ul>';imp.slice(0,10).forEach(e=>{const t=typeof e.target==='object'?e.target.id:e.target;h+='<li><code>'+t.split('/').pop()+'</code><span class="badge badge-b">'+e.weight+'</span></li>'});h+='</ul>'}
  if(ucoc.length){h+='<h3>Co-changes</h3><ul>';ucoc.slice(0,8).forEach(e=>{const p=e[0]===path?e[1]:e[0];h+='<li><code>'+p.split('/').pop()+'</code><span class="badge badge-a">'+e[2]+'%</span></li>'});h+='</ul>'}
  document.getElementById('panel-content').innerHTML=h;
  document.getElementById('panel').classList.add('open');
}

function closePanel(){
  document.getElementById('panel').classList.remove('open');
  node.select('circle').attr('opacity',1).attr('filter',null).attr('stroke-width',0.8);
  link.attr('opacity',d=>d.type==='import'?0.2:0.5);
}
svg.on('click',()=>closePanel());
function toggleDrawer(){document.getElementById('drawer').classList.toggle('open')}
</script>
</body>
</html>`;
}

// ─── File-Level Graph Data ───────────────────────────────────────────────────

interface FNode {
  id: string; // full file path
  name: string; // filename only
  dir: string; // directory
  importedBy: number;
}

interface FEdge {
  source: string;
  target: string;
  weight: number;
  type: "import" | "cochange" | "implicit";
}

function buildFileGraph(pkg: Pkg): { nodes: FNode[]; edges: FEdge[] } {
  const importEdges = pkg.importChain ?? [];
  const coChangeEdges = pkg.gitHistory?.coChangeEdges ?? [];
  const implicitEdges = pkg.implicitCoupling ?? [];

  // Collect all files and their import counts
  const files = new Map<string, number>(); // path → importedBy count
  for (const e of importEdges) {
    if (!files.has(e.importer)) files.set(e.importer, 0);
    files.set(e.source, (files.get(e.source) ?? 0) + 1);
  }

  const nodes: FNode[] = [...files.entries()].map(([path, importedBy]) => ({
    id: path,
    name: path.split("/").pop()!,
    dir: fdir(path),
    importedBy,
  }));

  const fileSet = new Set(files.keys());
  const edges: FEdge[] = [];

  // Import edges (file to file)
  for (const e of importEdges) {
    edges.push({ source: e.importer, target: e.source, weight: e.symbolCount, type: "import" });
  }

  // Co-change edges (only between files that are in the graph)
  for (const e of coChangeEdges) {
    if (fileSet.has(e.file1) && fileSet.has(e.file2)) {
      edges.push({
        source: e.file1,
        target: e.file2,
        weight: Math.round(e.jaccard * 100),
        type: "cochange",
      });
    }
  }

  // Implicit coupling edges
  for (const e of implicitEdges) {
    if (fileSet.has(e.file1) && fileSet.has(e.file2)) {
      edges.push({
        source: e.file1,
        target: e.file2,
        weight: Math.round(e.jaccard * 100),
        type: "implicit",
      });
    }
  }

  return { nodes, edges };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fdir(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : ".";
}
