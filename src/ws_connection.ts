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
import WebSocket from 'ws';
import { EventEmitter } from "events";
import *as thrift from './thrift';

import TBufferedTransport from './buffered_transport';
import TJSONProtocol from './json_protocol';
import InputBufferUnderrunError from './input_buffer_underrun_error';
import { ConnectOptions as BaseConnectOptions, SeqId2Service, TClientConstructor } from "./connection";

import createClient from './create_client';
import { TTransportConstructor } from './transport';
import { TProtocolConstructor } from './protocol';

export interface WSOptions {
  host: string;
  port: number;
  path: string;
  headers: thrift.HttpHeaders;
}

/**
 * @example
 *     //Use a secured websocket connection
 *     //  uses the buffered transport layer, uses the JSON protocol and directs RPC traffic
 *     //  to wss://thrift.example.com:9090/hello
 *     var thrift = require('thrift');
 *     var options = {
 *        transport: thrift.TBufferedTransport,
 *        protocol: thrift.TJSONProtocol,
 *        path: "/hello",
 *        secure: true
 *     };
 *     var con = thrift.createWSConnection("thrift.example.com", 9090, options);
 *     con.open()
 *     var client = thrift.createWSClient(myService, connection);
 *     client.myServiceFunction();
 *     con.close()
 */
export interface WSConnectOptions extends BaseConnectOptions {
  /** True causes the connection to use wss, otherwise ws is used. */
  secure?: boolean
  /** Options passed on to WebSocket. */
  wsOptions?: WSOptions
}


/**
 * Initializes a Thrift WSConnection instance (use createWSConnection() rather than
 *    instantiating directly).
 * @constructor

 * @throws {error} Exceptions other than ttransport.InputBufferUnderrunError are rethrown
 * @event {error} The "error" event is fired when a Node.js error event occurs during
 *     request or response processing, in which case the node error is passed on. An "error"
 *     event may also be fired when the connectison can not map a response back to the
 *     appropriate client (an internal error), generating a TApplicationException.
 * @classdesc WSConnection objects provide Thrift end point transport
 *     semantics implemented using Websockets.
 * @see {@link createWSConnection}
 */
export class WSConnection extends EventEmitter {

  seqId2Service: SeqId2Service = {};
  options: WSConnectOptions;
  host: string;
  port: number;
  secure: boolean;
  transport: TTransportConstructor;
  protocol: TProtocolConstructor;
  path: string;
  send_pending: Buffer[] = [];
  wsOptions: WSOptions;

  /**
   * @param host - The host name or IP to connect to.
   * @param port - The TCP port to connect to.
   * @param options - The configuration options to use.
   */
  constructor(host: string, port: number, options: WSConnectOptions) {
    super()
    //Initialize the emitter base object
    EventEmitter.call(this);

    //Set configuration
    var self = this;
    this.options = options || {};
    this.host = host;
    this.port = port;
    this.secure = this.options.secure || false;
    this.transport = this.options.transport || TBufferedTransport;
    this.protocol = this.options.protocol || TJSONProtocol;
    this.path = this.options.path;


    //Prepare WebSocket options
    this.wsOptions = {
      host: this.host,
      port: this.port || 80,
      path: this.options.path || '/',
      headers: this.options.headers || {}
    };
    for (var attrname in this.options.wsOptions) {
      // @ts-ignore
      this.wsOptions[attrname] = this.options.wsOptions[attrname];
    }
  };

