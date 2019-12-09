/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import *as Thrift from "./thrift";
import { TTransport } from "./transport";

export interface TMap {
  ktype: Thrift.Type;
  vtype: Thrift.Type;
  size: number | bigint;
}

export interface TMessage {
  fname: string;
  mtype: Thrift.MessageType;
  rseqid: number | bigint;
}

export interface TField {
  fname: string;
  ftype: Thrift.Type;
  fid: number;
}

export interface TList {
  etype: Thrift.Type;
  size: number | bigint;
}

export interface TSet {
  etype: Thrift.Type;
  size: number;
}

export interface TStruct {
  fname: string;
}

export interface TStructLike {
  read(input: TProtocol): void;
  write(output: TProtocol): void;
}

export interface TProtocol {
  flush(): void;
  writeMessageBegin(name: string, type: Thrift.MessageType, seqid: number): void;
  writeMessageEnd(): void;
  writeStructBegin(name: string): void;
  writeStructEnd(): void;
  writeFieldBegin(name: string, type: Thrift.Type, id: number): void;
  writeFieldEnd(): void;
  writeFieldStop(): void;
  writeMapBegin(ktype: Thrift.Type, vtype: Thrift.Type, size: number): void;
  writeMapEnd(): void;
  writeListBegin(etype: Thrift.Type, size: number): void;
  writeListEnd(): void;
  writeSetBegin(etype: Thrift.Type, size: number): void;
  writeSetEnd(): void;
  writeBool(bool: boolean): void;
  writeByte(b: number): void;
  writeI16(i16: number): void;
  writeI32(i32: number): void;
  writeI64(i64: number | BigInt): void;
  writeDouble(dbl: number): void;
  writeString(arg: string | Buffer): void;
  writeBinary(arg: string | Buffer): void;
  readMessageBegin(): TMessage;
  readMessageEnd(): void;
  readStructBegin(): TStruct;
  readStructEnd(): void;
  readFieldBegin(): TField;
  readFieldEnd(): void;
  readMapBegin(): TMap;
  readMapEnd(): void;
  readListBegin(): TList;
  readListEnd(): void;
  readSetBegin(): TSet;
  readSetEnd(): void;
  readBool(): boolean;
  readByte(): number;
  readI16(): number;
  readI32(): number;
  readI64(): BigInt;
  readDouble(): number;
  readBinary(): Buffer;
  readString(): string;
  getTransport(): TTransport;
  skip(type: Thrift.Type): void;
}

export interface TProtocolConstructor {
  new(trans: TTransport, strictRead?: boolean, strictWrite?: boolean): TProtocol;
}

export { TBinaryProtocol } from './binary_protocol';
export { TCompactProtocol } from './compact_protocol';
export { TJSONProtocol } from './json_protocol';
