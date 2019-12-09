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
import { EventEmitter } from 'events';
import constants from 'constants';
import net from 'net';
import tls from 'tls';
import *as thrift from './thrift';
import { HttpHeaders } from './thrift';
import *as log from './log';

import TBufferedTransport from './buffered_transport';
import TBinaryProtocol from './binary_protocol';
import InputBufferUnderrunError from './input_buffer_underrun_error';

import createClient from './create_client';
import { TTransportConstructor, TTransport } from "./transport";
import { TProtocolConstructor, TProtocol } from "./protocol";
import http from "http";
import https from "https";

import *as binary from './binary';

export interface SeqId2Service {
  [seqid: number]: string;
}

export interface ConnectOptions {
  transport?: TTransportConstructor;
  protocol?: TProtocolConstructor;
  path?: string;
  headers?: HttpHeaders;
  https?: boolean;
  debug?: boolean;
  max_attempts?: number;
  retry_max_delay?: number;
  connect_timeout?: number;
  timeout?: number;
  nodeOptions?: http.RequestOptions | https.RequestOptions;
}

export type TClientConstructor<TClient> =
  { new(output: TTransport, pClass: { new(trans: TTransport): TProtocol }): TClient; } |
  { Client: { new(output: TTransport, pClass: { new(trans: TTransport): TProtocol }): TClient; } };

export class Connection extends EventEmitter {
  seqId2Service: SeqId2Service = {};
  connection: net.Socket;
  ssl: boolean;
  options: ConnectOptions;
  transport: TTransportConstructor;
  protocol: TProtocolConstructor;
  offline_queue: Buffer[] = [];
  connected: boolean = false;

