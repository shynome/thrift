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

import *as Thrift from './thrift';
import { Type as ThriftType } from './thrift';

import *as Int64Util from './int64_util';
import json_parse from './json_parse';

import InputBufferUnderrunError from './input_buffer_underrun_error';



/**
 * Thrift IDL type Id to string mapping.
 */
export enum TJSONProtocolType {
  BOOL = '"tf"',
  BYTE = '"i8"',
  I16 = '"i16"',
  I32 = '"i32"',
  I64 = '"i64"',
  DOUBLE = '"dbl"',
  STRUCT = '"rec"',
  STRING = '"str"',
  MAP = '"map"',
  LIST = '"lst"',
  SET = '"set"',
}

export enum TJSONProtocolRType {
  tf = ThriftType.BOOL,
  i8 = ThriftType.BYTE,
  i16 = ThriftType.I16,
  i32 = ThriftType.I32,
  i64 = ThriftType.I64,
  dbl = ThriftType.DOUBLE,
  rec = ThriftType.STRUCT,
  str = ThriftType.STRING,
  map = ThriftType.MAP,
  lst = ThriftType.LIST,
  set = ThriftType.SET,
}


interface Wobj extends Array<any> {
  0: number,
  1: string,
  2: Thrift.MessageType,
  3: number
}

interface AnonReadMessageBeginReturn {
  /**The name of the service method. */
  fname: string
  /**The type of message call. */
  mtype: Thrift.MessageType
  /**The sequence number of the message (0 in Thrift RPC). */
  rseqid: number
}

interface AnonReadFieldBeginReturn {
  /**The name of the field (always ''). */
  fname: string
  /**The data type of the field. */
  ftype: ThriftType
  /**The unique identifier of the field. */
  fid: number
}

interface AnonReadMapBeginReturn {
  /**The data type of the key. */
  ktype: ThriftType
  /**The data type of the value. */
  vtype: ThriftType
  /**The number of elements in the map. */
  size: number
}

interface AnonReadColBeginReturn {
  /**The data type of the element. */
  etype: ThriftType,
  /**The number of elements in the collection. */
  size: number,
}

/**
 * Initializes a Thrift JSON protocol instance.
 * @classdesc Apache Thrift Protocols perform serialization which enables cross
 * language RPC. The Protocol type is the JavaScript browser implementation
 * of the Apache Thrift TJSONProtocol.
 * @example
 *     var protocol  = new Thrift.Protocol(transport);
 */
export class TJSONProtocol {

  /**
   * The TJSONProtocol version number.
   */
  static readonly Version = 1;

  tstack: any[] = [];
  tpos: number[] = [];
  /**
   *@param {Thrift.Transport} trans - The transport to serialize to/from.
   */
  constructor(
    public trans: any
  ) { }

  flush() {
    this.writeToTransportIfStackIsFlushable();
    return this.trans.flush();
  };

  writeToTransportIfStackIsFlushable() {
    if (this.tstack.length === 1) {
      this.trans.write(this.tstack.pop());
    }
  };

  /**
   * Serializes the beginning of a Thrift RPC message.
   * @param {string} name - The service method to call.
   * @param {Thrift.MessageType} messageType - The type of method call.
   * @param {number} seqid - The sequence number of this call (always 0 in Apache Thrift).
   */
  writeMessageBegin(name: string, messageType: Thrift.MessageType, seqid: number) {
    this.tstack.push([TJSONProtocol.Version, '"' + name + '"', messageType, seqid]);
  };

  wobj: Wobj = null as any
  wbuf: string = null as any
  /**
   * Serializes the end of a Thrift RPC message.
   */
  writeMessageEnd() {
    var obj = this.tstack.pop();

    this.wobj = this.tstack.pop() as any;
    this.wobj.push(obj);

    this.wbuf = '[' + this.wobj.join(',') + ']';

    // we assume there is nothing more to come so we write
    this.trans.write(this.wbuf);
  };


