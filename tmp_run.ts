import { readFileSync } from "fs";
import { FileLoader, BytecodeReader, Ops, disassemble } from "./src/lib/decompiler";
const bytes = new Uint8Array(readFileSync("/tmp/test.dso"));
const data = new FileLoader().load(bytes);
const disasm = disassemble(new BytecodeReader(data, new Ops()));
let i = disasm.first;
let n = 0;
while (i && n < 40) {
  console.log(i.address, i.constructor.name, JSON.stringify(Object.fromEntries(Object.entries(i).filter(([k])=>!["prev","next","opcode"].includes(k)))));
  i = i.next; n++;
}
