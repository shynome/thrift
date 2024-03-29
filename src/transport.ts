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

export abstract class TTransport {
  public abstract commitPosition(): void;
  public abstract rollbackPosition(): void;
  public abstract isOpen(): boolean;
  public abstract open(): boolean;
  public abstract close(): boolean;
  public abstract setCurrSeqId(seqId: number): void;
  public abstract ensureAvailable(len: number): void;
  public abstract read(len: number): Buffer;
  public abstract readByte(): number;
  public abstract readI16(): number;
  public abstract readI32(): number;
  public abstract readDouble(): number;
  public abstract readString(): string;
  public abstract write(buf: Buffer | string): void;
  public abstract flush(): void;
  public abstract borrow(): TransBuf
  public abstract consume(bytesConsumed: number): void
}

export interface TransBuf {
  buf: Buffer
  readIndex: number
  writeIndex: number
}

export type TTransportCallback = (msg?: Buffer, seqid?: number) => void;

export interface TTransportConstructor {
  receiver(callback: (trans: TTransport, seqid: number) => void, seqid?: number): (data: Buffer) => void;
  new(buffer?: Buffer, callback?: TTransportCallback): TTransport;
}

export { TBufferedTransport } from './buffered_transport';
export { TFramedTransport } from './framed_transport';
export { InputBufferUnderrunError } from './input_buffer_underrun_error';
