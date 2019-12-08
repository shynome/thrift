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

import *as binary from './binary';
import InputBufferUnderrunError from './input_buffer_underrun_error';

export class TFramedTransport {
  outBuffers: Buffer[] = [];
  inBuf: Buffer = null as any
  outCount = 0;
  readPos = 0;
  constructor(
    public buffer: Buffer = new Buffer(0),
    public onFlush: Function = () => 1,
  ) { }

  receiver(callback: Function, seqid: number) {
    var residual: any = null;

    return function (data: any) {
      // Prepend any residual data from our previous read
      if (residual) {
        data = Buffer.concat([residual, data]);
        residual = null;
      }

      // framed transport
      while (data.length) {
        if (data.length < 4) {
          // Not enough bytes to continue, save and resume on next packet
          residual = data;
          return;
        }
        var frameSize = binary.readI32(data, 0);
        if (data.length < 4 + frameSize) {
          // Not enough bytes to continue, save and resume on next packet
          residual = data;
          return;
        }

        var frame = data.slice(4, 4 + frameSize);
        residual = data.slice(4 + frameSize);

        callback(new TFramedTransport(frame), seqid);

        data = residual;
        residual = null;
      }
    };
  };

  commitPosition() { }
  rollbackPosition() { }

  // TODO: Implement open/close support
  isOpen() { return true; };
  open() { };
  close() { };

  private _seqid: number | null = null
  // Set the seqid of the message in the client
  // So that callbacks can be found
  setCurrSeqId(seqid: number) {
    this._seqid = seqid;
  };

  ensureAvailable(len: number) {
    if (this.readPos + len > this.inBuf.length) {
      throw new InputBufferUnderrunError();
    }
  };

  read(len: number) { // this function will be used for each frames.
    this.ensureAvailable(len);
    var end = this.readPos + len;

    if (this.inBuf.length < end) {
      throw new Error('read(' + len + ') failed - not enough data');
    }

    var buf = this.inBuf.slice(this.readPos, end);
    this.readPos = end;
    return buf;
  };


  readByte() {
    this.ensureAvailable(1);
    return binary.readByte(this.inBuf[this.readPos++]);
  };

  readI16() {
    this.ensureAvailable(2);
    var i16 = binary.readI16(this.inBuf, this.readPos);
    this.readPos += 2;
    return i16;
  };

  readI32() {
    this.ensureAvailable(4);
    var i32 = binary.readI32(this.inBuf, this.readPos);
    this.readPos += 4;
    return i32;
  };

  readDouble() {
    this.ensureAvailable(8);
    var d = binary.readDouble(this.inBuf, this.readPos);
    this.readPos += 8;
    return d;
  };

  readString(len: number) {
    this.ensureAvailable(len);
    var str = this.inBuf.toString('utf8', this.readPos, this.readPos + len);
    this.readPos += len;
    return str;
  };


  borrow() {
    return {
      buf: this.inBuf,
      readIndex: this.readPos,
      writeIndex: this.inBuf.length
    };
  };

  consume(bytesConsumed: number) {
    this.readPos += bytesConsumed;
  };

  write(buf: Buffer, encoding = 'utf8') {
    if (typeof (buf) === "string") {
      buf = new Buffer(buf, encoding as any);
    }
    this.outBuffers.push(buf);
    this.outCount += buf.length;
  };

  flush() {
    // If the seqid of the callback is available pass it to the onFlush
    // Then remove the current seqid
    var seqid = this._seqid;
    this._seqid = null;

    var out = new Buffer(this.outCount),
      pos = 0;
    this.outBuffers.forEach(function (buf) {
      buf.copy(out, pos, 0);
      pos += buf.length;
    });

    if (this.onFlush) {
      // TODO: optimize this better, allocate one buffer instead of both:
      var msg = new Buffer(out.length + 4);
      binary.writeI32(msg, out.length);
      out.copy(msg, 4, 0, out.length);
      if (this.onFlush) {
        // Passing seqid through this call to get it to the connection
        this.onFlush(msg, seqid);
      }
    }

    this.outBuffers = [];
    this.outCount = 0;
  };

}

export default TFramedTransport
