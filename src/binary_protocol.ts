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

import *as log from './log'
import *as binary from './binary';
import *as Thrift from './thrift';
import { Type as ThriftType } from './thrift';

// JavaScript supports only numeric doubles, therefore even hex values are always signed.
// The largest integer value which can be represented in JavaScript is +/-2^53.
// Bitwise operations convert numbers to 32 bit integers but perform sign extension
// upon assigning values back to variables.
const VERSION_MASK = -65536   // 0xffff0000
const VERSION_1 = -2147418112 // 0x80010000
const TYPE_MASK = 0x000000ff;

export class TBinaryProtocol {
  constructor(
    public trans: any,
    public strictRead = false,
    public strictWrite = true,
  ) {

  }
  _seqid: number | null = null;
  flush() {
    return this.trans.flush();
  };
  writeMessageBegin(name: string, type: any, seqid: number) {
    if (this.strictWrite) {
      this.writeI32(VERSION_1 | type);
      this.writeString(name);
      this.writeI32(seqid);
    } else {
      this.writeString(name);
      this.writeByte(type);
      this.writeI32(seqid);
    }
    // Record client seqid to find callback again
    if (this._seqid !== null) {
      log.warning('SeqId already set', { 'name': name });
    } else {
      this._seqid = seqid;
      this.trans.setCurrSeqId(seqid);
    }
  };
  writeMessageEnd() {
    if (this._seqid !== null) {
      this._seqid = null;
    } else {
      log.warning('No seqid to unset');
    }
  };

  writeStructBegin(name: string) {
  };
  writeStructEnd() {
  };


  writeFieldBegin(name: string, type: any, id: number) {
    this.writeByte(type);
    this.writeI16(id);
  };

  writeFieldEnd() {
  };

  writeFieldStop() {
    this.writeByte(ThriftType.STOP);
  };

  writeMapBegin(ktype: any, vtype: any, size: number) {
    this.writeByte(ktype);
    this.writeByte(vtype);
    this.writeI32(size);
  };

  writeMapEnd() {
  };

  writeListBegin(etype: any, size: number) {
    this.writeByte(etype);
    this.writeI32(size);
  };

  writeListEnd() {
  };

  writeSetBegin(etype: any, size: number) {
    this.writeByte(etype);
    this.writeI32(size);
  };

  writeSetEnd() {
  };


  writeBool(bool: boolean) {
    this.writeByte(bool ? 1 : 0);
  };
  writeByte(b: any) {
    this.trans.write(new Buffer([b]));
  };
  writeI16(i16: any) {
    this.trans.write(binary.writeI16(new Buffer(2), i16));
  };
  writeI32(i32: any) {
    this.trans.write(binary.writeI32(new Buffer(4), i32));
  };
  writeI64(i64: any) {
    if (i64.buffer) {
      this.trans.write(i64.buffer);
    } else {
      this.trans.write(BigInt(i64));
    }
  };
  writeDouble(dub: any) {
    this.trans.write(binary.writeDouble(new Buffer(8), dub));
  };
  writeStringOrBinary(name: string, encoding: string, arg: any) {
    if (typeof (arg) === 'string') {
      this.writeI32(Buffer.byteLength(arg, encoding as any));
      this.trans.write(new Buffer(arg, encoding as any));
    } else if ((arg instanceof Buffer) ||
      (Object.prototype.toString.call(arg) == '[object Uint8Array]')) {
      // Buffers in Node.js under Browserify may extend UInt8Array instead of
      // defining a new object. We detect them here so we can write them
      // correctly
      this.writeI32(arg.length);
      this.trans.write(arg);
    } else {
      throw new Error(name + ' called without a string/Buffer argument: ' + arg);
    }
  };
  writeString(arg: any) {
    this.writeStringOrBinary('writeString', 'utf8', arg);
  };
  writeBinary(arg: any) {
    this.writeStringOrBinary('writeBinary', 'binary', arg);
  };


