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

export interface TTransport {
  commitPosition(): void;
  rollbackPosition(): void;
  isOpen(): boolean;
  open(): boolean;
  close(): boolean;
  setCurrSeqId(seqId: number): void;
  ensureAvailable(len: number): void;
  read(len: number): Buffer;
  readByte(): number;
  readI16(): number;
  readI32(): number;
  readDouble(): number;
  readString(): string;
  write(buf: Buffer | string): void;
  flush(): void;
}

export type TTransportCallback = (msg?: Buffer, seqid?: number) => void;

export interface TTransportConstructor {
  receiver(callback: (trans: TTransport, seqid: number) => void, seqid?: number): (data: Buffer) => void;
  new(buffer?: Buffer, callback?: TTransportCallback): TTransport;
}

export { TBufferedTransport } from './buffered_transport';
export { TFramedTransport } from './framed_transport';
export { InputBufferUnderrunError } from './input_buffer_underrun_error';