  /**
   * Serializes the beginning of a struct.
   * @param name - The name of the struct.
   */
  writeStructBegin(name: string) {
    this.tpos.push(this.tstack.length);
    this.tstack.push({} as any);
  };

  /**
   * Serializes the end of a struct.
   */
  writeStructEnd() {
    var p = this.tpos.pop() as number;
    var struct = this.tstack[p];
    var str = '{';
    var first = true;
    for (var key in struct) {
      if (first) {
        first = false;
      } else {
        str += ',';
      }

      str += key + ':' + struct[key];
    }

    str += '}';
    this.tstack[p] = str;

    this.writeToTransportIfStackIsFlushable();
  };

  /**
   * Serializes the beginning of a struct field.
   * @param {string} name - The name of the field.
   * @param {Thrift.Protocol.Type} fieldType - The data type of the field.
   * @param {number} fieldId - The field's unique identifier.
   */
  writeFieldBegin(name: string, fieldType: any, fieldId: number) {
    this.tpos.push(this.tstack.length);
    this.tstack.push({
      'fieldId': '"' +
        // @ts-ignore
        fieldId + '"', 'fieldType': TJSONProtocolType[fieldType]
    });
  };


  /**
   * Serializes the end of a field.
   */
  writeFieldEnd() {
    var value = this.tstack.pop();
    var fieldInfo = this.tstack.pop();

    if (':' + value === ":[object Object]") {
      this.tstack[this.tstack.length - 1][fieldInfo.fieldId] = '{' +
        fieldInfo.fieldType + ':' + JSON.stringify(value) + '}';
    } else {
      this.tstack[this.tstack.length - 1][fieldInfo.fieldId] = '{' +
        fieldInfo.fieldType + ':' + value + '}';
    }
    this.tpos.pop();

    this.writeToTransportIfStackIsFlushable();
  };

  /**
   * Serializes the end of the set of fields for a struct.
   */
  writeFieldStop() { };


  /**
   * Serializes the beginning of a map collection.
   * @param keyType - The data type of the key.
   * @param valType - The data type of the value.
   * @param [size] - The number of elements in the map (ignored).
   */
  writeMapBegin(keyType: ThriftType, valType: ThriftType, size?: number) {
    //size is invalid, we'll set it on end.
    this.tpos.push(this.tstack.length);
    // @ts-ignore
    this.tstack.push([TJSONProtocolType[keyType], TJSONProtocolType[valType], 0]);
  };

  /**
   * Serializes the end of a map.
   */
  writeMapEnd() {
    var p = this.tpos.pop() as number;

    if (p == this.tstack.length) {
      return;
    }

    if ((this.tstack.length - p - 1) % 2 !== 0) {
      this.tstack.push('');
    }

    var size = (this.tstack.length - p - 1) / 2;

    this.tstack[p][this.tstack[p].length - 1] = size;

    var map = '}';
    var first = true;
    while (this.tstack.length > p + 1) {
      var v = this.tstack.pop();
      var k = this.tstack.pop();
      if (first) {
        first = false;
      } else {
        map = ',' + map;
      }

      if (!isNaN(k)) { k = '"' + k + '"'; } //json "keys" need to be strings
      map = k + ':' + v + map;
    }
    map = '{' + map;

    this.tstack[p].push(map);
    this.tstack[p] = '[' + this.tstack[p].join(',') + ']';

    this.writeToTransportIfStackIsFlushable();
  };

  /**
   * Serializes the beginning of a list collection.
   * @param {Thrift.Type} elemType - The data type of the elements.
   * @param {number} size - The number of elements in the list.
   */
  writeListBegin(elemType: ThriftType, size: number) {
    this.tpos.push(this.tstack.length);
    // @ts-ignore
    this.tstack.push([TJSONProtocolType[elemType], size]);
  };

