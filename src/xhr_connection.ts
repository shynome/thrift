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
import { EventEmitter } from "events";
import *as thrift from './thrift';

import TBufferedTransport from './buffered_transport';
import TJSONProtocol from './json_protocol';
import InputBufferUnderrunError from './input_buffer_underrun_error';

import createClient from './create_client';
import { SeqId2Service, ConnectOptions as BaseConnectOptions, TClientConstructor, Connection } from "./connection";
import { TProtocol, TProtocolConstructor } from "./protocol";
import { TTransport, TTransportConstructor } from "./transport";

export interface XHRConnectionOptions extends BaseConnectOptions {
  url?: string
  useCORS?: boolean
}

export class XHRConnection extends EventEmitter {
  //The sequence map is used to map seqIDs back to the
  //  calling client in multiplexed scenarios
  seqId2Service: SeqId2Service = {};
  options: XHRConnectionOptions;
  wpos: number;
  rpos: number;
  useCORS: boolean = false;
  send_buf: string;
  recv_buf: string;
  transport: TTransportConstructor = TBufferedTransport;
  protocol: TProtocolConstructor = TJSONProtocol;
  headers: thrift.HttpHeaders;

  url: string
  client: any
  /**
   * Constructor Function for the XHR Connection.
   * If you do not specify a host and port then XHRConnection will default to the
   * host and port of the page from which this javascript is served.
   * @classdesc TXHRConnection objects provide Thrift end point transport
   *     semantics implemented using XHR.
   * @example
   *     var transport = new Thrift.TXHRConnection('localhost', 9099, {});
   */
  constructor(options: Partial<XHRConnectionOptions>) {
    super()

    this.options = options || {};
    this.wpos = 0;
    this.rpos = 0;
    this.useCORS = (options && !!options.useCORS);
    this.send_buf = '';
    this.recv_buf = '';
    this.transport = options.transport || TBufferedTransport;
    this.protocol = options.protocol || TJSONProtocol;
    this.headers = options.headers || {};

    var prefix = options.https ? 'https://' : 'http://';
    var path = options.path || '/';
    this.url = prefix + options.url + path;
  }

  /**
    * Gets the browser specific XmlHttpRequest Object.
    * @returns the browser XHR interface object
    */
  getXmlHttpRequestObject(): XMLHttpRequest {
    try { return new XMLHttpRequest(); } catch (e1) { }
    try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch (e2) { }
    try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch (e3) { }

    throw "Your browser doesn't support XHR.";
  };


  /**
   * Sends the current XRH request if the transport was created with a URL
   * and the async parameter is false. If the transport was not created with
   * a URL, or the async parameter is True and no callback is provided, or
   * the URL is an empty string, the current send buffer is returned.
   * @param {object} async - If true the current send buffer is returned.
   * @param {object} callback - Optional async completion callback
   */
  flush(): void {
    var self = this;
    if (this.url === undefined || this.url === '') {
      this.send_buf;
      return
    }

    var xreq = this.getXmlHttpRequestObject();

    if (xreq.overrideMimeType) {
      xreq.overrideMimeType('application/json');
    }

    xreq.onreadystatechange = function () {
      if (this.readyState == 4 && this.status == 200) {
        self.setRecvBuffer(this.responseText);
      }
    };

    xreq.open('POST', this.url, true);

    Object.keys(this.headers).forEach(function (headerKey) {
      //@ts-ignore 
      xreq.setRequestHeader(headerKey, self.headers[headerKey]);
    });

    xreq.send(this.send_buf);
  };

  recv_buf_sz: number = 0
  /**
   * Sets the buffer to provide the protocol when deserializing.
   * @param buf - The buffer to supply the protocol.
   */
  setRecvBuffer(buf: string): void {
    this.recv_buf = buf;
    this.recv_buf_sz = this.recv_buf.length;
    this.wpos = this.recv_buf.length;
    this.rpos = 0;

    var data: any
    if (Object.prototype.toString.call(buf) == "[object ArrayBuffer]") {
      data = new Uint8Array(buf as any);
    }
    var thing = new Buffer(data || buf);

    this.transport.receiver(this.__decodeCallback.bind(this))(thing);

  };

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

  /**
   * Returns true if the transport is open, XHR always returns true.
   * @readonly
   * @returns Always True.
   */
  isOpen(): boolean { return true; };

  /**
   * Opens the transport connection, with XHR this is a nop.
   */
  open(): void { };
  /**
   * Closes the transport connection, with XHR this is a nop.
   */
  close(): void { };

  read_buf: any
  /**
   * Returns the specified number of characters from the response
   * buffer.
   * @param {number} len - The number of characters to return.
   * @returns {string} Characters sent by the server.
   */
  read(len: number): string {
    var avail = this.wpos - this.rpos;

    if (avail === 0) {
      return '';
    }

    var give = len;

    if (avail < len) {
      give = avail;
    }

    var ret = this.read_buf.substr(this.rpos, give);
    this.rpos += give;

    //clear buf when complete?
    return ret;
  };

  /**
   * Returns the entire response buffer.
   * @returns Characters sent by the server.
   */
  readAll(): string { return this.recv_buf; };

  /**
   * Sets the send buffer to buf.
   * @param {string} buf - The buffer to send.
   */
  write(buf: string): void {
    this.send_buf = buf;
    this.flush();
  };

  /**
   * Returns the send buffer.
   * @readonly
   * @returns The send buffer.
   */
  getSendBuffer(): string { return this.send_buf; };

}


/**
 * Creates a new TXHRTransport object, used by Thrift clients to connect
 *    to Thrift HTTP based servers.
 */
export const createXHRConnection = function (options: XHRConnectionOptions): XHRConnection {
  return new XHRConnection(options);
};

export const createXHRClient: <TClient>(client: TClientConstructor<TClient>, connection: XHRConnection) => TClient = createClient as any;
