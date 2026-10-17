import fs from "node:fs";
const txt = fs.readFileSync("work/errlist.txt","utf8").split("\n");
// print only lines starting with ### followed by their val line, but skip the first 3 debug lines
let out=[];
for (let i=3;i<txt.length;i++){
  const l = txt[i];
  if (l.startsWith("### ") || l.trim().startsWith("msg:") || l.trim().startsWith("val:")) out.push(l);
}
fs.writeFileSync("work/errlist.clean.txt", out.join("\n"),"utf8");
console.log("lines="+out.length);
