import fs from "node:fs";
const file = JSON.parse(fs.readFileSync("examples/leave-approval.bundle.json","utf8"));
export function mkResolve(root){
  return function resolve(ptr0){
    if (!ptr0) return undefined;
    const i = ptr0.indexOf("$.");
    let ptr = i>=0 ? ptr0.slice(i) : ptr0;
    if (ptr.startsWith("$.artifacts")) ptr = "$.bundle"+ptr.slice(1);
    const toks = [];
    const re = /\$|\.[A-Za-z0-9_$-]+|\[(\d+)\]|[A-Za-z0-9_$-]+/g;
    let m;
    while((m=re.exec(ptr))){ const s=m[0];
      if(s==="$") continue;
      if(s[0]===".") toks.push(s.slice(1));
      else if(s[0]==="[") toks.push(Number(m[1]));
      else toks.push(s);
    }
    let cur = root;
    for (const t of toks){ if(cur===null||cur===undefined) return undefined; cur = cur[t]; }
    return cur;
  };
}
const resolve = mkResolve(file);
console.log(JSON.stringify(resolve("$.bundle.artifacts.logicSchemas[0].apis[0].request.body")));
console.log(JSON.stringify(resolve("leave-approval.bundle.json $.bundle.artifacts.dataSchemas[0].entities[1].fields[11].uiHints")));
console.log(JSON.stringify(resolve("$.artifacts.uiSchemas[0].dialogs.dlg_leave_detail.children[1].props")));
