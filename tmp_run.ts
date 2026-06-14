import { readFileSync } from "fs";
import { FileLoader, BytecodeReader, Ops, disassemble } from "./src/lib/decompiler";
const bytes = new Uint8Array(readFileSync("/tmp/test.dso"));
const data = new FileLoader().load(bytes);
const disasm = disassemble(new BytecodeReader(data, new Ops()));
let i = disasm.first;
let prev: any = null;
let count = 0;
while (i && count < 10) {
  if (i.constructor.name === "CreateObjectInstruction") {
    console.log("CREATE at", i.address, "prev:", prev?.constructor.name, "value:", (prev as any)?.value);
    count++;
  }
  prev = i;
  i = i.next;
}
