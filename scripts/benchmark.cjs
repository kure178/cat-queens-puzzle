const fs = require('node:fs');
const os = require('node:os');
const { generate, connected } = require('../js/generator.js');
const { solve } = require('../js/solver.js');
function random(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function shape(p) {
  const regions = Array.from({length:p.n}, (_, id) => {
    const cells = p.regions.flatMap((color, i) => color === id ? [i] : []);
    const rows = cells.map(i => Math.floor(i/p.n)), cols = cells.map(i=>i%p.n);
    let boundary = 0;
    for (const i of cells) {
      const r = Math.floor(i/p.n), c = i%p.n;
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const rr=r+dr, cc=c+dc;
        if(rr<0||rr>=p.n||cc<0||cc>=p.n||p.regions[rr*p.n+cc]!==id) boundary++;
      }
    }
    return {area:cells.length, height:Math.max(...rows)-Math.min(...rows)+1,width:Math.max(...cols)-Math.min(...cols)+1,boundary};
  });
  return regions.sort((a,b)=>b.area-a.area)[0];
}
(async () => {
  const report = { environment: {date:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,platform:process.platform}, rows:[], summary:{} };
  const samples=[];
  for (const [mode,count] of [['RandomSnake',100],['Balanced',100],['SeedGrowth',20]]) {
    for (let seed=1;seed<=count;seed++) {
      const start=performance.now();
      try {
        const {puzzle,metrics}=await generate(12,{mode,random:random(seed)});
        const elapsedMs=performance.now()-start;
        if(JSON.stringify(solve(puzzle.regions,12))!==JSON.stringify([puzzle.solution]) || !Array.from({length:12},(_,id)=>connected(puzzle.regions,id,12)).every(Boolean)) throw Error('INVALID PUZZLE');
        report.rows.push({mode,seed,ok:true,elapsedMs,metrics,shape:shape(puzzle)});
        if(seed<=3) samples.push({seed,...puzzle});
      } catch(error) {
        if(error.name!=='GenerationTimeoutError') throw error;
        report.rows.push({mode,seed,ok:false,elapsedMs:performance.now()-start,error:error.message,metrics:error.metrics});
      }
      if(seed%10===0) console.log(mode,seed+'/'+count);
    }
    const rows=report.rows.filter(r=>r.mode===mode), times=rows.map(r=>r.elapsedMs).sort((a,b)=>a-b), successful=rows.filter(r=>r.ok);
    const mean=key=>successful.reduce((sum,r)=>sum+r.shape[key],0)/successful.length;
    report.summary[mode]={count,completed:successful.length,medianMs:times[Math.ceil(count*.5)-1],p95Ms:times[Math.ceil(count*.95)-1],maxMs:times.at(-1),meanLargestRegion:{area:mean('area'),height:mean('height'),width:mean('width'),boundary:mean('boundary')}};
    console.log(JSON.stringify(report.summary[mode]));
    fs.writeFileSync('artifacts/generation-benchmark.json',JSON.stringify(report,null,2));
  }
  fs.writeFileSync('artifacts/generation-samples.json',JSON.stringify(samples,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