  socket: any = null
  private __reset() {
    this.socket = null; //The web socket
    this.send_pending = []; //Buffers/Callback pairs waiting to be sent
  };
  private __onOpen() {
    var self = this;
    this.emit("open");
    if (this.send_pending.length > 0) {
      //If the user made calls before the connection was fully
      //open, send them now
      this.send_pending.forEach(function (data) {
        self.socket.send(data);
      });
      this.send_pending = [];
    }
  };
  private __onClose(evt: any) {
    this.emit("close");
    this.__reset();
  };
  client: any
  private __decodeCallback(transport_with_data: any) {
    var proto = new this.protocol(transport_with_data);
    try {
      while (true) {
        var header = proto.readMessageBegin();
        var dummy_seqid = header.rseqid * -1;
        var client = this.client;
        //The Multiplexed Protocol stores a hash of seqid to service names
        //  in seqId2Service. If the SeqId is found in the hash we need to
        //  lookup the appropriate client for this call.
        //  The client var is a single client object when not multiplexing,
        //  when using multiplexing it is a service name keyed hash of client
        //  objects.
        //NOTE: The 2 way interdependencies between protocols, transports,
        //  connections and clients in the Node.js implementation are irregular
        //  and make the implementation difficult to extend and maintain. We
        //  should bring this stuff inline with typical thrift I/O stack
        //  operation soon.
        //  --ra
        var service_name = this.seqId2Service[header.rseqid];
        if (service_name) {
          client = this.client[service_name];
          delete this.seqId2Service[header.rseqid];
        }
        /*jshint -W083 */
        client._reqs[dummy_seqid] = function (err: any, success: any) {
          transport_with_data.commitPosition();
          var clientCallback = client._reqs[header.rseqid];
          delete client._reqs[header.rseqid];
          if (clientCallback) {
            clientCallback(err, success);
          }
        };
        /*jshint +W083 */
        if (client['recv_' + header.fname]) {
          client['recv_' + header.fname](proto, header.mtype, dummy_seqid);
        } else {
          delete client._reqs[dummy_seqid];
          this.emit("error",
            new thrift.TApplicationException(
              thrift.TApplicationExceptionType.WRONG_METHOD_NAME,
              "Received a response to an unknown RPC function"));
        }
      }
    } catch (e) {
      if (e instanceof InputBufferUnderrunError) {
        transport_with_data.rollbackPosition();
      } else {
        throw e;
      }
    }
  };

  private __onData(data: any) {
    if (Object.prototype.toString.call(data) == "[object ArrayBuffer]") {
      data = new Uint8Array(data);
    }
    var buf = new Buffer(data);
    this.transport.receiver(this.__decodeCallback.bind(this))(buf);

  };

  private __onMessage(evt: any) {
    this.__onData(evt.data);
  };

  private __onError(evt: any) {
    this.emit("error", evt);
    this.socket.close();
  };

  /**
   * Returns true if the transport is open
   */
  isOpen(): boolean {
    return this.socket && this.socket.readyState == this.socket.OPEN;
  };

  /**
   * Opens the transport connection
   */
  open(): void {
    //If OPEN/CONNECTING/CLOSING ignore additional opens
    if (this.socket && this.socket.readyState != this.socket.CLOSED) {
      return;
    }
    //If there is no socket or the socket is closed:
    this.socket = new WebSocket(this.uri(), "", this.wsOptions as any);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = this.__onOpen.bind(this);
    this.socket.onmessage = this.__onMessage.bind(this);
    this.socket.onerror = this.__onError.bind(this);
    this.socket.onclose = this.__onClose.bind(this);
  };

  /**
   * Closes the transport connection
   */
  close(): void {
    this.socket.close();
  };

  /**
   * Return URI for the connection
   * @returns URI
   */
  uri(): string {
    var schema = this.secure ? 'wss' : 'ws';
    var port = '';
    var path = this.path || '/';
    var host = this.host;

    // avoid port if default for schema
    if (this.port && (('wss' == schema && this.port != 443) ||
      ('ws' == schema && this.port != 80))) {
      port = ':' + this.port;
    }

    return schema + '://' + host + port + path;
  };


  /**
   * Writes Thrift message data to the connection
   * @param data - A Node.js Buffer containing the data to write
   */
  write(data: Buffer): void {
    if (this.isOpen()) {
      //Send data and register a callback to invoke the client callback
      this.socket.send(data);
    } else {
      //Queue the send to go out __onOpen
      this.send_pending.push(data);
    }
  };

}

/**
 * Creates a new WSConnection object, used by Thrift clients to connect
 *    to Thrift HTTP based servers.
 * @param host - The host name or IP to connect to.
 * @param port - The TCP port to connect to.
 * @param options - The configuration options to use.
 * @returns The connection object.
 * @see {@link WSConnectOptions}
 */
export function createWSConnection(host: string | undefined, port: number, options?: WSConnectOptions): WSConnection {
  return new WSConnection(host, port, options);
};

export const createWSClient: <TClient>(client: TClientConstructor<TClient>, connection: WSConnection) => TClient = createClient as any
