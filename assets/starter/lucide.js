// Small original SVG icon set for the anonymous demonstration; no external library.
(()=>{
 const shapes={
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  'share-2':'M5 12 19 5M5 12l14 7M5 12h.01M19 5h.01M19 19h.01',
  'database-backup':'M4 5h16v14H4zM8 9h8M8 13h8M8 17h4',
  x:'m6 6 12 12M18 6 6 18', check:'m5 12 4 4L19 6',
  'check-check':'m2 12 4 4L16 6m-6 10 3 3L23 9',
  'undo-2':'M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12',
  'square-pen':'M14 4 20 10M4 20l5-1L21 7l-4-4L5 15z',
  copy:'M8 8h13v13H8zM16 8V3H3v13h5', search:'M16 16l5 5M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
  trophy:'M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-4 0h8'
 };
 window.lucide={createIcons(){document.querySelectorAll('i[data-lucide]').forEach(el=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:'18',height:'18',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
  const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',shapes[el.dataset.lucide]||shapes.check);svg.appendChild(p);el.replaceWith(svg);
 });}};
})();
