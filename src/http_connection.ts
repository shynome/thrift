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
var util = require('util');
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import *as thrift from './thrift';

import TBufferedTransport from './buffered_transport';
import TBinaryProtocol from './binary_protocol';
import InputBufferUnderrunError from './input_buffer_underrun_error';
import { ConnectOptions as BaseConnectOptions } from "./connection";

import createClient from './create_client';
import { TTransport, TTransportConstructor } from './transport';
import { TProtocol, TProtocolConstructor } from './protocol';

/**
 * @example
 *     //Use a connection that requires ssl/tls, closes the connection after each request,
 *     //  uses the buffered transport layer, uses the JSON protocol and directs RPC traffic
 *     //  to https://thrift.example.com:9090/hello
 *     var thrift = require('thrift');
 *     var options = {
 *        transport: thrift.TBufferedTransport,
 *        protocol: thrift.TJSONProtocol,
 *        path: "/hello",
 *        headers: {"Connection": "close"},
 *        https: true
 *     };
 *     var con = thrift.createHttpConnection("thrift.example.com", 9090, options);
 *     var client = thrift.createHttpClient(myService, connection);
 *     client.myServiceFunction();
 */
export interface ConnectOptions extends BaseConnectOptions {
  host?: string
  port?: number
  socketPath?: string
  responseType?: string | null
}

/**
 * Initializes a Thrift HttpConnection instance (use createHttpConnection() rather than
 *    instantiating directly).
 * @throws {error} Exceptions other than InputBufferUnderrunError are rethrown
 * @event {error} The "error" event is fired when a Node.js error event occurs during
 *     request or response processing, in which case the node error is passed on. An "error"
 *     event may also be fired when the connection can not map a response back to the
 *     appropriate client (an internal error), generating a TApplicationException.
 * @classdesc HttpConnection objects provide Thrift end point transport
 *     semantics implemented over the Node.js http.request() method.
 * @see {@link createHttpConnection}
 */
export class HttpConnection extends EventEmitter {
  options: ConnectOptions;
  host: string;
  port: number;
  https: boolean;
  transport: TTransportConstructor;
  protocol: TProtocolConstructor;

  socketPath: ConnectOptions['socketPath']
  nodeOptions: ConnectOptions['nodeOptions']
  client: any = {}
  /**
   * The sequence map is used to map seqIDs back to the
   * calling client in multiplexed scenarios
   */
  seqId2Service: { [k: string]: any } = {}
  /**
   * @param {ConnectOptions} options - The configuration options to use.
   */
  constructor(
    options: ConnectOptions = {}
  ) {
    super()
    this.options = options
    this.host = this.options.host;
    this.port = this.options.port;
    this.socketPath = this.options.socketPath;
    this.https = this.options.https || false;
    this.transport = this.options.transport || TBufferedTransport;
    this.protocol = this.options.protocol || TBinaryProtocol;

    //Prepare Node.js options
    this.nodeOptions = {
      host: this.host,
      port: this.port,
      socketPath: this.socketPath,
      path: this.options.path || '/',
      method: 'POST',
      headers: this.options.headers || {},
      // @ts-ignore
      responseType: this.options.responseType || null
    };
    for (var attrname in this.options.nodeOptions) {
      // @ts-ignore
      this.nodeOptions[attrname] = this.options.nodeOptions[attrname];
    }
    /*jshint -W069 */
    if (!this.nodeOptions.headers['Connection']) {
      this.nodeOptions.headers['Connection'] = 'keep-alive';
    }
    /*jshint +W069 */

  }

  private decodeCallback(transport_with_data: any) {
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
            process.nextTick(function () {
              clientCallback(err, success);
            });
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
    }
    catch (e) {
      if (e instanceof InputBufferUnderrunError) {
        transport_with_data.rollbackPosition();
      } else {
        this.emit('error', e);
      }
    }
  }

  //Response handler
  //////////////////////////////////////////////////
  responseCallback(response: http.IncomingMessage) {
    var data: any[] = [];
    var dataLen = 0;

    if (response.statusCode !== 200) {
      this.emit("error", new THTTPException(response));
    }

    response.on('error', (e) => {
      this.emit("error", e);
    });

    // When running directly under node, chunk will be a buffer,
    // however, when running in a Browser (e.g. Browserify), chunk
    // will be a string or an ArrayBuffer.
    response.on('data', function (chunk) {
      if ((typeof chunk == 'string') ||
        (Object.prototype.toString.call(chunk) == '[object Uint8Array]')) {
        // Wrap ArrayBuffer/string in a Buffer so data[i].copy will work
        data.push(new Buffer(chunk));
      } else {
        data.push(chunk);
      }
      dataLen += chunk.length;
    });

    response.on('end', () => {
      var buf = new Buffer(dataLen);
      for (var i = 0, len = data.length, pos = 0; i < len; i++) {
        data[i].copy(buf, pos);
        pos += data[i].length;
      }
      //Get the receiver function for the transport and
      //  call it with the buffer
      this.transport.receiver(this.decodeCallback)(buf);
    });
  };

  /**
   * Writes Thrift message data to the connection
   * @param {Buffer} data - A Node.js Buffer containing the data to write
   * @returns {void} No return value.
   * @event {error} the "error" event is raised upon request failure passing the
   *     Node.js error object to the listener.
   */
  write(data: Buffer): void {
    var self = this;
    var opts = self.nodeOptions;
    opts.headers["Content-length"] = data.length;
    if (!opts.headers["Content-Type"])
      opts.headers["Content-Type"] = "application/x-thrift";
    var req = (self.https) ?
      https.request(opts, self.responseCallback) :
      http.request(opts, self.responseCallback);
    req.on('error', function (err) {
      self.emit("error", err);
    });
    req.write(data);
    req.end();
  };

}

/**
 * Creates a new HttpConnection object, used by Thrift clients to connect
 *    to Thrift HTTP based servers.
 * @param host - The host name or IP to connect to.
 * @param port - The TCP port to connect to.
 * @param options - The configuration options to use.
 * @returns  The connection object.
 */
export function createHttpConnection(host: string, port: number, options: ConnectOptions) {
  options.host = host;
  options.port = port || 80;
  return new HttpConnection(options);
};

export function createHttpUDSConnection(path: string, options: ConnectOptions) {
  options.socketPath = path;
  return new HttpConnection(options);
};

exports.createHttpClient = createClient

class THTTPException extends thrift.TApplicationException {
  response: http.IncomingMessage
  statusCode: number
  constructor(response: http.IncomingMessage) {
    super()
    this.name = this.constructor.name;
    this.statusCode = response.statusCode as number;
    this.response = response;
    this.type = thrift.TApplicationExceptionType.PROTOCOL_ERROR;
    this.message = "Received a response with a bad HTTP status code: " + response.statusCode;
  }
}