  readMessageBegin() {
    var sz = this.readI32();
    var type, name, seqid;

    if (sz < 0) {
      var version = sz & VERSION_MASK;
      if (version != VERSION_1) {
        throw new Thrift.TProtocolException(Thrift.TProtocolExceptionType.BAD_VERSION, "Bad version in readMessageBegin: " + sz);
      }
      type = sz & TYPE_MASK;
      name = this.readString();
      seqid = this.readI32();
    } else {
      if (this.strictRead) {
        throw new Thrift.TProtocolException(Thrift.TProtocolExceptionType.BAD_VERSION, "No protocol version header");
      }
      name = this.trans.read(sz);
      type = this.readByte();
      seqid = this.readI32();
    }
    return { fname: name, mtype: type, rseqid: seqid };
  };
  readMessageEnd() {
  };

  readStructBegin() {
    return { fname: '' };
  };
  readStructEnd() {
  };

  readFieldBegin() {
    var type = this.readByte();
    if (type == ThriftType.STOP) {
      return { fname: null, ftype: type, fid: 0 };
    }
    var id = this.readI16();
    return { fname: null, ftype: type, fid: id };
  };
  readFieldEnd() {
  };

  readMapBegin() {
    var ktype = this.readByte();
    var vtype = this.readByte();
    var size = this.readI32();
    return { ktype: ktype, vtype: vtype, size: size };
  };
  readMapEnd() {
  };


  readListBegin() {
    var etype = this.readByte();
    var size = this.readI32();
    return { etype: etype, size: size };
  };
  readListEnd() {
  };

  readSetBegin() {
    var etype = this.readByte();
    var size = this.readI32();
    return { etype: etype, size: size };
  };
  readSetEnd() {
  };

  readBool() {
    var b = this.readByte();
    if (b === 0) {
      return false;
    }
    return true;
  };

  readByte() {
    return this.trans.readByte();
  };

  readI16() {
    return this.trans.readI16();
  };

  readI32() {
    return this.trans.readI32();
  };

  readI64() {
    var buff = this.trans.read(8);
    return BigInt(buff);
  };

  readDouble() {
    return this.trans.readDouble();
  };

  readBinary() {
    var len = this.readI32();
    if (len === 0) {
      return new Buffer(0);
    }

    if (len < 0) {
      throw new Thrift.TProtocolException(Thrift.TProtocolExceptionType.NEGATIVE_SIZE, "Negative binary size");
    }
    return this.trans.read(len);
  };

  readString() {
    var len = this.readI32();
    if (len === 0) {
      return "";
    }

    if (len < 0) {
      throw new Thrift.TProtocolException(Thrift.TProtocolExceptionType.NEGATIVE_SIZE, "Negative string size");
    }
    return this.trans.readString(len);
  };

  getTransport() {
    return this.trans;
  };

  skip(type: ThriftType) {
    switch (type) {
      case ThriftType.STOP:
        return;
      case ThriftType.BOOL:
        this.readBool();
        break;
      case ThriftType.BYTE:
        this.readByte();
        break;
      case ThriftType.I16:
        this.readI16();
        break;
      case ThriftType.I32:
        this.readI32();
        break;
      case ThriftType.I64:
        this.readI64();
        break;
      case ThriftType.DOUBLE:
        this.readDouble();
        break;
      case ThriftType.STRING:
        this.readString();
        break;
      case ThriftType.STRUCT:
        this.readStructBegin();
        while (true) {
          var r = this.readFieldBegin();
          if (r.ftype === ThriftType.STOP) {
            break;
          }
          this.skip(r.ftype);
          this.readFieldEnd();
        }
        this.readStructEnd();
        break;
      case ThriftType.MAP:
        var mapBegin = this.readMapBegin();
        for (var i = 0; i < mapBegin.size; ++i) {
          this.skip(mapBegin.ktype);
          this.skip(mapBegin.vtype);
        }
        this.readMapEnd();
        break;
      case ThriftType.SET:
        var setBegin = this.readSetBegin();
        for (var i2 = 0; i2 < setBegin.size; ++i2) {
          this.skip(setBegin.etype);
        }
        this.readSetEnd();
        break;
      case ThriftType.LIST:
        var listBegin = this.readListBegin();
        for (var i3 = 0; i3 < listBegin.size; ++i3) {
          this.skip(listBegin.etype);
        }
        this.readListEnd();
        break;
      default:
        throw new Error("Invalid type: " + type);
    }
  };


}

export default TBinaryProtocol