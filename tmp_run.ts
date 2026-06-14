import { readFileSync } from "fs";
import { FileLoader, BytecodeReader, Ops, disassemble } from "./src/lib/decompiler";
const bytes = new Uint8Array(readFileSync("/tmp/test.dso"));
const data = new FileLoader().load(bytes);
const disasm = disassemble(new BytecodeReader(data, new Ops()));
let i = disasm.first;
while (i) {
  const n = i.constructor.name;
  if (["AddObjectInstruction","EndObjectInstruction","CreateObjectInstruction","ImmediateUIntInstruction"].includes(n)) {
    console.log(i.address, n, (i as any).value ?? "");
  }
  i = i.next;
}
