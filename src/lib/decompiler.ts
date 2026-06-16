/**
 * TorqueScript DSO decompiler — TypeScript port of Elletra/dso-sharp.
 *
 * Supports DSO file version 33 (TGE 1.0–1.3 / The Forgettable Dungeon) and
 * version 174 (Tribes 2) end-to-end: bytecode reader → control-flow analyzer
 * → AST builder → TorqueScript code generator. Other versions (TGE 1.4,
 * Torque Constructor, Blockland v1/v20/v21) currently fall back to header
 * detection only.
 *
 * Mirrors dso-sharp's class structure closely to make porting fixes obvious.
 */

/* ────────────────────────────────────────────────────────────────────────── *
 * String escape helper (Util/String.cs)
 * ────────────────────────────────────────────────────────────────────────── */
const ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  "\x00": "\\x00",
  "\x01": "\\c0",
  "\x02": "\\c1",
  "\x03": "\\c2",
  "\x04": "\\c3",
  "\x05": "\\c4",
  "\x06": "\\c5",
  "\x07": "\\c6",
  "\x08": "\\x08",
  "\t": "\\t",
  "\n": "\\n",
  "\x0B": "\\c7",
  "\x0C": "\\c8",
  "\r": "\\r",
  "\x0E": "\\c9",
  "\x0F": "\\cr",
  "\x10": "\\cp",
  "\x11": "\\co",
  "\x12": "\\x12",
  "\x13": "\\x13",
  "\x14": "\\x14",
  "\x15": "\\x15",
  "\x16": "\\x16",
  "\x17": "\\x17",
  "\x18": "\\x18",
  "\x19": "\\x19",
  "\x1A": "\\x1A",
  "\x1B": "\\x1B",
  "\x1C": "\\x1C",
  "\x1D": "\\x1D",
  "\x1E": "\\x1E",
  "\x1F": "\\x1F",
  "\x7F": "\\x7F",
  "\xA0": "\\xA0",
};
export function escapeString(str: string): string {
  if (str.startsWith("\x02\x01")) str = str.slice(1);
  let out = "";
  for (const ch of str) out += ESCAPE_MAP[ch] ?? ch;
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Opcodes (Opcodes/Ops.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export enum OpcodeTag {
  OP_FUNC_DECL,
  OP_CREATE_OBJECT,
  OP_ADD_OBJECT,
  OP_END_OBJECT,
  OP_JMPIFFNOT,
  OP_JMPIFNOT,
  OP_JMPIFF,
  OP_JMPIF,
  OP_JMPIFNOT_NP,
  OP_JMPIF_NP,
  OP_JMP,
  OP_RETURN,
  OP_CMPEQ,
  OP_CMPGR,
  OP_CMPGE,
  OP_CMPLT,
  OP_CMPLE,
  OP_CMPNE,
  OP_XOR,
  OP_MOD,
  OP_BITAND,
  OP_BITOR,
  OP_NOT,
  OP_NOTF,
  OP_ONESCOMPLEMENT,
  OP_SHR,
  OP_SHL,
  OP_AND,
  OP_OR,
  OP_ADD,
  OP_SUB,
  OP_MUL,
  OP_DIV,
  OP_NEG,
  OP_SETCURVAR,
  OP_SETCURVAR_CREATE,
  OP_SETCURVAR_ARRAY,
  OP_SETCURVAR_ARRAY_CREATE,
  OP_LOADVAR_UINT,
  OP_LOADVAR_FLT,
  OP_LOADVAR_STR,
  OP_SAVEVAR_UINT,
  OP_SAVEVAR_FLT,
  OP_SAVEVAR_STR,
  OP_SETCUROBJECT,
  OP_SETCUROBJECT_NEW,
  OP_SETCUROBJECT_INTERNAL,
  OP_SETCURFIELD,
  OP_SETCURFIELD_ARRAY,
  OP_LOADFIELD_UINT,
  OP_LOADFIELD_FLT,
  OP_LOADFIELD_STR,
  OP_SAVEFIELD_UINT,
  OP_SAVEFIELD_FLT,
  OP_SAVEFIELD_STR,
  OP_STR_TO_UINT,
  OP_STR_TO_FLT,
  OP_STR_TO_NONE,
  OP_FLT_TO_UINT,
  OP_FLT_TO_STR,
  OP_FLT_TO_NONE,
  OP_UINT_TO_FLT,
  OP_UINT_TO_STR,
  OP_UINT_TO_NONE,
  OP_LOADIMMED_UINT,
  OP_LOADIMMED_FLT,
  OP_TAG_TO_STR,
  OP_LOADIMMED_STR,
  OP_LOADIMMED_IDENT,
  OP_CALLFUNC_RESOLVE,
  OP_CALLFUNC,
  OP_ADVANCE_STR,
  OP_ADVANCE_STR_APPENDCHAR,
  OP_ADVANCE_STR_COMMA,
  OP_ADVANCE_STR_NUL,
  OP_REWIND_STR,
  OP_TERMINATE_REWIND_STR,
  OP_COMPARE_STR,
  OP_PUSH,
  OP_PUSH_FRAME,
  OP_BREAK,
  OP_UNIT_CONVERSION,
  OP_UNUSED1,
  OP_UNUSED2,
  OP_UNUSED3,
  OP_INVALID,
}

export enum ReturnValueKind { ToFalse, ToTrue, NoChange }
export enum TypeReq { None, UInt, Float, String, Invalid }

/** Base Ops mirrors TGE 1.0–1.3 / Tribes 2 opcode values. */
export class Ops {
  // tag → numeric value
  readonly OP_FUNC_DECL = 0x00;
  readonly OP_CREATE_OBJECT = 0x01;
  readonly OP_ADD_OBJECT = 0x04;
  readonly OP_END_OBJECT = 0x05;
  readonly OP_JMPIFFNOT = 0x06;
  readonly OP_JMPIFNOT = 0x07;
  readonly OP_JMPIFF = 0x08;
  readonly OP_JMPIF = 0x09;
  readonly OP_JMPIFNOT_NP = 0x0A;
  readonly OP_JMPIF_NP = 0x0B;
  readonly OP_JMP = 0x0C;
  readonly OP_RETURN = 0x0D;
  readonly OP_CMPEQ = 0x0E;
  readonly OP_CMPGR = 0x0F;
  readonly OP_CMPGE = 0x10;
  readonly OP_CMPLT = 0x11;
  readonly OP_CMPLE = 0x12;
  readonly OP_CMPNE = 0x13;
  readonly OP_XOR = 0x14;
  readonly OP_MOD = 0x15;
  readonly OP_BITAND = 0x16;
  readonly OP_BITOR = 0x17;
  readonly OP_NOT = 0x18;
  readonly OP_NOTF = 0x19;
  readonly OP_ONESCOMPLEMENT = 0x1A;
  readonly OP_SHR = 0x1B;
  readonly OP_SHL = 0x1C;
  readonly OP_AND = 0x1D;
  readonly OP_OR = 0x1E;
  readonly OP_ADD = 0x1F;
  readonly OP_SUB = 0x20;
  readonly OP_MUL = 0x21;
  readonly OP_DIV = 0x22;
  readonly OP_NEG = 0x23;
  readonly OP_SETCURVAR = 0x24;
  readonly OP_SETCURVAR_CREATE = 0x25;
  readonly OP_SETCURVAR_ARRAY = 0x26;
  readonly OP_SETCURVAR_ARRAY_CREATE = 0x27;
  readonly OP_LOADVAR_UINT = 0x28;
  readonly OP_LOADVAR_FLT = 0x29;
  readonly OP_LOADVAR_STR = 0x2A;
  readonly OP_SAVEVAR_UINT = 0x2B;
  readonly OP_SAVEVAR_FLT = 0x2C;
  readonly OP_SAVEVAR_STR = 0x2D;
  readonly OP_SETCUROBJECT = 0x2E;
  readonly OP_SETCUROBJECT_NEW = 0x2F;
  readonly OP_SETCUROBJECT_INTERNAL = 0xFFFFFFFE; // OP_INVALID sentinel
  readonly OP_SETCURFIELD = 0x30;
  readonly OP_SETCURFIELD_ARRAY = 0x31;
  readonly OP_LOADFIELD_UINT = 0x32;
  readonly OP_LOADFIELD_FLT = 0x33;
  readonly OP_LOADFIELD_STR = 0x34;
  readonly OP_SAVEFIELD_UINT = 0x35;
  readonly OP_SAVEFIELD_FLT = 0x36;
  readonly OP_SAVEFIELD_STR = 0x37;
  readonly OP_STR_TO_UINT = 0x38;
  readonly OP_STR_TO_FLT = 0x39;
  readonly OP_STR_TO_NONE = 0x3A;
  readonly OP_FLT_TO_UINT = 0x3B;
  readonly OP_FLT_TO_STR = 0x3C;
  readonly OP_FLT_TO_NONE = 0x3D;
  readonly OP_UINT_TO_FLT = 0x3E;
  readonly OP_UINT_TO_STR = 0x3F;
  readonly OP_UINT_TO_NONE = 0x40;
  readonly OP_LOADIMMED_UINT = 0x41;
  readonly OP_LOADIMMED_FLT = 0x42;
  readonly OP_TAG_TO_STR = 0x43;
  readonly OP_LOADIMMED_STR = 0x44;
  readonly OP_LOADIMMED_IDENT = 0x45;
  readonly OP_CALLFUNC_RESOLVE = 0x46;
  readonly OP_CALLFUNC = 0x47;
  readonly OP_ADVANCE_STR = 0x49;
  readonly OP_ADVANCE_STR_APPENDCHAR = 0x4A;
  readonly OP_ADVANCE_STR_COMMA = 0x4B;
  readonly OP_ADVANCE_STR_NUL = 0x4C;
  readonly OP_REWIND_STR = 0x4D;
  readonly OP_TERMINATE_REWIND_STR = 0x4E;
  readonly OP_COMPARE_STR = 0x4F;
  readonly OP_PUSH = 0x50;
  readonly OP_PUSH_FRAME = 0x51;
  readonly OP_BREAK = 0x52;
  readonly OP_UNIT_CONVERSION = 0xFFFFFFFD;
  readonly OP_UNUSED1 = 0x02;
  readonly OP_UNUSED2 = 0x03;
  readonly OP_UNUSED3 = 0x48;
  readonly OP_INVALID = 0x53;

  protected _tags: Map<number, OpcodeTag> = new Map();

  constructor() {
    const add = (v: number, t: OpcodeTag) => { if (!this._tags.has(v)) this._tags.set(v, t); };
    const T = OpcodeTag;
    add(this.OP_FUNC_DECL, T.OP_FUNC_DECL);
    add(this.OP_CREATE_OBJECT, T.OP_CREATE_OBJECT);
    add(this.OP_ADD_OBJECT, T.OP_ADD_OBJECT);
    add(this.OP_END_OBJECT, T.OP_END_OBJECT);
    add(this.OP_JMPIFFNOT, T.OP_JMPIFFNOT);
    add(this.OP_JMPIFNOT, T.OP_JMPIFNOT);
    add(this.OP_JMPIFF, T.OP_JMPIFF);
    add(this.OP_JMPIF, T.OP_JMPIF);
    add(this.OP_JMPIFNOT_NP, T.OP_JMPIFNOT_NP);
    add(this.OP_JMPIF_NP, T.OP_JMPIF_NP);
    add(this.OP_JMP, T.OP_JMP);
    add(this.OP_RETURN, T.OP_RETURN);
    add(this.OP_CMPEQ, T.OP_CMPEQ);
    add(this.OP_CMPGR, T.OP_CMPGR);
    add(this.OP_CMPGE, T.OP_CMPGE);
    add(this.OP_CMPLT, T.OP_CMPLT);
    add(this.OP_CMPLE, T.OP_CMPLE);
    add(this.OP_CMPNE, T.OP_CMPNE);
    add(this.OP_XOR, T.OP_XOR);
    add(this.OP_MOD, T.OP_MOD);
    add(this.OP_BITAND, T.OP_BITAND);
    add(this.OP_BITOR, T.OP_BITOR);
    add(this.OP_NOT, T.OP_NOT);
    add(this.OP_NOTF, T.OP_NOTF);
    add(this.OP_ONESCOMPLEMENT, T.OP_ONESCOMPLEMENT);
    add(this.OP_SHR, T.OP_SHR);
    add(this.OP_SHL, T.OP_SHL);
    add(this.OP_AND, T.OP_AND);
    add(this.OP_OR, T.OP_OR);
    add(this.OP_ADD, T.OP_ADD);
    add(this.OP_SUB, T.OP_SUB);
    add(this.OP_MUL, T.OP_MUL);
    add(this.OP_DIV, T.OP_DIV);
    add(this.OP_NEG, T.OP_NEG);
    add(this.OP_SETCURVAR, T.OP_SETCURVAR);
    add(this.OP_SETCURVAR_CREATE, T.OP_SETCURVAR_CREATE);
    add(this.OP_SETCURVAR_ARRAY, T.OP_SETCURVAR_ARRAY);
    add(this.OP_SETCURVAR_ARRAY_CREATE, T.OP_SETCURVAR_ARRAY_CREATE);
    add(this.OP_LOADVAR_UINT, T.OP_LOADVAR_UINT);
    add(this.OP_LOADVAR_FLT, T.OP_LOADVAR_FLT);
    add(this.OP_LOADVAR_STR, T.OP_LOADVAR_STR);
    add(this.OP_SAVEVAR_UINT, T.OP_SAVEVAR_UINT);
    add(this.OP_SAVEVAR_FLT, T.OP_SAVEVAR_FLT);
    add(this.OP_SAVEVAR_STR, T.OP_SAVEVAR_STR);
    add(this.OP_SETCUROBJECT, T.OP_SETCUROBJECT);
    add(this.OP_SETCUROBJECT_NEW, T.OP_SETCUROBJECT_NEW);
    add(this.OP_SETCURFIELD, T.OP_SETCURFIELD);
    add(this.OP_SETCURFIELD_ARRAY, T.OP_SETCURFIELD_ARRAY);
    add(this.OP_LOADFIELD_UINT, T.OP_LOADFIELD_UINT);
    add(this.OP_LOADFIELD_FLT, T.OP_LOADFIELD_FLT);
    add(this.OP_LOADFIELD_STR, T.OP_LOADFIELD_STR);
    add(this.OP_SAVEFIELD_UINT, T.OP_SAVEFIELD_UINT);
    add(this.OP_SAVEFIELD_FLT, T.OP_SAVEFIELD_FLT);
    add(this.OP_SAVEFIELD_STR, T.OP_SAVEFIELD_STR);
    add(this.OP_STR_TO_UINT, T.OP_STR_TO_UINT);
    add(this.OP_STR_TO_FLT, T.OP_STR_TO_FLT);
    add(this.OP_STR_TO_NONE, T.OP_STR_TO_NONE);
    add(this.OP_FLT_TO_UINT, T.OP_FLT_TO_UINT);
    add(this.OP_FLT_TO_STR, T.OP_FLT_TO_STR);
    add(this.OP_FLT_TO_NONE, T.OP_FLT_TO_NONE);
    add(this.OP_UINT_TO_FLT, T.OP_UINT_TO_FLT);
    add(this.OP_UINT_TO_STR, T.OP_UINT_TO_STR);
    add(this.OP_UINT_TO_NONE, T.OP_UINT_TO_NONE);
    add(this.OP_LOADIMMED_UINT, T.OP_LOADIMMED_UINT);
    add(this.OP_LOADIMMED_FLT, T.OP_LOADIMMED_FLT);
    add(this.OP_TAG_TO_STR, T.OP_TAG_TO_STR);
    add(this.OP_LOADIMMED_STR, T.OP_LOADIMMED_STR);
    add(this.OP_LOADIMMED_IDENT, T.OP_LOADIMMED_IDENT);
    add(this.OP_CALLFUNC_RESOLVE, T.OP_CALLFUNC_RESOLVE);
    add(this.OP_CALLFUNC, T.OP_CALLFUNC);
    add(this.OP_ADVANCE_STR, T.OP_ADVANCE_STR);
    add(this.OP_ADVANCE_STR_APPENDCHAR, T.OP_ADVANCE_STR_APPENDCHAR);
    add(this.OP_ADVANCE_STR_COMMA, T.OP_ADVANCE_STR_COMMA);
    add(this.OP_ADVANCE_STR_NUL, T.OP_ADVANCE_STR_NUL);
    add(this.OP_REWIND_STR, T.OP_REWIND_STR);
    add(this.OP_TERMINATE_REWIND_STR, T.OP_TERMINATE_REWIND_STR);
    add(this.OP_COMPARE_STR, T.OP_COMPARE_STR);
    add(this.OP_PUSH, T.OP_PUSH);
    add(this.OP_PUSH_FRAME, T.OP_PUSH_FRAME);
    add(this.OP_BREAK, T.OP_BREAK);
    add(this.OP_INVALID, T.OP_INVALID);
    add(this.OP_SETCUROBJECT_INTERNAL, T.OP_SETCUROBJECT_INTERNAL);
    add(this.OP_UNIT_CONVERSION, T.OP_UNIT_CONVERSION);
    add(this.OP_UNUSED1, T.OP_UNUSED1);
    add(this.OP_UNUSED2, T.OP_UNUSED2);
    add(this.OP_UNUSED3, T.OP_UNUSED3);
  }

  isValid(value: number): boolean {
    return this._tags.has(value) && value !== this.OP_INVALID;
  }
  getTag(op: number): OpcodeTag {
    return this._tags.get(op) ?? OpcodeTag.OP_INVALID;
  }
  getReturnValue(op: number): ReturnValueKind {
    switch (this.getTag(op)) {
      case OpcodeTag.OP_STR_TO_NONE:
      case OpcodeTag.OP_FLT_TO_NONE:
      case OpcodeTag.OP_UINT_TO_NONE:
      case OpcodeTag.OP_JMPIF:
      case OpcodeTag.OP_JMPIFF:
      case OpcodeTag.OP_JMPIFNOT:
      case OpcodeTag.OP_JMPIFFNOT:
      case OpcodeTag.OP_RETURN:
        return ReturnValueKind.ToFalse;
      case OpcodeTag.OP_SAVEVAR_UINT:
      case OpcodeTag.OP_SAVEVAR_FLT:
      case OpcodeTag.OP_SAVEVAR_STR:
      case OpcodeTag.OP_SAVEFIELD_UINT:
      case OpcodeTag.OP_SAVEFIELD_FLT:
      case OpcodeTag.OP_SAVEFIELD_STR:
      case OpcodeTag.OP_LOADVAR_STR:
      case OpcodeTag.OP_LOADFIELD_STR:
      case OpcodeTag.OP_FLT_TO_STR:
      case OpcodeTag.OP_UINT_TO_STR:
      case OpcodeTag.OP_LOADIMMED_UINT:
      case OpcodeTag.OP_LOADIMMED_FLT:
      case OpcodeTag.OP_TAG_TO_STR:
      case OpcodeTag.OP_LOADIMMED_STR:
      case OpcodeTag.OP_LOADIMMED_IDENT:
      case OpcodeTag.OP_CALLFUNC:
      case OpcodeTag.OP_CALLFUNC_RESOLVE:
      case OpcodeTag.OP_REWIND_STR:
        return ReturnValueKind.ToTrue;
      default:
        return ReturnValueKind.NoChange;
    }
  }
  getTypeReq(op: number): TypeReq {
    switch (this.getTag(op)) {
      case OpcodeTag.OP_STR_TO_UINT:
      case OpcodeTag.OP_FLT_TO_UINT:
        return TypeReq.UInt;
      case OpcodeTag.OP_STR_TO_FLT:
      case OpcodeTag.OP_UINT_TO_FLT:
        return TypeReq.Float;
      case OpcodeTag.OP_FLT_TO_STR:
      case OpcodeTag.OP_UINT_TO_STR:
        return TypeReq.String;
      case OpcodeTag.OP_STR_TO_NONE:
      case OpcodeTag.OP_FLT_TO_NONE:
      case OpcodeTag.OP_UINT_TO_NONE:
        return TypeReq.None;
      default:
        return TypeReq.Invalid;
    }
  }
}

export class Opcode {
  constructor(
    readonly value: number,
    readonly tag: OpcodeTag,
    readonly returnValue: ReturnValueKind,
    readonly typeReq: TypeReq,
  ) {}
  static create(value: number, ops: Ops): Opcode | null {
    if (!ops.isValid(value)) return null;
    return new Opcode(value, ops.getTag(value), ops.getReturnValue(value), ops.getTypeReq(value));
  }
  equals(o: Opcode): boolean { return o.value === this.value && o.tag === this.tag; }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * File reader (Loader/FileReader.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export class FileReader {
  private dv: DataView;
  private _pos = 0;
  constructor(private bytes: Uint8Array) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get position(): number { return this._pos; }
  get isEOF(): boolean { return this._pos >= this.bytes.length; }
  readByte(): number {
    const b = this.bytes[this._pos];
    this._pos += 1;
    return b;
  }
  readUInt(): number {
    const v = this.dv.getUint32(this._pos, true);
    this._pos += 4;
    return v >>> 0;
  }
  readDouble(): number {
    const v = this.dv.getFloat64(this._pos, true);
    this._pos += 8;
    return v;
  }
  /** Length-prefixed string, with raw byte-to-char mapping (latin-1 style). */
  readString(length?: number): string {
    const n = length ?? this.readUInt();
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.readByte());
    return s;
  }
  /** Reads an opcode byte; if 0xFF, reads the real 32-bit op. */
  readOp(): number {
    const op = this.readByte();
    return op === 0xFF ? this.readUInt() : op;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * StringTable, FloatTable, FileData (Loader/FileData.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export class StringTableEntry {
  constructor(readonly value: string, readonly index: number, readonly global: boolean) {}
  toString(): string { return this.value; }
}

export class StringTable {
  readonly entries = new Map<number, StringTableEntry>();
  constructor(readonly raw: string, readonly global: boolean) {
    let start = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw.charCodeAt(i) === 0) {
        this.entries.set(start, new StringTableEntry(raw.slice(start, i), start, global));
        start = i + 1;
      }
    }
  }
  get(index: number): StringTableEntry | null {
    const hit = this.entries.get(index);
    if (hit) return hit;
    if (index >= this.raw.length) return null;
    const sub = this.raw.slice(index);
    const end = sub.indexOf("\0");
    const v = end < 0 ? sub : sub.slice(0, end);
    return new StringTableEntry(v, index, this.global);
  }
}

export class FloatTable {
  readonly values: number[];
  constructor(size: number, readonly global: boolean) {
    this.values = new Array(size).fill(0);
  }
  get(index: number): number { return this.values[index]; }
  set(index: number, v: number) { this.values[index] = v; }
}

export class FileData {
  globalStringTable = new StringTable("", true);
  functionStringTable = new StringTable("", false);
  globalFloatTable = new FloatTable(0, true);
  functionFloatTable = new FloatTable(0, false);
  readonly identifierTable = new Map<number, number>();
  code: number[] = [];
  constructor(readonly version: number) {}
}

/* ────────────────────────────────────────────────────────────────────────── *
 * File loader (Loader/FileLoader.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export class FileLoader {
  protected reader!: FileReader;
  load(bytes: Uint8Array): FileData {
    this.reader = new FileReader(bytes);
    const data = this.readHeader();
    this.readTables(data);
    const { size, lineBreaks } = this.readCode(data);
    this.readLineBreaks(size, lineBreaks);
    this.readIdentifierTable(data);
    return data;
  }
  protected readHeader(): FileData { return new FileData(this.reader.readUInt()); }
  protected readTables(data: FileData) {
    this.readStringTable(data, true);
    this.readFloatTable(data, true);
    this.readStringTable(data, false);
    this.readFloatTable(data, false);
  }
  protected readStringTable(data: FileData, global: boolean) {
    const raw = this.reader.readString();
    const table = new StringTable(raw, global);
    if (global) data.globalStringTable = table; else data.functionStringTable = table;
  }
  protected readFloatTable(data: FileData, global: boolean) {
    const size = this.reader.readUInt();
    const table = new FloatTable(size, global);
    for (let i = 0; i < size; i++) table.set(i, this.reader.readDouble());
    if (global) data.globalFloatTable = table; else data.functionFloatTable = table;
  }
  protected readCode(data: FileData): { size: number; lineBreaks: number } {
    const size = this.reader.readUInt();
    const lineBreaks = this.reader.readUInt();
    data.code = new Array(size);
    for (let i = 0; i < size; i++) data.code[i] = this.reader.readOp();
    return { size, lineBreaks };
  }
  protected readLineBreaks(codeSize: number, lineBreaks: number) {
    const total = codeSize + lineBreaks * 2;
    for (let i = codeSize; i < total; i++) this.reader.readUInt();
  }
  protected readIdentifierTable(data: FileData) {
    let identifiers = this.reader.readUInt();
    while (identifiers-- > 0) {
      const index = this.reader.readUInt();
      let count = this.reader.readUInt();
      while (count-- > 0) {
        const ip = this.reader.readUInt();
        data.code[ip] = index;
        data.identifierTable.set(ip, index);
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Instructions (Disassembler/Instruction.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export abstract class Instruction {
  prev: Instruction | null = null;
  next: Instruction | null = null;
  constructor(public opcode: Opcode, public address: number) {}
}

export class FunctionInstruction extends Instruction {
  name: string | null;
  namespace: string | null;
  package: string | null;
  hasBody: boolean;
  endAddress: number;
  arguments: (string | null)[] = [];
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.name = readIdent(reader);
    this.namespace = readIdent(reader);
    this.package = readIdent(reader);
    this.hasBody = reader.readBool();
    this.endAddress = reader.readUInt();
    const argc = reader.readUInt();
    for (let i = 0; i < argc; i++) this.arguments.push(readIdent(reader));
    reader.function = this;
  }
}

export class CreateObjectInstruction extends Instruction {
  parent: string | null;
  isDataBlock: boolean;
  isInternal: boolean | null = null;
  failJumpAddress: number;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.parent = readIdent(reader);
    this.isDataBlock = reader.readBool();
    this.failJumpAddress = reader.readUInt();
  }
}
export class AddObjectInstruction extends Instruction {
  placeAtRoot: boolean;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.placeAtRoot = reader.readBool();
  }
}
export class EndObjectInstruction extends Instruction {
  value: boolean;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.value = reader.readBool();
  }
}
export class BranchInstruction extends Instruction {
  targetAddress: number;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.targetAddress = reader.readUInt();
  }
  get isLoopEnd(): boolean { return this.targetAddress < this.address; }
  get isUnconditional(): boolean { return this.opcode.tag === OpcodeTag.OP_JMP; }
  get isConditional(): boolean { return !this.isUnconditional; }
  get isLogicalOperator(): boolean {
    return this.opcode.tag === OpcodeTag.OP_JMPIF_NP || this.opcode.tag === OpcodeTag.OP_JMPIFNOT_NP;
  }
}
export class ReturnInstruction extends Instruction {
  returnsValue: boolean;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.returnsValue = reader.returnableValue;
  }
}
export class BinaryInstruction extends Instruction {}
export class BinaryStringInstruction extends Instruction {}
export class UnaryInstruction extends Instruction {
  get isNot(): boolean {
    return this.opcode.tag === OpcodeTag.OP_NOT || this.opcode.tag === OpcodeTag.OP_NOTF;
  }
}
export class VariableInstruction extends Instruction {
  name: string | null;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.name = readIdent(reader);
  }
}
export class VariableArrayInstruction extends Instruction {}
export class LoadVariableInstruction extends Instruction {}
export class SaveVariableInstruction extends Instruction {}
export class ObjectInstruction extends Instruction {}
export class ObjectNewInstruction extends Instruction {}
export class ObjectInternalInstruction extends Instruction {}
export class FieldInstruction extends Instruction {
  name: string | null;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.name = readIdent(reader);
  }
}
export class FieldArrayInstruction extends Instruction {}
export class LoadFieldInstruction extends Instruction {}
export class SaveFieldInstruction extends Instruction {}
export class ConvertToTypeInstruction extends Instruction {
  get type(): TypeReq { return this.opcode.typeReq; }
}
export abstract class ImmediateInstruction<T> extends Instruction {
  value!: T;
}
export class ImmediateStringInstruction extends ImmediateInstruction<string> {
  isTaggedString: boolean;
  isIdentifier: boolean;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.isTaggedString = opcode.tag === OpcodeTag.OP_TAG_TO_STR;
    this.isIdentifier = opcode.tag === OpcodeTag.OP_LOADIMMED_IDENT;
    if (this.isIdentifier) this.value = readIdent(reader) ?? "";
    else this.value = reader.readStringEntry()?.value ?? "";
  }
}
export class ImmediateUIntInstruction extends ImmediateInstruction<number> {
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.value = reader.readUInt();
  }
}
export class ImmediateDoubleInstruction extends ImmediateInstruction<number> {
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.value = reader.readDouble();
  }
}
export class CallInstruction extends Instruction {
  name: string | null;
  namespace: string | null;
  callType: number;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.name = readIdent(reader);
    this.namespace = readIdent(reader);
    this.callType = reader.readUInt();
  }
}
export class AdvanceStringInstruction extends Instruction {}
export class AdvanceAppendInstruction extends Instruction {
  char: string;
  constructor(opcode: Opcode, address: number, reader: BytecodeReader) {
    super(opcode, address);
    this.char = String.fromCharCode(reader.readUInt());
  }
}
export class AdvanceCommaInstruction extends Instruction {}
export class AdvanceNullInstruction extends Instruction {}
export class RewindStringInstruction extends Instruction {}
export class TerminateRewindInstruction extends Instruction {}
export class PushInstruction extends Instruction {}
export class PushFrameInstruction extends Instruction {}
export class DebugBreakInstruction extends Instruction {}
export class UnitConversionInstruction extends Instruction {}
export class UnusedInstruction extends Instruction {}

function readIdent(r: BytecodeReader): string | null {
  return r.readIdentifier();
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Bytecode reader (Disassembler/BytecodeReader.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export class BytecodeReader {
  private idx = 0;
  returnableValue = false;
  function: FunctionInstruction | null = null;
  constructor(private data: FileData, private ops: Ops) {}
  get index(): number { return this.idx; }
  get codeSize(): number { return this.data.code.length; }
  get isAtEnd(): boolean { return this.idx >= this.data.code.length; }
  get inFunction(): boolean { return this.function !== null; }

  readUInt(): number { return this.data.code[this.idx++] >>> 0; }
  readBool(): boolean { return this.readUInt() !== 0; }

  /** Returns the underlying StringTable string for a non-identifier read. */
  readStringEntry(): StringTableEntry | null {
    const idx = this.readUInt();
    return (this.inFunction ? this.data.functionStringTable : this.data.globalStringTable).get(idx);
  }
  readDouble(): number {
    const idx = this.readUInt();
    return (this.inFunction ? this.data.functionFloatTable : this.data.globalFloatTable).get(idx);
  }
  /** Identifier: only valid if this code slot was patched by the identifier table. */
  readIdentifier(): string | null {
    const ip = this.idx;
    const strIndex = this.readUInt();
    if (!this.data.identifierTable.has(ip)) return null;
    return this.data.globalStringTable.get(strIndex)?.value ?? null;
  }

  readInstruction(): Instruction {
    const addr = this.idx;
    const op = Opcode.create(this.readUInt(), this.ops);
    if (!op) throw new Error(`Invalid opcode at ${addr}`);
    // Maintain returnableValue tracking
    const built = this.buildInstruction(op, addr);
    if (op.returnValue !== ReturnValueKind.NoChange) {
      this.returnableValue = op.returnValue === ReturnValueKind.ToTrue;
    }
    if (this.inFunction && addr >= (this.function?.endAddress ?? Infinity)) {
      this.function = null;
    }
    return built;
  }

  private buildInstruction(op: Opcode, addr: number): Instruction {
    const tag = op.tag;
    const T = OpcodeTag;
    switch (tag) {
      case T.OP_FUNC_DECL: return new FunctionInstruction(op, addr, this);
      case T.OP_CREATE_OBJECT: return new CreateObjectInstruction(op, addr, this);
      case T.OP_ADD_OBJECT: return new AddObjectInstruction(op, addr, this);
      case T.OP_END_OBJECT: return new EndObjectInstruction(op, addr, this);
      case T.OP_JMP:
      case T.OP_JMPIF_NP:
      case T.OP_JMPIFNOT_NP:
      case T.OP_JMPIF:
      case T.OP_JMPIFF:
      case T.OP_JMPIFNOT:
      case T.OP_JMPIFFNOT:
        return new BranchInstruction(op, addr, this);
      case T.OP_RETURN: return new ReturnInstruction(op, addr, this);
      case T.OP_CMPEQ: case T.OP_CMPNE:
      case T.OP_CMPGR: case T.OP_CMPGE: case T.OP_CMPLT: case T.OP_CMPLE:
      case T.OP_XOR: case T.OP_BITAND: case T.OP_BITOR: case T.OP_SHR: case T.OP_SHL:
      case T.OP_AND: case T.OP_OR:
      case T.OP_ADD: case T.OP_SUB: case T.OP_MUL: case T.OP_DIV: case T.OP_MOD:
        return new BinaryInstruction(op, addr);
      case T.OP_COMPARE_STR: return new BinaryStringInstruction(op, addr);
      case T.OP_NOT: case T.OP_NOTF: case T.OP_ONESCOMPLEMENT: case T.OP_NEG:
        return new UnaryInstruction(op, addr);
      case T.OP_SETCURVAR: case T.OP_SETCURVAR_CREATE:
        return new VariableInstruction(op, addr, this);
      case T.OP_SETCURVAR_ARRAY: case T.OP_SETCURVAR_ARRAY_CREATE:
        return new VariableArrayInstruction(op, addr);
      case T.OP_LOADVAR_UINT: case T.OP_LOADVAR_FLT: case T.OP_LOADVAR_STR:
        return new LoadVariableInstruction(op, addr);
      case T.OP_SAVEVAR_UINT: case T.OP_SAVEVAR_FLT: case T.OP_SAVEVAR_STR:
        return new SaveVariableInstruction(op, addr);
      case T.OP_SETCUROBJECT: return new ObjectInstruction(op, addr);
      case T.OP_SETCUROBJECT_NEW: return new ObjectNewInstruction(op, addr);
      case T.OP_SETCUROBJECT_INTERNAL: return new ObjectInternalInstruction(op, addr);
      case T.OP_SETCURFIELD: return new FieldInstruction(op, addr, this);
      case T.OP_SETCURFIELD_ARRAY: return new FieldArrayInstruction(op, addr);
      case T.OP_LOADFIELD_UINT: case T.OP_LOADFIELD_FLT: case T.OP_LOADFIELD_STR:
        return new LoadFieldInstruction(op, addr);
      case T.OP_SAVEFIELD_UINT: case T.OP_SAVEFIELD_FLT: case T.OP_SAVEFIELD_STR:
        return new SaveFieldInstruction(op, addr);
      case T.OP_STR_TO_UINT: case T.OP_STR_TO_FLT: case T.OP_STR_TO_NONE:
      case T.OP_FLT_TO_UINT: case T.OP_FLT_TO_STR: case T.OP_FLT_TO_NONE:
      case T.OP_UINT_TO_FLT: case T.OP_UINT_TO_STR: case T.OP_UINT_TO_NONE:
        return new ConvertToTypeInstruction(op, addr);
      case T.OP_LOADIMMED_UINT: return new ImmediateUIntInstruction(op, addr, this);
      case T.OP_LOADIMMED_FLT: return new ImmediateDoubleInstruction(op, addr, this);
      case T.OP_TAG_TO_STR: case T.OP_LOADIMMED_STR: case T.OP_LOADIMMED_IDENT:
        return new ImmediateStringInstruction(op, addr, this);
      case T.OP_CALLFUNC: case T.OP_CALLFUNC_RESOLVE:
        return new CallInstruction(op, addr, this);
      case T.OP_ADVANCE_STR: return new AdvanceStringInstruction(op, addr);
      case T.OP_ADVANCE_STR_APPENDCHAR: return new AdvanceAppendInstruction(op, addr, this);
      case T.OP_ADVANCE_STR_COMMA: return new AdvanceCommaInstruction(op, addr);
      case T.OP_ADVANCE_STR_NUL: return new AdvanceNullInstruction(op, addr);
      case T.OP_REWIND_STR: return new RewindStringInstruction(op, addr);
      case T.OP_TERMINATE_REWIND_STR: return new TerminateRewindInstruction(op, addr);
      case T.OP_PUSH: return new PushInstruction(op, addr);
      case T.OP_PUSH_FRAME: return new PushFrameInstruction(op, addr);
      case T.OP_BREAK: return new DebugBreakInstruction(op, addr);
      case T.OP_UNIT_CONVERSION: return new UnitConversionInstruction(op, addr);
      case T.OP_UNUSED1: case T.OP_UNUSED2: case T.OP_UNUSED3:
        return new UnusedInstruction(op, addr);
      default: throw new Error(`Invalid opcode at ${addr}`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Disassembly (Disassembler/Disassembly.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export class Disassembly {
  readonly list: Instruction[] = [];
  readonly map = new Map<number, Instruction>();
  readonly branches: BranchInstruction[] = [];
  get first(): Instruction | null { return this.list[0] ?? null; }
  get last(): Instruction | null { return this.list[this.list.length - 1] ?? null; }
  add(inst: Instruction) {
    const last = this.last;
    if (last) { last.next = inst; inst.prev = last; }
    if (inst instanceof BranchInstruction) this.branches.push(inst);
    this.list.push(inst);
    this.map.set(inst.address, inst);
  }
  get(address: number): Instruction | null { return this.map.get(address) ?? null; }
}

export function disassemble(reader: BytecodeReader): Disassembly {
  const d = new Disassembly();
  while (!reader.isAtEnd) {
    const inst = reader.readInstruction();
    validate(inst, reader);
    d.add(inst);
  }
  return d;
}
function validate(inst: Instruction, reader: BytecodeReader) {
  if (inst instanceof FunctionInstruction) {
    if (inst.hasBody && inst.endAddress >= reader.codeSize) {
      throw new Error(`Function at ${inst.address} has invalid end address ${inst.endAddress}`);
    }
  } else if (inst instanceof BranchInstruction) {
    if (reader.inFunction) {
      const fn = reader.function!;
      if (inst.targetAddress <= fn.address || inst.targetAddress >= fn.endAddress) {
        throw new Error(`Branch at ${inst.address} jumps out of function to ${inst.targetAddress}`);
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Control flow analyzer (ControlFlow/*.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export enum CFBlockType { Root, Conditional, Loop }
export enum CFBranchType { Else, Continue, Break }
export class CFBranch {
  type: CFBranchType = CFBranchType.Else;
  constructor(readonly startAddress: number, readonly targetAddress: number) {}
}
export class CFBlock {
  readonly children: CFBlock[] = [];
  readonly branches = new Map<number, CFBranch>();
  continuePoint: number | null = null;
  parent: CFBlock | null = null;
  constructor(readonly type: CFBlockType, readonly start: Instruction, readonly end: Instruction) {}
  addBranch(b: BranchInstruction) { this.branches.set(b.address, new CFBranch(b.address, b.targetAddress)); }
  addChild(c: CFBlock) { c.parent = this; this.children.push(c); }
  findOuterLoop(): CFBlock | null {
    if (!this.parent) return null;
    if (this.parent.type === CFBlockType.Loop) return this.parent;
    return this.parent.findOuterLoop();
  }
}
export class CFData {
  readonly blocks = new Map<number, CFBlock[]>();
  readonly branches = new Map<number, CFBranch>();
  addBlock(b: CFBlock) {
    if (b.type === CFBlockType.Root) return;
    let q = this.blocks.get(b.start.address);
    if (!q) { q = []; this.blocks.set(b.start.address, q); }
    q.push(b);
  }
  addBranch(b: CFBranch) { this.branches.set(b.startAddress, b); }
}

export function analyzeControlFlow(d: Disassembly): CFData {
  const root = buildBlocks(d);
  analyzeBranches(root);
  const data = new CFData();
  flatten(root, data);
  return data;
}
function buildBlocks(d: Disassembly): CFBlock {
  const blocks: CFBlock[] = [];
  if (!d.first || !d.last) throw new Error("Empty disassembly");
  blocks.push(new CFBlock(CFBlockType.Root, d.first, d.last));
  for (const br of d.branches) {
    if (br.isConditional && !br.isLogicalOperator) {
      const isLoop = br.isLoopEnd;
      const type = isLoop ? CFBlockType.Loop : CFBlockType.Conditional;
      const start = isLoop ? d.get(br.targetAddress) : br;
      const end = isLoop ? br : d.get(br.targetAddress)!.prev;
      if (!start || !end) throw new Error(`Bad branch at ${br.address}`);
      blocks.push(new CFBlock(type, start, end));
    }
  }
  blocks.sort((a, b) => {
    if (a.start.address === b.start.address) {
      if (a.end.address < b.end.address) return 1;
      if (a.end.address > b.end.address) return -1;
      return 0;
    }
    return a.start.address < b.start.address ? -1 : 1;
  });
  const stack: CFBlock[] = [];
  let bi = 0;
  for (let inst: Instruction | null = d.first; inst; inst = inst.next) {
    while (stack.length > 0 && stack[stack.length - 1].end.address < inst.address) {
      const popped = stack.pop()!;
      stack[stack.length - 1].addChild(popped);
    }
    while (bi < blocks.length && blocks[bi].start.address === inst.address) {
      stack.push(blocks[bi++]);
    }
    if (inst instanceof BranchInstruction && inst.isUnconditional) {
      stack[stack.length - 1].addBranch(inst);
    }
  }
  if (stack.length !== 1) throw new Error(`Block stack count != 1 (got ${stack.length})`);
  return stack.pop()!;
}
function analyzeBranches(block: CFBlock) {
  const outerLoop = block.findOuterLoop();
  const parent = block.parent;
  for (const br of block.branches.values()) {
    if (block.type === CFBlockType.Loop) {
      br.type = br.targetAddress <= block.end.address ? CFBranchType.Continue : CFBranchType.Break;
    } else if (block.type === CFBlockType.Conditional && outerLoop) {
      const afterLoop = outerLoop.end.next?.address;
      if (afterLoop !== undefined && br.targetAddress === afterLoop) {
        br.type = CFBranchType.Break;
      } else if (br.startAddress < block.end.address) {
        br.type = CFBranchType.Continue;
      } else if (parent && parent.type === CFBlockType.Conditional && parent.end.next && br.targetAddress > parent.end.next.address) {
        br.type = CFBranchType.Continue;
      }
    }
    if (br.type === CFBranchType.Continue) block.continuePoint = br.targetAddress;
  }
  for (const br of block.branches.values()) {
    if (outerLoop && outerLoop.continuePoint !== null && br.targetAddress === outerLoop.continuePoint) {
      br.type = CFBranchType.Continue;
    }
  }
  block.children.forEach(analyzeBranches);
}
function flatten(b: CFBlock, d: CFData) {
  d.addBlock(b);
  for (const br of b.branches.values()) d.addBranch(br);
  b.children.forEach(c => flatten(c, d));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * AST + code writer (AST/Nodes/*.cs + CodeGenerator/*.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export enum NodeType { Statement, Expression, ExpressionStatement, CommaConcat }

export class CodeWriter {
  private prev = "";
  indent = 0;
  readonly stream: string[] = [];
  write(...tokens: string[]) {
    for (const tok of tokens) {
      if (tok === "}") this.indent--;
      if (this.prev === "\n" && tok !== "\n") {
        for (let i = 0; i < this.indent; i++) this.stream.push("\t");
      }
      if (tok === "{") this.indent++;
      this.prev = tok;
      this.stream.push(tok);
    }
  }
  writeNode(node: Node, isExpression: boolean) { node.visit(this, isExpression); }
  writeWithParens(node: Node, test: (n: Node) => boolean) {
    const add = test(node);
    if (add) this.write("(");
    node.visit(this, true);
    if (add) this.write(")");
  }
}

export abstract class Node {
  type: NodeType;
  constructor(type: NodeType) { this.type = type; }
  get precedence(): number { return 0; }
  get isExpression(): boolean { return this.type === NodeType.Expression || this.type === NodeType.ExpressionStatement; }
  get isStatement(): boolean { return this.type === NodeType.Statement || this.type === NodeType.ExpressionStatement; }
  checkPrecedenceAndAssociativity(node: Node): boolean {
    return !this.isAssociativeWith(node)
      && (node.precedence >= this.precedence || (node instanceof AssignmentNode && !node.isIncrementDecrement));
  }
  isAssociativeWith(_compare: Node): boolean { return false; }
  abstract visit(writer: CodeWriter, isExpression: boolean): void;
}

export enum StringNodeType { Identifier, String, Tagged }

export class ConstantUIntNode extends Node {
  constructor(public readonly value: number) { super(NodeType.Expression); }
  visit(w: CodeWriter) { w.write(String(this.value >>> 0)); }
}
export class ConstantDoubleNode extends Node {
  constructor(public readonly value: number) { super(NodeType.Expression); }
  visit(w: CodeWriter) {
    // Match Torque source formatting: integer doubles like 1, fractions kept
    const s = Number.isInteger(this.value) ? this.value.toFixed(0) : String(this.value);
    w.write(s);
  }
}
export class ConstantStringNode extends Node {
  readonly stringType: StringNodeType;
  constructor(public readonly value: string, stringType: StringNodeType) {
    super(NodeType.Expression);
    this.stringType = stringType;
  }
  static fromInstruction(i: ImmediateStringInstruction): ConstantStringNode {
    const t = i.isIdentifier ? StringNodeType.Identifier
      : i.isTaggedString ? StringNodeType.Tagged : StringNodeType.String;
    return new ConstantStringNode(i.value, t);
  }
  visit(w: CodeWriter) {
    let s = escapeString(this.value);
    if (this.stringType === StringNodeType.String) s = `"${s.replace(/"/g, '\\"')}"`;
    else if (this.stringType === StringNodeType.Tagged) s = `'${s.replace(/'/g, "\\'")}'`;
    w.write(s);
  }
  tryToUInt(): ConstantUIntNode | null {
    if (/^\d+$/.test(this.value)) {
      const n = Number(this.value);
      if (Number.isFinite(n) && n >= 0 && n <= 0xFFFFFFFF) return new ConstantUIntNode(n);
    }
    return null;
  }
  tryToDouble(): ConstantDoubleNode | null {
    if (this.value.length === 0) return null;
    // Accept canonical decimal numbers
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(this.value)) return null;
    const n = Number(this.value);
    return Number.isFinite(n) ? new ConstantDoubleNode(n) : null;
  }
}

function coerceString(n: Node | null): Node | null {
  if (!n) return n;
  if (n instanceof ConstantStringNode) return n.tryToUInt() ?? n.tryToDouble() ?? n;
  return n;
}

export class VariableNode extends Node {
  index: Node | null;
  constructor(public readonly name: string, index: Node | null = null) {
    super(NodeType.Expression);
    this.index = coerceString(index);
  }
  visit(w: CodeWriter) {
    w.write(this.name);
    if (this.index) {
      w.write("[");
      w.writeNode(this.index, true);
      w.write("]");
    }
  }
}

export class FieldNode extends Node {
  internal = false;
  private _object: Node | null = null;
  private _index: Node | null = null;
  constructor(public readonly name: string) { super(NodeType.Expression); }
  get object(): Node | null { return this._object; }
  set object(v: Node | null) { this._object = coerceString(v); }
  get index(): Node | null { return this._index; }
  set index(v: Node | null) { this._index = coerceString(v); }
  isAssociativeWith(c: Node): boolean { return c instanceof FieldNode; }
  visit(w: CodeWriter) {
    if (this._object) {
      w.writeWithParens(this._object, n => n.precedence > this.precedence);
      w.write(this.internal ? "->" : ".");
    }
    w.write(this.name);
    if (this._index) {
      w.write("[");
      w.writeNode(this._index, true);
      w.write("]");
    }
  }
}

export class AssignmentNode extends Node {
  readonly left: Node;
  readonly right: Node;
  readonly op: Opcode | null;
  constructor(left: Node, right: Node, op: Opcode | null = null) {
    super(NodeType.ExpressionStatement);
    this.left = left;
    this.right = right instanceof ConstantStringNode ? (right.tryToUInt() ?? right.tryToDouble() ?? right) : right;
    this.op = op;
  }
  get precedence(): number { return this.isIncrementDecrement ? 1 : 14; }
  get isIncrementDecrement(): boolean {
    return this.right instanceof ConstantDoubleNode && this.right.value === 1
      && (this.op?.tag === OpcodeTag.OP_ADD || this.op?.tag === OpcodeTag.OP_SUB);
  }
  visit(w: CodeWriter, isExpression: boolean) {
    w.writeNode(this.left, true);
    if (!this.op) {
      w.write(" ", "=", " ");
      w.writeNode(this.right, true);
    } else {
      const tag = this.op.tag;
      if (this.isIncrementDecrement) {
        w.write(tag === OpcodeTag.OP_ADD ? "++" : "--");
      } else {
        const sym = binaryOpSymbol(tag);
        w.write(" ", `${sym}=`, " ");
        w.writeNode(this.right, true);
      }
    }
    if (!isExpression) w.write(";", "\n");
  }
}

function binaryOpSymbol(t: OpcodeTag): string {
  switch (t) {
    case OpcodeTag.OP_ADD: return "+";
    case OpcodeTag.OP_SUB: return "-";
    case OpcodeTag.OP_MUL: return "*";
    case OpcodeTag.OP_DIV: return "/";
    case OpcodeTag.OP_CMPLT: return "<";
    case OpcodeTag.OP_CMPGR: return ">";
    case OpcodeTag.OP_MOD: return "%";
    case OpcodeTag.OP_BITOR: return "|";
    case OpcodeTag.OP_BITAND: return "&";
    case OpcodeTag.OP_XOR: return "^";
    case OpcodeTag.OP_CMPEQ: return "==";
    case OpcodeTag.OP_CMPNE: return "!=";
    case OpcodeTag.OP_CMPLE: return "<=";
    case OpcodeTag.OP_CMPGE: return ">=";
    case OpcodeTag.OP_SHL: return "<<";
    case OpcodeTag.OP_SHR: return ">>";
    case OpcodeTag.OP_JMPIF_NP: return "||";
    case OpcodeTag.OP_JMPIFNOT_NP: return "&&";
    case OpcodeTag.OP_AND: return "&&";
    case OpcodeTag.OP_OR: return "||";
    default: return "?";
  }
}

export class BinaryNode extends Node {
  constructor(readonly left: Node, readonly right: Node, readonly op: Opcode) { super(NodeType.Expression); }
  get isOpAssociative(): boolean {
    const t = this.op.tag;
    return t === OpcodeTag.OP_ADD || t === OpcodeTag.OP_MUL
      || t === OpcodeTag.OP_BITAND || t === OpcodeTag.OP_BITOR || t === OpcodeTag.OP_XOR
      || t === OpcodeTag.OP_JMPIFNOT_NP || t === OpcodeTag.OP_JMPIF_NP;
  }
  get precedence(): number {
    switch (this.op.tag) {
      case OpcodeTag.OP_MUL: case OpcodeTag.OP_DIV: case OpcodeTag.OP_MOD: return 2;
      case OpcodeTag.OP_ADD: case OpcodeTag.OP_SUB: return 3;
      case OpcodeTag.OP_SHL: case OpcodeTag.OP_SHR: return 4;
      case OpcodeTag.OP_CMPLT: case OpcodeTag.OP_CMPGR: case OpcodeTag.OP_CMPLE: case OpcodeTag.OP_CMPGE: return 6;
      case OpcodeTag.OP_CMPEQ: case OpcodeTag.OP_CMPNE: return 7;
      case OpcodeTag.OP_BITAND: return 8;
      case OpcodeTag.OP_XOR: return 9;
      case OpcodeTag.OP_BITOR: return 10;
      case OpcodeTag.OP_JMPIFNOT_NP: return 11;
      case OpcodeTag.OP_JMPIF_NP: return 12;
      default: return 0;
    }
  }
  isAssociativeWith(c: Node): boolean {
    return c instanceof BinaryNode && c.op.tag === this.op.tag && this.isOpAssociative;
  }
  visit(w: CodeWriter) {
    w.writeWithParens(this.left, n => this.checkPrecedenceAndAssociativity(n));
    w.write(" ", binaryOpSymbol(this.op.tag), " ");
    w.writeWithParens(this.right, n => this.checkPrecedenceAndAssociativity(n));
  }
}

export class BinaryStringNode extends BinaryNode {
  constructor(left: Node, right: Node, op: Opcode, readonly not = false) { super(left, right, op); }
  get precedence(): number { return 5; }
  visit(w: CodeWriter) {
    w.writeWithParens(this.left, n => this.checkPrecedenceAndAssociativity(n));
    w.write(" ", this.not ? "!$=" : "$=", " ");
    w.writeWithParens(this.right, n => this.checkPrecedenceAndAssociativity(n));
  }
}

export class UnaryNode extends Node {
  constructor(readonly node: Node, readonly op: Opcode) { super(NodeType.Expression); }
  get precedence(): number { return 1; }
  visit(w: CodeWriter) {
    const sym = this.op.tag === OpcodeTag.OP_NEG ? "-"
      : this.op.tag === OpcodeTag.OP_ONESCOMPLEMENT ? "~" : "!";
    w.write(sym);
    w.writeWithParens(this.node, n => n.precedence > this.precedence);
  }
}

export class ConcatNode extends Node {
  private _right: Node | null = null;
  constructor(readonly left: Node, readonly char: string | null = null) { super(NodeType.Expression); }
  get right(): Node { return this._right!; }
  set right(v: Node) { if (this._right === null) this._right = v; }
  get precedence(): number { return this instanceof CommaConcatNode ? 0 : 5; }
  isAssociativeWith(c: Node): boolean { return c instanceof ConcatNode; }
  visit(w: CodeWriter) {
    w.writeWithParens(this.left, n => this.checkPrecedenceAndAssociativity(n));
    const sep = this.char === " " ? "SPC" : this.char === "\t" ? "TAB" : this.char === "\n" ? "NL" : "@";
    w.write(" ", sep, " ");
    w.writeWithParens(this.right, n => this.checkPrecedenceAndAssociativity(n));
  }
}
export class CommaConcatNode extends ConcatNode {
  constructor(left: Node) { super(left); this.type = NodeType.CommaConcat; }
  visit(w: CodeWriter) {
    w.writeNode(this.left, true);
    w.write(",", " ");
    w.writeNode(this.right, true);
  }
}

export class UnitConversionNode extends Node {
  constructor(readonly unit: Node, readonly value: Node) { super(NodeType.Expression); }
  visit(w: CodeWriter) {
    w.writeNode(this.value, true);
    w.writeNode(this.unit, true);
  }
}

export class BreakNode extends Node {
  constructor() { super(NodeType.Statement); }
  visit(w: CodeWriter) { w.write("break", ";", "\n"); }
}
export class ContinueNode extends Node {
  constructor() { super(NodeType.Statement); }
  visit(w: CodeWriter) { w.write("continue", ";", "\n"); }
}

export class ReturnNode extends Node {
  readonly value: Node | null;
  constructor(value: Node | null) {
    super(NodeType.Statement);
    this.value = value instanceof ConstantStringNode ? (value.tryToUInt() ?? value.tryToDouble() ?? value) : value;
  }
  visit(w: CodeWriter) {
    w.write("return");
    if (this.value) { w.write(" "); w.writeNode(this.value, true); }
    w.write(";", "\n");
  }
}

export class IfNode extends Node {
  test: Node | null;
  true: Node[] = [];
  false: Node[] = [];
  constructor(test: Node | null) { super(NodeType.Statement); this.test = test; }
  canConvertToTernary(): boolean {
    if (!this.test || this.true.length !== 1 || this.false.length !== 1) return false;
    const okBranch = (n: Node) => n instanceof IfNode ? n.canConvertToTernary() : n.isExpression;
    return okBranch(this.true[0]) && okBranch(this.false[0]);
  }
  convertToTernary(): TernaryIfNode {
    if (!this.canConvertToTernary()) throw new Error("Cannot convert if to ternary");
    const t = this.true[0] instanceof IfNode ? (this.true[0] as IfNode).convertToTernary() : this.true[0];
    const f = this.false[0] instanceof IfNode ? (this.false[0] as IfNode).convertToTernary() : this.false[0];
    return new TernaryIfNode(this.test!, t, f);
  }
  visit(w: CodeWriter) {
    w.write("if", " ", "(");
    w.writeNode(this.test!, true);
    w.write(")", "\n", "{", "\n");
    this.true.forEach(n => w.writeNode(n, false));
    w.write("}", "\n");
    if (this.false.length === 0) return;
    w.write("else");
    if (this.false.length === 1 && this.false[0] instanceof IfNode) {
      w.write(" ");
      w.writeNode(this.false[0], false);
    } else {
      w.write("\n", "{", "\n");
      this.false.forEach(n => w.writeNode(n, false));
      w.write("}", "\n");
    }
  }
}
export class TernaryIfNode extends Node {
  constructor(readonly test: Node, readonly trueExpr: Node, readonly falseExpr: Node) { super(NodeType.Expression); }
  get precedence(): number { return 13; }
  visit(w: CodeWriter) {
    const guard = (n: Node) => n instanceof TernaryIfNode || n instanceof AssignmentNode;
    w.writeWithParens(this.test, guard);
    w.write(" ", "?", " ");
    w.writeWithParens(this.trueExpr, guard);
    w.write(" ", ":", " ");
    w.writeWithParens(this.falseExpr, guard);
  }
}

export class LoopNode extends Node {
  body: Node[] = [];
  constructor(readonly test: Node) { super(NodeType.Statement); }
  visit(w: CodeWriter) {
    w.write("do", "\n", "{", "\n");
    this.body.forEach(n => w.writeNode(n, false));
    w.write("}", "\n", "while", " ", "(");
    w.writeNode(this.test, true);
    w.write(")", "\n");
  }
}
export class WhileLoopNode extends LoopNode {
  visit(w: CodeWriter) {
    w.write("while", " ", "(");
    w.writeNode(this.test, true);
    w.write(")", "\n", "{", "\n");
    this.body.forEach(n => w.writeNode(n, false));
    w.write("}", "\n");
  }
}
export class ForLoopNode extends LoopNode {
  constructor(readonly init: Node, test: Node, readonly end: Node) { super(test); }
  visit(w: CodeWriter) {
    w.write("for", " ", "(");
    w.writeNode(this.init, true);
    w.write(";", " ");
    w.writeNode(this.test, true);
    w.write(";", " ");
    w.writeNode(this.end, true);
    w.write(")", "\n", "{", "\n");
    this.body.forEach(n => w.writeNode(n, false));
    w.write("}", "\n");
  }
}

export class FunctionCallNode extends Node {
  readonly name: string;
  readonly namespace: string | null;
  readonly callType: number;
  private readonly args: Node[] = [];
  constructor(inst: CallInstruction) {
    super(NodeType.ExpressionStatement);
    this.name = inst.name ?? "";
    this.namespace = inst.namespace;
    this.callType = inst.callType;
  }
  addArgument(a: Node) {
    this.args.push(a instanceof ConstantStringNode ? (a.tryToUInt() ?? a.tryToDouble() ?? a) : a);
  }
  visit(w: CodeWriter, isExpression: boolean) {
    const isMethod = this.callType === 1;
    if (isMethod && this.args.length > 0) {
      w.writeWithParens(this.args[0], n => n.precedence > this.precedence);
      w.write(".");
    } else if (this.namespace) {
      w.write(this.namespace, "::");
    }
    w.write(this.name, "(");
    for (let i = isMethod ? 1 : 0; i < this.args.length; i++) {
      w.writeNode(this.args[i], true);
      if (i < this.args.length - 1) w.write(",", " ");
    }
    w.write(")");
    if (!isExpression) w.write(";", "\n");
  }
}

export class FunctionDeclarationNode extends Node {
  readonly name: string;
  readonly namespace: string | null;
  readonly arguments: (string | null)[];
  body: Node[] = [];
  constructor(inst: FunctionInstruction) {
    super(NodeType.Statement);
    this.name = inst.name ?? "";
    this.namespace = inst.namespace;
    this.arguments = [...inst.arguments];
  }
  visit(w: CodeWriter) {
    w.write("function", " ");
    if (this.namespace) w.write(this.namespace, "::");
    w.write(this.name, "(");
    for (let i = 0; i < this.arguments.length; i++) {
      const a = this.arguments[i];
      w.write(!a ? "%__unused" : a);
      if (i < this.arguments.length - 1) w.write(",", " ");
    }
    w.write(")", "\n", "{", "\n");
    this.body.forEach(n => w.writeNode(n, false));
    w.write("}", "\n", "\n");
  }
}

export class PackageNode extends Node {
  readonly functions: FunctionDeclarationNode[] = [];
  constructor(readonly name: string) { super(NodeType.Statement); }
  visit(w: CodeWriter) {
    w.write("package", " ", this.name, "\n", "{", "\n");
    this.functions.forEach(f => w.writeNode(f, false));
    w.write("}", ";", "\n");
  }
}

export class ObjectDeclarationNode extends Node {
  readonly isDataBlock: boolean;
  readonly isInternal: boolean;
  readonly className: Node;
  readonly objectName: Node | null;
  readonly parent: string | null;
  readonly depth: number;
  readonly fields: AssignmentNode[] = [];
  readonly children: ObjectDeclarationNode[] = [];
  private readonly args: Node[] = [];
  constructor(inst: CreateObjectInstruction, className: Node, objectName: Node | null, depth: number) {
    super(NodeType.ExpressionStatement);
    this.isDataBlock = inst.isDataBlock;
    this.isInternal = inst.isInternal ?? false;
    this.className = className;
    this.objectName = objectName;
    this.parent = inst.parent;
    this.depth = depth;
  }
  addArgument(a: Node) {
    this.args.push(a instanceof ConstantStringNode ? (a.tryToUInt() ?? a.tryToDouble() ?? a) : a);
  }
  visit(w: CodeWriter, isExpression: boolean) {
    w.write(this.isDataBlock ? "datablock" : "new", " ");
    w.writeWithParens(this.className, n => !(n instanceof ConstantStringNode) || n.stringType !== StringNodeType.Identifier);
    w.write("(");
    if (this.isInternal) w.write("[");
    if (this.objectName && (!(this.objectName instanceof ConstantStringNode) || this.objectName.value !== "")) {
      w.writeNode(this.objectName, true);
    }
    if (this.isInternal) w.write("]");
    if (this.parent && this.parent !== "") {
      if (this.objectName) w.write(" ");
      w.write(":", " ", this.parent);
    }
    if (this.args.length > 0) w.write(",", " ");
    for (let i = 0; i < this.args.length; i++) {
      w.writeNode(this.args[i], true);
      if (i < this.args.length - 1) w.write(",", " ");
    }
    w.write(")");
    if (this.fields.length > 0 || this.children.length > 0) {
      w.write("\n", "{", "\n");
      this.fields.forEach(f => w.writeNode(f, false));
      if (this.fields.length > 0 && this.children.length > 0) w.write("\n");
      this.children.forEach(c => w.writeNode(c, false));
      w.write("}");
    }
    if (!isExpression) w.write(";", "\n");
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * AST Builder (AST/Builder.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export class Builder {
  private disasm!: Disassembly;
  private data!: CFData;
  private current: Instruction | null = null;
  private endAddress = 0;
  private running = false;
  private objectDepth = 0;
  private frameStack: Node[][] = [];
  private nodeStack: Node[] = [];

  get currentAddress(): number { return this.current?.address ?? 0; }
  private get isAtEnd(): boolean {
    return !this.running || !this.current || this.current.address > this.endAddress;
  }

  build(data: CFData, disasm: Disassembly): Node[] {
    const list = this.buildRange(data, disasm, disasm.first!.address, disasm.last!.address);
    // Strip implicit trailing `return;`
    if (list.length > 0) {
      const last = list[list.length - 1];
      if (last instanceof ReturnNode && last.value === null) list.pop();
    }
    return list;
  }

  buildRange(data: CFData, disasm: Disassembly, startAddress: number, endAddress: number): Node[] {
    this.disasm = disasm;
    this.data = data;
    this.current = disasm.get(startAddress);
    this.endAddress = endAddress;
    this.objectDepth = 0;
    this.frameStack = [];
    this.nodeStack = [];
    this.run();
    // JS array used as stack is already in push order (bottom→top).
    // dso-sharp's C# Stack.ToList() pops top→bottom then Reverse()s to
    // bottom→top; we already have that, so no reverse needed.
    return [...this.nodeStack];
  }

  private run() {
    this.running = true;
    while (!this.isAtEnd) {
      const node = this.parse(this.read());
      if (node !== null) this.push(node);
    }
  }

  private parse(instruction: Instruction | null): Node | null {
    if (!instruction) throw new Error("Instruction is null");

    // Control-flow block dispatch
    const queue = this.data.blocks.get(instruction.address);
    if (queue && queue.length > 0) {
      const block = queue.shift()!;
      if (queue.length === 0) this.data.blocks.delete(instruction.address);
      const body = this.parseRange(block.start.address, block.end.address);
      switch (block.type) {
        case CFBlockType.Conditional: {
          const node = new IfNode(this.pop());
          node.true = body;
          if (block.end instanceof BranchInstruction && block.end.isUnconditional
            && this.data.branches.get(block.end.address)?.type === CFBranchType.Else) {
            const branch = block.end;
            const next = branch.next!;
            const target = this.disasm.get(branch.targetAddress)!;
            node.false = this.parseRange(next.address, target.prev!.address);
          }
          return this.collapseIfLoop(node);
        }
        case CFBlockType.Loop: {
          const last = body[body.length - 1];
          const testNode = last instanceof IfNode ? last.convertToTernary() : last;
          const node = new LoopNode(testNode);
          node.body = body;
          body.pop();
          return node;
        }
        default: return null;
      }
    }

    // Instruction dispatch
    if (instruction instanceof ImmediateStringInstruction) return ConstantStringNode.fromInstruction(instruction);
    if (instruction instanceof ImmediateDoubleInstruction) return new ConstantDoubleNode(instruction.value);
    if (instruction instanceof ImmediateUIntInstruction) return new ConstantUIntNode(instruction.value);

    if (instruction instanceof ReturnInstruction) {
      return new ReturnNode(instruction.returnsValue ? this.pop() : null);
    }
    if (instruction instanceof PushInstruction) {
      this.frameStack[this.frameStack.length - 1].push(this.pop());
      return null;
    }
    if (instruction instanceof PushFrameInstruction) {
      this.frameStack.push([]);
      return null;
    }
    if (instruction instanceof AdvanceStringInstruction) return new ConcatNode(this.pop());
    if (instruction instanceof AdvanceAppendInstruction) return new ConcatNode(this.pop(), instruction.char);
    if (instruction instanceof AdvanceCommaInstruction) return new CommaConcatNode(this.pop());

    if (instruction instanceof RewindStringInstruction || instruction instanceof TerminateRewindInstruction) {
      const right = this.pop();
      const node = this.pop();
      if (!(node instanceof ConcatNode)) {
        throw new Error(`Unmatched string rewind at ${instruction.address}`);
      }
      if (instruction instanceof TerminateRewindInstruction) {
        this.push(node.left);
        this.push(right);
        return null;
      }
      node.right = right;
      return node;
    }

    if (instruction instanceof UnaryInstruction) {
      const node = this.pop();
      if (node instanceof BinaryStringNode && instruction.isNot) {
        return new BinaryStringNode(node.left, node.right, node.op, true);
      }
      return new UnaryNode(node, instruction.opcode);
    }

    if (instruction instanceof BinaryStringInstruction) {
      const right = this.pop();
      const left = this.pop();
      return new BinaryStringNode(left, right, instruction.opcode);
    }
    if (instruction instanceof BinaryInstruction) {
      return new BinaryNode(this.pop(), this.pop(), instruction.opcode);
    }

    if (instruction instanceof VariableInstruction) return new VariableNode(instruction.name ?? "");
    if (instruction instanceof VariableArrayInstruction) {
      const node = this.pop();
      if (!(node instanceof ConcatNode) || !(node.left instanceof ConstantStringNode)) {
        throw new Error(`Expected ConcatNode before variable array at ${instruction.address}`);
      }
      return new VariableNode(node.left.value, node.right);
    }

    if (instruction instanceof SaveVariableInstruction) {
      const top = this.pop();
      if (top instanceof VariableNode) return new AssignmentNode(top, this.pop());
      if (top instanceof BinaryNode) return new AssignmentNode(top.left, top.right, top.op);
      throw new Error(`Expected variable or binary before assignment at ${instruction.address}`);
    }

    if (instruction instanceof FieldInstruction) return new FieldNode(instruction.name ?? "");

    if (instruction instanceof ObjectInstruction || instruction instanceof ObjectNewInstruction) {
      const next = this.parse(this.read());
      let field: FieldNode;
      if (next instanceof ConstantStringNode) field = new FieldNode(next.value);
      else if (next instanceof FieldNode) field = next;
      else throw new Error(`Expected field after object at ${instruction.address}`);
      if (!(instruction instanceof ObjectNewInstruction)) field.object = this.pop();
      return field;
    }

    if (instruction instanceof ObjectInternalInstruction) {
      const node = this.pop();
      if (!(node instanceof FieldNode)) throw new Error(`Expected field before internal at ${instruction.address}`);
      node.internal = true;
      return node;
    }

    if (instruction instanceof FieldArrayInstruction) {
      const node = this.pop();
      if (!(node instanceof FieldNode)) throw new Error(`Expected field before field array at ${instruction.address}`);
      node.index = this.pop();
      return node;
    }

    if (instruction instanceof SaveFieldInstruction) {
      const top = this.pop();
      if (top instanceof FieldNode) return new AssignmentNode(top, this.pop());
      if (top instanceof BinaryNode) return new AssignmentNode(top.left, top.right, top.op);
      throw new Error(`Expected field or binary before field assignment at ${instruction.address}`);
    }

    if (instruction instanceof FunctionInstruction) {
      const body = this.parseRange(this.current!.address, instruction.endAddress - 1);
      const node = new FunctionDeclarationNode(instruction);
      node.body = body;
      if (body.length > 0) {
        const last = body[body.length - 1];
        if (last instanceof ReturnNode && last.value === null) body.pop();
      }
      if (!instruction.package) return node;
      let pkg: PackageNode;
      const peek = this.peek();
      if (peek instanceof PackageNode && peek.name === instruction.package) {
        pkg = peek;
        this.pop();
      } else {
        pkg = new PackageNode(instruction.package);
      }
      pkg.functions.push(node);
      return pkg;
    }

    if (instruction instanceof CallInstruction) {
      const node = new FunctionCallNode(instruction);
      const frame = this.frameStack.pop() ?? [];
      frame.forEach(a => node.addArgument(a));
      return node;
    }

    if (instruction instanceof BranchInstruction) {
      if (instruction.isUnconditional) {
        const branch = this.data.branches.get(instruction.address);
        if (branch?.type === CFBranchType.Break) return new BreakNode();
        if (branch?.type === CFBranchType.Continue) return new ContinueNode();
        return null;
      }
      if (instruction.isLogicalOperator) {
        const next = instruction.next!;
        const target = this.disasm.get(instruction.targetAddress)!;
        const right = this.parseRange(next.address, target.prev!.address);
        if (right.length !== 1) {
          throw new Error(`Could not parse logical operator at ${instruction.address}`);
        }
        return new BinaryNode(this.pop(), right[0], instruction.opcode);
      }
      return null;
    }

    if (instruction instanceof CreateObjectInstruction) {
      const frame = this.frameStack.pop() ?? [];
      const node = new ObjectDeclarationNode(
        instruction,
        frame[0],
        frame.length > 1 ? frame[1] : null,
        this.objectDepth++,
      );
      for (let i = 2; i < frame.length; i++) node.addArgument(frame[i]);
      return node;
    }

    if (instruction instanceof AddObjectInstruction) {
      const fields: AssignmentNode[] = [];
      while (this.peek() instanceof AssignmentNode) {
        fields.unshift(this.pop() as AssignmentNode);
      }
      const node = this.pop();
      if (!(node instanceof ObjectDeclarationNode)) {
        throw new Error(`Expected object before AddObject at ${instruction.address}`);
      }
      fields.forEach(f => node.fields.push(f));
      return node;
    }

    if (instruction instanceof EndObjectInstruction) {
      const children: ObjectDeclarationNode[] = [];
      while (true) {
        const p = this.peek();
        if (!(p instanceof ObjectDeclarationNode) || p.depth !== this.objectDepth) break;
        children.unshift(this.pop() as ObjectDeclarationNode);
      }
      const node = this.pop();
      if (!(node instanceof ObjectDeclarationNode)) {
        throw new Error(`Expected object before EndObject at ${instruction.address}`);
      }
      children.forEach(c => node.children.push(c));
      this.objectDepth--;
      // Top-level `new` is compiled with a leading `loadImmedUint 0` placeholder
      // for the object-id slot. When the root EndObject fires (value=true means
      // placeAtRoot), that placeholder is still sitting under the object node —
      // drop it so it doesn't render as a stray `0` before the declaration.
      if (instruction.value && this.peek() instanceof ConstantUIntNode) {
        this.pop();
      }
      return node;
    }

    if (instruction instanceof UnitConversionInstruction) {
      return new UnitConversionNode(this.pop(), this.pop());
    }

    if (instruction instanceof LoadVariableInstruction
      || instruction instanceof LoadFieldInstruction
      || instruction instanceof AdvanceNullInstruction
      || instruction instanceof ConvertToTypeInstruction
      || instruction instanceof UnusedInstruction
      || instruction instanceof DebugBreakInstruction) {
      return null;
    }

    throw new Error(`Unknown instruction: ${instruction.constructor.name}`);
  }

  private collapseIfLoop(node: IfNode): Node {
    if (node.true.length !== 1 || node.false.length > 0) return node;
    const loop = node.true[0];
    if (!(loop instanceof LoopNode) || loop instanceof WhileLoopNode || loop instanceof ForLoopNode) return node;
    // Only collapse when the if-test matches the loop-test
    // (structural compare is approximate but matches dso-sharp behaviour)
    if (!sameTest(node.test, loop.test)) return node;
    const peek = this.peek();
    if (peek && loop.body.length > 0 && peek.isExpression) {
      let end = loop.body[loop.body.length - 1];
      if (end.isExpression) {
        if (end instanceof IfNode && end.canConvertToTernary()) end = end.convertToTernary();
        const init = this.pop();
        const forLoop = new ForLoopNode(init, loop.test, end);
        forLoop.body = loop.body.slice(0, -1);
        return forLoop;
      }
    }
    const whileLoop = new WhileLoopNode(loop.test);
    whileLoop.body = loop.body;
    return whileLoop;
  }

  private parseRange(fromAddress: number, toAddress: number): Node[] {
    const inner = new Builder();
    const list = inner.buildRange(this.data, this.disasm, fromAddress, toAddress);
    this.current = this.disasm.get(inner.currentAddress);
    return list;
  }

  private push(node: Node) { this.nodeStack.push(node); }
  private pop(): Node {
    const node = this.nodeStack.pop()!;
    if (node instanceof IfNode) return node.convertToTernary();
    return node;
  }
  private peek(): Node | null { return this.nodeStack[this.nodeStack.length - 1] ?? null; }
  private read(): Instruction | null {
    const i = this.current;
    this.current = i?.next ?? null;
    return i;
  }
}

function sameTest(a: Node | null, b: Node | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // Cheap structural compare via generated source — slow but correct.
  const wa = new CodeWriter();
  const wb = new CodeWriter();
  a.visit(wa, true);
  b.visit(wb, true);
  return wa.stream.join("") === wb.stream.join("");
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Code generator (CodeGenerator/CodeGenerator.cs)
 * ────────────────────────────────────────────────────────────────────────── */
export function generateCode(nodes: Node[]): string {
  const w = new CodeWriter();
  for (const n of nodes) n.visit(w, false);
  return w.stream.join("");
}

/* ────────────────────────────────────────────────────────────────────────── *
 * High-level decompile entry point
 * ────────────────────────────────────────────────────────────────────────── */
export type SupportedGame = "TGE10" | "Tribes2" | "ForgettableDungeon";

const SUPPORTED_DECOMPILE = new Set<SupportedGame>(["TGE10", "Tribes2", "ForgettableDungeon"]);

export function isDecompileSupported(game: string): game is SupportedGame {
  return SUPPORTED_DECOMPILE.has(game as SupportedGame);
}

export interface DecompileResult {
  ok: boolean;
  source?: string;
  error?: string;
  stats?: { instructionCount: number; codeSize: number };
}

export function decompile(bytes: Uint8Array): DecompileResult {
  try {
    const loader = new FileLoader();
    const data = loader.load(bytes);
    const ops = new Ops();
    const reader = new BytecodeReader(data, ops);
    const disasm = disassemble(reader);
    const cf = analyzeControlFlow(disasm);
    const builder = new Builder();
    const nodes = builder.build(cf, disasm);
    const source = generateCode(nodes);
    return {
      ok: true,
      source,
      stats: { instructionCount: disasm.list.length, codeSize: data.code.length },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Disassembly text dump
 * ────────────────────────────────────────────────────────────────────────── */
export interface DisassembleTextResult {
  ok: boolean;
  text?: string;
  error?: string;
}

function formatString(s: string, max = 60): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "\"") out += "\\\"";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += "\\x" + c.toString(16).padStart(2, "0").toUpperCase();
    else out += ch;
  }
  if (out.length > max) out = out.slice(0, max) + "…";
  return `"${out}"`;
}

function formatInstruction(inst: Instruction): string {
  const name = OpcodeTag[inst.opcode.tag] ?? "?";
  const parts: string[] = [];
  if (inst instanceof FunctionInstruction) {
    if (inst.package) parts.push(`pkg=${inst.package}`);
    if (inst.namespace) parts.push(`${inst.namespace}::`);
    parts.push(inst.name ?? "<anon>");
    parts.push(`args=(${inst.arguments.map((a) => a ?? "?").join(", ")})`);
    if (inst.hasBody) parts.push(`body end=${inst.endAddress}`);
    else parts.push("decl");
  } else if (inst instanceof CreateObjectInstruction) {
    parts.push(`parent=${inst.parent ?? "<none>"}`);
    if (inst.isDataBlock) parts.push("datablock");
    parts.push(`failJmp=${inst.failJumpAddress}`);
  } else if (inst instanceof AddObjectInstruction) {
    parts.push(inst.placeAtRoot ? "root" : "child");
  } else if (inst instanceof EndObjectInstruction) {
    parts.push(String(inst.value));
  } else if (inst instanceof BranchInstruction) {
    parts.push(`→ ${inst.targetAddress}`);
  } else if (inst instanceof ReturnInstruction) {
    parts.push(inst.returnsValue ? "value" : "void");
  } else if (inst instanceof VariableInstruction) {
    parts.push(inst.name ?? "<?>");
  } else if (inst instanceof FieldInstruction) {
    parts.push(inst.name ?? "<?>");
  } else if (inst instanceof ImmediateStringInstruction) {
    parts.push(inst.isIdentifier ? `ident:${inst.value}` : formatString(inst.value));
  } else if (inst instanceof ImmediateUIntInstruction) {
    parts.push(String(inst.value));
  } else if (inst instanceof ImmediateDoubleInstruction) {
    parts.push(String(inst.value));
  } else if (inst instanceof CallInstruction) {
    if (inst.namespace) parts.push(`${inst.namespace}::`);
    parts.push(inst.name ?? "<anon>");
    parts.push(`type=${inst.callType}`);
  } else if (inst instanceof AdvanceAppendInstruction) {
    parts.push(formatString(inst.char));
  } else if (inst instanceof ConvertToTypeInstruction) {
    parts.push(`type=${TypeReq[inst.type]}`);
  }
  const addr = inst.address.toString().padStart(6, " ");
  return `${addr}  ${name.padEnd(28, " ")}${parts.length ? " " + parts.join(" ") : ""}`;
}

export function disassembleText(bytes: Uint8Array): DisassembleTextResult {
  try {
    const loader = new FileLoader();
    const data = loader.load(bytes);
    const ops = new Ops();
    const reader = new BytecodeReader(data, ops);
    const disasm = disassemble(reader);
    const lines: string[] = [];
    lines.push(`; DSO version ${data.version}`);
    lines.push(`; ${disasm.list.length} instructions, ${data.code.length} ops`);
    lines.push(`; global strings: ${data.globalStringTable.entries.size}, function strings: ${data.functionStringTable.entries.size}`);
    lines.push(`; global floats: ${data.globalFloatTable.values.length}, function floats: ${data.functionFloatTable.values.length}`);
    lines.push("");
    for (const inst of disasm.list) {
      lines.push(formatInstruction(inst));
    }
    return { ok: true, text: lines.join("\n") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

