import { readFileSync } from "fs";
import { decompile } from "./src/lib/decompiler";
const bytes = new Uint8Array(readFileSync("/tmp/test.dso"));
const out = decompile(bytes);
if (out.ok) console.log(out.source!.split("\n").slice(0,30).join("\n"));
else console.log("ERR", out.error);