  host?: string
  port?: number
  path?: string
  _debug: boolean
  max_attempts: number | undefined
  retry_max_delay: number | null = null
  connect_timeout: number | boolean = false
  client: any
  constructor(stream: net.Socket, options: ConnectOptions = {}) {
    super()
    var self = this;

    this.connection = stream;
    this.ssl = !!(stream as any).encrypted;
    this.options = options;
    // @ts-ignore
    this.transport = this.options.transport || TBufferedTransport;
    // @ts-ignore
    this.protocol = this.options.protocol || TBinaryProtocol;
    this.initialize_retry_vars();

    this._debug = this.options.debug || false;
    if (this.options.max_attempts &&
      !isNaN(this.options.max_attempts) &&
      this.options.max_attempts > 0) {
      this.max_attempts = +this.options.max_attempts;
    }
    if (this.options.retry_max_delay !== undefined &&
      !isNaN(this.options.retry_max_delay) &&
      this.options.retry_max_delay > 0) {
      this.retry_max_delay = this.options.retry_max_delay;
    }
    this.connect_timeout = false;
    if (this.options.connect_timeout &&
      !isNaN(this.options.connect_timeout) &&
      this.options.connect_timeout > 0) {
      this.connect_timeout = +this.options.connect_timeout;
    }

    this.connection.addListener(this.ssl ? "secureConnect" : "connect", function (this: any) {
      self.connected = true;

      this.setTimeout(self.options.timeout || 0);
      this.setNoDelay();
      this.frameLeft = 0;
      this.framePos = 0;
      this.frame = null;
      self.initialize_retry_vars();

      self.offline_queue.forEach(function (data) {
        self.connection.write(data);
      });

      self.emit("connect");
    });

    this.connection.addListener("error", function (err) {
      // Only emit the error if no-one else is listening on the connection
      // or if someone is listening on us, because Node turns unhandled
      // 'error' events into exceptions.
      if (self.connection.listeners('error').length === 1 ||
        self.listeners('error').length > 0) {
        self.emit("error", err);
      }
    });

    // Add a close listener
    this.connection.addListener("close", function () {
      self.connection_gone(); // handle close event. try to reconnect
    });

    this.connection.addListener("timeout", function () {
      self.emit("timeout");
    });

    this.connection.addListener("data", self.transport.receiver(function (transport_with_data: any) {
      var message = new self.protocol(transport_with_data);
      try {
        while (true) {
          var header = message.readMessageBegin();
          var dummy_seqid = header.rseqid * -1;
          var client = self.client;
          //The Multiplexed Protocol stores a hash of seqid to service names
          //  in seqId2Service. If the SeqId is found in the hash we need to
          //  lookup the appropriate client for this call.
          //  The connection.client object is a single client object when not
          //  multiplexing, when using multiplexing it is a service name keyed
          //  hash of client objects.
          //NOTE: The 2 way interdependencies between protocols, transports,
          //  connections and clients in the Node.js implementation are irregular
          //  and make the implementation difficult to extend and maintain. We
          //  should bring this stuff inline with typical thrift I/O stack
          //  operation soon.
          //  --ra
          var service_name = self.seqId2Service[header.rseqid];
          if (service_name) {
            client = self.client[service_name];
          }
          /*jshint -W083 */
          client._reqs[dummy_seqid] = function (err: any, success: any) {
            transport_with_data.commitPosition();

            var callback = client._reqs[header.rseqid];
            delete client._reqs[header.rseqid];
            if (service_name) {
              delete self.seqId2Service[header.rseqid];
            }
            if (callback) {
              callback(err, success);
            }
          };
          /*jshint +W083 */

          if (client['recv_' + header.fname]) {
            client['recv_' + header.fname](message, header.mtype, dummy_seqid);
          } else {
            delete client._reqs[dummy_seqid];
            self.emit("error",
              new thrift.TApplicationException(thrift.TApplicationExceptionType.WRONG_METHOD_NAME,
                "Received a response to an unknown RPC function"));
          }
        }
      }
      catch (e) {
        if (e instanceof InputBufferUnderrunError) {
          transport_with_data.rollbackPosition();
        }
        else {
          self.emit('error', e);
        }
      }
    }));
  }
  end() {
    this.connection.end();
  };
  destroy() {
    this.connection.destroy();
  };
  private retry_timer: NodeJS.Timeout | null = null
  private retry_totaltime = 0;
  private retry_delay = 150;
  private retry_backoff = 1.7;
  private attempts = 0;
  initialize_retry_vars() {
    this.retry_timer = null;
    this.retry_totaltime = 0;
    this.retry_delay = 150;
    this.retry_backoff = 1.7;
    this.attempts = 0;
  };
  write(data: Buffer) {
    if (!this.connected) {
      this.offline_queue.push(data);
      return;
    }
    this.connection.write(data);
  };

  connection_gone() {
    var self = this;
    this.connected = false;

    // If a retry is already in progress, just let that happen
    if (this.retry_timer) {
      return;
    }
    // We cannot reconnect a secure socket.
    if (!this.max_attempts || this.ssl) {
      self.emit("close");
      return;
    }

    if (this.retry_max_delay !== null && this.retry_delay >= this.retry_max_delay) {
      this.retry_delay = this.retry_max_delay;
    } else {
      this.retry_delay = Math.floor(this.retry_delay * this.retry_backoff);
    }

    log.debug("Retry connection in " + this.retry_delay + " ms");

    if (this.max_attempts && this.attempts >= this.max_attempts) {
      this.retry_timer = null;
      console.error("thrift: Couldn't get thrift connection after " + this.max_attempts + " attempts.");
      self.emit("close");
      return;
    }

    this.attempts += 1;
    this.emit("reconnecting", {
      delay: self.retry_delay,
      attempt: self.attempts
    });

    this.retry_timer = setTimeout(function () {
      log.debug("Retrying connection...");

      self.retry_totaltime += self.retry_delay;

      if (self.connect_timeout && self.retry_totaltime >= self.connect_timeout) {
        self.retry_timer = null;
        console.error("thrift: Couldn't get thrift connection after " + self.retry_totaltime + "ms.");
        self.emit("close");
        return;
      }

      if (self.path !== undefined) {
        self.connection.connect(self.path);
      } else {
        self.connection.connect(self.port as any, self.host as any);
      }
      self.retry_timer = null;
    }, this.retry_delay);
  };

}