  /**
   * Serializes the end of a list.
   */
  writeListEnd() {
    var p = this.tpos.pop() as number;

    while (this.tstack.length > p + 1) {
      var tmpVal = this.tstack[p + 1];
      this.tstack.splice(p + 1, 1);
      this.tstack[p].push(tmpVal);
    }

    this.tstack[p] = '[' + this.tstack[p].join(',') + ']';

    this.writeToTransportIfStackIsFlushable();
  };

  /**
   * Serializes the beginning of a set collection.
   * @param {Thrift.Type} elemType - The data type of the elements.
   * @param {number} size - The number of elements in the list.
   */
  writeSetBegin(elemType: ThriftType, size: number) {
    this.tpos.push(this.tstack.length);
    // @ts-ignore
    this.tstack.push([TJSONProtocolType[elemType], size]);
  };

  /**
   * Serializes the end of a set.
   */
  writeSetEnd() {
    var p = this.tpos.pop() as number;

    while (this.tstack.length > p + 1) {
      var tmpVal = this.tstack[p + 1];
      this.tstack.splice(p + 1, 1);
      this.tstack[p].push(tmpVal);
    }

    this.tstack[p] = '[' + this.tstack[p].join(',') + ']';

    this.writeToTransportIfStackIsFlushable();
  };

  /** Serializes a boolean */
  writeBool(bool: boolean) {
    this.tstack.push(bool ? 1 : 0);
  };

  /** Serializes a number */
  writeByte(byte: any) {
    this.tstack.push(byte);
  };

  /** Serializes a number */
  writeI16(i16: any) {
    this.tstack.push(i16);
  };

  /** Serializes a number */
  writeI32(i32: any) {
    this.tstack.push(i32);
  };

  /** Serializes a number */
  writeI64(i64: BigInt) {
    if (i64 instanceof BigInt) {
      this.tstack.push(Int64Util.toDecimalString(i64));
    } else {
      this.tstack.push(i64);
    }
  };

  /** Serializes a number */
  writeDouble(dub: any) {
    this.tstack.push(dub);
  };

