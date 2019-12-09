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

import constants from 'constants';
import net from 'net';
import tls from 'tls';

import TBufferedTransport from './buffered_transport';
import TBinaryProtocol from './binary_protocol';
import InputBufferUnderrunError from './input_buffer_underrun_error';
import { TTransportConstructor } from './transport';
import { TProtocolConstructor } from './protocol';
import { HttpHeaders } from './thrift';

export interface ServiceOptions<TProcessor, THandler> {
  transport?: TTransportConstructor;
  protocol?: TProtocolConstructor;
  tls?: any
  processor?: { new(handler: THandler): TProcessor };
  handler?: THandler;
}

export interface ServiceMap<TProcessor, THandler> {
  [uri: string]: ServerOptions<TProcessor, THandler>;
}

export interface ServerOptions<TProcessor, THandler> extends ServiceOptions<TProcessor, THandler> {
  cors?: string[];
  files?: string;
  headers?: HttpHeaders;
  services?: ServiceMap<TProcessor, THandler>;
  tls?: tls.TlsOptions;
}

/**
 * Create a Thrift server which can serve one or multiple services.
 * @param processor - A normal or multiplexedProcessor (must be preconstructed with the desired handler).
 * @param options - Optional additional server configuration.
 * @returns - The Apache Thrift Multiplex Server.
 */
export function createMultiplexServer(processor: any, options: ServerOptions<any, any>): any {
  var transport = (options && options.transport) ? options.transport : TBufferedTransport;
  var protocol = (options && options.protocol) ? options.protocol : TBinaryProtocol;

  function serverImpl(this: any, stream: any) {
    var self = this;
    stream.on('error', function (err: any) {
      self.emit('error', err);
    });
    stream.on('data', transport.receiver(function (transportWithData: any) {
      var input = new protocol(transportWithData);
      var output = new protocol(new transport(undefined, function (buf: any) {
        try {
          stream.write(buf);
        } catch (err) {
          self.emit('error', err);
          stream.end();
        }
      }));

      try {
        do {
          processor.process(input, output);
          transportWithData.commitPosition();
        } while (true);
      } catch (err) {
        if (err instanceof InputBufferUnderrunError) {
          //The last data in the buffer was not a complete message, wait for the rest
          transportWithData.rollbackPosition();
        }
        else if (err.message === "Invalid type: undefined") {
          //No more data in the buffer
          //This trap is a bit hackish
          //The next step to improve the node behavior here is to have
          //  the compiler generated process method throw a more explicit
          //  error when the network buffer is empty (regardles of the
          //  protocol/transport stack in use) and replace this heuristic.
          //  Also transports should probably not force upper layers to
          //  manage their buffer positions (i.e. rollbackPosition() and
          //  commitPosition() should be eliminated in lieu of a transport
          //  encapsulated buffer management strategy.)
          transportWithData.rollbackPosition();
        }
        else {
          //Unexpected error
          self.emit('error', err);
          stream.end();
        }
      }
    }));

    stream.on('end', function () {
      stream.end();
    });
  }

  if (options && options.tls) {
    if (!('secureProtocol' in options.tls) && !('secureOptions' in options.tls)) {
      options.tls.secureProtocol = "SSLv23_method";
      options.tls.secureOptions = constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3;
    }
    return tls.createServer(options.tls, serverImpl);
  } else {
    return net.createServer(serverImpl);
  }
};

export type TProcessorConstructor<TProcessor, THandler> =
  { new(handler: THandler): TProcessor } |
  { Processor: { new(handler: THandler): TProcessor } };

import http from 'http'

/**
 * Create a single service Apache Thrift server.
 * @param {object} processor - A service class or processor function.
 * @param {ServerOptions} options - Optional additional server configuration.
 * @returns {object} - The Apache Thrift Multiplex Server.
 */
export function createServer<TProcessor, THandler>(
  processor: TProcessorConstructor<TProcessor, THandler>,
  handler: THandler,
  options?: ServerOptions<TProcessor, THandler>,
): http.Server | tls.Server {
  if (processor.Processor) {
    processor = processor.Processor;
  }
  return createMultiplexServer(new processor(handler), options);
};