export function createConnection(host: string | undefined, port: number, options?: ConnectOptions): Connection {
  var stream = net.createConnection(port, host);
  var connection = new Connection(stream, options);
  connection.host = host;
  connection.port = port;

  return connection;
};

export function createUDSConnection(path: string, options: ConnectOptions) {
  var stream = net.createConnection(path);
  var connection = new Connection(stream, options);
  connection.path = path;

  return connection;
};

export function createSSLConnection(host: string | undefined, port: number, options?: ConnectOptions): Connection {
  if (!('secureProtocol' in options) && !('secureOptions' in options)) {
    // @ts-ignore
    options.secureProtocol = "SSLv23_method";
    // @ts-ignore
    options.secureOptions = constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3;
  }

  var stream = tls.connect(port, host, options);
  var connection = new Connection(stream, options);
  connection.host = host;
  connection.port = port;

  return connection;
};


export {
  createClient
};

import child_process from 'child_process';
import internal from "stream";
interface StdIOConnectionOptions {
  transport?: TTransportConstructor
  protocol?: TProtocolConstructor

}
export class StdIOConnection extends EventEmitter {
  child: child_process.ChildProcessWithoutNullStreams
  connection: internal.Writable
  options: StdIOConnectionOptions
  transport: TTransportConstructor
  protocol: TProtocolConstructor
  offline_queue: Buffer[] = [];
  frameLeft = 0;
  framePos = 0;
  frame: any = null;
  connected = false
  client: any
  constructor(command: string, options: StdIOConnectionOptions) {
    super()
    var command_parts = command.split(' ');
    command = command_parts[0];
    var args = command_parts.splice(1, command_parts.length - 1);
    var child = this.child = child_process.spawn(command, args);

    var self = this;
    EventEmitter.call(this);

    this.connection = child.stdin;
    this.options = options || {};
    // @ts-ignore
    this.transport = this.options.transport || TBufferedTransport;
    // @ts-ignore
    this.protocol = this.options.protocol || TBinaryProtocol;

    if (log.getLogLevel() === 'debug') {
      this.child.stderr.on('data', function (err) {
        log.debug(err.toString(), 'CHILD ERROR');
      });

      this.child.on('exit', function (code, signal) {
        log.debug(code + ':' + signal, 'CHILD EXITED');
      });
    }

    this.connected = true;

    self.offline_queue.forEach(function (data) {
      self.connection.write(data);
    });

    this.connection.addListener("error", function (err) {
      self.emit("error", err);
    });

    // Add a close listener
    this.connection.addListener("close", function () {
      self.emit("close");
    });

    child.stdout.addListener("data", self.transport.receiver(function (transport_with_data: any) {
      var message = new self.protocol(transport_with_data);
      try {
        var header = message.readMessageBegin();
        var dummy_seqid = header.rseqid * -1;
        var client = self.client;
        client._reqs[dummy_seqid] = function (err: any, success: any) {
          transport_with_data.commitPosition();

          var callback = client._reqs[header.rseqid];
          delete client._reqs[header.rseqid];
          if (callback) {
            callback(err, success);
          }
        };
        client['recv_' + header.fname](message, header.mtype, dummy_seqid);
      }
      catch (e) {
        if (e instanceof InputBufferUnderrunError) {
          transport_with_data.rollbackPosition();
        }
        else {
          throw e;
        }
      }
    }));
  }

  end() {
    this.connection.end();
  };

  write(data: any) {
    if (!this.connected) {
      this.offline_queue.push(data);
      return;
    }
    this.connection.write(data);
  };

}

export function createStdIOConnection(command: string, options: StdIOConnectionOptions) {
  return new StdIOConnection(command, options);
};

export const createStdIOClient: <TClient>(client: TClientConstructor<TClient>, connection: Connection) => TClient = createClient as any