  /** Serializes a string */
  writeString(arg: any) {
    // We do not encode uri components for wire transfer:
    if (arg === null) {
      this.tstack.push(null);
    } else {
      if (typeof arg === 'string') {
        var str = arg;
      } else if (arg instanceof Buffer) {
        var str = arg.toString('utf8');
      } else {
        throw new Error('writeString called without a string/Buffer argument: ' + arg);
      }

      // concat may be slower than building a byte buffer
      var escapedString = '';
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);      // a single double quote: "
        if (ch === '\"') {
          escapedString += '\\\"'; // write out as: \"
        } else if (ch === '\\') {    // a single backslash: \
          escapedString += '\\\\'; // write out as: \\
          /* Currently escaped forward slashes break TJSONProtocol.
           * As it stands, we can simply pass forward slashes into
           * our strings across the wire without being escaped.
           * I think this is the protocol's bug, not thrift.js
           * } else if(ch === '/') {   // a single forward slash: /
           *  escapedString += '\\/';  // write out as \/
           * }
           */
        } else if (ch === '\b') {    // a single backspace: invisible
          escapedString += '\\b';  // write out as: \b"
        } else if (ch === '\f') {    // a single formfeed: invisible
          escapedString += '\\f';  // write out as: \f"
        } else if (ch === '\n') {    // a single newline: invisible
          escapedString += '\\n';  // write out as: \n"
        } else if (ch === '\r') {    // a single return: invisible
          escapedString += '\\r';  // write out as: \r"
        } else if (ch === '\t') {    // a single tab: invisible
          escapedString += '\\t';  // write out as: \t"
        } else {
          escapedString += ch;     // Else it need not be escaped
        }
      }
      this.tstack.push('"' + escapedString + '"');
    }
  };

  /** Serializes a string */
  writeBinary(arg: any) {
    var buf: any
    if (typeof arg === 'string') {
      buf = new Buffer(arg, 'binary');
    } else if (arg instanceof Buffer ||
      Object.prototype.toString.call(arg) == '[object Uint8Array]') {
      buf = arg;
    } else {
      throw new Error('writeBinary called without a string/Buffer argument: ' + arg);
    }
    this.tstack.push('"' + buf.toString('base64') + '"');
  };


  rstack: any[] = []
  rpos: number[] = []
  robj: string[] = []
  readMessageBegin(): AnonReadMessageBeginReturn {
    this.rstack = [];
    this.rpos = [];

    //Borrow the inbound transport buffer and ensure data is present/consistent
    var transBuf = this.trans.borrow();
    if (transBuf.readIndex >= transBuf.writeIndex) {
      throw new InputBufferUnderrunError();
    }
    var cursor = transBuf.readIndex;

    if (transBuf.buf[cursor] !== 0x5B) { //[
      throw new Error("Malformed JSON input, no opening bracket");
    }

    //Parse a single message (there may be several in the buffer)
    //  TODO: Handle characters using multiple code units
    cursor++;
    var openBracketCount = 1;
    var inString = false;
    for (; cursor < transBuf.writeIndex; cursor++) {
      var chr = transBuf.buf[cursor];
      //we use hexa charcode here because data[i] returns an int and not a char
      if (inString) {
        if (chr === 0x22) { //"
          inString = false;
        } else if (chr === 0x5C) { //\
          //escaped character, skip
          cursor += 1;
        }
      } else {
        if (chr === 0x5B) { //[
          openBracketCount += 1;
        } else if (chr === 0x5D) { //]
          openBracketCount -= 1;
          if (openBracketCount === 0) {
            //end of json message detected
            break;
          }
        } else if (chr === 0x22) { //"
          inString = true;
        }
      }
    }

    if (openBracketCount !== 0) {
      // Missing closing bracket. Can be buffer underrun.
      throw new InputBufferUnderrunError();
    }

    //Reconstitute the JSON object and conume the necessary bytes
    this.robj = json_parse(transBuf.buf.slice(transBuf.readIndex, cursor + 1).toString());
    this.trans.consume(cursor + 1 - transBuf.readIndex);

    //Verify the protocol version
    var version = this.robj.shift() as any as number;
    if (version != TJSONProtocol.Version) {
      throw new Error('Wrong thrift protocol version: ' + version);
    }

    //Objectify the thrift message {name/type/sequence-number} for return
    // and then save the JSON object in rstack
    var r: AnonReadMessageBeginReturn = {
      fname: this.robj.shift() as string,
      mtype: this.robj.shift() as any,
      rseqid: this.robj.shift() as any,
    };
    this.rstack.push(this.robj.shift());
    return r;
  };

  /** Deserializes the end of a message. */
  readMessageEnd() {
  };

  /**
   * Deserializes the beginning of a struct.
   * @param {string} [name] - The name of the struct (ignored)
   * @returns {object} - An object with an empty string fname property
   */
  readStructBegin() {
    var r: any = {};
    r.fname = '';

    //incase this is an array of structs
    if (this.rstack[this.rstack.length - 1] instanceof Array) {
      this.rstack.push(this.rstack[this.rstack.length - 1].shift());
    }

    return r;
  };

  /** Deserializes the end of a struct. */
  readStructEnd() {
    this.rstack.pop();
  };
  /**
   * Deserializes the beginning of a field.
   */
  readFieldBegin(): AnonReadFieldBeginReturn {
    var r: AnonReadFieldBeginReturn = {} as any;

    var fid = -1;
    var ftype = ThriftType.STOP;

    //get a fieldId
    for (var f in (this.rstack[this.rstack.length - 1])) {
      if (f === null) {
        continue;
      }

      fid = parseInt(f, 10);
      this.rpos.push(this.rstack.length);

      var field = this.rstack[this.rstack.length - 1][fid];

      //remove so we don't see it again
      delete this.rstack[this.rstack.length - 1][fid];

      this.rstack.push(field);

      break;
    }

    if (fid != -1) {
      //should only be 1 of these but this is the only
      //way to match a key
      for (var i in (this.rstack[this.rstack.length - 1])) {
        // @ts-ignore
        if (TJSONProtocolRType[i] === null) {
          continue;
        }

        // @ts-ignore
        ftype = TJSONProtocolRType[i];
        this.rstack[this.rstack.length - 1] = this.rstack[this.rstack.length - 1][i];
      }
    }

    r.fname = '';
    r.ftype = ftype;
    r.fid = fid;

    return r;
  };

  /** Deserializes the end of a field. */
  readFieldEnd() {
    var pos = this.rpos.pop() as number;

    //get back to the right place in the stack
    while (this.rstack.length > pos) {
      this.rstack.pop();
    }
  };


  /**
   * Deserializes the beginning of a map.
   */
  readMapBegin(): AnonReadMapBeginReturn {
    var map = this.rstack.pop();
    var first = map.shift();
    if (first instanceof Array) {
      this.rstack.push(map);
      map = first;
      first = map.shift();
    }

    var r: AnonReadMapBeginReturn = {
      // @ts-ignore
      ktype: TJSONProtocol.RType[first], vtype: TJSONProtocol.RType[map.shift()],
      size: map.shift(),
    };


    this.rpos.push(this.rstack.length);
    this.rstack.push(map.shift());

    return r;
  };

  /** Deserializes the end of a map. */
  readMapEnd() {
    this.readFieldEnd();
  };

  /**
   * Deserializes the beginning of a list.
   */
  readListBegin(): AnonReadColBeginReturn {
    var list = this.rstack[this.rstack.length - 1];

    var r: AnonReadColBeginReturn = {} as any;
    // @ts-ignore
    r.etype = TJSONProtocol.RType[list.shift()];
    r.size = list.shift();

    this.rpos.push(this.rstack.length);
    this.rstack.push(list.shift());

    return r;
  };

  /** Deserializes the end of a list. */
  readListEnd() {
    var pos = (this.rpos.pop() as number) - 2;
    var st = this.rstack;
    st.pop();
    if (st instanceof Array && st.length > pos && st[pos].length > 0) {
      st.push(st[pos].shift());
    }
  };

  /**
   * Deserializes the beginning of a set.
   */
  readSetBegin(): AnonReadColBeginReturn {
    return this.readListBegin();
  };
  /** Deserializes the end of a set. */
  readSetEnd() {
    return this.readListEnd();
  };


  readBool() {
    return this.readValue() == '1';
  };

  readByte() {
    return this.readI32();
  };

  readI16() {
    return this.readI32();
  };

  readI32(f?: any) {
    return +this.readValue();
  }

  /** Returns the next value found in the protocol buffer */
  readValue(f?: any) {
    if (f === undefined) {
      f = this.rstack[this.rstack.length - 1];
    }

    var r: any = {};

    if (f instanceof Array) {
      if (f.length === 0) {
        r.value = undefined;
      } else {
        r.value = f.shift();
      }
    } else if (!(f instanceof BigInt) && f instanceof Object) {
      for (var i in f) {
        if (i === null) {
          continue;
        }
        this.rstack.push(f[i]);
        delete f[i];

        r.value = i;
        break;
      }
    } else {
      r.value = f;
      this.rstack.pop();
    }

    return r.value;
  };

  readI64() {
    var n = this.readValue()
    if (typeof n === 'string') {
      // Assuming no one is sending in 1.11111e+33 format
      return Int64Util.fromDecimalString(n);
    } else {
      return BigInt(n);
    }
  };

  readDouble() {
    return this.readI32();
  };

  readBinary() {
    return new Buffer(this.readValue(), 'base64');
  };

  readString() {
    return this.readValue();
  };
  /**
   * Returns the underlying transport.
   */
  getTransport() {
    return this.trans;
  };

  /**
   * Method to arbitrarily skip over data
   */
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

export default TJSONProtocol
